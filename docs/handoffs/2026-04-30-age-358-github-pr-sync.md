# Handoff: AGE-358 GitHub PR And Checks Sync

## Status

Ready for Human Review on `feat/age-358-github-pr-sync`.

Implemented a read-only GitHub PR adapter behind the local API boundary. The adapter resolves PR candidates from Linear PR attachments, Linear branch metadata, and the issue-worktree git branch, then reads PR status, merge/review state, check rollups, failing check annotations, latest review comments, and GitHub links through `gh`.

The renderer inspector now has a GitHub PR panel for PR health, review decision, merge state, branch/head, failing checks with annotations, latest review comments, and direct links back to GitHub.

PR: https://github.com/DylanMcCavitt/workflow-hub/pull/9

## Next

Review PR #9 and re-run:

```sh
npm run workflow -- api-state AGE-358 --json
```

Confirm the payload resolves PR #9 and reports `pullRequests[0].status: "available"`.

Manual UI review path:

```sh
npm run dev
```

Open `AGE-358` and confirm the GitHub PR inspector panel shows PR status, checks, review comments, and GitHub links without offering comment or merge actions.

## Risks

- Check annotations are available only for failing GitHub check runs that expose a numeric check run id through the PR status rollup.
- This slice uses the locally authenticated `gh` CLI for read-only GitHub data. Missing `gh` auth, missing remotes, or absent PRs are surfaced as recoverable adapter states instead of empty success.
- Graphite stack visibility remains separate and is still owned by AGE-359.

## Files

- `scripts/lib/github-pr-state.mjs`
- `scripts/lib/github-pr-state.test.mjs`
- `scripts/lib/linear-sync.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `docs/architecture.md`
- `docs/handoffs/2026-04-30-age-358-github-pr-sync.md`

## Checks

- `node --test scripts/lib/github-pr-state.test.mjs scripts/lib/local-api-service.test.mjs`
- `node --check scripts/lib/github-pr-state.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `npm run typecheck`
- `npm run test`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run workflow -- api-state AGE-358 --json`
- `npm run workflow -- api-state AGE-356 --json`
- `WORKFLOW_HUB_ISSUE_ID=AGE-356 npm run dev`

## Review Notes

- `api-state AGE-358` resolved PR #9 with GitHub PR status `available`, state `OPEN`, merge state `CLEAN`, review `UNKNOWN`, checks `none`, and the Linear linkback comment.
- `api-state AGE-356` resolved Linear PR attachment `#8`, returned GitHub PR status `available`, included the GitHub URL, and surfaced the latest GitHub/Linear linkback comment.
- Electron smoke loaded `AGE-356` through the desktop bridge and showed the GitHub PR panel with PR #8, merged state, check counts, review comment, and GitHub link.
- No GitHub comments, reviews, merges, or status mutations are performed by the adapter.
