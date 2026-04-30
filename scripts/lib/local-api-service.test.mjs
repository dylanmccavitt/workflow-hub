import assert from "node:assert/strict";
import test from "node:test";
import {
  LocalApiValidationError,
  createLocalApiService,
  normalizeIssueId
} from "./local-api-service.mjs";

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

test("normalizes issue identifiers", () => {
  assert.equal(normalizeIssueId("age-349"), "AGE-349");
  assert.throws(() => normalizeIssueId("../AGE-349"), LocalApiValidationError);
});

test("returns a typed issue state with resolved workspace and unavailable future adapters", () => {
  const service = createLocalApiService({
    readProjectConfig: () => registry,
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

  const state = service.getIssueState("AGE-349");

  assert.equal(state.issue.issueId, "AGE-349");
  assert.equal(state.project.status, "available");
  assert.equal(state.project.projectId, "workflow-hub");
  assert.equal(state.workspace.status, "available");
  assert.equal(state.workspace.branch, "feat/age-349-local-api-boundary");
  assert.equal(state.workspace.dirty, true);
  assert.equal(state.runners.find((runner) => runner.kind === "Codex").status, "unavailable");
  assert.equal(state.pullRequests[0].status, "unavailable");
  assert.equal(state.adapters.some((adapter) => adapter.id === "project-config" && adapter.status === "available"), true);
  assert.equal(state.adapters.some((adapter) => adapter.id === "pr:github" && adapter.ownerIssue === "AGE-358"), true);
});

test("returns recoverable unavailable state when project config cannot load", () => {
  const service = createLocalApiService({
    readProjectConfig: () => {
      throw new Error("bad config");
    }
  });

  const state = service.getIssueState("AGE-349");

  assert.equal(state.project.status, "unavailable");
  assert.equal(state.workspace.status, "unavailable");
  assert.equal(state.project.adapter.recoverable, true);
  assert.match(state.project.adapter.detail, /bad config/);
});

test("reports missing workspace without throwing", () => {
  const service = createLocalApiService({
    readProjectConfig: () => registry,
    findWorkspace: () => undefined
  });

  const state = service.getIssueState("AGE-349");

  assert.equal(state.workspace.status, "not-found");
  assert.equal(state.workspace.found, false);
  assert.equal(state.adapters.find((adapter) => adapter.id === "git").status, "not-configured");
});
