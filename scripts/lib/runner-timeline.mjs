export const RUNNER_NORMALIZED_STATES = Object.freeze([
  "queued",
  "starting",
  "running",
  "blocked",
  "cancelling",
  "cancelled",
  "succeeded",
  "failed",
  "unknown"
]);

export function normalizeRunnerState(value, fallback = "unknown") {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (!normalized) return fallback;

  if (["queued", "queue", "pending", "ready", "todo", "retry", "backoff"].includes(normalized)) {
    return "queued";
  }
  if (["starting", "started", "created", "initializing", "launching"].includes(normalized)) {
    return "starting";
  }
  if (["running", "active", "in-progress", "progress", "working", "streaming"].includes(normalized)) {
    return "running";
  }
  if (["blocked", "needs-fixes", "needs-fix", "waiting", "approval", "approval-requested"].includes(normalized)) {
    return "blocked";
  }
  if (["cancelling", "canceling", "stopping", "aborting"].includes(normalized)) {
    return "cancelling";
  }
  if (["cancelled", "canceled", "cancel", "aborted", "terminated", "sigterm", "sigint"].includes(normalized)) {
    return "cancelled";
  }
  if (["succeeded", "success", "finished", "done", "complete", "completed", "passed"].includes(normalized)) {
    return "succeeded";
  }
  if (["failed", "failure", "error", "errored", "crashed", "timed-out", "timeout"].includes(normalized)) {
    return "failed";
  }

  return fallback;
}

export function normalizeSymphonyRunnerState(value) {
  const state = String(value ?? "").trim().toLowerCase();
  if (state === "queue") return "queued";
  if (state === "active") return "running";
  if (state === "complete") return "succeeded";
  return normalizeRunnerState(state);
}

export function buildRunnerTimeline({ issue, symphonyState } = {}) {
  const runs = Array.isArray(issue?.runs) ? issue.runs : [];
  const runById = new Map(runs.map((run) => [run.id, run]));
  const runIdsWithEvents = new Set();
  const entries = [];

  for (const event of arrayOrEmpty(issue?.events)) {
    if (event?.entityType === "run" && event.entityId) {
      runIdsWithEvents.add(event.entityId);
    }

    const entry = timelineEntryFromWorkflowEvent(event, runById.get(event?.entityId));
    if (entry) entries.push(entry);
  }

  for (const run of runs) {
    if (!runIdsWithEvents.has(run.id)) {
      entries.push(timelineEntryFromRunRecord(run));
    }
  }

  const symphonyEntry = timelineEntryFromSymphonyState(symphonyState);
  if (symphonyEntry) entries.push(symphonyEntry);

  return entries.sort(compareTimelineEntries);
}

export function timelineEntryFromWorkflowEvent(event, run) {
  if (!event || typeof event !== "object") return undefined;

  const payload = objectOrEmpty(event.payload);
  const eventType = stringOrUndefined(event.type);
  const runnerKind = runnerKindFromEvent(event, run);
  const rawEvent = objectOrUndefined(payload.event);
  const rawStatus = firstString(
    payload.status,
    payload.rawStatus,
    rawEvent?.status,
    rawEvent?.state,
    rawEvent?.event,
    rawEvent?.type,
    objectOrUndefined(payload.result)?.status,
    eventType
  );
  const fallbackState = stateFromEventType(eventType);
  const normalizedState = normalizeRunnerState(rawStatus, fallbackState);
  const runId = firstString(payload.runId, run?.metadata?.runId, event.entityType === "run" ? event.entityId : undefined);
  const agentId = firstString(payload.agentId, run?.metadata?.agentId);
  const sessionId = firstString(payload.sessionId, run?.metadata?.sessionId);
  const logPath = firstString(payload.logPath, run?.metadata?.logPath);
  const summaryPath = firstString(payload.summaryPath, run?.metadata?.summaryPath);
  const cwd = firstString(payload.cwd, run?.metadata?.cwd);
  const detail = detailFromParts([
    payload.summary,
    payload.error,
    rawEvent ? "Raw provider event stored." : undefined
  ]);

  return compactEntry({
    id: event.id,
    source: "registry-event",
    runnerKind,
    normalizedState,
    rawStatus,
    message: event.message,
    detail,
    createdAt: event.createdAt,
    eventType,
    runId,
    rawRunnerId: firstString(agentId, sessionId, runId),
    agentId,
    sessionId,
    logPath,
    summaryPath,
    cwd,
    rawEvent,
    rawRunMetadata: run?.metadata
  });
}

