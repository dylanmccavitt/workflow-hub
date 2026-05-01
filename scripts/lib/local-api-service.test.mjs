import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  LocalApiValidationError,
  createLocalApiService,
  normalizeIssueId
} from "./local-api-service.mjs";
import {
  createRegistryRepository,
  openRegistryDatabase
} from "./registry-db.mjs";

const registry = {
  projects: [
    {
      id: "workflow-hub",
      displayName: "Workflow Hub",
      canonicalPath: "/repo/workflow-hub",
      canonicalBranch: "main",
      linear: {
        teamKey: "AGE",
        projectSlug: "workflow-hub"
      },
      runners: {
        codex: {
          command: "codex",
          sandbox: "workspace-write",
          approvalPolicy: "never"
        },
        cursor: {
          model: "composer-2",
          configPath: ".cursor",
          apiKeyEnv: "CURSOR_API_KEY"
        }
      },
      workspaceRoots: ["/worktrees/workflow-hub"]
    }
  ],
  source: {
    trackedConfigPath: "/repo/workflow-hub/config/projects.example.json",
    hasLocalConfig: false
  }
};

function memoryRepository() {
  const database = openRegistryDatabase(":memory:");
  return createRegistryRepository(database, {
    clock: () => new Date("2026-04-30T12:00:00.000Z")
  });
}

async function symphonyFixtureState({ issueId, issue, workspace }) {
  return {
    status: "available",
    running: true,
    source: "endpoint",
    endpoint: "http://127.0.0.1:4002/api/v1/state",
    generatedAt: "2026-04-30T12:00:00.000Z",
    detail: `${issueId} active in Symphony fixture.`,
    counts: {
      queue: 0,
      active: 1,
      complete: 0,
      blocked: 0,
      failed: 0,
      unknown: 0
    },
    issues: [
      {
        identifier: issueId,
        issueId: issue?.linear?.linearId,
        linearStatus: issue?.linear?.status,
        normalizedState: "active",
        source: "endpoint",
        reason: "Symphony fixture reports this issue active.",
        workspacePath: workspace?.path
      }
    ],
    selectedIssue: {
      identifier: issueId,
      issueId: issue?.linear?.linearId,
      linearStatus: issue?.linear?.status,
      normalizedState: "active",
      source: "endpoint",
      reason: "Symphony fixture reports this issue active.",
      workspacePath: workspace?.path
    },
    adapter: {
      id: "runner:symphony",
      label: "Symphony runner",
      status: "available",
      detail: `${issueId} active in Symphony fixture.`,
      recoverable: false
    }
  };
}

function githubFixtureState() {
  return {
    provider: "GitHub",
    status: "available",
    detail: "PR #12 open; checks success; review approved.",
    candidates: [
      {
        source: "git-branch",
        label: "Workspace branch feat/age-349-local-api-boundary",
        branch: "feat/age-349-local-api-boundary"
      }
    ],
    pullRequest: {
      provider: "GitHub",
      owner: "DylanMcCavitt",
      repo: "workflow-hub",
      number: 12,
      title: "[AGE-349] Add local API boundary",
      url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
      state: "OPEN",
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewDecision: "APPROVED",
      baseRefName: "main",
      headRefName: "feat/age-349-local-api-boundary",
      checks: {
        status: "success",
        total: 1,
        passing: 1,
        pending: 0,
        failing: 0,
        skipped: 0,
        checks: [
          {
            name: "typecheck",
            state: "success",
            status: "COMPLETED",
            conclusion: "SUCCESS",
            annotations: []
          }
        ]
      },
      reviewComments: []
    },
    adapter: {
      id: "pr:github",
      label: "GitHub PR",
      status: "available",
      detail: "PR #12 open; checks success; review approved.",
      recoverable: false
    }
  };
}

