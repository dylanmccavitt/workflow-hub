const MAX_WORKPAD_CHARS = 8000;
const MAX_COMMENT_CHARS = 2400;
const MAX_ANNOTATION_CHARS = 1200;

export class ReviewFixPromptError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewFixPromptError";
    this.code = "VALIDATION_ERROR";
    this.recoverable = false;
  }
}

export function buildReviewFixPromptDraft(state, options = {}) {
  if (!state || typeof state !== "object") {
    throw new ReviewFixPromptError("state is required to build a review fix prompt.");
  }

  const issueId = requireString(state.issue?.issueId, "issue.issueId");
  const linearIssue = state.issue?.linear;
  const workspace = state.workspace ?? {};
  const githubState = Array.isArray(state.pullRequests)
    ? state.pullRequests.find((candidate) => candidate?.provider === "GitHub")
    : undefined;
  const pullRequest = githubState?.pullRequest;
  const availableReviewComments = reviewCommentSelections(pullRequest?.reviewComments ?? []);
  const availableCheckFailures = checkFailureSelections(pullRequest?.checks?.checks ?? []);
  const selectedReviewComments = selectedItems(
    availableReviewComments,
    options.selectedReviewCommentIds
  );
  const selectedCheckFailures = selectedItems(
    availableCheckFailures,
    options.selectedCheckIds
  );
  const ownedPaths = ownedPathsFromSelections({
    selectedReviewComments,
    selectedCheckFailures,
    workspace,
    extraOwnedPaths: options.ownedPaths
  });
  const generatedAt = stringOrUndefined(options.generatedAt) ?? new Date().toISOString();
  const prompt = renderPrompt({
    issueId,
    linearIssue,
    workspace,
    githubState,
    pullRequest,
    selectedReviewComments,
    selectedCheckFailures,
    ownedPaths,
    generatedAt
  });

  return {
    issueId,
    title: linearIssue?.title ?? issueId,
    prompt,
    selectedReviewCommentIds: selectedReviewComments.map((comment) => comment.id),
    selectedCheckIds: selectedCheckFailures.map((check) => check.id),
    availableReviewComments: availableReviewComments.map(summaryForReviewComment),
    availableCheckFailures: availableCheckFailures.map(summaryForCheckFailure),
    ownedPaths,
    branch: stringOrUndefined(workspace.branch),
    worktree: stringOrUndefined(workspace.path),
    headSha: stringOrUndefined(workspace.headSha),
    pullRequest: pullRequest
      ? {
          provider: "GitHub",
          number: pullRequest.number,
          title: pullRequest.title,
          url: pullRequest.url,
          state: pullRequest.state,
          reviewDecision: pullRequest.reviewDecision,
          checksStatus: pullRequest.checks?.status
        }
      : undefined,
    generatedAt
  };
}

export function reviewCommentSelectionId(comment, index) {
  return stringOrUndefined(comment?.id)
    ?? stringOrUndefined(comment?.url)
    ?? [
      "review-comment",
      comment?.kind ?? "comment",
      comment?.path ?? "general",
      comment?.line ?? index
    ].join(":");
}

export function checkFailureSelectionId(check, index) {
  return stringOrUndefined(check?.id)
    ?? (Number.isInteger(check?.databaseId) ? String(check.databaseId) : undefined)
    ?? `check:${check?.name ?? "unnamed"}:${index}`;
}

function reviewCommentSelections(comments) {
  return comments.map((comment, index) => ({
    id: reviewCommentSelectionId(comment, index),
    kind: comment.kind ?? "comment",
    author: comment.author,
    body: comment.body ?? "",
    state: comment.state,
    path: comment.path,
    line: comment.line,
    url: comment.url,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  })).filter((comment) => comment.body.trim().length > 0);
}

