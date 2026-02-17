#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const DEFAULT_COLLECTION_URL = 'https://devserver2/DefaultCollection';
const DEFAULT_PROJECT = 'UserLock';
const DEFAULT_REPO = 'Ulysse Interface';
const API_VERSION = '7.0';

function getConfig() {
  const pat = process.env.DEVOPS_PAT;
  if (!pat) {
    console.error('Missing DEVOPS_PAT environment variable.');
    process.exit(1);
  }

  return {
    pat,
    collectionUrl: process.env.ADO_COLLECTION_URL ?? DEFAULT_COLLECTION_URL,
    project: process.env.ADO_PROJECT ?? DEFAULT_PROJECT,
    repo: process.env.ADO_REPO ?? DEFAULT_REPO,
  };
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

function adoRequest(config, path, { method = 'GET', body } = {}) {
  const url = `${config.collectionUrl}${path}${path.includes('?') ? '&' : '?'}api-version=${API_VERSION}`;
  const args = [
    '--silent',
    '--show-error',
    '--insecure',
    '-u',
    `:${config.pat}`,
    '-H',
    'Content-Type: application/json',
    '-X',
    method,
    url,
    '--write-out',
    '\n__HTTP_STATUS__:%{http_code}',
  ];

  if (body) args.push('--data', JSON.stringify(body));

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

function cmdWorkItemGet(config, idRaw) {
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    console.error('Usage: workitem-get <id>');
    process.exit(1);
  }

  const result = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/workitems/${id}`);
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

function cmdWorkItemsRecent(config, topRaw = '10') {
  const top = Number(topRaw);
  const boundedTop = Number.isFinite(top) && top > 0 ? Math.min(top, 50) : 10;
  const wiql = {
    query: `SELECT [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC`,
  };

  const wiqlResult = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/wiql?$top=${boundedTop}`, {
    method: 'POST',
    body: wiql,
  });

  for (const wi of wiqlResult?.workItems ?? []) {
    console.log(wi.id);
  }
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

  if (!title || !source || !target) {
    console.error('Usage: pr-create --title=... --source=feature/x --target=develop [--description=...] [--repo=...]');
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
}

function printHelp() {
  console.log(`Azure DevOps CLI\n\nCommands:\n  smoke\n  repos\n  branches [repo]\n  workitem-get <id>\n  workitems-recent [top]\n  prs [status] [top] [repo]\n  pr-get <id> [repo]\n  pr-create --title=... --source=... --target=... [--description=...] [--repo=...]\n  pr-approve <id> [repo]\n  pr-autocomplete <id> [repo]\n  builds [top]\n`);
}

function main() {
  const config = getConfig();
  const [command = 'smoke', ...args] = process.argv.slice(2);

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
      cmdWorkItemGet(config, args[0]);
      break;
    case 'workitems-recent':
      cmdWorkItemsRecent(config, args[0]);
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
    case 'pr-approve':
      cmdPrApprove(config, args[0], args[1]);
      break;
    case 'pr-autocomplete':
      cmdPrAutocomplete(config, args[0], args[1]);
      break;
    case 'builds':
      cmdBuilds(config, args[0]);
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
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
