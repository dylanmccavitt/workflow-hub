import assert from "node:assert/strict";
import test from "node:test";
import Database from "better-sqlite3";
import {
  CURRENT_REGISTRY_SCHEMA_VERSION,
  createRegistryRepository,
  getRegistrySchemaVersion,
  migrateRegistryDatabase,
  openRegistryDatabase
} from "./registry-db.mjs";

function memoryRepository() {
  const database = openRegistryDatabase(":memory:");
  const repository = createRegistryRepository(database, {
    clock: () => new Date("2026-04-30T12:00:00.000Z")
  });

  return { database, repository };
}

test("bootstraps the registry schema and records the migration version", (t) => {
  const database = openRegistryDatabase(":memory:");
  t.after(() => database.close());

  const tableNames = database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all().map((row) => row.name);

  assert.equal(getRegistrySchemaVersion(database), CURRENT_REGISTRY_SCHEMA_VERSION);
  assert.deepEqual(
    tableNames.filter((name) => !name.startsWith("sqlite_")),
    [
      "events",
      "issues",
      "projects",
      "pull_requests",
      "review_sessions",
      "runs",
      "schema_migrations",
      "workspaces"
    ]
  );

  assert.deepEqual(database.prepare("SELECT version, name FROM schema_migrations").all(), [
    { version: 1, name: "initial-registry-cache" }
  ]);
});

test("persists project, issue, workspace, run, pull request, review session, and event records", (t) => {
  const { repository } = memoryRepository();
  t.after(() => repository.close());

  const project = repository.upsertProject({
    id: "workflow-hub",
    displayName: "Workflow Hub",
    repoPath: "/Users/dylanmccavitt/projects/workflow-hub",
    linearTeamKey: "AGE",
    linearProjectId: "workflow-hub-32ae906a2f1a",
    metadata: { source: "test" }
  });

  assert.equal(project.id, "workflow-hub");
  assert.deepEqual(project.metadata, { source: "test" });

  const issue = repository.upsertIssue({
    id: "linear-issue-AGE-348",
    projectId: project.id,
    identifier: "AGE-348",
    title: "[Foundation] SQLite registry and event store",
    status: "In Progress",
    linearUrl: "https://linear.app/agentcee/issue/AGE-348/foundation-sqlite-registry-and-event-store",
    priority: 2
  });

  assert.equal(repository.getIssueByIdentifier(project.id, "AGE-348").id, issue.id);

  const workspace = repository.upsertWorkspace({
    id: "workspace-AGE-348",
    issueId: issue.id,
    path: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-348",
    branch: "feat/age-348-sqlite-registry",
    baseBranch: "main",
    headSha: "4dfc12f",
    dirty: true
  });

  const run = repository.upsertRun({
    id: "run-1",
    issueId: issue.id,
    workspaceId: workspace.id,
    runnerKind: "Codex",
    status: "running",
    startedAt: "2026-04-30T12:01:00.000Z",
    metadata: { model: "gpt-5" }
  });

  const pullRequest = repository.upsertPullRequest({
    id: "github-pr-1",
    issueId: issue.id,
    provider: "github",
    number: 1,
    url: "https://github.com/DylanMcCavitt/workflow-hub/pull/1",
    branch: "feat/age-348-sqlite-registry",
    status: "open"
  });

  const reviewSession = repository.upsertReviewSession({
    id: "review-1",
    issueId: issue.id,
    workspaceId: workspace.id,
    target: "manual",
    status: "pending",
    notes: "Review database tests and migration bootstrap."
  });

  const event = repository.recordEvent({
    id: "event-1",
    issueId: issue.id,
    entityType: "run",
    entityId: run.id,
    type: "runner.status",
    message: "Codex run started",
    payload: { status: "running" }
  });

  assert.equal(repository.listProjectIssues(project.id).length, 1);
  assert.equal(repository.listIssueWorkspaces(issue.id)[0].id, workspace.id);
  assert.equal(repository.listIssueRuns(issue.id)[0].id, run.id);
  assert.equal(repository.listIssuePullRequests(issue.id)[0].id, pullRequest.id);
  assert.equal(repository.listIssueReviewSessions(issue.id)[0].id, reviewSession.id);
  assert.equal(repository.listIssueEvents(issue.id)[0].id, event.id);
  assert.deepEqual(repository.listEntityEvents("run", run.id).map((record) => record.id), ["event-1"]);
});

test("upserts refresh cached records without replacing creation timestamps", (t) => {
  const database = openRegistryDatabase(":memory:");
  const times = [
    new Date("2026-04-30T12:00:00.000Z"),
    new Date("2026-04-30T12:05:00.000Z")
  ];
  let clockCalls = 0;
  const repository = createRegistryRepository(database, {
    clock: () => times[Math.min(clockCalls++, times.length - 1)]
  });
  t.after(() => repository.close());

  repository.upsertProject({
    id: "workflow-hub",
    displayName: "Workflow Hub"
  });

  const updated = repository.upsertProject({
    id: "workflow-hub",
    displayName: "Workflow Hub Local",
    metadata: { refreshed: true }
  });

  assert.equal(updated.displayName, "Workflow Hub Local");
  assert.equal(updated.createdAt, "2026-04-30T12:00:00.000Z");
  assert.equal(updated.updatedAt, "2026-04-30T12:05:00.000Z");
  assert.deepEqual(repository.listProjects().map((record) => record.id), ["workflow-hub"]);
});

test("rejects databases from a newer schema version", (t) => {
  const database = new Database(":memory:");
  t.after(() => database.close());

  database.pragma(`user_version = ${CURRENT_REGISTRY_SCHEMA_VERSION + 1}`);

  assert.throws(
    () => migrateRegistryDatabase(database),
    /newer than supported version/
  );
});
