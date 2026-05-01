export type AdapterStatus = "available" | "unavailable" | "not-configured" | "not-found";
export type EntityStatus = AdapterStatus;
export type SymphonyNormalizedState = "queue" | "active" | "complete" | "blocked" | "failed" | "unknown";

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

export interface WorkflowEvent {
  sequence: number;
  id: string;
  issueId?: string;
  entityType: string;
  entityId: string;
  type: string;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowRunRecord {
  id: string;
  issueId: string;
  workspaceId?: string;
  runnerKind: "Symphony" | "Codex" | "Cursor SDK" | string;
  status: "running" | "finished" | "error" | "cancelled" | string;
  startedAt?: string;
  finishedAt?: string;
  summary?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LinearStatusAction {
  id: string;
  label: string;
  stateName: string;
  confirmationRequired: boolean;
  confirmationReason?: string;
}

export interface LinearIssueDetails {
  linearId: string;
  identifier: string;
  title: string;
  status: string;
  statusType?: string;
  url?: string;
  branchName?: string;
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
  events?: WorkflowEvent[];
  runs?: WorkflowRunRecord[];
}

export interface ProjectApiState {
  status: EntityStatus;
  adapter: AdapterState;
  projectId?: string;
  displayName?: string;
  canonicalPath?: string;
  canonicalBranch?: string;
  iosConfigured?: boolean;
  runners?: {
    cursor?: {
      model: string;
      configPath: string;
      apiKeyEnv?: string;
    };
  };
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
  config?: {
    model?: string;
    configPath?: string;
    apiKeyEnv?: string;
  };
  latestRun?: WorkflowRunRecord;
}

export interface SymphonyIssueState {
  identifier: string;
  issueId?: string;
  linearUrl?: string;
  linearStatus?: string;
  normalizedState: SymphonyNormalizedState;
  source: "endpoint" | "linear";
  reason: string;
  symphonyStatus?: string;
  workspacePath?: string;
  workerHost?: string;
  sessionId?: string;
  attempt?: number;
  dueAt?: string;
  startedAt?: string;
  lastEvent?: string;
  lastEventAt?: string;
  lastMessage?: string;
  lastError?: string;
  tokens?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface SymphonyApiState {
  status: EntityStatus;
  running: boolean;
  source: "endpoint" | "logs" | "none";
  endpoint?: string;
  generatedAt?: string;
  detail: string;
  counts: Record<SymphonyNormalizedState, number>;
  issues: SymphonyIssueState[];
  selectedIssue?: SymphonyIssueState;
  logs?: {
    root?: string;
    latestPath?: string;
    latestLine?: string;
    latestAt?: string;
  };
  adapter: AdapterState;
}

export interface ReviewApiState {
  target: "simulator" | "device";
  status: EntityStatus;
  detail: string;
  adapter: AdapterState;
}

export type PullRequestApiState = GitHubPullRequestApiState | GraphiteStackApiState;

export interface GitHubPullRequestApiState {
  provider: "GitHub";
  status: EntityStatus;
  detail: string;
  adapter: AdapterState;
  candidates?: PullRequestCandidate[];
  pullRequest?: GitHubPullRequestDetails;
}

export interface GraphiteStackApiState {
  provider: "Graphite";
  status: EntityStatus;
  detail: string;
  adapter: AdapterState;
  candidates?: PullRequestCandidate[];
  stack?: GraphiteStackDetails;
  deepLink?: string;
}

export interface PullRequestCandidate {
  source: string;
  label: string;
  number?: number;
  url?: string;
  branch?: string;
  repository?: {
    owner: string;
    repo: string;
  };
}

export interface GitHubPullRequestDetails {
  provider: "GitHub";
  owner: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  mergeable: string;
  mergeStateStatus: string;
  reviewDecision: string;
  baseRefName?: string;
  headRefName?: string;
  headRefOid?: string;
  author?: {
    login?: string;
    name?: string;
    isBot?: boolean;
  };
  matchedBy?: string;
  checks: GitHubCheckSummary;
  reviewComments: GitHubReviewComment[];
}

export interface GitHubCheckSummary {
  status: "none" | "success" | "pending" | "failing";
  total: number;
  passing: number;
  pending: number;
  failing: number;
  skipped: number;
  checks: GitHubCheck[];
}

export interface GitHubCheck {
  id?: string;
  databaseId?: number;
  name: string;
  state: "success" | "pending" | "failing" | "skipped" | "unknown";
  status: string;
  conclusion: string;
  detailsUrl?: string;
  startedAt?: string;
  completedAt?: string;
  annotations: GitHubCheckAnnotation[];
}

export interface GitHubCheckAnnotation {
  path?: string;
  startLine?: number;
  endLine?: number;
  level?: string;
  title?: string;
  message?: string;
  rawDetails?: string;
  url?: string;
}

export interface GitHubReviewComment {
  id?: string;
  kind: "inline" | "review" | "comment";
  author?: string;
  body: string;
  state?: string;
  path?: string;
  line?: number;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GraphiteStackDetails {
  provider: "Graphite";
  currentBranch: string;
  trunk?: string;
  position?: number;
  totalBranches: number;
  parent?: GraphiteStackBranch;
  children: GraphiteStackBranch[];
  branches: GraphiteStackBranch[];
  submitted: boolean;
  submitState: string;
  mergeState?: string;
  deepLink: string;
}

export interface GraphiteStackBranch {
  name: string;
  current: boolean;
  trunk: boolean;
  position?: number;
  prNumber?: number;
  githubUrl?: string;
  graphiteUrl?: string;
  submitState?: string;
  mergeState?: string;
}

export interface WorkflowIssueState {
  apiVersion: string;
  issue: IssueApiState;
  project: ProjectApiState;
  workspace: WorkspaceApiState;
  symphony?: SymphonyApiState;
  linearStatusActions: LinearStatusAction[];
  runners: RunnerApiState[];
  reviews: ReviewApiState[];
  pullRequests: PullRequestApiState[];
  adapters: AdapterState[];
}

export interface LinearIssueActionInput {
  issueId: string;
  actionId: string;
  confirmed: boolean;
  note?: string;
}

export interface LinearIssueActionResult {
  issueId: string;
  action: LinearStatusAction;
  previousStatus?: {
    id: string;
    name: string;
    type?: string;
  };
  status: {
    id: string;
    name: string;
    type?: string;
  };
  message: string;
  workpad: LinearWorkpad & {
    operation: "created" | "updated";
  };
  event: WorkflowEvent;
}

export interface ReviewFixPromptSelection {
  id: string;
  label: string;
  bodyPreview?: string;
  detail?: string;
  path?: string;
  line?: number;
  url?: string;
  annotationCount?: number;
  paths?: string[];
  detailsUrl?: string;
}

export interface ReviewFixPromptInput {
  issueId: string;
  selectedReviewCommentIds?: string[];
  selectedCheckIds?: string[];
  ownedPaths?: string[];
}

export interface SaveReviewFixPromptInput extends ReviewFixPromptInput {
  prompt: string;
}

export interface CursorRunInput {
  issueId: string;
  prompt: string;
  model?: string;
  dryRun?: boolean;
}

export interface CursorRunResult {
  issueId: string;
  dryRun: boolean;
  status: string;
  prompt: string;
  model: string;
  cwd: string;
  configPath: string;
  apiKeyEnv?: string;
  agentId?: string;
  runId?: string;
  summary?: string;
  streamedEventCount?: number;
  run?: WorkflowRunRecord;
  event?: WorkflowEvent;
}

export interface ReviewFixPromptDraft {
  issueId: string;
  title: string;
  prompt: string;
  generatedPrompt?: string;
  selectedReviewCommentIds: string[];
  selectedCheckIds: string[];
  availableReviewComments: ReviewFixPromptSelection[];
  availableCheckFailures: ReviewFixPromptSelection[];
  ownedPaths: string[];
  branch?: string;
  worktree?: string;
  headSha?: string;
  generatedAt: string;
  pullRequest?: {
    provider: "GitHub";
    number?: number;
    title?: string;
    url?: string;
    state?: string;
    reviewDecision?: string;
    checksStatus?: string;
  };
}

export interface ReviewFixPromptSaveResult extends ReviewFixPromptDraft {
  generatedPrompt: string;
  event: WorkflowEvent;
}

export interface WorkflowHubApi {
  version: string;
  platform: string;
  issues: {
    getState(issueId: string): Promise<WorkflowIssueState>;
    applyAction(input: LinearIssueActionInput): Promise<LinearIssueActionResult>;
    draftFixPrompt(input: ReviewFixPromptInput): Promise<ReviewFixPromptDraft>;
    saveFixPrompt(input: SaveReviewFixPromptInput): Promise<ReviewFixPromptSaveResult>;
    startCursorRun(input: CursorRunInput): Promise<CursorRunResult>;
  };
}