function graphiteFixtureState() {
  return {
    provider: "Graphite",
    status: "available",
    detail: "Graphite stack detected for feat/age-349-local-api-boundary: position 1/1; Submitted; Open / Clean; no parent PR. no child PRs.",
    candidates: [
      {
        source: "github-pr",
        label: "GitHub PR #12",
        number: 12,
        branch: "feat/age-349-local-api-boundary",
        repository: {
          owner: "DylanMcCavitt",
          repo: "workflow-hub"
        }
      }
    ],
    stack: {
      provider: "Graphite",
      currentBranch: "feat/age-349-local-api-boundary",
      trunk: "main",
      position: 1,
      totalBranches: 1,
      children: [],
      branches: [
        {
          name: "feat/age-349-local-api-boundary",
          current: true,
          trunk: false,
          position: 1,
          prNumber: 12,
          graphiteUrl: "https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/12",
          submitState: "Submitted"
        }
      ],
      submitted: true,
      submitState: "Submitted",
      mergeState: "Open / Clean",
      deepLink: "https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/12"
    },
    deepLink: "https://app.graphite.com/github/pr/DylanMcCavitt/workflow-hub/12",
    adapter: {
      id: "pr:graphite",
      label: "Graphite stack",
      status: "available",
      detail: "Graphite stack detected for feat/age-349-local-api-boundary: position 1/1; Submitted; Open / Clean; no parent PR. no child PRs.",
      recoverable: false
    }
  };
}

async function syncFixtureIssue({ project, repository, clock, staleAfterMs }) {
  const fetchedAt = clock().toISOString();

  repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: project.linear?.projectId,
    metadata: {
      linearSync: {
        status: "fresh",
        fetchedAt,
        staleAfterMs,
        issueCount: 1
      }
    }
  });

  repository.upsertIssue({
    id: "linear-issue-AGE-349",
    projectId: project.id,
    identifier: "AGE-349",
    title: "[Foundation] Local daemon and renderer API boundary",
    status: "In Progress",
    linearUrl: "https://linear.app/agentcee/issue/AGE-349/foundation-local-daemon-and-renderer-api-boundary",
    priority: 2,
    metadata: {
      priorityLabel: "High",
      labels: [{ id: "label-1", name: "track:infra" }],
      blockers: [],
      blockedIssues: [],
      links: [],
      pullRequests: [],
      codexWorkpad: {
        commentId: "comment-1",
        body: "## Codex Workpad\n\n### Plan\n- [x] Fixture",
        updatedAt: fetchedAt
      },
      linearSync: {
        status: "fresh",
        fetchedAt,
        staleAfterMs
      }
    }
  });

  return {
    status: "fresh",
    detail: "Synced 1 Linear issue(s) from Workflow Hub.",
    fetchedAt,
    issueCount: 1
  };
}

test("normalizes issue identifiers", () => {
  assert.equal(normalizeIssueId("age-349"), "AGE-349");
  assert.throws(() => normalizeIssueId("../AGE-349"), LocalApiValidationError);
});

test("lists Linear-backed project issues through the local API cache", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    clock: () => new Date("2026-04-30T12:00:00.000Z")
  });

  const state = await service.listIssues({ projectId: "workflow-hub" });

  assert.equal(state.apiVersion, "0.1.0");
  assert.equal(state.project.projectId, "workflow-hub");
  assert.equal(state.adapter.status, "available");
  assert.equal(state.cache.status, "fresh");
  assert.equal(state.cache.stale, false);
  assert.equal(state.issues.length, 1);
  assert.equal(state.issues[0].identifier, "AGE-349");
  assert.equal(state.issues[0].title, "[Foundation] Local daemon and renderer API boundary");
  assert.equal(state.issues[0].codexWorkpad.commentId, "comment-1");
  assert.equal(state.adapters.some((adapter) => adapter.id === "linear" && adapter.status === "available"), true);
});

