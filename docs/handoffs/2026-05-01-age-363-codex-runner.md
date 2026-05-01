# Handoff: AGE-363 Codex Local Runner Adapter

## Status

Ready for Human Review on `feat/age-363-codex-local-runner`.

Implemented Codex as a first-class local runner beside Cursor SDK. The adapter launches `codex exec --json` from the resolved issue worktree, captures command, cwd, thread/session id, JSONL log path, summary path, status, summary, and explicit sandbox/approval metadata, and persists run records plus timeline events in the local registry.

The renderer now includes a Codex CLI Local Run panel with command/model/sandbox/approval controls, worktree and latest-log metadata, and Codex run events render in the issue timeline with cwd, summary, log path, and permission boundary details.

Post-review fix pass found and fixed two Electron review blockers:

- Large `api-state` JSON was truncated at roughly 64 KB when Electron spawned the workflow CLI through a pipe. The CLI now returns from `main()` instead of calling `process.exit(0)` immediately after writing JSON, so stdout can drain before process exit.
- The added Codex runner panel exposed center-pane scroll containment problems. The workspace grid now keeps the command bar fixed, makes the middle pane the vertical scrollport, contains scroll chaining, and wraps long prompt/log/path text instead of creating horizontal scrollbars.

## Next

Manual UI review path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-363 npm run dev
```

Open `AGE-363`, confirm the Codex CLI Local Run panel shows command `codex`, sandbox `workspace-write`, approvals `never`, and the issue worktree. For a no-write smoke run, switch sandbox to `read-only`, enter a short prompt, and click Run. The timeline should show `AGE-363 Codex run finished` with the cwd, log path, and boundary metadata.

If this local review-fix commit has not been pushed yet, push it to PR #13 before merging.

## Risks

- Real Codex execution can consume model quota. The validated smoke prompt used `read-only` plus `approvalPolicy=never`.
- The adapter intentionally does not expose `danger-full-access`; Codex mutations are limited to the issue worktree through `workspace-write`, or blocked by `read-only`.
- Stop/cancel/resume controls and a unified runner timeline remain follow-up issue scope.
- `npm install` reports the existing 10 production advisories already seen from the Cursor SDK dependency stack.

## Files

- `config/projects.example.json`
- `config/projects.schema.json`
- `docs/architecture.md`
- `docs/handoffs/2026-05-01-age-363-codex-runner.md`
- `electron/main.cjs`
- `electron/preload.cjs`
- `scripts/lib/codex-runner.mjs`
- `scripts/lib/codex-runner.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/lib/project-config.mjs`
- `scripts/workflow-hub.mjs`
- `src/App.tsx`
- `src/lib/workflowHubApi.ts`
- `src/styles.css`

## Checks

- `node --check scripts/lib/codex-runner.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --test scripts/lib/codex-runner.test.mjs scripts/lib/local-api-service.test.mjs scripts/lib/cursor-runner.test.mjs scripts/lib/project-config.test.mjs scripts/lib/registry-db.test.mjs`
- `node scripts/workflow-hub.mjs codex-run AGE-363 --prompt "Dry-run Codex local runner wiring for AGE-363." --dry-run --json`
- `node scripts/workflow-hub.mjs codex-run AGE-363 --prompt "Smoke test for Workflow Hub AGE-363. Do not edit files. Reply with one sentence: Codex adapter smoke test complete." --sandbox read-only --approval-policy never --json`
- `node scripts/workflow-hub.mjs api-state AGE-363 --json`
- spawned `node scripts/workflow-hub.mjs api-state AGE-363 --json` through `child_process.spawn`; parsed 73984 bytes successfully after the CLI exit fix
- `WORKFLOW_HUB_ISSUE_ID=AGE-363 npm run dev`; visually confirmed Electron loads AGE-363, the command bar stays visible, center content scrolls vertically, and prompt textareas no longer show horizontal scrollbars
- `node scripts/workflow-hub.mjs codex-run AGE-363 --prompt "Dry-run Codex local runner wiring after review fixes." --dry-run --json`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`

## Review Notes

- Dry-run returned command `codex --sandbox workspace-write --ask-for-approval never exec --json --cd /Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-363 ...`.
- Read-only smoke run finished with session/thread `019de3ef-b084-7ae3-aaeb-e915dd5a913e` and summary `Codex adapter smoke test complete.`
- Smoke log path: `/Users/dylanmccavitt/Library/Application Support/Workflow Hub/codex-runs/AGE-363/codex-age-363-20260501142709-33cb29b2-cbfa-4eef-a8f0-026418ffd69b.jsonl`
