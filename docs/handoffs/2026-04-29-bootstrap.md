# Handoff: Bootstrap Workflow Hub

## Status

Local project scaffold created at `/Users/dylanmccavitt/projects/workflow-hub`.

The Linear track is drafted in `docs/issues/linear-track.md` but not yet created in Linear.

Dependencies are listed in `package.json` but not installed yet.

Repo-local skills have been added under `.agents/skills/` for issue startup, iOS review, Symphony visibility, runner adapters, and UI work.

## Next

1. Confirm Linear project/issue creation.
2. Confirm dependency installation.
3. Create first issue worktree after Linear returns the first issue ID.
4. Run `npm run typecheck` and `npm run build`.

## Risks

- Linear project/issue creation requires explicit user confirmation.
- `npm install` requires explicit user confirmation because it installs third-party packages.
- The current UI uses static demo data.

## Files

- `package.json`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/App.tsx`
- `src/styles.css`
- `scripts/workflow-hub.mjs`
- `docs/architecture.md`
- `docs/decisions/0001-local-first-electron.md`
- `docs/decisions/0002-runner-adapter-boundaries.md`
- `docs/plans/001-bootstrap-workflow-hub.md`
- `docs/issues/linear-track.md`
- `.agents/skills/workflow-hub-start-issue/SKILL.md`
- `.agents/skills/workflow-hub-ios-review/SKILL.md`
- `.agents/skills/workflow-hub-symphony/SKILL.md`
- `.agents/skills/workflow-hub-runners/SKILL.md`
- `.agents/skills/workflow-hub-ui/SKILL.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node scripts/workflow-hub.mjs`
- manual repo-skill structure check for `.agents/skills/*/SKILL.md`
- `git diff --check`

Not run yet:

- `npm install`
- `npm run typecheck`
- `npm run build`
- `quick_validate.py` for skills; blocked because this Python environment is missing `yaml` / PyYAML.

Dependency installation still needs explicit confirmation.
