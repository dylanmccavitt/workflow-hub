#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  inferIssueIdFromCwd,
  normalizeIssueId,
  readProjectConfig,
  resolveIssueWorkspace,
  requireIosConfig
} from "./lib/project-config.mjs";
import {
  createRegistryRepository,
  openRegistryDatabase
} from "./lib/registry-db.mjs";
import {
  syncLinearProjectIssues
} from "./lib/linear-sync.mjs";
import {
  createLocalApiService
} from "./lib/local-api-service.mjs";
import {
  runIosDeviceReview,
  runIosSimulatorReview
} from "./lib/ios-review.mjs";

function usage() {
  console.log(`workflow-hub

Usage:
  npm run workflow -- config [--json]
  npm run workflow -- api-issues [PROJECT_ID] --json
  npm run workflow -- api-state [ISSUE_ID] --json
  npm run workflow -- codex-run [ISSUE_ID] --prompt PROMPT [--model MODEL] [--sandbox MODE] [--approval-policy POLICY] [--confirmed] [--sensitive-data-confirmed] [--dry-run] [--json]
  npm run workflow -- cursor-run [ISSUE_ID] --prompt PROMPT [--model MODEL] [--confirmed] [--sensitive-data-confirmed] [--dry-run] [--json]
  npm run workflow -- dispatch-ready [ISSUE_ID] --runner codex|cursor --confirmed [--sensitive-data-confirmed] [--prompt PROMPT] [--dry-run] [--json]
  npm run workflow -- fix-prompt [ISSUE_ID] [--review-comment ID] [--check ID] [--json]
  npm run workflow -- fix-prompt-save [ISSUE_ID] --payload BASE64_JSON [--json]
  npm run workflow -- linear-sync [PROJECT_ID] [--json]
  npm run workflow -- linear-action [ISSUE_ID] ACTION --confirmed [--sensitive-data-confirmed] [--note NOTE] [--json]
  npm run workflow -- status [ISSUE_ID] [--json]
  npm run workflow -- open [ISSUE_ID] --zed|--xcode|--finder|--terminal|--print
  npm run workflow -- review [ISSUE_ID] --sim|--device [--screenshot] [--json]
`);
}

function runOpen(appName, targetPath) {
  const args = appName ? ["-a", appName, targetPath] : [targetPath];
  const result = spawnSync("open", args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function printConfig(flag) {
  const registry = readProjectConfig();

  if (flag === "--json") {
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  console.log([
    `Loaded ${registry.projects.length} project(s).`,
    `Tracked config: ${registry.source.trackedConfigPath}`,
    registry.source.localConfigPath
      ? `Local overrides: ${registry.source.localConfigPath}`
      : "Local overrides: config/projects.json not found"
  ].join("\n"));
}

async function linearSync(projectIdOrFlag, flag) {
  const registry = readProjectConfig();
  const json = projectIdOrFlag === "--json" || flag === "--json";
  const requestedProjectId = projectIdOrFlag && !projectIdOrFlag.startsWith("--")
    ? projectIdOrFlag
    : "workflow-hub";
  const project = registry.projects.find((candidate) => candidate.id === requestedProjectId);

  if (!project) {
    console.error(`No configured project found for ${requestedProjectId}.`);
    process.exit(1);
  }

  const repository = createRegistryRepository(openRegistryDatabase());

  try {
    const sync = await syncLinearProjectIssues({ project, repository, force: true });
    const cachedIssues = repository.listProjectIssues(project.id);
    const payload = {
      project: {
        id: project.id,
        displayName: project.displayName,
        linear: project.linear
      },
      sync,
      cachedIssueCount: cachedIssues.length,
      issues: cachedIssues.map((issue) => ({
        identifier: issue.identifier,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        cache: issue.metadata.linearSync
      }))
    };

    if (json) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }

    console.log([
      `${project.displayName}: ${sync.detail}`,
      `Cached issues: ${cachedIssues.length}`
    ].join("\n"));
  } finally {
    repository.close();
  }
}

function parseIssueAndFlag(args, defaultFlag) {
  let issueId;
  let flag = defaultFlag;

  for (const arg of args) {
    if (arg.startsWith("--")) {
      flag = arg;
      continue;
    }

    if (issueId) {
      throw new Error(`Unexpected argument: ${arg}`);
    }

    issueId = arg;
  }

  return { issueId, flag };
}

function selectIssueId(rawIssueId, registry) {
  if (rawIssueId) {
    return normalizeIssueId(rawIssueId);
  }

  const inferred = inferIssueIdFromCwd(process.cwd(), registry);
  if (inferred) {
    return inferred.issueId;
  }

  throw new Error("No ISSUE_ID provided and current directory is not inside a configured issue worktree.");
}

async function apiState(args) {
  const registry = readProjectConfig();
  const { issueId: rawIssueId, flag } = parseIssueAndFlag(args, "--json");

  if (flag !== "--json") {
    throw new Error(`Unknown api-state flag: ${flag}`);
  }

  const issueId = selectIssueId(rawIssueId, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.getIssueState(issueId);
  console.log(JSON.stringify(payload, null, 2));
}

async function apiIssues(args) {
  let projectId = "workflow-hub";
  let json = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown api-issues flag: ${arg}`);
    }

    projectId = arg;
  }

  if (!json) {
    throw new Error("api-issues currently requires --json.");
  }

  const localApiService = createLocalApiService();
  const payload = await localApiService.listIssues({ projectId });
  console.log(JSON.stringify(payload, null, 2));
}

function parseLinearActionArgs(args, registry) {
  let issueId;
  let actionId;
  let note;
  let confirmed = false;
  let sensitiveDataConfirmed = false;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--confirmed") {
      confirmed = true;
      continue;
    }

    if (arg === "--sensitive-data-confirmed") {
      sensitiveDataConfirmed = true;
      continue;
    }

    if (arg === "--note") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--note requires a value");
      }
      note = args[index];
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown linear-action flag: ${arg}`);
    }

    if (!issueId && /^[a-z]+-\d+$/i.test(arg) && !actionId) {
      issueId = normalizeIssueId(arg);
      continue;
    }

    if (!actionId) {
      actionId = arg;
      continue;
    }

    throw new Error(`Unexpected linear-action argument: ${arg}`);
  }

  if (!issueId) {
    issueId = selectIssueId(undefined, registry);
  }

  if (!actionId) {
    throw new Error("linear-action requires an ACTION such as ready, human-review, or blocked.");
  }

  return { issueId, actionId, confirmed, sensitiveDataConfirmed, note, json };
}

