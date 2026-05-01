# Handoff: AGE-368 Ready To Worker Dispatch

## Status

Implemented on `feat/age-368-ready-worker-dispatch`.

Workflow Hub now exposes a Ready dispatch action across the Node local API, CLI, Electron preload/main bridge, and renderer. The action resolves or creates the selected issue worktree, creates/switches to the issue branch when safe, moves Ready/Todo issues to In Progress through the explicit Linear write path, builds the runner prompt with Linear issue and Codex Workpad context, and starts the chosen Codex or Cursor runner.

The dispatch path refuses to start a writable runner when Symphony endpoint state or registry run records show another active writable runner for the same worktree. The Symphony guard only treats endpoint-sourced active/queued issues as authoritative so Linear-inferred `In Progress` state does not block dry-run dispatch when the endpoint has no active worker. Runner dry-runs record a timeline event so the UI can show dispatch readiness without spending runner/model quota.

## Next

Manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-368 npm run dev
```

Open a Ready or Todo issue, choose Codex or Cursor in Ready Dispatch, confirm the In Progress/runner dispatch checkbox, optionally enable dry-run, and click Dispatch. Confirm the issue worktree/branch resolves without manual path hunting, the Linear Workpad gets the status action note for real dispatches, and the Timeline shows the runner state or dry-run readiness event after refresh.

## Risks

- Real Codex or Cursor dispatch can consume local/model quota. Use dry-run during UI review unless intentionally starting a worker.
- Moving a Linear issue to In Progress may wake Symphony in configured environments. The dispatch action checks Symphony state again after the status transition and refuses a duplicate local runner if Symphony already owns the worktree.
- Worktree creation shells out to git from the canonical checkout and fails closed on fetch/worktree/branch errors.

## Files

- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/workflow-hub.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/lib/registry-db.mjs`
- `src/App.tsx`
- `src/lib/workflowHubApi.ts`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-05-01-age-368-ready-dispatch.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --test scripts/lib/local-api-service.test.mjs scripts/lib/registry-db.test.mjs scripts/lib/runner-timeline.test.mjs`
- `npm run typecheck`
- `node --test scripts/lib/local-api-service.test.mjs scripts/lib/runner-timeline.test.mjs`
- `node scripts/workflow-hub.mjs dispatch-ready AGE-368 --runner codex --confirmed --dry-run --json` now returns `runnerStatus: ready` and records `codex.run.ready`.
- `npm run check`

## Review Notes

- Focused tests cover creating a Ready issue worktree, moving to In Progress, building Codex prompt context with the Workpad, recording a dry-run timeline event, ignoring Linear-inferred Symphony active state when the endpoint has no active worker, blocking endpoint-sourced active Symphony ownership, and blocking duplicate writable dispatch for a worktree.
- Live dry-run smoke returned `AGE-368`, `dryRun: true`, `runnerKind: Codex`, `runnerStatus: ready`, and `eventType: codex.run.ready`.
