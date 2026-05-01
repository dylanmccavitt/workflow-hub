import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  DEFAULT_REGISTRY_FILENAME,
  defaultRegistryDatabasePath
} from "./registry-db.mjs";

export const CODEX_RUNNER_KIND = "Codex";
export const DEFAULT_CODEX_COMMAND = "codex";
export const DEFAULT_CODEX_SANDBOX = "workspace-write";
export const DEFAULT_CODEX_APPROVAL_POLICY = "never";

const SAFE_TOKEN_PATTERN = /[^a-z0-9._-]+/gi;
const ALLOWED_CODEX_SANDBOXES = new Set(["read-only", "workspace-write"]);

export function codexConfigForProject(project, workspacePath, overrides = {}) {
  const configured = project?.runners?.codex ?? {};
  const command = sanitizeNonEmptyString(
    overrides.command ?? configured.command ?? DEFAULT_CODEX_COMMAND,
    "command"
  );
  const model = sanitizeOptionalString(overrides.model ?? configured.model, "model");
  const profile = sanitizeOptionalString(overrides.profile ?? configured.profile, "profile");
  const sandbox = sanitizeCodexSandbox(
    overrides.sandbox ?? configured.sandbox ?? DEFAULT_CODEX_SANDBOX,
    "sandbox"
  );
  const approvalPolicy = sanitizeNonEmptyString(
    overrides.approvalPolicy ?? configured.approvalPolicy ?? DEFAULT_CODEX_APPROVAL_POLICY,
    "approvalPolicy"
  );
  const logRoot = resolveRunnerPath(
    overrides.logRoot ?? configured.logRoot ?? defaultCodexLogRoot(),
    workspacePath
  );

  return {
    command,
    model,
    profile,
    sandbox,
    approvalPolicy,
    logRoot
  };
}

