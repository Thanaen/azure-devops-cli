#!/usr/bin/env bun
import { getConfig } from './config.ts';
import { adoRequest, encodePathSegment, COMMENTS_API_VERSION } from './api.ts';
import { buildPullRequestArtifactUrl, parseWorkItemIds } from './pr-workitems.ts';
import { buildRecentWorkItemsWiql, parseOptionArgs, parseWorkItemsRecentArgs } from './workitems-query.ts';
import type {
  AdoConfig,
  AdoWorkItem,
  AdoWiqlResult,
  AdoPullRequest,
  AdoListResponse,
  AdoGitRef,
  AdoBuild,
  AdoCommentList,
  AdoComment,
  AdoIdentityRef,
  AdoPolicyConfiguration,
} from './types.ts';

function pickRepo(config: AdoConfig, value?: string): string {
  return value || config.repo;
}

async function getLatestWorkItem(config: AdoConfig): Promise<AdoWorkItem | null> {
  const wiql = {
    query: 'SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC',
  };

  const wiqlResult = await adoRequest<AdoWiqlResult>(config, `/${encodePathSegment(config.project)}/_apis/wit/wiql?$top=1`, {
    method: 'POST',
    body: wiql,
  });

  const id = wiqlResult?.workItems?.[0]?.id;
  if (!id) return null;

  return adoRequest<AdoWorkItem>(config, `/${encodePathSegment(config.project)}/_apis/wit/workitems/${id}`);
}

async function getLatestPullRequest(config: AdoConfig, repo: string): Promise<AdoPullRequest | null> {
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests?searchCriteria.status=all&$top=1`;
  const result = await adoRequest<AdoListResponse<AdoPullRequest>>(config, path);
  return result?.value?.[0] ?? null;
}

async function cmdSmoke(config: AdoConfig): Promise<void> {
  const repo = pickRepo(config);
  const workItem = await getLatestWorkItem(config);
  const pullRequest = await getLatestPullRequest(config, repo);

  console.log('Azure DevOps connectivity check');
  console.log('--------------------------------');
  if (workItem) {
    console.log(`Work item: #${workItem.id} - ${(workItem.fields?.['System.Title'] as string) ?? '(no title)'}`);
  } else {
    console.log('Work item: none found');
  }

  if (pullRequest) {
    console.log(`Pull request: #${pullRequest.pullRequestId} - ${pullRequest.title ?? '(no title)'}`);
  } else {
    console.log('Pull request: none found');
  }
}

async function cmdRepos(config: AdoConfig): Promise<void> {
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories?$top=100`;
  const result = await adoRequest<AdoListResponse<{ id?: string; name?: string }>>(config, path);
  for (const repo of result?.value ?? []) {
    console.log(`${repo.id}\t${repo.name}`);
  }
}

async function cmdBranches(config: AdoConfig, repoArg?: string): Promise<void> {
  const repo = pickRepo(config, repoArg);
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/refs?filter=heads/&$top=200`;
  const result = await adoRequest<AdoListResponse<AdoGitRef>>(config, path);
  for (const ref of result?.value ?? []) {
    const name = String(ref.name || '').replace('refs/heads/', '');
    console.log(name);
  }
}

