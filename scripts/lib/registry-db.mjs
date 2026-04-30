import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

export const CURRENT_REGISTRY_SCHEMA_VERSION = 1;
export const DEFAULT_REGISTRY_FILENAME = "workflow-hub.sqlite";

const MIGRATIONS = [
  {
    version: 1,
    name: "initial-registry-cache",
    up(database) {
      database.exec(`
        CREATE TABLE schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          repo_path TEXT,
          linear_team_key TEXT,
          linear_project_id TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE issues (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          identifier TEXT NOT NULL,
          title TEXT NOT NULL,
          status TEXT NOT NULL,
          linear_url TEXT,
          priority INTEGER,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(project_id, identifier)
        );

        CREATE INDEX issues_project_status_idx ON issues(project_id, status);

        CREATE TABLE workspaces (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
          path TEXT NOT NULL,
          branch TEXT,
          base_branch TEXT,
          head_sha TEXT,
          dirty INTEGER NOT NULL DEFAULT 0 CHECK(dirty IN (0, 1)),
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(issue_id, path)
        );

        CREATE INDEX workspaces_issue_idx ON workspaces(issue_id);

        CREATE TABLE runs (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
          workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
          runner_kind TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT,
          summary TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX runs_issue_status_idx ON runs(issue_id, status);

        CREATE TABLE pull_requests (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          number INTEGER,
          url TEXT NOT NULL,
          branch TEXT,
          status TEXT NOT NULL,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(provider, url)
        );

        CREATE INDEX pull_requests_issue_idx ON pull_requests(issue_id);

        CREATE TABLE review_sessions (
          id TEXT PRIMARY KEY,
          issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
          workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
          target TEXT NOT NULL,
          status TEXT NOT NULL,
          started_at TEXT,
          finished_at TEXT,
          notes TEXT,
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX review_sessions_issue_status_idx ON review_sessions(issue_id, status);

        CREATE TABLE events (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          issue_id TEXT REFERENCES issues(id) ON DELETE CASCADE,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          type TEXT NOT NULL,
          message TEXT NOT NULL,
          payload_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL
        );

        CREATE INDEX events_issue_sequence_idx ON events(issue_id, sequence);
        CREATE INDEX events_entity_sequence_idx ON events(entity_type, entity_id, sequence);
      `);
    }
  }
];

export function defaultRegistryDatabasePath() {
  const dataDir = process.env.WORKFLOW_HUB_DATA_DIR
    ?? path.join(os.homedir(), "Library", "Application Support", "Workflow Hub");

  return path.join(dataDir, DEFAULT_REGISTRY_FILENAME);
}

export function openRegistryDatabase(databasePath = defaultRegistryDatabasePath(), options = {}) {
  if (typeof databasePath !== "string" || databasePath.length === 0) {
    throw new Error("databasePath must be a non-empty string");
  }

  if (databasePath !== ":memory:" && !databasePath.startsWith("file:")) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  const database = new Database(databasePath, options);
  database.pragma("foreign_keys = ON");

  if (!options.readonly) {
    database.pragma("journal_mode = WAL");
    migrateRegistryDatabase(database);
  }

  return database;
}

export function getRegistrySchemaVersion(database) {
  return Number(database.pragma("user_version", { simple: true }));
}

export function migrateRegistryDatabase(database, migrations = MIGRATIONS) {
  const currentVersion = getRegistrySchemaVersion(database);
  const latestVersion = migrations.at(-1)?.version ?? 0;

  if (currentVersion > latestVersion) {
    throw new Error(
      `Registry database schema version ${currentVersion} is newer than supported version ${latestVersion}`
    );
  }

  const pending = migrations.filter((migration) => migration.version > currentVersion);
  if (pending.length === 0) return currentVersion;

  const applyMigrations = database.transaction(() => {
    for (const migration of pending) {
      migration.up(database);
      database.prepare(`
        INSERT INTO schema_migrations (version, name, applied_at)
        VALUES (?, ?, ?)
      `).run(migration.version, migration.name, timestamp());
      database.pragma(`user_version = ${migration.version}`);
    }
  });

  applyMigrations();
  return latestVersion;
}

