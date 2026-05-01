import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const CURSOR_RUNNER_KIND = "Cursor SDK";
export const DEFAULT_CURSOR_MODEL = "composer-2";
export const DEFAULT_CURSOR_CONFIG_PATH = ".cursor";
export const DEFAULT_CURSOR_API_KEY_ENV = "CURSOR_API_KEY";

export function cursorConfigForProject(project, workspacePath, overrideModel) {
  const configured = project?.runners?.cursor ?? {};
  const model = sanitizeModel(overrideModel ?? configured.model ?? DEFAULT_CURSOR_MODEL);
  const configPath = configured.configPath ?? DEFAULT_CURSOR_CONFIG_PATH;
  const apiKeyEnv = configured.apiKeyEnv ?? DEFAULT_CURSOR_API_KEY_ENV;

  return {
    model,
    configPath,
    resolvedConfigPath: resolveRunnerConfigPath(configPath, workspacePath),
    apiKeyEnv
  };
}

export async function startCursorLocalRun(input) {
  const issueId = sanitizeIssueId(input.issueId);
  const prompt = sanitizePrompt(input.prompt);
  const clock = input.clock ?? (() => new Date());
  const repository = input.repository;
  const project = input.project;
  const state = input.state;
  const workspace = input.workspace ?? state?.workspace;

  if (!repository) {
    throw new Error("repository is required to persist Cursor runs.");
  }

  if (!project) {
    throw new Error(`No project config is available for ${issueId}.`);
  }

  if (!workspace?.found || !workspace.path) {
    throw new Error(`No issue workspace was found for ${issueId}.`);
  }

  const config = cursorConfigForProject(project, workspace.path, input.model);
  const issueRecord = upsertCursorIssue(repository, project, state, issueId, clock);
  const workspaceRecord = upsertCursorWorkspace(repository, issueRecord, workspace, clock);

  if (input.dryRun === true) {
    return {
      issueId,
      dryRun: true,
      status: "ready",
      prompt,
      model: config.model,
      cwd: workspace.path,
      configPath: config.resolvedConfigPath,
      apiKeyEnv: config.apiKeyEnv
    };
  }

  const cursorSdkLoader = input.cursorSdkLoader ?? defaultCursorSdkLoader;
  const startedAt = clock().toISOString();
  let agent;
  let run;
  let runRecord;
  const streamedEvents = [];
  const summaryParts = [];

  try {
    const { Agent } = await cursorSdkLoader();
    const createOptions = cursorCreateOptions({
      issueId,
      prompt,
      config,
      cwd: workspace.path
    });

    agent = await Agent.create(createOptions);
    run = await agent.send(prompt);
    runRecord = repository.upsertRun({
      id: run.id,
      issueId: issueRecord.id,
      workspaceId: workspaceRecord.id,
      runnerKind: CURSOR_RUNNER_KIND,
      status: normalizeRunStatus(run.status ?? "running"),
      startedAt,
      summary: undefined,
      metadata: runMetadata({
        agentId: agent.agentId,
        runId: run.id,
        prompt,
        config,
        cwd: workspace.path,
        dryRun: false
      })
    });

    recordCursorEvent(repository, issueRecord.id, run.id, {
      type: "cursor.run.started",
      message: `${issueId} Cursor run started`,
      createdAt: startedAt,
      payload: {
        agentId: agent.agentId,
        runId: run.id,
        model: config.model,
        prompt,
        cwd: workspace.path,
        configPath: config.resolvedConfigPath
      }
    });

    for await (const event of run.stream()) {
      const eventSummary = summarizeCursorStreamEvent(event);
      if (eventSummary.summary) {
        summaryParts.push(eventSummary.summary);
      }

      const registryEvent = recordCursorEvent(repository, issueRecord.id, run.id, {
        type: `cursor.event.${eventSummary.type}`,
        message: eventSummary.message,
        createdAt: clock().toISOString(),
        payload: {
          agentId: agent.agentId,
          runId: run.id,
          model: config.model,
          prompt,
          cwd: workspace.path,
          event
        }
      });
      streamedEvents.push(registryEvent);
      await input.onEvent?.(registryEvent);
    }

    const result = await waitForRunResult(run);
    const finishedAt = clock().toISOString();
    const finalStatus = normalizeRunStatus(result?.status ?? run.status ?? "finished");
    const summary = summarizeRunResult(result, summaryParts);
    runRecord = repository.upsertRun({
      id: run.id,
      issueId: issueRecord.id,
      workspaceId: workspaceRecord.id,
      runnerKind: CURSOR_RUNNER_KIND,
      status: finalStatus,
      startedAt,
      finishedAt,
      summary,
      metadata: runMetadata({
        agentId: agent.agentId,
        runId: run.id,
        prompt,
        config,
        cwd: workspace.path,
        dryRun: false,
        result
      })
    });

    const finalEvent = recordCursorEvent(repository, issueRecord.id, run.id, {
      type: finalStatus === "error" ? "cursor.run.failed" : "cursor.run.finished",
      message: `${issueId} Cursor run ${finalStatus}`,
      createdAt: finishedAt,
      payload: {
        agentId: agent.agentId,
        runId: run.id,
        model: config.model,
        prompt,
        cwd: workspace.path,
        status: finalStatus,
        summary,
        result
      }
    });

    return {
      issueId,
      dryRun: false,
      status: finalStatus,
      prompt,
      model: config.model,
      cwd: workspace.path,
      configPath: config.resolvedConfigPath,
      agentId: agent.agentId,
      runId: run.id,
      summary,
      run: runRecord,
      event: finalEvent,
      streamedEventCount: streamedEvents.length
    };
  } catch (error) {
    const failedAt = clock().toISOString();
    const errorText = errorMessage(error);
    const agentId = agent?.agentId;
    const runId = run?.id ?? `cursor-error-${randomUUID()}`;

    runRecord = repository.upsertRun({
      id: runId,
      issueId: issueRecord.id,
      workspaceId: workspaceRecord.id,
      runnerKind: CURSOR_RUNNER_KIND,
      status: "error",
      startedAt,
      finishedAt: failedAt,
      summary: errorText,
      metadata: runMetadata({
        agentId,
        runId,
        prompt,
        config,
        cwd: workspace.path,
        dryRun: false,
        error: errorText
      })
    });

    recordCursorEvent(repository, issueRecord.id, runId, {
      type: "cursor.run.failed",
      message: `${issueId} Cursor run failed`,
      createdAt: failedAt,
      payload: {
        agentId,
        runId,
        model: config.model,
        prompt,
        cwd: workspace.path,
        status: "error",
        error: errorText
      }
    });

    error.cursorRun = runRecord;
    throw error;
  } finally {
    agent?.close?.();
  }
}

