import fs from "node:fs";
import path from "node:path";
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
  LINEAR_STATUS_ACTIONS,
  applyLinearStatusAction as defaultApplyLinearStatusAction,
  getLinearStatusAction
} from "./linear-writes.mjs";
import {
  findWorkspace as defaultFindWorkspace,
  readProjectConfig as defaultReadProjectConfig,
  renderIssuePath
} from "./project-config.mjs";
import {
  readSymphonyState as defaultReadSymphonyState
} from "./symphony-state.mjs";
import {
  readGitHubPullRequestState as defaultReadGitHubPullRequestState
} from "./github-pr-state.mjs";
import {
  readGraphiteStackState as defaultReadGraphiteStackState
} from "./graphite-stack-state.mjs";
import {
  buildReviewFixPromptDraft
} from "./review-fix-prompt.mjs";
import {
  buildRunnerTimeline,
  normalizeRunnerState
} from "./runner-timeline.mjs";
import {
  CURSOR_RUNNER_KIND,
  cursorConfigForProject,
  startCursorLocalRun as defaultStartCursorLocalRun
} from "./cursor-runner.mjs";
import {
  CODEX_RUNNER_KIND,
  codexConfigForProject,
  startCodexLocalRun as defaultStartCodexLocalRun
} from "./codex-runner.mjs";

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
  const applyLinearStatusAction = options.applyLinearStatusAction ?? defaultApplyLinearStatusAction;
  const readSymphonyState = options.readSymphonyState ?? defaultReadSymphonyState;
  const readGitHubPullRequestState = options.readGitHubPullRequestState ?? defaultReadGitHubPullRequestState;
  const readGraphiteStackState = options.readGraphiteStackState ?? defaultReadGraphiteStackState;
  const startCursorLocalRun = options.startCursorLocalRun ?? defaultStartCursorLocalRun;
  const startCodexLocalRun = options.startCodexLocalRun ?? defaultStartCodexLocalRun;
  const cursorSdkLoader = options.cursorSdkLoader;
  const codexProcessRunner = options.codexProcessRunner;
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

    async listIssues(input = {}) {
      const requestedProjectId = sanitizeOptionalString(input?.projectId, "projectId") ?? "workflow-hub";

      let registry;
      try {
        registry = readProjectConfig();
      } catch (error) {
        const projectConfigAdapter = unavailableAdapter(
          "project-config",
          "Project config",
          `Project config could not be loaded: ${errorMessage(error)}`
        );
        const linearAdapter = unavailableAdapter(
          "linear",
          "Linear",
          "Linear issue list is unavailable because project config could not be loaded.",
          "AGE-354"
        );

        return {
          apiVersion: LOCAL_API_VERSION,
          generatedAt: clock().toISOString(),
          project: unavailableProjectState(projectConfigAdapter),
          cache: {
            status: "error",
            stale: true,
            staleAfterMs: linearCacheStaleAfterMs,
            error: errorMessage(error)
          },
          adapter: linearAdapter,
          issues: [],
          adapters: [projectConfigAdapter, linearAdapter]
        };
      }

      const projectConfigAdapter = availableAdapter(
        "project-config",
        "Project config",
        `Loaded ${registry.projects.length} configured project(s).`
      );
      const project = registry.projects.find((candidate) => candidate.id === requestedProjectId);

      if (!project) {
        const projectAdapter = notFoundAdapter(
          "project",
          "Project",
          `No configured project found for ${requestedProjectId}.`
        );
        const linearAdapter = notFoundAdapter(
          "linear",
          "Linear",
          `No configured project found for ${requestedProjectId}; issue list sync cannot run.`
        );

        return {
          apiVersion: LOCAL_API_VERSION,
          generatedAt: clock().toISOString(),
          project: {
            status: "not-found",
            adapter: projectAdapter
          },
          cache: {
            status: "miss",
            stale: true,
            staleAfterMs: linearCacheStaleAfterMs
          },
          adapter: linearAdapter,
          issues: [],
          adapters: [projectConfigAdapter, projectAdapter, linearAdapter]
        };
      }

      const repository = getRegistryRepository();
      let syncResult;
      try {
        syncResult = await syncLinearProjectIssues({
          project,
          repository,
          clock,
          staleAfterMs: linearCacheStaleAfterMs
        });
      } catch (error) {
        syncResult = {
          status: "error",
          detail: `Linear sync failed: ${errorMessage(error)}`,
          error: errorMessage(error),
          staleAfterMs: linearCacheStaleAfterMs
        };
      }

      const projectRecord = repository.getProject(project.id);
      const cachedIssues = repository.listProjectIssues(project.id);
      const now = clock();
      const issues = cachedIssues.map((record) => linearIssueFromCachedRecord(record, {
        now,
        staleAfterMs: linearCacheStaleAfterMs,
        forceStale: syncResult.status !== "fresh",
        syncError: syncResult.error
      }));
      const linearAdapter = linearAdapterFromSyncResult(syncResult, cachedIssues[0]);

      return {
        apiVersion: LOCAL_API_VERSION,
        generatedAt: now.toISOString(),
        project: projectStateFromProject(project, projectConfigAdapter),
        cache: projectCacheStateFromSync(syncResult, projectRecord, {
          now,
          staleAfterMs: linearCacheStaleAfterMs
        }),
        adapter: linearAdapter,
        issues,
        adapters: [projectConfigAdapter, linearAdapter]
      };
    },

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

        const workspace = unavailableWorkspaceState(issueId, workspaceAdapter);
        const symphonyState = await readSymphonyState({ issueId, issue, workspace, clock });
        const pullRequestStates = readPullRequestProviderStates({
          issue,
          workspace,
          clock,
          readGitHubPullRequestState,
          readGraphiteStackState
        });

        return buildIssueResponse({
          issue,
          project: unavailableProjectState(projectConfigAdapter),
          workspace,
          gitAdapter: notConfiguredAdapter(
            "git",
            "Git",
            "Git state was not read because project config is unavailable."
          ),
          projectConfigAdapter,
          workspaceAdapter,
          symphonyState,
          pullRequestStates
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

        const workspace = unavailableWorkspaceState(issueId, workspaceAdapter);
        const symphonyState = await readSymphonyState({ issueId, issue, workspace, clock });
        const pullRequestStates = readPullRequestProviderStates({
          issue,
          workspace,
          clock,
          readGitHubPullRequestState,
          readGraphiteStackState
        });

        return buildIssueResponse({
          issue,
          project: projectStateFromProject(project, projectConfigAdapter),
          workspace,
          gitAdapter: notConfiguredAdapter(
            "git",
            "Git",
            "Git state was not read because workspace resolution failed."
          ),
          projectConfigAdapter,
          workspaceAdapter,
          symphonyState,
          pullRequestStates
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
      const symphonyState = await readSymphonyState({
        issueId,
        issue,
        workspace: workspaceState.workspace,
        clock
      });
      const pullRequestStates = readPullRequestProviderStates({
        issue,
        workspace: workspaceState.workspace,
        clock,
        readGitHubPullRequestState,
        readGraphiteStackState
      });

      return buildIssueResponse({
        issue,
        project: projectState,
        workspace: workspaceState.workspace,
        gitAdapter: workspaceState.gitAdapter,
        projectConfigAdapter,
        workspaceAdapter: workspaceState.adapter,
        symphonyState,
        pullRequestStates
      });
    },

    async applyIssueAction(input) {
      const issueId = normalizeIssueId(input?.issueId);
      const action = getLinearStatusAction(input?.actionId);
      const confirmed = input?.confirmed === true;
      const note = sanitizeOptionalNote(input?.note);
      const registry = readProjectConfig();
      const project = selectProjectForIssue(issueId, registry.projects);

      if (!project) {
        throw new LocalApiValidationError("No configured project could be matched to this issue.");
      }

      const repository = getRegistryRepository();

      try {
        const result = await applyLinearStatusAction({
          issueId,
          actionId: action.id,
          confirmed,
          note,
          clock
        });
        const issueRecord = upsertLinearWriteIssue(repository, project, result, {
          clock,
          linearCacheStaleAfterMs
        });
        const event = repository.recordEvent({
          issueId: issueRecord.id,
          entityType: "linear",
          entityId: result.issue.linearId,
          type: "linear.status.updated",
          message: `${issueId} moved to ${result.status.name}`,
          payload: {
            actionId: action.id,
            actionLabel: action.label,
            previousStatus: result.previousStatus?.name,
            nextStatus: result.status.name,
            workpadOperation: result.workpad.operation,
            workpadCommentId: result.workpad.commentId
          }
        });

        await refreshLinearCacheAfterWrite({
          project,
          repository,
          clock,
          linearCacheStaleAfterMs,
          syncLinearProjectIssues
        });

        return {
          ...result,
          event
        };
      } catch (error) {
        const cachedIssue = repository.getIssueByIdentifier(project.id, issueId);
        if (cachedIssue) {
          repository.recordEvent({
            issueId: cachedIssue.id,
            entityType: "linear",
            entityId: cachedIssue.metadata?.linearId ?? cachedIssue.id,
            type: "linear.write.failed",
            message: `${issueId} Linear write failed`,
            payload: {
              actionId: action.id,
              actionLabel: action.label,
              error: errorMessage(error)
            }
          });
        }

        throw error;
      }
    },

    async draftReviewFixPrompt(input) {
      const issueId = normalizeIssueId(input?.issueId);
      const state = await this.getIssueState(issueId);

      return buildReviewFixPromptDraft(state, {
        selectedReviewCommentIds: sanitizeOptionalStringArray(
          input?.selectedReviewCommentIds,
          "selectedReviewCommentIds"
        ),
        selectedCheckIds: sanitizeOptionalStringArray(input?.selectedCheckIds, "selectedCheckIds"),
        ownedPaths: sanitizeOptionalStringArray(input?.ownedPaths, "ownedPaths"),
        generatedAt: clock().toISOString()
      });
    },

    async saveReviewFixPrompt(input) {
      const issueId = normalizeIssueId(input?.issueId);
      const prompt = sanitizeRequiredPrompt(input?.prompt);
      const selectedReviewCommentIds = sanitizeOptionalStringArray(
        input?.selectedReviewCommentIds,
        "selectedReviewCommentIds"
      );
      const selectedCheckIds = sanitizeOptionalStringArray(input?.selectedCheckIds, "selectedCheckIds");
      const ownedPaths = sanitizeOptionalStringArray(input?.ownedPaths, "ownedPaths");
      const state = await this.getIssueState(issueId);
      const draft = buildReviewFixPromptDraft(state, {
        selectedReviewCommentIds,
        selectedCheckIds,
        ownedPaths,
        generatedAt: clock().toISOString()
      });
      const registry = readProjectConfig();
      const project = selectProjectForIssue(issueId, registry.projects);

      if (!project) {
        throw new LocalApiValidationError("No configured project could be matched to this issue.");
      }

      const repository = getRegistryRepository();
      const issueRecord = upsertReviewPromptIssue(repository, project, state, {
        clock,
        linearCacheStaleAfterMs
      });
      const event = repository.recordEvent({
        issueId: issueRecord.id,
        entityType: "review",
        entityId: `${issueId}:fix-prompt`,
        type: "review.fix_prompt.generated",
        message: `${issueId} fix prompt saved`,
        payload: {
          prompt,
          generatedPrompt: draft.prompt,
          edited: prompt !== draft.prompt,
          selectedReviewCommentIds: draft.selectedReviewCommentIds,
          selectedCheckIds: draft.selectedCheckIds,
          ownedPaths: draft.ownedPaths,
          branch: draft.branch,
          worktree: draft.worktree,
          headSha: draft.headSha,
          pullRequest: draft.pullRequest
        }
      });

      return {
        ...draft,
        prompt,
        generatedPrompt: draft.prompt,
        event
      };
    },

    async startCursorRun(input) {
      const issueId = normalizeIssueId(input?.issueId);
      const prompt = sanitizeRequiredPrompt(input?.prompt);
      const model = sanitizeOptionalString(input?.model, "model");
      const dryRun = input?.dryRun === true;
      const registry = readProjectConfig();
      const project = selectProjectForIssue(issueId, registry.projects);

      if (!project) {
        throw new LocalApiValidationError("No configured project could be matched to this issue.");
      }

      const workspaceMatch = findWorkspace(issueId, registry);
      if (!workspaceMatch) {
        throw new LocalApiValidationError(`No issue workspace was found for ${issueId}.`);
      }

      const state = await this.getIssueState(issueId);
      const repository = getRegistryRepository();

      return startCursorLocalRun({
        issueId,
        prompt,
        model,
        dryRun,
        project,
        state,
        workspace: state.workspace,
        repository,
        cursorSdkLoader,
        clock
      });
    },

    async startCodexRun(input) {
      const issueId = normalizeIssueId(input?.issueId);
      const prompt = sanitizeRequiredPrompt(input?.prompt);
      const command = sanitizeOptionalString(input?.command, "command");
      const model = sanitizeOptionalString(input?.model, "model");
      const profile = sanitizeOptionalString(input?.profile, "profile");
      const sandbox = sanitizeOptionalString(input?.sandbox, "sandbox");
      const approvalPolicy = sanitizeOptionalString(input?.approvalPolicy, "approvalPolicy");
      const dryRun = input?.dryRun === true;
      const registry = readProjectConfig();
      const project = selectProjectForIssue(issueId, registry.projects);

      if (!project) {
        throw new LocalApiValidationError("No configured project could be matched to this issue.");
      }

      const workspaceMatch = findWorkspace(issueId, registry);
      if (!workspaceMatch) {
        throw new LocalApiValidationError(`No issue workspace was found for ${issueId}.`);
      }

      const state = await this.getIssueState(issueId);
      const repository = getRegistryRepository();

      return startCodexLocalRun({
        issueId,
        prompt,
        command,
        model,
        profile,
        sandbox,
        approvalPolicy,
        dryRun,
        project,
        state,
        workspace: state.workspace,
        repository,
        codexProcessRunner,
        clock
      });
    },

    async dispatchReadyIssue(input) {
      const issueId = normalizeIssueId(input?.issueId);
      const runnerKind = normalizeDispatchRunner(input?.runnerKind);
      const userPrompt = sanitizeOptionalNote(input?.prompt);
      const confirmed = input?.confirmed === true;
      const dryRun = input?.dryRun === true;
      const command = sanitizeOptionalString(input?.command, "command");
      const model = sanitizeOptionalString(input?.model, "model");
      const profile = sanitizeOptionalString(input?.profile, "profile");
      const sandbox = sanitizeOptionalString(input?.sandbox, "sandbox");
      const approvalPolicy = sanitizeOptionalString(input?.approvalPolicy, "approvalPolicy");
      const registry = readProjectConfig();
      const project = selectProjectForIssue(issueId, registry.projects);

      if (!project) {
        throw new LocalApiValidationError("No configured project could be matched to this issue.");
      }

      let state = await this.getIssueState(issueId);
      assertDispatchableLinearStatus(state);

      const workspaceResult = ensureDispatchWorkspace({
        issueId,
        issue: state.issue.linear,
        project,
        registry,
        findWorkspace,
        gitRunner,
        clock
      });

      state = await this.getIssueState(issueId);
      assertNoActiveWritableRunner({
        issueId,
        workspace: state.workspace,
        symphonyState: state.symphony,
        repository: getRegistryRepository()
      });

      let statusAction;
      if (!isInProgressStatus(state.issue.linear?.status)) {
        if (!confirmed) {
          throw new LocalApiValidationError("Confirmation is required before moving the issue to In Progress and dispatching a runner.");
        }

        statusAction = await this.applyIssueAction({
          issueId,
          actionId: "in-progress",
          confirmed: true,
          note: dispatchStatusNote({ runnerKind, dryRun, userPrompt })
        });
        state = await this.getIssueState(issueId);

        assertNoActiveWritableRunner({
          issueId,
          workspace: state.workspace,
          symphonyState: state.symphony,
          repository: getRegistryRepository()
        });
      } else if (!confirmed) {
        throw new LocalApiValidationError("Confirmation is required before dispatching a writable runner.");
      }

      const dispatchPrompt = buildDispatchPrompt({
        issueId,
        runnerKind,
        state,
        workspace: state.workspace,
        userPrompt
      });

      const runner = runnerKind === "codex"
        ? await this.startCodexRun({
            issueId,
            prompt: dispatchPrompt,
            command,
            model,
            profile,
            sandbox,
            approvalPolicy,
            dryRun
          })
        : await this.startCursorRun({
            issueId,
            prompt: dispatchPrompt,
            model,
            dryRun
          });

      const dryRunEvent = dryRun
        ? recordDispatchDryRunEvent({
            repository: getRegistryRepository(),
            project,
            state,
            runnerKind,
            runner,
            dispatchPrompt,
            clock
          })
        : undefined;

      return {
        issueId,
        runnerKind: runnerKind === "codex" ? CODEX_RUNNER_KIND : CURSOR_RUNNER_KIND,
        dryRun,
        prompt: dispatchPrompt,
        workspace: state.workspace,
        workspaceOperation: workspaceResult.operation,
        statusAction,
        runner,
        event: dryRunEvent
      };
    }
  };
}

const DISPATCHABLE_LINEAR_STATUSES = new Set(["ready", "todo", "in-progress"]);
const ACTIVE_RUN_STATES = new Set(["queued", "starting", "running", "blocked", "cancelling"]);

function normalizeDispatchRunner(value) {
  const normalized = String(value ?? "codex").trim().toLowerCase().replace(/[\s_]+/g, "-");

  if (["codex", "codex-cli"].includes(normalized)) return "codex";
  if (["cursor", "cursor-sdk"].includes(normalized)) return "cursor";

  throw new LocalApiValidationError("runnerKind must be codex or cursor.");
}

function assertDispatchableLinearStatus(state) {
  const status = state?.issue?.linear?.status;
  const normalized = normalizeComparableStatus(status);

  if (!DISPATCHABLE_LINEAR_STATUSES.has(normalized)) {
    throw new LocalApiValidationError(
      `Only Ready, Todo, or In Progress issues can be dispatched. ${state?.issue?.issueId ?? "Issue"} is ${status ?? "unknown"}.`
    );
  }
}

function isInProgressStatus(status) {
  return normalizeComparableStatus(status) === "in-progress";
}

function normalizeComparableStatus(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function ensureDispatchWorkspace({
  issueId,
  issue,
  project,
  registry,
  findWorkspace,
  gitRunner,
  clock
}) {
  const existing = findWorkspace(issueId, registry);
  const desiredBranch = renderIssueBranch(project.branchTemplate, issueId, issue?.title);

  if (existing) {
    const operation = ensureExistingWorkspaceBranch({
      issueId,
      match: existing,
      desiredBranch,
      project,
      gitRunner
    });

    return {
      operation,
      path: existing.path,
      branch: desiredBranch
    };
  }

  return createIssueWorktree({
    issueId,
    issue,
    project,
    registry,
    desiredBranch,
    findWorkspace,
    gitRunner,
    clock
  });
}

function ensureExistingWorkspaceBranch({ issueId, match, desiredBranch, project, gitRunner }) {
  const branch = gitRunner(["branch", "--show-current"], match.path);
  if (!branch.ok || !branch.stdout || branch.stdout === desiredBranch) {
    return "resolved";
  }

  if (branch.stdout !== project.canonicalBranch) {
    return "resolved";
  }

  const status = gitRunner(["status", "--short"], match.path);
  if (status.ok && status.stdout.trim().length > 0) {
    throw new LocalApiValidationError(
      `${issueId} workspace is on ${project.canonicalBranch} with local changes; refusing to switch branches before dispatch.`
    );
  }

  runGitChecked(["fetch", "origin"], project.canonicalPath, `fetch ${project.displayName} before dispatch`, gitRunner);
  const baseRef = preferredBaseRef(project, match.path, gitRunner);
  const switchResult = branchExists(desiredBranch, match.path, gitRunner)
    ? gitRunner(["switch", desiredBranch], match.path)
    : gitRunner(["switch", "-c", desiredBranch, baseRef], match.path);

  if (!switchResult.ok) {
    throw new LocalApiValidationError(
      `Failed to switch ${issueId} workspace to ${desiredBranch}: ${switchResult.error}`
    );
  }

  return "branched";
}

function createIssueWorktree({
  issueId,
  issue,
  project,
  registry,
  desiredBranch,
  findWorkspace,
  gitRunner
}) {
  const root = project.workspaceRoots?.[0];
  if (!root) {
    throw new LocalApiValidationError(`No issue worktree root is configured for ${project.displayName}.`);
  }

  const workspacePath = path.join(root, renderIssuePath(project.issuePathTemplate ?? "{issueId}", issueId));
  if (fs.existsSync(workspacePath)) {
    throw new LocalApiValidationError(
      `${workspacePath} already exists but was not resolved as the ${issueId} worktree.`
    );
  }

  fs.mkdirSync(root, { recursive: true });
  runGitChecked(["fetch", "origin"], project.canonicalPath, `fetch ${project.displayName} before dispatch`, gitRunner);

  const baseRef = preferredBaseRef(project, project.canonicalPath, gitRunner);
  const args = branchExists(desiredBranch, project.canonicalPath, gitRunner)
    ? ["worktree", "add", workspacePath, desiredBranch]
    : ["worktree", "add", "-b", desiredBranch, workspacePath, baseRef];
  runGitChecked(args, project.canonicalPath, `create ${issueId} worktree`, gitRunner);

  const resolved = findWorkspace(issueId, registry);
  return {
    operation: "created",
    path: resolved?.path ?? workspacePath,
    branch: desiredBranch
  };
}

function preferredBaseRef(project, cwd, gitRunner) {
  const remoteRef = `origin/${project.canonicalBranch}`;
  if (refExists(`refs/remotes/${remoteRef}`, cwd, gitRunner)) return remoteRef;
  return project.canonicalBranch;
}

function branchExists(branchName, cwd, gitRunner) {
  return refExists(`refs/heads/${branchName}`, cwd, gitRunner);
}

function refExists(refName, cwd, gitRunner) {
  const result = gitRunner(["show-ref", "--verify", "--quiet", refName], cwd);
  return result.ok;
}

function runGitChecked(args, cwd, label, gitRunner) {
  const result = gitRunner(args, cwd);
  if (!result.ok) {
    throw new LocalApiValidationError(`${label} failed: ${result.error}`);
  }
  return result;
}

function renderIssueBranch(template, issueId, title) {
  const issueIdLower = issueId.toLowerCase();
  const slug = slugForBranch(title ?? issueId);
  return (template ?? "feat/{issueIdLower}-{slug}")
    .replaceAll("{issueId}", issueId)
    .replaceAll("{issueIdLower}", issueIdLower)
    .replaceAll("{slug}", slug);
}

function slugForBranch(value) {
  const slug = String(value ?? "")
    .replace(/\[[^\]]+\]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");

  return slug || "issue-work";
}

function assertNoActiveWritableRunner({ issueId, workspace, symphonyState, repository }) {
  const workspacePath = workspace?.path;
  if (!workspacePath) return;

  const activeSymphonyIssue = activeSymphonyIssueForWorkspace(symphonyState, workspacePath);
  if (activeSymphonyIssue) {
    throw new LocalApiValidationError(
      `Refusing to dispatch ${issueId}; Symphony already has ${activeSymphonyIssue.identifier} active for ${workspacePath}.`
    );
  }

  const workspaceRecords = repository.listWorkspacesByPath?.(workspacePath) ?? [];
  for (const workspaceRecord of workspaceRecords) {
    const runs = repository.listWorkspaceRuns?.(workspaceRecord.id) ?? [];
    const activeRun = runs.find(isActiveWritableRun);
    if (activeRun) {
      throw new LocalApiValidationError(
        `Refusing to dispatch ${issueId}; ${activeRun.runnerKind} run ${activeRun.id} is already active for ${workspacePath}.`
      );
    }
  }
}

function activeSymphonyIssueForWorkspace(symphonyState, workspacePath) {
  if (!symphonyState || symphonyState.source !== "endpoint") return undefined;
  const issues = [
    symphonyState.selectedIssue,
    ...(Array.isArray(symphonyState.issues) ? symphonyState.issues : [])
  ].filter(Boolean);

  return issues.find((issue) => {
    if (!workspacePathsEqual(issue.workspacePath, workspacePath)) return false;
    return ["active", "queue"].includes(String(issue.normalizedState ?? "").toLowerCase());
  });
}

function workspacePathsEqual(left, right) {
  if (!left || !right) return false;
  return path.resolve(left) === path.resolve(right);
}

function isActiveWritableRun(run) {
  const normalized = normalizeRunnerState(run?.status);
  if (!ACTIVE_RUN_STATES.has(normalized)) return false;

  if (run.runnerKind === CODEX_RUNNER_KIND) {
    const boundary = run.metadata?.permissionBoundary;
    const sandbox = boundary && typeof boundary === "object" ? boundary.sandbox : run.metadata?.config?.sandbox;
    return sandbox !== "read-only";
  }

  return run.runnerKind === CURSOR_RUNNER_KIND || run.runnerKind === "Symphony" || !run.runnerKind;
}

function dispatchStatusNote({ runnerKind, dryRun, userPrompt }) {
  const mode = dryRun ? "dry-run " : "";
  const promptNote = userPrompt ? ` Dispatch note: ${userPrompt}` : "";
  return `Workflow Hub ${mode}dispatch requested for ${runnerKind === "codex" ? "Codex" : "Cursor SDK"}.${promptNote}`;
}

function buildDispatchPrompt({ issueId, runnerKind, state, workspace, userPrompt }) {
  const linear = state.issue.linear;
  const workpad = linear?.codexWorkpad?.body?.trim();
  const lines = [
    `You are working on Linear issue ${issueId}.`,
    "",
    "Issue context:",
    `- Title: ${linear?.title ?? issueId}`,
    `- URL: ${linear?.url ?? "Unknown"}`,
    `- Status: ${linear?.status ?? "Unknown"}`,
    `- Runner: ${runnerKind === "codex" ? "Codex" : "Cursor SDK"}`,
    `- Worktree: ${workspace?.path ?? "Unresolved"}`,
    `- Branch: ${workspace?.branch ?? "Unknown"}`,
    "",
    "Execution rules:",
    "- Work only in the resolved issue worktree.",
    "- Preserve unrelated local changes.",
    "- Use the Codex Workpad as the handoff source and keep it current before handing off.",
    "- Run the smallest checks that prove the changed surface.",
    "",
    userPrompt ? "Dispatch note:" : undefined,
    userPrompt,
    userPrompt ? "" : undefined,
    workpad ? "Codex Workpad:" : "Codex Workpad: not found.",
    workpad
  ].filter((line) => line !== undefined);

  return lines.join("\n").trim();
}

function recordDispatchDryRunEvent({ repository, project, state, runnerKind, runner, dispatchPrompt, clock }) {
  const issueRecord = upsertDispatchIssue(repository, project, state, clock);
  const workspaceRecord = upsertDispatchWorkspace(repository, issueRecord, state.workspace, clock);
  const runnerLabel = runnerKind === "codex" ? CODEX_RUNNER_KIND : CURSOR_RUNNER_KIND;
  const runnerKey = runnerKind === "codex" ? "codex" : "cursor";
  const runId = `${runnerKey}-dispatch-dry-run-${issueRecord.identifier.toLowerCase()}-${clock().getTime()}`;

  return repository.recordEvent({
    issueId: issueRecord.id,
    entityType: "run",
    entityId: runId,
    type: `${runnerKey}.run.ready`,
    message: `${issueRecord.identifier} ${runnerLabel} dispatch ready`,
    payload: {
      runId,
      runnerKind: runnerLabel,
      status: "ready",
      dryRun: true,
      prompt: dispatchPrompt,
      cwd: runner.cwd,
      workspaceId: workspaceRecord.id,
      command: runner.command,
      model: runner.model,
      logPath: runner.logPath,
      summaryPath: runner.summaryPath,
      permissionBoundary: runner.permissionBoundary
    },
    createdAt: clock().toISOString()
  });
}

function upsertDispatchIssue(repository, project, state, clock) {
  const linearIssue = state.issue.linear;
  const existingIssue = repository.getIssueByIdentifier(project.id, state.issue.issueId);
  const writtenAt = clock().toISOString();

  repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: project.linear?.projectId,
    metadata: {
      linear: {
        teamKey: project.linear?.teamKey,
        projectId: project.linear?.projectId,
        projectSlug: project.linear?.projectSlug
      }
    }
  });

  return repository.upsertIssue({
    id: existingIssue?.id ?? linearIssue?.linearId ?? `${project.id}-${state.issue.issueId}`,
    projectId: project.id,
    identifier: state.issue.issueId,
    title: linearIssue?.title ?? state.issue.issueId,
    status: linearIssue?.status ?? state.issue.status,
    linearUrl: linearIssue?.url,
    priority: linearIssue?.priority,
    metadata: {
      ...(existingIssue?.metadata ?? {}),
      source: "linear",
      linearId: linearIssue?.linearId,
      updatedAt: linearIssue?.updatedAt,
      statusType: linearIssue?.statusType,
      priorityLabel: linearIssue?.priorityLabel,
      codexWorkpad: linearIssue?.codexWorkpad,
      linearSync: {
        ...(existingIssue?.metadata?.linearSync ?? {}),
        status: "fresh",
        fetchedAt: writtenAt
      }
    }
  });
}

