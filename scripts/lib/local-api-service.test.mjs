import assert from "node:assert/strict";
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

test("returns a typed issue state with resolved workspace, Linear cache, and unavailable future adapters", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const service = createLocalApiService({
    readProjectConfig: () => registry,
    registryRepository: repository,
    syncLinearProjectIssues: syncFixtureIssue,
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
  assert.equal(state.runners.find((runner) => runner.kind === "Codex").status, "unavailable");
  assert.equal(state.pullRequests[0].status, "unavailable");
  assert.equal(state.adapters.some((adapter) => adapter.id === "project-config" && adapter.status === "available"), true);
  assert.equal(state.adapters.some((adapter) => adapter.id === "linear" && adapter.status === "available"), true);
  assert.equal(state.adapters.some((adapter) => adapter.id === "pr:github" && adapter.ownerIssue === "AGE-358"), true);
});

test("returns recoverable unavailable state when project config cannot load", async () => {
  const service = createLocalApiService({
    readProjectConfig: () => {
      throw new Error("bad config");
    }
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
    clock: () => new Date("2026-04-30T12:00:00.000Z"),
    findWorkspace: () => undefined
  });

  const state = await service.getIssueState("AGE-349");

  assert.equal(state.issue.status, "available");
  assert.equal(state.workspace.status, "not-found");
  assert.equal(state.workspace.found, false);
  assert.equal(state.adapters.find((adapter) => adapter.id === "git").status, "not-configured");
});
