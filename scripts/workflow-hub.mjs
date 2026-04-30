#!/usr/bin/env node
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  derivedDataPath,
  findWorkspace,
  readProjectConfig,
  requireIosConfig,
  xcodeTargetArgs
} from "./lib/project-config.mjs";

function usage() {
  console.log(`workflow-hub

Usage:
  npm run workflow -- config [--json]
  npm run workflow -- status ISSUE_ID
  npm run workflow -- open ISSUE_ID --zed|--xcode|--finder|--terminal|--print
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

function status(issueId) {
  const match = findWorkspace(issueId);
  if (!match) {
    console.error(`No workspace found for ${issueId}.`);
    process.exit(1);
  }

  const git = spawnSync("git", ["status", "--short", "--branch"], {
    cwd: match.path,
    encoding: "utf8"
  });

  console.log(JSON.stringify(
    {
      issueId,
      project: match.project.id,
      path: match.path,
      gitStatus: git.stdout.trim().split("\n").filter(Boolean)
    },
    null,
    2
  ));
}

function openWorkspace(issueId, flag) {
  const match = findWorkspace(issueId);
  if (!match) {
    console.error(`No workspace found for ${issueId}.`);
    process.exit(1);
  }

  if (flag === "--print") {
    console.log(match.path);
    return;
  }

  if (flag === "--zed") {
    runOpen("Zed", match.path);
  }

  if (flag === "--xcode") {
    const ios = requireIosConfig(match.project);
    const target = ios.workspacePath ?? ios.projectPath;
    runOpen("Xcode", path.join(match.path, target));
  }

  if (flag === "--finder") {
    runOpen(undefined, match.path);
  }

  if (flag === "--terminal") {
    runOpen("Terminal", match.path);
  }

  console.error(`Unknown open target: ${flag}`);
  process.exit(1);
}

function review(issueId, flag) {
  const match = findWorkspace(issueId);
  if (!match) {
    console.error(`No workspace found for ${issueId}.`);
    process.exit(1);
  }

  const ios = requireIosConfig(match.project);
  const derivedData = derivedDataPath(match.project, issueId);
  const xcodeArgs = xcodeTargetArgs(ios).join(" ");

  if (flag === "--sim") {
    console.log([
      "Simulator review command draft:",
      `cd ${match.path}`,
      `xcodebuild ${xcodeArgs} -scheme ${ios.scheme} -destination 'platform=iOS Simulator,name=${ios.simulatorName}' -derivedDataPath ${derivedData} build`,
      `xcrun simctl launch booted ${ios.bundleId}`
    ].join("\n"));
    return;
  }

  if (flag === "--device") {
    console.log([
      "Device review starts in Xcode because signing and device trust are local Apple state:",
      `open -a Xcode ${path.join(match.path, ios.workspacePath ?? ios.projectPath)}`
    ].join("\n"));
    return;
  }

  console.error(`Unknown review target: ${flag}`);
  process.exit(1);
}

const [command, issueId, flag] = process.argv.slice(2);

if (!command) {
  usage();
  process.exit(0);
}

try {
  if (command === "config") {
    printConfig(issueId);
    process.exit(0);
  }

  if (!issueId) {
    usage();
    process.exit(1);
  }

  if (command === "status") {
    status(issueId);
    process.exit(0);
  }

  if (command === "open") {
    openWorkspace(issueId, flag ?? "--print");
    process.exit(0);
  }

  if (command === "review") {
    review(issueId, flag ?? "--sim");
    process.exit(0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

usage();
process.exit(1);
