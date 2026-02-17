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

  if (body) {
    args.push('--data', JSON.stringify(body));
  }

  const result = spawnSync('curl', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  if (result.error) {
    throw new Error(`curl failed to execute: ${result.error.message}`);
  }

  const raw = result.stdout ?? '';
  const marker = '\n__HTTP_STATUS__:';
  const markerIndex = raw.lastIndexOf(marker);
  const responseBody = markerIndex >= 0 ? raw.slice(0, markerIndex) : raw;
  const statusCode = markerIndex >= 0 ? Number(raw.slice(markerIndex + marker.length).trim()) : NaN;

  if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
    const preview = (responseBody || result.stderr || '').trim().slice(0, 300);
    throw new Error(`Azure DevOps API request failed (${Number.isFinite(statusCode) ? statusCode : 'unknown status'}). ${preview}`);
  }

  return responseBody ? JSON.parse(responseBody) : null;
}

function encodePathSegment(value) {
  return encodeURIComponent(value).replaceAll('%2F', '/');
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
