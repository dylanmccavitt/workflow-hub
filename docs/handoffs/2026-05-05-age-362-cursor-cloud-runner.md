# Handoff: AGE-362 Cursor Cloud Runner And Artifacts

## Status

Implemented on `feat/age-362-cursor-cloud-runner`.

The Cursor SDK runner now has explicit local versus cloud runtime support. Project config accepts `runners.cursor.cloud` with connected repository URL, starting ref, environment shape, PR behavior flags, optional base URL, and API-key environment variable name. No Cursor API key values are stored in tracked files.

The Node-side runner adapter supports Cursor cloud start, status, resume, cancel, and result fetch through the Cursor SDK `CloudApiClient`. Cloud run records persist runtime, agent/run IDs, connected repository, raw agent/run payloads, PR links, artifact metadata, and temporary artifact download URLs when available.

The CLI, Electron main/preload bridge, typed renderer API, and Cursor runner panel now expose cloud controls. The UI makes runtime explicit, keeps local worktree runs separate from cloud repository runs, shows PR/artifact summaries when returned, and states that simulator/device review stays local.

## Next

Manual review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-362 npm run dev
```

Open `AGE-362`, scroll to the Cursor SDK panel, and confirm:

- Runtime can be switched between `Local worktree` and `Cursor cloud`.
- Cloud is disabled until `runners.cursor.cloud.enabled` is true in ignored/local config.
- Local mode still shows the issue worktree and `.cursor` config path.
- Cloud mode shows the connected repository, Start/Status/Result/Cancel/Resume controls, PR summary, and artifact summary.
- Simulator and device review controls remain separate from the Cursor cloud runtime.

For non-mutating CLI validation:

```sh
node scripts/workflow-hub.mjs cursor-run AGE-362 --prompt "Dry-run Cursor local/cloud runtime selection for AGE-362." --dry-run --runtime local --json
node scripts/workflow-hub.mjs api-state AGE-362 --json
```

Real cloud runs require `CURSOR_API_KEY` or the configured cloud `apiKeyEnv` in the launching shell and `runners.cursor.cloud.enabled: true` in ignored local config.

## Risks

- Real Cursor cloud runs can consume Cursor/model quota and can create PRs when `autoCreatePR` is enabled.
- Artifact download URLs are provider-issued temporary URLs. Workflow Hub records/display them but still does not upload local artifacts.
- The in-app browser automation tool was unavailable in this session, so UI review used a headless Chrome screenshot of the renderer preview. Because renderer-only preview has no Electron preload API, the final manual check should run through Electron with `npm run dev`.

## Files

- `config/projects.example.json`
- `config/projects.schema.json`
- `docs/architecture.md`
- `docs/decisions/0009-cursor-cloud-runner-boundary.md`
- `docs/handoffs/2026-05-05-age-362-cursor-cloud-runner.md`
- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/lib/cursor-runner.mjs`
- `scripts/lib/cursor-runner.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/project-config.mjs`
- `scripts/lib/security-guardrails.mjs`
- `scripts/workflow-hub.mjs`
- `src/App.tsx`
- `src/lib/projectConfig.ts`
- `src/lib/workflowHubApi.ts`

## Checks

- `node --check scripts/lib/cursor-runner.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check scripts/lib/project-config.mjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --test scripts/lib/cursor-runner.test.mjs scripts/lib/local-api-service.test.mjs scripts/lib/project-config.test.mjs scripts/lib/security-guardrails.test.mjs`
- `node scripts/workflow-hub.mjs cursor-run AGE-362 --prompt "Dry-run Cursor local/cloud runtime selection for AGE-362." --dry-run --runtime local --json`
- `node scripts/workflow-hub.mjs api-state AGE-362 --json`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run dev:renderer -- --host 127.0.0.1 --port 5174`
- Headless Chrome screenshot saved to `/tmp/workflow-hub-age-362.png`; renderer preview loaded but showed expected desktop API unavailable notices outside Electron.

## Review Notes

- Cursor SDK package inspection used `@cursor/sdk@1.0.11`; its published types expose `CloudApiClient.createAgent`, `createRun`, `getRun`, `cancelRun`, `listArtifacts`, and `getArtifactDownloadUrl`.
- `api-state AGE-362 --json` reports Cursor SDK config with `cloud.enabled: false`, repository URL, starting ref, and `CURSOR_API_KEY` as an env-var name only.
- `npm install` was needed in the issue workspace because `node_modules` was absent; it reported the existing 10 vulnerabilities already known from the Cursor SDK dependency stack.