function upsertDispatchWorkspace(repository, issueRecord, workspace, clock) {
  const existingWorkspace = repository
    .listWorkspacesByPath?.(workspace.path)
    .find((candidate) => candidate.issueId === issueRecord.id);

  return repository.upsertWorkspace({
    id: existingWorkspace?.id ?? `${issueRecord.id}:workspace`,
    issueId: issueRecord.id,
    path: workspace.path,
    branch: workspace.branch,
    headSha: workspace.headSha,
    dirty: Boolean(workspace.dirty),
    metadata: {
      ...(existingWorkspace?.metadata ?? {}),
      projectId: workspace.projectId,
      projectName: workspace.projectName,
      remote: workspace.remote,
      gitStatus: workspace.gitStatus,
      touchedAt: clock().toISOString()
    }
  });
}

function buildIssueResponse({
  issue,
  project,
  workspace,
  gitAdapter,
  projectConfigAdapter,
  workspaceAdapter,
  symphonyState,
  pullRequestStates
}) {
  const runnerStates = buildRunnerStates({ symphonyState, issue, project, workspace });
  const reviewStates = buildReviewStates(project);
  const normalizedPullRequestStates = buildPullRequestStates(pullRequestStates);
  const runTimeline = buildRunnerTimeline({ issue, symphonyState });

  return {
    apiVersion: LOCAL_API_VERSION,
    issue,
    project,
    workspace,
    symphony: symphonyState,
    runTimeline,
    linearStatusActions: LINEAR_STATUS_ACTIONS,
    runners: runnerStates,
    reviews: reviewStates,
    pullRequests: normalizedPullRequestStates,
    adapters: [
      projectConfigAdapter,
      workspaceAdapter ?? workspace.adapter,
      gitAdapter,
      issue.adapter,
      ...runnerStates.map((runner) => runner.adapter),
      ...reviewStates.map((review) => review.adapter),
      ...normalizedPullRequestStates.map((pullRequest) => pullRequest.adapter)
    ].filter(Boolean)
  };
}