function checkFailureSelections(checks) {
  return checks
    .filter((check) => check?.state === "failing" || (check?.annotations ?? []).length > 0)
    .map((check, index) => ({
      id: checkFailureSelectionId(check, index),
      name: check.name ?? "Unnamed check",
      state: check.state ?? "unknown",
      status: check.status,
      conclusion: check.conclusion,
      detailsUrl: check.detailsUrl,
      annotations: Array.isArray(check.annotations) ? check.annotations : []
    }));
}

function selectedItems(items, selectedIds) {
  if (!Array.isArray(selectedIds)) return items;
  const selected = new Set(selectedIds.filter((id) => typeof id === "string" && id.length > 0));
  return items.filter((item) => selected.has(item.id));
}

function ownedPathsFromSelections({
  selectedReviewComments,
  selectedCheckFailures,
  workspace,
  extraOwnedPaths
}) {
  const paths = new Set();

  for (const comment of selectedReviewComments) {
    addPath(paths, comment.path);
  }

  for (const check of selectedCheckFailures) {
    for (const annotation of check.annotations) {
      addPath(paths, annotation.path);
    }
  }

  for (const path of parseGitStatusPaths(workspace?.gitStatus ?? [])) {
    addPath(paths, path);
  }

  if (Array.isArray(extraOwnedPaths)) {
    for (const path of extraOwnedPaths) {
      addPath(paths, path);
    }
  }

  return [...paths].sort();
}

function renderPrompt({
  issueId,
  linearIssue,
  workspace,
  githubState,
  pullRequest,
  selectedReviewComments,
  selectedCheckFailures,
  ownedPaths,
  generatedAt
}) {
  const lines = [
    `# Fix Prompt: ${issueId}`,
    "",
    "You are fixing a Workflow Hub PR review issue from the selected review context below.",
    "",
    "## Issue Context",
    `- Issue: ${issueId}`,
    `- Title: ${linearIssue?.title ?? "Unknown"}`,
    `- Status: ${linearIssue?.status ?? "Unknown"}`,
    `- Priority: ${linearIssue?.priorityLabel ?? linearIssue?.priority ?? "Unknown"}`,
    `- URL: ${linearIssue?.url ?? "Unknown"}`,
    `- Labels: ${listText(linearIssue?.labels?.map((label) => label.name))}`,
    `- Blockers: ${listText(linearIssue?.blockers?.map((issue) => `${issue.identifier} ${issue.status ?? ""}`.trim()))}`,
    "",
    "## Workspace",
    `- Worktree: ${workspace?.path ?? "Unknown"}`,
    `- Branch: ${workspace?.branch ?? "Unknown"}`,
    `- Head: ${workspace?.headSha ?? "Unknown"}`,
    `- Dirty: ${workspace?.dirty ? "yes" : "no"}`,
    "",
    "## Pull Request",
    `- Provider status: ${githubState?.status ?? "Unknown"}`,
    `- Detail: ${githubState?.detail ?? "No PR provider detail"}`,
    `- PR: ${pullRequest ? `#${pullRequest.number} ${pullRequest.title}` : "None resolved"}`,
    `- PR URL: ${pullRequest?.url ?? "None"}`,
    `- Review decision: ${pullRequest?.reviewDecision ?? "Unknown"}`,
    `- Check status: ${pullRequest?.checks?.status ?? "Unknown"}`,
    "",
    "## Owned Paths",
    ...bulletLines(ownedPaths, "- None selected or detected from the current review context."),
    "",
    "## Selected Review Comments",
    ...reviewCommentLines(selectedReviewComments),
    "",
    "## Selected Check Failures",
    ...checkFailureLines(selectedCheckFailures),
    "",
    "## Codex Workpad",
    fencedMarkdown(linearIssue?.codexWorkpad?.body ?? "No Codex Workpad found."),
    "",
    "## Instructions",
    "- Address the selected review comments and failing checks above.",
    "- Keep changes scoped to the owned paths unless the fix requires a clearly related support file.",
    "- Preserve unrelated local changes and machine-specific config.",
    "- Run the focused checks for the touched surface and record evidence in the Workpad/PR.",
    "- Do not dispatch, merge, or change Linear status unless the user explicitly asks.",
    "",
    `Generated at: ${generatedAt}`
  ];

  return lines.join("\n").trimEnd();
}

