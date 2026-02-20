#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { buildPullRequestArtifactUrl, parseWorkItemIds } from './pr-workitems.mjs';
import { buildRecentWorkItemsWiql, parseOptionArgs, parseWorkItemsRecentArgs } from './workitems-query.mjs';

const DEFAULT_COLLECTION_URL = 'https://dev.azure.com/<your-org>';
const DEFAULT_PROJECT = '<your-project>';
const DEFAULT_REPO = '<your-repository>';
const API_VERSION = '7.0';
const COMMENTS_API_VERSION = '7.0-preview.3';

function isDefaultPlaceholder(value) {
  return typeof value === 'string' && value.includes('<your-');
}

function getConfig() {
  const pat = process.env.DEVOPS_PAT;
  if (!pat) {
    console.error('Missing DEVOPS_PAT environment variable.');
    process.exit(1);
  }

  const collectionUrl = process.env.ADO_COLLECTION_URL ?? DEFAULT_COLLECTION_URL;
  const project = process.env.ADO_PROJECT ?? DEFAULT_PROJECT;
  const repo = process.env.ADO_REPO ?? DEFAULT_REPO;

  if (isDefaultPlaceholder(collectionUrl) || isDefaultPlaceholder(project) || isDefaultPlaceholder(repo)) {
    console.error('ADO configuration is incomplete. Set ADO_COLLECTION_URL, ADO_PROJECT, and ADO_REPO.');
    console.error('Example: ADO_COLLECTION_URL="https://devserver2/DefaultCollection" ADO_PROJECT="UserLock" ADO_REPO="Ulysse Interface"');
    process.exit(1);
  }

  return {
    pat,
    collectionUrl,
    project,
    repo,
    insecureTls: process.env.ADO_INSECURE === '1',
  };
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

function adoRequest(config, path, {
  method = 'GET',
  body,
  contentType = 'application/json',
  apiVersion = API_VERSION,
} = {}) {
  const url = `${config.collectionUrl}${path}${path.includes('?') ? '&' : '?'}api-version=${apiVersion}`;
  const args = [
    '--silent',
    '--show-error',
    '-u',
    `:${config.pat}`,
    '-H',
    `Content-Type: ${contentType}`,
    '-X',
    method,
    url,
    '--write-out',
    '\n__HTTP_STATUS__:%{http_code}',
  ];

  if (config.insecureTls) args.push('--insecure');
  if (body !== undefined) args.push('--data', JSON.stringify(body));

  const result = spawnSync('curl', args, {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw new Error(`curl failed to execute: ${result.error.message}`);
  }

  const raw = result.stdout ?? '';
  const marker = '\n__HTTP_STATUS__:';
  const markerIndex = raw.lastIndexOf(marker);
  const responseBody = markerIndex >= 0 ? raw.slice(0, markerIndex) : raw;
  const statusCode = markerIndex >= 0 ? Number(raw.slice(markerIndex + marker.length).trim()) : NaN;

  if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
    const preview = (responseBody || result.stderr || '').trim().slice(0, 350);
    throw new Error(
      `Azure DevOps API request failed (${Number.isFinite(statusCode) ? statusCode : 'unknown status'}). ${preview}`,
    );
  }

  return responseBody ? JSON.parse(responseBody) : null;
}

function pickRepo(config, value) {
  return value || config.repo;
}

function getLatestWorkItem(config) {
  const wiql = {
    query: 'SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC',
  };

  const wiqlResult = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/wiql?$top=1`, {
    method: 'POST',
    body: wiql,
  });

  const id = wiqlResult?.workItems?.[0]?.id;
  if (!id) return null;

  return adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/workitems/${id}`);
}

function getLatestPullRequest(config, repo) {
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests?searchCriteria.status=all&$top=1`;
  const result = adoRequest(config, path);
  return result?.value?.[0] ?? null;
}

function cmdSmoke(config) {
  const repo = pickRepo(config);
  const workItem = getLatestWorkItem(config);
  const pullRequest = getLatestPullRequest(config, repo);

  console.log('Azure DevOps connectivity check');
  console.log('--------------------------------');
  if (workItem) {
    console.log(`Work item: #${workItem.id} - ${workItem.fields?.['System.Title'] ?? '(no title)'}`);
  } else {
    console.log('Work item: none found');
  }

  if (pullRequest) {
    console.log(`Pull request: #${pullRequest.pullRequestId} - ${pullRequest.title ?? '(no title)'}`);
  } else {
    console.log('Pull request: none found');
  }
}

function cmdRepos(config) {
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories?$top=100`;
  const result = adoRequest(config, path);
  for (const repo of result?.value ?? []) {
    console.log(`${repo.id}\t${repo.name}`);
  }
}

function cmdBranches(config, repoArg) {
  const repo = pickRepo(config, repoArg);
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/refs?filter=heads/&$top=200`;
  const result = adoRequest(config, path);
  for (const ref of result?.value ?? []) {
    const name = String(ref.name || '').replace('refs/heads/', '');
    console.log(name);
  }
}

