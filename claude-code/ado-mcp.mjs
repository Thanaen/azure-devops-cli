#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROTOCOL_VERSION = "2025-06-18";
const JSON_RPC_VERSION = "2.0";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const packageJsonPath = join(pluginRoot, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

function toPositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.trunc(numeric);
}

function toNonEmptyString(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toStringArray(values) {
  if (!Array.isArray(values)) return [];

  const deduped = values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  return [...new Set(deduped)];
}

function toPositiveIntegerArray(values) {
  if (!Array.isArray(values)) return [];

  const parsed = values
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => Math.trunc(value));

  return [...new Set(parsed)];
}

function tryParseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

function parseTabSeparatedLines(stdout, columns) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const values = line.split("\t");
      return Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null]));
    });
}

function parseIdList(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => Number(line.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parsePullRequests(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(
        /^#(?<id>\d+)\t\[(?<status>[^\]]+)\]\t(?<title>.*)\t\((?<createdBy>.*)\)$/,
      );
      if (!match?.groups) {
        return { raw: line };
      }

      return {
        id: Number(match.groups.id),
        status: match.groups.status,
        title: match.groups.title,
        createdBy: match.groups.createdBy,
      };
    });
}

function parseBuilds(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const match = line.match(
        /^#(?<id>\d+)\t(?<status>[^\t]+)\t(?<definition>[^\t]+)\t(?<sourceBranch>.*)$/,
      );
      if (!match?.groups) {
        return { raw: line };
      }

      return {
        id: Number(match.groups.id),
        status: match.groups.status,
        definition: match.groups.definition,
        sourceBranch: match.groups.sourceBranch,
      };
    });
}

function parseCreateOrUpdateMessage(stdout) {
  const line = stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .find(Boolean);

  if (!line) return null;

  const match = line.match(/PR #(?<id>\d+)/);
  return {
    id: match?.groups?.id ? Number(match.groups.id) : null,
    message: line,
  };
}

function buildToolResponse(execution, data) {
  const content = [];
  const stdout = execution.stdout.trim();
  const stderr = execution.stderr.trim();

  if (stdout.length > 0) {
    content.push({ type: "text", text: stdout });
  }

  if (stderr.length > 0) {
    content.push({ type: "text", text: `stderr:\n${stderr}` });
  }

  if (content.length === 0) {
    content.push({ type: "text", text: "Command completed with no output." });
  }

  return {
    content,
    structuredContent: {
      command: execution.command,
      args: execution.args,
      runtime: execution.runtime,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      data,
    },
  };
}

function buildToolErrorResponse(execution, message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    structuredContent: execution
      ? {
          command: execution.command,
          args: execution.args,
          runtime: execution.runtime,
          exitCode: execution.exitCode,
          stdout: execution.stdout,
          stderr: execution.stderr,
        }
      : undefined,
  };
}

function parseCommandArgsJson(value) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error("ADO_MCP_COMMAND_ARGS must be a JSON array when provided.");
    }

    return parsed.map((entry) => String(entry));
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

function resolveCliCandidates() {
  const candidates = [];
  const commandOverride = toNonEmptyString(process.env.ADO_MCP_COMMAND);
  const commandArgsOverride = parseCommandArgsJson(process.env.ADO_MCP_COMMAND_ARGS);

  if (commandOverride) {
    candidates.push({
      runtime: "env-override",
      command: commandOverride,
      baseArgs: commandArgsOverride,
      cwd: pluginRoot,
    });
  }

  const distCliPath = join(pluginRoot, "dist", "cli.js");
  if (existsSync(distCliPath)) {
    candidates.push({
      runtime: "plugin-dist",
      command: process.execPath,
      baseArgs: [distCliPath],
      cwd: pluginRoot,
    });
  }

  candidates.push({
    runtime: "path-ado",
    command: "ado",
    baseArgs: [],
    cwd: pluginRoot,
  });

  const sourceCliPath = join(pluginRoot, "src", "cli.ts");
  if (existsSync(sourceCliPath)) {
    candidates.push({
      runtime: "plugin-source",
      command: "bun",
      baseArgs: [sourceCliPath],
      cwd: pluginRoot,
    });
  }

  return candidates;
}

function executeCandidate(candidate, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(candidate.command, [...candidate.baseArgs, ...args], {
      cwd: candidate.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", (error) => {
      rejectPromise(error);
    });

    child.once("close", (exitCode) => {
      resolvePromise({
        command: candidate.command,
        args: [...candidate.baseArgs, ...args],
        runtime: candidate.runtime,
        exitCode: exitCode ?? 0,
        stdout,
        stderr,
      });
    });
  });
}

