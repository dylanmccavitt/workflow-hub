---
name: workflow-hub-runners
description: Build Workflow Hub runner integrations. Use when implementing Cursor SDK local/cloud agents, Codex runner adapters, MCP-style Codex delegation, run streaming, artifacts, cancellation, resume, or runner status persistence.
---

# Workflow Hub Runners

Use this for Cursor SDK, Codex, and runner-adapter work.

## Runner Model

- Treat Cursor SDK, Codex, and Symphony as peer systems.
- Cursor SDK can be the harness for Cursor local/cloud agents and Cursor subagents.
- Codex is not a native Cursor subagent backend; expose it through a deliberate adapter or MCP-style tool if needed.
- Symphony is orchestration/dispatch state, not a replacement for run logs.

## Cursor SDK Work

- Use official Cursor docs/examples when changing SDK integration.
- Support local agents against issue worktrees first.
- Add cloud agents only when repo credentials and artifact handling are explicit.
- Persist agent IDs, run IDs, status, stream summaries, artifacts, and PR links.

## Codex Adapter Work

- Launch Codex in the exact issue worktree.
- Capture command, cwd, session/log path, status, and summary.
- Do not hide Codex permission or approval boundaries behind Cursor.
- Keep a future MCP tool shape in mind: `codex_start`, `codex_status`, `codex_logs`, `codex_stop`, `codex_result`.

## Validation

- Unit-test run state normalization.
- Run the touched runner path directly.
- Keep runner failures visible in the GUI with raw enough detail for recovery.
