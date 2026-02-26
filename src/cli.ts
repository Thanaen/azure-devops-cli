#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { getConfig, getConfigDir, getConfigFilePath, loadFileConfig } from "./config.ts";
import { buildPullRequestArtifactUrl, parseWorkItemIds } from "./pr-workitems.ts";
import {
  buildRecentWorkItemsWiql,
  parseOptionArgs,
  parseWorkItemsRecentArgs,
} from "./workitems-query.ts";
import type { AdoConfig, FileConfig } from "./types.ts";
import { PullRequestStatus } from "azure-devops-node-api/interfaces/GitInterfaces";
import type {
  GitPullRequest,
  GitPullRequestSearchCriteria,
} from "azure-devops-node-api/interfaces/GitInterfaces";
import {
  WorkItemExpand,
  CommentSortOrder,
} from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import type { WorkItem } from "azure-devops-node-api/interfaces/WorkItemTrackingInterfaces";
import { BuildQueryOrder } from "azure-devops-node-api/interfaces/BuildInterfaces";
import { Operation } from "azure-devops-node-api/interfaces/common/VSSInterfaces";
import type { JsonPatchOperation } from "azure-devops-node-api/interfaces/common/VSSInterfaces";

function pickRepo(config: AdoConfig, value?: string): string {
  return value || config.repo;
}

function mapPrStatus(s: string): PullRequestStatus {
  switch (s.toLowerCase()) {
    case "active":
      return PullRequestStatus.Active;
    case "abandoned":
      return PullRequestStatus.Abandoned;
    case "completed":
      return PullRequestStatus.Completed;
    case "all":
      return PullRequestStatus.All;
    default:
      return PullRequestStatus.Active;
  }
}

function prStatusName(status: number | undefined): string {
  return PullRequestStatus[status ?? 0] ?? "unknown";
}

const expandMap: Record<string, WorkItemExpand> = {
  none: WorkItemExpand.None,
  relations: WorkItemExpand.Relations,
  fields: WorkItemExpand.Fields,
  links: WorkItemExpand.Links,
  all: WorkItemExpand.All,
};

async function cmdSmoke(config: AdoConfig): Promise<void> {
  const witApi = await config.connection.getWorkItemTrackingApi();
  const gitApi = await config.connection.getGitApi();
  const repo = pickRepo(config);

  const wiqlResult = await witApi.queryByWiql(
    { query: "SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC" },
    { project: config.project },
    undefined,
    1,
  );

  let workItem: WorkItem | undefined;
  const firstId = wiqlResult.workItems?.[0]?.id;
  if (firstId) {
    workItem = await witApi.getWorkItem(firstId, undefined, undefined, undefined, config.project);
  }

  const prs = await gitApi.getPullRequests(
    repo,
    { status: PullRequestStatus.All } as GitPullRequestSearchCriteria,
    config.project,
    undefined,
    undefined,
    1,
  );
  const pullRequest = prs[0];

  console.log("Azure DevOps connectivity check");
  console.log("--------------------------------");
  if (workItem) {
    console.log(
      `Work item: #${workItem.id} - ${(workItem.fields?.["System.Title"] as string) ?? "(no title)"}`,
    );
  } else {
    console.log("Work item: none found");
  }

  if (pullRequest) {
    console.log(
      `Pull request: #${pullRequest.pullRequestId} - ${pullRequest.title ?? "(no title)"}`,
    );
  } else {
    console.log("Pull request: none found");
  }
}

async function cmdRepos(config: AdoConfig): Promise<void> {
  const gitApi = await config.connection.getGitApi();
  const repos = await gitApi.getRepositories(config.project);
  for (const repo of repos) {
    console.log(`${repo.id}\t${repo.name}`);
  }
}

async function cmdBranches(config: AdoConfig, repoArg?: string): Promise<void> {
  const gitApi = await config.connection.getGitApi();
  const repo = pickRepo(config, repoArg);
  const refs = await gitApi.getRefs(repo, config.project, "heads/");
  for (const ref of refs) {
    const name = String(ref.name || "").replace("refs/heads/", "");
    console.log(name);
  }
}

