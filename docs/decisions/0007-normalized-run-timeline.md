# Decision 0007: Normalized Run Timeline

## Chosen

Expose a local API `runTimeline` that normalizes Symphony, Codex, and Cursor runner activity into one state model: queued, starting, running, blocked, cancelling, cancelled, succeeded, failed, and unknown.

## Why

Each runner reports different status names and payload shapes. The GUI needs a single timeline for scanning run health, but debugging still needs raw provider IDs, log paths, sessions, and event payloads.

## Options Considered

- Render each runner's native stream separately.
- Collapse provider statuses into generic available/unavailable adapter states.
- Normalize status and timeline display while preserving raw details.

## Tradeoffs

The normalized layer adds one translation point that must be tested as provider shapes evolve. Keeping raw status and raw event payloads alongside normalized state avoids hiding data needed for recovery.

## Consequences

- The renderer can show failures, blocked states, and cancellations consistently across runners.
- Registry events remain provider-specific and raw enough for debugging.
- Symphony stays passive observability state; Codex and Cursor remain local runner adapters.
