# Handoff: AGE-361 Cursor SDK Local Runner

## Status

Ready for Human Review on `feat/age-361-cursor-sdk-local-runner`.

Implemented the Cursor SDK local-runner slice behind the existing local API boundary. The tracked project config now has a `runners.cursor` shape for model, `.cursor` config path, and optional API-key env name. The runner module lazily loads `@cursor/sdk`, creates local agents with `local.cwd` set to the resolved issue worktree, streams SDK messages into registry events, and stores run records with agent ID, run ID, model, status, prompt, and summary metadata.

The renderer now includes a compact Cursor SDK Local Run panel and the Runners inspector shows the latest Cursor run status/config when present.

## Next

Manual UI review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-361 npm run dev
```

Open `AGE-361`, confirm the Cursor SDK Local Run panel shows model `composer-2`, the issue worktree, and the resolved `.cursor` config path. Enter a prompt and click Run only when local Cursor SDK auth/config is ready; otherwise use the dry-run CLI validation path below.

## Risks

- Real Cursor SDK execution can consume Cursor/model quota. The validated CLI dry-run proves the local cwd/config wiring without starting a paid agent.
- The SDK may still require local Cursor auth or `CURSOR_API_KEY` depending on the installed local environment. Workflow Hub records those failures as run failures rather than requiring cloud repository credentials in project config.
- `npm audit --omit=dev --json` reports unresolved production advisories from `@cursor/sdk` transitive dependencies, including `sqlite3`/`node-gyp`/`tar` and `undici`; npm reports no available fix for the direct `@cursor/sdk` advisory at `1.0.11`.
- Cancellation and a unified runner timeline remain follow-up issue scope.

## Files

- `package.json`
- `package-lock.json`
- `config/projects.example.json`
- `config/projects.schema.json`
- `scripts/lib/project-config.mjs`
- `scripts/lib/cursor-runner.mjs`
- `scripts/lib/cursor-runner.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/workflow-hub.mjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/App.tsx`
- `src/lib/projectConfig.ts`
- `src/lib/workflowHubApi.ts`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-05-01-age-361-cursor-runner.md`

## Checks

- `node --check scripts/lib/cursor-runner.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --test scripts/lib/cursor-runner.test.mjs scripts/lib/local-api-service.test.mjs scripts/lib/project-config.test.mjs scripts/lib/registry-db.test.mjs`
- `node scripts/workflow-hub.mjs cursor-run AGE-361 --prompt "Dry-run Cursor local runner wiring for AGE-361." --dry-run --json`
- `node scripts/workflow-hub.mjs api-state AGE-361 --json`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run dev:renderer -- --port 5174`
- Headless Chrome screenshot of `http://127.0.0.1:5174/?issue=AGE-361` scrolled to the Cursor SDK Local Run panel
- `npm audit --omit=dev --json` (fails with 10 reported production advisories from `@cursor/sdk` transitive dependencies; documented as residual risk)

## Review Notes

- `cursor-run --dry-run` returned `cwd: /Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-361` and `configPath: /Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-361/.cursor`.
- `api-state AGE-361 --json` reports the Cursor SDK runner as `available` with model `composer-2` and the resolved `.cursor` config path.
- Renderer preview showed the Cursor SDK Local Run panel with model input, prompt textarea, worktree/config/latest metadata, and a stable Run button layout.
