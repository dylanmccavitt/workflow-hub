# Handoff: AGE-354 Linear Issue, Project, And Workpad Sync

## Status

Post-review fixes applied on `feat/age-354-linear-sync`.

Implemented read-only Linear project issue sync through the Node-side local API boundary. The adapter pulls configured project issues from Linear, normalizes title/status/priority/labels/parent/blockers/blocked issues/links/PR attachments, extracts the persistent `## Codex Workpad` comment, and caches the result in the SQLite registry with fresh/stale/error metadata.

Post-review fix: rebased the branch onto `origin/main` at `39262d4` after AGE-350 landed. The only content conflict was in `scripts/workflow-hub.mjs`; the resolution keeps AGE-350's issue workspace inference/status/open commands and AGE-354's `linear-sync` command.

Review run fix: the Electron desktop path initially failed to load Linear state because `better-sqlite3` was built for the system Node ABI and Electron required a different native module ABI. `electron/main.cjs` now keeps the renderer IPC boundary but delegates issue-state reads to `scripts/workflow-hub.mjs api-state` under the system Node runtime, so SQLite/provider cache reads stay outside Electron's native module ABI. The app also opens directly to the issue inferred from the current Symphony workspace path, includes/selects AGE-354 in the issue list, keeps the sidebar issue list scrollable, and avoids the duplicated `Stale stale` cache label.

## Next

Review the updated PR and, when a shell with `LINEAR_API_KEY` is available, manually re-run the fresh sync path:

1. `npm run workflow -- linear-sync workflow-hub --json`
2. `npm run dev`
3. Open Workflow Hub and confirm the selected issue header plus the Linear inspector section show live issue state, labels, blockers, Workpad presence, and cache status.

## Risks

- Linear writes are intentionally out of scope and remain owned by AGE-355.
- GitHub PR/check details are still provider-adapter work owned by AGE-358; this slice only reads PR attachments already linked in Linear.
- The local API uses a five-minute fresh-cache window to avoid repeated Linear calls during renderer refreshes.
- In this review shell, `LINEAR_API_KEY` was not exported. The desktop UI correctly displayed cached AGE-354 data as stale/not-configured; a fresh live fetch still needs a token-backed run.

## Files

- `scripts/lib/linear-sync.mjs`
- `scripts/lib/linear-sync.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/workflow-hub.mjs`
- `electron/main.cjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/data/demo.ts`
- `src/styles.css`
- `config/projects.example.json`
- `docs/configuration.md`
- `docs/architecture.md`
- `docs/decisions/0004-main-process-api-boundary.md`
- `docs/decisions/0005-read-only-linear-sync.md`
- `docs/handoffs/2026-04-30-age-354-linear-sync.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/linear-sync.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run workflow -- linear-sync workflow-hub --json` synced 29 Workflow Hub issues from Linear.
- `node --input-type=module -e '<local API AGE-354 readback>'` confirmed title/status/priority/labels/blockers/blocked issues/Workpad/fresh cache.
- Post-review fix: `npm run workflow -- status AGE-354 --json` confirmed canonical `main` at `39262d4` and this workspace at `7b2b2ae`.
- Post-review fix: `npm run workflow -- linear-sync workflow-hub --json` synced 29 Workflow Hub issues from Linear with `sync.status` `fresh`.
- Post-review fix: `npm run lint`.
- Post-review fix: `npm run check`.
- Review run: `npm run dev` initially exposed the Electron `better-sqlite3` ABI mismatch in the Linear source row.
- Review run fix check: `node scripts/workflow-hub.mjs api-state AGE-354 --json` confirmed status `Needs Fixes`, priority `High`, labels, blockers, blocked issues, Workpad presence, PR #6, workspace resolution, stale cache, and not-configured adapter state without loading native SQLite in Electron.
- Review run fix check: `npm run dev` opened `http://127.0.0.1:5173/?issue=AGE-354` in Electron and showed AGE-354 workspace, branch, Linear fields, Workpad, PR #6, and stale cache without the native-module error.
- Browser panel check: `http://127.0.0.1:5173/?issue=AGE-354` selected AGE-354 and correctly reported `Desktop API unavailable in renderer preview`.
- Final post-review checks: `node --check electron/main.cjs`; `node --check electron/preload.cjs`; `node --check scripts/workflow-hub.mjs`; `node --check scripts/lib/linear-sync.mjs`; `node --check scripts/lib/local-api-service.mjs`; `npm run check`; `git diff --check`.

## Review Notes

Manual review path:

1. Export `LINEAR_API_KEY`.
2. Run `npm run workflow -- linear-sync workflow-hub --json` and confirm `sync.status` is `fresh` and `cachedIssueCount` is nonzero.
3. Run `npm run dev`.
4. Confirm the Linear inspector shows AGE-354's current Linear status, priority `High`, labels, blockers, Workpad `Found` or updated timestamp, and cache `Fresh`.
5. Confirm missing token or network failure degrades to not-configured/unavailable adapter state while cached issue data is marked stale/error.
