# Workflow Hub

Local-first control plane for the current issue/worktree workflow.

Workflow Hub is intended to show Linear issue state, Symphony dispatch state, Codex and Cursor SDK runner state, GitHub/Graphite review state, and iOS simulator/device review controls in one Codex-style workspace.

## Current Status

This repository is an initial scaffold. The UI uses static demo data while the CLI and adapters are built out issue by issue.

Linear project: [Workflow Hub](https://linear.app/agentcee/project/workflow-hub-32ae906a2f1a)

Parent track: [`AGE-346`](https://linear.app/agentcee/issue/AGE-346/workflow-hub-track-build-local-agent-workflow-cockpit)

First implementation issue: [`AGE-347`](https://linear.app/agentcee/issue/AGE-347/foundation-local-project-registry-and-config-model)

## Symphony

Start the local Symphony runner with:

```sh
export LINEAR_API_KEY=...
scripts/symphony/start
```

The runner uses the root [`WORKFLOW.md`](WORKFLOW.md) and includes Symphony's required no-guardrails acknowledgement flag in the start script. See [`docs/SYMPHONY.md`](docs/SYMPHONY.md) for routing, workspace, and current local-remote caveats.

## Run

After dependencies are installed:

```bash
npm run dev
```

## CLI

```bash
npm run workflow -- config
npm run workflow -- status
npm run workflow -- status AGE-310
npm run workflow -- status AGE-310 --json
npm run workflow -- open --zed
npm run workflow -- open AGE-310 --zed
npm run workflow -- open AGE-310 --xcode
npm run workflow -- review AGE-310 --sim
```

When run inside a configured issue worktree, `status` and `open` can infer the issue ID from the worktree path. Copy `config/projects.example.json` to `config/projects.json` for local machine overrides. The local config is ignored because it may contain machine-specific paths. See [`docs/configuration.md`](docs/configuration.md) for the schema and how canonical checkouts differ from issue worktrees.
