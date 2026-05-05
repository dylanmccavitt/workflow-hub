# Decision 0009: Cursor Cloud Runner Boundary

## Chosen

Extend the existing Cursor SDK adapter with an explicit `local` versus `cloud` runtime instead of adding a separate runner kind.

Cursor cloud config lives under `runners.cursor.cloud` and stores only repository/runtime settings plus API-key environment variable names. Cloud operations run behind the Node-side local API boundary and support start, status, resume, cancel, and result fetch. Result fetch records PR links and cloud artifact metadata/download URLs when Cursor exposes them.

## Why

Cursor local and Cursor cloud share the same provider, model, prompt, and run-record shape, but they have different execution boundaries. Keeping one Cursor runner with an explicit runtime makes those boundaries visible without hiding cloud execution behind local worktree language.

## Options Considered

- Treat Cursor cloud as a separate runner kind.
- Keep cloud support CLI-only until a later UI issue.
- Add runtime selection to the existing Cursor SDK runner.

## Tradeoffs

One runner kind with runtime metadata keeps the UI compact, but every action must be careful about local worktree versus connected remote repository behavior.

## Consequences

- Cursor cloud can run non-device tasks in connected repositories.
- Simulator and device review remain local-only review flows.
- Cursor API keys stay in local environment variables, ignored config, or local auth, never tracked config values.
- Cloud artifacts are displayed as remote provider artifacts; Workflow Hub still does not auto-upload local logs, screenshots, or config files.
