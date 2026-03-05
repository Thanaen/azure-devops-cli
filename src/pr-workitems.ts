export function parseWorkItemIds(rawValue: string | null | undefined): number[] {
  if (!rawValue) return [];

  const ids = rawValue
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0);

  return [...new Set(ids)];
}

export function parsePrTags(rawValue: string | null | undefined): string[] {
  if (!rawValue) return [];

  const tags = rawValue
    .split(",")
    .map((part) => part.trim())
    .filter((tag) => tag.length > 0);

  return [...new Set(tags)];
}

export function buildPullRequestArtifactUrl(
  pr:
    | { pullRequestId?: number; repository?: { id?: string; project?: { id?: string } } }
    | null
    | undefined,
): string | null {
  const projectId = pr?.repository?.project?.id;
  const repoId = pr?.repository?.id;
  const prId = pr?.pullRequestId;

  if (!projectId || !repoId || !prId) return null;
  return `vstfs:///Git/PullRequestId/${projectId}%2F${repoId}%2F${prId}`;
}
