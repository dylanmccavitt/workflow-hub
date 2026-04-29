---
name: workflow-hub-ui
description: Build or polish Workflow Hub's Codex-style desktop UI. Use when changing React/Electron screens, issue board layout, command bar, runner timeline, inspector panels, review controls, visual hierarchy, or local workflow cockpit interactions.
---

# Workflow Hub UI

Use this for renderer and desktop UI work.

## Product Shape

Workflow Hub should feel like a focused coding-agent cockpit:

- left rail for app areas
- issue/project list
- center issue timeline
- right inspector for worktree, runner, PR, Symphony, and iOS review state
- bottom command bar

## UI Rules

- Build the usable workflow screen first; do not create a marketing landing page.
- Keep operational density high and visual decoration low.
- Use icons for actions when possible.
- Cards are for individual issue/run items, not for nesting page sections inside cards.
- Text must fit at desktop sizes; do not use viewport-scaled fonts.
- Buttons should map to real command/API actions as soon as the backend exists.

## Validation

- Run `npm run typecheck` after TypeScript changes when dependencies are installed.
- Run `npm run build` before PR closeout.
- For layout changes, start the app and visually inspect the main desktop viewport.
