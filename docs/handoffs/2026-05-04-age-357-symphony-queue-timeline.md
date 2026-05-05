# Handoff: AGE-357 Symphony Queue and Worker Timeline UI

## Status

Implemented on `feat/age-357-symphony-queue-timeline`.

The local issue-list API now includes passive project-level Symphony state, so the renderer can show queue health without selecting an individual issue first. The Symphony endpoint normalizer now recognizes active, queued, blocked, failed, and completed endpoint arrays instead of only `running` and `retrying`.

The UI adds a project-level Symphony queue panel in the left sidebar with counts and clickable issue rows, plus a selected-issue Symphony inspector panel with status, last trigger, runner/session, workspace, blocker reason, and raw endpoint/log pointer.

## Next

Open the PR and run the manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-357 npm run dev
```

Confirm the sidebar shows the Symphony project queue and counts, then select `AGE-357` and confirm the right inspector's Symphony panel shows last trigger, runner/session, workspace, status, blocker reason, and raw debug pointer.

## Risks

- The raw pointer is the endpoint URL when Symphony is reachable and the latest log path when the endpoint is unavailable. The current endpoint payload does not expose per-run log files.
- The project queue remains passive visibility only; it does not start workers or mutate Linear.

## Files

- `scripts/lib/local-api-service.mjs`
- `scripts/lib/symphony-state.mjs`
- `scripts/lib/symphony-state.test.mjs`
- `src/App.tsx`
- `src/lib/workflowHubApi.ts`
- `src/styles.css`
- `docs/handoffs/2026-05-04-age-357-symphony-queue-timeline.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --test scripts/lib/symphony-state.test.mjs scripts/lib/local-api-service.test.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`
- `node scripts/workflow-hub.mjs api-state AGE-357 --json`
- `npm run dev:renderer -- --host 127.0.0.1`