test("reports an empty not-found issue list for unknown projects", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository
  });

  const state = await service.listIssues({ projectId: "missing-project" });

  assert.equal(state.project.status, "not-found");
  assert.equal(state.cache.status, "miss");
  assert.deepEqual(state.issues, []);
  assert.match(state.adapter.detail, /missing-project/);
});

test("returns a typed issue state with resolved workspace, Linear cache, and GitHub PR state", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    readSymphonyState: symphonyFixtureState,
    readGitHubPullRequestState: githubFixtureState,
    readGraphiteStackState: graphiteFixtureState,
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => ({
      project: registry.projects[0],
      path: "/worktrees/workflow-hub/AGE-349"
    }),
    gitRunner: (args) => {
      const key = args.join(" ");
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-349-local-api-boundary" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "015c2f9" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-349-local-api-boundary\n M src/App.tsx" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  const state = await service.getIssueState("AGE-349");

  assert.equal(state.issue.issueId, "AGE-349");
  assert.equal(state.issue.status, "available");
  assert.equal(state.issue.linear.title, "[Foundation] Local daemon and renderer API boundary");
  assert.equal(state.issue.linear.cache.status, "fresh");
  assert.match(state.issue.linear.codexWorkpad.body, /^## Codex Workpad/);
  assert.equal(state.project.status, "available");
  assert.equal(state.project.projectId, "workflow-hub");
  assert.equal(state.workspace.status, "available");
  assert.equal(state.workspace.branch, "feat/age-349-local-api-boundary");
  assert.equal(state.workspace.dirty, true);
  assert.equal(state.symphony.selectedIssue.normalizedState, "active");
  assert.equal(state.runTimeline.length, 1);
  assert.equal(state.runTimeline[0].runnerKind, "Symphony");
  assert.equal(state.runTimeline[0].normalizedState, "running");
  assert.equal(state.runTimeline[0].rawEvent.workspacePath, "/worktrees/workflow-hub/AGE-349");
  assert.equal(state.runners.find((runner) => runner.kind === "Symphony").status, "available");
  assert.equal(state.runners.find((runner) => runner.kind === "Codex").status, "available");
  assert.match(state.runners.find((runner) => runner.kind === "Codex").detail, /workspace-write/);
  assert.equal(state.runners.find((runner) => runner.kind === "Cursor SDK").status, "available");
  assert.match(state.runners.find((runner) => runner.kind === "Cursor SDK").detail, /composer-2/);
  assert.equal(state.pullRequests[0].status, "available");
  assert.equal(state.pullRequests[0].pullRequest.number, 12);
  assert.equal(state.pullRequests[1].provider, "Graphite");
  assert.equal(state.pullRequests[1].stack.position, 1);
  assert.equal(state.adapters.some((adapter) => adapter.id === "project-config" && adapter.status === "available"), true);
  assert.equal(state.adapters.some((adapter) => adapter.id === "linear" && adapter.status === "available"), true);
  assert.equal(state.adapters.some((adapter) => adapter.id === "pr:github" && adapter.status === "available"), true);
  assert.equal(state.adapters.some((adapter) => adapter.id === "pr:graphite" && adapter.status === "available"), true);
});

test("applies explicit Linear actions and records write events", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: async () => ({
      status: "fresh",
      detail: "Cache refresh skipped by test.",
      issueCount: 1
    }),
    readSymphonyState: symphonyFixtureState,
    applyLinearStatusAction: async ({ issueId, actionId, confirmed, note }) => {
      assert.equal(issueId, "AGE-355");
      assert.equal(actionId, "blocked");
      assert.equal(confirmed, false);
      assert.equal(note, "Waiting on credentials.");

      return {
        issueId,
        action: {
          id: "blocked",
          label: "Blocked",
          stateName: "Blocked",
          confirmationRequired: false
        },
        previousStatus: { id: "state-progress", name: "In Progress", type: "started" },
        status: { id: "state-blocked", name: "Blocked", type: "unstarted" },
        issue: {
          linearId: "linear-issue-AGE-355",
          identifier: "AGE-355",
          title: "[Linear] Safe status transitions and workpad writes",
          url: "https://linear.app/agentcee/issue/AGE-355/example",
          priority: 2,
          priorityLabel: "High",
          updatedAt: "2026-04-30T12:00:00.000Z"
        },
        workpad: {
          operation: "updated",
          commentId: "comment-workpad",
          body: "## Codex Workpad\n\n### Handoff\n- Review state: Blocked"
        },
        message: "Linear status set to Blocked."
      };
    },
    clock: () => new Date("2026-04-30T12:00:00.000Z")
  });

  const result = await service.applyIssueAction({
    issueId: "age-355",
    actionId: "blocked",
    confirmed: false,
    note: "Waiting on credentials."
  });

  const events = repository.listIssueEvents("linear-issue-AGE-355");
  assert.equal(result.status.name, "Blocked");
  assert.equal(result.event.type, "linear.status.updated");
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.nextStatus, "Blocked");
});

