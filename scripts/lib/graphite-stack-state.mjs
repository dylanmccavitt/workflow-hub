import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  parseGitHubPullRequestUrl,
  parseGitHubRepository
} from "./github-pr-state.mjs";

const BRANCH_HEADER_PATTERN = /^[\u25c9\u25ef\u25cb\u25cf\u25cc\u25ce\u25c7\u25c6]\s+(.+?)(?:\s+\((current)\))?$/u;
const DEFAULT_GRAPHITE_URL = "https://app.graphite.com/";

export function readGraphiteStackState(options = {}) {
  const {
    issue,
    workspace,
    githubPullRequestState,
    graphiteRunner = runGraphite,
    gitRunner = runGit,
    isGraphiteInitialized = graphiteInitialized
  } = options;
  const candidates = resolveGraphiteCandidates({ issue, workspace, githubPullRequestState });
  const repository = resolveRepository({ workspace, candidates, githubPullRequestState });
  const pullRequest = githubPullRequestState?.pullRequest;
  const currentBranch = preferredBranch({ workspace, pullRequest, candidates });
  const deepLink = graphiteDeepLink({
    repository,
    number: pullRequest?.number ?? candidates.find((candidate) => candidate.number)?.number
  });

  if (!workspace?.path) {
    return graphiteState({
      status: "not-configured",
      detail: "Graphite stack sync needs a resolved issue workspace.",
      candidates,
      deepLink
    });
  }

  const version = runGraphiteText(["--version"], graphiteRunner, workspace.path);
  if (!version.ok) {
    return graphiteState({
      status: "not-configured",
      detail: `Graphite CLI is unavailable: ${version.error}`,
      candidates,
      deepLink
    });
  }

  if (!isGraphiteInitialized(workspace.path, gitRunner)) {
    return graphiteState({
      status: "not-configured",
      detail: "Graphite CLI is installed, but this repository is not initialized for Graphite. Showing a Graphite deep link only.",
      candidates,
      deepLink
    });
  }

  const log = runGraphiteText(["log", "--stack", "--no-interactive"], graphiteRunner, workspace.path);
  if (!log.ok) {
    if (isUntrackedBranchError(log.error)) {
      return graphiteState({
        status: "not-found",
        detail: `Graphite is initialized, but ${currentBranch ?? "this branch"} is not tracked in a Graphite stack.`,
        candidates,
        deepLink
      });
    }

    return graphiteState({
      status: "unavailable",
      detail: `Graphite stack sync failed: ${log.error}`,
      candidates,
      deepLink
    });
  }

  const parsed = parseGraphiteLog(log.stdout);
  const trunk = readBranchNames(["trunk", "--no-interactive"], graphiteRunner, workspace.path);
  const targetBranch = candidates
    .map((candidate) => candidate.branch)
    .find((branch) => parsed.branches.some((entry) => entry.name === branch))
    ?? parsed.currentBranch
    ?? currentBranch;

  if (!targetBranch) {
    return graphiteState({
      status: "not-found",
      detail: "Graphite stack sync could not identify a branch to match.",
      candidates,
      deepLink
    });
  }

  const parent = readBranchNames(["parent", "--no-interactive"], graphiteRunner, workspace.path);
  const children = readBranchNames(["children", "--no-interactive"], graphiteRunner, workspace.path);
  const stack = buildGraphiteStack({
    parsed,
    targetBranch,
    trunkName: trunk.ok ? trunk.names[0] : undefined,
    parentNames: parent.ok ? parent.names : [],
    childNames: children.ok ? children.names : [],
    repository,
    pullRequest,
    fallbackDeepLink: deepLink
  });

  if (!stack) {
    return graphiteState({
      status: "not-found",
      detail: `No Graphite stack entry matched ${targetBranch}.`,
      candidates,
      deepLink
    });
  }

  return graphiteState({
    status: "available",
    detail: detailForStack(stack),
    candidates,
    stack,
    deepLink: stack.deepLink
  });
}