export function createRegistryRepository(database, options = {}) {
  const clock = options.clock ?? (() => new Date());
  const now = () => clock().toISOString();

  return {
    database,

    close() {
      database.close();
    },

    getSchemaVersion() {
      return getRegistrySchemaVersion(database);
    },

    upsertProject(project) {
      const current = now();
      database.prepare(`
        INSERT INTO projects (
          id, display_name, repo_path, linear_team_key, linear_project_id,
          metadata_json, created_at, updated_at
        )
        VALUES (
          @id, @displayName, @repoPath, @linearTeamKey, @linearProjectId,
          @metadataJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          display_name = excluded.display_name,
          repo_path = excluded.repo_path,
          linear_team_key = excluded.linear_team_key,
          linear_project_id = excluded.linear_project_id,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run({
        id: requireString(project.id, "project.id"),
        displayName: requireString(project.displayName, "project.displayName"),
        repoPath: optionalString(project.repoPath),
        linearTeamKey: optionalString(project.linearTeamKey),
        linearProjectId: optionalString(project.linearProjectId),
        metadataJson: toJson(project.metadata),
        createdAt: current,
        updatedAt: current
      });

      return this.getProject(project.id);
    },

    getProject(id) {
      const row = database.prepare("SELECT * FROM projects WHERE id = ?").get(id);
      return row ? projectFromRow(row) : undefined;
    },

    listProjects() {
      return database.prepare("SELECT * FROM projects ORDER BY display_name, id")
        .all()
        .map(projectFromRow);
    },

    upsertIssue(issue) {
      const current = now();
      database.prepare(`
        INSERT INTO issues (
          id, project_id, identifier, title, status, linear_url, priority,
          metadata_json, created_at, updated_at
        )
        VALUES (
          @id, @projectId, @identifier, @title, @status, @linearUrl, @priority,
          @metadataJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          identifier = excluded.identifier,
          title = excluded.title,
          status = excluded.status,
          linear_url = excluded.linear_url,
          priority = excluded.priority,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run({
        id: requireString(issue.id, "issue.id"),
        projectId: requireString(issue.projectId, "issue.projectId"),
        identifier: requireString(issue.identifier, "issue.identifier"),
        title: requireString(issue.title, "issue.title"),
        status: requireString(issue.status, "issue.status"),
        linearUrl: optionalString(issue.linearUrl),
        priority: optionalInteger(issue.priority),
        metadataJson: toJson(issue.metadata),
        createdAt: current,
        updatedAt: current
      });

      return this.getIssue(issue.id);
    },

    getIssue(id) {
      const row = database.prepare("SELECT * FROM issues WHERE id = ?").get(id);
      return row ? issueFromRow(row) : undefined;
    },

    getIssueByIdentifier(projectId, identifier) {
      const row = database.prepare(`
        SELECT * FROM issues
        WHERE project_id = ? AND identifier = ?
      `).get(projectId, identifier);
      return row ? issueFromRow(row) : undefined;
    },

    listProjectIssues(projectId) {
      return database.prepare(`
        SELECT * FROM issues
        WHERE project_id = ?
        ORDER BY identifier
      `).all(projectId).map(issueFromRow);
    },

    upsertWorkspace(workspace) {
      const current = now();
      database.prepare(`
        INSERT INTO workspaces (
          id, issue_id, path, branch, base_branch, head_sha, dirty,
          metadata_json, created_at, updated_at
        )
        VALUES (
          @id, @issueId, @path, @branch, @baseBranch, @headSha, @dirty,
          @metadataJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          issue_id = excluded.issue_id,
          path = excluded.path,
          branch = excluded.branch,
          base_branch = excluded.base_branch,
          head_sha = excluded.head_sha,
          dirty = excluded.dirty,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run({
        id: requireString(workspace.id, "workspace.id"),
        issueId: requireString(workspace.issueId, "workspace.issueId"),
        path: requireString(workspace.path, "workspace.path"),
        branch: optionalString(workspace.branch),
        baseBranch: optionalString(workspace.baseBranch),
        headSha: optionalString(workspace.headSha),
        dirty: workspace.dirty ? 1 : 0,
        metadataJson: toJson(workspace.metadata),
        createdAt: current,
        updatedAt: current
      });

      return this.getWorkspace(workspace.id);
    },

    getWorkspace(id) {
      const row = database.prepare("SELECT * FROM workspaces WHERE id = ?").get(id);
      return row ? workspaceFromRow(row) : undefined;
    },

    listIssueWorkspaces(issueId) {
      return database.prepare(`
        SELECT * FROM workspaces
        WHERE issue_id = ?
        ORDER BY path
      `).all(issueId).map(workspaceFromRow);
    },

    upsertRun(run) {
      const current = now();
      database.prepare(`
        INSERT INTO runs (
          id, issue_id, workspace_id, runner_kind, status, started_at, finished_at,
          summary, metadata_json, created_at, updated_at
        )
        VALUES (
          @id, @issueId, @workspaceId, @runnerKind, @status, @startedAt, @finishedAt,
          @summary, @metadataJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          issue_id = excluded.issue_id,
          workspace_id = excluded.workspace_id,
          runner_kind = excluded.runner_kind,
          status = excluded.status,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          summary = excluded.summary,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run({
        id: requireString(run.id, "run.id"),
        issueId: requireString(run.issueId, "run.issueId"),
        workspaceId: optionalString(run.workspaceId),
        runnerKind: requireString(run.runnerKind, "run.runnerKind"),
        status: requireString(run.status, "run.status"),
        startedAt: optionalString(run.startedAt),
        finishedAt: optionalString(run.finishedAt),
        summary: optionalString(run.summary),
        metadataJson: toJson(run.metadata),
        createdAt: current,
        updatedAt: current
      });

      return this.getRun(run.id);
    },

    getRun(id) {
      const row = database.prepare("SELECT * FROM runs WHERE id = ?").get(id);
      return row ? runFromRow(row) : undefined;
    },

    listIssueRuns(issueId) {
      return database.prepare(`
        SELECT * FROM runs
        WHERE issue_id = ?
        ORDER BY created_at DESC, id
      `).all(issueId).map(runFromRow);
    },

    upsertPullRequest(pullRequest) {
      const current = now();
      database.prepare(`
        INSERT INTO pull_requests (
          id, issue_id, provider, number, url, branch, status,
          metadata_json, created_at, updated_at
        )
        VALUES (
          @id, @issueId, @provider, @number, @url, @branch, @status,
          @metadataJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          issue_id = excluded.issue_id,
          provider = excluded.provider,
          number = excluded.number,
          url = excluded.url,
          branch = excluded.branch,
          status = excluded.status,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run({
        id: requireString(pullRequest.id, "pullRequest.id"),
        issueId: requireString(pullRequest.issueId, "pullRequest.issueId"),
        provider: requireString(pullRequest.provider, "pullRequest.provider"),
        number: optionalInteger(pullRequest.number),
        url: requireString(pullRequest.url, "pullRequest.url"),
        branch: optionalString(pullRequest.branch),
        status: requireString(pullRequest.status, "pullRequest.status"),
        metadataJson: toJson(pullRequest.metadata),
        createdAt: current,
        updatedAt: current
      });

      return this.getPullRequest(pullRequest.id);
    },

    getPullRequest(id) {
      const row = database.prepare("SELECT * FROM pull_requests WHERE id = ?").get(id);
      return row ? pullRequestFromRow(row) : undefined;
    },

    listIssuePullRequests(issueId) {
      return database.prepare(`
        SELECT * FROM pull_requests
        WHERE issue_id = ?
        ORDER BY provider, number, url
      `).all(issueId).map(pullRequestFromRow);
    },

    upsertReviewSession(reviewSession) {
      const current = now();
      database.prepare(`
        INSERT INTO review_sessions (
          id, issue_id, workspace_id, target, status, started_at, finished_at, notes,
          metadata_json, created_at, updated_at
        )
        VALUES (
          @id, @issueId, @workspaceId, @target, @status, @startedAt, @finishedAt, @notes,
          @metadataJson, @createdAt, @updatedAt
        )
        ON CONFLICT(id) DO UPDATE SET
          issue_id = excluded.issue_id,
          workspace_id = excluded.workspace_id,
          target = excluded.target,
          status = excluded.status,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          notes = excluded.notes,
          metadata_json = excluded.metadata_json,
          updated_at = excluded.updated_at
      `).run({
        id: requireString(reviewSession.id, "reviewSession.id"),
        issueId: requireString(reviewSession.issueId, "reviewSession.issueId"),
        workspaceId: optionalString(reviewSession.workspaceId),
        target: requireString(reviewSession.target, "reviewSession.target"),
        status: requireString(reviewSession.status, "reviewSession.status"),
        startedAt: optionalString(reviewSession.startedAt),
        finishedAt: optionalString(reviewSession.finishedAt),
        notes: optionalString(reviewSession.notes),
        metadataJson: toJson(reviewSession.metadata),
        createdAt: current,
        updatedAt: current
      });

      return this.getReviewSession(reviewSession.id);
    },

    getReviewSession(id) {
      const row = database.prepare("SELECT * FROM review_sessions WHERE id = ?").get(id);
      return row ? reviewSessionFromRow(row) : undefined;
    },

    listIssueReviewSessions(issueId) {
      return database.prepare(`
        SELECT * FROM review_sessions
        WHERE issue_id = ?
        ORDER BY created_at DESC, id
      `).all(issueId).map(reviewSessionFromRow);
    },

    recordEvent(event) {
      const id = event.id ?? randomUUID();
      database.prepare(`
        INSERT INTO events (
          id, issue_id, entity_type, entity_id, type, message, payload_json, created_at
        )
        VALUES (
          @id, @issueId, @entityType, @entityId, @type, @message, @payloadJson, @createdAt
        )
      `).run({
        id,
        issueId: optionalString(event.issueId),
        entityType: requireString(event.entityType, "event.entityType"),
        entityId: requireString(event.entityId, "event.entityId"),
        type: requireString(event.type, "event.type"),
        message: requireString(event.message, "event.message"),
        payloadJson: toJson(event.payload),
        createdAt: optionalString(event.createdAt) ?? now()
      });

      return this.getEvent(id);
    },

    getEvent(id) {
      const row = database.prepare("SELECT * FROM events WHERE id = ?").get(id);
      return row ? eventFromRow(row) : undefined;
    },

    listIssueEvents(issueId) {
      return database.prepare(`
        SELECT * FROM events
        WHERE issue_id = ?
        ORDER BY sequence
      `).all(issueId).map(eventFromRow);
    },

    listEntityEvents(entityType, entityId) {
      return database.prepare(`
        SELECT * FROM events
        WHERE entity_type = ? AND entity_id = ?
        ORDER BY sequence
      `).all(entityType, entityId).map(eventFromRow);
    }
  };
}

function timestamp() {
  return new Date().toISOString();
}

function requireString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }

  return value;
}

function optionalString(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("optional string fields must be non-empty when present");
  }

  return value;
}

function optionalInteger(value) {
  if (value === undefined || value === null) return null;
  if (!Number.isInteger(value)) {
    throw new Error("optional integer fields must be integers when present");
  }

  return value;
}

function toJson(value) {
  return JSON.stringify(value ?? {});
}

function fromJson(value) {
  return JSON.parse(value ?? "{}");
}

function projectFromRow(row) {
  return {
    id: row.id,
    displayName: row.display_name,
    repoPath: row.repo_path,
    linearTeamKey: row.linear_team_key,
    linearProjectId: row.linear_project_id,
    metadata: fromJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function issueFromRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    identifier: row.identifier,
    title: row.title,
    status: row.status,
    linearUrl: row.linear_url,
    priority: row.priority,
    metadata: fromJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function workspaceFromRow(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    path: row.path,
    branch: row.branch,
    baseBranch: row.base_branch,
    headSha: row.head_sha,
    dirty: Boolean(row.dirty),
    metadata: fromJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function runFromRow(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    workspaceId: row.workspace_id,
    runnerKind: row.runner_kind,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    summary: row.summary,
    metadata: fromJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function pullRequestFromRow(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    provider: row.provider,
    number: row.number,
    url: row.url,
    branch: row.branch,
    status: row.status,
    metadata: fromJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function reviewSessionFromRow(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    workspaceId: row.workspace_id,
    target: row.target,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    notes: row.notes,
    metadata: fromJson(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function eventFromRow(row) {
  return {
    sequence: row.sequence,
    id: row.id,
    issueId: row.issue_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    type: row.type,
    message: row.message,
    payload: fromJson(row.payload_json),
    createdAt: row.created_at
  };
}