async function cmdWorkItemGet(
  config: AdoConfig,
  idRaw: string | undefined,
  args: string[] = [],
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error("Usage: workitem-get <id> [--raw] [--expand=all|fields|links|relations]");
    process.exit(1);
  }

  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(["raw", "expand"]);

  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      console.error(`Unknown option for workitem-get: --${key}`);
      console.error("Usage: workitem-get <id> [--raw] [--expand=all|fields|links|relations]");
      process.exit(1);
    }
  }

  if (positionals.length > 0) {
    console.error("Usage: workitem-get <id> [--raw] [--expand=all|fields|links|relations]");
    process.exit(1);
  }

  const rawOutput = options.raw === true || options.raw === "true" || options.raw === "1";
  const expandStr =
    typeof options.expand === "string" && options.expand.trim().length > 0
      ? options.expand.trim().toLowerCase()
      : undefined;
  const expand = expandStr ? expandMap[expandStr] : undefined;

  const witApi = await config.connection.getWorkItemTrackingApi();
  const result = await witApi.getWorkItem(id, undefined, undefined, expand, config.project);

  if (rawOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(
    JSON.stringify(
      {
        id: result.id,
        title: result.fields?.["System.Title"],
        state: result.fields?.["System.State"],
        type: result.fields?.["System.WorkItemType"],
        assignedTo:
          (result.fields?.["System.AssignedTo"] as { displayName?: string } | null)?.displayName ??
          null,
        changedDate: result.fields?.["System.ChangedDate"],
        url: result.url,
      },
      null,
      2,
    ),
  );
}

async function cmdWorkItemsRecent(config: AdoConfig, args: string[] = []): Promise<void> {
  let parsedArgs;

  try {
    parsedArgs = parseWorkItemsRecentArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(
      "Usage: workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]",
    );
    process.exit(1);
  }

  const witApi = await config.connection.getWorkItemTrackingApi();
  const wiqlResult = await witApi.queryByWiql(
    { query: buildRecentWorkItemsWiql(parsedArgs.filters) },
    { project: config.project },
    undefined,
    parsedArgs.top,
  );

  for (const wi of wiqlResult.workItems ?? []) {
    console.log(wi.id);
  }
}

async function cmdWorkItemComments(
  config: AdoConfig,
  idRaw: string | undefined,
  args: string[] = [],
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error("Usage: workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]");
    process.exit(1);
  }

  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(["top", "order"]);
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      console.error(`Unknown option for workitem-comments: --${key}`);
      console.error("Usage: workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]");
      process.exit(1);
    }
  }

  if (positionals.length > 1) {
    console.error("Usage: workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]");
    process.exit(1);
  }

  const topCandidate = options.top ?? positionals[0] ?? "50";
  const top = Number(topCandidate);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 200) : 50;

  const orderRaw = typeof options.order === "string" ? options.order.trim().toLowerCase() : "desc";
  const order = orderRaw === "asc" ? CommentSortOrder.Asc : CommentSortOrder.Desc;

  const witApi = await config.connection.getWorkItemTrackingApi();
  const result = await witApi.getComments(
    config.project,
    id,
    boundedTop,
    undefined,
    undefined,
    undefined,
    order,
  );
  console.log(JSON.stringify(result, null, 2));
}

async function resolveCommentText(
  options: Record<string, string | boolean>,
  usage: string,
): Promise<string> {
  let text = typeof options.text === "string" ? options.text : undefined;
  if ((!text || text.trim().length === 0) && typeof options.file === "string") {
    text = await readFile(options.file, "utf8");
  }

  if (!text || text.trim().length === 0) {
    console.error(usage);
    console.error("Either --text or --file must provide a non-empty comment body.");
    process.exit(1);
  }

  return text;
}

async function cmdWorkItemCommentAdd(
  config: AdoConfig,
  idRaw: string | undefined,
  args: string[] = [],
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: workitem-comment-add <id> --text="..." [--file=path]');
    process.exit(1);
  }

  const usage = 'Usage: workitem-comment-add <id> --text="..." [--file=path]';
  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(["text", "file"]);
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      console.error(`Unknown option for workitem-comment-add: --${key}`);
      console.error(usage);
      process.exit(1);
    }
  }

  if (positionals.length > 0) {
    console.error(usage);
    process.exit(1);
  }

  const text = await resolveCommentText(options, usage);

  const witApi = await config.connection.getWorkItemTrackingApi();
  const result = await witApi.addComment({ text }, config.project, id);

  console.log(
    JSON.stringify(
      {
        id: result.id ?? null,
        workItemId: id,
        createdBy: result.createdBy?.displayName ?? null,
        createdDate: result.createdDate ?? null,
        text: result.text ?? text,
      },
      null,
      2,
    ),
  );
}

