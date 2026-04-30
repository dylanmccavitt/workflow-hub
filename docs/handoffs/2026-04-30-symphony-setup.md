# Handoff: Symphony Setup

## Status

Workflow Hub now has a runnable Symphony control surface:

- Root `WORKFLOW.md` points at Linear project `workflow-hub-32ae906a2f1a`.
- Symphony workspaces are rooted at `/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub`.
- Active dispatch states are `Ready`, `Todo`, `In Progress`, `Needs Fixes`, `Rework`, and `Merging`.
- Codex runs through `/opt/homebrew/bin/codex --config shell_environment_policy.inherit=all app-server`.
- Codex policy is configured as `approval_policy: never`, `thread_sandbox: danger-full-access`, and `turn_sandbox_policy.type: dangerFullAccess`.
- `scripts/symphony/start` includes the required `--i-understand-that-this-will-be-running-without-the-usual-guardrails` flag.
- GitHub remote is now `git@github.com:DylanMcCavitt/workflow-hub.git`.
- Symphony clones new issue workspaces from that GitHub remote by default.

## Next

From the canonical checkout after this setup lands:

```sh
export LINEAR_API_KEY=...
scripts/symphony/start
```

The dashboard/API defaults to `http://127.0.0.1:4002`.

## Risks

- GitHub/Linear PR population still depends on each Symphony agent pushing its issue branch, opening a PR, and linking or mentioning the Linear issue.
- `node_modules/` is not installed in this worktree. Dependency-backed checks such as `npm run typecheck` and `npm run build` were not run.
- Starting Symphony while `AGE-347` is `Ready` will let it begin the first issue.

## Files

- `WORKFLOW.md`
- `scripts/symphony/start`
- `docs/SYMPHONY.md`
- `docs/handoffs/2026-04-30-symphony-setup.md`
- `AGENTS.md`
- `README.md`
- `config/projects.example.json`

## Checks

- Live Linear issue readback for the Workflow Hub project.
- `node -e 'JSON.parse(require("fs").readFileSync("config/projects.example.json", "utf8")); console.log("projects.example.json ok")'`
- `bash -n scripts/symphony/start`
- `node --check electron/main.cjs && node --check electron/preload.cjs && node --check scripts/workflow-hub.mjs`
- `LINEAR_API_KEY=dummy mise exec -- mix run --no-start -e '<Symphony config validation>'`
- `git diff --check`
