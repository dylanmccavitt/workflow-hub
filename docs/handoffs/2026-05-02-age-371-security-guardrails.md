# Handoff: AGE-371 Local Permissions And Secret Guardrails

## Status

Implemented on `feat/age-371-security-guardrails`.

Workflow Hub now has a shared Node-side guardrail module for local permission and secret handling policy. The local API exposes policy, credential, and artifact-upload states to the renderer without returning secret values. Linear Workpad notes, Codex prompts, Cursor prompts, and dispatch prompts are scanned for secret-looking content before external transmission; sensitive-looking content requires explicit sensitive-data confirmation. Real Codex and Cursor local runs now require action-time confirmation, while dry-runs remain available without runner confirmation.

Project config now rejects direct secret-looking fields/values and keeps `apiKeyEnv` constrained to environment variable names. Artifact uploads remain blocked by default until a dedicated upload action calls the guardrail.

The cockpit UI now shows security policy state, unavailable credentials, blocked artifact-upload state, and explicit confirmation controls for direct Codex/Cursor runs, Ready dispatch, and Workpad notes.

## Next

Manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-371 npm run dev
```

Open `AGE-371` and confirm the inspector Security panel shows policy `2026-05-01`, Linear API credential state, Cursor credential state, Codex/GitHub OS-credential notes, and uploads blocked. In the Codex/Cursor runner panels, verify Run is disabled until the runner confirmation checkbox is selected. For a CLI smoke, use dry-runs unless intentionally starting a real runner.

## Risks

- Secret detection is conservative and can false-positive on fake or example token strings. The UI/API allow an explicit sensitive-data confirmation for intentional cases.
- Codex and GitHub auth are reported as `not-checked` because Workflow Hub delegates those secrets to their CLI/OS credential stores and does not read token values.
- There is still no artifact upload feature; this slice prevents accidental upload by keeping uploads blocked and adding a reusable guardrail for future upload actions.

## Files

- `scripts/lib/security-guardrails.mjs`
- `scripts/lib/security-guardrails.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/lib/project-config.mjs`
- `scripts/lib/project-config.test.mjs`
- `scripts/workflow-hub.mjs`
- `electron/main.cjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `config/projects.schema.json`
- `AGENTS.md`
- `docs/architecture.md`
- `docs/configuration.md`
- `docs/decisions/0008-local-permissions-and-secret-guardrails.md`
- `docs/handoffs/2026-05-02-age-371-security-guardrails.md`

## Checks

- `node --check electron/main.cjs && node --check electron/preload.cjs && node --check scripts/workflow-hub.mjs && node --check scripts/lib/security-guardrails.mjs && node --check scripts/lib/local-api-service.mjs`
- `node --test scripts/lib/security-guardrails.test.mjs scripts/lib/project-config.test.mjs scripts/lib/local-api-service.test.mjs`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check`
- `npm run lint`
- `git diff --check`
- `node scripts/workflow-hub.mjs api-state AGE-371 --json`
- `node scripts/workflow-hub.mjs codex-run AGE-371 --prompt "Dry-run guardrail smoke for AGE-371." --dry-run --json`
- `node scripts/workflow-hub.mjs codex-run AGE-371 --prompt "Real run guardrail smoke without confirmation." --json` failed as expected with confirmation required.
- `node scripts/workflow-hub.mjs cursor-run AGE-371 --prompt "token=FAKE_TOKEN_VALUE_1234567890" --dry-run --json` failed as expected with sensitive-data confirmation required.
- `node scripts/workflow-hub.mjs cursor-run AGE-371 --prompt "Sensitive override smoke token=FAKE_TOKEN_VALUE_1234567890" --dry-run --sensitive-data-confirmed --json`
- Short Electron dev smoke started Vite at `http://127.0.0.1:5173/` with `WORKFLOW_HUB_ISSUE_ID=AGE-371`, then terminated the spawned process.

## Review Notes

- `api-state AGE-371` returned security `available`, 7 action policies, Linear credential `available`, Cursor credential `unavailable`, uploads disabled, and workspace branch `feat/age-371-security-guardrails`.
- Focused and full test suites pass with 66 tests.
- `npm install` was required because this fresh issue workspace did not have `node_modules/`; no dependency files changed.
