import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const SYMPHONY_NORMALIZED_STATES = ["queue", "active", "complete", "blocked", "failed", "unknown"];

const DEFAULT_PORT = "4002";
const DEFAULT_TIMEOUT_MS = 1_500;
const DEFAULT_LOGS_ROOT = path.join(os.homedir(), ".codex", "symphony-logs", "workflow-hub");

const TERMINAL_LINEAR_STATES = new Set(["done", "closed", "canceled", "cancelled", "duplicate"]);
const QUEUE_LINEAR_STATES = new Set(["ready", "todo", "needs fixes", "rework", "merging"]);

export async function readSymphonyState({
  issueId,
  issue,
  workspace,
  env = process.env,
  fetchJson = fetchJsonWithTimeout,
  readLatestLog = readLatestSymphonyLog,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  clock = () => new Date()
} = {}) {
  const config = symphonyConfig(env);

  try {
    const payload = await fetchJson(config.stateEndpoint, { timeoutMs });
    return normalizeEndpointPayload(payload, {
      issueId,
      issue,
      workspace,
      endpoint: config.stateEndpoint,
      logsRoot: config.logsRoot,
      clock
    });
  } catch (error) {
    return unavailableSymphonyState({
      issueId,
      issue,
      workspace,
      endpoint: config.stateEndpoint,
      logsRoot: config.logsRoot,
      error: errorMessage(error),
      log: readLatestLog(config.logsRoot),
      clock
    });
  }
}

export function normalizeEndpointPayload(payload, context = {}) {
  const generatedAt = stringOrUndefined(payload?.generated_at);

  if (payload?.error) {
    const detail = payload.error.message || payload.error.code || "Symphony snapshot returned an error.";
    const selectedIssue = inferSelectedIssue(context, "unknown", `Snapshot error: ${detail}`);
    return {
      status: "unavailable",
      running: true,
      source: "endpoint",
      endpoint: context.endpoint,
      generatedAt,
      detail: `Symphony API is reachable, but state is unavailable: ${detail}`,
      counts: selectedIssue ? countIssues([selectedIssue]) : emptyCounts(),
      issues: selectedIssue ? [selectedIssue] : [],
      selectedIssue,
      adapter: unavailableAdapter(
        "runner:symphony",
        "Symphony runner",
        `Symphony API is reachable, but state is unavailable: ${detail}`
      )
    };
  }

  const endpointIssues = [
    ...endpointEntriesForState(payload, "active").map((entry) => issueFromEndpointEntry(entry, "active", context)),
    ...endpointEntriesForState(payload, "queue").map((entry) => issueFromEndpointEntry(entry, "queue", context)),
    ...endpointEntriesForState(payload, "blocked").map((entry) => issueFromEndpointEntry(entry, "blocked", context)),
    ...endpointEntriesForState(payload, "failed").map((entry) => issueFromEndpointEntry(entry, "failed", context)),
    ...endpointEntriesForState(payload, "complete").map((entry) => issueFromEndpointEntry(entry, "complete", context))
  ];
  const selectedIssue = findSelectedIssue(endpointIssues, context.issueId) ?? inferSelectedIssue(context);
  const issues = selectedIssue && !findSelectedIssue(endpointIssues, context.issueId)
    ? [...endpointIssues, selectedIssue]
    : endpointIssues;
  const counts = countIssues(issues);
  const selectedDetail = selectedIssue
    ? `${selectedIssue.identifier} ${selectedIssue.normalizedState}`
    : `${context.issueId ?? "selected issue"} unknown`;
  const detail = [
    `Symphony API available at ${context.endpoint}.`,
    `${counts.active} active, ${counts.queue} queued, ${counts.blocked} blocked, ${counts.failed} failed.`,
    selectedDetail
  ].join(" ");

  return {
    status: "available",
    running: true,
    source: "endpoint",
    endpoint: context.endpoint,
    generatedAt,
    detail,
    counts,
    issues,
    selectedIssue,
    adapter: availableAdapter("runner:symphony", "Symphony runner", detail)
  };
}

