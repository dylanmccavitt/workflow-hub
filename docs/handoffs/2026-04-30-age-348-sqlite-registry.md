# Handoff: AGE-348 SQLite Registry And Event Store

## Status

Implemented SQLite registry foundation on `feat/age-348-sqlite-registry`.

The Node-side registry module uses `better-sqlite3`, bootstraps the database, applies versioned migrations through `PRAGMA user_version`, and creates cache tables for projects, issues, workspaces, runs, pull requests, review sessions, and timeline events.

## Next

Open the PR and review the repository API shape before wiring it into the Electron shell or future adapter work.

## Risks

- `better-sqlite3` is a native dependency, so later Electron packaging work may need native module rebuild handling.
- The registry is intentionally not wired into the renderer yet; it is a cache/repository foundation for later slices.
- The database must remain rebuildable from Linear, git, PR providers, repo docs, and runner logs.

## Files

- `package.json`
- `package-lock.json`
- `scripts/lib/registry-db.mjs`
- `scripts/lib/registry-db.test.mjs`
- `docs/architecture.md`
- `docs/decisions/0003-sqlite-registry-cache.md`
- `docs/handoffs/2026-04-30-age-348-sqlite-registry.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/registry-db.mjs`
- `node --check scripts/lib/registry-db.test.mjs`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`

## Review Notes

Manual review path:

1. Inspect `scripts/lib/registry-db.mjs` for schema and repository boundaries.
2. Run `npm run test` to exercise migration/version handling and CRUD helpers.
3. Run `npm run check` for the full repo check.
