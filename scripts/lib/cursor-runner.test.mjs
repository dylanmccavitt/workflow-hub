import assert from "node:assert/strict";
import test from "node:test";
import {
  cursorConfigForProject,
  fetchCursorCloudResult,
  startCursorCloudRun,
  startCursorLocalRun
} from "./cursor-runner.mjs";
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
    cursor: {
      model: "composer-2",
      configPath: ".cursor",
      apiKeyEnv: "CURSOR_API_KEY"
    }
  }
};

const state = {
  issue: {
    issueId: "AGE-361",
    source: "linear",
    status: "available",
    linear: {
      linearId: "linear-issue-AGE-361",
      identifier: "AGE-361",
      title: "[Cursor SDK] Local runner integration",
      status: "In Progress",
      url: "https://linear.app/agentcee/issue/AGE-361/example",
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
    issueId: "AGE-361",
    status: "available",
    found: true,
    projectId: "workflow-hub",
    projectName: "Workflow Hub",
    path: "/worktrees/workflow-hub/AGE-361",
    branch: "feat/age-361-cursor-sdk-local-runner",
    headSha: "abc1234",
    remote: "git@github.com:DylanMcCavitt/workflow-hub.git",
    dirty: false,
    gitStatus: ["## feat/age-361-cursor-sdk-local-runner"]
  }
};

test("resolves Cursor config paths relative to the issue worktree", () => {
  const config = cursorConfigForProject(project, "/worktrees/workflow-hub/AGE-361");

  assert.equal(config.model, "composer-2");
  assert.equal(config.configPath, ".cursor");
  assert.equal(config.resolvedConfigPath, "/worktrees/workflow-hub/AGE-361/.cursor");
  assert.equal(config.apiKeyEnv, "CURSOR_API_KEY");
  assert.equal(config.cloud.enabled, false);
});

test("normalizes Cursor cloud config without exposing key values", () => {
  const config = cursorConfigForProject({
    runners: {
      cursor: {
        model: "composer-2",
        apiKeyEnv: "CURSOR_API_KEY",
        cloud: {
          enabled: true,
          repositoryUrl: "https://github.com/DylanMcCavitt/workflow-hub",
          startingRef: "main"
        }
      }
    }
  }, "/worktrees/workflow-hub/AGE-362");

  assert.equal(config.cloud.enabled, true);
  assert.equal(config.cloud.apiKeyEnv, "CURSOR_API_KEY");
  assert.equal(config.cloud.repositoryUrl, "https://github.com/DylanMcCavitt/workflow-hub");
  assert.equal(config.cloud.environment.type, "cloud");
  assert.equal(config.cloud.autoCreatePR, true);
});

test("starts a local Cursor SDK run with the issue worktree cwd and persists stream events", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  const oldApiKey = process.env.CURSOR_API_KEY;
  delete process.env.CURSOR_API_KEY;
  t.after(() => {
    if (oldApiKey === undefined) {
      delete process.env.CURSOR_API_KEY;
    } else {
      process.env.CURSOR_API_KEY = oldApiKey;
    }
  });
  let createOptions;
  let sentPrompt;

  const fakeSdk = {
    Agent: {
      async create(options) {
        createOptions = options;
        return {
          agentId: "cursor-agent-1",
          async send(prompt) {
            sentPrompt = prompt;
            return {
              id: "cursor-run-1",
              agentId: "cursor-agent-1",
              status: "running",
              supports(operation) {
                return operation === "wait";
              },
              async *stream() {
                yield {
                  type: "status",
                  agent_id: "cursor-agent-1",
                  run_id: "cursor-run-1",
                  status: "RUNNING",
                  message: "Working"
                };
                yield {
                  type: "assistant",
                  agent_id: "cursor-agent-1",
                  run_id: "cursor-run-1",
                  message: {
                    role: "assistant",
                    content: [{ type: "text", text: "Implemented the requested runner." }]
                  }
                };
              },
              async wait() {
                return {
                  id: "cursor-run-1",
                  status: "finished",
                  result: "Implemented the requested runner.",
                  model: { id: "composer-2" }
                };
              }
            };
          },
          close() {}
        };
      }
    }
  };

  const result = await startCursorLocalRun({
    issueId: "age-361",
    prompt: "Wire the local runner.",
    project,
    state,
    workspace: state.workspace,
    repository,
    cursorSdkLoader: async () => fakeSdk,
    clock: () => new Date("2026-05-01T12:00:00.000Z")
  });

  assert.equal(createOptions.local.cwd, "/worktrees/workflow-hub/AGE-361");
  assert.deepEqual(createOptions.model, { id: "composer-2" });
  assert.equal("apiKey" in createOptions, false);
  assert.equal(sentPrompt, "Wire the local runner.");
  assert.equal(result.agentId, "cursor-agent-1");
  assert.equal(result.runId, "cursor-run-1");
  assert.equal(result.status, "finished");
  assert.equal(result.streamedEventCount, 2);

  const issue = repository.getIssueByIdentifier("workflow-hub", "AGE-361");
  const runs = repository.listIssueRuns(issue.id);
  const events = repository.listIssueEvents(issue.id);

  assert.equal(runs[0].id, "cursor-run-1");
  assert.equal(runs[0].runnerKind, "Cursor SDK");
  assert.equal(runs[0].status, "finished");
  assert.equal(runs[0].summary, "Implemented the requested runner.");
  assert.equal(runs[0].metadata.agentId, "cursor-agent-1");
  assert.equal(runs[0].metadata.runId, "cursor-run-1");
  assert.equal(runs[0].metadata.model, "composer-2");
  assert.equal(runs[0].metadata.prompt, "Wire the local runner.");
  assert.deepEqual(
    events.map((event) => event.type),
    [
      "cursor.run.started",
      "cursor.event.status",
      "cursor.event.assistant",
      "cursor.run.finished"
    ]
  );
});

