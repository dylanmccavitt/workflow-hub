# Architecture

## Current System Shape

Workflow Hub is a local-first Electron app with a React/Vite renderer and a small Electron shell.

The app will grow into three layers:

1. Desktop UI: Codex-style workspace for issue review, runner state, PR state, and iOS controls.
2. Local hub daemon: adapters for Linear, Symphony, Codex, Cursor SDK, GitHub, Graphite, git, and iOS review commands.
3. Local registry: SQLite cache for projects, issues, workspaces, runs, PRs, review sessions, and events.

The current scaffold includes the UI shell, a local CLI stub, project docs, a Node-side SQLite registry module, a Linear project issue sync adapter, safe explicit Linear status/workpad write actions, a passive Symphony state adapter, read-only GitHub PR/check/review and Graphite stack adapters, an editable PR-fix prompt builder with local timeline persistence, Cursor SDK and Codex local runner adapters, and a main-process local API service for resolving selected issue state through typed IPC. Review-control adapters are represented as explicit unavailable adapter state until the owned follow-up issues wire those systems.

## Major Components

- `electron/main.cjs`: Creates the desktop window, controls external-link handling, and registers the local API IPC boundary. Native-backed cache/provider reads run through the repo CLI under the system Node runtime so Electron does not load Node-ABI native modules directly.
- `electron/preload.cjs`: Exposes minimal safe `workflowHub.issues.list()` and `workflowHub.issues.getState(issueId)` bridges to the renderer without broad filesystem, shell, or arbitrary IPC access.
- `scripts/lib/local-api-service.mjs`: Node-side service layer for project issue lists, selected issue state, workspace, runner, review, PR state, and fix-prompt contracts. It owns project config reads, Linear cache sync, scoped git probes, runner dispatch, normalized run timeline assembly, timeline event writes, and unavailable-adapter responses.
- `scripts/lib/runner-timeline.mjs`: Pure normalization layer that maps Symphony, Codex, and Cursor status/event shapes into queued, starting, running, blocked, cancelling, cancelled, succeeded, failed, and unknown timeline states while preserving raw runner IDs, log paths, and raw provider event payloads for debugging.
- `scripts/lib/review-fix-prompt.mjs`: Pure prompt builder that composes selected GitHub review comments, failing checks, Linear issue/workpad context, owned paths, and current worktree/branch into an editable fix prompt.
- `scripts/lib/linear-sync.mjs`: Read-only Linear GraphQL adapter that pulls configured project issues, normalizes issue/workpad/link/PR attachment context, and stores rebuildable cache data in the registry.
- `scripts/lib/linear-writes.mjs`: Explicit Linear status action adapter. It maps allowed workflow states, enforces confirmation for dispatching or externally visible states, updates the persistent `## Codex Workpad` comment by merging structured sections, and leaves passive sync read-only.
- `scripts/lib/symphony-state.mjs`: Passive Symphony observability adapter. It reads the documented local JSON state endpoint, falls back to documented log files when the endpoint is unavailable, and normalizes queue, active, complete, blocked, failed, and unknown state without starting workers or mutating Linear.
- `scripts/lib/github-pr-state.mjs`: Read-only GitHub adapter. It resolves PR candidates from Linear PR attachments, Linear branch names, and issue-worktree git branches, then reads PR status, merge/review state, check rollups, failing check annotations, latest review comments, and GitHub links through `gh`.
- `scripts/lib/graphite-stack-state.mjs`: Read-only Graphite adapter. It detects the installed `gt` CLI and local Graphite initialization before running stack commands, resolves stack candidates from GitHub/Linear/workspace branch metadata, reads stack order through `gt log --stack`, direct parent/children through `gt parent`/`gt children`, and falls back to Graphite deep links when stack metadata is unavailable.
- `scripts/lib/cursor-runner.mjs`: Cursor SDK local runner adapter. It launches `@cursor/sdk` agents with `local.cwd` set to the resolved issue worktree, persists run records in the registry, and records streamed SDK messages as local timeline events.
- `scripts/lib/codex-runner.mjs`: Codex CLI local runner adapter. It launches `codex exec --json` with `--cd` set to the resolved issue worktree, records command/cwd/session/log/summary/status metadata, and keeps sandbox/approval boundaries visible in registry events.
- `src/lib/workflowHubApi.ts`: Renderer-facing TypeScript contracts for the local API payloads.
- `src/App.tsx`: Codex-style dashboard backed by the local issue-list and selected-issue API, with adapter availability, explicit Linear status actions, confirmation boundary, editable PR-fix prompt panel, Codex and Cursor local-run panels, GitHub PR/check/review state, Graphite stack state, linked Linear issue graph, and local event timeline for the selected issue.
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

1. Hub asks the main-process local API for the configured Linear project issue list and cache state.
2. User selects a Linear issue from the API-backed list.
3. Hub asks the main-process local API for project, issue, workspace, runner, review, and PR state.
4. The local API syncs configured Linear project issues when `LINEAR_API_KEY` is available, then resolves the issue worktree through project config, reads scoped git status, reads passive Symphony observability state, and marks missing adapters as recoverable unavailable state.
5. The local API resolves linked GitHub PRs from Linear and git metadata, then reads status, review decision, checks, failing annotations, comments, and links without mutating GitHub.
6. The local API resolves Graphite stack candidates from GitHub/Linear/workspace branch metadata, reads local `gt` stack order only when Graphite is initialized, and returns a Graphite deep link when stack data is unavailable.
7. Hub shows branch, PR, Graphite stack, runner, and normalized Symphony state.
8. User launches simulator/device review from the issue worktree.
9. User marks Ready, In Progress, Human Review, Needs Fixes, Merging, Done, or Blocked through explicit Linear status actions.

### Linear Writes

1. User selects a named status action in the desktop UI.
2. Hub shows the pending transition, target state, Workpad note field, and any confirmation requirement.
3. The renderer sends a narrow `applyAction` IPC request only after the user confirms.
4. Electron delegates the write to the repo CLI under the system Node runtime.
5. The Node-side adapter updates the Linear status, merges a structured update into the existing `## Codex Workpad` comment or creates one if missing, and records the result in the local registry event store.
6. Hub refreshes Linear/cache state and renders the local write event in the issue timeline.

### Agent Dispatch

1. User selects an issue and runner.
2. Hub builds an editable fix prompt from selected PR review comments, failing checks, issue/workpad context, owned paths, and current worktree/branch.
3. User may edit and save the prompt into the local event timeline.
4. Runner dispatch remains a separate explicit action; prompt generation never starts a runner by itself.
5. Codex local dispatch runs `codex exec --json` with `--cd` set to the issue worktree, writes JSONL and summary files under the local Workflow Hub data directory, and records sandbox/approval policy with each run.
6. Cursor SDK local dispatch creates the agent with `local.cwd` set to the issue worktree and uses the configured model/config path from project config.
7. Hub streams and stores status/events in the local registry.
8. Hub assembles a normalized run timeline from registry events, stored run records, and passive Symphony state without replacing raw runner logs or provider IDs.
9. Runner output links back to Linear and PR evidence.

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
- Graphite stack sync must remain read-only; Workflow Hub may display local stack order, parent/child branches, submit/merge state, and Graphite links, but it must not replace Graphite's review UI.
- Linear comments alone are context; dispatch-capable routing must come from explicit status actions or a configured external trigger.