async function cmdWorkItemGet(config: AdoConfig, idRaw: string | undefined, args: string[] = []): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: workitem-get <id> [--raw] [--expand=all|fields|links|relations]');
    process.exit(1);
  }

  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(['raw', 'expand']);

  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      console.error(`Unknown option for workitem-get: --${key}`);
      console.error('Usage: workitem-get <id> [--raw] [--expand=all|fields|links|relations]');
      process.exit(1);
    }
  }

  if (positionals.length > 0) {
    console.error('Usage: workitem-get <id> [--raw] [--expand=all|fields|links|relations]');
    process.exit(1);
  }

  const rawOutput = options.raw === true || options.raw === 'true' || options.raw === '1';
  const expand = typeof options.expand === 'string' && options.expand.trim().length > 0
    ? options.expand.trim()
    : undefined;

  const queryParts: string[] = [];
  if (expand) queryParts.push(`$expand=${encodeURIComponent(expand)}`);
  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const result = await adoRequest<AdoWorkItem>(config, `/${encodePathSegment(config.project)}/_apis/wit/workitems/${id}${query}`);

  if (rawOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(JSON.stringify({
    id: result?.id,
    title: result?.fields?.['System.Title'],
    state: result?.fields?.['System.State'],
    type: result?.fields?.['System.WorkItemType'],
    assignedTo: (result?.fields?.['System.AssignedTo'] as AdoIdentityRef | null)?.displayName ?? null,
    changedDate: result?.fields?.['System.ChangedDate'],
    url: result?.url,
  }, null, 2));
}

async function cmdWorkItemsRecent(config: AdoConfig, args: string[] = []): Promise<void> {
  let parsedArgs;

  try {
    parsedArgs = parseWorkItemsRecentArgs(args);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error('Usage: workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]');
    process.exit(1);
  }

  const wiql = {
    query: buildRecentWorkItemsWiql(parsedArgs.filters),
  };

  const wiqlResult = await adoRequest<AdoWiqlResult>(config, `/${encodePathSegment(config.project)}/_apis/wit/wiql?$top=${parsedArgs.top}`, {
    method: 'POST',
    body: wiql,
  });

  for (const wi of wiqlResult?.workItems ?? []) {
    console.log(wi.id);
  }
}

async function cmdWorkItemComments(config: AdoConfig, idRaw: string | undefined, args: string[] = []): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]');
    process.exit(1);
  }

  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(['top', 'order']);
  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      console.error(`Unknown option for workitem-comments: --${key}`);
      console.error('Usage: workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]');
      process.exit(1);
    }
  }

  if (positionals.length > 1) {
    console.error('Usage: workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]');
    process.exit(1);
  }

  const topCandidate = options.top ?? positionals[0] ?? '50';
  const top = Number(topCandidate);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 200) : 50;

  const orderRaw = typeof options.order === 'string' ? options.order.trim().toLowerCase() : 'desc';
  const order = orderRaw === 'asc' ? 'asc' : 'desc';

  const path = `/${encodePathSegment(config.project)}/_apis/wit/workItems/${id}/comments?$top=${boundedTop}&order=${order}`;
  const result = await adoRequest<AdoCommentList>(config, path, { apiVersion: COMMENTS_API_VERSION });
  console.log(JSON.stringify(result, null, 2));
}

async function resolveCommentText(options: Record<string, string | boolean>, usage: string): Promise<string> {
  let text = typeof options.text === 'string' ? options.text : undefined;
  if ((!text || text.trim().length === 0) && typeof options.file === 'string') {
    text = await Bun.file(options.file).text();
  }

  if (!text || text.trim().length === 0) {
    console.error(usage);
    console.error('Either --text or --file must provide a non-empty comment body.');
    process.exit(1);
  }

  return text;
}

async function cmdWorkItemCommentAdd(config: AdoConfig, idRaw: string | undefined, args: string[] = []): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: workitem-comment-add <id> --text="..." [--file=path]');
    process.exit(1);
  }

  const usage = 'Usage: workitem-comment-add <id> --text="..." [--file=path]';
  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(['text', 'file']);
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

  const path = `/${encodePathSegment(config.project)}/_apis/wit/workItems/${id}/comments`;
  const result = await adoRequest<AdoComment>(config, path, {
    method: 'POST',
    body: { text },
    apiVersion: COMMENTS_API_VERSION,
  });

  console.log(JSON.stringify({
    id: result?.id ?? null,
    workItemId: id,
    createdBy: result?.createdBy?.displayName ?? null,
    createdDate: result?.createdDate ?? null,
    text: result?.text ?? text,
  }, null, 2));
}