export function timelineEntryFromRunRecord(run) {
  if (!run || typeof run !== "object") return undefined;

  const metadata = objectOrEmpty(run.metadata);
  const rawStatus = firstString(run.status, metadata.status, metadata.result?.status);
  const normalizedState = normalizeRunnerState(rawStatus);
  const runId = firstString(metadata.runId, run.id);
  const detail = detailFromParts([
    run.summary
  ]);

  return compactEntry({
    id: `run:${run.id}`,
    source: "run-record",
    runnerKind: run.runnerKind,
    normalizedState,
    rawStatus,
    message: `${run.runnerKind} run ${normalizedState}`,
    detail,
    createdAt: run.finishedAt ?? run.startedAt ?? run.updatedAt ?? run.createdAt,
    runId,
    rawRunnerId: firstString(metadata.agentId, metadata.sessionId, runId),
    agentId: stringOrUndefined(metadata.agentId),
    sessionId: stringOrUndefined(metadata.sessionId),
    logPath: stringOrUndefined(metadata.logPath),
    summaryPath: stringOrUndefined(metadata.summaryPath),
    cwd: stringOrUndefined(metadata.cwd),
    rawRunMetadata: metadata
  });
}

export function timelineEntryFromSymphonyState(symphonyState) {
  const selected = symphonyState?.selectedIssue;
  if (!selected) return undefined;

  const rawStatus = firstString(selected.symphonyStatus, selected.normalizedState, selected.linearStatus);
  const normalizedState = normalizeSymphonyRunnerState(selected.normalizedState ?? rawStatus);
  const createdAt = firstString(selected.lastEventAt, selected.startedAt, symphonyState.generatedAt);
  const sessionId = stringOrUndefined(selected.sessionId);
  const detail = detailFromParts([
    selected.reason,
    selected.lastError,
    selected.lastMessage
  ]);

  return compactEntry({
    id: `symphony:${selected.identifier}:${createdAt ?? normalizedState}`,
    source: "symphony-state",
    runnerKind: "Symphony",
    normalizedState,
    rawStatus,
    message: `${selected.identifier} Symphony ${normalizedState}`,
    detail,
    createdAt,
    runId: sessionId,
    rawRunnerId: sessionId,
    sessionId,
    cwd: stringOrUndefined(selected.workspacePath),
    rawEvent: {
      ...selected,
      endpoint: symphonyState.endpoint,
      source: symphonyState.source,
      counts: symphonyState.counts
    }
  });
}

function runnerKindFromEvent(event, run) {
  const type = String(event?.type ?? "");
  if (type.startsWith("codex.")) return "Codex";
  if (type.startsWith("cursor.")) return "Cursor SDK";
  if (type.startsWith("symphony.")) return "Symphony";
  return run?.runnerKind ?? firstString(event?.payload?.runnerKind, event?.payload?.runner) ?? "Unknown";
}

function stateFromEventType(eventType) {
  const type = String(eventType ?? "").toLowerCase();
  if (type.includes("block") || type.includes("approval")) return "blocked";
  if (type.includes("cancelling") || type.includes("canceling")) return "cancelling";
  if (type.includes("cancel") || type.includes("abort")) return "cancelled";
  if (type.includes("fail") || type.includes("error")) return "failed";
  if (type.includes("finish") || type.includes("complete") || type.includes("success")) return "succeeded";
  if (type.includes("start")) return "starting";
  if (type.includes("run") || type.includes("status") || type.includes("event")) return "running";
  if (type.includes("queue") || type.includes("ready")) return "queued";
  return "unknown";
}

function compactEntry(entry) {
  if (!entry.id || !entry.createdAt) return undefined;

  return Object.fromEntries(
    Object.entries(entry).filter(([, value]) => value !== undefined && value !== "")
  );
}

function compareTimelineEntries(left, right) {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime;
  }

  return String(left.id).localeCompare(String(right.id));
}

function detailFromParts(parts) {
  return parts
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" | ");
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function objectOrEmpty(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function objectOrUndefined(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringOrUndefined(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function firstString(...values) {
  for (const value of values) {
    const candidate = stringOrUndefined(value);
    if (candidate) return candidate;
  }

  return undefined;
}
