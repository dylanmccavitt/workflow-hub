import { spawnSync } from "node:child_process";

const GITHUB_PR_VIEW_FIELDS = [
  "author",
  "baseRefName",
  "comments",
  "headRefName",
  "headRefOid",
  "isDraft",
  "latestReviews",
  "mergeStateStatus",
  "mergeable",
  "number",
  "reviewDecision",
  "state",
  "statusCheckRollup",
  "title",
  "url"
];

const FAILURE_CONCLUSIONS = new Set([
  "ACTION_REQUIRED",
  "CANCELLED",
  "FAILURE",
  "STARTUP_FAILURE",
  "STALE",
  "TIMED_OUT"
]);

const SUCCESS_CONCLUSIONS = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const PENDING_STATUSES = new Set(["EXPECTED", "PENDING", "QUEUED", "REQUESTED", "WAITING", "IN_PROGRESS"]);
const DEFAULT_REVIEW_COMMENT_LIMIT = 6;
const DEFAULT_ANNOTATION_LIMIT = 8;

export function readGitHubPullRequestState(options = {}) {
  const {
    issue,
    workspace,
    ghRunner = runGh,
    reviewCommentLimit = DEFAULT_REVIEW_COMMENT_LIMIT,
    annotationLimit = DEFAULT_ANNOTATION_LIMIT
  } = options;
  const candidates = resolvePullRequestCandidates({ issue, workspace });
  const defaultRepository = parseGitHubRepository(workspace?.remote);
  const repository = candidates.find((candidate) => candidate.repository)?.repository ?? defaultRepository;

  if (!repository) {
    return pullRequestState({
      status: "not-configured",
      detail: "GitHub PR sync needs a GitHub remote or Linear PR URL to identify the repository.",
      candidates
    });
  }

  if (candidates.length === 0) {
    return pullRequestState({
      status: "not-found",
      detail: "No Linear PR links, Linear branch name, or workspace branch were available to resolve a GitHub PR.",
      candidates
    });
  }

  const errors = [];

  for (const candidate of candidates) {
    const candidateRepository = candidate.repository ?? repository;
    const resolved = resolvePullRequestForCandidate({
      candidate,
      repository: candidateRepository,
      ghRunner,
      cwd: workspace?.path
    });

    if (resolved.status === "available") {
      const pullRequest = buildPullRequestDetails({
        pullRequest: resolved.pullRequest,
        repository: candidateRepository,
        ghRunner,
        cwd: workspace?.path,
        reviewCommentLimit,
        annotationLimit,
        matchedBy: candidate.source
      });

      return pullRequestState({
        status: "available",
        detail: detailForPullRequest(pullRequest),
        candidates,
        pullRequest
      });
    }

    if (resolved.status === "unavailable" || resolved.status === "not-configured") {
      errors.push(resolved.detail);
      continue;
    }
  }

  if (errors.length > 0) {
    return pullRequestState({
      status: "unavailable",
      detail: `GitHub PR sync failed: ${errors[0]}`,
      candidates
    });
  }

  return pullRequestState({
    status: "not-found",
    detail: "No GitHub PR matched the Linear PR links or branch candidates.",
    candidates
  });
}

export function resolvePullRequestCandidates({ issue, workspace } = {}) {
  const candidates = [];
  const linearIssue = issue?.linear;

  for (const pullRequest of linearIssue?.pullRequests ?? []) {
    const parsedUrl = parseGitHubPullRequestUrl(pullRequest.url);
    if (parsedUrl) {
      candidates.push({
        source: "linear-pr-url",
        label: `Linear PR #${parsedUrl.number}`,
        number: parsedUrl.number,
        url: pullRequest.url,
        branch: pullRequest.branch,
        repository: {
          owner: parsedUrl.owner,
          repo: parsedUrl.repo
        }
      });
      continue;
    }

    if (pullRequest.number) {
      candidates.push({
        source: "linear-pr-number",
        label: `Linear PR #${pullRequest.number}`,
        number: pullRequest.number,
        url: pullRequest.url,
        branch: pullRequest.branch
      });
    }

    if (pullRequest.branch) {
      candidates.push({
        source: "linear-pr-branch",
        label: `Linear PR branch ${pullRequest.branch}`,
        branch: pullRequest.branch,
        url: pullRequest.url
      });
    }
  }

  if (workspace?.branch) {
    candidates.push({
      source: "git-branch",
      label: `Workspace branch ${workspace.branch}`,
      branch: workspace.branch
    });
  }

  if (linearIssue?.branchName && linearIssue.branchName !== workspace?.branch) {
    candidates.push({
      source: "linear-branch",
      label: `Linear branch ${linearIssue.branchName}`,
      branch: linearIssue.branchName
    });
  }

  return dedupeCandidates(candidates);
}

