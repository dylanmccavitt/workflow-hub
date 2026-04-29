# Linear Track Draft: Workflow Hub

Team: `dmcc`

Project name: `Workflow Hub`

Project summary: Local-first desktop control plane for Linear, Symphony, Codex, Cursor SDK, Graphite/GitHub, worktree management, and iOS simulator/device review.

## Parent Track

### [Workflow Hub] Build local agent workflow cockpit

Problem:

The current workflow spans Linear, Symphony, Codex, Cursor, Graphite/GitHub, Xcode, Simulator, and local worktrees. Reviewing or resuming work requires switching apps and manually finding the right worktree.

Acceptance criteria:

- Workflow Hub has a usable local desktop shell.
- The app can resolve issue IDs to worktrees.
- Symphony state is visible in the GUI.
- iOS simulator/device review can be launched from an issue.
- Linear and PR state are visible enough to drive review.
- Codex and Cursor SDK can be used as explicit runner backends.

Constraints:

- One issue = one branch = one worktree = one PR review.
- Keep Linear as the issue source of truth.
- Keep git/PR providers as code-review source of truth.
- Keep local machine config out of git.

Priority: High

Initial status: Backlog

## Child Issues

### 1. Workflow Hub: local registry and worktree resolver

Blocks: issues 2, 3, 4, 5, 6, 7, 8, 9

Problem:

The GUI needs a reliable way to map Linear issue IDs to repo paths, worktrees, branches, and local project metadata.

Acceptance criteria:

- Add project registry config.
- Scan configured Symphony and Codex worktree roots.
- Resolve `AGE-310 -> worktree path`.
- Show branch and dirty git status.
- Provide `workflow status`, `workflow open`, and `workflow review` CLI commands.

Priority: High

Initial status: Ready

### 2. Workflow Hub: Electron shell and Codex-style dashboard MVP

Blocked by: issue 1

Problem:

The user needs a centralized GUI that feels closer to Codex than to a generic admin dashboard.

Acceptance criteria:

- Electron app launches locally.
- Left rail, issue list, issue timeline, inspector, and command bar exist.
- UI uses real local API data where available and static fallback data otherwise.
- Buttons are wired to backend command endpoints for open/review actions.

Priority: High

Initial status: Backlog

### 3. Workflow Hub: Symphony visibility adapter

Blocked by: issue 1

Problem:

Symphony currently runs as hidden orchestration. The GUI needs to show queue, dispatch, worker, trigger, and blocker state.

Acceptance criteria:

- Detect whether Symphony is running.
- Read available Symphony state/log endpoint or local state files.
- Normalize Symphony states for the GUI.
- Show active, finished, blocked, and failed runs per issue.
- Link Symphony run state back to Linear issue/workpad and worktree.

Priority: High

Initial status: Backlog

### 4. Workflow Hub: iOS review CLI for simulator and device launch

Blocked by: issue 1

Problem:

iOS review is slow because the reviewer must manually find the issue worktree, open the right Xcode project, and build/run.

Acceptance criteria:

- `workflow review <issue> --sim` builds and launches from the issue worktree.
- Simulator builds use isolated DerivedData.
- `workflow review <issue> --device` opens the right worktree project in Xcode and prepares device review.
- Local Firebase/config preservation is documented and enforced before review.

Priority: High

Initial status: Backlog

### 5. Workflow Hub: Linear issue and workpad sync

Blocked by: issue 1

Problem:

The GUI needs live Linear issue state, workpad context, links, priorities, and status actions.

Acceptance criteria:

- Pull issues for configured Linear projects.
- Read title, status, priority, labels, parent, blockers, and links.
- Read `## Codex Workpad` when present.
- Move issues through `Ready`, `In Progress`, `Human Review`, `Needs Fixes`, `Merging`, `Done`, and `Blocked` through explicit actions.

Priority: High

Initial status: Backlog

### 6. Workflow Hub: Cursor SDK runner integration

Blocked by: issues 1 and 2

Problem:

Cursor SDK is a good harness candidate for local/cloud agents, subagents, streaming run state, and artifacts.

Acceptance criteria:

- Add Cursor SDK local runner.
- Add Cursor SDK cloud runner configuration path.
- Stream run events into the GUI.
- Persist run IDs and status.
- Show artifacts when available.

Priority: Medium

Initial status: Backlog

### 7. Workflow Hub: Codex runner adapter

Blocked by: issue 1

Problem:

Codex should remain a first-class runner even if Cursor SDK is used for the harness layer.

Acceptance criteria:

- Launch Codex from a specific issue worktree.
- Store run metadata and logs.
- Report status back to the GUI.
- Prepare an MCP-style tool surface so Cursor/Symphony can dispatch Codex intentionally later.

Priority: Medium

Initial status: Backlog

### 8. Workflow Hub: GitHub and Graphite review panel

Blocked by: issues 1 and 5

Problem:

Review state is split across GitHub, Graphite, CI, comments, and PR links.

Acceptance criteria:

- Show PR URL, status, checks, and review comments.
- Show Graphite stack position when available.
- Open Graphite/GitHub from the selected issue.
- Build a fix prompt from PR comments plus Linear workpad.

Priority: Medium

Initial status: Backlog

### 9. Workflow Hub: end-to-end human review flow

Blocked by: issues 2, 3, 4, 5, 6, 7, and 8

Problem:

The complete daily workflow needs to work from one screen.

Acceptance criteria:

- Issue enters `Human Review`.
- GUI shows a review-ready card.
- Reviewer can run simulator/device from the correct worktree.
- Reviewer can mark `Needs Fixes` with notes.
- Symphony/Codex/Cursor can resume the right issue workspace.
- PR can move to merge with evidence attached.

Priority: High

Initial status: Backlog