async function cmdWorkItemCommentUpdate(config: AdoConfig, idRaw: string | undefined, commentIdRaw: string | undefined, args: string[] = []): Promise<void> {
  const id = Number(idRaw);
  const commentId = Number(commentIdRaw);

  if (!Number.isFinite(id) || !Number.isFinite(commentId)) {
    console.error('Usage: workitem-comment-update <id> <commentId> --text="..." [--file=path]');
    process.exit(1);
  }

  const usage = 'Usage: workitem-comment-update <id> <commentId> --text="..." [--file=path]';
  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(['text', 'file']);
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

  const path = `/${encodePathSegment(config.project)}/_apis/wit/workItems/${id}/comments/${commentId}`;
  const result = await adoRequest<AdoComment>(config, path, {
    method: 'PATCH',
    body: { text },
    apiVersion: COMMENTS_API_VERSION,
  });

  console.log(JSON.stringify({
    id: result?.id ?? commentId,
    workItemId: id,
    modifiedBy: result?.modifiedBy?.displayName ?? null,
    modifiedDate: result?.modifiedDate ?? null,
    text: result?.text ?? text,
  }, null, 2));
}

async function cmdPrs(config: AdoConfig, status = 'active', topRaw = '10', repoArg?: string): Promise<void> {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;
  const repo = pickRepo(config, repoArg);
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests?searchCriteria.status=${encodeURIComponent(status)}&$top=${boundedTop}`;
  const result = await adoRequest<AdoListResponse<AdoPullRequest>>(config, path);

  for (const pr of result?.value ?? []) {
    const createdBy = pr.createdBy?.displayName ?? 'unknown';
    console.log(`#${pr.pullRequestId}\t[${pr.status}]\t${pr.title}\t(${createdBy})`);
  }
}

async function cmdPrGet(config: AdoConfig, idRaw: string | undefined, repoArg?: string): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-get <id> [repo]');
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  const pr = await adoRequest<AdoPullRequest>(config, path);
  console.log(JSON.stringify({
    id: pr?.pullRequestId,
    title: pr?.title,
    status: pr?.status,
    createdBy: pr?.createdBy?.displayName ?? null,
    createdById: pr?.createdBy?.id ?? null,
    sourceRef: pr?.sourceRefName,
    targetRef: pr?.targetRefName,
    url: pr?.url,
  }, null, 2));
}

async function cmdPrApprove(config: AdoConfig, idRaw: string | undefined, repoArg?: string): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-approve <id> [repo]');
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const prPath = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  const pr = await adoRequest<AdoPullRequest>(config, prPath);
  const reviewerId = pr?.createdBy?.id;

  if (!reviewerId) {
    console.error('Could not determine reviewer id from PR createdBy.');
    process.exit(1);
  }

  const reviewerPath = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}/reviewers/${encodePathSegment(reviewerId)}`;
  await adoRequest(config, reviewerPath, { method: 'PUT', body: { vote: 10 } });
  console.log(`Approved PR #${id} as reviewer ${reviewerId}`);
}

async function getOptionalWorkItemPolicyIds(config: AdoConfig, repositoryId: string | undefined, targetRefName: string | undefined): Promise<number[]> {
  const policies = await adoRequest<AdoListResponse<AdoPolicyConfiguration>>(config, `/${encodePathSegment(config.project)}/_apis/policy/configurations`);
  const ids: number[] = [];

  for (const policy of policies?.value ?? []) {
    const typeName = policy?.type?.displayName;
    if (typeName !== 'Work item linking') continue;
    if (!policy?.isEnabled || policy?.isBlocking) continue;

    const scopes = policy?.settings?.scope;
    if (!Array.isArray(scopes) || scopes.length === 0) {
      if (policy.id != null) ids.push(policy.id);
      continue;
    }

    const matchesScope = scopes.some((scope) => {
      const repoOk = !scope.repositoryId || scope.repositoryId === repositoryId;
      const refOk = !scope.refName || scope.refName === targetRefName;
      const matchKindOk = !scope.matchKind || scope.matchKind === 'Exact' || scope.matchKind === 'Prefix';
      return repoOk && refOk && matchKindOk;
    });

    if (matchesScope && policy.id != null) ids.push(policy.id);
  }

  return ids;
}