export function parseGitHubRepository(value) {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  const trimmed = value.trim();
  const patterns = [
    /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/,
    /^https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?(?:\/)?$/,
    /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(trimmed);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, "")
      };
    }
  }

  return undefined;
}

export function parseGitHubPullRequestUrl(value) {
  if (typeof value !== "string") return undefined;
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(value.trim());
  if (!match) return undefined;

  return {
    owner: match[1],
    repo: match[2],
    number: Number(match[3])
  };
}

export function normalizeChecks(statusCheckRollup = [], annotationsByCheckId = new Map()) {
  const checks = statusCheckRollup.map((check) => normalizeCheck(check, annotationsByCheckId));
  const total = checks.length;
  const failing = checks.filter((check) => check.state === "failing").length;
  const pending = checks.filter((check) => check.state === "pending").length;
  const passing = checks.filter((check) => check.state === "success").length;
  const skipped = checks.filter((check) => check.state === "skipped").length;
  let status = "none";

  if (total > 0) {
    if (failing > 0) status = "failing";
    else if (pending > 0) status = "pending";
    else status = "success";
  }

  return {
    status,
    total,
    passing,
    pending,
    failing,
    skipped,
    checks
  };
}

function resolvePullRequestForCandidate({ candidate, repository, ghRunner, cwd }) {
  if (candidate.number) {
    return viewPullRequest({
      value: String(candidate.number),
      repository,
      ghRunner,
      cwd
    });
  }

  if (candidate.url) {
    return viewPullRequest({
      value: candidate.url,
      repository,
      ghRunner,
      cwd
    });
  }

  if (candidate.branch) {
    return findPullRequestByBranch({
      branch: candidate.branch,
      repository,
      ghRunner,
      cwd
    });
  }

  return {
    status: "not-found",
    detail: "Candidate did not include a PR number, URL, or branch."
  };
}

function viewPullRequest({ value, repository, ghRunner, cwd }) {
  const args = [
    "pr",
    "view",
    value,
    "--repo",
    `${repository.owner}/${repository.repo}`,
    "--json",
    GITHUB_PR_VIEW_FIELDS.join(",")
  ];
  const result = runGhJson(args, ghRunner, cwd);

  if (result.ok) {
    return {
      status: "available",
      pullRequest: result.value
    };
  }

  if (isNotFoundError(result.error)) {
    return {
      status: "not-found",
      detail: result.error
    };
  }

  return ghUnavailableResult(result.error);
}

function findPullRequestByBranch({ branch, repository, ghRunner, cwd }) {
  for (const head of branchHeadCandidates(branch, repository.owner)) {
    const result = runGhJson([
      "pr",
      "list",
      "--repo",
      `${repository.owner}/${repository.repo}`,
      "--head",
      head,
      "--state",
      "all",
      "--limit",
      "1",
      "--json",
      "number"
    ], ghRunner, cwd);

    if (!result.ok) {
      if (isNotFoundError(result.error) || /no pull requests/i.test(result.error)) continue;
      return ghUnavailableResult(result.error);
    }

    const [match] = Array.isArray(result.value) ? result.value : [];
    if (!match?.number) continue;
    return viewPullRequest({
      value: String(match.number),
      repository,
      ghRunner,
      cwd
    });
  }

  return {
    status: "not-found",
    detail: `No pull request matched branch ${branch}.`
  };
}