test("dry-run validates the local Cursor target without creating registry records", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());

  const result = await startCursorLocalRun({
    issueId: "AGE-361",
    prompt: "Check local Cursor target.",
    project,
    state,
    workspace: state.workspace,
    repository,
    dryRun: true,
    clock: () => new Date("2026-05-01T12:00:00.000Z")
  });

  const issue = repository.getIssueByIdentifier("workflow-hub", "AGE-361");

  assert.equal(result.dryRun, true);
  assert.equal(result.cwd, "/worktrees/workflow-hub/AGE-361");
  assert.equal(result.configPath, "/worktrees/workflow-hub/AGE-361/.cursor");
  assert.equal(repository.listIssueRuns(issue.id).length, 0);
  assert.equal(repository.listIssueEvents(issue.id).length, 0);
});

test("starts a Cursor cloud run and persists PR link metadata", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  const oldApiKey = process.env.CURSOR_API_KEY;
  process.env.CURSOR_API_KEY = "test-cursor-key";
  t.after(() => {
    if (oldApiKey === undefined) {
      delete process.env.CURSOR_API_KEY;
    } else {
      process.env.CURSOR_API_KEY = oldApiKey;
    }
  });
  const cloudProject = {
    ...project,
    runners: {
      cursor: {
        ...project.runners.cursor,
        cloud: {
          enabled: true,
          repositoryUrl: "https://github.com/DylanMcCavitt/workflow-hub",
          startingRef: "main",
          autoCreatePR: true
        }
      }
    }
  };
  let createRequest;
  class FakeCloudApiClient {
    constructor(apiKey) {
      assert.equal(apiKey, "test-cursor-key");
    }

    async createAgent(request) {
      createRequest = request;
      return {
        agent: {
          id: "cloud-agent-1",
          url: "https://cursor.com/agents/cloud-agent-1",
          status: "ACTIVE",
          createdAt: "2026-05-05T12:00:00.000Z",
          updatedAt: "2026-05-05T12:00:00.000Z"
        },
        run: {
          id: "cloud-run-1",
          agentId: "cloud-agent-1",
          status: "RUNNING",
          createdAt: "2026-05-05T12:00:00.000Z",
          updatedAt: "2026-05-05T12:00:00.000Z",
          git: {
            branches: [
              {
                repoUrl: "https://github.com/DylanMcCavitt/workflow-hub",
                branch: "cursor/cloud-run-1",
                prUrl: "https://github.com/DylanMcCavitt/workflow-hub/pull/42"
              }
            ]
          }
        }
      };
    }
  }

  const result = await startCursorCloudRun({
    issueId: "AGE-361",
    prompt: "Run in cloud.",
    project: cloudProject,
    state,
    workspace: state.workspace,
    repository,
    cursorCloudClientLoader: async () => ({ CloudApiClient: FakeCloudApiClient }),
    clock: () => new Date("2026-05-05T12:00:00.000Z")
  });

  assert.equal(createRequest.repos[0].url, "https://github.com/DylanMcCavitt/workflow-hub");
  assert.equal(createRequest.repos[0].startingRef, "main");
  assert.equal(createRequest.autoCreatePR, true);
  assert.equal(result.runtime, "cloud");
  assert.equal(result.agentId, "cloud-agent-1");
  assert.equal(result.runId, "cloud-run-1");
  assert.equal(result.prLinks[0].url, "https://github.com/DylanMcCavitt/workflow-hub/pull/42");

  const issue = repository.getIssueByIdentifier("workflow-hub", "AGE-361");
  const runs = repository.listIssueRuns(issue.id);
  const events = repository.listIssueEvents(issue.id);
  assert.equal(runs[0].metadata.runtime, "cloud");
  assert.equal(runs[0].metadata.repositoryUrl, "https://github.com/DylanMcCavitt/workflow-hub");
  assert.equal(events[0].type, "cursor.cloud.run.started");
});