function projectCacheStateFromSync(syncResult, projectRecord, options) {
  const sync = projectRecord?.metadata?.linearSync ?? {};
  const staleAfterMs = options.staleAfterMs ?? syncResult.staleAfterMs;
  const fetchedAt = syncResult.fetchedAt ?? sync.fetchedAt;
  const ageMs = cacheAgeSince(fetchedAt, options.now);
  const status = syncResult.status === "fresh"
    ? "fresh"
    : syncResult.status === "not-configured"
      ? "not-configured"
      : syncResult.status === "error"
        ? "error"
        : "stale";
  const stale = status !== "fresh"
    || ageMs === undefined
    || (typeof staleAfterMs === "number" && ageMs > staleAfterMs);

  return {
    status,
    stale,
    fetchedAt,
    ageMs,
    staleAfterMs,
    error: status === "fresh" ? undefined : syncResult.error ?? sync.error
  };
}

function cacheAgeSince(timestamp, now) {
  if (!timestamp) return undefined;
  const parsed = Date.parse(timestamp);
  if (Number.isNaN(parsed)) return undefined;
  return Math.max(0, now.getTime() - parsed);
}

function readPullRequestProviderStates({
  issue,
  workspace,
  clock,
  readGitHubPullRequestState,
  readGraphiteStackState
}) {
  const githubPullRequestState = readGitHubPullRequestState({ issue, workspace, clock });
  const graphiteStackState = readGraphiteStackState({
    issue,
    workspace,
    githubPullRequestState,
    clock
  });

  return [githubPullRequestState, graphiteStackState];
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
      }),
      events: repository.listIssueEvents(cachedIssue.id),
      runs: repository.listIssueRuns(cachedIssue.id)
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
    runners: project.runners,
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

