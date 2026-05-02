# Decision 0008: Local Permissions And Secret Guardrails

## Chosen

Workflow Hub keeps local permission checks in a shared Node-side guardrail module and exposes the resulting policy state to the renderer.

Risky actions require action-time confirmation before the local API starts a runner, changes workflow state, opens explicit review tooling, or uploads artifacts. Prompt and Workpad text is scanned for secret-looking content before it is sent to Linear, Codex, Cursor, or any future external upload surface. If sensitive-looking content is detected, the action must include a separate sensitive-data confirmation.

Secret values are not stored in tracked project config or returned to the renderer. Project config may name environment variables, local paths, and runner settings; credential values belong in ignored environment files, the launching shell, or OS/CLI credential storage.

## Why

Workflow Hub can touch local files, issue worktrees, git, Linear, GitHub, Codex, Cursor, Symphony, Xcode, simulator/device review flows, logs, and screenshots. Those surfaces have different blast radii, so the app needs one auditable permission model instead of scattered button-level checks.

## Options Considered

- Rely on UI disabled states only.
- Keep every adapter responsible for its own permission checks.
- Add one shared guardrail module behind the local API boundary and render that policy state in the cockpit.

## Tradeoffs

Shared checks add a small amount of ceremony to runner starts and status writes. The benefit is that CLI, Electron, and future UI actions fail closed in the same way, and the renderer can show unavailable credentials or risky-action requirements without receiving secret values.

Secret detection is intentionally conservative. It can produce false positives, so the model allows an explicit sensitive-data confirmation rather than permanently blocking every suspicious string.

## Consequences

- Direct Codex and Cursor starts require confirmation for real runs.
- Linear Workpad notes, runner prompts, and dispatch prompts are scanned before external transmission.
- Artifact uploads remain blocked by default until a dedicated upload action calls the artifact guardrail.
- `config/projects.json` remains ignored for machine-local paths, but direct secret values are rejected; use environment variables or OS-managed CLI auth instead.
- The renderer shows policy, credential, and artifact states from the typed local API instead of reading secrets or local files directly.
