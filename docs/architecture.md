# Architecture

## Current System Shape

Workflow Hub is a local-first Electron app with a React/Vite renderer and a small Electron shell.

The app will grow into three layers:

1. Desktop UI: Codex-style workspace for issue review, runner state, PR state, and iOS controls.
2. Local hub daemon: adapters for Linear, Symphony, Codex, Cursor SDK, GitHub, Graphite, git, and iOS review commands.
3. Local registry: SQLite cache for projects, issues, workspaces, runs, PRs, review sessions, and events.

The current scaffold includes the UI shell, a local CLI stub, project docs, a Node-side SQLite registry module, and a main-process local API service for resolving selected issue state through typed IPC. Adapter work for Linear, Symphony, runners, review controls, and PR providers is represented as explicit unavailable adapter state until the owned follow-up issues wire those systems.

## Major Components

- `electron/main.cjs`: Creates the desktop window, controls external-link handling, and registers the local API IPC boundary.
- `electron/preload.cjs`: Exposes a minimal safe `workflowHub.issues.getState(issueId)` bridge to the renderer without broad filesystem, shell, or arbitrary IPC access.
- `scripts/lib/local-api-service.mjs`: Node-side service layer for project, issue, workspace, runner, review, and PR state contracts. It owns project config reads, scoped git probes, and unavailable-adapter responses.
- `src/lib/workflowHubApi.ts`: Renderer-facing TypeScript contracts for the local API payloads.
- `src/App.tsx`: Codex-style track cockpit using static track data plus the local API state and adapter availability for the selected issue.
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
- The renderer consumes typed local API responses only. Shell commands, project config reads, SQLite access, and provider adapters stay in the Electron main/local service boundary.

## Main Flows

### Issue Review

1. User selects a Linear issue.
2. Hub asks the main-process local API for project, issue, workspace, runner, review, and PR state.
3. The local API resolves the issue worktree through project config, reads scoped git status, and marks missing adapters as recoverable unavailable state.
4. Hub shows branch, PR, runner, and Symphony state.
5. User launches simulator/device review from the issue worktree.
6. User marks `Needs Fixes` or proceeds to merge through explicit actions.

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
