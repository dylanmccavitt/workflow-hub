---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: workflow-hub-32ae906a2f1a
  active_states:
    - Ready
    - Todo
    - In Progress
    - Needs Fixes
    - Rework
    - Merging
  terminal_states:
    - Done
    - Closed
    - Canceled
    - Cancelled
    - Duplicate
  comment_trigger: "symphony:"
  comment_trigger_states:
    - Human Review
    - In Review
    - Review
polling:
  interval_ms: 30000
workspace:
  root: /Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub
hooks:
  after_create: |
    git clone "${WORKFLOW_HUB_REPO_URL:-/Users/dylanmccavitt/projects/workflow-hub}" .
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch origin main --prune || true
    fi
  before_run: |
    if git remote get-url origin >/dev/null 2>&1; then
      git fetch origin main --prune || true
    fi
  timeout_ms: 120000
agent:
  max_concurrent_agents: 2
  max_turns: 20
  max_retry_backoff_ms: 300000
  max_concurrent_agents_by_state:
    Merging: 1
codex:
  command: /opt/homebrew/bin/codex --config shell_environment_policy.inherit=all app-server
  approval_policy: never
  thread_sandbox: danger-full-access
  turn_sandbox_policy:
    type: dangerFullAccess
  turn_timeout_ms: 3600000
  stall_timeout_ms: 300000
---

You are working on Linear ticket `{{ issue.identifier }}` for Workflow Hub.

{% if attempt %}
Continuation context:
- This is retry or continuation attempt #{{ attempt }} because the ticket is still active.
- Resume from the current workspace, branch, Linear workpad, PR state, and repo handoff.
- Do not repeat completed investigation or validation unless new code or review feedback requires it.
{% endif %}

Issue context:
- Identifier: `{{ issue.identifier }}`
- Title: `{{ issue.title }}`
- State: `{{ issue.state }}`
- Labels: `{{ issue.labels }}`
- URL: `{{ issue.url }}`

Description:
{% if issue.description %}
{{ issue.description }}
{% else %}
No issue description was provided. Treat that as a blocker for implementation work and record the missing packet fields in the workpad.
{% endif %}

## Project Contract

Workflow Hub is a local-first Electron and React control plane for Linear issues, Symphony dispatch, Codex and Cursor runners, PR review state, local git worktrees, and iOS simulator/device review controls.

Keep source-of-truth workflow state in Linear, PRs, repo docs, and code. The app may cache and display state, but it must not become the only source of truth.

Work only inside this Symphony issue workspace. Preserve unrelated local changes. Do not commit secrets, API keys, OAuth tokens, Firebase plist contents, or machine-specific `config/projects.json`.

## Read Order

1. The Linear issue, including acceptance criteria, blockers, labels, and links.
2. The persistent `## Codex Workpad` comment on the Linear issue.
3. Any attached or open PR and all review comments.
4. The newest relevant file under `docs/handoffs/`.
5. Any active plan under `docs/plans/`.
6. `AGENTS.md`.
7. `docs/architecture.md`.
8. Relevant decision docs under `docs/decisions/`.
9. Code and tests.

The Linear issue and PR are the active per-issue handoff. Repo handoff files are durable resume context, not scratchpads.

Symphony dispatch is controlled by Linear state. Comments are context only: if a comment should wake the workflow, the issue state must also move to an active state or the comment must use the `symphony:` trigger in a configured review state.

## Status Routing

- `Backlog`, `Blocked`, or other inactive states: do not work.
- `Ready` or `Todo`: move the issue to `In Progress`, then create or refresh the workpad before code changes.
- `In Progress`: continue from the existing workspace, workpad, branch, and PR state.
- `Needs Fixes` or `Rework`: read all Linear and PR feedback first, add each actionable item to the workpad, fix in the same PR when possible, then revalidate.
- `Human Review`, `In Review`, or `Review`: do not modify code unless new feedback moved the issue back to an active state or a `symphony:` comment explicitly requests one review-state pass.
- `Merging`: merge only if a PR is attached, review feedback is resolved or explicitly answered, required checks/evidence are current, and the human moved the issue to this state.
- `Done`, `Closed`, `Canceled`, `Cancelled`, or `Duplicate`: do nothing.

## Workpad

Find or create one persistent Linear comment with this marker:

```md
## Codex Workpad
```

Use that one comment for all progress and handoff notes. Do not scatter separate progress comments.

Keep these sections current:

```md
## Codex Workpad

### Environment
`<host>:<abs-workdir>@<short-sha>`

### Plan
- [ ] ...

### Acceptance Criteria
- [ ] ...

### Validation
- [ ] ...

### Notes
- ...

### Blockers
- None

### Handoff
- Branch:
- PR:
- Files touched:
- Checks:
- Review/test notes:
- Review state:
- Next recommended issue:
```

For UI-facing or workflow-facing changes, include a manual review path in the acceptance criteria.

## Execution Rules

1. Reproduce or inspect current behavior before changing code when the issue is a bug, regression, or review fix.
2. Sync with `origin/main` before edits when a remote exists. If this repo still has no remote configured, branch from the local canonical `main` and record the missing remote as a PR/push blocker.
3. Use one issue branch and one issue workspace. Branch names should be shaped like `feat/<issue-id>-short-scope` unless continuing an attached PR branch.
4. Keep scope inside the issue owned paths. If an out-of-scope problem appears, create or recommend a follow-up Linear issue instead of widening the PR.
5. Use TypeScript for renderer code. Keep Electron main/preload code small and security-oriented.
6. Keep local secrets and machine-specific paths out of tracked files. Use ignored local config for `config/projects.json`.
7. Stage specific files only.
8. Commit with the project style: `[age-123]: describe change`. Keep messages short. No co-author trailers.
9. Push/open/update the PR when a remote exists and the issue is ready for human review.
10. Attach/link the PR to the Linear issue when possible.
11. Before `Human Review`, update the workpad with final files, checks, evidence, blockers, reviewer test notes, and any follow-up issues created.
12. During `Merging`, after the PR is merged and the issue is closed, update the workpad or final issue notes with the merged result and the next recommended issue. Do not activate the next issue from this run by default.

## Checks

Run the smallest checks that prove the changed surface, plus the baseline checks when dependencies are available:

```sh
node --check electron/main.cjs
node --check electron/preload.cjs
node --check scripts/workflow-hub.mjs
npm run typecheck
npm run build
git diff --check
```

If dependencies are not installed, install with `npm install` only when required by the issue and never commit `node_modules/`. Record any dependency or network blocker in the workpad.

## Exit States

Move to `Human Review` only when:

- PR is open or the missing remote blocker is explicitly documented.
- Workpad is current.
- Acceptance criteria are checked or explicitly blocked.
- Required validation has been run or the blocker is documented.
- Evidence is attached or summarized in PR/Linear/docs as appropriate.
- Review notes explain how Dylan should inspect or test the change.

Move to `Merging` only by human decision. Move to `Done` only after merge, final workpad closeout, and any needed project-level handoff updates are complete.
