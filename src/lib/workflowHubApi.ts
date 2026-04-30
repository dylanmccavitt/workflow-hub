export type AdapterStatus = "available" | "unavailable" | "not-configured" | "not-found";
export type EntityStatus = AdapterStatus;

export interface AdapterState {
  id: string;
  label: string;
  status: AdapterStatus;
  detail: string;
  recoverable: boolean;
  ownerIssue?: string;
}

export type LinearCacheStatus = "fresh" | "stale" | "error" | "not-configured" | "miss";

export interface LinearCacheState {
  status: LinearCacheStatus;
  stale: boolean;
  fetchedAt?: string;
  ageMs?: number;
  staleAfterMs?: number;
  error?: string;
}

export interface LinearIssueReference {
  id: string;
  identifier: string;
  title: string;
  url?: string;
  status?: string;
  statusType?: string;
}

export interface LinearAttachment {
  id: string;
  title?: string;
  subtitle?: string;
  url?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface LinearPullRequestAttachment extends LinearAttachment {
  provider: string;
  number?: number;
  branch?: string;
  status: string;
}

export interface LinearWorkpad {
  commentId: string;
  body: string;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    name?: string;
    email?: string;
  };
}

export interface LinearIssueDetails {
  linearId: string;
  identifier: string;
  title: string;
  status: string;
  statusType?: string;
  url?: string;
  priority?: number;
  priorityLabel?: string;
  labels: Array<{ id: string; name: string }>;
  parent?: LinearIssueReference;
  blockers: LinearIssueReference[];
  blockedIssues: LinearIssueReference[];
  links: LinearAttachment[];
  pullRequests: LinearPullRequestAttachment[];
  codexWorkpad?: LinearWorkpad;
  updatedAt?: string;
  cache: LinearCacheState;
}

export interface IssueApiState {
  issueId: string;
  source: "linear";
  status: EntityStatus;
  adapter: AdapterState;
  linear?: LinearIssueDetails;
  cache?: LinearCacheState;
}

export interface ProjectApiState {
  status: EntityStatus;
  adapter: AdapterState;
  projectId?: string;
  displayName?: string;
  canonicalPath?: string;
  canonicalBranch?: string;
  iosConfigured?: boolean;
  linear?: {
    teamKey?: string;
    projectId?: string;
    projectSlug?: string;
  };
}

export interface WorkspaceApiState {
  issueId: string;
  status: EntityStatus;
  found: boolean;
  adapter: AdapterState;
  projectId?: string;
  projectName?: string;
  path?: string;
  branch?: string;
  headSha?: string;
  remote?: string;
  dirty?: boolean;
  gitStatus?: string[];
}

export interface RunnerApiState {
  kind: "Symphony" | "Codex" | "Cursor SDK";
  role: string;
  status: EntityStatus;
  detail: string;
  adapter: AdapterState;
}

export interface ReviewApiState {
  target: "simulator" | "device";
  status: EntityStatus;
  detail: string;
  adapter: AdapterState;
}

export interface PullRequestApiState {
  provider: "GitHub";
  status: EntityStatus;
  detail: string;
  adapter: AdapterState;
}

export interface WorkflowIssueState {
  apiVersion: string;
  issue: IssueApiState;
  project: ProjectApiState;
  workspace: WorkspaceApiState;
  runners: RunnerApiState[];
  reviews: ReviewApiState[];
  pullRequests: PullRequestApiState[];
  adapters: AdapterState[];
}

export interface WorkflowHubApi {
  version: string;
  platform: string;
  issues: {
    getState(issueId: string): Promise<WorkflowIssueState>;
  };
}
