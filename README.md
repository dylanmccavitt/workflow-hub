# Workflow Hub

Local-first control plane for the current issue/worktree workflow.

Workflow Hub is intended to show Linear issue state, Symphony dispatch state, Codex and Cursor SDK runner state, GitHub/Graphite review state, and iOS simulator/device review controls in one Codex-style workspace.

## Current Status

This repository is an initial scaffold. The UI uses static demo data while the CLI and adapters are built out issue by issue.

## Run

After dependencies are installed:

```bash
npm run dev
```

## CLI

```bash
npm run workflow -- status AGE-310
npm run workflow -- open AGE-310 --zed
npm run workflow -- open AGE-310 --xcode
npm run workflow -- review AGE-310 --sim
```

Copy `config/projects.example.json` to `config/projects.json` for local machine overrides. The local config is ignored because it may contain machine-specific paths.
