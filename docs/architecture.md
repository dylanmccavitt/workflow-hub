# Architecture

## Current System Shape

Workflow Hub is a local-first Electron app with a React/Vite renderer and a small Electron shell.

The app will grow into three layers:

1. Desktop UI: Codex-style workspace for issue review, runner state, PR state, and iOS controls.
2. Local hub daemon: adapters for Linear, Symphony, Codex, Cursor SDK, GitHub, Graphite, git, and iOS review commands.
3. Local registry: SQLite cache for projects, issues, workspaces, runs, PRs, review sessions, and events.

The current scaffold includes the UI shell, a local CLI stub, project docs, a Node-side SQLite registry module, and a read-only Electron bridge for resolving the selected issue workspace. Adapter work is not implemented yet.

## Major Components

- `electron/main.cjs`: Creates the desktop window, controls external-link handling, and exposes read-only IPC for issue workspace resolution.
- `electron/preload.cjs`: Exposes a minimal safe bridge to the renderer without broad filesystem or shell access.
- `src/App.tsx`: Codex-style track cockpit using static track data plus the desktop issue-workspace resolver for the selected issue.
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

## Main Flows

### Issue Review

1. User selects a Linear issue.
2. Hub resolves the issue worktree through the local project config and read-only Electron bridge.
3. Hub shows branch, PR, runner, and Symphony state.
4. User launches simulator/device review from the issue worktree.
5. User marks `Needs Fixes` or proceeds to merge through explicit actions.

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
- Destructive actions require explicit user confirmation.
