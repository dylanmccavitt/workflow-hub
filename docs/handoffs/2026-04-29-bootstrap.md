# Handoff: Bootstrap Workflow Hub

## Status

Local project scaffold created at `/Users/dylanmccavitt/projects/workflow-hub`.

The Linear track is drafted in `docs/issues/linear-track.md` but not yet created in Linear.

Dependencies are listed in `package.json` but not installed yet.

## Next

1. Confirm Linear project/issue creation.
2. Confirm dependency installation.
3. Create first issue worktree after Linear returns the first issue ID.
4. Run `npm run typecheck` and `npm run build`.

## Risks

- Linear project/issue creation requires explicit user confirmation.
- `npm install` requires explicit user confirmation because it installs third-party packages.
- The current UI uses static demo data.

## Files

- `package.json`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/App.tsx`
- `src/styles.css`
- `scripts/workflow-hub.mjs`
- `docs/architecture.md`
- `docs/decisions/0001-local-first-electron.md`
- `docs/decisions/0002-runner-adapter-boundaries.md`
- `docs/plans/001-bootstrap-workflow-hub.md`
- `docs/issues/linear-track.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node scripts/workflow-hub.mjs`

Not run yet:

- `npm install`
- `npm run typecheck`
- `npm run build`

Dependency installation still needs explicit confirmation.
