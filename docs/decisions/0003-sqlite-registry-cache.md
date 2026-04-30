# Decision 0003: SQLite Registry Cache

## Chosen

Use SQLite through `better-sqlite3` for the local Workflow Hub registry and event store.

## Why

Workflow Hub needs fast local reads for issue/worktree/runner/review state while keeping Linear, git, PR providers, and repo docs as the durable sources of truth. SQLite gives the app a rebuildable local cache with transactions, indexes, and simple file-based deployment.

`better-sqlite3` keeps the first registry implementation small and synchronous on the Node side. The renderer should not talk to the database directly.

## Options Considered

- `better-sqlite3` synchronous Node adapter.
- `sqlite3` asynchronous Node adapter.
- `node:sqlite`, which is still not the safest dependency target for this app baseline.
- JSON files, which are easier to inspect but weaker for indexed state and timeline queries.

## Tradeoffs

`better-sqlite3` is a native dependency, so Electron packaging may later need native-module rebuild handling. The simpler API is worth that cost for the first local registry slice.

## Consequences

- The registry schema lives behind migrations and `PRAGMA user_version`.
- The database is a cache and event store, not source of truth for workflow decisions.
- Repository helpers stay in the Node/local-daemon boundary.
- Future Electron packaging work must account for the native SQLite dependency.
