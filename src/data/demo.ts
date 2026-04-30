import type {
  AcceptanceCriterion,
  DailyFlowStep,
  IssueCard,
  RunnerBackend,
  SystemSignal,
  TimelineEvent
} from "../lib/types";

export const issues: IssueCard[] = [
  {
    id: "AGE-346",
    title: "Build local agent workflow cockpit",
    repo: "workflow-hub",
    status: "In Progress",
    runner: "Symphony",
    branch: "feat/age-346-workflow-cockpit",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-346",
    lastEvent: "Parent track active; foundation issues are merged",
    buildTarget: "None",
    risk: "medium",
    phase: "Track",
    summary: "Owns the full daily loop and keeps child slices aligned without replacing Linear, PRs, or Symphony."
  },
  {
    id: "AGE-349",
    title: "Local daemon and renderer API boundary",
    repo: "workflow-hub",
    status: "Backlog",
    runner: "Codex",
    branch: "feat/age-349-local-api-boundary",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-349",
    lastEvent: "Next foundation dependency",
    buildTarget: "None",
    risk: "medium",
    phase: "Foundation",
    summary: "Adds the privileged local API surface that future adapters and renderer actions should use."
  },
  {
    id: "AGE-350",
    title: "Issue workspace resolver and open commands",
    repo: "workflow-hub",
    status: "Backlog",
    runner: "Codex",
    branch: "feat/age-350-workspace-resolver",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-350",
    lastEvent: "Blocked behind foundation",
    buildTarget: "None",
    risk: "medium",
    phase: "Worktree Review",
    summary: "Turns project config into openable issue workspaces for editor, terminal, Xcode, and review."
  },
  {
    id: "AGE-354",
    title: "Issue, project, and workpad sync",
    repo: "workflow-hub",
    status: "Needs Fixes",
    runner: "Codex",
    branch: "feat/age-354-linear-sync",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-354",
    lastEvent: "PR #6 is open for review with Linear cache data available",
    buildTarget: "None",
    risk: "medium",
    phase: "Workflow Visibility",
    summary: "Pulls Linear metadata, linked PRs, blockers, labels, and Codex Workpad content into the local model."
  },
  {
    id: "AGE-356",
    title: "Symphony state discovery and adapter",
    repo: "workflow-hub",
    status: "Backlog",
    runner: "Symphony",
    branch: "feat/age-356-symphony-adapter",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-356",
    lastEvent: "Waiting on local API and registry",
    buildTarget: "None",
    risk: "medium",
    phase: "Workflow Visibility",
    summary: "Normalizes queue, trigger, blocker, worker, and failure state for the issue view."
  },
  {
    id: "AGE-363",
    title: "Codex local runner adapter",
    repo: "workflow-hub",
    status: "Backlog",
    runner: "Codex",
    branch: "feat/age-363-codex-runner",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-363",
    lastEvent: "Waiting on resolver and local API",
    buildTarget: "None",
    risk: "medium",
    phase: "Runner Harness",
    summary: "Keeps Codex first-class as an explicit runner backend from a selected issue worktree."
  },
  {
    id: "AGE-369",
    title: "Human review and Needs Fixes loop",
    repo: "workflow-hub",
    status: "Backlog",
    runner: "Cursor SDK",
    branch: "feat/age-369-human-review-loop",
    worktree: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-369",
    lastEvent: "Depends on review controls and runner timeline",
    buildTarget: "Simulator",
    risk: "medium",
    phase: "End-to-End Cockpit",
    summary: "Connects review-ready state, simulator/device review, notes, and re-dispatch."
  }
];