export function resolveGraphiteCandidates({ issue, workspace, githubPullRequestState } = {}) {
  const candidates = [];
  const githubPullRequest = githubPullRequestState?.pullRequest;
  const linearIssue = issue?.linear;

  if (githubPullRequest) {
    candidates.push({
      source: "github-pr",
      label: `GitHub PR #${githubPullRequest.number}`,
      number: githubPullRequest.number,
      url: githubPullRequest.url,
      branch: githubPullRequest.headRefName,
      repository: {
        owner: githubPullRequest.owner,
        repo: githubPullRequest.repo
      }
    });
  }

  for (const pullRequest of linearIssue?.pullRequests ?? []) {
    const parsedUrl = parseGitHubPullRequestUrl(pullRequest.url);
    candidates.push({
      source: "linear-pr",
      label: pullRequest.number ? `Linear PR #${pullRequest.number}` : "Linear PR attachment",
      number: parsedUrl?.number ?? pullRequest.number,
      url: pullRequest.url,
      branch: pullRequest.branch,
      repository: parsedUrl
        ? {
            owner: parsedUrl.owner,
            repo: parsedUrl.repo
          }
        : undefined
    });
  }

  if (workspace?.branch) {
    candidates.push({
      source: "git-branch",
      label: `Workspace branch ${workspace.branch}`,
      branch: workspace.branch
    });
  }

  if (linearIssue?.branchName && linearIssue.branchName !== workspace?.branch) {
    candidates.push({
      source: "linear-branch",
      label: `Linear branch ${linearIssue.branchName}`,
      branch: linearIssue.branchName
    });
  }

  return dedupeCandidates(candidates);
}

export function parseGraphiteLog(output) {
  const branches = [];
  let currentEntry;

  for (const line of stripAnsi(output).split(/\r?\n/)) {
    const parsedHeader = parseBranchHeader(line);
    if (parsedHeader) {
      currentEntry = {
        name: parsedHeader.name,
        current: parsedHeader.current,
        block: []
      };
      branches.push(currentEntry);
      continue;
    }

    if (currentEntry) {
      currentEntry.block.push(line);
    }
  }

  const normalizedBranches = branches.map((branch) => normalizeGraphiteBranch(branch));

  return {
    branches: normalizedBranches,
    currentBranch: normalizedBranches.find((branch) => branch.current)?.name
  };
}

function buildGraphiteStack({
  parsed,
  targetBranch,
  trunkName,
  parentNames,
  childNames,
  repository,
  pullRequest,
  fallbackDeepLink
}) {
  const resolvedTrunkName = trunkName ?? parsed.branches.find((branch) => branch.trunk)?.name ?? "main";
  const branches = parsed.branches.map((branch) => ({
    ...branch,
    trunk: branch.trunk || branch.name === resolvedTrunkName,
    graphiteUrl: branch.graphiteUrl ?? graphiteDeepLink({ repository, number: branch.prNumber }),
    githubUrl: branch.githubUrl,
    mergeState: branch.mergeState
  }));
  const reviewBranches = branches.filter((branch) => !branch.trunk);
  const positionedBranches = branches.map((branch) => {
    if (branch.trunk) return branch;
    const reviewIndex = reviewBranches.findIndex((candidate) => candidate.name === branch.name);
    return {
      ...branch,
      position: reviewBranches.length - reviewIndex
    };
  });
  const current = positionedBranches.find((branch) => branch.name === targetBranch);

  if (!current || current.trunk) return undefined;

  const currentIndex = positionedBranches.findIndex((branch) => branch.name === current.name);
  const parentFallback = positionedBranches.slice(currentIndex + 1).find((branch) => !branch.trunk);
  const childrenFallback = positionedBranches.slice(0, currentIndex).filter((branch) => !branch.trunk).slice(-1);
  const parent = parentNames
    .map((name) => positionedBranches.find((branch) => branch.name === name && !branch.trunk))
    .find(Boolean)
    ?? parentFallback;
  const children = childNames.length > 0
    ? childNames
        .map((name) => positionedBranches.find((branch) => branch.name === name && !branch.trunk))
        .filter(Boolean)
    : childrenFallback;
  const mergedCurrent = mergeCurrentBranchState({
    current,
    pullRequest,
    repository,
    fallbackDeepLink
  });

  return {
    provider: "Graphite",
    currentBranch: mergedCurrent.name,
    trunk: resolvedTrunkName,
    position: mergedCurrent.position,
    totalBranches: reviewBranches.length,
    parent,
    children,
    branches: positionedBranches,
    submitted: Boolean(mergedCurrent.prNumber || pullRequest?.number),
    submitState: mergedCurrent.submitState ?? (pullRequest?.number ? "Submitted" : "Local only"),
    mergeState: mergeStateForPullRequest(pullRequest) ?? mergedCurrent.mergeState,
    deepLink: mergedCurrent.graphiteUrl ?? fallbackDeepLink ?? DEFAULT_GRAPHITE_URL
  };
}