test("starts Codex runs through the resolved issue worktree", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    readSymphonyState: symphonyFixtureState,
    readGitHubPullRequestState: githubFixtureState,
    readGraphiteStackState: graphiteFixtureState,
    startCodexLocalRun: async (input) => {
      assert.equal(input.issueId, "AGE-349");
      assert.equal(input.prompt, "Inspect the local worktree.");
      assert.equal(input.workspace.path, "/worktrees/workflow-hub/AGE-349");
      assert.equal(input.sandbox, "read-only");
      assert.equal(input.approvalPolicy, "never");
      return {
        issueId: input.issueId,
        dryRun: true,
        status: "ready",
        prompt: input.prompt,
        command: ["codex", "exec", "--json"],
        cwd: input.workspace.path,
        logPath: "/tmp/codex.jsonl",
        summaryPath: "/tmp/codex-summary.md",
        permissionBoundary: {
          cwd: input.workspace.path,
          sandbox: input.sandbox,
          approvalPolicy: input.approvalPolicy,
          writableRoots: [input.workspace.path],
          addDirs: []
        }
      };
    },
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => ({
      project: registry.projects[0],
      path: "/worktrees/workflow-hub/AGE-349"
    }),
    gitRunner: (args) => {
      const key = args.join(" ");
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-349-local-api-boundary" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "015c2f9" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-349-local-api-boundary" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  const result = await service.startCodexRun({
    issueId: "age-349",
    prompt: "Inspect the local worktree.",
    sandbox: "read-only",
    approvalPolicy: "never",
    dryRun: true
  });

  assert.equal(result.status, "ready");
  assert.equal(result.cwd, "/worktrees/workflow-hub/AGE-349");
  assert.equal(result.permissionBoundary.sandbox, "read-only");
});

