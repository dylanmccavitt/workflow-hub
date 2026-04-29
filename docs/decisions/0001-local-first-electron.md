# Decision 0001: Local-First Electron App

## Chosen

Build Workflow Hub as a local-first Electron app with a React/Vite renderer.

## Why

The workflow depends on local worktrees, git commands, Xcode, iOS Simulator, device signing, local Firebase config, Codex, and Symphony. A purely hosted app would still need a local runner for the highest-value actions.

Electron is the easiest initial desktop shell because the UI can be built with familiar web tooling while still having a local process boundary for shell and filesystem adapters.

## Options Considered

- Hosted web app with local daemon.
- Tauri desktop app.
- Electron desktop app.
- Terminal-only CLI.

## Tradeoffs

Electron is heavier than Tauri, but it lowers setup risk and gives a fast route to a Codex-style interface. Tauri can be reconsidered after the workflow is proven.

## Consequences

- The first milestone can ship as a local desktop app.
- Local shell operations stay behind explicit adapter boundaries.
- The renderer must not receive broad filesystem or shell access.
