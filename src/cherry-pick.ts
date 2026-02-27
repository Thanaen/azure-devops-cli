export interface CherryPickArgs {
  prId: number;
  target: string;
  topic?: string;
  repo?: string;
}

export function parseCherryPickArgs(args: string[]): CherryPickArgs {
  const kv = Object.fromEntries(
    args
      .filter((a) => a.startsWith("--"))
      .map((arg) => {
        const [k, ...rest] = arg.split("=");
        return [k!.replace(/^--/, ""), rest.join("=")] as [string, string];
      }),
  );

  const positionals = args.filter((a) => !a.startsWith("--"));
  const prId = Number(positionals[0]);

  if (!Number.isFinite(prId) || prId <= 0) {
    throw new Error("A valid pull request ID is required as the first argument.");
  }

  const target = kv.target;
  if (!target || target.trim().length === 0) {
    throw new Error("--target is required.");
  }

  const allowedOptions = new Set(["target", "topic", "repo"]);
  for (const key of Object.keys(kv)) {
    if (!allowedOptions.has(key)) {
      throw new Error(`Unknown option: --${key}`);
    }
  }

  return {
    prId,
    target: target.trim(),
    topic: kv.topic?.trim() || undefined,
    repo: kv.repo?.trim() || undefined,
  };
}

export function buildGeneratedRefName(prId: number, target: string, topic?: string): string {
  if (topic) {
    return topic.startsWith("refs/heads/") ? topic : `refs/heads/${topic}`;
  }
  const safeBranch = target.replace(/^refs\/heads\//, "");
  return `refs/heads/cherry-pick-pr-${prId}-onto-${safeBranch}`;
}