export function unavailableSymphonyState({
  issueId,
  issue,
  workspace,
  endpoint,
  logsRoot,
  error,
  log,
  clock = () => new Date()
} = {}) {
  const selectedIssue = inferSelectedIssue({ issueId, issue, workspace }, "unknown", "Symphony endpoint is unavailable.");
  const generatedAt = clock().toISOString();
  const logDetail = log?.latestLine
    ? ` Last log line from ${log.path}: ${log.latestLine}`
    : ` No readable Symphony log was found under ${logsRoot}.`;
  const detail = `Symphony API unavailable at ${endpoint}: ${error}.${logDetail}`;

  return {
    status: "unavailable",
    running: false,
    source: log?.path ? "logs" : "none",
    endpoint,
    generatedAt,
    detail,
    counts: selectedIssue ? countIssues([selectedIssue]) : emptyCounts(),
    issues: selectedIssue ? [selectedIssue] : [],
    selectedIssue,
    logs: {
      root: logsRoot,
      latestPath: log?.path,
      latestLine: log?.latestLine,
      latestAt: log?.latestAt
    },
    adapter: unavailableAdapter("runner:symphony", "Symphony runner", detail)
  };
}

export function symphonyConfig(env = process.env) {
  const port = env.SYMPHONY_PORT || DEFAULT_PORT;
  const endpoint = env.WORKFLOW_HUB_SYMPHONY_STATE_URL ||
    env.SYMPHONY_STATE_URL ||
    `http://127.0.0.1:${port}/api/v1/state`;

  return {
    stateEndpoint: endpoint,
    logsRoot: env.SYMPHONY_LOGS_ROOT || DEFAULT_LOGS_ROOT
  };
}