async function cmdWorkItemCommentUpdate(
  config: AdoConfig,
  idRaw: string | undefined,
  commentIdRaw: string | undefined,
  args: string[] = [],
): Promise<void> {
  const id = Number(idRaw);
  const commentId = Number(commentIdRaw);

  if (!Number.isFinite(id) || !Number.isFinite(commentId)) {
    console.error('Usage: workitem-comment-update <id> <commentId> --text="..." [--file=path]');
    process.exit(1);
  }

  const usage = 'Usage: workitem-comment-update <id> <commentId> --text="..." [--file=path]';
  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(["text", "file"]);
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      console.error(`Unknown option for workitem-comment-update: --${key}`);
      console.error(usage);
      process.exit(1);
    }
  }

  if (positionals.length > 0) {
    console.error(usage);
    process.exit(1);
  }

  const text = await resolveCommentText(options, usage);

  const witApi = await config.connection.getWorkItemTrackingApi();
  const result = await witApi.updateComment({ text }, config.project, id, commentId);

  console.log(
    JSON.stringify(
      {
        id: result.id ?? commentId,
        workItemId: id,
        modifiedBy: result.modifiedBy?.displayName ?? null,
        modifiedDate: result.modifiedDate ?? null,
        text: result.text ?? text,
      },
      null,
      2,
    ),
  );
}

async function cmdPrs(
  config: AdoConfig,
  status = "active",
  topRaw = "10",
  repoArg?: string,
): Promise<void> {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;
  const repo = pickRepo(config, repoArg);

  const gitApi = await config.connection.getGitApi();
  const prs = await gitApi.getPullRequests(
    repo,
    { status: mapPrStatus(status) } as GitPullRequestSearchCriteria,
    config.project,
    undefined,
    undefined,
    boundedTop,
  );

  for (const pr of prs) {
    const createdBy = pr.createdBy?.displayName ?? "unknown";
    console.log(`#${pr.pullRequestId}\t[${prStatusName(pr.status)}]\t${pr.title}\t(${createdBy})`);
  }
}

async function cmdPrGet(
  config: AdoConfig,
  idRaw: string | undefined,
  _repoArg?: string,
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error("Usage: pr-get <id> [repo]");
    process.exit(1);
  }

  const gitApi = await config.connection.getGitApi();
  const pr = await gitApi.getPullRequestById(id, config.project);
  console.log(
    JSON.stringify(
      {
        id: pr.pullRequestId,
        title: pr.title,
        status: prStatusName(pr.status),
        createdBy: pr.createdBy?.displayName ?? null,
        createdById: pr.createdBy?.id ?? null,
        sourceRef: pr.sourceRefName,
        targetRef: pr.targetRefName,
        url: pr.url,
      },
      null,
      2,
    ),
  );
}

async function cmdPrApprove(
  config: AdoConfig,
  idRaw: string | undefined,
  repoArg?: string,
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error("Usage: pr-approve <id> [repo]");
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const gitApi = await config.connection.getGitApi();
  const pr = await gitApi.getPullRequestById(id, config.project);
  const reviewerId = pr.createdBy?.id;

  if (!reviewerId) {
    console.error("Could not determine reviewer id from PR createdBy.");
    process.exit(1);
  }

  await gitApi.createPullRequestReviewer({ vote: 10 }, repo, id, reviewerId, config.project);
  console.log(`Approved PR #${id} as reviewer ${reviewerId}`);
}

async function getOptionalWorkItemPolicyIds(
  config: AdoConfig,
  repositoryId: string | undefined,
  targetRefName: string | undefined,
): Promise<number[]> {
  const policyApi = await config.connection.getPolicyApi();
  const policies = await policyApi.getPolicyConfigurations(config.project);
  const ids: number[] = [];

  for (const policy of policies) {
    const typeName = policy.type?.displayName;
    if (typeName !== "Work item linking") continue;
    if (!policy.isEnabled || policy.isBlocking) continue;

    const scopes = policy.settings?.scope;
    if (!Array.isArray(scopes) || scopes.length === 0) {
      if (policy.id != null) ids.push(policy.id);
      continue;
    }

    const matchesScope = scopes.some(
      (scope: { repositoryId?: string; refName?: string; matchKind?: string }) => {
        const repoOk = !scope.repositoryId || scope.repositoryId === repositoryId;
        const refOk = !scope.refName || scope.refName === targetRefName;
        const matchKindOk =
          !scope.matchKind || scope.matchKind === "Exact" || scope.matchKind === "Prefix";
        return repoOk && refOk && matchKindOk;
      },
    );

    if (matchesScope && policy.id != null) ids.push(policy.id);
  }

  return ids;
}