test("fetches Cursor cloud run status with artifact URLs", async (t) => {
  const repository = memoryRepository();
  t.after(() => repository.close());
  const oldApiKey = process.env.CURSOR_API_KEY;
  process.env.CURSOR_API_KEY = "test-cursor-key";
  t.after(() => {
    if (oldApiKey === undefined) {
      delete process.env.CURSOR_API_KEY;
    } else {
      process.env.CURSOR_API_KEY = oldApiKey;
    }
  });
  const cloudProject = {
    ...project,
    runners: {
      cursor: {
        ...project.runners.cursor,
        cloud: {
          enabled: true,
          repositoryUrl: "https://github.com/DylanMcCavitt/workflow-hub"
        }
      }
    }
  };
  class FakeCloudApiClient {
    async getAgent(agentId) {
      return {
        id: agentId,
        url: `https://cursor.com/agents/${agentId}`,
        status: "ACTIVE"
      };
    }

    async getRun({ agentId, runId }) {
      return {
        id: runId,
        agentId,
        status: "FINISHED",
        createdAt: "2026-05-05T12:00:00.000Z",
        updatedAt: "2026-05-05T12:05:00.000Z",
        result: "Opened a PR.",
        git: {
          branches: [
            {
              repoUrl: "https://github.com/DylanMcCavitt/workflow-hub",
              branch: "cursor/cloud-run-1",
              prUrl: "https://github.com/DylanMcCavitt/workflow-hub/pull/42"
            }
          ]
        }
      };
    }

    async listArtifacts() {
      return {
        items: [
          {
            path: "/opt/cursor/artifacts/demo.png",
            sizeBytes: 1024,
            updatedAt: "2026-05-05T12:05:00.000Z"
          }
        ]
      };
    }

    async getArtifactDownloadUrl({ path }) {
      return {
        url: `https://cursor.com/artifacts/${encodeURIComponent(path)}`,
        expiresAt: "2026-05-05T13:05:00.000Z"
      };
    }
  }

  const result = await fetchCursorCloudResult({
    issueId: "AGE-361",
    agentId: "cloud-agent-1",
    runId: "cloud-run-1",
    project: cloudProject,
    state,
    workspace: state.workspace,
    repository,
    cursorCloudClientLoader: async () => ({ CloudApiClient: FakeCloudApiClient }),
    clock: () => new Date("2026-05-05T12:06:00.000Z")
  });

  assert.equal(result.status, "finished");
  assert.equal(result.summary, "Opened a PR.");
  assert.equal(result.artifacts[0].path, "/opt/cursor/artifacts/demo.png");
  assert.match(result.artifacts[0].url, /cursor\.com\/artifacts/);
  assert.equal(result.prLinks[0].url, "https://github.com/DylanMcCavitt/workflow-hub/pull/42");
});
