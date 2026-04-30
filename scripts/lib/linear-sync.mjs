export const LINEAR_GRAPHQL_ENDPOINT = "https://api.linear.app/graphql";
export const CODEX_WORKPAD_MARKER = "## Codex Workpad";
export const DEFAULT_LINEAR_CACHE_STALE_AFTER_MS = 5 * 60 * 1000;

const LINEAR_PROJECT_ISSUES_QUERY = `
  query WorkflowHubProjectIssues($projectId: String!, $first: Int!, $after: String) {
    project(id: $projectId) {
      id
      name
      url
      state
      issues(first: $first, after: $after) {
        nodes {
          id
          identifier
          title
          url
          priority
          priorityLabel
          updatedAt
          state { id name type }
          labels(first: 50) { nodes { id name } }
          parent { id identifier title url }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
`;

const LINEAR_ISSUE_DETAILS_QUERY = `
  query WorkflowHubIssueDetails($issueId: String!) {
    issue(id: $issueId) {
      id
      identifier
      title
      url
      priority
      priorityLabel
      updatedAt
      state { id name type }
      labels(first: 50) { nodes { id name } }
      parent { id identifier title url }
      relations(first: 50) {
        nodes {
          id
          type
          relatedIssue { id identifier title url state { name type } }
        }
      }
      inverseRelations(first: 50) {
        nodes {
          id
          type
          issue { id identifier title url state { name type } }
        }
      }
      attachments(first: 50) {
        nodes { id title subtitle url source metadata createdAt updatedAt }
      }
      comments(first: 100) {
        nodes { id body createdAt updatedAt user { id name email } }
      }
    }
  }
`;

export class LinearSyncError extends Error {
  constructor(message, code = "LINEAR_SYNC_ERROR") {
    super(message);
    this.name = "LinearSyncError";
    this.code = code;
  }
}

export function createLinearGraphqlClient(options = {}) {
  const apiKey = options.apiKey ?? process.env.LINEAR_API_KEY;
  const endpoint = options.endpoint ?? LINEAR_GRAPHQL_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  const client = async (query, variables = {}) => {
    if (!apiKey) {
      throw new LinearSyncError("LINEAR_API_KEY is not set.", "NOT_CONFIGURED");
    }

    if (typeof fetchImpl !== "function") {
      throw new LinearSyncError("fetch is not available in this runtime.");
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey
      },
      body: JSON.stringify({ query, variables })
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new LinearSyncError(`Linear returned invalid JSON: ${errorMessage(error)}`);
    }

    if (!response.ok) {
      throw new LinearSyncError(`Linear request failed with ${response.status}: ${summarizeGraphqlErrors(payload)}`);
    }

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new LinearSyncError(`Linear GraphQL error: ${summarizeGraphqlErrors(payload)}`);
    }

    return payload.data;
  };

  Object.defineProperty(client, "configured", { value: Boolean(apiKey) });
  return client;
}

export async function syncLinearProjectIssues(options) {
  const {
    project,
    repository,
    graphqlClient = createLinearGraphqlClient(),
    clock = () => new Date(),
    staleAfterMs = DEFAULT_LINEAR_CACHE_STALE_AFTER_MS,
    force = false
  } = options ?? {};

  if (!project) {
    throw new LinearSyncError("project is required.");
  }

  if (!repository) {
    throw new LinearSyncError("repository is required.");
  }

  const configuredProjectId = project.linear?.projectId;

  if (!configuredProjectId) {
    const detail = `${project.id} is missing linear.projectId; project issue sync is not configured.`;
    upsertProjectCache(repository, project, {
      status: "not-configured",
      detail,
      checkedAt: clock().toISOString(),
      staleAfterMs
    });

    return {
      status: "not-configured",
      detail,
      staleAfterMs
    };
  }

  if (graphqlClient.configured === false) {
    const detail = "LINEAR_API_KEY is not set; showing cache only.";
    upsertProjectCache(repository, project, {
      status: "not-configured",
      detail,
      checkedAt: clock().toISOString(),
      staleAfterMs
    });

    return {
      status: "not-configured",
      detail,
      staleAfterMs
    };
  }

  const existingProject = repository.getProject(project.id);
  const freshCache = force ? undefined : freshProjectCache(existingProject, clock(), staleAfterMs);
  if (freshCache) {
    return {
      status: "fresh",
      detail: `Using fresh Linear cache for ${project.displayName}.`,
      fetchedAt: freshCache.fetchedAt,
      issueCount: freshCache.issueCount,
      projectName: freshCache.projectName ?? project.displayName,
      staleAfterMs,
      cacheOnly: true
    };
  }

  try {
    const fetchedAt = clock().toISOString();
    const linearProject = await fetchLinearProjectIssues(graphqlClient, configuredProjectId);

    upsertProjectCache(repository, project, {
      status: "fresh",
      fetchedAt,
      staleAfterMs,
      issueCount: linearProject.issues.length,
      linearProject: {
        id: linearProject.id,
        name: linearProject.name,
        url: linearProject.url,
        state: linearProject.state
      },
      linearProjectId: linearProject.id
    });

    const cachedIssues = linearProject.issues.map((issue) => {
      const cachedIssue = repository.upsertIssue(issueCachePayload(project.id, issue, fetchedAt, staleAfterMs));

      for (const pullRequest of cachedIssue.metadata.pullRequests ?? []) {
        repository.upsertPullRequest({
          id: `linear-attachment-${pullRequest.id}`,
          issueId: cachedIssue.id,
          provider: pullRequest.provider,
          number: pullRequest.number,
          url: pullRequest.url,
          branch: pullRequest.branch,
          status: pullRequest.status,
          metadata: pullRequest
        });
      }

      return cachedIssue;
    });

    return {
      status: "fresh",
      detail: `Synced ${cachedIssues.length} Linear issue(s) from ${linearProject.name}.`,
      fetchedAt,
      issueCount: cachedIssues.length,
      projectName: linearProject.name,
      staleAfterMs
    };
  } catch (error) {
    const errorDetail = errorMessage(error);
    upsertProjectCache(repository, project, {
      status: "error",
      error: errorDetail,
      errorAt: clock().toISOString(),
      staleAfterMs
    });

    return {
      status: "error",
      detail: `Linear sync failed: ${errorDetail}`,
      error: errorDetail,
      staleAfterMs
    };
  }
}

