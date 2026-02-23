export interface AdoConfig {
  pat: string;
  collectionUrl: string;
  project: string;
  repo: string;
  insecureTls: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AdoRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  contentType?: string;
  apiVersion?: string;
}

export interface AdoListResponse<T> {
  count?: number;
  value?: T[];
}

export interface AdoIdentityRef {
  displayName?: string;
  id?: string;
}

export interface AdoWorkItem {
  id?: number;
  rev?: number;
  fields?: Record<string, unknown>;
  relations?: AdoWorkItemRelation[];
  url?: string;
}

export interface AdoWorkItemRelation {
  rel?: string;
  url?: string;
  attributes?: Record<string, unknown>;
}

export interface AdoWiqlResult {
  workItems?: { id: number; url?: string }[];
}

export interface AdoPullRequest {
  pullRequestId?: number;
  title?: string;
  description?: string;
  status?: string;
  createdBy?: AdoIdentityRef;
  sourceRefName?: string;
  targetRefName?: string;
  repository?: AdoRepository;
  url?: string;
}

export interface AdoRepository {
  id?: string;
  name?: string;
  project?: { id?: string; name?: string };
}

export interface AdoGitRef {
  name?: string;
  objectId?: string;
}

export interface AdoBuild {
  id?: number;
  status?: string;
  result?: string;
  definition?: { name?: string };
  sourceBranch?: string;
}

export interface AdoComment {
  id?: number;
  text?: string;
  createdBy?: AdoIdentityRef;
  createdDate?: string;
  modifiedBy?: AdoIdentityRef;
  modifiedDate?: string;
}

export interface AdoCommentList {
  totalCount?: number;
  count?: number;
  comments?: AdoComment[];
}

export interface AdoPolicyConfiguration {
  id?: number;
  isEnabled?: boolean;
  isBlocking?: boolean;
  type?: { displayName?: string };
  settings?: { scope?: AdoPolicyScope[] };
}

export interface AdoPolicyScope {
  repositoryId?: string;
  refName?: string;
  matchKind?: string;
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
