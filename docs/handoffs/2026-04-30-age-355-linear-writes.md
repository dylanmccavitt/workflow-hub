# Handoff: AGE-355 Safe Status Transitions And Workpad Writes

## Status

Implemented on `feat/age-355-linear-writes`.

Workflow Hub now exposes explicit Linear status actions for Ready, In Progress, Human Review, Needs Fixes, Merging, Done, and Blocked. Risky states require confirmation before the renderer sends the narrow `applyAction` request. Electron delegates writes to the repo CLI under system Node, matching the existing local API boundary and avoiding direct renderer or Electron-native SQLite/provider access.

The write adapter updates Linear issue state, merges structured updates into the persistent `## Codex Workpad` comment without replacing unrelated sections or notes, and records successful or failed write attempts in the local registry event store. The issue state API returns those events, and the renderer prepends them to the local timeline.

Review fix: the selected issue row and sidebar state counts now reflect the live selected Linear issue after local API data loads. The broader sidebar issue set is still static demo data until AGE-366 replaces the main dashboard with local API data.

## Next

Open the PR and review the status action flow in Electron:

1. Export `LINEAR_API_KEY`.
2. Run `npm run dev`.
3. Open AGE-355 in Workflow Hub.
4. Click a status action such as Human Review and verify the confirmation boundary appears.
5. Do not click Apply unless intentionally testing a real Linear write.
6. For a real write test, confirm that Linear status changes, the Workpad `### Notes` and `### Handoff` sections update, and the local timeline shows the write result after refresh.

## Risks

- The UI smoke test intentionally stopped before Apply, so no real Linear mutation was performed from the GUI during implementation.
- The GraphQL write path is covered with mocked Linear responses; final review can optionally perform one real status round-trip on a non-dispatching state if Dylan wants live-write evidence.
- GitHub PR/check sync is still unavailable until AGE-358.
- Runner dispatch semantics remain external; this slice only enforces the GUI/write boundary and does not start workers.

## Files

- `scripts/lib/linear-writes.mjs`
- `scripts/lib/linear-writes.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/workflow-hub.mjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/data/demo.ts`
- `src/styles.css`
- `docs/architecture.md`
- `docs/decisions/0006-safe-linear-writes.md`
- `docs/handoffs/2026-04-30-age-355-linear-writes.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/linear-writes.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run workflow -- api-state AGE-355 --json`
- `npm run dev:renderer`
- `npm run dev:electron`

## Review Notes

- Browser preview at `http://127.0.0.1:5173/?issue=AGE-355` renders the AGE-355 action panel but disables writes because the desktop bridge is unavailable.
- Electron smoke loaded live Linear data, resolved the AGE-355 workspace, showed all seven status actions enabled, and showed the Human Review confirmation boundary with Apply disabled until confirmation. The check was canceled before any Linear write.
- Review/debug pass reproduced a stale native `better-sqlite3` ABI in this worktree; `npm rebuild better-sqlite3` fixed local API reads for Node 25. This was a local dependency rebuild, not a tracked code change.
- Live Electron review on `http://127.0.0.1:5173/?issue=AGE-355` showed AGE-355 selected, Linear status `Human Review`, priority `High`, blockers, Workpad, PR attachment, and cache `Fresh`.
- The sidebar row/counts initially remained static after live issue load; patched `src/App.tsx` so the selected issue row and state counts mirror the selected Linear issue. Full all-issue sidebar sync remains AGE-366.
- Confirmation smoke selected `Needs Fixes`, verified the confirmation panel and disabled Apply until the checkbox was selected, then canceled without applying a real Linear write.
- Review/debug checks: `npm run typecheck`; `npm run test`; `npm run build`; `git diff --check`; `npm run workflow -- api-state AGE-355 --json`.