export async function startCodexLocalRun(input) {
  const issueId = sanitizeIssueId(input.issueId);
  const prompt = sanitizePrompt(input.prompt);
  const clock = input.clock ?? (() => new Date());
  const repository = input.repository;
  const project = input.project;
  const state = input.state;
  const workspace = input.workspace ?? state?.workspace;

  if (!repository) {
    throw new Error("repository is required to persist Codex runs.");
  }

  if (!project) {
    throw new Error(`No project config is available for ${issueId}.`);
  }

  if (!workspace?.found || !workspace.path) {
    throw new Error(`No issue workspace was found for ${issueId}.`);
  }

  const config = codexConfigForProject(project, workspace.path, {
    command: input.command,
    model: input.model,
    profile: input.profile,
    sandbox: input.sandbox,
    approvalPolicy: input.approvalPolicy,
    logRoot: input.logRoot
  });
  const issueRecord = upsertCodexIssue(repository, project, state, issueId, clock);
  const workspaceRecord = upsertCodexWorkspace(repository, issueRecord, workspace, clock);
  const runId = input.runId ?? newCodexRunId(issueId, clock);
  const runPaths = codexRunPaths(config.logRoot, issueId, runId);
  const args = codexExecArgs({
    config,
    cwd: workspace.path,
    summaryPath: runPaths.summaryPath
  });
  const command = [config.command, ...args];
  const permissionBoundary = codexPermissionBoundary(config, workspace.path);

  if (input.dryRun === true) {
    return {
      issueId,
      dryRun: true,
      status: "ready",
      prompt,
      command,
      cwd: workspace.path,
      logPath: runPaths.logPath,
      summaryPath: runPaths.summaryPath,
      permissionBoundary
    };
  }

  const startedAt = clock().toISOString();
  const streamedEvents = [];
  const summaryParts = [];
  let sessionId;

  let runRecord = repository.upsertRun({
    id: runId,
    issueId: issueRecord.id,
    workspaceId: workspaceRecord.id,
    runnerKind: CODEX_RUNNER_KIND,
    status: "running",
    startedAt,
    summary: undefined,
    metadata: runMetadata({
      runId,
      sessionId,
      prompt,
      config,
      command,
      cwd: workspace.path,
      logPath: runPaths.logPath,
      summaryPath: runPaths.summaryPath,
      dryRun: false,
      permissionBoundary
    })
  });

  const startedEvent = recordCodexEvent(repository, issueRecord.id, runId, {
    type: "codex.run.started",
    message: `${issueId} Codex run started`,
    createdAt: startedAt,
    payload: {
      runId,
      prompt,
      command,
      cwd: workspace.path,
      logPath: runPaths.logPath,
      summaryPath: runPaths.summaryPath,
      permissionBoundary
    }
  });
  await input.onEvent?.(startedEvent);

  const codexProcessRunner = input.codexProcessRunner ?? defaultCodexProcessRunner;
  const processResult = await codexProcessRunner({
    command: config.command,
    args,
    prompt,
    cwd: workspace.path,
    env: process.env,
    logPath: runPaths.logPath,
    summaryPath: runPaths.summaryPath,
    clock,
    onEvent: async (event) => {
      const eventSummary = summarizeCodexJsonEvent(event);
      if (eventSummary.sessionId && !sessionId) {
        sessionId = eventSummary.sessionId;
      }
      if (eventSummary.summary) {
        summaryParts.push(eventSummary.summary);
      }

      const registryEvent = recordCodexEvent(repository, issueRecord.id, runId, {
        type: `codex.event.${eventSummary.type}`,
        message: eventSummary.message,
        createdAt: clock().toISOString(),
        payload: {
          runId,
          sessionId: eventSummary.sessionId ?? sessionId,
          prompt,
          command,
          cwd: workspace.path,
          logPath: runPaths.logPath,
          permissionBoundary,
          event
        }
      });
      streamedEvents.push(registryEvent);
      await input.onEvent?.(registryEvent);
    }
  });

  const finishedAt = clock().toISOString();
  const summaryFileText = readOptionalText(runPaths.summaryPath);
  const finalStatus = statusFromProcessResult(processResult);
  const summary = summarizeCodexRun({
    status: finalStatus,
    summaryFileText,
    summaryParts,
    stderr: processResult.stderr,
    exitCode: processResult.code,
    signal: processResult.signal
  });

  runRecord = repository.upsertRun({
    id: runId,
    issueId: issueRecord.id,
    workspaceId: workspaceRecord.id,
    runnerKind: CODEX_RUNNER_KIND,
    status: finalStatus,
    startedAt,
    finishedAt,
    summary,
    metadata: runMetadata({
      runId,
      sessionId,
      prompt,
      config,
      command,
      cwd: workspace.path,
      logPath: runPaths.logPath,
      summaryPath: runPaths.summaryPath,
      dryRun: false,
      permissionBoundary,
      exitCode: processResult.code,
      signal: processResult.signal,
      stderr: processResult.stderr
    })
  });

  const finalEvent = recordCodexEvent(repository, issueRecord.id, runId, {
    type: finalStatus === "error" ? "codex.run.failed" : "codex.run.finished",
    message: `${issueId} Codex run ${finalStatus}`,
    createdAt: finishedAt,
    payload: {
      runId,
      sessionId,
      command,
      cwd: workspace.path,
      logPath: runPaths.logPath,
      summaryPath: runPaths.summaryPath,
      status: finalStatus,
      summary,
      exitCode: processResult.code,
      signal: processResult.signal,
      permissionBoundary
    }
  });

  return {
    issueId,
    dryRun: false,
    status: finalStatus,
    prompt,
    command,
    cwd: workspace.path,
    logPath: runPaths.logPath,
    summaryPath: runPaths.summaryPath,
    sessionId,
    runId,
    summary,
    exitCode: processResult.code,
    signal: processResult.signal,
    permissionBoundary,
    run: runRecord,
    event: finalEvent,
    streamedEventCount: streamedEvents.length
  };
}

async function defaultCodexProcessRunner({
  command,
  args,
  prompt,
  cwd,
  env,
  logPath,
  onEvent
}) {
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true });

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const logStream = fs.createWriteStream(logPath, { flags: "a" });
    const eventPromises = [];
    let stdoutBuffer = "";
    let stderr = "";
    let spawnError;

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      logStream.write(text);
      stdoutBuffer += text;
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const event = parseJsonLine(line);
        if (event) {
          eventPromises.push(Promise.resolve(onEvent?.(event)));
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      spawnError = error;
    });

    child.on("close", (code, signal) => {
      if (stdoutBuffer.trim().length > 0) {
        const event = parseJsonLine(stdoutBuffer.trim());
        if (event) {
          eventPromises.push(Promise.resolve(onEvent?.(event)));
        }
      }

      logStream.end(async () => {
        try {
          await Promise.all(eventPromises);
        } catch (error) {
          stderr = [stderr, errorMessage(error)].filter(Boolean).join("\n");
        }
        resolve({
          code,
          signal,
          stderr: spawnError ? errorMessage(spawnError) : stderr.trim(),
          spawnError
        });
      });
    });

    child.stdin.end(prompt);
  });
}

