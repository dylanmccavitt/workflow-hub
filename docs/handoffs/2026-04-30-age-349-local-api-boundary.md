# Handoff: AGE-349 Local API Boundary

## Status

Ready for Human Review on `feat/age-349-local-api-boundary`.

Implemented a main-process local API service for Workflow Hub issue state. The renderer now calls one narrow preload bridge, `workflowHub.issues.getState(issueId)`, and receives typed project, issue, workspace, runner, review, PR, and adapter state instead of direct workspace resolver IPC.

## Next

Review the PR and manually launch the app with `npm run dev`. Confirm the dashboard renders, the selected issue resolves through the local API boundary, and unavailable Linear/runner/review/PR adapters appear as recoverable states rather than silent failures.

## Risks

- Linear issue data is still demo-backed in the renderer until AGE-354 wires the Linear adapter.
- Symphony, Codex, Cursor SDK, iOS review, and GitHub PR adapters intentionally return unavailable state until their owned follow-up issues are implemented.
- This uses an Electron main-process service first; a separate daemon may still be useful later for background runs that should outlive the window.

## Files

- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `src/lib/workflowHubApi.ts`
- `src/vite-env.d.ts`
- `src/App.tsx`
- `src/styles.css`
- `docs/architecture.md`
- `docs/decisions/0004-main-process-api-boundary.md`
- `docs/handoffs/2026-04-30-age-349-local-api-boundary.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --test scripts/lib/local-api-service.test.mjs`
- `npm run typecheck`
- `npm run test`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`
- `node --input-type=module -e '<local API AGE-349 readback>'`

## Review Notes

Manual review path:

1. Run `npm run dev`.
2. Open Workflow Hub and inspect the Sources/Runners/Review inspector sections.
3. Confirm Project config, Workspace resolver, and Git report available state for resolved workspaces.
4. Confirm Linear, Symphony, Codex, Cursor SDK, Simulator review, Device review, and GitHub PR report unavailable/recoverable state with owner issue pointers.
