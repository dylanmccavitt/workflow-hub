# Linear Track: Workflow Hub

Linear project: [Workflow Hub](https://linear.app/agentcee/project/workflow-hub-32ae906a2f1a)

Team: `dmcc`

Project ID: `50a8c298-e3fd-4617-bf7e-8db2cd7331b7`

Status: Planned

This track is the current scaffold for the full end-to-end build. It is intentionally subject to change as the app gets real implementation feedback.

## Milestones

- Phase 0: Foundation
- Phase 1: Worktree Review
- Phase 2: Workflow Visibility
- Phase 3: Runner Harness
- Phase 4: End-to-End Cockpit

## Parent Track

### AGE-346: [Workflow Hub] Track - Build local agent workflow cockpit

URL: <https://linear.app/agentcee/issue/AGE-346/workflow-hub-track-build-local-agent-workflow-cockpit>

Status: Backlog

Priority: High

Problem:

The current workflow spans Linear, Symphony, Codex, Cursor, Graphite/GitHub, Xcode, Simulator, and local worktrees. Reviewing or resuming work requires switching apps and manually finding the right worktree.

Acceptance criteria:

- Workflow Hub has a usable local desktop shell.
- The app can resolve issue IDs to worktrees.
- Symphony state is visible in the GUI.
- iOS simulator/device review can be launched from an issue.
- Linear and PR state are visible enough to drive review.
- Codex and Cursor SDK can be used as explicit runner backends.
- The full one issue / one branch / one worktree / one PR review loop is represented.

Constraints:

- One issue = one branch = one worktree = one Codex thread.
- Keep Linear as the issue source of truth.
- Keep git/PR providers as code-review source of truth.
- Keep local machine config and secrets out of git.
- Use explicit confirmation before mutating Linear, GitHub, local worktrees, or runner state from the GUI.

## Issue Map

### Phase 0: Foundation

#### AGE-347: [Foundation] Local project registry and config model

URL: <https://linear.app/agentcee/issue/AGE-347/foundation-local-project-registry-and-config-model>

Status: Ready

Priority: High

Purpose: Define the local project registry that maps repos, Linear projects, worktree roots, Xcode metadata, and review commands.

#### AGE-348: [Foundation] SQLite registry and event store

URL: <https://linear.app/agentcee/issue/AGE-348/foundation-sqlite-registry-and-event-store>

Status: Backlog

Priority: High

Purpose: Persist issues, worktrees, runs, PRs, events, screenshots, and local review evidence.

#### AGE-349: [Foundation] Local daemon and renderer API boundary

URL: <https://linear.app/agentcee/issue/AGE-349/foundation-local-daemon-and-renderer-api-boundary>

Status: Backlog

Priority: High

Purpose: Add the local API process that the Electron renderer uses for privileged actions.

### Phase 1: Worktree Review

#### AGE-350: [Worktree] Issue workspace resolver and open commands

URL: <https://linear.app/agentcee/issue/AGE-350/worktree-issue-workspace-resolver-and-open-commands>

Status: Backlog

Priority: High

Purpose: Resolve issue IDs to branch/worktree paths and open them in editor, terminal, Xcode, GitHub, or Graphite.

#### AGE-351: [iOS Review] Simulator launch from issue worktree

URL: <https://linear.app/agentcee/issue/AGE-351/ios-review-simulator-launch-from-issue-worktree>

Status: Backlog

Priority: High

Purpose: Build and launch iOS app changes in Simulator from the correct issue worktree with isolated DerivedData.

#### AGE-352: [iOS Review] Device review and Xcode launcher

URL: <https://linear.app/agentcee/issue/AGE-352/ios-review-device-review-and-xcode-launcher>

Status: Backlog

Priority: High

Purpose: Open the correct worktree project in Xcode and prepare real-device review without manual path hunting.

#### AGE-353: [iOS Review] Review evidence capture and screenshots

URL: <https://linear.app/agentcee/issue/AGE-353/ios-review-review-evidence-capture-and-screenshots>

Status: Backlog

Priority: Medium

Purpose: Capture simulator/device review evidence and attach it to the local timeline and handoff.

### Phase 2: Workflow Visibility

#### AGE-354: [Linear] Issue, project, and workpad sync

URL: <https://linear.app/agentcee/issue/AGE-354/linear-issue-project-and-workpad-sync>

Status: Backlog

Priority: High

Purpose: Pull Linear issues, projects, priorities, statuses, blockers, links, and Codex workpad content into the local model.

#### AGE-355: [Linear] Safe status transitions and workpad writes

URL: <https://linear.app/agentcee/issue/AGE-355/linear-safe-status-transitions-and-workpad-writes>

Status: Backlog

Priority: High

Purpose: Let the GUI perform explicit status transitions and append structured workpad updates safely.

#### AGE-356: [Symphony] State discovery and adapter

URL: <https://linear.app/agentcee/issue/AGE-356/symphony-state-discovery-and-adapter>

Status: Backlog

Priority: High

Purpose: Discover Symphony state sources and normalize queue, trigger, blocker, worker, and failure states.

#### AGE-357: [Symphony] Queue and worker timeline UI

URL: <https://linear.app/agentcee/issue/AGE-357/symphony-queue-and-worker-timeline-ui>

Status: Backlog

Priority: Medium

Purpose: Render Symphony runs and worker timelines inside the selected issue view.

#### AGE-358: [PR Review] GitHub PR and checks sync

URL: <https://linear.app/agentcee/issue/AGE-358/pr-review-github-pr-and-checks-sync>

Status: Backlog

Priority: High

Purpose: Pull PR URL, checks, review state, comments, and mergeability from GitHub.

#### AGE-359: [PR Review] Graphite stack visibility

URL: <https://linear.app/agentcee/issue/AGE-359/pr-review-graphite-stack-visibility>

Status: Backlog

Priority: Medium

Purpose: Show Graphite stack position and review state when available.

#### AGE-360: [PR Review] Fix prompt builder from PR and workpad context

URL: <https://linear.app/agentcee/issue/AGE-360/pr-review-fix-prompt-builder-from-pr-and-workpad-context>

Status: Backlog

Priority: Medium

Purpose: Generate a repair prompt from PR comments, Linear workpad context, and issue metadata.

### Phase 3: Runner Harness

#### AGE-361: [Cursor SDK] Local runner integration

URL: <https://linear.app/agentcee/issue/AGE-361/cursor-sdk-local-runner-integration>

Status: Backlog

Priority: Medium

Purpose: Add Cursor SDK as a local agent harness with streaming events and artifacts.

#### AGE-362: [Cursor SDK] Cloud runner and artifacts integration

URL: <https://linear.app/agentcee/issue/AGE-362/cursor-sdk-cloud-runner-and-artifacts-integration>

Status: Backlog

Priority: Medium

Purpose: Add Cursor SDK cloud-agent support and artifact surfacing once the local runner exists.

#### AGE-363: [Codex] Local runner adapter

URL: <https://linear.app/agentcee/issue/AGE-363/codex-local-runner-adapter>

Status: Backlog

Priority: High

Purpose: Keep Codex first-class by launching it from a selected issue worktree and capturing run metadata.

#### AGE-364: [Codex] MCP-style delegation surface for Cursor and Symphony

URL: <https://linear.app/agentcee/issue/AGE-364/codex-mcp-style-delegation-surface-for-cursor-and-symphony>

Status: Backlog

Priority: Medium

Purpose: Define an explicit tool surface so Cursor and Symphony can dispatch Codex intentionally without pretending Codex is a Cursor subagent.

#### AGE-365: [Runners] Unified run timeline and cancellation model

URL: <https://linear.app/agentcee/issue/AGE-365/runners-unified-run-timeline-and-cancellation-model>

Status: Backlog

Priority: High

Purpose: Normalize run events, status, logs, cancellation, retries, and artifacts across Symphony, Codex, and Cursor.

### Phase 4: End-to-End Cockpit

#### AGE-366: [UI] Codex-style dashboard backed by local API

URL: <https://linear.app/agentcee/issue/AGE-366/ui-codex-style-dashboard-backed-by-local-api>

Status: Backlog

Priority: High

Purpose: Replace static demo data with local API data in the main Electron dashboard.

#### AGE-367: [UI] Command bar and action confirmation flow

URL: <https://linear.app/agentcee/issue/AGE-367/ui-command-bar-and-action-confirmation-flow>

Status: Backlog

Priority: High

Purpose: Add command palette actions for issue open, review, runner dispatch, status changes, and merge flow with explicit confirmations.

#### AGE-368: [Flow] Ready to worker dispatch loop

URL: <https://linear.app/agentcee/issue/AGE-368/flow-ready-to-worker-dispatch-loop>

Status: Backlog

Priority: High

Purpose: Drive the flow from Ready issue to worktree creation, runner dispatch, and active timeline state.

#### AGE-369: [Flow] Human review and Needs Fixes loop

URL: <https://linear.app/agentcee/issue/AGE-369/flow-human-review-and-needs-fixes-loop>

Status: Backlog

Priority: High

Purpose: Support the review-ready card, simulator/device review, review notes, Needs Fixes transition, and re-dispatch loop.

#### AGE-370: [Flow] Merge, sync main, and handoff closeout

URL: <https://linear.app/agentcee/issue/AGE-370/flow-merge-sync-main-and-handoff-closeout>

Status: Backlog

Priority: High

Purpose: Represent final merge, local main sync, handoff update, evidence capture, and Done transition.

#### AGE-371: [Security] Local permissions and secret handling guardrails

URL: <https://linear.app/agentcee/issue/AGE-371/security-local-permissions-and-secret-handling-guardrails>

Status: Backlog

Priority: High

Purpose: Guard local command execution, secrets, tokens, and mutating actions.

#### AGE-372: [Packaging] Local desktop packaging and startup polish

URL: <https://linear.app/agentcee/issue/AGE-372/packaging-local-desktop-packaging-and-startup-polish>

Status: Backlog

Priority: Medium

Purpose: Package the desktop app for local daily use and smooth startup.

#### AGE-373: [Docs] Operator guide and next-thread handoff workflow

URL: <https://linear.app/agentcee/issue/AGE-373/docs-operator-guide-and-next-thread-handoff-workflow>

Status: Backlog

Priority: Medium

Purpose: Document daily operation, project config, issue startup, review, merge, and handoff workflow.

## Dependency Graph

- AGE-348 is blocked by AGE-347.
- AGE-349 is blocked by AGE-347 and AGE-348.
- AGE-350 is blocked by AGE-347.
- AGE-351 is blocked by AGE-349 and AGE-350.
- AGE-352 is blocked by AGE-350.
- AGE-353 is blocked by AGE-348, AGE-351, and AGE-352.
- AGE-354 is blocked by AGE-348 and AGE-349.
- AGE-355 is blocked by AGE-354 and AGE-349.
- AGE-356 is blocked by AGE-348 and AGE-349.
- AGE-357 is blocked by AGE-356 and AGE-366.
- AGE-358 is blocked by AGE-348, AGE-349, and AGE-354.
- AGE-359 is blocked by AGE-358.
- AGE-360 is blocked by AGE-354, AGE-358, and AGE-359.
- AGE-361 is blocked by AGE-349 and AGE-350.
- AGE-362 is blocked by AGE-361.
- AGE-363 is blocked by AGE-349 and AGE-350.
- AGE-364 is blocked by AGE-361 and AGE-363.
- AGE-365 is blocked by AGE-348, AGE-356, AGE-361, and AGE-363.
- AGE-366 is blocked by AGE-348, AGE-349, AGE-354, AGE-356, and AGE-358.
- AGE-371 is blocked by AGE-349.
- AGE-367 is blocked by AGE-366 and AGE-371.
- AGE-368 is blocked by AGE-350, AGE-355, AGE-361, AGE-363, and AGE-365.
- AGE-369 is blocked by AGE-351, AGE-352, AGE-353, AGE-357, AGE-360, and AGE-368.
- AGE-370 is blocked by AGE-358, AGE-359, AGE-369, and AGE-371.
- AGE-372 is blocked by AGE-370, AGE-371, and AGE-373.
- AGE-373 is blocked by AGE-369 and AGE-370.

## Starting Point

Start with `AGE-347` because it is the first Ready issue and it unblocks the local registry, worktree resolver, storage, daemon boundary, and downstream review flows.
