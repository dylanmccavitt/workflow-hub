import {
  CODEX_WORKPAD_MARKER,
  createLinearGraphqlClient
} from "./linear-sync.mjs";

export const LINEAR_STATUS_ACTIONS = [
  {
    id: "ready",
    label: "Ready",
    stateName: "Ready",
    confirmationRequired: true,
    confirmationReason: "Ready is a dispatchable workflow state and may wake a runner."
  },
  {
    id: "in-progress",
    label: "In Progress",
    stateName: "In Progress",
    confirmationRequired: true,
    confirmationReason: "In Progress marks the issue active for worker execution."
  },
  {
    id: "human-review",
    label: "Human Review",
    stateName: "Human Review",
    confirmationRequired: true,
    confirmationReason: "Human Review asks a person to inspect the PR, workpad, or local review path."
  },
  {
    id: "needs-fixes",
    label: "Needs Fixes",
    stateName: "Needs Fixes",
    confirmationRequired: true,
    confirmationReason: "Needs Fixes is a rework state and can wake a configured worker loop."
  },
  {
    id: "merging",
    label: "Merging",
    stateName: "Merging",
    confirmationRequired: true,
    confirmationReason: "Merging is a human-gated closeout state for PR landing."
  },
  {
    id: "done",
    label: "Done",
    stateName: "Done",
    confirmationRequired: true,
    confirmationReason: "Done closes the workflow state after merge and final handoff."
  },
  {
    id: "blocked",
    label: "Blocked",
    stateName: "Blocked",
    confirmationRequired: false,
    confirmationReason: "Blocked parks the issue and should not dispatch work."
  }
];

const LINEAR_ISSUE_WRITE_CONTEXT_QUERY = `
  query WorkflowHubIssueWriteContext($issueId: String!) {
    issue(id: $issueId) {
      id
      identifier
      title
      url
      priority
      priorityLabel
      updatedAt
      state { id name type }
      team {
        id
        states {
          nodes { id name type }
        }
      }
      comments(first: 100) {
        nodes {
          id
          body
          createdAt
          updatedAt
          user { id name email }
        }
      }
    }
  }
`;

const LINEAR_UPDATE_ISSUE_STATE_MUTATION = `
  mutation WorkflowHubIssueStateUpdate($issueId: String!, $stateId: String!) {
    issueUpdate(id: $issueId, input: { stateId: $stateId }) {
      success
      issue {
        id
        identifier
        title
        url
        priority
        priorityLabel
        updatedAt
        state { id name type }
      }
    }
  }
`;

const LINEAR_COMMENT_CREATE_MUTATION = `
  mutation WorkflowHubWorkpadCreate($issueId: String!, $body: String!) {
    commentCreate(input: { issueId: $issueId, body: $body }) {
      success
      comment {
        id
        body
        createdAt
        updatedAt
        user { id name email }
      }
    }
  }
`;

const LINEAR_COMMENT_UPDATE_MUTATION = `
  mutation WorkflowHubWorkpadUpdate($commentId: String!, $body: String!) {
    commentUpdate(id: $commentId, input: { body: $body }) {
      success
      comment {
        id
        body
        createdAt
        updatedAt
        user { id name email }
      }
    }
  }
`;

export class LinearWriteError extends Error {
  constructor(message, code = "LINEAR_WRITE_ERROR") {
    super(message);
    this.name = "LinearWriteError";
    this.code = code;
  }
}

export function normalizeStatusActionId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LinearWriteError("actionId is required.", "VALIDATION_ERROR");
  }

  return value.trim().toLowerCase().replace(/[\s_]+/g, "-");
}

export function getLinearStatusAction(value) {
  const normalized = normalizeStatusActionId(value);
  const action = LINEAR_STATUS_ACTIONS.find(
    (candidate) => candidate.id === normalized || normalizeStatusActionId(candidate.stateName) === normalized
  );

  if (!action) {
    throw new LinearWriteError(`Unsupported Linear status action: ${value}`, "VALIDATION_ERROR");
  }

  return action;
}

