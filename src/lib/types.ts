export type IssueStatus =
  | "Backlog"
  | "Ready"
  | "In Progress"
  | "Human Review"
  | "Needs Fixes"
  | "Merging"
  | "Blocked"
  | "Done";

export type RunnerKind = "Symphony" | "Codex" | "Cursor SDK";
export type CriterionStatus = "Done" | "In Progress" | "Planned" | "Blocked";
export type Tone = "neutral" | "success" | "warning" | "danger";

export interface IssueCard {
  id: string;
  title: string;
  repo: string;
  status: IssueStatus;
  runner: RunnerKind;
  branch: string;
  worktree: string;
  pr?: string;
  graph?: string;
  lastEvent: string;
  buildTarget: "Simulator" | "Device" | "None";
  risk: "low" | "medium" | "high";
  phase: string;
  summary: string;
}

export interface TimelineEvent {
  id: string;
  label: string;
  detail: string;
  tone: Tone;
}

export interface AcceptanceCriterion {
  id: string;
  label: string;
  status: CriterionStatus;
  ownerIssue: string;
  detail: string;
}

export interface DailyFlowStep {
  label: string;
  status: CriterionStatus;
  detail: string;
}

export interface SystemSignal {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}

export interface RunnerBackend {
  name: RunnerKind;
  role: string;
  state: string;
  detail: string;
}

export interface ResolvedWorkspace {
  issueId: string;
  found: boolean;
  projectId?: string;
  projectName?: string;
  path?: string;
  branch?: string;
  headSha?: string;
  remote?: string;
  dirty?: boolean;
  gitStatus?: string[];
  error?: string;
}