function buildPullRequestDetails({
  pullRequest,
  repository,
  ghRunner,
  cwd,
  reviewCommentLimit,
  annotationLimit,
  matchedBy
}) {
  const annotationsByCheckId = fetchAnnotationsByCheckId({
    pullRequest,
    repository,
    ghRunner,
    cwd,
    annotationLimit
  });
  const checks = normalizeChecks(pullRequest.statusCheckRollup, annotationsByCheckId);
  const reviewComments = normalizeReviewComments([
    ...fetchInlineReviewComments({
      repository,
      number: pullRequest.number,
      ghRunner,
      cwd,
      limit: reviewCommentLimit
    }),
    ...latestReviewSummaries(pullRequest.latestReviews),
    ...issueComments(pullRequest.comments)
  ], reviewCommentLimit);

  return {
    provider: "GitHub",
    owner: repository.owner,
    repo: repository.repo,
    number: pullRequest.number,
    title: pullRequest.title,
    url: pullRequest.url,
    state: normalizeTextState(pullRequest.state),
    isDraft: Boolean(pullRequest.isDraft),
    mergeable: normalizeTextState(pullRequest.mergeable),
    mergeStateStatus: normalizeTextState(pullRequest.mergeStateStatus),
    reviewDecision: reviewDecision(pullRequest),
    baseRefName: pullRequest.baseRefName,
    headRefName: pullRequest.headRefName,
    headRefOid: pullRequest.headRefOid,
    author: normalizeAuthor(pullRequest.author),
    matchedBy,
    checks,
    reviewComments
  };
}

function fetchAnnotationsByCheckId({ pullRequest, repository, ghRunner, cwd, annotationLimit }) {
  const annotationsByCheckId = new Map();
  const failingChecks = (pullRequest.statusCheckRollup ?? [])
    .map((check) => ({ check, id: checkRunDatabaseId(check) }))
    .filter(({ check, id }) => id && checkState(check) === "failing");

  for (const { id } of failingChecks) {
    const result = runGhJson([
      "api",
      `repos/${repository.owner}/${repository.repo}/check-runs/${id}/annotations?per_page=${annotationLimit}`
    ], ghRunner, cwd);

    if (!result.ok || !Array.isArray(result.value)) continue;
    annotationsByCheckId.set(String(id), result.value.slice(0, annotationLimit).map(normalizeAnnotation));
  }

  return annotationsByCheckId;
}

function fetchInlineReviewComments({ repository, number, ghRunner, cwd, limit }) {
  if (!number) return [];

  const result = runGhJson([
    "api",
    `repos/${repository.owner}/${repository.repo}/pulls/${number}/comments?per_page=50`
  ], ghRunner, cwd);

  if (!result.ok || !Array.isArray(result.value)) return [];

  return result.value.map((comment) => ({
    id: String(comment.id),
    kind: "inline",
    author: comment.user?.login,
    body: comment.body,
    path: comment.path,
    line: comment.line ?? comment.original_line,
    url: comment.html_url,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at
  }));
}

function latestReviewSummaries(latestReviews = []) {
  return latestReviews
    .filter((review) => typeof review.body === "string" && review.body.trim().length > 0)
    .map((review) => ({
      id: review.id,
      kind: "review",
      author: review.author?.login,
      body: review.body,
      state: normalizeTextState(review.state),
      url: review.url,
      createdAt: review.submittedAt,
      updatedAt: review.submittedAt
    }));
}

function issueComments(comments = []) {
  return comments
    .filter((comment) => typeof comment.body === "string" && comment.body.trim().length > 0)
    .map((comment) => ({
      id: comment.id,
      kind: "comment",
      author: comment.author?.login,
      body: comment.body,
      url: comment.url,
      createdAt: comment.createdAt,
      updatedAt: comment.createdAt
    }));
}

function normalizeReviewComments(comments, limit) {
  return comments
    .filter((comment) => typeof comment.body === "string" && comment.body.trim().length > 0)
    .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? 0) - Date.parse(a.updatedAt ?? a.createdAt ?? 0))
    .slice(0, limit)
    .map((comment) => ({
      ...comment,
      body: comment.body.trim()
    }));
}

function normalizeCheck(check, annotationsByCheckId) {
  const id = checkRunDatabaseId(check);
  const annotations = id ? annotationsByCheckId.get(String(id)) ?? [] : [];

  return {
    id: check.id ? String(check.id) : id ? String(id) : undefined,
    databaseId: id,
    name: check.name ?? check.context ?? check.workflowName ?? "Unnamed check",
    state: checkState(check),
    status: normalizeTextState(check.status ?? check.state),
    conclusion: normalizeTextState(check.conclusion),
    detailsUrl: check.detailsUrl ?? check.targetUrl,
    startedAt: check.startedAt,
    completedAt: check.completedAt,
    annotations
  };
}