function codexExecArgs({ config, cwd, summaryPath }) {
  const args = [
    "--sandbox",
    config.sandbox,
    "--ask-for-approval",
    config.approvalPolicy,
    "exec",
    "--json",
    "--cd",
    cwd,
    "--output-last-message",
    summaryPath
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  if (config.profile) {
    args.push("--profile", config.profile);
  }

  args.push("-");
  return args;
}

function upsertCodexIssue(repository, project, state, issueId, clock) {
  const current = clock().toISOString();
  const linearIssue = state?.issue?.linear;
  const existing = repository.getIssueByIdentifier(project.id, issueId);
  const existingProject = repository.getProject(project.id);

  repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: project.linear?.projectId,
    metadata: {
      ...(existingProject?.metadata ?? {}),
      linear: {
        teamKey: project.linear?.teamKey,
        projectId: project.linear?.projectId,
        projectSlug: project.linear?.projectSlug
      },
      runners: project.runners
    }
  });

  return repository.upsertIssue({
    id: existing?.id ?? linearIssue?.linearId ?? `${project.id}-${issueId}`,
    projectId: project.id,
    identifier: issueId,
    title: linearIssue?.title ?? existing?.title ?? issueId,
    status: linearIssue?.status ?? existing?.status ?? state?.issue?.status ?? "Runner Event",
    linearUrl: linearIssue?.url ?? existing?.linearUrl,
    priority: linearIssue?.priority ?? existing?.priority,
    metadata: {
      ...(existing?.metadata ?? {}),
      source: linearIssue ? "linear" : state?.issue?.source ?? "runner",
      linearId: linearIssue?.linearId ?? existing?.metadata?.linearId,
      updatedAt: linearIssue?.updatedAt ?? existing?.metadata?.updatedAt ?? current,
      statusType: linearIssue?.statusType ?? existing?.metadata?.statusType,
      priorityLabel: linearIssue?.priorityLabel ?? existing?.metadata?.priorityLabel,
      labels: linearIssue?.labels ?? existing?.metadata?.labels,
      blockers: linearIssue?.blockers ?? existing?.metadata?.blockers,
      blockedIssues: linearIssue?.blockedIssues ?? existing?.metadata?.blockedIssues,
      links: linearIssue?.links ?? existing?.metadata?.links,
      pullRequests: linearIssue?.pullRequests ?? existing?.metadata?.pullRequests,
      codexWorkpad: linearIssue?.codexWorkpad ?? existing?.metadata?.codexWorkpad,
      linearSync: linearIssue?.cache ?? existing?.metadata?.linearSync,
      runners: {
        ...(existing?.metadata?.runners ?? {}),
        codex: project.runners?.codex
      }
    }
  });
}

function upsertCodexWorkspace(repository, issueRecord, workspace, clock) {
  return repository.upsertWorkspace({
    id: `${issueRecord.id}:workspace`,
    issueId: issueRecord.id,
    path: workspace.path,
    branch: workspace.branch,
    baseBranch: "main",
    headSha: workspace.headSha,
    dirty: Boolean(workspace.dirty),
    metadata: {
      projectId: workspace.projectId,
      projectName: workspace.projectName,
      remote: workspace.remote,
      gitStatus: workspace.gitStatus,
      refreshedAt: clock().toISOString()
    }
  });
}

function recordCodexEvent(repository, issueId, entityId, event) {
  return repository.recordEvent({
    issueId,
    entityType: "run",
    entityId,
    type: event.type,
    message: event.message,
    payload: event.payload,
    createdAt: event.createdAt
  });
}

function runMetadata({
  runId,
  sessionId,
  prompt,
  config,
  command,
  cwd,
  logPath,
  summaryPath,
  dryRun,
  permissionBoundary,
  exitCode,
  signal,
  stderr
}) {
  return {
    provider: "codex-cli",
    runId,
    sessionId,
    command,
    commandPath: config.command,
    model: config.model,
    profile: config.profile,
    prompt,
    cwd,
    logPath,
    summaryPath,
    sandbox: config.sandbox,
    approvalPolicy: config.approvalPolicy,
    permissionBoundary,
    dryRun,
    exitCode,
    signal,
    stderr
  };
}

function codexPermissionBoundary(config, cwd) {
  return {
    cwd,
    sandbox: config.sandbox,
    approvalPolicy: config.approvalPolicy,
    writableRoots: config.sandbox === "workspace-write" ? [cwd] : [],
    addDirs: []
  };
}

