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

function usage() {
  console.log(`workflow-hub

Usage:
  npm run workflow -- config [--json]
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
