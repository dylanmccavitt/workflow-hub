import { spawnSync } from "node:child_process";
import {
  createRegistryRepository,
  openRegistryDatabase
} from "./registry-db.mjs";
import {
  DEFAULT_LINEAR_CACHE_STALE_AFTER_MS,
  getCachedLinearIssue,
  linearIssueFromCachedRecord,
  syncLinearProjectIssues as defaultSyncLinearProjectIssues
} from "./linear-sync.mjs";
import {
  findWorkspace as defaultFindWorkspace,
  readProjectConfig as defaultReadProjectConfig
} from "./project-config.mjs";

export const LOCAL_API_VERSION = "0.1.0";

const ISSUE_ID_PATTERN = /^[a-z]+-\d+$/i;

export class LocalApiValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "LocalApiValidationError";
    this.code = "VALIDATION_ERROR";
    this.recoverable = false;
  }
}

export function normalizeIssueId(issueId) {
  if (typeof issueId !== "string" || !ISSUE_ID_PATTERN.test(issueId.trim())) {
    throw new LocalApiValidationError("issueId must look like AGE-349");
  }

  return issueId.trim().toUpperCase();
}

export function createLocalApiService(options = {}) {
  const readProjectConfig = options.readProjectConfig ?? defaultReadProjectConfig;
  const findWorkspace = options.findWorkspace ?? defaultFindWorkspace;
  const gitRunner = options.gitRunner ?? runGit;
  const clock = options.clock ?? (() => new Date());
  const linearCacheStaleAfterMs = options.linearCacheStaleAfterMs ?? DEFAULT_LINEAR_CACHE_STALE_AFTER_MS;
  const syncLinearProjectIssues = options.syncLinearProjectIssues ?? defaultSyncLinearProjectIssues;
  let registryRepository = options.registryRepository;

  function getRegistryRepository() {
    if (!registryRepository) {
      registryRepository = createRegistryRepository(openRegistryDatabase(options.registryDatabasePath), {
        clock
      });
    }

    return registryRepository;
  }

  return {
    version: LOCAL_API_VERSION,

    async getIssueState(inputIssueId) {
      const issueId = normalizeIssueId(inputIssueId);

      let registry;
      try {
        registry = readProjectConfig();
      } catch (error) {
        const issue = unavailableIssueState(
          issueId,
          unavailableAdapter(
            "linear",
            "Linear",
            "Linear issue sync is unavailable because project config could not be loaded.",
            "AGE-354"
          )
        );
        const projectConfigAdapter = unavailableAdapter(
          "project-config",
          "Project config",
          `Project config could not be loaded: ${errorMessage(error)}`
        );
        const workspaceAdapter = unavailableAdapter(
          "workspace",
          "Workspace resolver",
          "Workspace resolution is unavailable because project config could not be loaded."
        );

        return buildIssueResponse({
          issue,
          project: unavailableProjectState(projectConfigAdapter),
          workspace: unavailableWorkspaceState(issueId, workspaceAdapter),
          gitAdapter: notConfiguredAdapter(
            "git",
            "Git",
            "Git state was not read because project config is unavailable."
          ),
          projectConfigAdapter,
          workspaceAdapter
        });
      }

      const projectConfigAdapter = availableAdapter(
        "project-config",
        "Project config",
        `Loaded ${registry.projects.length} configured project(s).`
      );

      let workspaceMatch;
      try {
        workspaceMatch = findWorkspace(issueId, registry);
      } catch (error) {
        const workspaceAdapter = unavailableAdapter(
          "workspace",
          "Workspace resolver",
          `Workspace resolver failed: ${errorMessage(error)}`
        );
        const project = selectProjectForIssue(issueId, registry.projects);
        const issue = await buildIssueState(issueId, project, {
          clock,
          getRegistryRepository,
          linearCacheStaleAfterMs,
          syncLinearProjectIssues
        });

        return buildIssueResponse({
          issue,
          project: projectStateFromProject(project, projectConfigAdapter),
          workspace: unavailableWorkspaceState(issueId, workspaceAdapter),
          gitAdapter: notConfiguredAdapter(
            "git",
            "Git",
            "Git state was not read because workspace resolution failed."
          ),
          projectConfigAdapter,
          workspaceAdapter
        });
      }

      const project = workspaceMatch?.project ?? selectProjectForIssue(issueId, registry.projects);
      const issue = await buildIssueState(issueId, project, {
        clock,
        getRegistryRepository,
        linearCacheStaleAfterMs,
        syncLinearProjectIssues
      });
      const projectState = projectStateFromProject(project, projectConfigAdapter);
      const workspaceState = workspaceMatch
        ? workspaceStateFromMatch(issueId, workspaceMatch, gitRunner)
        : missingWorkspaceState(issueId);

      return buildIssueResponse({
        issue,
        project: projectState,
        workspace: workspaceState.workspace,
        gitAdapter: workspaceState.gitAdapter,
        projectConfigAdapter,
        workspaceAdapter: workspaceState.adapter
      });
    }
  };
}