async function defaultCursorSdkLoader() {
  return import("@cursor/sdk");
}

function cursorCreateOptions({ issueId, config, cwd }) {
  const options = {
    name: `${issueId} local runner`,
    model: { id: config.model },
    local: { cwd }
  };
  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;

  if (apiKey) {
    options.apiKey = apiKey;
  }

  return options;
}

function upsertCursorIssue(repository, project, state, issueId, clock) {
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
        cursor: project.runners?.cursor
      }
    }
  });
}

function upsertCursorWorkspace(repository, issueRecord, workspace, clock) {
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

function recordCursorEvent(repository, issueId, entityId, event) {
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

function runMetadata({ agentId, runId, prompt, config, cwd, dryRun, result, error }) {
  return {
    provider: "cursor-sdk",
    agentId,
    runId,
    model: config.model,
    prompt,
    cwd,
    configPath: config.resolvedConfigPath,
    configuredConfigPath: config.configPath,
    apiKeyEnv: config.apiKeyEnv,
    dryRun,
    result,
    error
  };
}

function summarizeCursorStreamEvent(event) {
  const type = typeof event?.type === "string" ? event.type : "message";

  if (type === "status") {
    return {
      type,
      message: event.message ? `Cursor status: ${event.status} - ${event.message}` : `Cursor status: ${event.status}`,
      summary: event.message
    };
  }

  if (type === "assistant") {
    const text = textFromContentBlocks(event.message?.content);
    return {
      type,
      message: text ? `Cursor assistant: ${truncate(text)}` : "Cursor assistant message",
      summary: text
    };
  }

  if (type === "user") {
    const text = textFromContentBlocks(event.message?.content);
    return {
      type,
      message: text ? `Cursor user prompt: ${truncate(text)}` : "Cursor user message",
      summary: undefined
    };
  }

  if (type === "tool_call") {
    return {
      type,
      message: `Cursor tool ${event.name ?? "unknown"} ${event.status ?? "updated"}`,
      summary: undefined
    };
  }

  if (type === "thinking") {
    return {
      type,
      message: event.text ? `Cursor thinking: ${truncate(event.text)}` : "Cursor thinking update",
      summary: undefined
    };
  }

  if (type === "task") {
    return {
      type,
      message: event.text ? `Cursor task: ${truncate(event.text)}` : `Cursor task ${event.status ?? "updated"}`,
      summary: event.text
    };
  }

  return {
    type,
    message: `Cursor ${type} event`,
    summary: undefined
  };
}

function summarizeRunResult(result, summaryParts) {
  if (typeof result?.result === "string" && result.result.trim().length > 0) {
    return truncate(result.result.trim(), 1000);
  }

  const summary = summaryParts.filter(Boolean).at(-1);
  if (summary) return truncate(summary, 1000);

  return result?.status ? `Cursor run ${normalizeRunStatus(result.status)}` : "Cursor run finished";
}

async function waitForRunResult(run) {
  if (typeof run?.supports === "function" && !run.supports("wait")) {
    return {
      id: run.id,
      status: normalizeRunStatus(run.status ?? "finished"),
      result: run.result,
      model: run.model,
      durationMs: run.durationMs,
      git: run.git
    };
  }

  if (typeof run?.wait === "function") {
    return run.wait();
  }

  return {
    id: run.id,
    status: normalizeRunStatus(run.status ?? "finished"),
    result: run.result,
    model: run.model,
    durationMs: run.durationMs,
    git: run.git
  };
}

function normalizeRunStatus(value) {
  const status = String(value ?? "running").toLowerCase();
  if (status === "finished" || status === "success" || status === "done") return "finished";
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (status === "error" || status === "failed" || status === "failure") return "error";
  return "running";
}

function resolveRunnerConfigPath(configPath, workspacePath) {
  if (configPath === "~") return os.homedir();
  if (configPath.startsWith("~/")) return path.join(os.homedir(), configPath.slice(2));
  if (path.isAbsolute(configPath)) return configPath;
  return path.join(workspacePath, configPath);
}

function textFromContentBlocks(content) {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return text || undefined;
}

function truncate(value, length = 220) {
  return value.length > length ? `${value.slice(0, length - 1)}...` : value;
}

function sanitizeIssueId(value) {
  if (typeof value !== "string" || !/^[a-z]+-\d+$/i.test(value.trim())) {
    throw new Error("issueId must look like AGE-361");
  }

  return value.trim().toUpperCase();
}

function sanitizePrompt(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("prompt must be a non-empty string.");
  }

  return value.trim();
}

function sanitizeModel(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("model must be a non-empty string.");
  }

  return value.trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
