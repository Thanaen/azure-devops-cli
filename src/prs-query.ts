import type { ParsedPrsArgs } from "./types.ts";
import { parseOptionArgs } from "./workitems-query.ts";

function normalizeValue(value: string | boolean | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toBoundedTop(value: string | undefined, defaultValue = 10, maxValue = 50): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return defaultValue;
  return Math.min(Math.trunc(numeric), maxValue);
}

export function parsePrsArgs(args: string[] = []): ParsedPrsArgs {
  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(["tag"]);

  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      throw new Error(`Unknown option for prs: --${key}`);
    }
  }

  if (positionals.length > 3) {
    throw new Error("Usage: prs [status] [top] [repo] [--tag=<tag>]");
  }

  return {
    status: normalizeValue(positionals[0]) ?? "active",
    top: toBoundedTop(normalizeValue(positionals[1])),
    repo: normalizeValue(positionals[2]),
    tag: normalizeValue(options.tag),
  };
}

export function labelsContainTag(
  labels: Array<{ name?: string | null }> | undefined,
  tag: string,
): boolean {
  const normalizedTag = tag.trim().toLowerCase();
  if (normalizedTag.length === 0) return false;

  return (labels ?? []).some((label) => label.name?.trim().toLowerCase() === normalizedTag);
}
