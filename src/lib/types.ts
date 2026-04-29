export type IssueStatus =
  | "Ready"
  | "In Progress"
  | "Human Review"
  | "Needs Fixes"
  | "Merging"
  | "Blocked"
  | "Done";

export type RunnerKind = "Symphony" | "Codex" | "Cursor SDK";

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
}

export interface TimelineEvent {
  id: string;
  label: string;
  detail: string;
  tone: "neutral" | "success" | "warning" | "danger";
}