async function fetchJsonWithTimeout(url, { timeoutMs }) {
  if (typeof fetch !== "function") {
    throw new Error("global fetch is not available in this Node runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function issueFromEndpointEntry(entry, fallbackState, context) {
  const identifier = stringOrUndefined(entry?.issue_identifier) ??
    stringOrUndefined(entry?.identifier) ??
    context.issueId ??
    "UNKNOWN";
  const normalizedState = normalizeEntryState(entry, fallbackState);

  return {
    identifier,
    issueId: stringOrUndefined(entry?.issue_id),
    linearUrl: linearDetails(context.issue)?.url,
    linearStatus: linearDetails(context.issue)?.status,
    normalizedState,
    source: "endpoint",
    reason: reasonForEndpointEntry(entry, fallbackState, normalizedState),
    symphonyStatus: stringOrUndefined(entry?.status) ?? stringOrUndefined(entry?.state),
    workspacePath: stringOrUndefined(entry?.workspace_path) ?? workspacePath(context.workspace),
    workerHost: stringOrUndefined(entry?.worker_host),
    sessionId: stringOrUndefined(entry?.session_id),
    attempt: numberOrUndefined(entry?.attempt),
    dueAt: stringOrUndefined(entry?.due_at),
    startedAt: stringOrUndefined(entry?.started_at),
    lastEvent: stringOrUndefined(entry?.last_event),
    lastEventAt: stringOrUndefined(entry?.last_event_at),
    lastMessage: stringOrUndefined(entry?.last_message),
    lastError: stringOrUndefined(entry?.last_error) ?? stringOrUndefined(entry?.error),
    tokens: normalizeTokens(entry?.tokens)
  };
}

function endpointEntriesForState(payload, state) {
  const keysByState = {
    active: ["running", "active", "in_progress", "workers"],
    queue: ["queued", "queue", "retrying", "pending", "ready"],
    blocked: ["blocked", "waiting", "paused"],
    failed: ["failed", "failures", "errored", "errors"],
    complete: ["complete", "completed", "finished", "done"]
  };

  return keysByState[state].flatMap((key) => arrayOrEmpty(payload?.[key]));
}

function normalizeEntryState(entry, fallbackState) {
  const status = `${entry?.status ?? entry?.state ?? ""}`.toLowerCase();

  if (status.includes("fail") || status.includes("error")) return "failed";
  if (status.includes("block")) return "blocked";
  if (TERMINAL_LINEAR_STATES.has(status)) return "complete";
  if (status.includes("running") || status.includes("progress")) return "active";
  if (status.includes("queue") || status.includes("retry") || status.includes("todo") || status.includes("ready")) {
    return "queue";
  }

  return fallbackState;
}

function reasonForEndpointEntry(entry, fallbackState, normalizedState) {
  if (normalizedState === "active") return "Symphony reports this issue in the running set.";
  if (normalizedState === "queue" && fallbackState === "queue") {
    return entry?.error
      ? "Symphony reports this issue in the retry queue with an error reason."
      : "Symphony reports this issue in the queue.";
  }
  if (normalizedState === "failed") return "Symphony reports a failed or errored state.";
  if (normalizedState === "blocked") return "Symphony reports a blocked state.";
  if (normalizedState === "complete") return "Symphony reports a terminal state.";
  return "Symphony returned this issue but did not provide a recognized state.";
}

function inferSelectedIssue(context, forcedState, forcedReason) {
  if (!context.issueId) return undefined;

  const linear = linearDetails(context.issue);
  const normalizedState = forcedState ?? normalizeLinearState(linear?.status);

  return {
    identifier: context.issueId,
    issueId: linear?.linearId,
    linearUrl: linear?.url,
    linearStatus: linear?.status,
    normalizedState,
    source: "linear",
    reason: forcedReason ?? reasonForLinearStatus(linear?.status),
    workspacePath: workspacePath(context.workspace)
  };
}

function normalizeLinearState(status) {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return "unknown";
  if (TERMINAL_LINEAR_STATES.has(normalized)) return "complete";
  if (normalized === "blocked") return "blocked";
  if (normalized === "in progress") return "active";
  if (QUEUE_LINEAR_STATES.has(normalized)) return "queue";
  return "unknown";
}

function reasonForLinearStatus(status) {
  if (!status) return "No Symphony entry or Linear status was available for this issue.";

  const normalized = normalizeLinearState(status);
  if (normalized === "complete") return `No Symphony entry was found; Linear status ${status} is terminal.`;
  if (normalized === "blocked") return "No Symphony entry was found; Linear status is Blocked.";
  if (normalized === "active") return "No Symphony entry was found; Linear status is In Progress.";
  if (normalized === "queue") return `No Symphony entry was found; Linear status ${status} is dispatchable.`;
  return `No Symphony entry was found; Linear status ${status} is not mapped to a Symphony state.`;
}

function findSelectedIssue(issues, issueId) {
  if (!issueId) return undefined;
  return issues.find((issue) => issue.identifier === issueId || issue.issueId === issueId);
}

function countIssues(issues) {
  const counts = emptyCounts();

  for (const issue of issues) {
    if (SYMPHONY_NORMALIZED_STATES.includes(issue.normalizedState)) {
      counts[issue.normalizedState] += 1;
    } else {
      counts.unknown += 1;
    }
  }

  return counts;
}

function emptyCounts() {
  return Object.fromEntries(SYMPHONY_NORMALIZED_STATES.map((state) => [state, 0]));
}

function readLatestSymphonyLog(logsRoot) {
  const logDirectory = path.join(logsRoot, "log");

  try {
    const candidates = fs.readdirSync(logDirectory)
      .filter((name) => name.startsWith("symphony.log") && !name.endsWith(".idx") && !name.endsWith(".siz"))
      .map((name) => {
        const filePath = path.join(logDirectory, name);
        const stats = fs.statSync(filePath);
        return { path: filePath, mtimeMs: stats.mtimeMs };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const candidate of candidates) {
      const latestLine = lastNonEmptyLine(fs.readFileSync(candidate.path, "utf8"));
      if (latestLine) {
        return {
          path: candidate.path,
          latestLine,
          latestAt: new Date(candidate.mtimeMs).toISOString()
        };
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function lastNonEmptyLine(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1);
}

function linearDetails(issue) {
  return issue?.linear;
}

function workspacePath(workspace) {
  return workspace?.path;
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrUndefined(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeTokens(tokens) {
  if (!tokens || typeof tokens !== "object") return undefined;

  return {
    inputTokens: numberOrUndefined(tokens.input_tokens),
    outputTokens: numberOrUndefined(tokens.output_tokens),
    totalTokens: numberOrUndefined(tokens.total_tokens)
  };
}

function availableAdapter(id, label, detail) {
  return adapterState(id, label, "available", detail, false);
}

function unavailableAdapter(id, label, detail) {
  return adapterState(id, label, "unavailable", detail, true);
}

function adapterState(id, label, status, detail, recoverable) {
  return {
    id,
    label,
    status,
    detail,
    recoverable
  };
}

function errorMessage(error) {
  if (error?.name === "AbortError") return "request timed out";
  return error instanceof Error ? error.message : String(error);
}
