import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeEndpointPayload,
  readSymphonyState,
  symphonyConfig
} from "./symphony-state.mjs";

const issue = {
  issueId: "AGE-356",
  status: "available",
  linear: {
    linearId: "linear-issue-AGE-356",
    identifier: "AGE-356",
    title: "[Symphony] State discovery and adapter",
    status: "In Progress",
    url: "https://linear.app/agentcee/issue/AGE-356/symphony-state-discovery-and-adapter"
  }
};

const workspace = {
  issueId: "AGE-356",
  status: "available",
  found: true,
  path: "/Users/dylanmccavitt/.codex/symphony-workspaces/workflow-hub/AGE-356"
};

test("uses the documented Symphony state endpoint defaults", () => {
  const config = symphonyConfig({});

  assert.equal(config.stateEndpoint, "http://127.0.0.1:4002/api/v1/state");
  assert.match(config.logsRoot, /symphony-logs\/workflow-hub$/);
});

test("normalizes running and retrying endpoint entries", () => {
  const state = normalizeEndpointPayload(
    {
      generated_at: "2026-04-30T19:45:55Z",
      counts: { running: 1, retrying: 1 },
      running: [
        {
          issue_id: "linear-issue-AGE-356",
          issue_identifier: "AGE-356",
          state: "In Progress",
          workspace_path: workspace.path,
          session_id: "thread-1",
          last_event: "notification",
          last_message: "rate limits updated",
          tokens: {
            input_tokens: 10,
            output_tokens: 3,
            total_tokens: 13
          }
        }
      ],
      retrying: [
        {
          issue_id: "linear-issue-AGE-357",
          issue_identifier: "AGE-357",
          attempt: 2,
          due_at: "2026-04-30T19:50:00Z",
          error: "temporary rate limit",
          workspace_path: "/worktrees/AGE-357"
        }
      ]
    },
    {
      issueId: "AGE-356",
      issue,
      workspace,
      endpoint: "http://127.0.0.1:4002/api/v1/state"
    }
  );

  assert.equal(state.status, "available");
  assert.equal(state.running, true);
  assert.equal(state.source, "endpoint");
  assert.equal(state.counts.active, 1);
  assert.equal(state.counts.queue, 1);
  assert.equal(state.selectedIssue.normalizedState, "active");
  assert.equal(state.selectedIssue.sessionId, "thread-1");
  assert.equal(state.selectedIssue.workspacePath, workspace.path);
  assert.equal(state.issues.find((entry) => entry.identifier === "AGE-357").normalizedState, "queue");
});

test("normalizes blocked failed and completed endpoint entries", () => {
  const state = normalizeEndpointPayload(
    {
      generated_at: "2026-04-30T19:45:55Z",
      blocked: [
        {
          issue_identifier: "AGE-357",
          status: "blocked",
          workspace_path: "/worktrees/AGE-357",
          last_error: "waiting on review"
        }
      ],
      failed: [
        {
          issue_identifier: "AGE-358",
          state: "error",
          error: "branch checkout failed"
        }
      ],
      completed: [
        {
          issue_identifier: "AGE-359",
          status: "done"
        }
      ]
    },
    {
      issueId: "AGE-357",
      issue,
      workspace,
      endpoint: "http://127.0.0.1:4002/api/v1/state"
    }
  );

  assert.equal(state.counts.blocked, 1);
  assert.equal(state.counts.failed, 1);
  assert.equal(state.counts.complete, 1);
  assert.equal(state.selectedIssue.normalizedState, "blocked");
  assert.match(state.selectedIssue.reason, /blocked/);
  assert.equal(state.issues.find((entry) => entry.identifier === "AGE-358").normalizedState, "failed");
  assert.equal(state.issues.find((entry) => entry.identifier === "AGE-359").normalizedState, "complete");
});

test("normalizes queued endpoint aliases", () => {
  const state = normalizeEndpointPayload(
    {
      generated_at: "2026-04-30T19:45:55Z",
      queued: [
        {
          issue_identifier: "AGE-357",
          status: "queued",
          due_at: "2026-04-30T19:55:00Z"
        }
      ]
    },
    {
      issueId: "AGE-357",
      issue,
      workspace,
      endpoint: "http://127.0.0.1:4002/api/v1/state"
    }
  );

  assert.equal(state.counts.queue, 1);
  assert.equal(state.selectedIssue.normalizedState, "queue");
});

test("infers selected issue state from Linear when endpoint has no matching entry", () => {
  const state = normalizeEndpointPayload(
    {
      generated_at: "2026-04-30T19:45:55Z",
      running: [],
      retrying: []
    },
    {
      issueId: "AGE-356",
      issue: {
        ...issue,
        linear: {
          ...issue.linear,
          status: "Done"
        }
      },
      workspace,
      endpoint: "http://127.0.0.1:4002/api/v1/state"
    }
  );

  assert.equal(state.status, "available");
  assert.equal(state.counts.complete, 1);
  assert.equal(state.selectedIssue.normalizedState, "complete");
  assert.equal(state.selectedIssue.source, "linear");
  assert.match(state.selectedIssue.reason, /terminal/);
});

test("reports snapshot errors as unavailable instead of empty success", () => {
  const state = normalizeEndpointPayload(
    {
      generated_at: "2026-04-30T19:45:55Z",
      error: {
        code: "snapshot_timeout",
        message: "Snapshot timed out"
      }
    },
    {
      issueId: "AGE-356",
      issue,
      workspace,
      endpoint: "http://127.0.0.1:4002/api/v1/state"
    }
  );

  assert.equal(state.status, "unavailable");
  assert.equal(state.running, true);
  assert.equal(state.counts.unknown, 1);
  assert.equal(state.selectedIssue.normalizedState, "unknown");
  assert.match(state.detail, /Snapshot timed out/);
});

test("falls back to documented logs when the endpoint is unavailable", async () => {
  const state = await readSymphonyState({
    issueId: "AGE-356",
    issue,
    workspace,
    env: {
      SYMPHONY_PORT: "4999",
      SYMPHONY_LOGS_ROOT: "/tmp/workflow-hub-symphony-logs"
    },
    fetchJson: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:4999");
    },
    readLatestLog: () => ({
      path: "/tmp/workflow-hub-symphony-logs/log/symphony.log.1",
      latestLine: "2026-04-30T19:45:55Z info: GET /api/v1/state",
      latestAt: "2026-04-30T19:45:55Z"
    }),
    clock: () => new Date("2026-04-30T19:45:55.000Z")
  });

  assert.equal(state.status, "unavailable");
  assert.equal(state.running, false);
  assert.equal(state.source, "logs");
  assert.equal(state.logs.latestPath, "/tmp/workflow-hub-symphony-logs/log/symphony.log.1");
  assert.match(state.detail, /ECONNREFUSED/);
  assert.equal(state.selectedIssue.normalizedState, "unknown");
});