function mergeCurrentBranchState({ current, pullRequest, repository, fallbackDeepLink }) {
  if (!pullRequest) {
    return {
      ...current,
      graphiteUrl: current.graphiteUrl ?? fallbackDeepLink ?? graphiteDeepLink({ repository, number: current.prNumber })
    };
  }

  return {
    ...current,
    prNumber: current.prNumber ?? pullRequest.number,
    githubUrl: current.githubUrl ?? pullRequest.url,
    graphiteUrl: current.graphiteUrl ?? graphiteDeepLink({ repository, number: pullRequest.number }) ?? fallbackDeepLink,
    submitState: current.submitState ?? "Submitted"
  };
}

function normalizeGraphiteBranch(branch) {
  const blockText = branch.block.join("\n");
  const graphiteUrl = firstMatch(blockText, /https:\/\/app\.graphite\.com\/[^\s)]+/i);
  const githubUrl = firstMatch(blockText, /https:\/\/github\.com\/[^\s)]+\/pull\/\d+[^\s)]*/i);
  const parsedGraphitePr = graphiteUrl
    ? /\/github\/pr\/[^/]+\/[^/]+\/(\d+)/i.exec(graphiteUrl)
    : undefined;
  const parsedGitHubPr = githubUrl ? parseGitHubPullRequestUrl(githubUrl) : undefined;
  const prNumber = parsedGraphitePr?.[1]
    ? Number(parsedGraphitePr[1])
    : parsedGitHubPr?.number ?? numericMatch(blockText, /\bPR\s*#?(\d+)\b/i);

  return {
    name: branch.name,
    current: branch.current,
    trunk: isLikelyTrunk(branch.name),
    prNumber,
    githubUrl,
    graphiteUrl,
    submitState: submitStateFromBlock(blockText, prNumber, graphiteUrl),
    mergeState: mergeStateFromBlock(blockText)
  };
}

function parseBranchHeader(line) {
  const trimmed = line.trim();
  const match = BRANCH_HEADER_PATTERN.exec(trimmed);
  if (!match) return undefined;

  return {
    name: match[1].trim(),
    current: Boolean(match[2])
  };
}

function submitStateFromBlock(blockText, prNumber, graphiteUrl) {
  if (/not submitted|unsubmitted|local only/i.test(blockText)) return "Local only";
  const parenthetical = /\b(?:PR\s*#?\d+|pull request)[^\n]*\(([^)]+)\)/i.exec(blockText);
  if (parenthetical?.[1]) return titleCase(parenthetical[1]);
  if (/\b(created|updated|submitted|open|draft|closed|merged)\b/i.test(blockText)) {
    return titleCase(RegExp.$1);
  }
  return prNumber || graphiteUrl ? "Submitted" : undefined;
}

function mergeStateFromBlock(blockText) {
  const match = /\b(mergeable|merged|blocked|queued|closed|draft)\b/i.exec(blockText);
  return match ? titleCase(match[1]) : undefined;
}

function mergeStateForPullRequest(pullRequest) {
  if (!pullRequest) return undefined;
  if (pullRequest.isDraft) return "Draft";
  return [pullRequest.state, pullRequest.mergeStateStatus || pullRequest.mergeable]
    .filter(Boolean)
    .map(titleCase)
    .join(" / ");
}

function detailForStack(stack) {
  const position = stack.position && stack.totalBranches
    ? `position ${stack.position}/${stack.totalBranches}`
    : "position unknown";
  const parent = stack.parent ? ` parent ${stack.parent.name}.` : " no parent PR.";
  const children = stack.children.length > 0
    ? ` ${stack.children.length} child PR${stack.children.length === 1 ? "" : "s"}.`
    : " no child PRs.";
  return `Graphite stack detected for ${stack.currentBranch}: ${position}; ${stack.submitState}; ${stack.mergeState ?? "merge state unknown"};${parent}${children}`;
}

function readBranchNames(args, graphiteRunner, cwd) {
  const result = runGraphiteText(args, graphiteRunner, cwd);
  if (!result.ok) return { ok: false, names: [] };

  return {
    ok: true,
    names: result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !/^No\b/i.test(line) && !/^ERROR\b/i.test(line))
      .map((line) => parseBranchHeader(line)?.name ?? line.replace(/^[-*]\s+/, "").trim())
      .filter(Boolean)
  };
}

