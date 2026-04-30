import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  findWorkspaceCandidates,
  inferIssueIdFromCwd,
  resolveIssueWorkspace
} from "./project-config.mjs";

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-hub-project-config-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function initRepo(repoPath, branchName) {
  fs.mkdirSync(repoPath, { recursive: true });
  runGit(repoPath, ["init", "-b", branchName]);
  fs.writeFileSync(path.join(repoPath, "README.md"), `# ${path.basename(repoPath)}\n`);
  runGit(repoPath, ["add", "README.md"]);
  runGit(repoPath, [
    "-c",
    "user.name=Workflow Hub Test",
    "-c",
    "user.email=workflow-hub@example.test",
    "commit",
    "-m",
    "initial commit"
  ]);
}

function testRegistry(project) {
  return {
    projects: [
      {
        id: "workflow-hub",
        displayName: "Workflow Hub",
        linear: { teamKey: "AGE" },
        canonicalPath: project.canonicalPath,
        canonicalBranch: "main",
        workspaceRoots: project.workspaceRoots,
        issuePathTemplate: "{issueId}",
        branchTemplate: "feat/{issueIdLower}-{slug}",
        ios: project.ios
      }
    ],
    source: {}
  };
}

test("resolves issue workspace across configured roots and surfaces git state", (t) => {
  const root = tempDir(t);
  const canonicalPath = path.join(root, "canonical");
  const workspaceRootA = path.join(root, "workspaces-a");
  const workspaceRootB = path.join(root, "workspaces-b");
  const workspacePath = path.join(workspaceRootB, "AGE-350");

  fs.mkdirSync(workspaceRootA, { recursive: true });
  fs.mkdirSync(workspaceRootB, { recursive: true });
  initRepo(canonicalPath, "main");
  initRepo(workspacePath, "feat/age-350-workspace-resolver");
  fs.writeFileSync(path.join(workspacePath, "dirty.txt"), "local work\n");

  const resolved = resolveIssueWorkspace("age-350", testRegistry({
    canonicalPath,
    workspaceRoots: [workspaceRootA, workspaceRootB]
  }));

  assert.equal(resolved.found, true);
  assert.equal(resolved.issueId, "AGE-350");
  assert.equal(resolved.project.id, "workflow-hub");
  assert.equal(resolved.canonical.path, canonicalPath);
  assert.equal(resolved.canonical.branch, "main");
  assert.equal(resolved.canonical.dirty, false);
  assert.equal(resolved.workspace.path, workspacePath);
  assert.equal(resolved.workspace.root, workspaceRootB);
  assert.equal(resolved.workspace.branch, "feat/age-350-workspace-resolver");
  assert.equal(resolved.workspace.dirty, true);
  assert.deepEqual(resolved.candidates.map((candidate) => candidate.path), [workspacePath]);
});

test("ranks templated workspace path before loose directory-name matches", (t) => {
  const root = tempDir(t);
  const canonicalPath = path.join(root, "canonical");
  const workspaceRoot = path.join(root, "workspaces");
  const exactPath = path.join(workspaceRoot, "AGE-350");
  const loosePath = path.join(workspaceRoot, "old-AGE-350-review");

  fs.mkdirSync(canonicalPath, { recursive: true });
  fs.mkdirSync(exactPath, { recursive: true });
  fs.mkdirSync(loosePath, { recursive: true });

  const candidates = findWorkspaceCandidates("AGE-350", testRegistry({
    canonicalPath,
    workspaceRoots: [workspaceRoot]
  }));

  assert.deepEqual(
    candidates.map((candidate) => [candidate.path, candidate.matchType]),
    [
      [exactPath, "template"],
      [loosePath, "directory-contains"]
    ]
  );
});

test("infers issue id from issue worktree path but not canonical checkout", (t) => {
  const root = tempDir(t);
  const canonicalPath = path.join(root, "canonical");
  const workspaceRoot = path.join(root, "workspaces");
  const workspacePath = path.join(workspaceRoot, "AGE-350");
  const nestedWorkspacePath = path.join(workspacePath, "scripts", "lib");

  fs.mkdirSync(canonicalPath, { recursive: true });
  fs.mkdirSync(nestedWorkspacePath, { recursive: true });

  const registry = testRegistry({
    canonicalPath,
    workspaceRoots: [workspaceRoot]
  });

  assert.equal(inferIssueIdFromCwd(nestedWorkspacePath, registry).issueId, "AGE-350");
  assert.equal(inferIssueIdFromCwd(canonicalPath, registry), undefined);
});