async function cmdPrAutocomplete(
  config: AdoConfig,
  idRaw: string | undefined,
  repoArg?: string,
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error("Usage: pr-autocomplete <id> [repo]");
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const gitApi = await config.connection.getGitApi();
  const pr = await gitApi.getPullRequestById(id, config.project);
  const userId = pr.createdBy?.id;

  if (!userId) {
    console.error("Could not determine user id from PR createdBy.");
    process.exit(1);
  }

  const optionalWorkItemPolicyIds = await getOptionalWorkItemPolicyIds(
    config,
    pr.repository?.id,
    pr.targetRefName,
  );

  await gitApi.updatePullRequest(
    {
      autoCompleteSetBy: { id: userId },
      completionOptions: {
        deleteSourceBranch: true,
        autoCompleteIgnoreConfigIds: optionalWorkItemPolicyIds,
      },
    } as GitPullRequest,
    repo,
    id,
    config.project,
  );

  if (optionalWorkItemPolicyIds.length > 0) {
    console.log(
      `Enabled auto-complete for PR #${id} (optional linked work item policies ignored: ${optionalWorkItemPolicyIds.join(", ")})`,
    );
  } else {
    console.log(`Enabled auto-complete for PR #${id}`);
  }
}

async function cmdBuilds(config: AdoConfig, topRaw = "10"): Promise<void> {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;

  const buildApi = await config.connection.getBuildApi();
  const builds = await buildApi.getBuilds(
    config.project,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    boundedTop,
    undefined,
    undefined,
    undefined,
    BuildQueryOrder.QueueTimeDescending,
  );

  for (const b of builds) {
    console.log(
      `#${b.id}\t${b.status}/${b.result ?? "n/a"}\t${b.definition?.name ?? "unknown"}\t${b.sourceBranch ?? ""}`,
    );
  }
}

async function linkWorkItemsToPr(
  config: AdoConfig,
  _repo: string,
  pr: GitPullRequest | null,
  workItemIds: number[],
): Promise<void> {
  const artifactUrl = buildPullRequestArtifactUrl(pr);
  if (!artifactUrl) {
    throw new Error("Unable to resolve PR artifact URL required to link work items.");
  }

  const witApi = await config.connection.getWorkItemTrackingApi();

  for (const workItemId of workItemIds) {
    const patchDocument: JsonPatchOperation[] = [
      {
        op: Operation.Add,
        path: "/relations/-",
        value: {
          rel: "ArtifactLink",
          url: artifactUrl,
          attributes: {
            name: "Pull Request",
          },
        },
      },
    ];

    await witApi.updateWorkItem({}, patchDocument, workItemId, config.project);
    console.log(`Linked work item #${workItemId} to PR #${pr?.pullRequestId}`);
  }
}

async function cmdPrCreate(config: AdoConfig, args: string[]): Promise<void> {
  const kv = Object.fromEntries(
    args.map((arg) => {
      const [k, ...rest] = arg.split("=");
      return [k!.replace(/^--/, ""), rest.join("=")];
    }),
  );

  const title = kv.title;
  const source = kv.source;
  const target = kv.target;
  const description = kv.description ?? "";
  const repo = pickRepo(config, kv.repo);
  const workItemIds = parseWorkItemIds(kv["work-items"]);

  if (!title || !source || !target) {
    console.error(
      "Usage: pr-create --title=... --source=feature/x --target=develop [--description=...] [--repo=...] [--work-items=123,456]",
    );
    process.exit(1);
  }

  const gitApi = await config.connection.getGitApi();
  const created = await gitApi.createPullRequest(
    {
      title,
      description,
      sourceRefName: source.startsWith("refs/") ? source : `refs/heads/${source}`,
      targetRefName: target.startsWith("refs/") ? target : `refs/heads/${target}`,
    },
    repo,
    config.project,
  );
  console.log(`Created PR #${created.pullRequestId}: ${created.title}`);

  if (workItemIds.length > 0) {
    const createdPr = await gitApi.getPullRequestById(created.pullRequestId!, config.project);
    await linkWorkItemsToPr(config, repo, createdPr, workItemIds);
  }
}

async function cmdPrUpdate(
  config: AdoConfig,
  idRaw: string | undefined,
  args: string[],
): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error(
      "Usage: pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]",
    );
    process.exit(1);
  }

  const kv = Object.fromEntries(
    args.map((arg) => {
      const [k, ...rest] = arg.split("=");
      return [k!.replace(/^--/, ""), rest.join("=")];
    }),
  );

  const repo = pickRepo(config, kv.repo);
  const body: Record<string, string> = {};
  const workItemIds = parseWorkItemIds(kv["work-items"]);

  if (kv.title !== undefined) body.title = kv.title;
  if (kv.description !== undefined) body.description = kv.description;

  if (Object.keys(body).length === 0 && workItemIds.length === 0) {
    console.error(
      "Usage: pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]",
    );
    process.exit(1);
  }

  const gitApi = await config.connection.getGitApi();
  let updated: GitPullRequest;

  if (Object.keys(body).length > 0) {
    updated = await gitApi.updatePullRequest(body as GitPullRequest, repo, id, config.project);
    console.log(`Updated PR #${updated.pullRequestId}: ${updated.title}`);
  } else {
    updated = await gitApi.getPullRequestById(id, config.project);
  }

  if (workItemIds.length > 0) {
    await linkWorkItemsToPr(config, repo, updated, workItemIds);
  }
}

