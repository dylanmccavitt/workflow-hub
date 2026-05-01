import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReviewFixPromptDraft
} from "./review-fix-prompt.mjs";

function issueStateFixture() {
  return {
    issue: {
      issueId: "AGE-360",
      source: "linear",
      status: "available",
      linear: {
        linearId: "linear-issue-AGE-360",
        identifier: "AGE-360",
        title: "[PR Review] Fix prompt builder from PR and workpad context",
        status: "Needs Fixes",
        priorityLabel: "Medium",
        url: "https://linear.app/agentcee/issue/AGE-360/example",
        labels: [{ id: "label-1", name: "track:infra" }],
        blockers: [{ identifier: "AGE-358", status: "Done" }],
        codexWorkpad: {
          commentId: "comment-workpad",
          body: "## Codex Workpad\n\n### Notes\n- Keep review scope tight."
        }
      }
    },
    workspace: {
      path: "/worktrees/workflow-hub/AGE-360",
      branch: "feat/age-360-pr-review-prompt-builder",
      headSha: "abc1234",
      dirty: true,
      gitStatus: [
        "## feat/age-360-pr-review-prompt-builder",
        " M src/App.tsx"
      ]
    },
    pullRequests: [
      {
        provider: "GitHub",
        status: "available",
        detail: "PR #12 open; checks failing; review changes requested.",
        pullRequest: {
          number: 12,
          title: "[AGE-360] Prompt builder",
          url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
          state: "OPEN",
          reviewDecision: "CHANGES_REQUESTED",
          checks: {
            status: "failing",
            checks: [
              {
                id: "check-1",
                name: "typecheck",
                state: "failing",
                status: "COMPLETED",
                conclusion: "FAILURE",
                detailsUrl: "https://github.com/checks/1",
                annotations: [
                  {
                    path: "src/App.tsx",
                    startLine: 42,
                    message: "Property prompt does not exist."
                  }
                ]
              },
              {
                id: "check-2",
                name: "build",
                state: "success",
                status: "COMPLETED",
                conclusion: "SUCCESS",
                annotations: []
              }
            ]
          },
          reviewComments: [
            {
              id: "comment-1",
              kind: "inline",
              author: "reviewer",
              body: "Use the workpad context in the generated prompt.",
              path: "scripts/lib/local-api-service.mjs",
              line: 300,
              url: "https://github.com/comment-1"
            },
            {
              id: "comment-2",
              kind: "comment",
              author: "reviewer",
              body: "Do not auto-dispatch after building the prompt.",
              url: "https://github.com/comment-2"
            }
          ]
        }
      }
    ]
  };
}

test("builds a fix prompt from selected review comments, failing checks, workpad, and workspace", () => {
  const draft = buildReviewFixPromptDraft(issueStateFixture(), {
    selectedReviewCommentIds: ["comment-1"],
    selectedCheckIds: ["check-1"],
    generatedAt: "2026-04-30T12:00:00.000Z"
  });

  assert.equal(draft.issueId, "AGE-360");
  assert.equal(draft.selectedReviewCommentIds.length, 1);
  assert.equal(draft.selectedCheckIds.length, 1);
  assert.deepEqual(draft.ownedPaths, [
    "scripts/lib/local-api-service.mjs",
    "src/App.tsx"
  ]);
  assert.match(draft.prompt, /## Issue Context/);
  assert.match(draft.prompt, /## Workspace/);
  assert.match(draft.prompt, /Worktree: \/worktrees\/workflow-hub\/AGE-360/);
  assert.match(draft.prompt, /Branch: feat\/age-360-pr-review-prompt-builder/);
  assert.match(draft.prompt, /Use the workpad context/);
  assert.doesNotMatch(draft.prompt, /Do not auto-dispatch after building/);
  assert.match(draft.prompt, /Property prompt does not exist/);
  assert.match(draft.prompt, /Keep review scope tight/);
  assert.match(draft.prompt, /Do not dispatch, merge, or change Linear status/);
});

test("defaults to all available actionable PR context", () => {
  const draft = buildReviewFixPromptDraft(issueStateFixture(), {
    generatedAt: "2026-04-30T12:00:00.000Z"
  });

  assert.deepEqual(draft.selectedReviewCommentIds, ["comment-1", "comment-2"]);
  assert.deepEqual(draft.selectedCheckIds, ["check-1"]);
  assert.equal(draft.availableCheckFailures.length, 1);
  assert.match(draft.prompt, /Do not auto-dispatch after building the prompt/);
});
