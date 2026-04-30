import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  parseGraphiteLog,
  readGraphiteStackState,
  resolveGraphiteCandidates
} from "./graphite-stack-state.mjs";

const stackLog = `
◯ feat/age-360-prompt-builder
│ PR #13 (open)
│ https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/13
│
◉ feat/age-359-graphite-stack-visibility (current)
│ PR #12 (open)
│ https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/12
│
◯ feat/age-358-github-pr-sync
│ PR #9 (merged)
│ https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/9
│
◯ main
`;

test("parses Graphite log stack branch entries", () => {
  const parsed = parseGraphiteLog(stackLog);

  assert.equal(parsed.currentBranch, "feat/age-359-graphite-stack-visibility");
  assert.equal(parsed.branches.length, 4);
  assert.equal(parsed.branches[1].prNumber, 12);
  assert.equal(parsed.branches[1].submitState, "Open");
  assert.equal(parsed.branches[2].mergeState, "Merged");
});

test("resolves Graphite candidates from GitHub PR, Linear metadata, and workspace branch", () => {
  const candidates = resolveGraphiteCandidates({
    githubPullRequestState: {
      pullRequest: {
        owner: "DylanMcCavitt",
        repo: "workflow-hub",
        number: 12,
        url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
        headRefName: "feat/age-359-graphite-stack-visibility"
      }
    },
    issue: {
      linear: {
        branchName: "dylanmccavitt2015/age-359-pr-review-graphite-stack-visibility",
        pullRequests: []
      }
    },
    workspace: {
      branch: "feat/age-359-graphite-stack-visibility"
    }
  });

  assert.deepEqual(candidates.map((candidate) => candidate.source), [
    "github-pr",
    "git-branch",
    "linear-branch"
  ]);
  assert.equal(candidates[0].number, 12);
  assert.equal(candidates[0].repository.repo, "workflow-hub");
});

test("reads Graphite stack state from CLI output", () => {
  const calls = [];
  const graphiteRunner = (args) => {
    calls.push(args);
    const command = args.join(" ");

    if (command === "--version") {
      return { ok: true, stdout: "1.8.5" };
    }

    if (command === "log --stack --no-interactive") {
      return { ok: true, stdout: stackLog };
    }

    if (command === "trunk --no-interactive") {
      return { ok: true, stdout: "main" };
    }

    if (command === "parent --no-interactive") {
      return { ok: true, stdout: "feat/age-358-github-pr-sync" };
    }

    if (command === "children --no-interactive") {
      return { ok: true, stdout: "feat/age-360-prompt-builder" };
    }

    return { ok: false, error: `unexpected gt command ${command}` };
  };

  const state = readGraphiteStackState({
    workspace: {
      path: "/tmp/workflow-hub",
      branch: "feat/age-359-graphite-stack-visibility",
      remote: "git@github.com:DylanMcCavitt/workflow-hub.git"
    },
    githubPullRequestState: {
      pullRequest: {
        provider: "GitHub",
        owner: "DylanMcCavitt",
        repo: "workflow-hub",
        number: 12,
        title: "[AGE-359] Graphite stack visibility",
        url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        reviewDecision: "APPROVED",
        headRefName: "feat/age-359-graphite-stack-visibility",
        checks: { status: "success", total: 0, passing: 0, pending: 0, failing: 0, skipped: 0, checks: [] },
        reviewComments: []
      }
    },
    graphiteRunner,
    isGraphiteInitialized: () => true
  });

  assert.equal(state.status, "available");
  assert.equal(state.adapter.status, "available");
  assert.equal(state.stack.currentBranch, "feat/age-359-graphite-stack-visibility");
  assert.equal(state.stack.position, 2);
  assert.equal(state.stack.totalBranches, 3);
  assert.equal(state.stack.parent.name, "feat/age-358-github-pr-sync");
  assert.equal(state.stack.children[0].name, "feat/age-360-prompt-builder");
  assert.equal(state.stack.submitState, "Open");
  assert.equal(state.stack.mergeState, "Open / Clean");
  assert.equal(state.stack.deepLink, "https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/12");
  assert.equal(calls.some((args) => args.join(" ") === "log --stack --no-interactive"), true);
});

test("does not run stack commands when Graphite is not initialized", () => {
  const calls = [];
  const state = readGraphiteStackState({
    workspace: {
      path: "/tmp/workflow-hub",
      branch: "feat/age-359-graphite-stack-visibility",
      remote: "git@github.com:DylanMcCavitt/workflow-hub.git"
    },
    graphiteRunner: (args) => {
      calls.push(args.join(" "));
      return { ok: true, stdout: "1.8.5" };
    },
    isGraphiteInitialized: () => false
  });

  assert.equal(state.status, "not-configured");
  assert.match(state.detail, /not initialized/);
  assert.deepEqual(calls, ["--version"]);
});

test("detects Graphite initialization from a linked worktree common git dir", (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-hub-graphite-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const cwd = path.join(tempRoot, "worktree");
  const gitDir = path.join(tempRoot, "canonical", ".git", "worktrees", "age-359");
  const commonGitDir = path.join(tempRoot, "canonical", ".git");
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(gitDir, { recursive: true });
  fs.mkdirSync(commonGitDir, { recursive: true });
  fs.writeFileSync(path.join(commonGitDir, ".graphite_repo_config"), "{}\n");

  const calls = [];
  const state = readGraphiteStackState({
    workspace: {
      path: cwd,
      branch: "feat/age-359-graphite-stack-visibility",
      remote: "git@github.com:DylanMcCavitt/workflow-hub.git"
    },
    gitRunner: (args) => {
      const command = args.join(" ");
      if (command === "rev-parse --git-dir") return { ok: true, stdout: gitDir };
      if (command === "rev-parse --git-common-dir") return { ok: true, stdout: commonGitDir };
      return { ok: false, error: `unexpected git command ${command}` };
    },
    graphiteRunner: (args) => {
      const command = args.join(" ");
      calls.push(command);
      if (command === "--version") return { ok: true, stdout: "1.8.5" };
      return {
        ok: false,
        error: "ERROR: Cannot perform this operation on untracked branch feat/age-359-graphite-stack-visibility."
      };
    }
  });

  assert.equal(state.status, "not-found");
  assert.match(state.detail, /not tracked/);
  assert.equal(calls.includes("log --stack --no-interactive"), true);
});

test("reports untracked Graphite branches as not-found with a deep link", () => {
  const state = readGraphiteStackState({
    workspace: {
      path: "/tmp/workflow-hub",
      branch: "feat/age-359-graphite-stack-visibility",
      remote: "git@github.com:DylanMcCavitt/workflow-hub.git"
    },
    graphiteRunner: (args) => {
      const command = args.join(" ");
      if (command === "--version") return { ok: true, stdout: "1.8.5" };
      return {
        ok: false,
        error: "ERROR: Cannot perform this operation on untracked branch feat/age-359-graphite-stack-visibility."
      };
    },
    isGraphiteInitialized: () => true
  });

  assert.equal(state.status, "not-found");
  assert.match(state.detail, /not tracked/);
  assert.equal(state.deepLink, "https://app.graphite.com/");
});
