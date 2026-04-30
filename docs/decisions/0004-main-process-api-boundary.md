# Decision 0004: Main-Process Local API Boundary

## Chosen

Use an Electron main-process local API service as the first privileged boundary between the React renderer and local workflow adapters.

## Why

The app needs local project config reads, scoped git probes, SQLite cache access, runner controls, PR provider reads, and iOS review commands. The renderer should only receive typed workflow state and invoke narrow, named operations. Keeping the first boundary inside Electron is enough for the current local-first app while preserving the option to move the same service behind a separate daemon later.

## Options Considered

- Keep individual renderer calls to specific preload helpers.
- Add an Electron main-process service layer.
- Start a separate localhost daemon immediately.

## Tradeoffs

The main-process service keeps the first slice small and avoids another process supervisor, but it still shares the Electron app lifecycle. Native Node modules should stay in the system Node runtime, so the main process may delegate read commands to the repo CLI instead of importing native-backed modules directly. A standalone daemon may become useful when background runs need to continue after the window closes.

## Consequences

- The renderer consumes `workflowHub.issues.getState(issueId)` instead of arbitrary IPC, filesystem, shell, or database access.
- Project config reads, git probes, and SQLite cache reads happen in Node-side service code behind the main-process IPC boundary.
- Linear, Symphony, Codex, Cursor SDK, PR, and review integrations return explicit unavailable adapter state until their owned issues wire real adapters.
- Risky actions remain future explicit API calls rather than implicit renderer permissions.
