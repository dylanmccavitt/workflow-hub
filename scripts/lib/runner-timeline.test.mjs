import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRunnerTimeline,
  normalizeRunnerState,
  normalizeSymphonyRunnerState
} from "./runner-timeline.mjs";

test("normalizes provider status shapes into one runner state set", () => {
  assert.equal(normalizeRunnerState("PENDING"), "queued");
  assert.equal(normalizeRunnerState("RUNNING"), "running");
  assert.equal(normalizeRunnerState("approval_requested"), "blocked");
  assert.equal(normalizeRunnerState("CANCELED"), "cancelled");
  assert.equal(normalizeRunnerState("finished"), "succeeded");
  assert.equal(normalizeRunnerState("FAILED"), "failed");
  assert.equal(normalizeRunnerState("unexpected-shape"), "unknown");

  assert.equal(normalizeSymphonyRunnerState("queue"), "queued");
  assert.equal(normalizeSymphonyRunnerState("active"), "running");
  assert.equal(normalizeSymphonyRunnerState("complete"), "succeeded");
});

test("builds a unified timeline while preserving raw provider details", () => {
  const timeline = buildRunnerTimeline({
    issue: {
      events: [
        {
          id: "event-cursor-status",
          issueId: "linear-issue-AGE-365",
          entityType: "run",
          entityId: "cursor-run-1",
          type: "cursor.event.status",
          message: "Cursor status: BLOCKED - Waiting for review",
          payload: {
            agentId: "cursor-agent-1",
            runId: "cursor-run-1",
            cwd: "/worktrees/workflow-hub/AGE-365",
            event: {
              type: "status",
              status: "BLOCKED",
              message: "Waiting for review"
            }
          },
          createdAt: "2026-05-01T12:02:00.000Z"
        },
        {
          id: "event-codex-finished",
          issueId: "linear-issue-AGE-365",
          entityType: "run",
          entityId: "codex-run-1",
          type: "codex.run.finished",
          message: "AGE-365 Codex run cancelled",
          payload: {
            runId: "codex-run-1",
            sessionId: "codex-session-1",
            logPath: "/tmp/codex-run-1.jsonl",
            summaryPath: "/tmp/codex-run-1-summary.md",
            cwd: "/worktrees/workflow-hub/AGE-365",
            status: "cancelled",
            signal: "SIGTERM"
          },
          createdAt: "2026-05-01T12:03:00.000Z"
        }
      ],
      runs: [
        {
          id: "cursor-run-1",
          issueId: "linear-issue-AGE-365",
          runnerKind: "Cursor SDK",
          status: "running",
          startedAt: "2026-05-01T12:01:00.000Z",
          metadata: {
            agentId: "cursor-agent-1",
            runId: "cursor-run-1",
            cwd: "/worktrees/workflow-hub/AGE-365"
          }
        },
        {
          id: "codex-run-1",
          issueId: "linear-issue-AGE-365",
          runnerKind: "Codex",
          status: "cancelled",
          startedAt: "2026-05-01T12:00:00.000Z",
          finishedAt: "2026-05-01T12:03:00.000Z",
          metadata: {
            sessionId: "codex-session-1",
            runId: "codex-run-1",
            logPath: "/tmp/codex-run-1.jsonl",
            summaryPath: "/tmp/codex-run-1-summary.md",
            cwd: "/worktrees/workflow-hub/AGE-365"
          }
        },
        {
          id: "codex-run-2",
          issueId: "linear-issue-AGE-365",
          runnerKind: "Codex",
          status: "error",
          startedAt: "2026-05-01T12:04:00.000Z",
          finishedAt: "2026-05-01T12:05:00.000Z",
          summary: "Codex exited with code 1.",
          metadata: {
            runId: "codex-run-2",
            logPath: "/tmp/codex-run-2.jsonl"
          }
        }
      ]
    },
    symphonyState: {
      source: "endpoint",
      endpoint: "http://127.0.0.1:4002/api/v1/state",
      generatedAt: "2026-05-01T12:06:00.000Z",
      counts: {
        queue: 0,
        active: 0,
        complete: 0,
        blocked: 1,
        failed: 0,
        unknown: 0
      },
      selectedIssue: {
        identifier: "AGE-365",
        normalizedState: "blocked",
        symphonyStatus: "Blocked",
        reason: "Symphony reports a blocked state.",
        sessionId: "symphony-session-1",
        workspacePath: "/worktrees/workflow-hub/AGE-365",
        lastEventAt: "2026-05-01T12:06:00.000Z"
      }
    }
  });

  assert.deepEqual(
    timeline.map((entry) => [entry.runnerKind, entry.normalizedState]),
    [
      ["Cursor SDK", "blocked"],
      ["Codex", "cancelled"],
      ["Codex", "failed"],
      ["Symphony", "blocked"]
    ]
  );

  const cursorEntry = timeline[0];
  assert.equal(cursorEntry.rawStatus, "BLOCKED");
  assert.equal(cursorEntry.agentId, "cursor-agent-1");
  assert.deepEqual(cursorEntry.rawEvent, {
    type: "status",
    status: "BLOCKED",
    message: "Waiting for review"
  });

  const codexCancelEntry = timeline[1];
  assert.equal(codexCancelEntry.sessionId, "codex-session-1");
  assert.equal(codexCancelEntry.logPath, "/tmp/codex-run-1.jsonl");

  const codexErrorEntry = timeline[2];
  assert.equal(codexErrorEntry.source, "run-record");
  assert.match(codexErrorEntry.detail, /Codex exited with code 1/);

  const symphonyEntry = timeline[3];
  assert.equal(symphonyEntry.rawRunnerId, "symphony-session-1");
  assert.equal(symphonyEntry.rawEvent.endpoint, "http://127.0.0.1:4002/api/v1/state");
});

test("ignores non-run issue events when building the runner timeline", () => {
  const timeline = buildRunnerTimeline({
    issue: {
      events: [
        {
          id: "event-linear-status",
          issueId: "linear-issue-AGE-365",
          entityType: "linear",
          entityId: "linear-issue-AGE-365",
          type: "linear.status.updated",
          message: "Linear status set to Human Review.",
          payload: {
            previousStatus: "In Progress",
            nextStatus: "Human Review"
          },
          createdAt: "2026-05-01T12:07:00.000Z"
        },
        {
          id: "event-review-prompt",
          issueId: "linear-issue-AGE-365",
          entityType: "review",
          entityId: "review-fix-prompt",
          type: "review.fix_prompt.saved",
          message: "Review fix prompt saved.",
          payload: {
            selectedReviewCommentIds: ["comment-1"]
          },
          createdAt: "2026-05-01T12:08:00.000Z"
        }
      ],
      runs: []
    }
  });

  assert.deepEqual(timeline, []);
});

test("does not create Symphony timeline rows from Linear-inferred selected state", () => {
  const timeline = buildRunnerTimeline({
    issue: {
      events: [],
      runs: []
    },
    symphonyState: {
      source: "endpoint",
      endpoint: "http://127.0.0.1:4002/api/v1/state",
      generatedAt: "2026-05-01T12:09:00.000Z",
      selectedIssue: {
        identifier: "AGE-365",
        issueId: "linear-issue-AGE-365",
        linearStatus: "In Progress",
        normalizedState: "active",
        source: "linear",
        reason: "No Symphony entry was found; Linear status is In Progress.",
        workspacePath: "/worktrees/workflow-hub/AGE-365"
      }
    }
  });

  assert.deepEqual(timeline, []);
});