function buildRunnerStates({ symphonyState, issue, project, workspace }) {
  return [
    {
      kind: "Symphony",
      role: "Workflow queue",
      status: symphonyState?.status ?? "unavailable",
      detail: symphonyRunnerDetail(symphonyState),
      adapter: symphonyState?.adapter ?? unavailableAdapter(
        "runner:symphony",
        "Symphony runner",
        "Symphony queue/state discovery is unavailable.",
        "AGE-356"
      )
    },
    buildCodexRunnerState({ issue, project, workspace }),
    buildCursorRunnerState({ issue, project, workspace })
  ];
}

function buildCodexRunnerState({ issue, project, workspace }) {
  const latestRun = latestRunForKind(issue?.runs, CODEX_RUNNER_KIND);

  if (workspace?.status !== "available" || !workspace.path) {
    return {
      kind: "Codex",
      role: "Local CLI runner",
      status: "not-found",
      detail: latestRun
        ? `Latest Codex run ${latestRun.status}, but the issue worktree is not currently resolved.`
        : "Codex local runs need a resolved issue worktree.",
      latestRun,
      adapter: notFoundAdapter(
        "runner:codex",
        "Codex runner",
        "Codex local runs need a resolved issue worktree."
      )
    };
  }

  const resolvedConfig = codexConfigForProject(project, workspace.path);
  const latestDetail = latestRun
    ? `Latest run ${latestRun.status}${latestRun.summary ? `: ${latestRun.summary}` : ""}`
    : `Ready for local runs in ${workspace.path}.`;

  return {
    kind: "Codex",
    role: "Local CLI runner",
    status: "available",
    detail: `${latestDetail} Command ${resolvedConfig.command}; sandbox ${resolvedConfig.sandbox}; approvals ${resolvedConfig.approvalPolicy}.`,
    config: {
      command: resolvedConfig.command,
      model: resolvedConfig.model,
      profile: resolvedConfig.profile,
      sandbox: resolvedConfig.sandbox,
      approvalPolicy: resolvedConfig.approvalPolicy,
      logRoot: resolvedConfig.logRoot
    },
    latestRun,
    adapter: availableAdapter(
      "runner:codex",
      "Codex runner",
      `Codex local runner is available for ${workspace.path}.`
    )
  };
}

