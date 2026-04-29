---
name: workflow-hub-symphony
description: Implement or inspect Symphony visibility in Workflow Hub. Use when working on Symphony queue state, workflow files, state endpoints, run logs, trigger routing, Linear state transitions, or GUI surfaces that show Symphony as a first-class runner.
---

# Workflow Hub Symphony

Use this for Symphony adapter and visibility work.

## Goals

- Make Symphony visible in the GUI: running/stopped/error, watched projects, queue, active runs, blocked reasons, last trigger, and worker logs.
- Keep Symphony as workflow state, not a hidden side effect.
- Link Symphony state back to Linear issue, worktree, runner, PR, and handoff evidence.

## Adapter Rules

- Prefer reading a stable Symphony state endpoint if available.
- If the endpoint is unavailable, read documented local state/log files.
- Normalize state for the UI without losing raw details.
- Do not mutate Linear or start workers from a passive visibility task.
- If comments are used as context, remember that issue status drives dispatch.

## Validation

- Test parser/normalizer functions with sample state payloads before wiring UI.
- Verify that stale or missing Symphony state is shown as an explicit unavailable/error state, not as empty success.