async function linearAction(args) {
  const registry = readProjectConfig();
  const parsed = parseLinearActionArgs(args, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.applyIssueAction(parsed);

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log([
    payload.message,
    `Workpad: ${payload.workpad.operation} ${payload.workpad.commentId}`,
    `Event: ${payload.event.id}`
  ].join("\n"));
}

function decodePayload(value) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch (error) {
    throw new Error(`--payload must be base64url encoded JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseReviewFixPromptArgs(args, registry) {
  let issueId;
  let json = false;
  let payload = {};
  const selectedReviewCommentIds = [];
  const selectedCheckIds = [];
  const ownedPaths = [];
  let prompt;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--payload") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--payload requires a value");
      }
      payload = decodePayload(args[index]);
      continue;
    }

    if (arg === "--review-comment") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--review-comment requires a value");
      }
      selectedReviewCommentIds.push(args[index]);
      continue;
    }

    if (arg === "--check") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--check requires a value");
      }
      selectedCheckIds.push(args[index]);
      continue;
    }

    if (arg === "--owned-path") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--owned-path requires a value");
      }
      ownedPaths.push(args[index]);
      continue;
    }

    if (arg === "--prompt") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--prompt requires a value");
      }
      prompt = args[index];
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown fix-prompt flag: ${arg}`);
    }

    if (!issueId && /^[a-z]+-\d+$/i.test(arg)) {
      issueId = normalizeIssueId(arg);
      continue;
    }

    throw new Error(`Unexpected fix-prompt argument: ${arg}`);
  }

  if (!issueId) {
    issueId = payload.issueId
      ? normalizeIssueId(payload.issueId)
      : selectIssueId(undefined, registry);
  }

  return {
    ...payload,
    issueId,
    prompt: prompt ?? payload.prompt,
    selectedReviewCommentIds: mergePayloadArray(payload, "selectedReviewCommentIds", selectedReviewCommentIds),
    selectedCheckIds: mergePayloadArray(payload, "selectedCheckIds", selectedCheckIds),
    ownedPaths: mergePayloadArray(payload, "ownedPaths", ownedPaths),
    json
  };
}

function mergePayloadArray(payload, fieldName, extras) {
  const payloadValue = payload[fieldName];
  if (payloadValue === undefined && extras.length === 0) return undefined;
  if (payloadValue !== undefined && !Array.isArray(payloadValue)) {
    throw new Error(`${fieldName} in --payload must be an array.`);
  }

  return [...(payloadValue ?? []), ...extras];
}

