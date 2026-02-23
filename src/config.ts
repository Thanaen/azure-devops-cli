import type { AdoConfig } from './types.ts';

const DEFAULT_COLLECTION_URL = 'https://dev.azure.com/<your-org>';
const DEFAULT_PROJECT = '<your-project>';
const DEFAULT_REPO = '<your-repository>';

function isDefaultPlaceholder(value: string): boolean {
  return value.includes('<your-');
}

export function getConfig(): AdoConfig {
  const pat = Bun.env.DEVOPS_PAT;
  if (!pat) {
    console.error('Missing DEVOPS_PAT environment variable.');
    process.exit(1);
  }

  const collectionUrl = Bun.env.ADO_COLLECTION_URL ?? DEFAULT_COLLECTION_URL;
  const project = Bun.env.ADO_PROJECT ?? DEFAULT_PROJECT;
  const repo = Bun.env.ADO_REPO ?? DEFAULT_REPO;

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
    insecureTls: Bun.env.ADO_INSECURE === '1',
  };
}
