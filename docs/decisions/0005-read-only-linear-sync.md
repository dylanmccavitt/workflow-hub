# Decision 0005: Read-Only Linear Sync

## Chosen

Use Linear's GraphQL API from the Node-side local API boundary to pull configured project issues into the SQLite registry cache.

## Why

Workflow Hub needs live issue status, priority, labels, blockers, links, PR attachments, and `## Codex Workpad` context, but Linear remains the source of truth. A read-only adapter keeps the first integration small and avoids accidental workflow mutations.

## Options Considered

- Read Linear directly in the renderer.
- Add read-only Linear sync inside the existing main-process local API.
- Build safe Linear writes at the same time.

## Tradeoffs

The adapter requires `LINEAR_API_KEY` at runtime and may show stale cache data when the key is missing or Linear is unavailable. That is acceptable because the UI exposes stale/error indicators and the cache is rebuildable.

## Consequences

- Linear writes stay out of this slice and remain owned by a follow-up issue.
- `linear.projectId` is required for configured project issue sync.
- Cached Linear metadata lives in registry metadata fields, not as a new source of truth.