export function getCachedLinearIssue(repository, projectId, identifier) {
  return repository.getIssueByIdentifier(projectId, identifier);
}

export function linearIssueFromCachedRecord(record, options = {}) {
  const metadata = record.metadata ?? {};
  const sync = metadata.linearSync ?? {};
  const now = options.now ?? new Date();
  const staleAfterMs = options.staleAfterMs ?? sync.staleAfterMs ?? DEFAULT_LINEAR_CACHE_STALE_AFTER_MS;
  const fetchedAt = sync.fetchedAt;
  const ageMs = ageSince(fetchedAt, now);
  const stale = options.forceStale || ageMs === undefined || ageMs > staleAfterMs;
  const cacheStatus = options.syncError ? "error" : stale ? "stale" : "fresh";

  return {
    linearId: metadata.linearId ?? record.id,
    identifier: record.identifier,
    title: record.title,
    status: record.status,
    statusType: metadata.statusType,
    url: record.linearUrl,
    priority: record.priority,
    priorityLabel: metadata.priorityLabel,
    labels: metadata.labels ?? [],
    parent: metadata.parent,
    blockers: metadata.blockers ?? [],
    blockedIssues: metadata.blockedIssues ?? [],
    links: metadata.links ?? [],
    pullRequests: metadata.pullRequests ?? [],
    codexWorkpad: metadata.codexWorkpad,
    updatedAt: metadata.updatedAt,
    cache: {
      status: cacheStatus,
      stale,
      fetchedAt,
      ageMs,
      staleAfterMs,
      error: options.syncError ?? sync.error
    }
  };
}

export function extractCodexWorkpad(comments = []) {
  const candidates = comments
    .filter((comment) => typeof comment.body === "string" && comment.body.includes(CODEX_WORKPAD_MARKER))
    .sort((a, b) => Date.parse(b.updatedAt ?? b.createdAt ?? 0) - Date.parse(a.updatedAt ?? a.createdAt ?? 0));

  const comment = candidates[0];
  if (!comment) return undefined;

  const markerIndex = comment.body.indexOf(CODEX_WORKPAD_MARKER);

  return {
    commentId: comment.id,
    body: comment.body.slice(markerIndex).trim(),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    user: comment.user ? normalizeUser(comment.user) : undefined
  };
}

async function fetchLinearProjectIssues(graphqlClient, projectId) {
  const issueSummaries = [];
  let cursor;
  let project;

  for (let page = 0; page < 20; page += 1) {
    const data = await graphqlClient(LINEAR_PROJECT_ISSUES_QUERY, {
      projectId,
      first: 50,
      after: cursor
    });

    if (!data?.project) {
      throw new LinearSyncError(`Linear project ${projectId} was not found.`, "NOT_FOUND");
    }

    project = data.project;
    issueSummaries.push(...connectionNodes(project.issues));

    if (!project.issues.pageInfo?.hasNextPage) {
      const issues = [];
      for (const issue of issueSummaries) {
        issues.push(await fetchLinearIssueDetails(graphqlClient, issue));
      }

      return {
        id: project.id,
        name: project.name,
        url: project.url,
        state: project.state,
        issues
      };
    }

    cursor = project.issues.pageInfo.endCursor;
  }

  throw new LinearSyncError("Linear project issue pagination exceeded 20 pages.");
}

async function fetchLinearIssueDetails(graphqlClient, issueSummary) {
  const data = await graphqlClient(LINEAR_ISSUE_DETAILS_QUERY, {
    issueId: issueSummary.id
  });

  if (!data?.issue) {
    throw new LinearSyncError(`Linear issue ${issueSummary.identifier} was not found.`, "NOT_FOUND");
  }

  return {
    ...issueSummary,
    ...data.issue
  };
}

