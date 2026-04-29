# Plan: Bootstrap Workflow Hub

## Goal

Create the initial local project and issue track for a Codex-style GUI that centralizes Linear, Symphony, Graphite/GitHub, Codex, Cursor SDK, and iOS simulator/device review.

## Scope

- Create the local Electron/Vite scaffold.
- Add repo workflow docs.
- Add the first static Codex-style UI.
- Add a CLI stub for issue workspace resolution.
- Draft the Linear track with dependencies.

## Steps

1. Create canonical repo at `/Users/dylanmccavitt/projects/workflow-hub`.
2. Add docs, app shell, and workflow CLI stub.
3. Create Linear project/issues after user confirmation.
4. Create the first issue worktree from the selected Linear issue.
5. Install dependencies after user confirmation.
6. Run typecheck/build once dependencies are available.
7. Open PR for the first implementation branch.

## Risks

- Linear connector may not support every needed project/dependency operation.
- Cursor SDK APIs are in public beta and may change.
- Device review still depends on Xcode signing and local device trust.
- Symphony state may need a custom adapter if its local API is unstable.

## Validation Plan

- `npm run typecheck`
- `npm run build`
- `npm run workflow -- status <issue>`
- Manual launch of `npm run dev`
- For iOS review slices, verify simulator/device launch from a real issue worktree.
