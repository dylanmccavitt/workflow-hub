import assert from "node:assert/strict";
import test from "node:test";
import {
  createRegistryRepository,
  openRegistryDatabase
} from "./registry-db.mjs";
import {
  extractCodexWorkpad,
  linearIssueFromCachedRecord,
  syncLinearProjectIssues
} from "./linear-sync.mjs";

function memoryRepository() {
  const database = openRegistryDatabase(":memory:");
  const repository = createRegistryRepository(database, {
    clock: () => new Date("2026-04-30T12:00:00.000Z")
  });

  return repository;
}

function configuredProject() {
  return {
    id: "workflow-hub",
    displayName: "Workflow Hub",
    canonicalPath: "/repo/workflow-hub",
    canonicalBranch: "main",
    linear: {
      teamKey: "AGE",
      projectId: "linear-project-1",
      projectSlug: "workflow-hub"
    },
    workspaceRoots: ["/worktrees/workflow-hub"]
  };
}

test("extracts the persistent Codex Workpad comment", () => {
  const workpad = extractCodexWorkpad([
    {
      id: "comment-1",
      body: "ordinary update",
      updatedAt: "2026-04-30T11:00:00.000Z"
    },
    {
      id: "comment-2",
      body: "Intro\n\n## Codex Workpad\n\n### Notes\n- Keep me.",
      updatedAt: "2026-04-30T12:00:00.000Z",
      user: { id: "user-1", name: "Dylan" }
    }
  ]);

  assert.equal(workpad.commentId, "comment-2");
  assert.match(workpad.body, /^## Codex Workpad/);
  assert.equal(workpad.user.name, "Dylan");
});

test("syncs Linear project issues into registry cache metadata", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const issueDetail = {
    id: "linear-issue-1",
    identifier: "AGE-354",
    title: "[Linear] Issue, project, and workpad sync",
    url: "https://linear.app/agentcee/issue/AGE-354/linear-issue-project-and-workpad-sync",
    priority: 2,
    priorityLabel: "High",
    updatedAt: "2026-04-30T12:00:00.000Z",
    state: { id: "state-1", name: "In Progress", type: "started" },
    labels: {
      nodes: [
        { id: "label-1", name: "risk:medium" },
        { id: "label-2", name: "track:infra" }
      ]
    },
    parent: {
      id: "parent-1",
      identifier: "AGE-346",
      title: "[Workflow Hub] Track",
      url: "https://linear.app/agentcee/issue/AGE-346/track"
    },
    inverseRelations: {
      nodes: [
        {
          id: "relation-1",
          type: "blocks",
          issue: {
            id: "blocker-1",
            identifier: "AGE-349",
            title: "[Foundation] Local API",
            url: "https://linear.app/agentcee/issue/AGE-349/local-api",
            state: { name: "Done", type: "completed" }
          }
        }
      ]
    },
    relations: {
      nodes: [
        {
          id: "relation-2",
          type: "blocks",
          relatedIssue: {
            id: "blocked-1",
            identifier: "AGE-355",
            title: "[Linear] Safe writes",
            url: "https://linear.app/agentcee/issue/AGE-355/safe-writes",
            state: { name: "Backlog", type: "backlog" }
          }
        }
      ]
    },
    attachments: {
      nodes: [
        {
          id: "attachment-1",
          title: "Design doc",
          url: "https://example.com/design",
          source: "url",
          metadata: {}
        },
        {
          id: "attachment-2",
          title: "PR #12",
          url: "https://github.com/DylanMcCavitt/workflow-hub/pull/12",
          source: "github",
          metadata: { state: "open", branch: "feat/age-354-linear-sync" }
        }
      ]
    },
    comments: {
      nodes: [
        {
          id: "comment-1",
          body: "## Codex Workpad\n\n### Plan\n- [ ] Sync",
          createdAt: "2026-04-30T11:00:00.000Z",
          updatedAt: "2026-04-30T12:00:00.000Z",
          user: { id: "user-1", name: "Dylan" }
        }
      ]
    }
  };

  const graphqlClient = async (_query, variables) => {
    if (variables.issueId) {
      return { issue: issueDetail };
    }

    return {
      project: {
        id: "linear-project-1",
        name: "Workflow Hub",
        url: "https://linear.app/agentcee/project/workflow-hub",
        state: "planned",
        issues: {
          nodes: [
            {
              id: issueDetail.id,
              identifier: issueDetail.identifier,
              title: issueDetail.title,
              url: issueDetail.url,
              priority: issueDetail.priority,
              priorityLabel: issueDetail.priorityLabel,
              updatedAt: issueDetail.updatedAt,
              state: issueDetail.state,
              labels: issueDetail.labels,
              parent: issueDetail.parent
            }
          ],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      }
    };
  };
  Object.defineProperty(graphqlClient, "configured", { value: true });

  const result = await syncLinearProjectIssues({
    project: configuredProject(),
    repository,
    graphqlClient,
    clock: () => new Date("2026-04-30T12:05:00.000Z")
  });

  const cached = repository.getIssueByIdentifier("workflow-hub", "AGE-354");
  const issueState = linearIssueFromCachedRecord(cached, {
    now: new Date("2026-04-30T12:05:01.000Z")
  });

  assert.equal(result.status, "fresh");
  assert.equal(cached.title, "[Linear] Issue, project, and workpad sync");
  assert.equal(issueState.status, "In Progress");
  assert.deepEqual(issueState.labels.map((label) => label.name), ["risk:medium", "track:infra"]);
  assert.equal(issueState.parent.identifier, "AGE-346");
  assert.equal(issueState.blockers[0].identifier, "AGE-349");
  assert.equal(issueState.blockedIssues[0].identifier, "AGE-355");
  assert.equal(issueState.links.length, 2);
  assert.equal(issueState.pullRequests[0].number, 12);
  assert.match(issueState.codexWorkpad.body, /^## Codex Workpad/);
  assert.equal(issueState.cache.status, "fresh");
  assert.equal(repository.listIssuePullRequests(cached.id)[0].number, 12);
});

test("records not-configured and error sync states without replacing cached issues", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const missingConfig = await syncLinearProjectIssues({
    project: { ...configuredProject(), linear: { teamKey: "AGE" } },
    repository
  });

  assert.equal(missingConfig.status, "not-configured");
  assert.equal(repository.getProject("workflow-hub").metadata.linearSync.status, "not-configured");

  repository.upsertIssue({
    id: "linear-issue-AGE-354",
    projectId: "workflow-hub",
    identifier: "AGE-354",
    title: "Cached issue",
    status: "Ready",
    metadata: {
      linearSync: {
        fetchedAt: "2026-04-30T11:00:00.000Z",
        staleAfterMs: 1
      }
    }
  });

  const failingClient = async () => {
    throw new Error("network down");
  };
  Object.defineProperty(failingClient, "configured", { value: true });

  const failed = await syncLinearProjectIssues({
    project: configuredProject(),
    repository,
    graphqlClient: failingClient,
    clock: () => new Date("2026-04-30T12:00:00.000Z")
  });

  const staleIssue = linearIssueFromCachedRecord(repository.getIssueByIdentifier("workflow-hub", "AGE-354"), {
    now: new Date("2026-04-30T12:00:00.000Z"),
    syncError: failed.error
  });

  assert.equal(failed.status, "error");
  assert.equal(repository.getProject("workflow-hub").metadata.linearSync.status, "error");
  assert.equal(staleIssue.cache.status, "error");
  assert.equal(staleIssue.cache.stale, true);
});