test("dispatches a Ready issue by creating a worktree, moving In Progress, and starting Codex with workpad context", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-hub-dispatch-"));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const canonicalPath = path.join(tempRoot, "repo");
  const workspaceRoot = path.join(tempRoot, "worktrees");
  const workspacePath = path.join(workspaceRoot, "AGE-368");
  fs.mkdirSync(canonicalPath, { recursive: true });
  const dispatchRegistry = {
    ...registry,
    projects: [
      {
        ...registry.projects[0],
        canonicalPath,
        workspaceRoots: [workspaceRoot]
      }
    ]
  };
  let currentStatus = "Ready";
  let workspaceCreated = false;
  const gitCommands = [];
  const readySync = async ({ project, repository: repo, clock, staleAfterMs }) => {
    const fetchedAt = clock().toISOString();

    repo.upsertProject({
      id: project.id,
      displayName: project.displayName,
      repoPath: project.canonicalPath,
      linearTeamKey: project.linear?.teamKey,
      linearProjectId: project.linear?.projectId,
      metadata: {
        linearSync: {
          status: "fresh",
          fetchedAt,
          staleAfterMs,
          issueCount: 1
        }
      }
    });
    repo.upsertIssue({
      id: "linear-issue-AGE-368",
      projectId: project.id,
      identifier: "AGE-368",
      title: "[Flow] Ready to worker dispatch loop",
      status: currentStatus,
      linearUrl: "https://linear.app/agentcee/issue/AGE-368/flow-ready-to-worker-dispatch-loop",
      priority: 2,
      metadata: {
        priorityLabel: "High",
        labels: [{ id: "feature", name: "Feature" }],
        blockers: [],
        blockedIssues: [],
        links: [],
        pullRequests: [],
        codexWorkpad: {
          commentId: "workpad-368",
          body: "## Codex Workpad\n\n### Plan\n- [ ] Dispatch the worker",
          updatedAt: fetchedAt
        },
        linearSync: {
          status: "fresh",
          fetchedAt,
          staleAfterMs
        }
      }
    });

    return {
      status: "fresh",
      detail: "Synced 1 Linear issue(s) from Workflow Hub.",
      fetchedAt,
      issueCount: 1
    };
  };

  const service = createLocalApiService({
    readProjectConfig: () => dispatchRegistry,
    registryRepository: repository,
    syncLinearProjectIssues: readySync,
    readSymphonyState: async () => ({
      status: "available",
      running: false,
      source: "endpoint",
      detail: "No active Symphony workers.",
      counts: { queue: 0, active: 0, complete: 0, blocked: 0, failed: 0, unknown: 0 },
      issues: [],
      adapter: {
        id: "runner:symphony",
        label: "Symphony runner",
        status: "available",
        detail: "No active Symphony workers.",
        recoverable: false
      }
    }),
    applyLinearStatusAction: async ({ issueId, actionId, confirmed, note }) => {
      assert.equal(issueId, "AGE-368");
      assert.equal(actionId, "in-progress");
      assert.equal(confirmed, true);
      assert.match(note, /Codex/);
      currentStatus = "In Progress";
      return {
        issueId,
        action: {
          id: "in-progress",
          label: "In Progress",
          stateName: "In Progress",
          confirmationRequired: true
        },
        previousStatus: { id: "ready", name: "Ready", type: "unstarted" },
        status: { id: "progress", name: "In Progress", type: "started" },
        issue: {
          linearId: "linear-issue-AGE-368",
          identifier: "AGE-368",
          title: "[Flow] Ready to worker dispatch loop",
          url: "https://linear.app/agentcee/issue/AGE-368/flow-ready-to-worker-dispatch-loop",
          priority: 2,
          priorityLabel: "High",
          updatedAt: "2026-04-30T12:00:00.000Z"
        },
        workpad: {
          operation: "updated",
          commentId: "workpad-368",
          body: "## Codex Workpad\n\n### Handoff\n- Review state: In Progress"
        },
        message: "Linear status set to In Progress."
      };
    },
    startCodexLocalRun: async (input) => {
      assert.equal(input.issueId, "AGE-368");
      assert.equal(input.dryRun, true);
      assert.match(input.prompt, /Ready to worker dispatch loop/);
      assert.match(input.prompt, /## Codex Workpad/);
      assert.equal(input.workspace.path, workspacePath);
      return {
        issueId: input.issueId,
        dryRun: true,
        status: "ready",
        prompt: input.prompt,
        command: ["codex", "exec", "--json"],
        cwd: input.workspace.path,
        logPath: "/tmp/codex.jsonl",
        summaryPath: "/tmp/codex-summary.md",
        permissionBoundary: {
          cwd: input.workspace.path,
          sandbox: "workspace-write",
          approvalPolicy: "never",
          writableRoots: [input.workspace.path],
          addDirs: []
        }
      };
    },
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => workspaceCreated
      ? {
          project: dispatchRegistry.projects[0],
          root: workspaceRoot,
          path: workspacePath,
          matchType: "template"
        }
      : undefined,
    gitRunner: (args, cwd) => {
      const key = args.join(" ");
      gitCommands.push(`${cwd} :: ${key}`);
      if (key === "fetch origin") return { ok: true, stdout: "" };
      if (key === "show-ref --verify --quiet refs/remotes/origin/main") return { ok: true, stdout: "" };
      if (key === "show-ref --verify --quiet refs/heads/feat/age-368-ready-to-worker-dispatch-loop") {
        return { ok: false, error: "missing ref" };
      }
      if (key === `worktree add -b feat/age-368-ready-to-worker-dispatch-loop ${workspacePath} origin/main`) {
        workspaceCreated = true;
        return { ok: true, stdout: "" };
      }
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-368-ready-to-worker-dispatch-loop" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "0f5ca2d" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-368-ready-to-worker-dispatch-loop" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  const result = await service.dispatchReadyIssue({
    issueId: "age-368",
    runnerKind: "codex",
    prompt: "Keep the slice narrow.",
    confirmed: true,
    dryRun: true
  });

  assert.equal(result.workspaceOperation, "created");
  assert.equal(result.statusAction.status.name, "In Progress");
  assert.equal(result.runner.status, "ready");
  assert.equal(result.event.type, "codex.run.ready");
  assert.equal(repository.listIssueEvents("linear-issue-AGE-368").some((event) => event.type === "codex.run.ready"), true);
  assert.equal(gitCommands.some((command) => command.includes("worktree add -b feat/age-368-ready-to-worker-dispatch-loop")), true);
});

test("dispatch ignores Linear-inferred Symphony active state when endpoint has no active worker", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  let started = false;

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    readSymphonyState: async ({ issueId, issue, workspace }) => {
      const selectedIssue = {
        identifier: issueId,
        issueId: issue?.linear?.linearId,
        linearStatus: issue?.linear?.status,
        normalizedState: "active",
        source: "linear",
        reason: "No Symphony entry was found; Linear status is In Progress.",
        workspacePath: workspace?.path
      };

      return {
        status: "available",
        running: true,
        source: "endpoint",
        endpoint: "http://127.0.0.1:4002/api/v1/state",
        generatedAt: "2026-04-30T12:00:00.000Z",
        detail: `${issueId} active from Linear inference only.`,
        counts: { queue: 0, active: 1, complete: 0, blocked: 0, failed: 0, unknown: 0 },
        issues: [selectedIssue],
        selectedIssue,
        adapter: {
          id: "runner:symphony",
          label: "Symphony runner",
          status: "available",
          detail: `${issueId} active from Linear inference only.`,
          recoverable: false
        }
      };
    },
    startCodexLocalRun: async (input) => {
      started = true;
      assert.equal(input.issueId, "AGE-349");
      assert.equal(input.dryRun, true);
      assert.equal(input.workspace.path, "/worktrees/workflow-hub/AGE-349");
      return {
        issueId: input.issueId,
        dryRun: true,
        status: "ready",
        prompt: input.prompt,
        command: ["codex", "exec", "--json"],
        cwd: input.workspace.path,
        logPath: "/tmp/codex.jsonl",
        summaryPath: "/tmp/codex-summary.md",
        permissionBoundary: {
          cwd: input.workspace.path,
          sandbox: "workspace-write",
          approvalPolicy: "never",
          writableRoots: [input.workspace.path],
          addDirs: []
        }
      };
    },
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => ({
      project: registry.projects[0],
      root: "/worktrees/workflow-hub",
      path: "/worktrees/workflow-hub/AGE-349",
      matchType: "template"
    }),
    gitRunner: (args) => {
      const key = args.join(" ");
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-349-local-api-boundary" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "015c2f9" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-349-local-api-boundary" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  const result = await service.dispatchReadyIssue({
    issueId: "AGE-349",
    runnerKind: "codex",
    confirmed: true,
    dryRun: true
  });

  assert.equal(started, true);
  assert.equal(result.statusAction, undefined);
  assert.equal(result.runner.status, "ready");
  assert.equal(result.event.type, "codex.run.ready");
});

test("dispatch blocks when Symphony endpoint reports an active issue for the same worktree", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    readSymphonyState: symphonyFixtureState,
    startCodexLocalRun: async () => {
      throw new Error("dispatch should not start Codex while Symphony owns the worktree");
    },
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => ({
      project: registry.projects[0],
      root: "/worktrees/workflow-hub",
      path: "/worktrees/workflow-hub/AGE-349",
      matchType: "template"
    }),
    gitRunner: (args) => {
      const key = args.join(" ");
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-349-local-api-boundary" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "015c2f9" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-349-local-api-boundary" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  await assert.rejects(
    () => service.dispatchReadyIssue({
      issueId: "AGE-349",
      runnerKind: "codex",
      confirmed: true,
      dryRun: true
    }),
    /Symphony already has AGE-349 active/
  );
});

test("dispatch blocks when a writable runner is already active for the same worktree", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  repository.upsertProject({
    id: "workflow-hub",
    displayName: "Workflow Hub",
    repoPath: "/repo/workflow-hub"
  });
  repository.upsertIssue({
    id: "linear-issue-OTHER",
    projectId: "workflow-hub",
    identifier: "AGE-999",
    title: "Other active work",
    status: "In Progress"
  });
  repository.upsertWorkspace({
    id: "workspace-active",
    issueId: "linear-issue-OTHER",
    path: "/worktrees/workflow-hub/AGE-368",
    branch: "feat/age-999-other-work",
    dirty: false
  });
  repository.upsertRun({
    id: "codex-active-run",
    issueId: "linear-issue-OTHER",
    workspaceId: "workspace-active",
    runnerKind: "Codex",
    status: "running",
    metadata: {
      permissionBoundary: {
        sandbox: "workspace-write"
      }
    }
  });

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: async (options) => {
      await syncFixtureIssue(options);
      return {
        status: "fresh",
        detail: "Synced 1 Linear issue(s) from Workflow Hub.",
        fetchedAt: "2026-04-30T12:00:00.000Z",
        issueCount: 1
      };
    },
    readSymphonyState: async () => ({
      status: "available",
      running: false,
      source: "endpoint",
      detail: "No active Symphony workers.",
      counts: { queue: 0, active: 0, complete: 0, blocked: 0, failed: 0, unknown: 0 },
      issues: [],
      adapter: {
        id: "runner:symphony",
        label: "Symphony runner",
        status: "available",
        detail: "No active Symphony workers.",
        recoverable: false
      }
    }),
    startCodexLocalRun: async () => {
      throw new Error("dispatch should not start Codex while another writable run is active");
    },
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => ({
      project: registry.projects[0],
      root: "/worktrees/workflow-hub",
      path: "/worktrees/workflow-hub/AGE-368",
      matchType: "template"
    }),
    gitRunner: (args) => {
      const key = args.join(" ");
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-368-ready-dispatch" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "0f5ca2d" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-368-ready-dispatch" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  await assert.rejects(
    () => service.dispatchReadyIssue({
      issueId: "AGE-349",
      runnerKind: "codex",
      confirmed: true,
      dryRun: true
    }),
    /already active/
  );
});

test("drafts and saves review fix prompt events", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    readSymphonyState: symphonyFixtureState,
    readGitHubPullRequestState: () => ({
      provider: "GitHub",
      status: "available",
      detail: "PR #12 open; checks failing; review changes requested.",
      pullRequest: {
        provider: "GitHub",
        owner: "DylanMcCavitt",
        repo: "workflow-hub",
        number: 12,
        title: "[AGE-349] Add local API boundary",
        url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        mergeStateStatus: "DIRTY",
        reviewDecision: "CHANGES_REQUESTED",
        checks: {
          status: "failing",
          total: 1,
          passing: 0,
          pending: 0,
          failing: 1,
          skipped: 0,
          checks: [
            {
              id: "check-1",
              name: "typecheck",
              state: "failing",
              status: "COMPLETED",
              conclusion: "FAILURE",
              annotations: [
                {
                  path: "src/App.tsx",
                  startLine: 42,
                  message: "Prompt editor prop is missing."
                }
              ]
            }
          ]
        },
        reviewComments: [
          {
            id: "comment-1",
            kind: "inline",
            author: "reviewer",
            body: "Include the selected review comment in the prompt.",
            path: "scripts/lib/local-api-service.mjs",
            line: 250
          }
        ]
      },
      adapter: {
        id: "pr:github",
        label: "GitHub PR",
        status: "available",
        detail: "PR #12 open; checks failing; review changes requested.",
        recoverable: false
      }
    }),
    readGraphiteStackState: graphiteFixtureState,
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => ({
      project: registry.projects[0],
      path: "/worktrees/workflow-hub/AGE-349"
    }),
    gitRunner: (args) => {
      const key = args.join(" ");
      if (key === "branch --show-current") return { ok: true, stdout: "feat/age-349-local-api-boundary" };
      if (key === "rev-parse --short HEAD") return { ok: true, stdout: "015c2f9" };
      if (key === "remote get-url origin") {
        return { ok: true, stdout: "git@github.com:DylanMcCavitt/workflow-hub.git" };
      }
      if (key === "status --short --branch") {
        return { ok: true, stdout: "## feat/age-349-local-api-boundary\n M src/App.tsx" };
      }
      return { ok: false, error: `unexpected git command ${key}` };
    }
  });

  const draft = await service.draftReviewFixPrompt({
    issueId: "age-349",
    selectedReviewCommentIds: ["comment-1"],
    selectedCheckIds: ["check-1"]
  });

  assert.match(draft.prompt, /Include the selected review comment/);
  assert.match(draft.prompt, /Prompt editor prop is missing/);
  assert.match(draft.prompt, /Branch: feat\/age-349-local-api-boundary/);

  const saved = await service.saveReviewFixPrompt({
    issueId: "AGE-349",
    selectedReviewCommentIds: ["comment-1"],
    selectedCheckIds: ["check-1"],
    prompt: `${draft.prompt}\n\nEdited before dispatch.`
  });
  const events = repository.listIssueEvents("linear-issue-AGE-349");

  assert.equal(saved.event.type, "review.fix_prompt.generated");
  assert.equal(saved.event.payload.edited, true);
  assert.equal(events.length, 1);
  assert.match(events[0].payload.prompt, /Edited before dispatch/);
  assert.deepEqual(events[0].payload.ownedPaths, [
    "scripts/lib/local-api-service.mjs",
    "src/App.tsx"
  ]);
});

test("returns recoverable unavailable state when project config cannot load", async () => {
  const service = createLocalApiService({
    readProjectConfig: () => {
      throw new Error("bad config");
    },
    readSymphonyState: symphonyFixtureState
  });

  const state = await service.getIssueState("AGE-349");

  assert.equal(state.issue.status, "unavailable");
  assert.equal(state.project.status, "unavailable");
  assert.equal(state.workspace.status, "unavailable");
  assert.equal(state.project.adapter.recoverable, true);
  assert.match(state.project.adapter.detail, /bad config/);
});

test("reports missing workspace without throwing", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
    readSymphonyState: symphonyFixtureState,
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => undefined
  });

  const state = await service.getIssueState("AGE-349");

  assert.equal(state.issue.status, "available");
  assert.equal(state.workspace.status, "not-found");
  assert.equal(state.workspace.found, false);
  assert.equal(state.adapters.find((adapter) => adapter.id === "git").status, "not-configured");
});