async function runAdo(args) {
  const candidates = resolveCliCandidates();
  const missingCommands = [];

  for (const candidate of candidates) {
    try {
      return await executeCandidate(candidate, args);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        missingCommands.push(`${candidate.command} (${candidate.runtime})`);
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Unable to start the Azure DevOps CLI. Tried: ${missingCommands.join(", ") || "no runtime candidates"}.`,
  );
}

const toolDefinitions = [
  {
    name: "ado_config_show",
    title: "Show resolved Azure DevOps configuration",
    description:
      "Return the resolved Azure DevOps CLI configuration with the PAT already censored by the CLI.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    buildArgs() {
      return ["config"];
    },
    parse: tryParseJson,
  },
  {
    name: "ado_smoke",
    title: "Run Azure DevOps smoke test",
    description:
      "Verify Azure DevOps connectivity and current configuration by fetching a recent work item and pull request.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    buildArgs() {
      return ["smoke"];
    },
    parse: null,
  },
  {
    name: "ado_repos_list",
    title: "List Azure DevOps repositories",
    description: "List repositories in the configured Azure DevOps project.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    buildArgs() {
      return ["repos"];
    },
    parse: (stdout) => parseTabSeparatedLines(stdout, ["id", "name"]),
  },
  {
    name: "ado_branches_list",
    title: "List repository branches",
    description:
      "List branches for a repository. Uses the configured repository when repo is omitted.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Optional repository name. Defaults to the configured repository.",
        },
      },
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["branches"];
      const repo = toNonEmptyString(argumentsObject.repo);
      if (repo) args.push(repo);
      return args;
    },
    parse: (stdout) =>
      stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
  },
  {
    name: "ado_workitem_get",
    title: "Get Azure DevOps work item",
    description: "Fetch a work item by id, with optional raw output and expand mode.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Work item id." },
        raw: {
          type: "boolean",
          description: "Return the full raw payload instead of the compact CLI view.",
        },
        expand: {
          type: "string",
          enum: ["all", "fields", "links", "relations"],
          description: "Optional Azure DevOps expand mode.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["workitem-get", String(toPositiveInteger(argumentsObject.id, NaN))];
      if (argumentsObject.raw === true) args.push("--raw");
      const expand = toNonEmptyString(argumentsObject.expand);
      if (expand) args.push(`--expand=${expand}`);
      return args;
    },
    parse: tryParseJson,
  },
  {
    name: "ado_workitems_recent",
    title: "List recent work items",
    description: "List recent work item ids, optionally filtered by tag, type, or state.",
    inputSchema: {
      type: "object",
      properties: {
        top: { type: "integer", minimum: 1, maximum: 50, description: "Maximum item count." },
        tag: { type: "string", description: "Optional tag filter." },
        type: { type: "string", description: "Optional work item type filter." },
        state: { type: "string", description: "Optional work item state filter." },
      },
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["workitems-recent"];
      const top = toPositiveInteger(argumentsObject.top, 0);
      if (top > 0) args.push(String(top));
      const tag = toNonEmptyString(argumentsObject.tag);
      const type = toNonEmptyString(argumentsObject.type);
      const state = toNonEmptyString(argumentsObject.state);
      if (tag) args.push(`--tag=${tag}`);
      if (type) args.push(`--type=${type}`);
      if (state) args.push(`--state=${state}`);
      return args;
    },
    parse: parseIdList,
  },
  {
    name: "ado_workitem_comments_list",
    title: "List work item comments",
    description: "Return comments for a work item.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Work item id." },
        top: { type: "integer", minimum: 1, maximum: 200, description: "Maximum comment count." },
        order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order. Defaults to desc.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["workitem-comments", String(toPositiveInteger(argumentsObject.id, NaN))];
      const top = toPositiveInteger(argumentsObject.top, 0);
      if (top > 0) args.push(`--top=${top}`);
      const order = toNonEmptyString(argumentsObject.order);
      if (order) args.push(`--order=${order}`);
      return args;
    },
    parse: tryParseJson,
  },
  {
    name: "ado_workitem_comment_add",
    title: "Add work item comment",
    description: "Add a text comment to a work item.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Work item id." },
        text: { type: "string", minLength: 1, description: "Comment body." },
      },
      required: ["id", "text"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      return [
        "workitem-comment-add",
        String(toPositiveInteger(argumentsObject.id, NaN)),
        `--text=${String(argumentsObject.text ?? "")}`,
      ];
    },
    parse: tryParseJson,
  },
  {
    name: "ado_workitem_comment_update",
    title: "Update work item comment",
    description: "Update an existing work item comment.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Work item id." },
        commentId: { type: "integer", minimum: 1, description: "Comment id." },
        text: { type: "string", minLength: 1, description: "Updated comment body." },
      },
      required: ["id", "commentId", "text"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      return [
        "workitem-comment-update",
        String(toPositiveInteger(argumentsObject.id, NaN)),
        String(toPositiveInteger(argumentsObject.commentId, NaN)),
        `--text=${String(argumentsObject.text ?? "")}`,
      ];
    },
    parse: tryParseJson,
  },
  {
    name: "ado_pull_requests_list",
    title: "List pull requests",
    description:
      "List pull requests for a repository with a given status. Defaults to active pull requests in the configured repository.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "abandoned", "completed", "all"],
          description: "Pull request status filter.",
        },
        top: { type: "integer", minimum: 1, maximum: 50, description: "Maximum PR count." },
        repo: { type: "string", description: "Optional repository name." },
      },
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const status = toNonEmptyString(argumentsObject.status) ?? "active";
      const top = String(toPositiveInteger(argumentsObject.top, 10));
      const args = ["prs", status, top];
      const repo = toNonEmptyString(argumentsObject.repo);
      if (repo) args.push(repo);
      return args;
    },
    parse: parsePullRequests,
  },
  {
    name: "ado_pull_request_get",
    title: "Get pull request",
    description: "Fetch a pull request by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Pull request id." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      return ["pr-get", String(toPositiveInteger(argumentsObject.id, NaN))];
    },
    parse: tryParseJson,
  },
  {
    name: "ado_pull_request_create",
    title: "Create pull request",
    description: "Create a pull request with optional linked work items and tags.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, description: "Pull request title." },
        source: { type: "string", minLength: 1, description: "Source branch name or ref." },
        target: { type: "string", minLength: 1, description: "Target branch name or ref." },
        description: { type: "string", description: "Optional pull request description." },
        repo: { type: "string", description: "Optional repository name." },
        workItemIds: {
          type: "array",
          items: { type: "integer", minimum: 1 },
          uniqueItems: true,
          description: "Optional linked work item ids.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          description: "Optional pull request labels.",
        },
      },
      required: ["title", "source", "target"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = [
        "pr-create",
        `--title=${String(argumentsObject.title ?? "")}`,
        `--source=${String(argumentsObject.source ?? "")}`,
        `--target=${String(argumentsObject.target ?? "")}`,
      ];

      const description = toNonEmptyString(argumentsObject.description);
      const repo = toNonEmptyString(argumentsObject.repo);
      const workItemIds = toPositiveIntegerArray(argumentsObject.workItemIds);
      const tags = toStringArray(argumentsObject.tags);

      if (description) args.push(`--description=${description}`);
      if (repo) args.push(`--repo=${repo}`);
      if (workItemIds.length > 0) args.push(`--work-items=${workItemIds.join(",")}`);
      if (tags.length > 0) args.push(`--tags=${tags.join(",")}`);
      return args;
    },
    parse: parseCreateOrUpdateMessage,
  },
  {
    name: "ado_pull_request_update",
    title: "Update pull request",
    description: "Update a pull request title, description, linked work items, or tags.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Pull request id." },
        title: { type: "string", description: "Updated title." },
        description: { type: "string", description: "Updated description." },
        repo: { type: "string", description: "Optional repository name." },
        workItemIds: {
          type: "array",
          items: { type: "integer", minimum: 1 },
          uniqueItems: true,
          description: "Optional linked work item ids to add.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          uniqueItems: true,
          description: "Optional PR tags to add.",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["pr-update", String(toPositiveInteger(argumentsObject.id, NaN))];
      const title = toNonEmptyString(argumentsObject.title);
      const description = toNonEmptyString(argumentsObject.description);
      const repo = toNonEmptyString(argumentsObject.repo);
      const workItemIds = toPositiveIntegerArray(argumentsObject.workItemIds);
      const tags = toStringArray(argumentsObject.tags);

      if (title) args.push(`--title=${title}`);
      if (description) args.push(`--description=${description}`);
      if (repo) args.push(`--repo=${repo}`);
      if (workItemIds.length > 0) args.push(`--work-items=${workItemIds.join(",")}`);
      if (tags.length > 0) args.push(`--tags=${tags.join(",")}`);
      return args;
    },
    parse: parseCreateOrUpdateMessage,
  },
  {
    name: "ado_pull_request_cherry_pick",
    title: "Cherry-pick pull request",
    description: "Cherry-pick a pull request onto another branch.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Pull request id." },
        target: { type: "string", minLength: 1, description: "Target branch or ref." },
        topic: { type: "string", description: "Optional topic branch name." },
        repo: { type: "string", description: "Optional repository name." },
      },
      required: ["id", "target"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = [
        "pr-cherry-pick",
        String(toPositiveInteger(argumentsObject.id, NaN)),
        `--target=${String(argumentsObject.target ?? "")}`,
      ];
      const topic = toNonEmptyString(argumentsObject.topic);
      const repo = toNonEmptyString(argumentsObject.repo);
      if (topic) args.push(`--topic=${topic}`);
      if (repo) args.push(`--repo=${repo}`);
      return args;
    },
    parse: null,
  },
  {
    name: "ado_pull_request_approve",
    title: "Approve pull request",
    description: "Approve a pull request as the current Azure DevOps identity.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Pull request id." },
        repo: { type: "string", description: "Optional repository name." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["pr-approve", String(toPositiveInteger(argumentsObject.id, NaN))];
      const repo = toNonEmptyString(argumentsObject.repo);
      if (repo) args.push(repo);
      return args;
    },
    parse: null,
  },
  {
    name: "ado_pull_request_autocomplete",
    title: "Enable pull request auto-complete",
    description: "Enable auto-complete for a pull request.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer", minimum: 1, description: "Pull request id." },
        repo: { type: "string", description: "Optional repository name." },
      },
      required: ["id"],
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const args = ["pr-autocomplete", String(toPositiveInteger(argumentsObject.id, NaN))];
      const repo = toNonEmptyString(argumentsObject.repo);
      if (repo) args.push(repo);
      return args;
    },
    parse: null,
  },
  {
    name: "ado_builds_list",
    title: "List Azure DevOps builds",
    description: "List recent builds in the configured Azure DevOps project.",
    inputSchema: {
      type: "object",
      properties: {
        top: { type: "integer", minimum: 1, maximum: 50, description: "Maximum build count." },
      },
      additionalProperties: false,
    },
    buildArgs(argumentsObject = {}) {
      const top = toPositiveInteger(argumentsObject.top, 10);
      return ["builds", String(top)];
    },
    parse: parseBuilds,
  },
];

const toolsByName = new Map(toolDefinitions.map((tool) => [tool.name, tool]));

class StdioJsonRpcServer {
  constructor() {
    this.buffer = Buffer.alloc(0);
  }

  start() {
    process.stdin.on("data", (chunk) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drainBuffer().catch((error) => {
        this.sendError(null, -32700, error instanceof Error ? error.message : String(error));
      });
    });

    process.stdin.on("end", () => {
      process.exit(0);
    });
  }

  async drainBuffer() {
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const headerText = this.buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        throw new Error("Missing Content-Length header.");
      }

      const contentLength = Number(contentLengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (this.buffer.length < bodyEnd) return;

      const body = this.buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.subarray(bodyEnd);

      let message;
      try {
        message = JSON.parse(body);
      } catch {
        this.sendError(null, -32700, "Invalid JSON payload.");
        continue;
      }

      await this.handleMessage(message);
    }
  }

  send(message) {
    const payload = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n`;
    process.stdout.write(header);
    process.stdout.write(payload);
  }

  sendResult(id, result) {
    this.send({ jsonrpc: JSON_RPC_VERSION, id, result });
  }

  sendError(id, code, message) {
    this.send({
      jsonrpc: JSON_RPC_VERSION,
      id,
      error: {
        code,
        message,
      },
    });
  }

  async handleMessage(message) {
    if (message.id === undefined) {
      return;
    }

    const method = message.method;

    if (method === "initialize") {
      this.sendResult(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "ado-cli-mcp",
          version: String(packageJson.version ?? "0.0.0"),
        },
      });
      return;
    }

    if (method === "ping") {
      this.sendResult(message.id, {});
      return;
    }

    if (method === "tools/list") {
      this.sendResult(message.id, {
        tools: toolDefinitions.map(({ name, title, description, inputSchema }) => ({
          name,
          title,
          description,
          inputSchema,
        })),
      });
      return;
    }

    if (method === "tools/call" || method === "tools/invoke") {
      const toolName = toNonEmptyString(message.params?.name);
      if (!toolName || !toolsByName.has(toolName)) {
        this.sendError(message.id, -32602, `Unknown tool: ${toolName ?? "(missing name)"}`);
        return;
      }

      const tool = toolsByName.get(toolName);
      const toolArgs = message.params?.arguments ?? {};

      try {
        const execution = await runAdo(tool.buildArgs(toolArgs));
        const parsed = typeof tool.parse === "function" ? tool.parse(execution.stdout) : null;

        if (execution.exitCode !== 0) {
          const stderr = execution.stderr.trim();
          const stdout = execution.stdout.trim();
          const failureMessage = [
            `Command failed with exit code ${execution.exitCode}.`,
            stderr.length > 0 ? stderr : null,
            stdout.length > 0 ? `stdout:\n${stdout}` : null,
          ]
            .filter(Boolean)
            .join("\n\n");

          this.sendResult(message.id, buildToolErrorResponse(execution, failureMessage));
          return;
        }

        this.sendResult(message.id, buildToolResponse(execution, parsed));
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        this.sendResult(message.id, buildToolErrorResponse(null, messageText));
      }
      return;
    }

    this.sendError(message.id, -32601, `Method not found: ${String(method)}`);
  }
}

new StdioJsonRpcServer().start();