export async function applyLinearStatusAction(options = {}) {
  const {
    issueId,
    actionId,
    confirmed = false,
    note,
    graphqlClient = createLinearGraphqlClient(),
    clock = () => new Date()
  } = options;
  const action = getLinearStatusAction(actionId);

  if (action.confirmationRequired && confirmed !== true) {
    throw new LinearWriteError(
      `Confirmation is required before moving ${issueId} to ${action.stateName}.`,
      "CONFIRMATION_REQUIRED"
    );
  }

  const context = await fetchIssueWriteContext(graphqlClient, issueId);
  const targetState = findTargetState(context.issue.team?.states?.nodes, action.stateName);
  const previousState = context.issue.state;
  const updatedIssue = await updateIssueState(graphqlClient, context.issue.id, targetState.id);
  const workpad = await upsertStructuredWorkpad(graphqlClient, {
    issueId: context.issue.id,
    comments: context.issue.comments?.nodes,
    patch: statusWorkpadPatch({
      action,
      previousStatus: previousState?.name ?? "Unknown",
      nextStatus: updatedIssue.state?.name ?? targetState.name,
      note,
      writtenAt: clock().toISOString()
    })
  });

  return {
    issueId: context.issue.identifier,
    action,
    previousStatus: previousState
      ? { id: previousState.id, name: previousState.name, type: previousState.type }
      : undefined,
    status: updatedIssue.state
      ? { id: updatedIssue.state.id, name: updatedIssue.state.name, type: updatedIssue.state.type }
      : { id: targetState.id, name: targetState.name, type: targetState.type },
    issue: normalizeIssue(updatedIssue),
    workpad,
    message: `Linear status set to ${updatedIssue.state?.name ?? targetState.name}.`
  };
}

export function mergeCodexWorkpadCommentBody(body, patch) {
  const source = typeof body === "string" ? body : "";
  const markerIndex = source.indexOf(CODEX_WORKPAD_MARKER);
  const prefix = markerIndex >= 0 ? source.slice(0, markerIndex) : preserveNonWorkpadBody(source);
  const workpadSource = markerIndex >= 0 ? source.slice(markerIndex) : defaultWorkpadBody();
  const workpad = parseWorkpad(workpadSource);

  for (const update of patch?.sections ?? []) {
    applySectionUpdate(workpad, update);
  }

  return `${prefix}${serializeWorkpad(workpad)}`.trimEnd();
}

function statusWorkpadPatch({ action, previousStatus, nextStatus, note, writtenAt }) {
  const statusLine = `- ${writtenAt}: Workflow Hub moved Linear status from \`${previousStatus}\` to \`${nextStatus}\` via \`${action.label}\`.`;
  const noteLine = typeof note === "string" && note.trim().length > 0
    ? `- ${writtenAt}: ${note.trim()}`
    : undefined;

  return {
    sections: [
      {
        title: "Notes",
        mode: "append-lines",
        lines: [statusLine, noteLine].filter(Boolean)
      },
      {
        title: "Handoff",
        mode: "set-list-items",
        items: {
          "Review state": nextStatus
        }
      }
    ]
  };
}

async function fetchIssueWriteContext(graphqlClient, issueId) {
  const data = await graphqlClient(LINEAR_ISSUE_WRITE_CONTEXT_QUERY, { issueId });
  if (!data?.issue) {
    throw new LinearWriteError(`Linear issue ${issueId} was not found.`, "NOT_FOUND");
  }

  return data;
}

function findTargetState(states = [], stateName) {
  const target = states.find((state) => equalsStateName(state?.name, stateName));
  if (!target?.id) {
    throw new LinearWriteError(`Linear state '${stateName}' was not found on this issue's team.`, "NOT_FOUND");
  }

  return target;
}

async function updateIssueState(graphqlClient, issueId, stateId) {
  const data = await graphqlClient(LINEAR_UPDATE_ISSUE_STATE_MUTATION, { issueId, stateId });
  if (!data?.issueUpdate?.success || !data.issueUpdate.issue) {
    throw new LinearWriteError("Linear did not confirm the issue status update.");
  }

  return data.issueUpdate.issue;
}

async function upsertStructuredWorkpad(graphqlClient, { issueId, comments, patch }) {
  const existing = latestWorkpadComment(comments);

  if (existing) {
    const body = mergeCodexWorkpadCommentBody(existing.body, patch);
    const data = await graphqlClient(LINEAR_COMMENT_UPDATE_MUTATION, {
      commentId: existing.id,
      body
    });

    if (!data?.commentUpdate?.success || !data.commentUpdate.comment) {
      throw new LinearWriteError("Linear did not confirm the workpad update.");
    }

    return normalizeWorkpadComment(data.commentUpdate.comment, "updated");
  }

  const body = mergeCodexWorkpadCommentBody("", patch);
  const data = await graphqlClient(LINEAR_COMMENT_CREATE_MUTATION, { issueId, body });

  if (!data?.commentCreate?.success || !data.commentCreate.comment) {
    throw new LinearWriteError("Linear did not confirm the workpad create.");
  }

  return normalizeWorkpadComment(data.commentCreate.comment, "created");
}