async function cmdInit(): Promise<void> {
  const { createInterface } = await import("node:readline/promises");
  const { mkdirSync, writeFileSync, existsSync } = await import("node:fs");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const existing = loadFileConfig();
  const configPath = getConfigFilePath();

  console.log("Azure DevOps CLI — Configuration");
  console.log(`Config file: ${configPath}`);
  console.log("Press Enter to keep existing values shown in brackets.\n");

  const pat =
    (await rl.question(`Personal Access Token (PAT)${existing.pat ? " [****]" : ""}: `)) ||
    existing.pat ||
    "";
  const collectionUrl =
    (await rl.question(
      `Collection URL${existing.collectionUrl ? ` [${existing.collectionUrl}]` : ""}: `,
    )) ||
    existing.collectionUrl ||
    "";
  const project =
    (await rl.question(`Project${existing.project ? ` [${existing.project}]` : ""}: `)) ||
    existing.project ||
    "";
  const repo =
    (await rl.question(`Repository${existing.repo ? ` [${existing.repo}]` : ""}: `)) ||
    existing.repo ||
    "";
  const insecureInput =
    (await rl.question(
      `Disable TLS verification (insecure)? (y/N)${existing.insecure ? " [y]" : ""}: `,
    )) || (existing.insecure ? "y" : "n");
  const insecure = insecureInput.toLowerCase() === "y" || insecureInput === "1";

  rl.close();

  if (!pat || !collectionUrl || !project || !repo) {
    console.error("\nAll fields (PAT, Collection URL, Project, Repository) are required.");
    process.exit(1);
  }

  const config: FileConfig = { pat, collectionUrl, project, repo, insecure };

  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`\nConfiguration saved to ${configPath}`);
}

function printHelp(): void {
  console.log(
    `Azure DevOps CLI\n\nCommands:\n  init\n  smoke\n  repos\n  branches [repo]\n  workitem-get <id> [--raw] [--expand=all|fields|links|relations]\n  workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]\n  workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]\n  workitem-comment-add <id> --text="..." [--file=path]\n  workitem-comment-update <id> <commentId> --text="..." [--file=path]\n  prs [status] [top] [repo]\n  pr-get <id> [repo]\n  pr-create --title=... --source=... --target=... [--description=...] [--repo=...] [--work-items=123,456]\n  pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]\n  pr-approve <id> [repo]\n  pr-autocomplete <id> [repo]\n  builds [top]\n`,
  );
}

async function main(): Promise<void> {
  const [command = "smoke", ...args] = process.argv.slice(2);

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "init") {
    await cmdInit();
    return;
  }

  const config = getConfig();

  switch (command) {
    case "smoke":
      await cmdSmoke(config);
      break;
    case "repos":
      await cmdRepos(config);
      break;
    case "branches":
      await cmdBranches(config, args[0]);
      break;
    case "workitem-get":
      await cmdWorkItemGet(config, args[0], args.slice(1));
      break;
    case "workitems-recent":
      await cmdWorkItemsRecent(config, args);
      break;
    case "workitem-comments":
      await cmdWorkItemComments(config, args[0], args.slice(1));
      break;
    case "workitem-comment-add":
      await cmdWorkItemCommentAdd(config, args[0], args.slice(1));
      break;
    case "workitem-comment-update":
      await cmdWorkItemCommentUpdate(config, args[0], args[1], args.slice(2));
      break;
    case "prs":
      await cmdPrs(config, args[0], args[1], args[2]);
      break;
    case "pr-get":
      await cmdPrGet(config, args[0], args[1]);
      break;
    case "pr-create":
      await cmdPrCreate(config, args);
      break;
    case "pr-update":
      await cmdPrUpdate(config, args[0], args.slice(1));
      break;
    case "pr-approve":
      await cmdPrApprove(config, args[0], args[1]);
      break;
    case "pr-autocomplete":
      await cmdPrAutocomplete(config, args[0], args[1]);
      break;
    case "builds":
      await cmdBuilds(config, args[0]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

try {
  await main();
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
