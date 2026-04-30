# Handoff: AGE-346 Workflow Cockpit Track

## Status

Implemented a parent-track cockpit pass on `feat/age-346-workflow-cockpit`.

The Electron shell now exposes a read-only issue workspace resolver through preload IPC. The renderer uses it for the selected `AGE-346` issue and shows the resolved worktree, branch, SHA, and dirty state without giving the renderer direct filesystem or shell access.

The main dashboard now focuses on the Workflow Hub track: current child issue lanes, acceptance criteria, source-of-truth boundaries, runner backend choices, the Ready -> Done daily flow, and review/source panels.

## Next

Open a PR for this branch. After this lands, continue with `AGE-349` to add the local daemon and renderer API boundary before wiring real Linear, Symphony, GitHub, Graphite, Codex, Cursor SDK, or iOS actions into the UI.

## Risks

- The action buttons are still visual command targets; mutating/opening actions should wait for the explicit local API and confirmation flow.
- Track and child issue data in `src/data/demo.ts` is static until Linear/PR/Symphony adapters land.
- The renderer bridge is intentionally read-only and limited to resolving the selected issue workspace.

## Files

- `electron/main.cjs`
- `electron/preload.cjs`
- `src/App.tsx`
- `src/data/demo.ts`
- `src/lib/types.ts`
- `src/styles.css`
- `src/vite-env.d.ts`
- `docs/architecture.md`
- `docs/issues/linear-track.md`
- `docs/handoffs/2026-04-30-age-346-workflow-cockpit.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run workflow -- status AGE-346`
- `git diff --check`
- `npm run dev` with Electron visual smoke test; resolver returned the AGE-346 worktree, branch, and SHA.

## Review Notes

Manual review path:

1. Run `npm run dev`.
2. Confirm the Electron window opens to the Workflow Hub cockpit.
3. Confirm the selected `AGE-346` issue shows the resolved worktree, branch `feat/age-346-workflow-cockpit`, and current SHA.
4. Confirm the dashboard shows the Ready -> Done flow, source-of-truth boundaries, explicit Symphony/Codex/Cursor runner lanes, and track acceptance criteria.
