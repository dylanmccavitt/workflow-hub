# Handoff: AGE-359 Graphite Stack Visibility

## Status

Ready for Human Review on `feat/age-359-graphite-stack-visibility`.

Implemented the Graphite stack visibility slice behind the local API boundary. The new read-only Graphite adapter checks that `gt` is installed and the repo is already Graphite-initialized before running stack commands, resolves candidates from GitHub PR state, Linear PR/branch metadata, and the issue workspace branch, then reads stack order and direct parent/child branches through the Graphite CLI.

The renderer now shows a separate Graphite Stack inspector panel next to the existing GitHub PR panel. GitHub remains the PR/check/review fallback source, and Graphite degrades to a deep link when a branch is untracked, Graphite is not initialized, or the CLI is unavailable.

## Next

Review PR #10:

```text
https://github.com/DylanMcCavitt/workflow-hub/pull/10
```

Manual UI review path:

```sh
npm run dev
```

Open `AGE-359` and confirm the inspector shows both GitHub PR fallback state and the Graphite Stack panel. For a Graphite-tracked branch, confirm stack position, parent/child PR branches, submit state, merge state, stack order, and Graphite links render without replacing the GitHub PR panel.

## Risks

- Graphite does not expose a JSON CLI shape for the stack commands used here, so the adapter parses the human `gt log --stack` output conservatively.
- The adapter intentionally avoids running `gt log` unless local Graphite metadata already exists, so a repo that has `gt` installed but has not been initialized shows a recoverable `not-configured` Graphite state and a deep link.
- Current AGE-359 workspace branch is not tracked in Graphite, so local smoke output reports Graphite `not-found`; fixture tests cover the tracked-stack path.

## Files

- `scripts/lib/graphite-stack-state.mjs`
- `scripts/lib/graphite-stack-state.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-04-30-age-359-graphite-stack-visibility.md`

## Checks

- `node --test scripts/lib/graphite-stack-state.test.mjs scripts/lib/github-pr-state.test.mjs scripts/lib/local-api-service.test.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/graphite-stack-state.mjs`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run workflow -- api-state AGE-359 --json`
- `npm run workflow -- api-state AGE-358 --json`
- `WORKFLOW_HUB_ISSUE_ID=AGE-359 npm run dev`

## Review Notes

- `api-state AGE-359` now returns both `pullRequests[0].provider: "GitHub"` and `pullRequests[1].provider: "Graphite"`.
- With the current untracked branch, GitHub resolves PR #10 as `available` and Graphite reports `not-found` with a Graphite deep link, preserving fallback behavior.
- `api-state AGE-358` still resolves the merged GitHub PR #9 as `available`, while Graphite separately falls back to the Graphite PR deep link because that completed issue workspace is gone.
- Electron smoke launched `AGE-359` successfully; the dev process was stopped after startup validation.
- The Graphite adapter remains read-only and does not create PRs, submit stacks, merge stacks, initialize Graphite, or open Graphite UI directly.
