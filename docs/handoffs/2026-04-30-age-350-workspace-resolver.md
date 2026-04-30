# Handoff: AGE-350 Issue Workspace Resolver

## Status

Implemented issue workspace resolution and CLI open/status commands on `feat/age-350-workspace-resolver`.

The CLI now resolves issue IDs across configured worktree roots, ranks exact templated issue paths ahead of looser directory-name matches, and reports canonical checkout state separately from issue workspace state. `status` and `open` can infer the issue ID when run from inside a configured issue worktree, while the canonical checkout is not treated as an issue workspace.

Post-review fix: after `AGE-349` merged and this branch was rebased/restacked, `electron/main.cjs` had unresolved conflict markers. Those markers were removed, the missing project-config module URL was added, and both the `AGE-349` local API handler and `AGE-350` workspace resolver IPC handler remain registered.

## Next

Review the PR and exercise the manual CLI path from this worktree:

```sh
npm run workflow -- status
npm run workflow -- status AGE-350 --json
npm run workflow -- open --print
npm run workflow -- open AGE-350 --finder
```

For iOS projects with `ios` config, `npm run workflow -- open <issue-id> --xcode` opens the configured Xcode project/workspace inside the issue worktree. `workflow-hub` itself has no iOS config, so `--xcode` correctly reports that the selected project does not define iOS settings.

## Risks

- `--zed`, `--finder`, `--terminal`, and `--xcode` call macOS `open`; manual review should use `--print` first if the reviewer only wants to inspect the resolved target.
- The resolver intentionally scans configured roots and direct child directories only. Deeper or differently named worktrees should be added through project config or a future registry-backed slice.
- The local canonical checkout at `/Users/dylanmccavitt/projects/workflow-hub` is clean but behind `origin/main`; sync it after merge before starting the next issue.

## Files

- `scripts/lib/project-config.mjs`
- `scripts/lib/project-config.test.mjs`
- `scripts/workflow-hub.mjs`
- `electron/main.cjs`
- `README.md`
- `docs/configuration.md`
- `docs/handoffs/2026-04-30-age-350-workspace-resolver.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/project-config.mjs`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run check`
- `git diff --check`
- `npm run workflow -- status`
- `node scripts/workflow-hub.mjs status AGE-350 --json`
- `node scripts/workflow-hub.mjs open --print`
- `cd /Users/dylanmccavitt/projects/workflow-hub && node /Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-350/scripts/workflow-hub.mjs status`
- Post-review fix: `npm rebuild better-sqlite3`, `npm run check`, `git diff --check`, `npm run workflow -- status AGE-350 --json`

## Review Notes

Manual review path:

1. Run `npm run workflow -- status` inside this worktree and confirm the output shows both canonical repo and issue workspace sections.
2. Confirm the issue workspace section shows branch `feat/age-350-workspace-resolver`, head SHA, and dirty/clean status.
3. Run `npm run workflow -- open --print` and confirm it prints this issue workspace path, not the canonical checkout.
4. From the canonical checkout, run the direct script status command listed above and confirm it refuses implicit issue resolution without an issue ID.
