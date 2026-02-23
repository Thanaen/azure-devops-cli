import type { WebApi } from "azure-devops-node-api";

export interface AdoConfig {
  pat: string;
  collectionUrl: string;
  project: string;
  repo: string;
  connection: WebApi;
}

export interface ParsedOptions {
  options: Record<string, string | boolean>;
  positionals: string[];
}

export interface WorkItemFilters {
  tag?: string;
  type?: string;
  state?: string;
}

export interface ParsedWorkItemsRecentArgs {
  top: number;
  filters: WorkItemFilters;
}
