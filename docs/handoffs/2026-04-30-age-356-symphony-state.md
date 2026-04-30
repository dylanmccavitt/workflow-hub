# Handoff: AGE-356 Symphony State Discovery

## Status

Ready for Human Review on `feat/age-356-symphony-state-adapter`.

Implemented a passive Symphony observability adapter behind the local API boundary. The adapter reads the documented `GET /api/v1/state` endpoint, normalizes endpoint and Linear fallback state into `queue`, `active`, `complete`, `blocked`, `failed`, and `unknown`, and reports unavailable/error state when the endpoint is unreachable or returns a snapshot error. Endpoint-missing fallback includes the latest readable Symphony log line when present.

The `api-state` payload now includes structured `symphony` state, and the Symphony runner row is driven by that adapter instead of the previous planned/unavailable placeholder.

## Next

Review the PR and run:

```sh
npm run workflow -- api-state AGE-356 --json
```

Confirm the payload reports `symphony.status: "available"`, `symphony.running: true`, and `symphony.selectedIssue.normalizedState: "active"` while local Symphony is running on port `4002`.

Manual UI review path:

```sh
npm run dev
```

Select `AGE-356` and confirm the Symphony runner row reports linked active state without starting workers or changing Linear.

## Risks

- The current Symphony endpoint exposes running and retry/backoff state, but not a separate durable completed-runs list. Completed, blocked, and queued states for issues absent from the snapshot are inferred from cached Linear status and marked with source/reason in the structured payload.
- If Symphony is launched without the dashboard/API port, Workflow Hub will show unavailable state and log fallback detail instead of treating that as an empty queue.

## Files

- `scripts/lib/symphony-state.mjs`
- `scripts/lib/symphony-state.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `src/lib/workflowHubApi.ts`
- `docs/SYMPHONY.md`
- `docs/architecture.md`
- `docs/handoffs/2026-04-30-age-356-symphony-state.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/symphony-state.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --test scripts/lib/symphony-state.test.mjs scripts/lib/local-api-service.test.mjs`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check`
- `git diff --check`
- `node scripts/workflow-hub.mjs api-state AGE-356 --json`
