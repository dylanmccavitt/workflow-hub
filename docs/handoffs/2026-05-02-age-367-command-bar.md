# Handoff: AGE-367 Command Bar And Action Confirmation Flow

## Status

Implemented on `feat/age-367-command-bar-confirmations`.

Workflow Hub now has a keyboard-friendly command palette from the bottom command bar. `Cmd K` opens searchable commands for opening issue/PR surfaces, focusing review surfaces, dispatching Codex/Cursor, moving Linear status, and showing unavailable PR-write/upload/delete actions as explicit guarded surfaces.

Risky command-bar actions do not execute directly. Linear status moves and runner dispatch open a specific confirmation dialog with the issue, destination, action detail, optional Workpad/dispatch note, explicit confirmation, sensitive-data confirmation, and dispatch dry-run control. Successful command-bar actions prepend local command result rows to the selected issue timeline, while API-backed Linear writes and dispatches still refresh the persisted local event timeline from the existing local API.

PR comments, artifact uploads, and destructive worktree deletion remain unavailable because this slice does not add GitHub write, upload, or cleanup adapters. They are visible in the palette as disabled guarded commands with specific destinations and reasons.

## Next

Manual review path:

```sh
npm run dev:renderer -- --port 5174
```

Open `http://127.0.0.1:5174/?issue=AGE-367`, click the bottom command bar, and verify the palette lists open, review, dispatch, status, PR, upload, and delete surfaces. In the Electron app where the desktop bridge is available, use `Cmd K`, search `human` or `dispatch`, and confirm the selected risky action opens the specific confirmation dialog before any write or runner dispatch can run.

## Risks

- Browser preview cannot execute desktop bridge writes, so status/dispatch commands are disabled there. Electron review is needed for live write/dispatch execution.
- Chrome reserves some command shortcuts before page scripts, so click the command bar in browser preview if `Cmd K` is intercepted. Electron should receive the shortcut normally.
- PR comments, uploads, and delete actions are intentionally blocked until dedicated adapters own those writes.

## Files

- `src/App.tsx`
- `src/styles.css`
- `docs/handoffs/2026-05-02-age-367-command-bar.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `npm run typecheck`
- `npm run build`
- `npm run test`
- `npm run lint`
- `git diff --check`
- `curl -I 'http://127.0.0.1:5174/?issue=AGE-367'`

## Review Notes

- `npm install` was required because the issue workspace had no `node_modules/`; no dependency files changed.
- Renderer smoke used Vite on `http://127.0.0.1:5174/?issue=AGE-367` because `5173` was already occupied.
- Headless Chrome DevTools smoke confirmed `Cmd K` dispatch opens `.command-palette` and the palette lists open/review/dispatch/status/PR/guardrail commands.