function normalizeAnnotation(annotation) {
  return {
    path: annotation.path,
    startLine: annotation.start_line,
    endLine: annotation.end_line,
    level: annotation.annotation_level,
    title: annotation.title,
    message: annotation.message,
    rawDetails: annotation.raw_details,
    url: annotation.blob_href
  };
}

function checkState(check) {
  const conclusion = normalizeTextState(check.conclusion);
  const status = normalizeTextState(check.status ?? check.state);

  if (FAILURE_CONCLUSIONS.has(conclusion)) return "failing";
  if (SUCCESS_CONCLUSIONS.has(conclusion)) return conclusion === "SKIPPED" ? "skipped" : "success";
  if (!conclusion && PENDING_STATUSES.has(status)) return "pending";
  if (status === "SUCCESS") return "success";
  return conclusion || status ? "pending" : "unknown";
}

function checkRunDatabaseId(check) {
  const id = check.databaseId ?? check.checkRun?.databaseId;
  const numeric = Number(id);
  return Number.isInteger(numeric) ? numeric : undefined;
}

function reviewDecision(pullRequest) {
  const explicit = normalizeTextState(pullRequest.reviewDecision);
  if (explicit) return explicit;

  const reviews = [...(pullRequest.latestReviews ?? [])]
    .filter((review) => review.state)
    .sort((a, b) => Date.parse(b.submittedAt ?? 0) - Date.parse(a.submittedAt ?? 0));
  const latest = normalizeTextState(reviews[0]?.state);

  if (latest === "APPROVED") return "APPROVED";
  if (latest === "CHANGES_REQUESTED") return "CHANGES_REQUESTED";
  if (latest === "COMMENTED") return "COMMENTED";
  return "UNKNOWN";
}

function detailForPullRequest(pullRequest) {
  const review = readableState(pullRequest.reviewDecision);
  const checks = readableState(pullRequest.checks.status);
  const state = pullRequest.isDraft ? "draft" : readableState(pullRequest.state);
  return `PR #${pullRequest.number} ${state}; checks ${checks}; review ${review}.`;
}

function pullRequestState({ status, detail, candidates = [], pullRequest }) {
  return {
    provider: "GitHub",
    status,
    detail,
    candidates,
    pullRequest,
    adapter: adapterState(
      "pr:github",
      "GitHub PR",
      status,
      detail,
      status !== "available"
    )
  };
}

function adapterState(id, label, status, detail, recoverable) {
  return {
    id,
    label,
    status,
    detail,
    recoverable,
    ownerIssue: recoverable ? "AGE-358" : undefined
  };
}

function ghUnavailableResult(error) {
  return {
    status: isGhMissingOrAuthError(error) ? "not-configured" : "unavailable",
    detail: error
  };
}

function runGhJson(args, ghRunner, cwd) {
  const result = ghRunner(args, cwd);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "gh command failed."
    };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(result.stdout || "null")
    };
  } catch (error) {
    return {
      ok: false,
      error: `gh returned invalid JSON: ${errorMessage(error)}`
    };
  }
}

function runGh(args, cwd) {
  const result = spawnSync("gh", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `gh exited with status ${result.status}`).trim()
    };
  }

  return {
    ok: true,
    stdout: result.stdout.trim()
  };
}

function branchHeadCandidates(branch, owner) {
  const candidates = [branch, `${owner}:${branch}`];
  const slashMatch = /^([^/]+)\/(.+)$/.exec(branch);

  if (slashMatch && slashMatch[1] !== "feat") {
    candidates.push(`${slashMatch[1]}:${slashMatch[2]}`);
    candidates.push(slashMatch[2]);
  }

  return [...new Set(candidates)];
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];

  for (const candidate of candidates) {
    const key = [
      candidate.source,
      candidate.repository?.owner,
      candidate.repository?.repo,
      candidate.number,
      candidate.url,
      candidate.branch
    ].filter(Boolean).join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}

function normalizeAuthor(author) {
  if (!author) return undefined;

  return {
    login: author.login,
    name: author.name,
    isBot: author.is_bot
  };
}

function normalizeTextState(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function readableState(value) {
  const normalized = String(value ?? "").toLowerCase().replace(/_/g, " ");
  return normalized || "unknown";
}

function isNotFoundError(error) {
  return /not found|no pull requests|could not resolve/i.test(error ?? "");
}

function isGhMissingOrAuthError(error) {
  return /not found|not authenticated|gh auth login|authentication|could not resolve host/i.test(error ?? "");
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
