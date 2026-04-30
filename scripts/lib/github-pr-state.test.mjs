import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeChecks,
  parseGitHubPullRequestUrl,
  parseGitHubRepository,
  readGitHubPullRequestState,
  resolvePullRequestCandidates
} from "./github-pr-state.mjs";

test("parses GitHub remotes and PR URLs", () => {
  assert.deepEqual(parseGitHubRepository("git@github.com:DylanMcCavitt/workflow-hub.git"), {
    owner: "DylanMcCavitt",
    repo: "workflow-hub"
  });
  assert.deepEqual(parseGitHubRepository("https://github.com/DylanMcCavitt/workflow-hub.git"), {
    owner: "DylanMcCavitt",
    repo: "workflow-hub"
  });
  assert.deepEqual(parseGitHubPullRequestUrl("https://github.com/DylanMcCavitt/workflow-hub/pull/12"), {
    owner: "DylanMcCavitt",
    repo: "workflow-hub",
    number: 12
  });
});

test("resolves PR candidates from Linear PR links, Linear branch metadata, and git branch", () => {
  const candidates = resolvePullRequestCandidates({
    issue: {
      linear: {
        branchName: "dylanmccavitt2015/age-358-pr-review-github-pr-and-checks-sync",
        pullRequests: [
          {
            url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
            branch: "feat/age-358-github-pr-sync"
          }
        ]
      }
    },
    workspace: {
      branch: "feat/age-358-github-pr-sync"
    }
  });

  assert.deepEqual(candidates.map((candidate) => candidate.source), [
    "linear-pr-url",
    "git-branch",
    "linear-branch"
  ]);
  assert.equal(candidates[0].number, 12);
  assert.equal(candidates[0].repository.owner, "DylanMcCavitt");
});

test("normalizes failing checks and annotations", () => {
  const annotationsByCheckId = new Map([
    ["91", [
      {
        path: "src/App.tsx",
        start_line: 42,
        end_line: 42,
        annotation_level: "failure",
        message: "Expected strict equality.",
        title: "test failure",
        raw_details: "assert.equal(actual, expected)"
      }
    ]]
  ]);

  const checks = normalizeChecks([
    {
      databaseId: 91,
      name: "test",
      status: "COMPLETED",
      conclusion: "FAILURE",
      detailsUrl: "https://github.com/DylanMcCavitt/workflow-hub/actions/runs/1/job/2"
    },
    {
      databaseId: 92,
      name: "typecheck",
      status: "COMPLETED",
      conclusion: "SUCCESS"
    }
  ], annotationsByCheckId);

  assert.equal(checks.status, "failing");
  assert.equal(checks.failing, 1);
  assert.equal(checks.passing, 1);
  assert.equal(checks.checks[0].annotations[0].path, "src/App.tsx");
  assert.match(checks.checks[0].annotations[0].message, /strict equality/);
});

test("reads a pull request by workspace branch with checks, annotations, and latest review comments", () => {
  const calls = [];
  const ghRunner = (args) => {
    calls.push(args);
    const command = args.join(" ");

    if (command.includes("pr list") && command.includes("--head feat/age-358-github-pr-sync")) {
      return {
        ok: true,
        stdout: JSON.stringify([{ number: 12 }])
      };
    }

    if (command.includes("pr view 12")) {
      return {
        ok: true,
        stdout: JSON.stringify({
          author: { login: "DylanMcCavitt", name: "Dylan McCavitt", is_bot: false },
          baseRefName: "main",
          comments: [
            {
              id: "issue-comment-1",
              author: { login: "reviewer" },
              body: "General PR comment.",
              createdAt: "2026-04-30T12:08:00Z",
              url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12#issuecomment-1"
            }
          ],
          headRefName: "feat/age-358-github-pr-sync",
          headRefOid: "abc123",
          isDraft: false,
          latestReviews: [
            {
              id: "review-1",
              author: { login: "reviewer" },
              body: "Please address the failing check.",
              state: "CHANGES_REQUESTED",
              submittedAt: "2026-04-30T12:09:00Z",
              url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12#pullrequestreview-1"
            }
          ],
          mergeStateStatus: "DIRTY",
          mergeable: "MERGEABLE",
          number: 12,
          reviewDecision: "CHANGES_REQUESTED",
          state: "OPEN",
          statusCheckRollup: [
            {
              databaseId: 91,
              name: "test",
              status: "COMPLETED",
              conclusion: "FAILURE",
              detailsUrl: "https://github.com/DylanMcCavitt/workflow-hub/actions/runs/1/job/2"
            }
          ],
          title: "[AGE-358] GitHub PR sync",
          url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12"
        })
      };
    }

    if (command.includes("check-runs/91/annotations")) {
      return {
        ok: true,
        stdout: JSON.stringify([
          {
            path: "src/App.tsx",
            start_line: 42,
            end_line: 42,
            annotation_level: "failure",
            title: "test failure",
            message: "Expected strict equality.",
            raw_details: "assert.equal(actual, expected)"
          }
        ])
      };
    }

    if (command.includes("pulls/12/comments")) {
      return {
        ok: true,
        stdout: JSON.stringify([
          {
            id: 501,
            user: { login: "reviewer" },
            body: "Inline review comment.",
            path: "scripts/lib/github-pr-state.mjs",
            line: 128,
            html_url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12#discussion_r501",
            created_at: "2026-04-30T12:10:00Z",
            updated_at: "2026-04-30T12:10:00Z"
          }
        ])
      };
    }

    return {
      ok: false,
      error: `unexpected gh command: ${command}`
    };
  };

  const state = readGitHubPullRequestState({
    issue: {
      linear: {
        identifier: "AGE-358",
        pullRequests: []
      }
    },
    workspace: {
      branch: "feat/age-358-github-pr-sync",
      remote: "git@github.com:DylanMcCavitt/workflow-hub.git",
      path: "/tmp/workflow-hub"
    },
    ghRunner
  });

  assert.equal(state.status, "available");
  assert.equal(state.adapter.status, "available");
  assert.equal(state.pullRequest.number, 12);
  assert.equal(state.pullRequest.reviewDecision, "CHANGES_REQUESTED");
  assert.equal(state.pullRequest.checks.status, "failing");
  assert.equal(state.pullRequest.checks.checks[0].annotations[0].path, "src/App.tsx");
  assert.equal(state.pullRequest.reviewComments[0].kind, "inline");
  assert.match(state.detail, /checks failing/);
  assert.equal(calls.some((args) => args.includes("api") && args.join(" ").includes("pulls/12/comments")), true);
});

test("reports not-configured when no GitHub repository can be resolved", () => {
  const state = readGitHubPullRequestState({
    issue: {
      linear: {
        pullRequests: []
      }
    },
    workspace: {
      branch: "feat/age-358-github-pr-sync"
    },
    ghRunner: () => {
      throw new Error("gh should not be called without a repository");
    }
  });

  assert.equal(state.status, "not-configured");
  assert.equal(state.adapter.status, "not-configured");
});
