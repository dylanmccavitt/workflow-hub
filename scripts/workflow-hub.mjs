#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  derivedDataPath,
  inferIssueIdFromCwd,
  normalizeIssueId,
  readProjectConfig,
  resolveIssueWorkspace,
  requireIosConfig,
  xcodeTargetArgs
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

function usage() {
  console.log(`workflow-hub

Usage:
  npm run workflow -- config [--json]
  npm run workflow -- api-state [ISSUE_ID] --json
  npm run workflow -- linear-sync [PROJECT_ID] [--json]
  npm run workflow -- linear-action [ISSUE_ID] ACTION --confirmed [--note NOTE] [--json]
  npm run workflow -- status [ISSUE_ID] [--json]
  npm run workflow -- open [ISSUE_ID] --zed|--xcode|--finder|--terminal|--print
  npm run workflow -- review ISSUE_ID --sim|--device
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

function parseLinearActionArgs(args, registry) {
  let issueId;
  let actionId;
  let note;
  let confirmed = false;
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

  return { issueId, actionId, confirmed, note, json };
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

function review(args) {
  const registry = readProjectConfig();
  const { issueId: rawIssueId, flag } = parseIssueAndFlag(args, "--sim");
  const issueId = selectIssueId(rawIssueId, registry);
  const resolved = requireResolvedWorkspace(issueId, registry);
  const project = registry.projects.find((candidate) => candidate.id === resolved.project.id);

  const ios = requireIosConfig(project);
  const derivedData = derivedDataPath(project, issueId);
  const xcodeArgs = xcodeTargetArgs(ios).join(" ");

  if (flag === "--sim") {
    console.log([
      "Simulator review command draft:",
      `cd ${resolved.workspace.path}`,
      `xcodebuild ${xcodeArgs} -scheme ${ios.scheme} -destination 'platform=iOS Simulator,name=${ios.simulatorName}' -derivedDataPath ${derivedData} build`,
      `xcrun simctl launch booted ${ios.bundleId}`
    ].join("\n"));
    return;
  }

  if (flag === "--device") {
    console.log([
      "Device review starts in Xcode because signing and device trust are local Apple state:",
      `open -a Xcode ${path.join(resolved.workspace.path, ios.workspacePath ?? ios.projectPath)}`
    ].join("\n"));
    return;
  }

  console.error(`Unknown review target: ${flag}`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);

if (!command) {
  usage();
  process.exit(0);
}

try {
  if (command === "config") {
    printConfig(args[0]);
    process.exit(0);
  }

  if (command === "linear-sync") {
    await linearSync(args[0], args[1]);
    process.exit(0);
  }

  if (command === "linear-action") {
    await linearAction(args);
    process.exit(0);
  }

  if (command === "api-state") {
    await apiState(args);
    process.exit(0);
  }

  if (command === "status") {
    status(args);
    process.exit(0);
  }

  if (command === "open") {
    openWorkspace(args);
    process.exit(0);
  }

  if (command === "review") {
    review(args);
    process.exit(0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

usage();
process.exit(1);
