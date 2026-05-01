# Handoff: AGE-380 Cockpit Shell Visual Direction

## Status

Ready for Human Review on `feat/age-380-cockpit-shell`.

Implemented the selected Codex/Linear cockpit direction on top of the AGE-366 API-backed dashboard. The renderer now presents a dense desktop shell with a left icon rail, grouped issue-state sidebar, central selected-issue workspace, right inspector, and full-width command bar.

The first viewport now surfaces Linear state, worktree path, branch, PR/review status, runner state, review actions, and the expected Open Zed / Run Simulator / Run Device / Show PR controls. The controls remain backed by the existing typed local API boundaries; unavailable actions stay disabled instead of adding renderer shell access.

## Next

Review PR, then move to Merging only after human approval.

Manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-380 npm run dev
```

Confirm the first viewport matches the selected cockpit direction, AGE-380 resolves through the local API, the sidebar groups issues by Linear state, the workspace facts show worktree/branch/PR/review/runner state, and the inspector exposes workspace, runner, and review controls without text overlap.

If port `5173` is already held by another Vite server, stop that stale server before using the Electron shortcut or run the renderer preview on another port:

```sh
npm run dev:renderer -- --port 5174 --strictPort
```

Renderer preview URL used during this pass: `http://127.0.0.1:5174/?issue=AGE-380`.

## Risks

- Browser-only Vite preview still reports the desktop API unavailable; API-backed issue state requires Electron preload.
- The Open Zed, Simulator, and Device actions remain disabled until their owned IPC/action slices wire real launch behavior.
- The default Electron dev shortcut could not run during this pass because `5173` was already occupied by an AGE-366 Vite process.

## Files

- `src/App.tsx`
- `src/styles.css`
- `docs/handoffs/2026-05-01-age-380-cockpit-shell.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node scripts/workflow-hub.mjs api-state AGE-380 --json`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`
- Renderer screenshot smoke at 1440x920: `http://127.0.0.1:5174/?issue=AGE-380`
- Renderer screenshot smoke at 1180x760: `http://127.0.0.1:5174/?issue=AGE-380`

## Review Notes

- Local API smoke returned AGE-380 `In Progress`, workspace branch `feat/age-380-cockpit-shell`, GitHub PR status `not-found`, and Symphony/Codex/Cursor SDK runner adapters `available`.
- The selected design reference was used as direction, not a pixel-perfect spec.
- No renderer shell, filesystem, SQLite, or provider access was added.
