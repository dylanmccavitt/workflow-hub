import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
export const trackedConfigPath = path.join(repoRoot, "config", "projects.example.json");
export const localConfigPath = path.join(repoRoot, "config", "projects.json");

const SCHEMA_VERSION = 1;
const DEFAULT_SIMULATOR_NAME = "iPhone 17 Pro";
const DEFAULT_DERIVED_DATA_ROOT = "/tmp";
const DEFAULT_CURSOR_MODEL = "composer-2";
const DEFAULT_CURSOR_CONFIG_PATH = ".cursor";
const DEFAULT_CURSOR_API_KEY_ENV = "CURSOR_API_KEY";
const ISSUE_ID_PATTERN = /[a-z]+-\d+/i;

export class ProjectConfigValidationError extends Error {
  constructor(errors) {
    super(`Invalid project config:\n${errors.map((error) => `- ${error}`).join("\n")}`);
    this.name = "ProjectConfigValidationError";
    this.errors = errors;
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse ${filePath}: ${error.message}`);
    }
    throw error;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, override) {
  const merged = clone(base);

  for (const [key, value] of Object.entries(override)) {
    if (Array.isArray(value)) {
      merged[key] = clone(value);
      continue;
    }

    if (isRecord(value) && isRecord(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
      continue;
    }

    merged[key] = clone(value);
  }

  return merged;
}

function mergeProjectConfigs(baseConfig, localConfig) {
  if (!localConfig) return clone(baseConfig);

  const merged = deepMerge(
    Object.fromEntries(Object.entries(baseConfig).filter(([key]) => key !== "projects")),
    Object.fromEntries(Object.entries(localConfig).filter(([key]) => key !== "projects"))
  );

  const projectsById = new Map();

  for (const project of baseConfig.projects ?? []) {
    if (isRecord(project) && typeof project.id === "string") {
      projectsById.set(project.id, clone(project));
    }
  }

  for (const project of localConfig.projects ?? []) {
    if (!isRecord(project) || typeof project.id !== "string") {
      continue;
    }

    const existing = projectsById.get(project.id);
    projectsById.set(project.id, existing ? deepMerge(existing, project) : clone(project));
  }

  merged.projects = [...projectsById.values()];
  return merged;
}

function validateLocalOverrideShape(localConfig) {
  const errors = [];

  if (!isRecord(localConfig)) {
    throw new ProjectConfigValidationError(["local override config root must be an object"]);
  }

  if (localConfig.schemaVersion !== undefined && localConfig.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`local override schemaVersion must be ${SCHEMA_VERSION} when present`);
  }

  if (localConfig.projects !== undefined) {
    if (!Array.isArray(localConfig.projects)) {
      errors.push("local override projects must be an array when present");
    } else {
      const seenIds = new Set();

      localConfig.projects.forEach((project, index) => {
        if (!isRecord(project)) {
          errors.push(`local override projects[${index}] must be an object`);
          return;
        }

        if (!isNonEmptyString(project.id)) {
          errors.push(`local override projects[${index}].id is required for merge`);
          return;
        }

        if (seenIds.has(project.id)) {
          errors.push(`local override projects[${index}].id "${project.id}" is duplicated`);
          return;
        }

        seenIds.add(project.id);
      });
    }
  }

  if (errors.length > 0) {
    throw new ProjectConfigValidationError(errors);
  }
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function expandPath(input) {
  if (!isNonEmptyString(input)) return input;
  if (input === "~") return os.homedir();
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function isDirectory(filePath) {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function pathContains(parentPath, childPath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function candidateKey(project, workspacePath) {
  return `${project.id}:${path.resolve(workspacePath)}`;
}

function matchRank(matchType) {
  if (matchType === "template") return 100;
  if (matchType === "directory-name") return 90;
  return 60;
}

function addCandidate(candidatesByKey, candidate) {
  const key = candidateKey(candidate.project, candidate.path);
  const existing = candidatesByKey.get(key);

  if (!existing || matchRank(candidate.matchType) > matchRank(existing.matchType)) {
    candidatesByKey.set(key, candidate);
  }
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return undefined;
  }

  return result.stdout.trim();
}

export function normalizeIssueId(issueId) {
  if (!isNonEmptyString(issueId) || !/^[a-z]+-\d+$/i.test(issueId.trim())) {
    throw new Error("issueId must look like AGE-350");
  }

  return issueId.trim().toUpperCase();
}

function isAbsoluteConfigPath(value) {
  return isNonEmptyString(value) && path.isAbsolute(expandPath(value));
}

function validateOptionalString(errors, value, field) {
  if (value !== undefined && !isNonEmptyString(value)) {
    errors.push(`${field} must be a non-empty string when present`);
  }
}

function validateProject(project, index, seenIds) {
  const errors = [];
  const prefix = `projects[${index}]`;

  if (!isRecord(project)) {
    return [`${prefix} must be an object`];
  }

  if (!isNonEmptyString(project.id)) {
    errors.push(`${prefix}.id is required`);
  } else if (seenIds.has(project.id)) {
    errors.push(`${prefix}.id "${project.id}" is duplicated`);
  } else {
    seenIds.add(project.id);
  }

  if (!isNonEmptyString(project.displayName)) {
    errors.push(`${prefix}.displayName is required`);
  }

  if (!isRecord(project.repo)) {
    errors.push(`${prefix}.repo is required`);
  } else {
    if (!isAbsoluteConfigPath(project.repo.canonicalPath)) {
      errors.push(`${prefix}.repo.canonicalPath must be an absolute path or ~/ path`);
    }
    validateOptionalString(errors, project.repo.canonicalBranch, `${prefix}.repo.canonicalBranch`);
  }

  if (!isRecord(project.worktrees)) {
    errors.push(`${prefix}.worktrees is required`);
  } else {
    if (!Array.isArray(project.worktrees.roots) || project.worktrees.roots.length === 0) {
      errors.push(`${prefix}.worktrees.roots must contain at least one workspace root`);
    } else {
      project.worktrees.roots.forEach((root, rootIndex) => {
        if (!isAbsoluteConfigPath(root)) {
          errors.push(`${prefix}.worktrees.roots[${rootIndex}] must be an absolute path or ~/ path`);
        }
      });
    }
    validateOptionalString(errors, project.worktrees.issuePathTemplate, `${prefix}.worktrees.issuePathTemplate`);
    validateOptionalString(errors, project.worktrees.branchTemplate, `${prefix}.worktrees.branchTemplate`);
  }

  if (project.linear !== undefined) {
    if (!isRecord(project.linear)) {
      errors.push(`${prefix}.linear must be an object when present`);
    } else {
      validateOptionalString(errors, project.linear.teamKey, `${prefix}.linear.teamKey`);
      validateOptionalString(errors, project.linear.projectId, `${prefix}.linear.projectId`);
      validateOptionalString(errors, project.linear.projectSlug, `${prefix}.linear.projectSlug`);
    }
  }

  if (project.ios !== undefined) {
    if (!isRecord(project.ios)) {
      errors.push(`${prefix}.ios must be an object when present`);
    } else {
      if (!isNonEmptyString(project.ios.projectPath) && !isNonEmptyString(project.ios.workspacePath)) {
        errors.push(`${prefix}.ios.projectPath or ${prefix}.ios.workspacePath is required when ios is present`);
      }
      if (!isNonEmptyString(project.ios.scheme)) {
        errors.push(`${prefix}.ios.scheme is required when ios is present`);
      }
      if (!isNonEmptyString(project.ios.bundleId)) {
        errors.push(`${prefix}.ios.bundleId is required when ios is present`);
      }
      validateOptionalString(errors, project.ios.simulatorName, `${prefix}.ios.simulatorName`);
      if (project.ios.derivedDataRoot !== undefined && !isAbsoluteConfigPath(project.ios.derivedDataRoot)) {
        errors.push(`${prefix}.ios.derivedDataRoot must be an absolute path or ~/ path when present`);
      }
    }
  }

  if (project.runners !== undefined) {
    if (!isRecord(project.runners)) {
      errors.push(`${prefix}.runners must be an object when present`);
    } else {
      const cursor = project.runners.cursor;
      if (cursor !== undefined) {
        if (!isRecord(cursor)) {
          errors.push(`${prefix}.runners.cursor must be an object when present`);
        } else {
          validateOptionalString(errors, cursor.model, `${prefix}.runners.cursor.model`);
          validateOptionalString(errors, cursor.configPath, `${prefix}.runners.cursor.configPath`);
          validateOptionalString(errors, cursor.apiKeyEnv, `${prefix}.runners.cursor.apiKeyEnv`);
        }
      }
    }
  }

  return errors;
}

export function validateProjectConfig(config) {
  const errors = [];

  if (!isRecord(config)) {
    throw new ProjectConfigValidationError(["config root must be an object"]);
  }

  if (config.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }

  if (!Array.isArray(config.projects) || config.projects.length === 0) {
    errors.push("projects must contain at least one project");
  } else {
    const seenIds = new Set();
    config.projects.forEach((project, index) => {
      errors.push(...validateProject(project, index, seenIds));
    });
  }

  if (errors.length > 0) {
    throw new ProjectConfigValidationError(errors);
  }

  return config;
}

function normalizeProject(project) {
  const ios = project.ios
    ? {
        projectPath: project.ios.projectPath,
        workspacePath: project.ios.workspacePath,
        scheme: project.ios.scheme,
        bundleId: project.ios.bundleId,
        simulatorName: project.ios.simulatorName ?? DEFAULT_SIMULATOR_NAME,
        derivedDataRoot: expandPath(project.ios.derivedDataRoot ?? DEFAULT_DERIVED_DATA_ROOT)
      }
    : undefined;
  const runners = project.runners
    ? {
        cursor: project.runners.cursor
          ? {
              model: project.runners.cursor.model ?? DEFAULT_CURSOR_MODEL,
              configPath: project.runners.cursor.configPath ?? DEFAULT_CURSOR_CONFIG_PATH,
              apiKeyEnv: project.runners.cursor.apiKeyEnv ?? DEFAULT_CURSOR_API_KEY_ENV
            }
          : undefined
      }
    : undefined;

  return {
    id: project.id,
    displayName: project.displayName,
    linear: project.linear ?? {},
    canonicalPath: expandPath(project.repo.canonicalPath),
    canonicalBranch: project.repo.canonicalBranch ?? "main",
    workspaceRoots: project.worktrees.roots.map(expandPath),
    issuePathTemplate: project.worktrees.issuePathTemplate ?? "{issueId}",
    branchTemplate: project.worktrees.branchTemplate ?? "feat/{issueIdLower}-{slug}",
    runners,
    ios
  };
}

export function readProjectConfig() {
  const baseConfig = readJson(trackedConfigPath);
  const hasLocalConfig = fs.existsSync(localConfigPath);
  const localConfig = hasLocalConfig ? readJson(localConfigPath) : undefined;
  if (localConfig) validateLocalOverrideShape(localConfig);
  const mergedConfig = mergeProjectConfigs(baseConfig, localConfig);

  validateProjectConfig(mergedConfig);

  return {
    config: mergedConfig,
    projects: mergedConfig.projects.map(normalizeProject),
    source: {
      trackedConfigPath,
      localConfigPath: hasLocalConfig ? localConfigPath : undefined,
      hasLocalConfig
    }
  };
}

export function renderIssuePath(template, issueId) {
  return template
    .replaceAll("{issueId}", issueId)
    .replaceAll("{issueIdLower}", issueId.toLowerCase());
}

export function findWorkspaceCandidates(issueId, registry = readProjectConfig()) {
  const normalizedIssueId = normalizeIssueId(issueId);
  const issueIdLower = normalizedIssueId.toLowerCase();
  const candidatesByKey = new Map();

  for (const project of registry.projects) {
    for (const root of project.workspaceRoots) {
      if (!isDirectory(root)) continue;

      const templated = path.join(root, renderIssuePath(project.issuePathTemplate, normalizedIssueId));
      if (isDirectory(templated)) {
        addCandidate(candidatesByKey, {
          issueId: normalizedIssueId,
          project,
          root,
          path: templated,
          matchType: "template"
        });
      }

      for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const fullPath = path.join(root, entry.name);
        const entryName = entry.name.toLowerCase();

        if (entryName === issueIdLower || entryName.includes(issueIdLower)) {
          addCandidate(candidatesByKey, {
            issueId: normalizedIssueId,
            project,
            root,
            path: fullPath,
            matchType: entryName === issueIdLower ? "directory-name" : "directory-contains"
          });
        }
      }
    }
  }

  return [...candidatesByKey.values()].sort((left, right) => {
    const rankDelta = matchRank(right.matchType) - matchRank(left.matchType);
    if (rankDelta !== 0) return rankDelta;
    return left.path.localeCompare(right.path);
  });
}

export function findWorkspace(issueId, registry = readProjectConfig()) {
  const candidates = findWorkspaceCandidates(issueId, registry);
  return candidates[0];
}

export function inferIssueIdFromCwd(cwd = process.cwd(), registry = readProjectConfig()) {
  const currentPath = path.resolve(cwd);

  for (const project of registry.projects) {
    if (isDirectory(project.canonicalPath) && pathContains(project.canonicalPath, currentPath)) {
      return undefined;
    }
  }

  for (const project of registry.projects) {
    for (const root of project.workspaceRoots) {
      if (!isDirectory(root) || !pathContains(root, currentPath)) continue;

      const relativePath = path.relative(root, currentPath);
      const workspaceName = relativePath.split(path.sep).filter(Boolean)[0];
      const match = workspaceName?.match(ISSUE_ID_PATTERN);

      if (match) {
        return {
          issueId: normalizeIssueId(match[0]),
          project,
          root,
          path: path.join(root, workspaceName)
        };
      }
    }
  }

  return undefined;
}

export function gitStatusForPath(targetPath) {
  if (!isDirectory(targetPath)) {
    return {
      exists: false,
      branch: undefined,
      headSha: undefined,
      remote: undefined,
      upstream: undefined,
      dirty: undefined,
      statusLines: []
    };
  }

  const statusText = runGit(["status", "--short", "--branch"], targetPath);
  if (statusText === undefined) {
    return {
      exists: true,
      branch: undefined,
      headSha: undefined,
      remote: undefined,
      upstream: undefined,
      dirty: undefined,
      statusLines: []
    };
  }

  const statusLines = statusText.split("\n").filter(Boolean);

  return {
    exists: true,
    branch: runGit(["branch", "--show-current"], targetPath) || undefined,
    headSha: runGit(["rev-parse", "--short", "HEAD"], targetPath) || undefined,
    remote: runGit(["remote", "get-url", "origin"], targetPath) || undefined,
    upstream: runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], targetPath) || undefined,
    dirty: statusLines.slice(1).length > 0,
    statusLines
  };
}

export function resolveIssueWorkspace(issueId, registry = readProjectConfig()) {
  const normalizedIssueId = normalizeIssueId(issueId);
  const candidates = findWorkspaceCandidates(normalizedIssueId, registry);
  const match = candidates[0];

  if (!match) {
    return {
      issueId: normalizedIssueId,
      found: false,
      searchedRoots: registry.projects.flatMap((project) => project.workspaceRoots.map((root) => ({
        projectId: project.id,
        root
      }))),
      candidates: []
    };
  }

  const workspaceGit = gitStatusForPath(match.path);
  const canonicalGit = gitStatusForPath(match.project.canonicalPath);

  return {
    issueId: normalizedIssueId,
    found: true,
    project: {
      id: match.project.id,
      displayName: match.project.displayName,
      linear: match.project.linear
    },
    canonical: {
      path: match.project.canonicalPath,
      expectedBranch: match.project.canonicalBranch,
      exists: canonicalGit.exists,
      branch: canonicalGit.branch,
      headSha: canonicalGit.headSha,
      dirty: canonicalGit.dirty,
      statusLines: canonicalGit.statusLines
    },
    workspace: {
      path: match.path,
      root: match.root,
      matchType: match.matchType,
      branch: workspaceGit.branch,
      headSha: workspaceGit.headSha,
      remote: workspaceGit.remote,
      upstream: workspaceGit.upstream,
      dirty: workspaceGit.dirty,
      statusLines: workspaceGit.statusLines
    },
    candidates: candidates.map((candidate) => ({
      projectId: candidate.project.id,
      root: candidate.root,
      path: candidate.path,
      matchType: candidate.matchType
    }))
  };
}

export function requireIosConfig(project) {
  if (!project?.ios) {
    throw new Error(`${project?.id ?? "Selected project"} does not define ios settings in project config.`);
  }

  return project.ios;
}

export function xcodeTargetArgs(ios) {
  if (ios.workspacePath) return ["-workspace", ios.workspacePath];
  return ["-project", ios.projectPath];
}

export function derivedDataPath(project, issueId) {
  const ios = requireIosConfig(project);
  return path.join(ios.derivedDataRoot, `WorkflowHubDerivedData-${issueId}`);
}
