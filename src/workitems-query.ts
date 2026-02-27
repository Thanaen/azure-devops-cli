import type { ParsedOptions, ParsedWorkItemsRecentArgs, WorkItemFilters } from "./types.ts";

export function escapeWiqlLiteral(value: string): string {
  return String(value).replaceAll("'", "''");
}

function normalizeFilterValue(value: string | boolean | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toBoundedTop(
  value: string | boolean | undefined,
  defaultValue = 10,
  maxValue = 50,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return defaultValue;
  return Math.min(Math.trunc(numeric), maxValue);
}

export function parseOptionArgs(args: string[] = []): ParsedOptions {
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]!;

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const eqIndex = arg.indexOf("=");
    if (eqIndex >= 0) {
      const key = arg.slice(2, eqIndex);
      const value = arg.slice(eqIndex + 1);
      options[key] = value;
      continue;
    }

    const key = arg.slice(2);
    const next = args[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }

  return { options, positionals };
}

export function parseWorkItemsRecentArgs(args: string[] = []): ParsedWorkItemsRecentArgs {
  const { options, positionals } = parseOptionArgs(args);
  const allowedOptions = new Set(["top", "tag", "type", "state"]);

  for (const key of Object.keys(options)) {
    if (!allowedOptions.has(key)) {
      throw new Error(`Unknown option for workitems-recent: --${key}`);
    }
  }

  if (positionals.length > 1) {
    throw new Error(
      "Usage: workitems-recent [top] [--tag=<tag>] [--type=<work-item-type>] [--state=<state>]",
    );
  }

  const topCandidate = options.top ?? positionals[0] ?? "10";
  const top = toBoundedTop(topCandidate);

  const tag = normalizeFilterValue(options.tag);
  const type = normalizeFilterValue(options.type);
  const state = normalizeFilterValue(options.state);

  return {
    top,
    filters: {
      tag,
      type,
      state,
    },
  };
}

export function buildRecentWorkItemsWiql(filters: WorkItemFilters = {}): string {
  const clauses: string[] = [];

  if (filters.type) {
    clauses.push(`[System.WorkItemType] = '${escapeWiqlLiteral(filters.type)}'`);
  }

  if (filters.state) {
    clauses.push(`[System.State] = '${escapeWiqlLiteral(filters.state)}'`);
  }

  if (filters.tag) {
    clauses.push(`[System.Tags] CONTAINS '${escapeWiqlLiteral(filters.tag)}'`);
  }

  const whereClause = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  return `SELECT [System.Id] FROM WorkItems${whereClause} ORDER BY [System.ChangedDate] DESC`;
}
