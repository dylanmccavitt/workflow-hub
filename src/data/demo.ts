import type { IssueCard, TimelineEvent } from "../lib/types";

export const issues: IssueCard[] = [
  {
    id: "AGE-310",
    title: "Grove species picker UI",
    repo: "chores",
    status: "Human Review",
    runner: "Symphony",
    branch: "feat/age-310-grove-species-picker",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/chores/AGE-310",
    pr: "#27",
    graph: "stack: grove-v1",
    lastEvent: "Simulator review ready",
    buildTarget: "Simulator",
    risk: "medium"
  },
  {
    id: "AGE-345",
    title: "Refresh app icon and launch assets",
    repo: "chores",
    status: "In Progress",
    runner: "Codex",
    branch: "feat/age-345-assets-refresh",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/chores/AGE-345",
    pr: "#42",
    graph: "stack: still-havent",
    lastEvent: "Waiting on screenshot evidence",
    buildTarget: "Device",
    risk: "medium"
  },
  {
    id: "AGE-335",
    title: "Define Pulse parallel-agent workflow",
    repo: "pulse",
    status: "Done",
    runner: "Cursor SDK",
    branch: "feat/age-335-parallel-agent-workflow",
    worktree: "/Users/dylanmccavitt/.codex/worktrees/pulse/AGE-335",
    pr: "#31",
    lastEvent: "Merged and synced",
    buildTarget: "None",
    risk: "low"
  }
];

export const timeline: TimelineEvent[] = [
  {
    id: "1",
    label: "Symphony queued work",
    detail: "Issue moved from Ready to In Progress and workspace was created.",
    tone: "success"
  },
  {
    id: "2",
    label: "Codex run completed",
    detail: "Branch pushed, PR opened, and checks were attached to the workpad.",
    tone: "success"
  },
  {
    id: "3",
    label: "Human Review",
    detail: "Run Simulator is available from the issue worktree.",
    tone: "warning"
  }
];
