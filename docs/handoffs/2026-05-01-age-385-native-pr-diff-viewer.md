# Handoff: AGE-385 Native PR Diff Viewer

## Status

Implemented on `feat/age-385-native-pr-diff-viewer`.

The GitHub PR adapter now reads changed files for the resolved PR through the read-only GitHub API path, normalizes file counts, additions/deletions, and parses unified patch hunks into typed line data. Diff fetch errors are contained in the PR diff state so the PR metadata/check/comment panel can remain available.

The renderer now includes a native changed-file review surface in the central issue workspace. It shows GitHub and Graphite source links, changed-file totals, file navigation, selected-file unified hunks, additions/deletions, and file-level review-comment/check-note counts. Loading, empty, stale, unavailable, and error states are visible in the diff surface.

## Next

Open and review the PR for this branch.

Manual UI review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-358 npm run dev
```

Confirm AGE-358 resolves PR #9 and the central workspace shows Changed Files with the file list, file counts, selected-file unified diff, GitHub PR link, and Graphite link. AGE-385 itself will show the unavailable diff state until its PR is opened and linked.

## Risks

- The changed-files request currently reads the first GitHub files page with `per_page=100`; very large PR pagination can be a follow-up if needed.
- Browser-only Vite preview still cannot exercise the desktop API-backed diff state; use Electron for real PR data.
- Binary or oversized files may have changed-file metadata without a unified patch, and the UI surfaces that as a per-file no-patch state.

## Files

- `scripts/lib/github-pr-state.mjs`
- `scripts/lib/github-pr-state.test.mjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-05-01-age-385-native-pr-diff-viewer.md`

## Checks

- `node --test scripts/lib/github-pr-state.test.mjs scripts/lib/local-api-service.test.mjs`
- `node scripts/workflow-hub.mjs api-state AGE-358 --json`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/github-pr-state.mjs`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`
- `WORKFLOW_HUB_ISSUE_ID=AGE-358 npm run dev`

## Review Notes

- `api-state AGE-358` returned GitHub PR #9 with diff status `available`, 10 changed files, +1607/-54, and parsed hunks for `docs/architecture.md`.
- The desktop smoke launched the Electron app with `WORKFLOW_HUB_ISSUE_ID=AGE-358`; Vite served `http://127.0.0.1:5173/` and the process was stopped after startup validation.
- No GitHub comments, reviews, merges, status changes, or Graphite mutations were added by this slice.
