# Handoff: AGE-360 Review Fix Prompt Builder

## Status

Ready for Human Review on `feat/age-360-pr-review-prompt-builder`.

Implemented an editable review-fix prompt flow for PR rework. The new prompt builder composes selected GitHub review comments, failing check annotations, Linear issue context, Codex Workpad notes, owned paths, and the current branch/worktree into a draft prompt. The renderer lets the user edit the prompt before saving it. Saving records a `review.fix_prompt.generated` event in the local registry timeline and does not dispatch a runner or mutate Linear status.

## Next

Review the PR and run the UI path:

```sh
WORKFLOW_HUB_ISSUE_ID=AGE-360 npm run dev
```

If port `5173` is already in use, run the renderer preview on another port for layout inspection:

```sh
npm run dev:renderer -- --port 5174
```

Manual review path:

1. Open AGE-360 in Workflow Hub.
2. Confirm the Fix Prompt panel appears under the Linear status actions.
3. On an issue with a linked PR, select review comments and failing checks.
4. Click Generate Draft, edit the textarea, then Save to Timeline.
5. Refresh the issue state and confirm the timeline includes `AGE-360 fix prompt saved`.

## Risks

- The AGE-360 branch has no PR yet, so live AGE-360 smoke shows no selected PR comments or failing checks. Unit tests cover selected review comment and failing check prompt composition.
- The renderer preview at `5174` does not have the Electron desktop bridge, so Generate/Save buttons are disabled there. The CLI/local API path validates the same backend draft/save behavior used by Electron.
- Runner dispatch remains intentionally unwired; this slice only prepares and persists prompts.

## Files

- `scripts/lib/review-fix-prompt.mjs`
- `scripts/lib/review-fix-prompt.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/workflow-hub.mjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-05-01-age-360-review-fix-prompt.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check scripts/lib/review-fix-prompt.mjs`
- `node --test scripts/lib/review-fix-prompt.test.mjs scripts/lib/local-api-service.test.mjs`
- `node scripts/workflow-hub.mjs fix-prompt AGE-360 --json`
- `node scripts/workflow-hub.mjs fix-prompt-save AGE-360 --prompt "AGE-360 manual validation prompt: build editable review fix prompt from PR/workpad context." --json`
- `node scripts/workflow-hub.mjs api-state AGE-360 --json`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run dev` (blocked because `127.0.0.1:5173` was already in use)
- `npm run dev:renderer -- --port 5174`

## Review Notes

- `fix-prompt AGE-360 --json` returned a draft containing the Linear issue, current Workpad, branch `feat/age-360-pr-review-prompt-builder`, worktree `/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-360`, and owned paths from the dirty workspace.
- `fix-prompt-save AGE-360 ... --json` wrote local event `51f025d8-a475-40c5-8b84-959b24caa302` with type `review.fix_prompt.generated`.
- `api-state AGE-360 --json` confirmed the saved prompt event appears under `issue.events`.
- Renderer preview at `http://127.0.0.1:5174/?issue=AGE-360` showed the Fix Prompt panel with Review Comments, Check Failures, editable Prompt Draft textarea, Generate Draft, and Save to Timeline controls. Buttons are disabled in browser preview because the desktop bridge is unavailable.
