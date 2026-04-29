#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const configPath = path.join(repoRoot, "config", "projects.json");
const exampleConfigPath = path.join(repoRoot, "config", "projects.example.json");

function readConfig() {
  const target = fs.existsSync(configPath) ? configPath : exampleConfigPath;
  return JSON.parse(fs.readFileSync(target, "utf8"));
}

function usage() {
  console.log(`workflow-hub

Usage:
  npm run workflow -- status ISSUE_ID
  npm run workflow -- open ISSUE_ID --zed|--xcode|--finder|--terminal|--print
  npm run workflow -- review ISSUE_ID --sim|--device
`);
}

function findWorkspace(issueId) {
  const config = readConfig();
  const candidates = [];

  for (const project of config.projects) {
    for (const root of project.workspaceRoots ?? []) {
      if (!fs.existsSync(root)) continue;

      const direct = path.join(root, issueId);
      if (fs.existsSync(direct)) {
        candidates.push({ project, path: direct });
      }

      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(root, entry.name);
        if (entry.name.toLowerCase().includes(issueId.toLowerCase())) {
          candidates.push({ project, path: fullPath });
        }
      }
    }
  }

  return candidates[0];
}

function runOpen(appName, targetPath) {
  const args = appName ? ["-a", appName, targetPath] : [targetPath];
  const result = spawnSync("open", args, { stdio: "inherit" });
  process.exit(result.status ?? 1);
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
    const project = match.project.xcode?.project;
    runOpen("Xcode", project ? path.join(match.path, project) : match.path);
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

  const xcode = match.project.xcode ?? {};
  const derivedData = path.join("/tmp", `WorkflowHubDerivedData-${issueId}`);

  if (flag === "--sim") {
    console.log([
      "Simulator review command draft:",
      `cd ${match.path}`,
      `xcodebuild -project ${xcode.project} -scheme ${xcode.scheme} -destination 'platform=iOS Simulator,name=${xcode.simulatorName}' -derivedDataPath ${derivedData} build`,
      `xcrun simctl launch booted ${xcode.bundleId}`
    ].join("\n"));
    return;
  }

  if (flag === "--device") {
    console.log([
      "Device review starts in Xcode because signing and device trust are local Apple state:",
      `open -a Xcode ${path.join(match.path, xcode.project ?? "")}`
    ].join("\n"));
    return;
  }

  console.error(`Unknown review target: ${flag}`);
  process.exit(1);
}

const [command, issueId, flag] = process.argv.slice(2);

if (!command || !issueId) {
  usage();
  process.exit(command ? 1 : 0);
}

if (command === "status") status(issueId);
if (command === "open") openWorkspace(issueId, flag ?? "--print");
if (command === "review") review(issueId, flag ?? "--sim");

usage();
process.exit(1);
