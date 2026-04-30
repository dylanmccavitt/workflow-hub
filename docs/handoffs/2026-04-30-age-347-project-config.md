# Handoff: AGE-347 Project Config

## Status

Ready for Human Review. `AGE-347` defines the local project registry/config model for canonical checkout paths, issue worktree roots, Linear hints, and optional iOS review metadata.

## Next

Review the branch diff and decide whether to add a hosted Git remote before PR review. The current `origin` is the local canonical checkout, so a normal GitHub PR cannot be opened from this workspace yet.

## Risks

- The repo remote is a local canonical checkout at `/Users/dylanmccavitt/projects/workflow-hub`, not a hosted GitHub remote. PR creation may be blocked until a hosted remote exists.
- `config/projects.json` is ignored and must stay uncommitted.

## Files

- `.gitignore`
- `config/projects.example.json`
- `config/projects.schema.json`
- `scripts/lib/project-config.mjs`
- `scripts/workflow-hub.mjs`
- `src/App.tsx`
- `src/lib/projectConfig.ts`
- `tsconfig.json`
- `package-lock.json`
- `docs/configuration.md`
- `docs/architecture.md`
- `README.md`
- `docs/handoffs/2026-04-30-age-347-project-config.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/project-config.mjs`
- `node scripts/workflow-hub.mjs config --json > /tmp/workflow-hub-config.json && node -e 'JSON.parse(require("fs").readFileSync("/tmp/workflow-hub-config.json", "utf8")); console.log("project config ok")'`
- `node scripts/workflow-hub.mjs status AGE-347`
- `node scripts/workflow-hub.mjs open AGE-347 --print`
- `node --input-type=module -e '<invalid config rejection check>'`
- `node --input-type=module -e '<temporary config/projects.json local override merge check>'`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
