# Architecture

## Current System Shape

Workflow Hub is a local-first Electron app with a React/Vite renderer and a small Electron shell.

The app will grow into three layers:

1. Desktop UI: Codex-style workspace for issue review, runner state, PR state, and iOS controls.
2. Local hub daemon: adapters for Linear, Symphony, Codex, Cursor SDK, GitHub, Graphite, git, and iOS review commands.
3. Local registry: SQLite cache for projects, issues, workspaces, runs, PRs, review sessions, and events.

The current scaffold includes the UI shell, a local CLI stub, and project docs. Adapter and SQLite work is not implemented yet.

## Major Components

- `electron/main.cjs`: Creates the desktop window and controls external-link handling.
- `electron/preload.cjs`: Exposes a minimal safe bridge to the renderer.
- `src/App.tsx`: Codex-style dashboard scaffold using static data.
- `scripts/workflow-hub.mjs`: Early CLI for resolving issue workspaces and drafting open/review commands.
- `config/projects.example.json`: Example project registry for local issue workspace discovery.

## Boundaries

- Linear remains the source of truth for issue status, priority, dependencies, and workpad context.
- Git and PR providers remain the source of truth for branch, diff, review, and merge state.
- Symphony remains the source of truth for Symphony workflow queue and dispatch decisions.
- Cursor SDK and Codex are runner backends, not durable planning databases.
- Workflow Hub displays and orchestrates these systems; it should not replace them.

## Main Flows

### Issue Review

1. User selects a Linear issue.
2. Hub resolves the issue worktree.
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
- Destructive actions require explicit user confirmation.
