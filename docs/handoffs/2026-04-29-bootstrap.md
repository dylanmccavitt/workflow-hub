# Handoff: Bootstrap Workflow Hub

## Status

Local project scaffold created at `/Users/dylanmccavitt/projects/workflow-hub`.

Linear project created: [Workflow Hub](https://linear.app/agentcee/project/workflow-hub-32ae906a2f1a).

Linear parent track created: `AGE-346` `[Workflow Hub] Track - Build local agent workflow cockpit`.

Child issues created and wired with blocker relationships: `AGE-347` through `AGE-373`.

The local Linear track mirror is in `docs/issues/linear-track.md`.

Dependencies are listed in `package.json` but not installed yet.

Repo-local skills have been added under `.agents/skills/` for issue startup, iOS review, Symphony visibility, runner adapters, and UI work.

## Next

1. Start `AGE-347` `[Foundation] Local project registry and config model`.
2. Create one branch and one worktree for `AGE-347`.
3. Confirm dependency installation before running `npm install`.
4. Run `npm run typecheck` and `npm run build` after dependencies are installed.

## Risks

- `npm install` requires explicit user confirmation because it installs third-party packages.
- The current UI uses static demo data.
- The Linear track is intentionally subject to change as implementation reveals better issue boundaries.

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
- Linear project and issue readback after creation

Not run yet:

- `npm install`
- `npm run typecheck`
- `npm run build`
- `quick_validate.py` for skills; blocked because this Python environment is missing `yaml` / PyYAML.

Dependency installation still needs explicit confirmation.