async function cmdPrAutocomplete(config: AdoConfig, idRaw: string | undefined, repoArg?: string): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-autocomplete <id> [repo]');
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const prPath = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  const pr = await adoRequest<AdoPullRequest>(config, prPath);
  const userId = pr?.createdBy?.id;

  if (!userId) {
    console.error('Could not determine user id from PR createdBy.');
    process.exit(1);
  }

  const optionalWorkItemPolicyIds = await getOptionalWorkItemPolicyIds(
    config,
    pr?.repository?.id,
    pr?.targetRefName,
  );

  await adoRequest(config, prPath, {
    method: 'PATCH',
    body: {
      autoCompleteSetBy: { id: userId },
      completionOptions: {
        deleteSourceBranch: true,
        autoCompleteIgnoreConfigIds: optionalWorkItemPolicyIds,
      },
    },
  });

  if (optionalWorkItemPolicyIds.length > 0) {
    console.log(`Enabled auto-complete for PR #${id} (optional linked work item policies ignored: ${optionalWorkItemPolicyIds.join(', ')})`);
  } else {
    console.log(`Enabled auto-complete for PR #${id}`);
  }
}

async function cmdBuilds(config: AdoConfig, topRaw = '10'): Promise<void> {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;
  const path = `/${encodePathSegment(config.project)}/_apis/build/builds?$top=${boundedTop}&queryOrder=queueTimeDescending`;
  const result = await adoRequest<AdoListResponse<AdoBuild>>(config, path);

  for (const b of result?.value ?? []) {
    console.log(`#${b.id}\t${b.status}/${b.result ?? 'n/a'}\t${b.definition?.name ?? 'unknown'}\t${b.sourceBranch ?? ''}`);
  }
}

async function linkWorkItemsToPr(config: AdoConfig, repo: string, pr: AdoPullRequest | null, workItemIds: number[]): Promise<void> {
  const artifactUrl = buildPullRequestArtifactUrl(pr);
  if (!artifactUrl) {
    throw new Error('Unable to resolve PR artifact URL required to link work items.');
  }

  for (const workItemId of workItemIds) {
    const wiPath = `/${encodePathSegment(config.project)}/_apis/wit/workitems/${workItemId}`;
    const patchBody = [
      {
        op: 'add',
        path: '/relations/-',
        value: {
          rel: 'ArtifactLink',
          url: artifactUrl,
          attributes: {
            name: 'Pull Request',
          },
        },
      },
    ];

    await adoRequest(config, wiPath, {
      method: 'PATCH',
      body: patchBody,
      contentType: 'application/json-patch+json',
    });

    console.log(`Linked work item #${workItemId} to PR #${pr?.pullRequestId}`);
  }
}

async function cmdPrCreate(config: AdoConfig, args: string[]): Promise<void> {
  const kv = Object.fromEntries(args.map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k!.replace(/^--/, ''), rest.join('=')];
  }));

  const title = kv.title;
  const source = kv.source;
  const target = kv.target;
  const description = kv.description ?? '';
  const repo = pickRepo(config, kv.repo);
  const workItemIds = parseWorkItemIds(kv['work-items']);

  if (!title || !source || !target) {
    console.error('Usage: pr-create --title=... --source=feature/x --target=develop [--description=...] [--repo=...] [--work-items=123,456]');
    process.exit(1);
  }

  const body = {
    title,
    description,
    sourceRefName: source.startsWith('refs/') ? source : `refs/heads/${source}`,
    targetRefName: target.startsWith('refs/') ? target : `refs/heads/${target}`,
  };

  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests`;
  const created = await adoRequest<AdoPullRequest>(config, path, { method: 'POST', body });
  console.log(`Created PR #${created?.pullRequestId}: ${created?.title}`);

  if (workItemIds.length > 0) {
    const createdPr = await adoRequest<AdoPullRequest>(config, `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${created?.pullRequestId}`);
    await linkWorkItemsToPr(config, repo, createdPr, workItemIds);
  }
}