function reviewCommentLines(comments) {
  if (comments.length === 0) {
    return ["- None selected."];
  }

  return comments.flatMap((comment, index) => [
    `${index + 1}. ${reviewCommentHeading(comment)}`,
    indentBlock(truncate(comment.body, MAX_COMMENT_CHARS)),
    ""
  ]).slice(0, -1);
}

function checkFailureLines(checks) {
  if (checks.length === 0) {
    return ["- None selected."];
  }

  return checks.flatMap((check, index) => {
    const lines = [
      `${index + 1}. ${check.name}`,
      `   - State: ${check.state}`,
      `   - Status: ${check.status || "Unknown"}`,
      `   - Conclusion: ${check.conclusion || "Unknown"}`,
      `   - Details: ${check.detailsUrl || "None"}`
    ];

    if (check.annotations.length === 0) {
      lines.push("   - Annotations: none returned by GitHub.");
      return [...lines, ""];
    }

    lines.push("   - Annotations:");
    for (const annotation of check.annotations) {
      const location = annotation.path
        ? `${annotation.path}${annotation.startLine ? `:${annotation.startLine}` : ""}`
        : "annotation";
      const message = truncate(annotation.message ?? annotation.title ?? "Check annotation", MAX_ANNOTATION_CHARS);
      lines.push(`     - ${location}: ${message}`);
    }
    return [...lines, ""];
  }).slice(0, -1);
}

function reviewCommentHeading(comment) {
  const author = comment.author ? `@${comment.author}` : "Unknown author";
  const location = comment.path
    ? `${comment.path}${comment.line ? `:${comment.line}` : ""}`
    : comment.kind;
  const state = comment.state ? ` (${comment.state})` : "";
  const link = comment.url ? ` - ${comment.url}` : "";
  return `${author} on ${location}${state}${link}`;
}

function summaryForReviewComment(comment) {
  return {
    id: comment.id,
    label: reviewCommentHeading(comment),
    bodyPreview: truncate(comment.body.replace(/\s+/g, " ").trim(), 180),
    path: comment.path,
    line: comment.line,
    url: comment.url
  };
}

function summaryForCheckFailure(check) {
  return {
    id: check.id,
    label: check.name,
    detail: `${check.state}; ${check.annotations.length} annotation(s)`,
    annotationCount: check.annotations.length,
    detailsUrl: check.detailsUrl,
    paths: [...new Set(check.annotations.map((annotation) => annotation.path).filter(Boolean))]
  };
}

function parseGitStatusPaths(lines) {
  return lines
    .filter((line) => typeof line === "string" && !line.startsWith("##"))
    .map((line) => line.slice(3).trim())
    .map((line) => line.includes(" -> ") ? line.split(" -> ").pop() : line)
    .filter(Boolean);
}

function bulletLines(values, emptyLine) {
  if (!Array.isArray(values) || values.length === 0) {
    return [emptyLine];
  }

  return values.map((value) => `- ${value}`);
}

function fencedMarkdown(value) {
  const content = truncate(value, MAX_WORKPAD_CHARS).replace(/```/g, "` ` `");
  return ["```md", content, "```"].join("\n");
}

function indentBlock(value) {
  return value
    .split("\n")
    .map((line) => `   ${line}`)
    .join("\n");
}

function truncate(value, maxLength) {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 32).trimEnd()}\n[truncated ${value.length - maxLength + 32} chars]`;
}

function listText(values) {
  return Array.isArray(values) && values.length > 0 ? values.join(", ") : "None";
}

function addPath(paths, value) {
  const path = stringOrUndefined(value);
  if (path) paths.add(path);
}

function requireString(value, fieldName) {
  const normalized = stringOrUndefined(value);
  if (!normalized) {
    throw new ReviewFixPromptError(`${fieldName} must be a non-empty string.`);
  }

  return normalized;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
