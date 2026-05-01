import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  codexConfigForProject,
  startCodexLocalRun
} from "./codex-runner.mjs";
import {
  createRegistryRepository,
  openRegistryDatabase
} from "./registry-db.mjs";

function memoryRepository() {
  const database = openRegistryDatabase(":memory:");
  return createRegistryRepository(database, {
    clock: () => new Date("2026-05-01T12:00:00.000Z")
  });
}

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-hub-codex-runner-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const project = {
  id: "workflow-hub",
  displayName: "Workflow Hub",
  canonicalPath: "/repo/workflow-hub",
  canonicalBranch: "main",
  linear: {
    teamKey: "AGE",
    projectSlug: "workflow-hub"
  },
  workspaceRoots: ["/worktrees/workflow-hub"],
  runners: {
    codex: {
      command: "codex",
      sandbox: "workspace-write",
      approvalPolicy: "never"
    }
  }
};

const state = {
  issue: {
    issueId: "AGE-363",
    source: "linear",
    status: "available",
    linear: {
      linearId: "linear-issue-AGE-363",
      identifier: "AGE-363",
      title: "[Codex] Local runner adapter",
      status: "In Progress",
      url: "https://linear.app/agentcee/issue/AGE-363/example",
      priority: 2,
      labels: [],
      blockers: [],
      blockedIssues: [],
      links: [],
      pullRequests: [],
      cache: {
        status: "fresh",
        stale: false
      }
    }
  },
  workspace: {
    issueId: "AGE-363",
    status: "available",
    found: true,
    projectId: "workflow-hub",
    projectName: "Workflow Hub",
    path: "/worktrees/workflow-hub/AGE-363",
    branch: "feat/age-363-codex-local-runner",
    headSha: "abc1234",
    remote: "git@github.com:DylanMcCavitt/workflow-hub.git",
    dirty: false,
    gitStatus: ["## feat/age-363-codex-local-runner"]
  }
};

test("resolves Codex defaults and permission boundary config", () => {
  const config = codexConfigForProject({}, "/worktrees/workflow-hub/AGE-363", {
    logRoot: "/tmp/workflow-hub-codex"
  });

  assert.equal(config.command, "codex");
  assert.equal(config.sandbox, "workspace-write");
  assert.equal(config.approvalPolicy, "never");
  assert.equal(config.logRoot, "/tmp/workflow-hub-codex");
});

test("starts Codex from the exact issue worktree and persists log/session events", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  const logRoot = tempDir(t);
  let launched;

  const result = await startCodexLocalRun({
    issueId: "age-363",
    prompt: "Run the local Codex adapter test.",
    project,
    state,
    workspace: state.workspace,
    repository,
    logRoot,
    runId: "codex-run-1",
    codexProcessRunner: async ({ command, args, prompt, cwd, logPath, summaryPath, onEvent }) => {
      launched = { command, args, prompt, cwd, logPath, summaryPath };
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.writeFileSync(logPath, "{\"type\":\"session.started\",\"session_id\":\"codex-session-1\"}\n");
      fs.writeFileSync(summaryPath, "Codex adapter finished.");
      await onEvent({ type: "session.started", session_id: "codex-session-1" });
      await onEvent({ type: "approval.requested", message: "write permission denied" });
      return { code: 0, signal: null, stderr: "" };
    },
    clock: () => new Date("2026-05-01T12:00:00.000Z")
  });

  assert.equal(launched.command, "codex");
  assert.equal(launched.cwd, "/worktrees/workflow-hub/AGE-363");
  assert.deepEqual(launched.args.slice(0, 10), [
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "never",
    "exec",
    "--json",
    "--cd",
    "/worktrees/workflow-hub/AGE-363",
    "--output-last-message",
    launched.summaryPath
  ]);
  assert.equal(launched.prompt, "Run the local Codex adapter test.");
  assert.equal(result.status, "finished");
  assert.equal(result.sessionId, "codex-session-1");
  assert.equal(result.logPath, path.join(logRoot, "AGE-363", "codex-run-1.jsonl"));
  assert.equal(result.summary, "Codex adapter finished.");
  assert.equal(result.permissionBoundary.cwd, "/worktrees/workflow-hub/AGE-363");
  assert.equal(result.permissionBoundary.sandbox, "workspace-write");
  assert.equal(result.permissionBoundary.approvalPolicy, "never");

  const issue = repository.getIssueByIdentifier("workflow-hub", "AGE-363");
  const runs = repository.listIssueRuns(issue.id);
  const events = repository.listIssueEvents(issue.id);

  assert.equal(runs[0].id, "codex-run-1");
  assert.equal(runs[0].runnerKind, "Codex");
  assert.equal(runs[0].status, "finished");
  assert.equal(runs[0].metadata.cwd, "/worktrees/workflow-hub/AGE-363");
  assert.equal(runs[0].metadata.logPath, result.logPath);
  assert.equal(runs[0].metadata.sessionId, "codex-session-1");
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "codex.run.started",
      "codex.event.session.started",
      "codex.event.approval.requested",
      "codex.run.finished"
    ]
  );
});

test("dry-run validates the Codex command without creating run records", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  const logRoot = tempDir(t);

  const result = await startCodexLocalRun({
    issueId: "AGE-363",
    prompt: "Check local Codex target.",
    project,
    state,
    workspace: state.workspace,
    repository,
    logRoot,
    sandbox: "read-only",
    dryRun: true,
    clock: () => new Date("2026-05-01T12:00:00.000Z")
  });

  const issue = repository.getIssueByIdentifier("workflow-hub", "AGE-363");

  assert.equal(result.dryRun, true);
  assert.equal(result.cwd, "/worktrees/workflow-hub/AGE-363");
  assert.equal(result.command[0], "codex");
  assert.equal(result.permissionBoundary.sandbox, "read-only");
  assert.equal(result.permissionBoundary.writableRoots.length, 0);
  assert.equal(repository.listIssueRuns(issue.id).length, 0);
  assert.equal(repository.listIssueEvents(issue.id).length, 0);
});