function latestWorkpadComment(comments = []) {
  return comments
    .filter((comment) => typeof comment?.body === "string" && comment.body.includes(CODEX_WORKPAD_MARKER))
    .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? 0) - Date.parse(a.updatedAt ?? a.createdAt ?? 0))[0];
}

function preserveNonWorkpadBody(source) {
  const trimmed = source.trimEnd();
  return trimmed ? `${trimmed}\n\n` : "";
}

function defaultWorkpadBody() {
  return [
    CODEX_WORKPAD_MARKER,
    "",
    "### Environment",
    "- Pending",
    "",
    "### Plan",
    "- [ ] Review Workflow Hub status action.",
    "",
    "### Acceptance Criteria",
    "- [ ] Status/action write was explicit.",
    "",
    "### Validation",
    "- [ ] Pending",
    "",
    "### Notes",
    "- Created by Workflow Hub.",
    "",
    "### Blockers",
    "- None",
    "",
    "### Handoff",
    "- Branch:",
    "- PR:",
    "- Files touched:",
    "- Checks:",
    "- Review/test notes:",
    "- Review state:",
    "- Next recommended issue:"
  ].join("\n");
}

function parseWorkpad(source) {
  const lines = source.split(/\r?\n/);
  const sections = [];
  let currentSection;

  for (const line of lines.slice(1)) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      currentSection = {
        title: heading[1],
        lines: []
      };
      sections.push(currentSection);
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  return { sections };
}

function applySectionUpdate(workpad, update) {
  const section = ensureSection(workpad, update.title);

  if (update.mode === "append-lines") {
    appendLines(section, update.lines ?? []);
    return;
  }

  if (update.mode === "set-list-items") {
    setListItems(section, update.items ?? {});
    return;
  }

  throw new LinearWriteError(`Unsupported workpad section update mode: ${update.mode}`, "VALIDATION_ERROR");
}

function ensureSection(workpad, title) {
  const existing = workpad.sections.find((section) => equalsStateName(section.title, title));
  if (existing) return existing;

  const section = { title, lines: [] };
  workpad.sections.push(section);
  return section;
}

function appendLines(section, lines) {
  const nextLines = lines.filter((line) => typeof line === "string" && line.trim().length > 0);
  if (nextLines.length === 0) return;

  trimTrailingBlankLines(section.lines);
  if (section.lines.length > 0 && section.lines.at(-1) !== "") {
    section.lines.push("");
  }

  const existing = new Set(section.lines.map((line) => line.trim()));
  for (const line of nextLines) {
    if (!existing.has(line.trim())) {
      section.lines.push(line);
      existing.add(line.trim());
    }
  }
}

function setListItems(section, items) {
  trimTrailingBlankLines(section.lines);

  for (const [key, value] of Object.entries(items)) {
    const nextLine = `- ${key}: ${value}`;
    const pattern = new RegExp(`^-\\s*${escapeRegExp(key)}:\\s*`);
    const index = section.lines.findIndex((line) => pattern.test(line));

    if (index >= 0) {
      section.lines[index] = nextLine;
    } else {
      section.lines.push(nextLine);
    }
  }
}

function serializeWorkpad(workpad) {
  const lines = [CODEX_WORKPAD_MARKER];

  for (const section of workpad.sections) {
    trimTrailingBlankLines(section.lines);
    lines.push("", `### ${section.title}`, ...section.lines);
  }

  return lines.join("\n");
}

function trimTrailingBlankLines(lines) {
  while (lines.length > 0 && lines.at(-1).trim().length === 0) {
    lines.pop();
  }
}

function normalizeIssue(issue) {
  return {
    linearId: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    priority: issue.priority,
    priorityLabel: issue.priorityLabel,
    updatedAt: issue.updatedAt,
    status: issue.state
      ? { id: issue.state.id, name: issue.state.name, type: issue.state.type }
      : undefined
  };
}

function normalizeWorkpadComment(comment, operation) {
  const markerIndex = comment.body?.indexOf(CODEX_WORKPAD_MARKER) ?? -1;

  return {
    operation,
    commentId: comment.id,
    body: markerIndex >= 0 ? comment.body.slice(markerIndex).trim() : comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    user: comment.user ? normalizeUser(comment.user) : undefined
  };
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

function equalsStateName(left, right) {
  return normalizeComparableName(left) === normalizeComparableName(right);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeComparableName(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}