async function cmdPrUpdate(config: AdoConfig, idRaw: string | undefined, args: string[]): Promise<void> {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]');
    process.exit(1);
  }

  const kv = Object.fromEntries(args.map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k!.replace(/^--/, ''), rest.join('=')];
  }));

  const repo = pickRepo(config, kv.repo);
  const body: Record<string, string> = {};
  const workItemIds = parseWorkItemIds(kv['work-items']);

  if (kv.title !== undefined) body.title = kv.title;
  if (kv.description !== undefined) body.description = kv.description;

  if (Object.keys(body).length === 0 && workItemIds.length === 0) {
    console.error('Usage: pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]');
    process.exit(1);
  }

  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  let updated: AdoPullRequest | null;

  if (Object.keys(body).length > 0) {
    updated = await adoRequest<AdoPullRequest>(config, path, { method: 'PATCH', body });
    console.log(`Updated PR #${updated?.pullRequestId}: ${updated?.title}`);
  } else {
    updated = await adoRequest<AdoPullRequest>(config, path);
  }

  if (workItemIds.length > 0) {
    await linkWorkItemsToPr(config, repo, updated, workItemIds);
  }
}

function printHelp(): void {
  console.log(`Azure DevOps CLI\n\nCommands:\n  smoke\n  repos\n  branches [repo]\n  workitem-get <id> [--raw] [--expand=all|fields|links|relations]\n  workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]\n  workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]\n  workitem-comment-add <id> --text="..." [--file=path]\n  workitem-comment-update <id> <commentId> --text="..." [--file=path]\n  prs [status] [top] [repo]\n  pr-get <id> [repo]\n  pr-create --title=... --source=... --target=... [--description=...] [--repo=...] [--work-items=123,456]\n  pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]\n  pr-approve <id> [repo]\n  pr-autocomplete <id> [repo]\n  builds [top]\n`);
}

async function main(): Promise<void> {
  const [command = 'smoke', ...args] = process.argv.slice(2);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const config = getConfig();

  switch (command) {
    case 'smoke':
      await cmdSmoke(config);
      break;
    case 'repos':
      await cmdRepos(config);
      break;
    case 'branches':
      await cmdBranches(config, args[0]);
      break;
    case 'workitem-get':
      await cmdWorkItemGet(config, args[0], args.slice(1));
      break;
    case 'workitems-recent':
      await cmdWorkItemsRecent(config, args);
      break;
    case 'workitem-comments':
      await cmdWorkItemComments(config, args[0], args.slice(1));
      break;
    case 'workitem-comment-add':
      await cmdWorkItemCommentAdd(config, args[0], args.slice(1));
      break;
    case 'workitem-comment-update':
      await cmdWorkItemCommentUpdate(config, args[0], args[1], args.slice(2));
      break;
    case 'prs':
      await cmdPrs(config, args[0], args[1], args[2]);
      break;
    case 'pr-get':
      await cmdPrGet(config, args[0], args[1]);
      break;
    case 'pr-create':
      await cmdPrCreate(config, args);
      break;
    case 'pr-update':
      await cmdPrUpdate(config, args[0], args.slice(1));
      break;
    case 'pr-approve':
      await cmdPrApprove(config, args[0], args[1]);
      break;
    case 'pr-autocomplete':
      await cmdPrAutocomplete(config, args[0], args[1]);
      break;
    case 'builds':
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
