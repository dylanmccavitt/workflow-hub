# Handoff: AGE-365 Unified Run Timeline

## Status

Implemented a normalized runner timeline for Workflow Hub on `feat/age-365-run-timeline-cancellation`.

The local API now returns `runTimeline`, assembled from stored run events, run records, and passive Symphony state. Timeline entries normalize runner states to queued, starting, running, blocked, cancelling, cancelled, succeeded, failed, and unknown while preserving raw status, runner IDs, agent/session IDs, cwd, log paths, summary paths, raw provider events, and raw run metadata where available.

The renderer now uses the normalized timeline before falling back to raw registry events. Failed states render with danger tone, blocked/cancellation states render with warning tone, and active/queued states render as neutral timeline rows.

Review fixes applied after PR review:

- Non-run issue events such as Linear status writes and review prompt saves are excluded from `runTimeline`.
- Symphony timeline rows are emitted only for selected issues that came from Symphony endpoint data, not for Linear-inferred fallback state.

## Next

Manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-365 npm run dev
```

Open `AGE-365` and confirm the Timeline section does not show a fake Symphony runner row when Symphony has no matching endpoint entry and the selected issue is inferred from Linear. Runner failure, blocked, cancellation, raw-event preservation, non-run event filtering, and Linear-inferred Symphony behavior are covered by `scripts/lib/runner-timeline.test.mjs`.

## Risks

- This slice models cancellation and cancellation display state. It does not add a background process manager or a user-facing stop button for in-flight Codex/Cursor runs.
- Raw provider payloads stay in the local API response for debugging, so future provider payloads should still be watched for excessive size.
- Linear-inferred Symphony state remains visible in the Symphony adapter details, but it is no longer represented as runner timeline activity.

## Files

- `scripts/lib/runner-timeline.mjs`
- `scripts/lib/runner-timeline.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `docs/architecture.md`
- `docs/decisions/0007-normalized-run-timeline.md`
- `docs/handoffs/2026-05-01-age-365-run-timeline.md`

## Checks

- `node --check scripts/lib/runner-timeline.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --test scripts/lib/runner-timeline.test.mjs scripts/lib/local-api-service.test.mjs`
- `node scripts/workflow-hub.mjs api-state AGE-365 --json`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `npm run lint`
- `git diff --check`
- `npm rebuild better-sqlite3` before rerunning local API tests after a local Node ABI mismatch.

## Review Notes

- Live `api-state AGE-365 --json` now returns `runTimeline: []` when Symphony has no matching endpoint entry and the selected issue is inferred from Linear.
- Added regression tests for filtering non-run issue events and skipping Linear-inferred Symphony selected state.
- PR: https://github.com/DylanMcCavitt/workflow-hub/pull/14
