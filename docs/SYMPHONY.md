# Symphony

This repo is wired for the local Symphony Elixir runner through the root `WORKFLOW.md`.

## Requirements

- Local Symphony repo at `/Users/dylanmccavitt/projects/symphony/elixir`.
- `LINEAR_API_KEY` exported in the shell that starts Symphony.
- Local Codex at `/opt/homebrew/bin/codex`.
- `mise` available on PATH for the Symphony Elixir runtime.

Optional:

- Set `WORKFLOW_HUB_REPO_URL` if Symphony should clone from a Git remote instead of the local canonical checkout.
- Set `SYMPHONY_PORT`, `SYMPHONY_LOGS_ROOT`, `SYMPHONY_DIR`, or `WORKFLOW_HUB_WORKFLOW_FILE` to override the defaults in `scripts/symphony/start`.

## Start

From the canonical checkout:

```sh
export LINEAR_API_KEY=...
scripts/symphony/start
```

The start script intentionally includes Symphony's required acknowledgement flag:

```sh
--i-understand-that-this-will-be-running-without-the-usual-guardrails
```

By default the dashboard/API listens on `http://127.0.0.1:4002`, logs go under `/Users/dylanmccavitt/.codex/symphony-logs/workflow-hub`, and workspaces are created under `/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub`.

## Linear Routing

Symphony watches Linear project `workflow-hub-32ae906a2f1a`.

Active states:

- `Ready`
- `Todo`
- `In Progress`
- `Needs Fixes`
- `Rework`
- `Merging`

Terminal states:

- `Done`
- `Closed`
- `Canceled`
- `Cancelled`
- `Duplicate`

Use Linear state to control dispatch. Comments are context only unless they use the configured `symphony:` trigger in a review state.

## Current Repo Caveat

This repo currently has no `origin` remote configured. Symphony can still create issue workspaces by cloning the local canonical checkout, but agents cannot push or open PRs until a remote is added or `WORKFLOW_HUB_REPO_URL` points at one.

When no remote exists, agents should commit locally in the issue workspace, update the Linear workpad and repo handoff, and record push/PR as blocked by the missing remote instead of pretending the review path is complete.
