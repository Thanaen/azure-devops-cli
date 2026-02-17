#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

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

function adoRequest(config, path, { method = 'GET', body } = {}) {
  const url = `${config.collectionUrl}${path}${path.includes('?') ? '&' : '?'}api-version=${API_VERSION}`;

  const args = [
    '--silent',
    '--show-error',
    '--fail',
    '--insecure',
    '-u',
    `:${config.pat}`,
    '-H',
    'Content-Type: application/json',
    '-X',
    method,
    url,
  ];

  if (body) {
    args.push('--data', JSON.stringify(body));
  }

  const out = execFileSync('curl', args, { encoding: 'utf8' });
  return out ? JSON.parse(out) : null;
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
}

function getLatestWorkItem(config) {
  const wiql = {
    query: 'SELECT TOP 1 [System.Id] FROM WorkItems ORDER BY [System.ChangedDate] DESC',
  };

  const wiqlResult = adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/wiql`, {
    method: 'POST',
    body: wiql,
  });

  const id = wiqlResult?.workItems?.[0]?.id;
  if (!id) return null;

  return adoRequest(config, `/${encodePathSegment(config.project)}/_apis/wit/workitems/${id}`);
}

function getLatestPullRequest(config) {
  const path = `/${encodePathSegment(config.project)}/_apis/git/repositories/${encodePathSegment(config.repo)}/pullrequests?searchCriteria.status=all&$top=1`;
  const result = adoRequest(config, path);
  return result?.value?.[0] ?? null;
}

function printSummary(workItem, pullRequest) {
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

function main() {
  const command = process.argv[2] ?? 'smoke';
  if (command !== 'smoke') {
    console.error(`Unknown command "${command}". Supported: smoke`);
    process.exit(1);
  }

  const config = getConfig();
  const workItem = getLatestWorkItem(config);
  const pullRequest = getLatestPullRequest(config);
  printSummary(workItem, pullRequest);
}

main();
