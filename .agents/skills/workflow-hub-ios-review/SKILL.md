---
name: workflow-hub-ios-review
description: Build iOS simulator and device review flows for Workflow Hub. Use when implementing or debugging issue-worktree review commands, Xcode project launch, Simulator launch, device review, DerivedData isolation, or ChoreLadder/Pulse iOS review automation from this app.
---

# Workflow Hub iOS Review

Use this for any work that makes iOS changes easier to review from Workflow Hub.

## Core Contract

- Resolve the issue ID to the issue worktree first.
- Never run simulator review from canonical `main` unless the user explicitly asks.
- Use isolated DerivedData per issue.
- Preserve local-only app config such as Firebase plist files; never print secret file contents.
- Treat device review as Xcode-adjacent because signing, provisioning, and device trust are local Apple state.

## Expected Commands

Keep CLI behavior aligned with:

```bash
npm run workflow -- status AGE-310
npm run workflow -- open AGE-310 --xcode
npm run workflow -- review AGE-310 --sim
npm run workflow -- review AGE-310 --device
```

## Validation

- For command work, run `node --check scripts/workflow-hub.mjs` and the touched command path.
- For UI button wiring, verify the button targets the same command path as the CLI.
- When real iOS build support lands, validate against an actual available simulator rather than a stale issue-packet destination.