function issueCachePayload(projectId, issue, fetchedAt, staleAfterMs) {
  const attachments = connectionNodes(issue.attachments).map(normalizeAttachment);
  const pullRequests = attachments.filter(isPullRequestAttachment).map(normalizePullRequestAttachment);

  return {
    id: issue.id,
    projectId,
    identifier: issue.identifier,
    title: issue.title,
    status: issue.state?.name ?? "Unknown",
    linearUrl: issue.url,
    priority: issue.priority,
    metadata: {
      source: "linear",
      linearId: issue.id,
      updatedAt: issue.updatedAt,
      statusType: issue.state?.type,
      stateId: issue.state?.id,
      priorityLabel: issue.priorityLabel,
      labels: connectionNodes(issue.labels).map(normalizeLabel),
      parent: issue.parent ? normalizeRelatedIssue(issue.parent) : undefined,
      blockers: connectionNodes(issue.inverseRelations)
        .filter((relation) => relation.type === "blocks")
        .map((relation) => normalizeRelatedIssue(relation.issue)),
      blockedIssues: connectionNodes(issue.relations)
        .filter((relation) => relation.type === "blocks")
        .map((relation) => normalizeRelatedIssue(relation.relatedIssue)),
      relatedIssues: connectionNodes(issue.relations)
        .filter((relation) => relation.type !== "blocks")
        .map((relation) => ({
          type: relation.type,
          issue: normalizeRelatedIssue(relation.relatedIssue)
        })),
      links: attachments,
      pullRequests,
      codexWorkpad: extractCodexWorkpad(connectionNodes(issue.comments)),
      linearSync: {
        status: "fresh",
        fetchedAt,
        staleAfterMs
      }
    }
  };
}

function upsertProjectCache(repository, project, syncMetadata) {
  const existing = repository.getProject(project.id);
  const existingMetadata = existing?.metadata ?? {};
  const linearSync = {
    ...(existingMetadata.linearSync ?? {}),
    ...syncMetadata
  };

  repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: syncMetadata.linearProjectId ?? project.linear?.projectId,
    metadata: {
      ...existingMetadata,
      linear: {
        teamKey: project.linear?.teamKey,
        projectId: project.linear?.projectId,
        projectSlug: project.linear?.projectSlug
      },
      linearSync
    }
  });
}

function freshProjectCache(projectRecord, now, staleAfterMs) {
  const sync = projectRecord?.metadata?.linearSync;
  if (sync?.status !== "fresh") return undefined;

  const ageMs = ageSince(sync.fetchedAt, now);
  if (ageMs === undefined || ageMs > staleAfterMs) return undefined;

  return {
    fetchedAt: sync.fetchedAt,
    issueCount: sync.issueCount,
    projectName: sync.linearProject?.name
  };
}

function connectionNodes(connection) {
  return Array.isArray(connection?.nodes) ? connection.nodes.filter(Boolean) : [];
}

function normalizeLabel(label) {
  return {
    id: label.id,
    name: label.name
  };
}

function normalizeRelatedIssue(issue) {
  if (!issue) return undefined;

  return {
    id: issue.id,
    identifier: issue.identifier,
    title: issue.title,
    url: issue.url,
    status: issue.state?.name,
    statusType: issue.state?.type
  };
}

function normalizeAttachment(attachment) {
  return {
    id: attachment.id,
    title: attachment.title,
    subtitle: attachment.subtitle,
    url: attachment.url,
    source: attachment.source,
    metadata: attachment.metadata ?? {},
    createdAt: attachment.createdAt,
    updatedAt: attachment.updatedAt
  };
}

function normalizePullRequestAttachment(attachment) {
  return {
    ...attachment,
    provider: providerFromAttachment(attachment),
    number: pullRequestNumberFromUrl(attachment.url),
    branch: attachment.metadata?.branch ?? attachment.metadata?.headRefName,
    status: attachment.metadata?.status ?? attachment.metadata?.state ?? "linked"
  };
}

function normalizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

function isPullRequestAttachment(attachment) {
  const source = attachment.source ?? "";
  const title = attachment.title ?? "";
  const url = attachment.url ?? "";

  return /github/i.test(source)
    || /pull request/i.test(title)
    || /\/pull\/\d+/i.test(url);
}

function providerFromAttachment(attachment) {
  const source = attachment.source ?? "";
  const url = attachment.url ?? "";

  if (/github/i.test(source) || /github\.com/i.test(url)) return "github";
  return source.trim().toLowerCase() || "linear";
}

function pullRequestNumberFromUrl(url) {
  const match = /\/pull\/(\d+)/i.exec(url ?? "");
  return match ? Number(match[1]) : undefined;
}

function ageSince(isoString, now) {
  if (!isoString) return undefined;
  const started = Date.parse(isoString);
  if (Number.isNaN(started)) return undefined;
  return Math.max(0, now.getTime() - started);
}

function summarizeGraphqlErrors(payload) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    return payload.errors.map((error) => error.message ?? String(error)).join("; ");
  }

  return JSON.stringify(payload);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