function summarizeCodexJsonEvent(event) {
  const rawType = firstString(event?.type, event?.event, event?.name) ?? "message";
  const type = safeToken(rawType);
  const sessionId = findFirstStringByKey(event, [
    "session_id",
    "sessionId",
    "thread_id",
    "threadId",
    "conversation_id"
  ]);
  const text = extractEventText(event);
  const isBoundary = /approval|permission|sandbox/i.test(rawType) || /approval|permission|sandbox/i.test(text ?? "");

  return {
    type,
    sessionId,
    message: isBoundary
      ? `Codex permission boundary: ${truncate(text ?? rawType)}`
      : text
        ? `Codex ${rawType}: ${truncate(text)}`
        : `Codex ${rawType} event`,
    summary: summaryTextForEvent(rawType, text)
  };
}

function summaryTextForEvent(type, text) {
  if (!text) return undefined;
  if (/assistant|message|final|result|output/i.test(type)) return text;
  return undefined;
}

function extractEventText(event) {
  const direct = firstString(event?.message, event?.text, event?.summary, event?.content);
  if (direct) return direct;

  const item = event?.item ?? event?.msg ?? event?.payload;
  const nested = firstString(item?.message, item?.text, item?.summary, item?.content);
  if (nested) return nested;

  if (Array.isArray(item?.content)) {
    return textFromContentBlocks(item.content);
  }

  if (Array.isArray(event?.content)) {
    return textFromContentBlocks(event.content);
  }

  return undefined;
}

function textFromContentBlocks(content) {
  const text = content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text" && typeof block.text === "string") return block.text;
      if (typeof block?.content === "string") return block.content;
      return undefined;
    })
    .filter(Boolean)
    .join("\n")
    .trim();
  return text || undefined;
}

function statusFromProcessResult(result) {
  if (result.code === 0) return "finished";
  if (result.signal) return "cancelled";
  return "error";
}

function summarizeCodexRun({ status, summaryFileText, summaryParts, stderr, exitCode, signal }) {
  const summary = summaryFileText?.trim() || summaryParts.filter(Boolean).at(-1);
  if (summary) return truncate(summary, 1000);
  if (stderr) return truncate(stderr, 1000);
  if (status === "cancelled") return `Codex run cancelled by ${signal ?? "signal"}.`;
  if (status === "error") return `Codex exited with code ${exitCode ?? "unknown"}.`;
  return "Codex run finished.";
}

function newCodexRunId(issueId, clock) {
  const timestamp = clock().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `codex-${issueId.toLowerCase()}-${timestamp}-${randomUUID()}`;
}

function codexRunPaths(logRoot, issueId, runId) {
  const issueDir = path.join(logRoot, issueId);
  return {
    logPath: path.join(issueDir, `${runId}.jsonl`),
    summaryPath: path.join(issueDir, `${runId}-summary.md`)
  };
}

function defaultCodexLogRoot() {
  const registryPath = defaultRegistryDatabasePath();
  const baseDir = path.basename(registryPath) === DEFAULT_REGISTRY_FILENAME
    ? path.dirname(registryPath)
    : path.join(os.homedir(), "Library", "Application Support", "Workflow Hub");

  return path.join(baseDir, "codex-runs");
}

function resolveRunnerPath(value, workspacePath) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  if (path.isAbsolute(value)) return value;
  return path.join(workspacePath, value);
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function readOptionalText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

function findFirstStringByKey(value, keys, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);

  for (const key of keys) {
    if (typeof value[key] === "string" && value[key].trim().length > 0) {
      return value[key].trim();
    }
  }

  for (const nested of Object.values(value)) {
    const found = findFirstStringByKey(nested, keys, seen);
    if (found) return found;
  }

  return undefined;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
}

function safeToken(value) {
  return String(value ?? "message").replace(SAFE_TOKEN_PATTERN, "_").replace(/^_+|_+$/g, "").toLowerCase() || "message";
}

function sanitizeIssueId(value) {
  if (typeof value !== "string" || !/^[a-z]+-\d+$/i.test(value.trim())) {
    throw new Error("issueId must look like AGE-363");
  }

  return value.trim().toUpperCase();
}

function sanitizePrompt(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("prompt must be a non-empty string.");
  }

  return value.trim();
}

function sanitizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  return sanitizeNonEmptyString(value, fieldName);
}

function sanitizeNonEmptyString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function sanitizeCodexSandbox(value, fieldName) {
  const sandbox = sanitizeNonEmptyString(value, fieldName);
  if (!ALLOWED_CODEX_SANDBOXES.has(sandbox)) {
    throw new Error(`${fieldName} must be read-only or workspace-write.`);
  }

  return sandbox;
}

function truncate(value, length = 220) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
