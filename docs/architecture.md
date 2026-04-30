# Architecture

## Current System Shape

Workflow Hub is a local-first Electron app with a React/Vite renderer and a small Electron shell.

The app will grow into three layers:

1. Desktop UI: Codex-style workspace for issue review, runner state, PR state, and iOS controls.
2. Local hub daemon: adapters for Linear, Symphony, Codex, Cursor SDK, GitHub, Graphite, git, and iOS review commands.
3. Local registry: SQLite cache for projects, issues, workspaces, runs, PRs, review sessions, and events.

The current scaffold includes the UI shell, a local CLI stub, project docs, a Node-side SQLite registry module, a Linear project issue sync adapter, safe explicit Linear status/workpad write actions, a passive Symphony state adapter, a read-only GitHub PR/check/review adapter, and a main-process local API service for resolving selected issue state through typed IPC. Codex, Cursor SDK, and review-control adapters are represented as explicit unavailable adapter state until the owned follow-up issues wire those systems.

## Major Components

- `electron/main.cjs`: Creates the desktop window, controls external-link handling, and registers the local API IPC boundary. Native-backed cache/provider reads run through the repo CLI under the system Node runtime so Electron does not load Node-ABI native modules directly.
- `electron/preload.cjs`: Exposes a minimal safe `workflowHub.issues.getState(issueId)` bridge to the renderer without broad filesystem, shell, or arbitrary IPC access.
- `scripts/lib/local-api-service.mjs`: Node-side service layer for project, issue, workspace, runner, review, and PR state contracts. It owns project config reads, scoped git probes, and unavailable-adapter responses.
- `scripts/lib/linear-sync.mjs`: Read-only Linear GraphQL adapter that pulls configured project issues, normalizes issue/workpad/link/PR attachment context, and stores rebuildable cache data in the registry.
- `scripts/lib/linear-writes.mjs`: Explicit Linear status action adapter. It maps allowed workflow states, enforces confirmation for dispatching or externally visible states, updates the persistent `## Codex Workpad` comment by merging structured sections, and leaves passive sync read-only.
- `scripts/lib/symphony-state.mjs`: Passive Symphony observability adapter. It reads the documented local JSON state endpoint, falls back to documented log files when the endpoint is unavailable, and normalizes queue, active, complete, blocked, failed, and unknown state without starting workers or mutating Linear.
- `scripts/lib/github-pr-state.mjs`: Read-only GitHub adapter. It resolves PR candidates from Linear PR attachments, Linear branch names, and issue-worktree git branches, then reads PR status, merge/review state, check rollups, failing check annotations, latest review comments, and GitHub links through `gh`.
- `src/lib/workflowHubApi.ts`: Renderer-facing TypeScript contracts for the local API payloads.
- `src/App.tsx`: Codex-style track cockpit using static track data plus the local API state, adapter availability, explicit Linear status actions, confirmation boundary, PR/check/review state, and local event timeline for the selected issue.
- `scripts/workflow-hub.mjs`: Early CLI for resolving issue workspaces and drafting open/review commands.
- `scripts/lib/registry-db.mjs`: SQLite bootstrap, migrations, schema, and repository helpers for local cache state.
- `config/projects.example.json`: Tracked example project registry.
- `config/projects.schema.json`: Project config schema for canonical checkouts, issue worktree roots, Linear hints, and optional iOS review settings.
- `config/projects.json`: Ignored local override file for machine-specific project paths.

## Boundaries

- Linear remains the source of truth for issue status, priority, dependencies, and workpad context.
- Git and PR providers remain the source of truth for branch, diff, review, and merge state.
- Symphony remains the source of truth for Symphony workflow queue and dispatch decisions.
- Cursor SDK and Codex are runner backends, not durable planning databases.
- Workflow Hub displays and orchestrates these systems; it should not replace them.
- The renderer consumes typed local API responses only. Shell commands, project config reads, SQLite access, and provider adapters stay behind the Electron main/local service boundary; Electron may delegate native-backed reads to the repo CLI instead of importing those modules in-process.

## Main Flows

### Issue Review

1. User selects a Linear issue.
2. Hub asks the main-process local API for project, issue, workspace, runner, review, and PR state.
3. The local API syncs configured Linear project issues when `LINEAR_API_KEY` is available, then resolves the issue worktree through project config, reads scoped git status, reads passive Symphony observability state, and marks missing adapters as recoverable unavailable state.
4. The local API resolves linked GitHub PRs from Linear and git metadata, then reads status, review decision, checks, failing annotations, comments, and links without mutating GitHub.
5. Hub shows branch, PR, runner, and normalized Symphony state.
6. User launches simulator/device review from the issue worktree.
7. User marks Ready, In Progress, Human Review, Needs Fixes, Merging, Done, or Blocked through explicit Linear status actions.

### Linear Writes

1. User selects a named status action in the desktop UI.
2. Hub shows the pending transition, target state, Workpad note field, and any confirmation requirement.
3. The renderer sends a narrow `applyAction` IPC request only after the user confirms.
4. Electron delegates the write to the repo CLI under the system Node runtime.
5. The Node-side adapter updates the Linear status, merges a structured update into the existing `## Codex Workpad` comment or creates one if missing, and records the result in the local registry event store.
6. Hub refreshes Linear/cache state and renders the local write event in the issue timeline.

### Agent Dispatch

1. User selects an issue and runner.
2. Hub builds a prompt from issue/workpad/PR context.
3. Runner starts in the correct worktree.
4. Hub streams and stores status/events.
5. Runner output links back to Linear and PR evidence.

### iOS Review

1. Hub resolves the issue workspace.
2. Hub runs local config checks.
3. Simulator build uses isolated DerivedData.
4. Device review opens the correct worktree project in Xcode when signing/device state is required.

## Important Invariants

- A runner may only mutate the worktree assigned to its issue.
- Review actions must target the issue worktree, not the canonical checkout.
- The GUI cache must be rebuildable from Linear, git, PRs, and local runner logs.
- Local project config resolves paths and launch metadata only; it is not a source of truth for issue, branch, PR, or review state.
- Renderer code must not directly execute shell commands, read arbitrary local files, or talk to SQLite/provider adapters.
- Destructive actions require explicit user confirmation.
- Passive Linear sync must never mutate issue state or comments.
- GitHub PR sync must remain read-only; comments, reviews, checks, and merge state are displayed from GitHub as source of truth.
- Linear comments alone are context; dispatch-capable routing must come from explicit status actions or a configured external trigger.