function preferredBranch({ workspace, pullRequest, candidates }) {
  return pullRequest?.headRefName
    ?? workspace?.branch
    ?? candidates.find((candidate) => candidate.branch)?.branch;
}

function resolveRepository({ workspace, candidates, githubPullRequestState }) {
  const githubPullRequest = githubPullRequestState?.pullRequest;
  if (githubPullRequest) {
    return {
      owner: githubPullRequest.owner,
      repo: githubPullRequest.repo
    };
  }

  return candidates.find((candidate) => candidate.repository)?.repository
    ?? parseGitHubRepository(workspace?.remote);
}

function graphiteState({ status, detail, candidates = [], stack, deepLink }) {
  return {
    provider: "Graphite",
    status,
    detail,
    candidates,
    stack,
    deepLink,
    adapter: adapterState(
      "pr:graphite",
      "Graphite stack",
      status,
      detail,
      status !== "available"
    )
  };
}

function adapterState(id, label, status, detail, recoverable) {
  return {
    id,
    label,
    status,
    detail,
    recoverable,
    ownerIssue: recoverable ? "AGE-359" : undefined
  };
}

function graphiteDeepLink({ repository, number }) {
  if (repository?.owner && repository?.repo && number) {
    return `https://app.graphite.com/github/pr/${repository.owner}/${repository.repo}/${number}`;
  }

  return DEFAULT_GRAPHITE_URL;
}

function graphiteInitialized(cwd, gitRunner) {
  const gitDirResult = gitRunner(["rev-parse", "--git-dir"], cwd);
  const commonGitDirResult = gitRunner(["rev-parse", "--git-common-dir"], cwd);
  const gitDirs = [gitDirResult, commonGitDirResult]
    .filter((result) => result.ok)
    .map((result) => resolveGitPath(cwd, result.stdout));

  return gitDirs.some((gitDir) => fs.existsSync(path.join(gitDir, ".graphite_repo_config")));
}

function resolveGitPath(cwd, value) {
  return path.isAbsolute(value)
    ? value
    : path.resolve(cwd, value);
}

function runGraphiteText(args, graphiteRunner, cwd) {
  const result = graphiteRunner(args, cwd);
  if (!result.ok) {
    return {
      ok: false,
      error: result.error ?? "gt command failed."
    };
  }

  return {
    ok: true,
    stdout: stripAnsi(result.stdout ?? "").trim()
  };
}

function runGraphite(args, cwd) {
  const result = spawnSync("gt", args, {
    cwd,
    encoding: "utf8"
  });

  if (result.error) {
    return { ok: false, error: result.error.message };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `gt exited with status ${result.status}`).trim()
    };
  }

  return {
    ok: true,
    stdout: result.stdout.trim()
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

function firstMatch(value, pattern) {
  return pattern.exec(value)?.[0];
}

function numericMatch(value, pattern) {
  const match = pattern.exec(value);
  return match?.[1] ? Number(match[1]) : undefined;
}

function stripAnsi(value) {
  return String(value ?? "").replace(/\u001b\[[0-9;]*m/g, "");
}

function isLikelyTrunk(branch) {
  return branch === "main" || branch === "master" || branch === "trunk";
}

function isUntrackedBranchError(error) {
  return /untracked branch|gt track|not tracked/i.test(error ?? "");
}

function titleCase(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const deduped = [];

  for (const candidate of candidates) {
    const key = [
      candidate.source,
      candidate.repository?.owner,
      candidate.repository?.repo,
      candidate.number,
      candidate.url,
      candidate.branch
    ].filter(Boolean).join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }

  return deduped;
}