export const acceptanceCriteria: AcceptanceCriterion[] = [
  {
    id: "desktop-shell",
    label: "Local Electron shell launches",
    status: "Done",
    ownerIssue: "AGE-346",
    detail: "Electron/Vite shell exists; this pass keeps it as the first screen."
  },
  {
    id: "workspace-resolver",
    label: "Resolve issue IDs to worktrees and branches",
    status: "In Progress",
    ownerIssue: "AGE-350",
    detail: "CLI resolver exists; the Electron bridge now reads the selected issue workspace."
  },
  {
    id: "symphony-state",
    label: "Expose Symphony state visibly",
    status: "Planned",
    ownerIssue: "AGE-356",
    detail: "Dashboard reserves a visible Symphony lane; adapter work remains separate."
  },
  {
    id: "ios-review",
    label: "Launch simulator/device review from issue worktree",
    status: "Planned",
    ownerIssue: "AGE-351 / AGE-352",
    detail: "Review actions stay explicit and issue-worktree scoped."
  },
  {
    id: "review-sync",
    label: "Sync Linear, GitHub, and Graphite review state",
    status: "Planned",
    ownerIssue: "AGE-354 / AGE-358 / AGE-359",
    detail: "Source-of-truth boundaries are visible before adapters are wired."
  },
  {
    id: "runner-backends",
    label: "Codex and Cursor SDK are explicit runner backends",
    status: "Planned",
    ownerIssue: "AGE-361 / AGE-363",
    detail: "Runner choices are shown side by side instead of hiding one behind another."
  },
  {
    id: "daily-flow",
    label: "Daily Ready -> Done loop is represented",
    status: "In Progress",
    ownerIssue: "AGE-368 / AGE-369 / AGE-370",
    detail: "The cockpit shows the routing states, review fork, and merge closeout path."
  }
];

export const dailyFlow: DailyFlowStep[] = [
  {
    label: "Ready",
    status: "Done",
    detail: "Linear issue is the dispatch trigger."
  },
  {
    label: "Worker",
    status: "In Progress",
    detail: "One issue maps to one branch and one worktree."
  },
  {
    label: "PR",
    status: "Planned",
    detail: "GitHub/Graphite remain review source of truth."
  },
  {
    label: "Human Review",
    status: "Planned",
    detail: "Reviewer opens simulator, device, PR, and workpad from the issue."
  },
  {
    label: "Needs Fixes / Merging",
    status: "Planned",
    detail: "Feedback returns to the same PR unless a follow-up issue is required."
  },
  {
    label: "Done",
    status: "Planned",
    detail: "Merge, sync canonical main, close Linear, and preserve handoff evidence."
  }
];

export const systemSignals: SystemSignal[] = [
  {
    label: "Linear",
    value: "Source of truth",
    detail: "Issue state, priority, blockers, and workpad stay in Linear.",
    tone: "success"
  },
  {
    label: "Symphony",
    value: "Dispatch state",
    detail: "Queue and worker status remain inspectable instead of hidden behind a runner.",
    tone: "warning"
  },
  {
    label: "GitHub / Graphite",
    value: "Review source",
    detail: "PR review, checks, stack position, and mergeability stay external.",
    tone: "neutral"
  },
  {
    label: "SQLite registry",
    value: "Rebuildable cache",
    detail: "Local cache accelerates reads but never becomes the only workflow record.",
    tone: "success"
  }
];

export const runnerBackends: RunnerBackend[] = [
  {
    name: "Symphony",
    role: "Workflow queue",
    state: "Visible",
    detail: "Owns issue dispatch and active-state routing."
  },
  {
    name: "Codex",
    role: "Local worker",
    state: "First-class",
    detail: "Runs from the issue worktree with branch/workpad context."
  },
  {
    name: "Cursor SDK",
    role: "Agent harness",
    state: "Planned",
    detail: "Separate backend with its own events and artifacts."
  }
];

export const timeline: TimelineEvent[] = [
  {
    id: "1",
    label: "AGE-346 activated",
    detail: "The parent track moved to In Progress and now has a single Codex workpad.",
    tone: "success"
  },
  {
    id: "2",
    label: "Foundation landed",
    detail: "AGE-347 project config and AGE-348 SQLite registry are merged into origin/main.",
    tone: "success"
  },
  {
    id: "3",
    label: "Next dependency",
    detail: "AGE-349 should add the local API boundary before adapter-backed UI actions expand.",
    tone: "warning"
  }
];
