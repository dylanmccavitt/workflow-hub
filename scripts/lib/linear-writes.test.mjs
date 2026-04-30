import assert from "node:assert/strict";
import test from "node:test";
import {
  LINEAR_STATUS_ACTIONS,
  applyLinearStatusAction,
  mergeCodexWorkpadCommentBody
} from "./linear-writes.mjs";

test("declares explicit workflow status actions", () => {
  assert.deepEqual(
    LINEAR_STATUS_ACTIONS.map((action) => action.stateName),
    ["Ready", "In Progress", "Human Review", "Needs Fixes", "Merging", "Done", "Blocked"]
  );
  assert.equal(LINEAR_STATUS_ACTIONS.find((action) => action.id === "ready").confirmationRequired, true);
  assert.equal(LINEAR_STATUS_ACTIONS.find((action) => action.id === "blocked").confirmationRequired, false);
});

test("requires confirmation for dispatching or external status actions", async () => {
  await assert.rejects(
    applyLinearStatusAction({
      issueId: "AGE-355",
      actionId: "ready",
      confirmed: false,
      graphqlClient: async () => {
        throw new Error("should not call Linear before confirmation");
      }
    }),
    /Confirmation is required/
  );
});

test("merges structured workpad sections without replacing unrelated notes", () => {
  const merged = mergeCodexWorkpadCommentBody(
    [
      "Intro should stay.",
      "",
      "## Codex Workpad",
      "",
      "### Notes",
      "- Keep this user note.",
      "",
      "### Handoff",
      "- Branch: feat/age-355-linear-writes",
      "- Review state: In Progress",
      "",
      "### Custom",
      "- Preserve this too."
    ].join("\n"),
    {
      sections: [
        {
          title: "Notes",
          mode: "append-lines",
          lines: ["- 2026-04-30T12:00:00.000Z: Workflow Hub moved Linear status."]
        },
        {
          title: "Handoff",
          mode: "set-list-items",
          items: {
            "Review state": "Human Review"
          }
        }
      ]
    }
  );

  assert.match(merged, /^Intro should stay\.\n\n## Codex Workpad/);
  assert.match(merged, /- Keep this user note\./);
  assert.match(merged, /- 2026-04-30T12:00:00\.000Z: Workflow Hub moved Linear status\./);
  assert.match(merged, /- Branch: feat\/age-355-linear-writes/);
  assert.match(merged, /- Review state: Human Review/);
  assert.doesNotMatch(merged, /- Review state: In Progress/);
  assert.match(merged, /### Custom\n- Preserve this too\./);
});

test("updates Linear status and the persistent workpad comment", async () => {
  const calls = [];
  const issueContext = {
    id: "linear-issue-AGE-355",
    identifier: "AGE-355",
    title: "[Linear] Safe status transitions and workpad writes",
    url: "https://linear.app/agentcee/issue/AGE-355/example",
    priority: 2,
    priorityLabel: "High",
    updatedAt: "2026-04-30T12:00:00.000Z",
    state: { id: "state-progress", name: "In Progress", type: "started" },
    team: {
      states: {
        nodes: [
          { id: "state-progress", name: "In Progress", type: "started" },
          { id: "state-review", name: "Human Review", type: "started" }
        ]
      }
    },
    comments: {
      nodes: [
        {
          id: "comment-workpad",
          body: [
            "## Codex Workpad",
            "",
            "### Notes",
            "- Do not lose this note.",
            "",
            "### Handoff",
            "- Review state: In Progress"
          ].join("\n"),
          createdAt: "2026-04-30T11:00:00.000Z",
          updatedAt: "2026-04-30T11:00:00.000Z"
        }
      ]
    }
  };

  const graphqlClient = async (query, variables) => {
    calls.push({ query, variables });

    if (query.includes("WorkflowHubIssueWriteContext")) {
      return { issue: issueContext };
    }

    if (query.includes("WorkflowHubIssueStateUpdate")) {
      assert.equal(variables.stateId, "state-review");
      return {
        issueUpdate: {
          success: true,
          issue: {
            ...issueContext,
            state: { id: "state-review", name: "Human Review", type: "started" },
            updatedAt: "2026-04-30T12:05:00.000Z"
          }
        }
      };
    }

    if (query.includes("WorkflowHubWorkpadUpdate")) {
      assert.equal(variables.commentId, "comment-workpad");
      return {
        commentUpdate: {
          success: true,
          comment: {
            id: "comment-workpad",
            body: variables.body,
            createdAt: "2026-04-30T11:00:00.000Z",
            updatedAt: "2026-04-30T12:05:00.000Z"
          }
        }
      };
    }

    throw new Error("unexpected GraphQL query");
  };

  Object.defineProperty(graphqlClient, "configured", { value: true });

  const result = await applyLinearStatusAction({
    issueId: "AGE-355",
    actionId: "human-review",
    confirmed: true,
    note: "Ready for Dylan.",
    graphqlClient,
    clock: () => new Date("2026-04-30T12:05:00.000Z")
  });

  assert.equal(result.previousStatus.name, "In Progress");
  assert.equal(result.status.name, "Human Review");
  assert.equal(result.workpad.operation, "updated");
  assert.match(result.workpad.body, /- Do not lose this note\./);
  assert.match(result.workpad.body, /Ready for Dylan\./);
  assert.match(result.workpad.body, /- Review state: Human Review/);
  assert.equal(calls.length, 3);
});
