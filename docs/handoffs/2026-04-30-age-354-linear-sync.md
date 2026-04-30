# Handoff: AGE-354 Linear Issue, Project, And Workpad Sync

## Status

Ready for Human Review on `feat/age-354-linear-sync`.

Implemented read-only Linear project issue sync through the Node-side local API boundary. The adapter pulls configured project issues from Linear, normalizes title/status/priority/labels/parent/blockers/blocked issues/links/PR attachments, extracts the persistent `## Codex Workpad` comment, and caches the result in the SQLite registry with fresh/stale/error metadata.

Post-review fix: rebased the branch onto `origin/main` at `39262d4` after AGE-350 landed. The only content conflict was in `scripts/workflow-hub.mjs`; the resolution keeps AGE-350's issue workspace inference/status/open commands and AGE-354's `linear-sync` command.

## Next

Review the PR and manually run the sync/UI path with `LINEAR_API_KEY` exported:

1. `npm run workflow -- linear-sync workflow-hub --json`
2. `npm run dev`
3. Open Workflow Hub and confirm the selected issue header plus the Linear inspector section show live issue state, labels, blockers, Workpad presence, and cache status.

## Risks

- Linear writes are intentionally out of scope and remain owned by AGE-355.
- GitHub PR/check details are still provider-adapter work owned by AGE-358; this slice only reads PR attachments already linked in Linear.
- The local API uses a five-minute fresh-cache window to avoid repeated Linear calls during renderer refreshes.

## Files

- `scripts/lib/linear-sync.mjs`
- `scripts/lib/linear-sync.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/workflow-hub.mjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `config/projects.example.json`
- `docs/configuration.md`
- `docs/architecture.md`
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

## Review Notes

Manual review path:

1. Export `LINEAR_API_KEY`.
2. Run `npm run workflow -- linear-sync workflow-hub --json` and confirm `sync.status` is `fresh` and `cachedIssueCount` is nonzero.
3. Run `npm run dev`.
4. Confirm the Linear inspector shows AGE-354's current Linear status, priority `High`, labels, blockers, Workpad `Found` or updated timestamp, and cache `Fresh`.
5. Confirm missing token or network failure degrades to not-configured/unavailable adapter state while cached issue data is marked stale/error.
