---
name: workflow-hub-start-issue
description: Start or resume Workflow Hub issue work. Use when working on a Linear issue, creating a branch/worktree, reading project docs, updating handoffs, or enforcing the one issue = one branch = one worktree = one PR review workflow in this repo.
---

# Workflow Hub Start Issue

Use this first for any implementation, review, or resume task in this repo.

## Startup Order

1. Read the newest relevant handoff in `docs/handoffs/`.
2. Read any active plan in `docs/plans/`.
3. Read the Linear issue or `docs/issues/linear-track.md` if the issue does not exist yet.
4. Read `AGENTS.md`.
5. Read `docs/architecture.md`.
6. Read relevant decision docs in `docs/decisions/`.
7. Inspect code and tests.

## Worktree Rule

- Keep `/Users/dylanmccavitt/projects/workflow-hub` as canonical `main`.
- Do issue implementation in a separate worktree.
- Use branch names shaped like `feat/age-123-short-scope` when the issue exists.
- If Linear is not created yet, use a temporary local branch only for repo bootstrap work and record that in the handoff.

## Done Rule

Before calling work done:

- Run the relevant checks.
- Update the issue handoff in `docs/handoffs/`.
- Update Linear workpad/status when Linear exists.
- Open a PR for review when a remote exists.
- After merge, fast-forward canonical `main`.
