# Handoff: AGE-366 Codex-Style Dashboard Backed By Local API

## Status

Ready for Human Review on `feat/age-366-codex-dashboard`.

Implemented the local API issue-list path and switched the dashboard away from the static issue list and demo timeline. The Electron preload bridge now exposes `workflowHub.issues.list()` beside the selected-issue API, and the CLI exposes `api-issues workflow-hub --json` for the same payload.

The renderer now uses local API project issues for the left rail, issue counts, selected issue header, linked Linear graph, cache state, and empty/loading/stale/error notices. The selected issue timeline renders real local API runner/workflow events only. Non-backed action buttons remain disabled, while Sync refreshes real local API state and PR opens only when a PR URL is available.

PR: https://github.com/DylanMcCavitt/workflow-hub/pull/15

## Next

Review PR #15, then move to Merging only after human approval.

Manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-366 npm run dev
```

Confirm the app opens to AGE-366, the left rail lists live Workflow Hub project issues, the selected issue shows Linear/cache/workspace/runner state, unavailable actions are disabled, and the Timeline uses the real Symphony/local event row rather than demo data.

## Risks

- Simulator, device, and worktree open actions remain disabled here because this slice does not add those action IPCs.
- Browser-only Vite preview still reports the desktop API unavailable; the API-backed dashboard path requires Electron preload.
- The local issue list depends on the same Linear cache and `LINEAR_API_KEY` behavior as AGE-354. It degrades to stale/error UI when sync cannot refresh.

## Files

- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/workflow-hub.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `src/App.tsx`
- `src/lib/types.ts`
- `src/lib/workflowHubApi.ts`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-05-01-age-366-codex-dashboard.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --test scripts/lib/local-api-service.test.mjs`
- `node scripts/workflow-hub.mjs api-issues workflow-hub --json`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `npm run lint`
- `git diff --check`
- Electron smoke: `WORKFLOW_HUB_ISSUE_ID=AGE-366 npm run dev`
- `gh pr view 15 --json number,url,state,headRefName,baseRefName,mergeStateStatus,isDraft,title`
- `gh pr checks 15 --watch=false` reported no checks configured for the branch

## Review Notes

- Electron smoke showed 29 API-backed issues, AGE-366 selected, fresh cache, resolved issue worktree, available Symphony/Codex/Cursor state, disabled unavailable actions, and a real Symphony timeline row.
- PR #15 is open, non-draft, and GitHub reports merge state `CLEAN`.