function cmdWorkItemGet(config, idRaw, args = []) {
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

  const queryParts = [];
  if (expand) queryParts.push(`$expand=${encodeURIComponent(expand)}`);
  const query = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  const result = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/workitems/${id}${query}`);

  if (rawOutput) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(JSON.stringify({
    id: result.id,
    title: result.fields?.['System.Title'],
    state: result.fields?.['System.State'],
    type: result.fields?.['System.WorkItemType'],
    assignedTo: result.fields?.['System.AssignedTo']?.displayName ?? null,
    changedDate: result.fields?.['System.ChangedDate'],
    url: result.url,
  }, null, 2));
}

function cmdWorkItemsRecent(config, args = []) {
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

  const wiqlResult = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/wiql?$top=${parsedArgs.top}`, {
    method: 'POST',
    body: wiql,
  });

  for (const wi of wiqlResult?.workItems ?? []) {
    console.log(wi.id);
  }
}

function cmdWorkItemComments(config, idRaw, args = []) {
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
  const result = adoRequest(config, path, { apiVersion: COMMENTS_API_VERSION });
  console.log(JSON.stringify(result, null, 2));
}

function resolveCommentText(options, usage) {
  let text = typeof options.text === 'string' ? options.text : undefined;
  if ((!text || text.trim().length === 0) && typeof options.file === 'string') {
    text = readFileSync(options.file, 'utf8');
  }

  if (!text || text.trim().length === 0) {
    console.error(usage);
    console.error('Either --text or --file must provide a non-empty comment body.');
    process.exit(1);
  }

  return text;
}