function parseCursorRunArgs(args, registry) {
  let issueId;
  let json = false;
  let dryRun = false;
  let confirmed = false;
  let sensitiveDataConfirmed = false;
  let payload = {};
  let prompt;
  let model;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirmed") {
      confirmed = true;
      continue;
    }

    if (arg === "--sensitive-data-confirmed") {
      sensitiveDataConfirmed = true;
      continue;
    }

    if (arg === "--payload") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--payload requires a value");
      }
      payload = decodePayload(args[index]);
      continue;
    }

    if (arg === "--prompt") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--prompt requires a value");
      }
      prompt = args[index];
      continue;
    }

    if (arg === "--model") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--model requires a value");
      }
      model = args[index];
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown cursor-run flag: ${arg}`);
    }

    if (!issueId && /^[a-z]+-\d+$/i.test(arg)) {
      issueId = normalizeIssueId(arg);
      continue;
    }

    throw new Error(`Unexpected cursor-run argument: ${arg}`);
  }

  if (!issueId) {
    issueId = payload.issueId
      ? normalizeIssueId(payload.issueId)
      : selectIssueId(undefined, registry);
  }

  return {
    ...payload,
    issueId,
    prompt: prompt ?? payload.prompt,
    model: model ?? payload.model,
    confirmed: confirmed || payload.confirmed === true,
    sensitiveDataConfirmed: sensitiveDataConfirmed || payload.sensitiveDataConfirmed === true,
    dryRun: dryRun || payload.dryRun === true,
    json
  };
}

function parseCodexRunArgs(args, registry) {
  let issueId;
  let json = false;
  let dryRun = false;
  let confirmed = false;
  let sensitiveDataConfirmed = false;
  let payload = {};
  let prompt;
  let command;
  let model;
  let profile;
  let sandbox;
  let approvalPolicy;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirmed") {
      confirmed = true;
      continue;
    }

    if (arg === "--sensitive-data-confirmed") {
      sensitiveDataConfirmed = true;
      continue;
    }

    if (arg === "--payload") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--payload requires a value");
      }
      payload = decodePayload(args[index]);
      continue;
    }

    if (arg === "--prompt") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--prompt requires a value");
      }
      prompt = args[index];
      continue;
    }

    if (arg === "--command") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--command requires a value");
      }
      command = args[index];
      continue;
    }

    if (arg === "--model") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--model requires a value");
      }
      model = args[index];
      continue;
    }

    if (arg === "--profile") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--profile requires a value");
      }
      profile = args[index];
      continue;
    }

    if (arg === "--sandbox") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--sandbox requires a value");
      }
      sandbox = args[index];
      continue;
    }

    if (arg === "--approval-policy") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--approval-policy requires a value");
      }
      approvalPolicy = args[index];
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown codex-run flag: ${arg}`);
    }

    if (!issueId && /^[a-z]+-\d+$/i.test(arg)) {
      issueId = normalizeIssueId(arg);
      continue;
    }

    throw new Error(`Unexpected codex-run argument: ${arg}`);
  }

  if (!issueId) {
    issueId = payload.issueId
      ? normalizeIssueId(payload.issueId)
      : selectIssueId(undefined, registry);
  }

  return {
    ...payload,
    issueId,
    prompt: prompt ?? payload.prompt,
    command: command ?? payload.command,
    model: model ?? payload.model,
    profile: profile ?? payload.profile,
    sandbox: sandbox ?? payload.sandbox,
    approvalPolicy: approvalPolicy ?? payload.approvalPolicy,
    confirmed: confirmed || payload.confirmed === true,
    sensitiveDataConfirmed: sensitiveDataConfirmed || payload.sensitiveDataConfirmed === true,
    dryRun: dryRun || payload.dryRun === true,
    json
  };
}

