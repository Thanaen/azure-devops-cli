import { afterEach, describe, expect, test } from "bun:test";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

async function loadJson(relativePath: string): Promise<Record<string, unknown>> {
  const file = Bun.file(new URL(`../${relativePath}`, import.meta.url));
  return (await file.json()) as Record<string, unknown>;
}

function encodeMessage(message: Record<string, unknown>): string {
  const payload = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`;
}

function createMcpClient(child: ChildProcessWithoutNullStreams) {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const headerText = buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthMatch = headerText.match(/content-length:\s*(\d+)/i);
      if (!contentLengthMatch) {
        throw new Error("Missing Content-Length in test client.");
      }

      const contentLength = Number(contentLengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (buffer.length < bodyEnd) break;

      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);

      const message = JSON.parse(body) as {
        id?: number;
        result?: unknown;
        error?: { message?: string };
      };

      if (message.id === undefined) continue;

      const request = pending.get(message.id);
      if (!request) continue;

      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message ?? "Unknown MCP error"));
      } else {
        request.resolve(message.result);
      }
    }
  });

  function request(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = nextId++;
    child.stdin.write(encodeMessage({ jsonrpc: "2.0", id, method, params }));

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  }

  function notify(method: string, params: Record<string, unknown> = {}): void {
    child.stdin.write(encodeMessage({ jsonrpc: "2.0", method, params }));
  }

  return { request, notify };
}

const children: ChildProcessWithoutNullStreams[] = [];

afterEach(() => {
  while (children.length > 0) {
    const child = children.pop();
    child?.kill();
  }
});

describe("Claude Code plugin packaging", () => {
  test("ships plugin and marketplace assets in npm files", async () => {
    const pkg = await loadJson("package.json");
    const files = pkg.files as string[];

    expect(files).toContain(".claude-plugin");
    expect(files).toContain(".mcp.json");
    expect(files).toContain("claude-code");
  });

  test("keeps plugin metadata aligned with package metadata", async () => {
    const pkg = await loadJson("package.json");
    const plugin = await loadJson(".claude-plugin/plugin.json");
    const marketplace = await loadJson(".claude-plugin/marketplace.json");

    expect(plugin.name).toBe("ado-cli");
    expect(plugin.version).toBe(pkg.version);
    expect(plugin.mcpServers).toBe("./.mcp.json");
    expect(marketplace.name).toBe("thanaen-ado-cli");

    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject({
      name: "ado-cli",
      source: "./",
      version: pkg.version,
    });
  });
});

describe("Claude Code MCP server", () => {
  function startServer() {
    const serverPath = new URL("../claude-code/ado-mcp.mjs", import.meta.url);
    const fakeCliPath = new URL("./fixtures/fake-ado-cli.mjs", import.meta.url);
    const child = spawn("node", [serverPath.pathname], {
      cwd: new URL("..", import.meta.url).pathname,
      env: {
        ...process.env,
        ADO_MCP_COMMAND: "node",
        ADO_MCP_COMMAND_ARGS: JSON.stringify([fakeCliPath.pathname]),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    children.push(child);
    return createMcpClient(child);
  }

  test("lists bundled ADO tools", async () => {
    const client = startServer();

    const initialize = (await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      clientInfo: { name: "bun-test", version: "1.0.0" },
    })) as Record<string, unknown>;

    expect(initialize.protocolVersion).toBe("2025-06-18");
    client.notify("notifications/initialized");

    const result = (await client.request("tools/list")) as {
      tools: Array<Record<string, unknown>>;
    };

    const toolNames = result.tools.map((tool) => tool.name);
    expect(toolNames).toContain("ado_config_show");
    expect(toolNames).toContain("ado_workitem_get");
    expect(toolNames).toContain("ado_pull_request_create");
  });

  test("executes tools through the wrapped CLI and returns structured content", async () => {
    const client = startServer();

    await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      clientInfo: { name: "bun-test", version: "1.0.0" },
    });
    client.notify("notifications/initialized");

    const repos = (await client.request("tools/call", {
      name: "ado_repos_list",
      arguments: {},
    })) as {
      content: Array<{ type: string; text: string }>;
      structuredContent: { data: Array<{ id: string; name: string }> };
    };

    expect(repos.content[0]?.text).toContain("Core API");
    expect(repos.structuredContent.data).toEqual([
      { id: "repo-1", name: "Core API" },
      { id: "repo-2", name: "Portal" },
    ]);

    const workItem = (await client.request("tools/call", {
      name: "ado_workitem_get",
      arguments: { id: 42 },
    })) as {
      structuredContent: { data: { id: number; title: string; state: string } };
    };

    expect(workItem.structuredContent.data).toMatchObject({
      id: 42,
      title: "Fake work item",
      state: "Active",
    });
  });

  test("surfaces CLI failures as tool errors", async () => {
    const client = startServer();

    await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      clientInfo: { name: "bun-test", version: "1.0.0" },
    });
    client.notify("notifications/initialized");

    const smoke = (await client.request("tools/call", {
      name: "ado_smoke",
      arguments: {},
    })) as {
      isError: boolean;
      content: Array<{ type: string; text: string }>;
      structuredContent: { exitCode: number };
    };

    expect(smoke.isError).toBe(true);
    expect(smoke.structuredContent.exitCode).toBe(7);
    expect(smoke.content[0]?.text).toContain("simulated smoke failure");
  });
});