function buildIssueResponse({
  issue,
  project,
  workspace,
  gitAdapter,
  projectConfigAdapter,
  workspaceAdapter
}) {
  const runnerStates = buildRunnerStates();
  const reviewStates = buildReviewStates(project);
  const pullRequestStates = buildPullRequestStates();

  return {
    apiVersion: LOCAL_API_VERSION,
    issue,
    project,
    workspace,
    runners: runnerStates,
    reviews: reviewStates,
    pullRequests: pullRequestStates,
    adapters: [
      projectConfigAdapter,
      workspaceAdapter ?? workspace.adapter,
      gitAdapter,
      issue.adapter,
      ...runnerStates.map((runner) => runner.adapter),
      ...reviewStates.map((review) => review.adapter),
      ...pullRequestStates.map((pullRequest) => pullRequest.adapter)
    ].filter(Boolean)
  };
}

async function buildIssueState(issueId, project, options) {
  if (!project) {
    return {
      issueId,
      source: "linear",
      status: "not-found",
      adapter: notFoundAdapter(
        "linear",
        "Linear",
        "No configured project could be matched to this issue."
      )
    };
  }

  let syncResult;
  let repository;
  try {
    repository = options.getRegistryRepository();
    syncResult = await options.syncLinearProjectIssues({
      project,
      repository,
      clock: options.clock,
      staleAfterMs: options.linearCacheStaleAfterMs
    });
  } catch (error) {
    syncResult = {
      status: "error",
      detail: `Linear sync failed: ${errorMessage(error)}`,
      error: errorMessage(error),
      staleAfterMs: options.linearCacheStaleAfterMs
    };
  }

  const cachedIssue = repository
    ? getCachedLinearIssue(repository, project.id, issueId)
    : undefined;
  const adapter = linearAdapterFromSyncResult(syncResult, cachedIssue);

  if (cachedIssue) {
    return {
      issueId,
      source: "linear",
      status: "available",
      adapter,
      linear: linearIssueFromCachedRecord(cachedIssue, {
        now: options.clock(),
        staleAfterMs: options.linearCacheStaleAfterMs,
        forceStale: syncResult.status !== "fresh",
        syncError: syncResult.error
      })
    };
  }

  return {
    issueId,
    source: "linear",
    status: syncResult.status === "fresh" ? "not-found" : adapter.status,
    adapter,
    cache: {
      status: syncResult.status === "fresh" ? "miss" : syncResult.status,
      stale: true,
      staleAfterMs: options.linearCacheStaleAfterMs,
      error: syncResult.error
    }
  };
}

function unavailableIssueState(issueId, adapter) {
  return {
    issueId,
    source: "linear",
    status: "unavailable",
    adapter
  };
}

function projectStateFromProject(project, adapter) {
  if (!project) {
    return {
      status: "not-found",
      adapter: notFoundAdapter(
        "project",
        "Project",
        "No configured project could be matched to this issue."
      )
    };
  }

  return {
    status: "available",
    projectId: project.id,
    displayName: project.displayName,
    canonicalPath: project.canonicalPath,
    canonicalBranch: project.canonicalBranch,
    linear: project.linear,
    iosConfigured: Boolean(project.ios),
    adapter
  };
}

function unavailableProjectState(adapter) {
  return {
    status: "unavailable",
    adapter
  };
}

function workspaceStateFromMatch(issueId, match, gitRunner) {
  const gitState = collectGitState(match.path, gitRunner);
  const adapter = availableAdapter(
    "workspace",
    "Workspace resolver",
    `Resolved ${issueId} to ${match.path}.`
  );

  return {
    adapter,
    gitAdapter: gitState.adapter,
    workspace: {
      issueId,
      status: "available",
      found: true,
      projectId: match.project.id,
      projectName: match.project.displayName,
      path: match.path,
      branch: gitState.branch,
      headSha: gitState.headSha,
      remote: gitState.remote,
      dirty: gitState.dirty,
      gitStatus: gitState.gitStatus,
      adapter
    }
  };
}

function missingWorkspaceState(issueId) {
  const adapter = notFoundAdapter(
    "workspace",
    "Workspace resolver",
    `No issue workspace was found for ${issueId}.`
  );

  return {
    adapter,
    gitAdapter: notConfiguredAdapter(
      "git",
      "Git",
      "Git state was not read because no workspace was resolved."
    ),
    workspace: {
      issueId,
      status: "not-found",
      found: false,
      adapter
    }
  };
}

function unavailableWorkspaceState(issueId, adapter) {
  return {
    issueId,
    status: "unavailable",
    found: false,
    adapter
  };
}