function parseDispatchReadyArgs(args, registry) {
  let issueId;
  let json = false;
  let dryRun = false;
  let confirmed = false;
  let sensitiveDataConfirmed = false;
  let payload = {};
  let runnerKind;
  let prompt;
  let command;
  let model;
  let profile;
  let sandbox;
  let approvalPolicy;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--confirmed") {
      confirmed = true;
      continue;
    }

    if (arg === "--sensitive-data-confirmed") {
      sensitiveDataConfirmed = true;
      continue;
    }

    if (arg === "--payload") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--payload requires a value");
      }
      payload = decodePayload(args[index]);
      continue;
    }

    if (arg === "--runner") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--runner requires a value");
      }
      runnerKind = args[index];
      continue;
    }

    if (arg === "--prompt") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--prompt requires a value");
      }
      prompt = args[index];
      continue;
    }

    if (arg === "--command") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--command requires a value");
      }
      command = args[index];
      continue;
    }

    if (arg === "--model") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--model requires a value");
      }
      model = args[index];
      continue;
    }

    if (arg === "--profile") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--profile requires a value");
      }
      profile = args[index];
      continue;
    }

    if (arg === "--sandbox") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--sandbox requires a value");
      }
      sandbox = args[index];
      continue;
    }

    if (arg === "--approval-policy") {
      index += 1;
      if (index >= args.length) {
        throw new Error("--approval-policy requires a value");
      }
      approvalPolicy = args[index];
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown dispatch-ready flag: ${arg}`);
    }

    if (!issueId && /^[a-z]+-\d+$/i.test(arg)) {
      issueId = normalizeIssueId(arg);
      continue;
    }

    throw new Error(`Unexpected dispatch-ready argument: ${arg}`);
  }

  if (!issueId) {
    issueId = payload.issueId
      ? normalizeIssueId(payload.issueId)
      : selectIssueId(undefined, registry);
  }

  return {
    ...payload,
    issueId,
    runnerKind: runnerKind ?? payload.runnerKind ?? "codex",
    prompt: prompt ?? payload.prompt,
    command: command ?? payload.command,
    model: model ?? payload.model,
    profile: profile ?? payload.profile,
    sandbox: sandbox ?? payload.sandbox,
    approvalPolicy: approvalPolicy ?? payload.approvalPolicy,
    confirmed: confirmed || payload.confirmed === true,
    sensitiveDataConfirmed: sensitiveDataConfirmed || payload.sensitiveDataConfirmed === true,
    dryRun: dryRun || payload.dryRun === true,
    json
  };
}

async function codexRun(args) {
  const registry = readProjectConfig();
  const parsed = parseCodexRunArgs(args, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.startCodexRun(parsed);

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.dryRun) {
    console.log([
      `${payload.issueId} Codex run ready.`,
      `Command: ${payload.command.join(" ")}`,
      `Worktree: ${payload.cwd}`,
      `Sandbox: ${payload.permissionBoundary.sandbox}`,
      `Approvals: ${payload.permissionBoundary.approvalPolicy}`,
      `Log: ${payload.logPath}`
    ].join("\n"));
    return;
  }

  console.log([
    `${payload.issueId} Codex run ${payload.status}.`,
    `Run: ${payload.runId ?? "unknown"}`,
    `Session: ${payload.sessionId ?? "unknown"}`,
    `Worktree: ${payload.cwd}`,
    `Log: ${payload.logPath}`,
    `Summary: ${payload.summary ?? "none"}`
  ].join("\n"));
}

async function dispatchReady(args) {
  const registry = readProjectConfig();
  const parsed = parseDispatchReadyArgs(args, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.dispatchReadyIssue(parsed);

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log([
    `${payload.issueId} dispatched to ${payload.runnerKind}${payload.dryRun ? " (dry run)" : ""}.`,
    `Worktree: ${payload.workspace.path ?? "unknown"}`,
    `Workspace: ${payload.workspaceOperation}`,
    `Status: ${payload.statusAction?.status?.name ?? "In Progress"}`,
    `Runner status: ${payload.runner.status}`,
    payload.runner.runId ? `Run: ${payload.runner.runId}` : undefined,
    payload.event ? `Event: ${payload.event.id}` : undefined
  ].filter(Boolean).join("\n"));
}

async function cursorRun(args) {
  const registry = readProjectConfig();
  const parsed = parseCursorRunArgs(args, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.startCursorRun(parsed);

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (payload.dryRun) {
    console.log([
      `${payload.issueId} Cursor run ready.`,
      `Model: ${payload.model}`,
      `Worktree: ${payload.cwd}`,
      `Config: ${payload.configPath}`
    ].join("\n"));
    return;
  }

  console.log([
    `${payload.issueId} Cursor run ${payload.status}.`,
    `Agent: ${payload.agentId ?? "unknown"}`,
    `Run: ${payload.runId ?? "unknown"}`,
    `Model: ${payload.model}`,
    `Summary: ${payload.summary ?? "none"}`
  ].join("\n"));
}

async function fixPrompt(args) {
  const registry = readProjectConfig();
  const parsed = parseReviewFixPromptArgs(args, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.draftReviewFixPrompt(parsed);

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log(payload.prompt);
}

async function fixPromptSave(args) {
  const registry = readProjectConfig();
  const parsed = parseReviewFixPromptArgs(args, registry);
  const localApiService = createLocalApiService();
  const payload = await localApiService.saveReviewFixPrompt(parsed);

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log([
    `${payload.issueId} fix prompt saved.`,
    `Event: ${payload.event.id}`,
    `Branch: ${payload.branch ?? "unknown"}`,
    `Worktree: ${payload.worktree ?? "unknown"}`
  ].join("\n"));
}

function requireResolvedWorkspace(issueId, registry) {
  const resolved = resolveIssueWorkspace(issueId, registry);

  if (!resolved.found) {
    console.error(`No issue workspace found for ${resolved.issueId}.`);
    if (resolved.searchedRoots.length > 0) {
      console.error("Searched roots:");
      for (const root of resolved.searchedRoots) {
        console.error(`- ${root.projectId}: ${root.root}`);
      }
    }
    process.exit(1);
  }

  return resolved;
}

function dirtyLabel(value) {
  if (value === undefined) return "unknown";
  return value ? "dirty" : "clean";
}

function printStatus(resolved) {
  console.log([
    `Issue: ${resolved.issueId}`,
    `Project: ${resolved.project.displayName} (${resolved.project.id})`,
    `Canonical repo: ${resolved.canonical.path}`,
    `  Expected branch: ${resolved.canonical.expectedBranch}`,
    `  Current branch: ${resolved.canonical.branch ?? "unknown"}`,
    `  Head: ${resolved.canonical.headSha ?? "unknown"}`,
    `  Git status: ${dirtyLabel(resolved.canonical.dirty)}`,
    `Issue workspace: ${resolved.workspace.path}`,
    `  Root: ${resolved.workspace.root}`,
    `  Match: ${resolved.workspace.matchType}`,
    `  Branch: ${resolved.workspace.branch ?? "unknown"}`,
    `  Upstream: ${resolved.workspace.upstream ?? "none"}`,
    `  Head: ${resolved.workspace.headSha ?? "unknown"}`,
    `  Git status: ${dirtyLabel(resolved.workspace.dirty)}`
  ].join("\n"));

  if (resolved.canonical.statusLines.length > 0) {
    console.log("Canonical git lines:");
    for (const line of resolved.canonical.statusLines) {
      console.log(`  ${line}`);
    }
  }

  if (resolved.workspace.statusLines.length > 0) {
    console.log("Workspace git lines:");
    for (const line of resolved.workspace.statusLines) {
      console.log(`  ${line}`);
    }
  }
}

function status(args) {
  const registry = readProjectConfig();
  const { issueId: rawIssueId, flag } = parseIssueAndFlag(args, undefined);
  const issueId = selectIssueId(rawIssueId, registry);
  const resolved = requireResolvedWorkspace(issueId, registry);

  if (flag === "--json") {
    console.log(JSON.stringify(resolved, null, 2));
    return;
  }

  if (flag) {
    throw new Error(`Unknown status flag: ${flag}`);
  }

  printStatus(resolved);
}

function openWorkspace(args) {
  const registry = readProjectConfig();
  const { issueId: rawIssueId, flag } = parseIssueAndFlag(args, "--print");
  const issueId = selectIssueId(rawIssueId, registry);
  const resolved = requireResolvedWorkspace(issueId, registry);

  if (flag === "--print") {
    console.log(resolved.workspace.path);
    return;
  }

  if (flag === "--zed") {
    runOpen("Zed", resolved.workspace.path);
    return;
  }

  if (flag === "--xcode") {
    const project = registry.projects.find((candidate) => candidate.id === resolved.project.id);
    const ios = requireIosConfig(project);
    const target = ios.workspacePath ?? ios.projectPath;
    runOpen("Xcode", path.join(resolved.workspace.path, target));
    return;
  }

  if (flag === "--finder") {
    runOpen(undefined, resolved.workspace.path);
    return;
  }

  if (flag === "--terminal") {
    runOpen("Terminal", resolved.workspace.path);
    return;
  }

  console.error(`Unknown open target: ${flag}`);
  process.exit(1);
}

function parseReviewArgs(args, registry) {
  let issueId;
  let target = "--sim";
  let json = false;
  let captureScreenshot = false;

  for (const arg of args) {
    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--sim" || arg === "--device") {
      target = arg;
      continue;
    }

    if (arg === "--screenshot") {
      captureScreenshot = true;
      continue;
    }

    if (arg.startsWith("--")) {
      throw new Error(`Unknown review flag: ${arg}`);
    }

    if (issueId) {
      throw new Error(`Unexpected review argument: ${arg}`);
    }

    issueId = arg;
  }

  return {
    issueId: selectIssueId(issueId, registry),
    target,
    json,
    captureScreenshot
  };
}

function review(args) {
  const registry = readProjectConfig();
  const { issueId, target, json, captureScreenshot } = parseReviewArgs(args, registry);
  const resolved = requireResolvedWorkspace(issueId, registry);
  const project = registry.projects.find((candidate) => candidate.id === resolved.project.id);

  const ios = requireIosConfig(project);

  if (target === "--sim") {
    const repository = createRegistryRepository(openRegistryDatabase());

    try {
      const payload = runIosSimulatorReview({
        issueId,
        project,
        workspace: resolved.workspace,
        repository,
        captureScreenshot
      });

      if (json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log([
        `${payload.issueId} simulator review ${payload.status}.`,
        `Simulator: ${payload.simulator.name} (${payload.simulator.udid})`,
        `Bundle: ${payload.bundleId}`,
        `App: ${payload.appPath}`,
        `DerivedData: ${payload.derivedDataPath}`,
        `Log: ${payload.logPath}`,
        `Screenshot: ${payload.screenshotPath ?? "not requested"}`,
        `Evidence: ${payload.evidence.summary}`,
        `Session: ${payload.session.id}`
      ].join("\n"));
    } catch (error) {
      if (json && error?.details?.session) {
        console.log(JSON.stringify({
          issueId,
          projectId: project.id,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          session: error.details.session,
          event: error.details.event,
          derivedDataPath: error.details.derivedDataPath,
          logPath: error.details.logPath,
          screenshotPath: error.details.screenshotPath,
          evidence: error.details.evidence
        }, null, 2));
        process.exitCode = 1;
        return;
      }

      throw error;
    } finally {
      repository.close();
    }
    return;
  }

  if (target === "--device") {
    const repository = createRegistryRepository(openRegistryDatabase());

    try {
      const payload = runIosDeviceReview({
        issueId,
        project,
        workspace: resolved.workspace,
        repository
      });

      if (json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log([
        `${payload.issueId} device review ${payload.status}.`,
        `Xcode: ${payload.xcodePath}`,
        `Scheme: ${payload.scheme}`,
        `Bundle ID: ${payload.bundleId}`,
        `Device target: ${payload.deviceTargetGuidance}`,
        "Signing caveats:",
        ...payload.signingCaveats.map((caveat) => `- ${caveat}`),
        `Log: ${payload.logPath}`,
        `Evidence: ${payload.evidence.summary}`,
        `Session: ${payload.session.id}`
      ].join("\n"));
    } catch (error) {
      if (json && error?.details?.session) {
        console.log(JSON.stringify({
          issueId,
          projectId: project.id,
          target: "device",
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
          session: error.details.session,
          event: error.details.event,
          xcodePath: error.details.xcodePath,
          logPath: error.details.logPath,
          evidence: error.details.evidence
        }, null, 2));
        process.exitCode = 1;
        return;
      }

      throw error;
    } finally {
      repository.close();
    }
    return;
  }

  console.error(`Unknown review target: ${target}`);
  process.exit(1);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  if (!command) {
    usage();
    return;
  }

  if (command === "config") {
    printConfig(args[0]);
    return;
  }

  if (command === "linear-sync") {
    await linearSync(args[0], args[1]);
    return;
  }

  if (command === "linear-action") {
    await linearAction(args);
    return;
  }

  if (command === "api-state") {
    await apiState(args);
    return;
  }

  if (command === "api-issues") {
    await apiIssues(args);
    return;
  }

  if (command === "codex-run") {
    await codexRun(args);
    return;
  }

  if (command === "cursor-run") {
    await cursorRun(args);
    return;
  }

  if (command === "dispatch-ready") {
    await dispatchReady(args);
    return;
  }

  if (command === "fix-prompt") {
    await fixPrompt(args);
    return;
  }

  if (command === "fix-prompt-save") {
    await fixPromptSave(args);
    return;
  }

  if (command === "status") {
    status(args);
    return;
  }

  if (command === "open") {
    openWorkspace(args);
    return;
  }

  if (command === "review") {
    review(args);
    return;
  }

  usage();
  process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