function buildCursorRunnerState({ issue, project, workspace }) {
  const latestRun = latestRunForKind(issue?.runs, CURSOR_RUNNER_KIND);
  const config = project?.runners?.cursor;

  if (!config) {
    return {
      kind: "Cursor SDK",
      role: "Local agent harness",
      status: "not-configured",
      detail: "Cursor SDK runner config is not defined for this project.",
      latestRun,
      adapter: notConfiguredAdapter(
        "runner:cursor",
        "Cursor SDK runner",
        "Cursor SDK runner config is not defined for this project."
      )
    };
  }

  if (workspace?.status !== "available" || !workspace.path) {
    return {
      kind: "Cursor SDK",
      role: "Local agent harness",
      status: "not-found",
      detail: latestRun
        ? `Latest Cursor run ${latestRun.status}, but the issue worktree is not currently resolved.`
        : "Cursor local runs need a resolved issue worktree.",
      config,
      latestRun,
      adapter: notFoundAdapter(
        "runner:cursor",
        "Cursor SDK runner",
        "Cursor local runs need a resolved issue worktree."
      )
    };
  }

  const resolvedConfig = cursorConfigForProject({ runners: { cursor: config } }, workspace.path);
  const latestDetail = latestRun
    ? `Latest run ${latestRun.status}${latestRun.summary ? `: ${latestRun.summary}` : ""}`
    : `Ready for local runs in ${workspace.path}.`;

  return {
    kind: "Cursor SDK",
    role: "Local agent harness",
    status: "available",
    detail: `${latestDetail} Model ${resolvedConfig.model}; config ${resolvedConfig.resolvedConfigPath}.`,
    config: {
      model: resolvedConfig.model,
      configPath: resolvedConfig.resolvedConfigPath,
      apiKeyEnv: resolvedConfig.apiKeyEnv
    },
    latestRun,
    adapter: availableAdapter(
      "runner:cursor",
      "Cursor SDK runner",
      `Cursor SDK local runner is available for ${workspace.path}.`
    )
  };
}

