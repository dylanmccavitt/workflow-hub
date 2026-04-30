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

export interface IssueApiState {
  issueId: string;
  source: "linear";
  status: EntityStatus;
  adapter: AdapterState;
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
