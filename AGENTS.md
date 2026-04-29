# Workflow Hub Instructions

## How To Run

- Install dependencies with `npm install`.
- Start the Electron app with `npm run dev`.
- Run the renderer only with `npm run dev:renderer`.
- Use the local workflow CLI with `npm run workflow -- <command>`.

## Checks

- Typecheck: `npm run typecheck`.
- Lint: `npm run lint`.
- Build: `npm run build`.
- Full check: `npm run check`.

## Coding Rules

- One issue = one branch = one worktree = one Codex thread.
- Keep `main` as the canonical checkout.
- Do implementation in an issue worktree, then open a PR for review.
- Use repo-local skills in `.agents/skills/` when the task matches them:
  - `workflow-hub-start-issue` for issue startup, branch/worktree setup, and handoff flow.
  - `workflow-hub-ios-review` for Simulator, device, Xcode, and issue-worktree review automation.
  - `workflow-hub-symphony` for Symphony queue/state/run visibility.
  - `workflow-hub-runners` for Cursor SDK, Codex, and runner adapter work.
  - `workflow-hub-ui` for Codex-style Electron/React UI work.
- Use TypeScript for renderer code.
- Keep Electron main/preload code small and security-oriented.
- Do not put secrets in tracked files.
- Keep machine-specific paths in `config/projects.json`, which is ignored.
- Keep source-of-truth workflow state in Linear, PRs, repo docs, and code. The app may cache and display state, but it must not become the only source of truth.

## Guardrails

- Do not commit API keys, OAuth tokens, local service credentials, or Firebase plist contents.
- Do not perform destructive worktree cleanup from the GUI without explicit confirmation.
- Do not let background runners mutate a worktree unless the active issue owns that worktree.
- Simulator review should use isolated DerivedData paths.
- Device review may open Xcode because signing, device trust, and provisioning are local Apple state.

## Definition Of Done

- The issue acceptance criteria are met.
- Relevant checks pass.
- The handoff doc for the issue is updated.
- The PR includes owned paths and verification evidence.
- Linear status and workpad are updated.
- Canonical `main` is fast-forwarded after merge.