function latestRunForKind(runs = [], runnerKind) {
  return runs.find((run) => run.runnerKind === runnerKind);
}

function symphonyRunnerDetail(symphonyState) {
  if (!symphonyState) {
    return "Symphony queue/state discovery is unavailable.";
  }

  if (symphonyState.selectedIssue) {
    const selected = symphonyState.selectedIssue;
    const location = selected.workspacePath ? " Worktree linked." : "";
    const session = selected.sessionId ? " Session linked." : "";
    return `${selected.identifier} is ${selected.normalizedState}. ${selected.reason}${location}${session}`;
  }

  return symphonyState.detail;
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

function buildPullRequestStates(pullRequestStates) {
  const states = Array.isArray(pullRequestStates)
    ? pullRequestStates.filter(Boolean)
    : pullRequestStates
      ? [pullRequestStates]
      : [];

  if (states.length > 0) return states;

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
    },
    {
      provider: "Graphite",
      status: "unavailable",
      detail: "Graphite stack sync is not connected yet.",
      deepLink: "https://app.graphite.com/",
      adapter: unavailableAdapter(
        "pr:graphite",
        "Graphite stack",
        "Graphite stack adapter unavailable until AGE-359 wires stack visibility.",
        "AGE-359"
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

async function refreshLinearCacheAfterWrite({
  project,
  repository,
  clock,
  linearCacheStaleAfterMs,
  syncLinearProjectIssues
}) {
  try {
    await syncLinearProjectIssues({
      project,
      repository,
      clock,
      staleAfterMs: linearCacheStaleAfterMs,
      force: true
    });
  } catch {
    // The write event is already recorded; stale cache should not hide a successful Linear mutation.
  }
}

function upsertLinearWriteIssue(repository, project, result, options) {
  const existingProject = repository.getProject(project.id);
  const existingProjectMetadata = existingProject?.metadata ?? {};
  const writtenAt = options.clock().toISOString();

  repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: project.linear?.projectId,
    metadata: {
      ...existingProjectMetadata,
      linear: {
        teamKey: project.linear?.teamKey,
        projectId: project.linear?.projectId,
        projectSlug: project.linear?.projectSlug
      }
    }
  });

  const existingIssue = repository.getIssueByIdentifier(project.id, result.issue.identifier);
  const existingMetadata = existingIssue?.metadata ?? {};

  return repository.upsertIssue({
    id: result.issue.linearId,
    projectId: project.id,
    identifier: result.issue.identifier,
    title: result.issue.title,
    status: result.status.name,
    linearUrl: result.issue.url,
    priority: result.issue.priority,
    metadata: {
      ...existingMetadata,
      source: "linear",
      linearId: result.issue.linearId,
      updatedAt: result.issue.updatedAt,
      statusType: result.status.type,
      stateId: result.status.id,
      priorityLabel: result.issue.priorityLabel,
      codexWorkpad: result.workpad,
      linearSync: {
        ...(existingMetadata.linearSync ?? {}),
        status: "fresh",
        fetchedAt: writtenAt,
        staleAfterMs: options.linearCacheStaleAfterMs
      }
    }
  });
}

function upsertReviewPromptIssue(repository, project, state, options) {
  const existingProject = repository.getProject(project.id);
  const existingProjectMetadata = existingProject?.metadata ?? {};
  const existingIssue = repository.getIssueByIdentifier(project.id, state.issue.issueId);
  const linearIssue = state.issue.linear;
  const writtenAt = options.clock().toISOString();

  repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: project.linear?.projectId,
    metadata: {
      ...existingProjectMetadata,
      linear: {
        teamKey: project.linear?.teamKey,
        projectId: project.linear?.projectId,
        projectSlug: project.linear?.projectSlug
      }
    }
  });

  return repository.upsertIssue({
    id: existingIssue?.id ?? linearIssue?.linearId ?? `${project.id}-${state.issue.issueId}`,
    projectId: project.id,
    identifier: state.issue.issueId,
    title: linearIssue?.title ?? state.issue.issueId,
    status: linearIssue?.status ?? state.issue.status,
    linearUrl: linearIssue?.url,
    priority: linearIssue?.priority,
    metadata: {
      ...(existingIssue?.metadata ?? {}),
      source: linearIssue ? "linear" : state.issue.source,
      linearId: linearIssue?.linearId,
      updatedAt: linearIssue?.updatedAt ?? writtenAt,
      statusType: linearIssue?.statusType,
      priorityLabel: linearIssue?.priorityLabel,
      labels: linearIssue?.labels,
      blockers: linearIssue?.blockers,
      blockedIssues: linearIssue?.blockedIssues,
      links: linearIssue?.links,
      pullRequests: linearIssue?.pullRequests,
      codexWorkpad: linearIssue?.codexWorkpad,
      linearSync: {
        ...(existingIssue?.metadata?.linearSync ?? {}),
        status: linearIssue?.cache?.status ?? existingIssue?.metadata?.linearSync?.status ?? "event-only",
        fetchedAt: linearIssue?.cache?.fetchedAt ?? writtenAt,
        staleAfterMs: options.linearCacheStaleAfterMs
      }
    }
  });
}

function sanitizeOptionalNote(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new LocalApiValidationError("note must be a string when provided.");
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function sanitizeRequiredPrompt(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LocalApiValidationError("prompt must be a non-empty string.");
  }

  return value.trim();
}

function sanitizeOptionalString(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new LocalApiValidationError(`${fieldName} must be a non-empty string when provided.`);
  }

  return value.trim();
}

function sanitizeOptionalStringArray(value, fieldName) {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new LocalApiValidationError(`${fieldName} must be an array of strings when provided.`);
  }

  return value.map((item) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      throw new LocalApiValidationError(`${fieldName} must contain only non-empty strings.`);
    }

    return item.trim();
  });
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