function buildRunnerStates() {
  return [
    {
      kind: "Symphony",
      role: "Workflow queue",
      status: "unavailable",
      detail: "Symphony queue/state discovery is planned but not implemented in this API slice.",
      adapter: unavailableAdapter(
        "runner:symphony",
        "Symphony runner",
        "Symphony adapter unavailable until AGE-356 wires queue and dispatch state.",
        "AGE-356"
      )
    },
    {
      kind: "Codex",
      role: "Local worker",
      status: "unavailable",
      detail: "Codex start/status/log controls stay behind a future explicit runner adapter.",
      adapter: unavailableAdapter(
        "runner:codex",
        "Codex runner",
        "Codex runner adapter unavailable until AGE-363 owns command, cwd, logs, and stop controls.",
        "AGE-363"
      )
    },
    {
      kind: "Cursor SDK",
      role: "Agent harness",
      status: "unavailable",
      detail: "Cursor local/cloud agent state is not connected yet.",
      adapter: unavailableAdapter(
        "runner:cursor",
        "Cursor SDK runner",
        "Cursor SDK runner adapter unavailable until AGE-361 wires agent status and artifacts.",
        "AGE-361"
      )
    }
  ];
}

function buildReviewStates(project) {
  const hasIosConfig = Boolean(project?.status === "available" && project.iosConfigured);
  const iosDetail = hasIosConfig
    ? "iOS review controls are intentionally explicit and remain adapter-backed."
    : "No iOS review configuration was available for the resolved project.";

  return [
    {
      target: "simulator",
      status: "unavailable",
      detail: iosDetail,
      adapter: unavailableAdapter(
        "review:simulator",
        "Simulator review",
        "Simulator review adapter unavailable until AGE-351 wires isolated DerivedData launch.",
        "AGE-351"
      )
    },
    {
      target: "device",
      status: "unavailable",
      detail: "Device review may open Xcode later because signing and device trust are local Apple state.",
      adapter: unavailableAdapter(
        "review:device",
        "Device review",
        "Device review adapter unavailable until AGE-352 owns Xcode/device launch.",
        "AGE-352"
      )
    }
  ];
}

function buildPullRequestStates() {
  return [
    {
      provider: "GitHub",
      status: "unavailable",
      detail: "GitHub PR and checks sync is not connected yet.",
      adapter: unavailableAdapter(
        "pr:github",
        "GitHub PR",
        "GitHub PR adapter unavailable until AGE-358 wires PR state and checks.",
        "AGE-358"
      )
    }
  ];
}

function linearAdapterFromSyncResult(syncResult, cachedIssue) {
  if (syncResult.status === "fresh") {
    return availableAdapter(
      "linear",
      "Linear",
      syncResult.detail ?? `Synced ${syncResult.issueCount ?? 0} Linear issue(s).`
    );
  }

  if (syncResult.status === "not-configured") {
    return notConfiguredAdapter(
      "linear",
      "Linear",
      cachedIssue
        ? `${syncResult.detail} Cached Linear issue data is available but stale.`
        : syncResult.detail
    );
  }

  return unavailableAdapter(
    "linear",
    "Linear",
    cachedIssue
      ? `${syncResult.detail} Showing stale cached Linear issue data.`
      : syncResult.detail,
    "AGE-354"
  );
}

function collectGitState(workspacePath, gitRunner) {
  const branch = gitRunner(["branch", "--show-current"], workspacePath);
  const headSha = gitRunner(["rev-parse", "--short", "HEAD"], workspacePath);
  const remote = gitRunner(["remote", "get-url", "origin"], workspacePath);
  const status = gitRunner(["status", "--short", "--branch"], workspacePath);

  if (!branch.ok && !headSha.ok && !status.ok) {
    return {
      adapter: unavailableAdapter(
        "git",
        "Git",
        `Git state unavailable for ${workspacePath}: ${branch.error ?? headSha.error ?? status.error}`
      ),
      dirty: false,
      gitStatus: []
    };
  }

  const statusLines = status.ok ? status.stdout.split("\n").filter(Boolean) : [];

  return {
    adapter: availableAdapter("git", "Git", "Read branch, HEAD, remote, and short status from the workspace."),
    branch: branch.ok ? branch.stdout : undefined,
    headSha: headSha.ok ? headSha.stdout : undefined,
    remote: remote.ok ? remote.stdout : undefined,
    dirty: statusLines.slice(1).length > 0,
    gitStatus: statusLines
  };
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `git exited with status ${result.status}`).trim()
    };
  }

  return {
    ok: true,
    stdout: result.stdout.trim()
  };
}

function selectProjectForIssue(issueId, projects = []) {
  const teamKey = issueId.split("-")[0];
  const matchingProjects = projects.filter((project) => project.linear?.teamKey === teamKey);

  if (matchingProjects.length === 1) return matchingProjects[0];
  return matchingProjects.find((project) => project.id === "workflow-hub") ?? matchingProjects[0] ?? projects[0];
}

function availableAdapter(id, label, detail) {
  return adapterState(id, label, "available", detail, false);
}

function unavailableAdapter(id, label, detail, ownerIssue) {
  return adapterState(id, label, "unavailable", detail, true, ownerIssue);
}

function notConfiguredAdapter(id, label, detail) {
  return adapterState(id, label, "not-configured", detail, true);
}

function notFoundAdapter(id, label, detail) {
  return adapterState(id, label, "not-found", detail, true);
}

function adapterState(id, label, status, detail, recoverable, ownerIssue) {
  return {
    id,
    label,
    status,
    detail,
    recoverable,
    ownerIssue
  };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