function cmdWorkItemCommentAdd(config, idRaw, args = []) {
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

  const text = resolveCommentText(options, usage);

  const path = `/${encodePathSegment(config.project)}/_apis/wit/workItems/${id}/comments`;
  const result = adoRequest(config, path, {
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

function cmdWorkItemCommentUpdate(config, idRaw, commentIdRaw, args = []) {
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

  const text = resolveCommentText(options, usage);

  const path = `/${encodePathSegment(config.project)}/_apis/wit/workItems/${id}/comments/${commentId}`;
  const result = adoRequest(config, path, {
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

function cmdPrs(config, status = 'active', topRaw = '10', repoArg) {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;
  const repo = pickRepo(config, repoArg);
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests?searchCriteria.status=${encodeURIComponent(status)}&$top=${boundedTop}`;
  const result = adoRequest(config, path);

  for (const pr of result?.value ?? []) {
    const createdBy = pr.createdBy?.displayName ?? 'unknown';
    console.log(`#${pr.pullRequestId}\t[${pr.status}]\t${pr.title}\t(${createdBy})`);
  }
}

function cmdPrGet(config, idRaw, repoArg) {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-get <id> [repo]');
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  const pr = adoRequest(config, path);
  console.log(JSON.stringify({
    id: pr.pullRequestId,
    title: pr.title,
    status: pr.status,
    createdBy: pr.createdBy?.displayName ?? null,
    createdById: pr.createdBy?.id ?? null,
    sourceRef: pr.sourceRefName,
    targetRef: pr.targetRefName,
    url: pr.url,
  }, null, 2));
}

function cmdPrApprove(config, idRaw, repoArg) {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-approve <id> [repo]');
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const prPath = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  const pr = adoRequest(config, prPath);
  const reviewerId = pr.createdBy?.id;

  if (!reviewerId) {
    console.error('Could not determine reviewer id from PR createdBy.');
    process.exit(1);
  }

  const reviewerPath = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}/reviewers/${encodePathSegment(reviewerId)}`;
  adoRequest(config, reviewerPath, { method: 'PUT', body: { vote: 10 } });
  console.log(`Approved PR #${id} as reviewer ${reviewerId}`);
}

function getOptionalWorkItemPolicyIds(config, repositoryId, targetRefName) {
  const policies = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/policy/configurations`);
  const ids = [];

  for (const policy of policies?.value ?? []) {
    const typeName = policy?.type?.displayName;
    if (typeName !== 'Work item linking') continue;
    if (!policy?.isEnabled || policy?.isBlocking) continue;

    const scopes = policy?.settings?.scope;
    if (!Array.isArray(scopes) || scopes.length === 0) {
      ids.push(policy.id);
      continue;
    }

    const matchesScope = scopes.some((scope) => {
      const repoOk = !scope.repositoryId || scope.repositoryId === repositoryId;
      const refOk = !scope.refName || scope.refName === targetRefName;
      const matchKindOk = !scope.matchKind || scope.matchKind === 'Exact' || scope.matchKind === 'Prefix';
      return repoOk && refOk && matchKindOk;
    });

    if (matchesScope) ids.push(policy.id);
  }

  return ids;
}

function cmdPrAutocomplete(config, idRaw, repoArg) {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-autocomplete <id> [repo]');
    process.exit(1);
  }

  const repo = pickRepo(config, repoArg);
  const prPath = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  const pr = adoRequest(config, prPath);
  const userId = pr.createdBy?.id;

  if (!userId) {
    console.error('Could not determine user id from PR createdBy.');
    process.exit(1);
  }

  const optionalWorkItemPolicyIds = getOptionalWorkItemPolicyIds(
    config,
    pr.repository?.id,
    pr.targetRefName,
  );

  adoRequest(config, prPath, {
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

function cmdBuilds(config, topRaw = '10') {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;
  const path = `/${encodePathSegment(config.project)}/_apis/build/builds?$top=${boundedTop}&queryOrder=queueTimeDescending`;
  const result = adoRequest(config, path);

  for (const b of result?.value ?? []) {
    console.log(`#${b.id}\t${b.status}/${b.result ?? 'n/a'}\t${b.definition?.name ?? 'unknown'}\t${b.sourceBranch ?? ''}`);
  }
}

function linkWorkItemsToPr(config, repo, pr, workItemIds) {
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

    adoRequest(config, wiPath, {
      method: 'PATCH',
      body: patchBody,
      contentType: 'application/json-patch+json',
    });

    console.log(`Linked work item #${workItemId} to PR #${pr.pullRequestId}`);
  }
}

function cmdPrCreate(config, args) {
  const kv = Object.fromEntries(args.map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k.replace(/^--/, ''), rest.join('=')];
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
  const created = adoRequest(config, path, { method: 'POST', body });
  console.log(`Created PR #${created.pullRequestId}: ${created.title}`);

  if (workItemIds.length > 0) {
    const createdPr = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${created.pullRequestId}`);
    linkWorkItemsToPr(config, repo, createdPr, workItemIds);
  }
}

function cmdPrUpdate(config, idRaw, args) {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]');
    process.exit(1);
  }

  const kv = Object.fromEntries(args.map((arg) => {
    const [k, ...rest] = arg.split('=');
    return [k.replace(/^--/, ''), rest.join('=')];
  }));

  const repo = pickRepo(config, kv.repo);
  const body = {};
  const workItemIds = parseWorkItemIds(kv['work-items']);

  if (kv.title !== undefined) body.title = kv.title;
  if (kv.description !== undefined) body.description = kv.description;

  if (Object.keys(body).length === 0 && workItemIds.length === 0) {
    console.error('Usage: pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]');
    process.exit(1);
  }

  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(repo)}/pullrequests/${id}`;
  let updated;

  if (Object.keys(body).length > 0) {
    updated = adoRequest(config, path, { method: 'PATCH', body });
    console.log(`Updated PR #${updated.pullRequestId}: ${updated.title}`);
  } else {
    updated = adoRequest(config, path);
  }

  if (workItemIds.length > 0) {
    linkWorkItemsToPr(config, repo, updated, workItemIds);
  }
}

function printHelp() {
  console.log(`Azure DevOps CLI\n\nCommands:\n  smoke\n  repos\n  branches [repo]\n  workitem-get <id> [--raw] [--expand=all|fields|links|relations]\n  workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]\n  workitem-comments <id> [top] [--top=<n>] [--order=asc|desc]\n  workitem-comment-add <id> --text="..." [--file=path]\n  workitem-comment-update <id> <commentId> --text="..." [--file=path]\n  prs [status] [top] [repo]\n  pr-get <id> [repo]\n  pr-create --title=... --source=... --target=... [--description=...] [--repo=...] [--work-items=123,456]\n  pr-update <id> [--title=...] [--description=...] [--repo=...] [--work-items=123,456]\n  pr-approve <id> [repo]\n  pr-autocomplete <id> [repo]\n  builds [top]\n`);
}

function main() {
  const [command = 'smoke', ...args] = process.argv.slice(2);

  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const config = getConfig();

  switch (command) {
    case 'smoke':
      cmdSmoke(config);
      break;
    case 'repos':
      cmdRepos(config);
      break;
    case 'branches':
      cmdBranches(config, args[0]);
      break;
    case 'workitem-get':
      cmdWorkItemGet(config, args[0], args.slice(1));
      break;
    case 'workitems-recent':
      cmdWorkItemsRecent(config, args);
      break;
    case 'workitem-comments':
      cmdWorkItemComments(config, args[0], args.slice(1));
      break;
    case 'workitem-comment-add':
      cmdWorkItemCommentAdd(config, args[0], args.slice(1));
      break;
    case 'workitem-comment-update':
      cmdWorkItemCommentUpdate(config, args[0], args[1], args.slice(2));
      break;
    case 'prs':
      cmdPrs(config, args[0], args[1], args[2]);
      break;
    case 'pr-get':
      cmdPrGet(config, args[0], args[1]);
      break;
    case 'pr-create':
      cmdPrCreate(config, args);
      break;
    case 'pr-update':
      cmdPrUpdate(config, args[0], args.slice(1));
      break;
    case 'pr-approve':
      cmdPrApprove(config, args[0], args[1]);
      break;
    case 'pr-autocomplete':
      cmdPrAutocomplete(config, args[0], args[1]);
      break;
    case 'builds':
      cmdBuilds(config, args[0]);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
