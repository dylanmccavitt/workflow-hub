# Decision 0006: Safe Linear Writes

## Chosen

Add Linear writes as explicit local API actions, not as side effects of sync or comments.

Workflow Hub exposes named status actions for Ready, In Progress, Human Review, Needs Fixes, Merging, Done, and Blocked. Actions that can wake runners, request human review, or participate in merge/closeout require confirmation in the UI and in the Node-side write adapter. The write path also merges structured updates into the persistent `## Codex Workpad` comment and records the result in the local registry event store.

## Why

Linear is the workflow source of truth, so the GUI needs to move issues through the real states. Those writes can trigger external systems or human work, so they must be explicit, reviewable, and auditable.

## Options Considered

- Keep Workflow Hub read-only for Linear.
- Let passive sync infer and repair Linear state.
- Add explicit status/workpad actions behind the existing local API boundary.

## Tradeoffs

Explicit actions add one more click before risky transitions, but they keep dispatch boundaries visible. Merging only the owned Workpad sections avoids overwriting user or agent notes, but it requires a small structured merge helper instead of replacing the whole comment.

## Consequences

- Passive Linear sync remains read-only.
- Comments alone do not dispatch workflow activity.
- Renderer code calls a narrow `applyAction` bridge; Electron delegates to the CLI so native-backed registry access stays in the system Node runtime.
- Successful and failed Linear writes can be shown in the issue timeline from the local event store.
