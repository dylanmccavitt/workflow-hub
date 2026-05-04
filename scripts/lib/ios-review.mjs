import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  derivedDataPath,
  requireIosConfig,
  xcodeTargetArgs
} from "./project-config.mjs";
import {
  defaultRegistryDatabasePath
} from "./registry-db.mjs";

const DEFAULT_LOG_ROOT = "review-logs";
const SIMULATOR_REVIEW_TARGET = "simulator";
const DEVICE_REVIEW_TARGET = "device";
const DEVICE_TARGET_GUIDANCE = "Select a connected, trusted iPhone or iPad in Xcode's run destination menu, confirm the configured scheme and bundle ID, then run from Xcode.";
const SIGNING_CAVEATS = [
  "Workflow Hub opens Xcode only; Apple signing, provisioning profiles, and device trust remain local Xcode state.",
  "Workflow Hub does not save credentials, bypass signing, or change signing settings."
];

export class IosReviewError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "IosReviewError";
    this.details = details;
  }
}

export function runIosSimulatorReview({
  issueId,
  project,
  workspace,
  repository,
  captureScreenshot = false,
  clock = () => new Date(),
  processRunner = runProcess,
  logRoot
}) {
  if (!issueId) {
    throw new IosReviewError("issueId is required for simulator review.");
  }
  if (!project) {
    throw new IosReviewError("project is required for simulator review.");
  }
  if (!workspace?.path) {
    throw new IosReviewError("resolved issue workspace is required for simulator review.");
  }
  if (!repository) {
    throw new IosReviewError("registry repository is required to record simulator review state.");
  }

  const ios = requireIosConfig(project);
  const startedAt = clock().toISOString();
  const sessionId = randomUUID();
  const derivedData = derivedDataPath(project, issueId);
  const logPath = reviewLogPath({ issueId, sessionId, logRoot });
  const screenshotPath = captureScreenshot
    ? reviewScreenshotPath({ issueId, sessionId, logRoot })
    : undefined;
  const commands = [];
  const records = upsertReviewRecords({
    repository,
    project,
    issueId,
    workspace,
    clock
  });

  writeLog(logPath, [
    `Workflow Hub simulator review`,
    `Issue: ${issueId}`,
    `Project: ${project.displayName} (${project.id})`,
    `Workspace: ${workspace.path}`,
    `DerivedData: ${derivedData}`,
    `Started: ${startedAt}`,
    ""
  ].join("\n"));

  const baseSession = {
    id: sessionId,
    issueId: records.issue.id,
    workspaceId: records.workspace.id,
    target: SIMULATOR_REVIEW_TARGET,
    startedAt,
    notes: `Simulator review for ${issueId}`,
    metadata: {
      issueIdentifier: issueId,
      projectId: project.id,
      workspacePath: workspace.path,
      derivedDataPath: derivedData,
      logPath,
      screenshotRequested: captureScreenshot,
      screenshotPath
    }
  };

  repository.upsertReviewSession({
    ...baseSession,
    status: "running"
  });
  repository.recordEvent({
    issueId: records.issue.id,
    entityType: "review",
    entityId: sessionId,
    type: "review.simulator.started",
    message: `${issueId} simulator review started`,
    payload: {
      target: SIMULATOR_REVIEW_TARGET,
      workspacePath: workspace.path,
      derivedDataPath: derivedData,
      logPath
    },
    createdAt: startedAt
  });

  try {
    const simulator = selectAvailableSimulator({
      simulatorName: ios.simulatorName,
      processRunner,
      logPath,
      commands
    });

    bootAndOpenSimulator({
      simulator,
      processRunner,
      logPath,
      commands
    });

    runLoggedCommand({
      label: "build",
      command: "xcodebuild",
      args: [
        ...xcodeTargetArgs(ios),
        "-scheme",
        ios.scheme,
        "-destination",
        `platform=iOS Simulator,id=${simulator.udid}`,
        "-derivedDataPath",
        derivedData,
        "build"
      ],
      cwd: workspace.path,
      processRunner,
      logPath,
      commands
    });

    const appPath = findBuiltAppByBundleId({
      derivedData,
      bundleId: ios.bundleId,
      processRunner,
      logPath,
      commands
    });

    runLoggedCommand({
      label: "install",
      command: "xcrun",
      args: ["simctl", "install", simulator.udid, appPath],
      processRunner,
      logPath,
      commands
    });

    runLoggedCommand({
      label: "launch",
      command: "xcrun",
      args: ["simctl", "launch", simulator.udid, ios.bundleId],
      processRunner,
      logPath,
      commands
    });

    if (captureScreenshot) {
      runLoggedCommand({
        label: "screenshot",
        command: "xcrun",
        args: ["simctl", "io", simulator.udid, "screenshot", screenshotPath],
        processRunner,
        logPath,
        commands
      });
    }

    const finishedAt = clock().toISOString();
    const evidence = buildSimulatorEvidence({
      issueId,
      status: "succeeded",
      sessionId,
      startedAt,
      finishedAt,
      logPath,
      screenshotPath,
      screenshotCaptured: captureScreenshot,
      simulator,
      bundleId: ios.bundleId,
      appPath,
      derivedDataPath: derivedData
    });
    const metadata = {
      ...baseSession.metadata,
      simulator,
      appPath,
      commands,
      evidence
    };
    const session = repository.upsertReviewSession({
      ...baseSession,
      status: "succeeded",
      finishedAt,
      metadata
    });
    const event = repository.recordEvent({
      issueId: records.issue.id,
      entityType: "review",
      entityId: sessionId,
      type: "review.simulator.succeeded",
      message: `${issueId} simulator review launched ${ios.bundleId}`,
      payload: {
        target: SIMULATOR_REVIEW_TARGET,
        simulator,
        appPath,
        bundleId: ios.bundleId,
        derivedDataPath: derivedData,
        logPath,
        screenshotPath,
        evidence
      },
      createdAt: finishedAt
    });

    appendLog(logPath, `\nFinished: ${finishedAt}\nStatus: succeeded\nEvidence: ${evidence.summary}\n`);

    return {
      issueId,
      projectId: project.id,
      status: "succeeded",
      session,
      event,
      simulator,
      bundleId: ios.bundleId,
      appPath,
      derivedDataPath: derivedData,
      logPath,
      screenshotPath,
      evidence,
      commands
    };
  } catch (error) {
    const finishedAt = clock().toISOString();
    const message = errorMessage(error);
    const screenshotCaptured = captureScreenshot && fs.existsSync(screenshotPath);
    const evidence = buildSimulatorEvidence({
      issueId,
      status: "failed",
      sessionId,
      startedAt,
      finishedAt,
      logPath,
      screenshotPath,
      screenshotCaptured,
      derivedDataPath: derivedData,
      error: message
    });
    const metadata = {
      ...baseSession.metadata,
      commands,
      error: message,
      evidence
    };
    const session = repository.upsertReviewSession({
      ...baseSession,
      status: "failed",
      finishedAt,
      notes: message,
      metadata
    });
    const event = repository.recordEvent({
      issueId: records.issue.id,
      entityType: "review",
      entityId: sessionId,
      type: "review.simulator.failed",
      message: `${issueId} simulator review failed`,
      payload: {
        target: SIMULATOR_REVIEW_TARGET,
        error: message,
        derivedDataPath: derivedData,
        logPath,
        screenshotPath,
        evidence
      },
      createdAt: finishedAt
    });

    appendLog(logPath, `\nFinished: ${finishedAt}\nStatus: failed\nError: ${message}\nEvidence: ${evidence.summary}\n`);

    if (error instanceof IosReviewError) {
      error.details = {
        ...error.details,
        session,
        event,
        logPath,
        derivedDataPath: derivedData,
        screenshotPath,
        evidence
      };
      throw error;
    }

    throw new IosReviewError(message, {
      session,
      event,
      logPath,
      derivedDataPath: derivedData,
      screenshotPath,
      evidence
    });
  }
}

export function runIosDeviceReview({
  issueId,
  project,
  workspace,
  repository,
  clock = () => new Date(),
  processRunner = runProcess,
  logRoot
}) {
  if (!issueId) {
    throw new IosReviewError("issueId is required for device review.");
  }
  if (!project) {
    throw new IosReviewError("project is required for device review.");
  }
  if (!workspace?.path) {
    throw new IosReviewError("resolved issue workspace is required for device review.");
  }
  if (!repository) {
    throw new IosReviewError("registry repository is required to record device review state.");
  }

  const ios = requireIosConfig(project);
  const startedAt = clock().toISOString();
  const sessionId = randomUUID();
  const xcodeTarget = ios.workspacePath ?? ios.projectPath;
  const xcodePath = path.join(workspace.path, xcodeTarget);
  const logPath = reviewLogPath({ issueId, sessionId, logRoot });
  const commands = [];
  const records = upsertReviewRecords({
    repository,
    project,
    issueId,
    workspace,
    clock
  });

  writeLog(logPath, [
    "Workflow Hub device review",
    `Issue: ${issueId}`,
    `Project: ${project.displayName} (${project.id})`,
    `Workspace: ${workspace.path}`,
    `Xcode target: ${xcodePath}`,
    `Scheme: ${ios.scheme}`,
    `Bundle ID: ${ios.bundleId}`,
    `Device target: ${DEVICE_TARGET_GUIDANCE}`,
    "Signing caveats:",
    ...SIGNING_CAVEATS.map((caveat) => `- ${caveat}`),
    `Started: ${startedAt}`,
    ""
  ].join("\n"));

  const baseSession = {
    id: sessionId,
    issueId: records.issue.id,
    workspaceId: records.workspace.id,
    target: DEVICE_REVIEW_TARGET,
    startedAt,
    notes: `Device review for ${issueId}`,
    metadata: {
      issueIdentifier: issueId,
      projectId: project.id,
      workspacePath: workspace.path,
      xcodePath,
      scheme: ios.scheme,
      bundleId: ios.bundleId,
      deviceTargetGuidance: DEVICE_TARGET_GUIDANCE,
      signingCaveats: SIGNING_CAVEATS,
      logPath
    }
  };

  repository.upsertReviewSession({
    ...baseSession,
    status: "requested"
  });
  repository.recordEvent({
    issueId: records.issue.id,
    entityType: "review",
    entityId: sessionId,
    type: "review.device.requested",
    message: `${issueId} device review requested`,
    payload: {
      target: DEVICE_REVIEW_TARGET,
      workspacePath: workspace.path,
      xcodePath,
      scheme: ios.scheme,
      bundleId: ios.bundleId,
      logPath
    },
    createdAt: startedAt
  });

  try {
    if (!fs.existsSync(xcodePath)) {
      throw new IosReviewError(`Xcode target not found at ${xcodePath}.`, { xcodePath });
    }

    runLoggedCommand({
      label: "open-xcode",
      command: "open",
      args: ["-a", "Xcode", xcodePath],
      processRunner,
      logPath,
      commands
    });

    const finishedAt = clock().toISOString();
    const evidence = buildDeviceEvidence({
      issueId,
      status: "launched",
      sessionId,
      startedAt,
      finishedAt,
      logPath,
      xcodePath,
      scheme: ios.scheme,
      bundleId: ios.bundleId
    });
    const metadata = {
      ...baseSession.metadata,
      commands,
      evidence
    };
    const session = repository.upsertReviewSession({
      ...baseSession,
      status: "launched",
      finishedAt,
      metadata
    });
    const event = repository.recordEvent({
      issueId: records.issue.id,
      entityType: "review",
      entityId: sessionId,
      type: "review.device.launched",
      message: `${issueId} device review opened Xcode`,
      payload: {
        target: DEVICE_REVIEW_TARGET,
        xcodePath,
        scheme: ios.scheme,
        bundleId: ios.bundleId,
        deviceTargetGuidance: DEVICE_TARGET_GUIDANCE,
        signingCaveats: SIGNING_CAVEATS,
        logPath,
        evidence
      },
      createdAt: finishedAt
    });

    appendLog(logPath, `\nFinished: ${finishedAt}\nStatus: launched\nEvidence: ${evidence.summary}\n`);

    return {
      issueId,
      projectId: project.id,
      target: DEVICE_REVIEW_TARGET,
      status: "launched",
      session,
      event,
      xcodePath,
      scheme: ios.scheme,
      bundleId: ios.bundleId,
      deviceTargetGuidance: DEVICE_TARGET_GUIDANCE,
      signingCaveats: SIGNING_CAVEATS,
      logPath,
      evidence,
      commands
    };
  } catch (error) {
    const finishedAt = clock().toISOString();
    const message = errorMessage(error);
    const evidence = buildDeviceEvidence({
      issueId,
      status: "failed",
      sessionId,
      startedAt,
      finishedAt,
      logPath,
      xcodePath,
      scheme: ios.scheme,
      bundleId: ios.bundleId,
      error: message
    });
    const metadata = {
      ...baseSession.metadata,
      commands,
      error: message,
      evidence
    };
    const session = repository.upsertReviewSession({
      ...baseSession,
      status: "failed",
      finishedAt,
      notes: message,
      metadata
    });
    const event = repository.recordEvent({
      issueId: records.issue.id,
      entityType: "review",
      entityId: sessionId,
      type: "review.device.failed",
      message: `${issueId} device review failed`,
      payload: {
        target: DEVICE_REVIEW_TARGET,
        error: message,
        xcodePath,
        scheme: ios.scheme,
        bundleId: ios.bundleId,
        logPath,
        evidence
      },
      createdAt: finishedAt
    });

    appendLog(logPath, `\nFinished: ${finishedAt}\nStatus: failed\nError: ${message}\nEvidence: ${evidence.summary}\n`);

    if (error instanceof IosReviewError) {
      error.details = {
        ...error.details,
        session,
        event,
        logPath,
        xcodePath,
        evidence
      };
      throw error;
    }

    throw new IosReviewError(message, {
      session,
      event,
      logPath,
      xcodePath,
      evidence
    });
  }
}

export function selectAvailableSimulator({
  simulatorName,
  processRunner = runProcess,
  logPath,
  commands = []
}) {
  const result = runLoggedCommand({
    label: "list-simulators",
    command: "xcrun",
    args: ["simctl", "list", "devices", "available", "--json"],
    processRunner,
    logPath,
    commands,
    captureStdout: true
  });
  let payload;

  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    throw new IosReviewError(`Unable to parse available simulator list: ${errorMessage(error)}`);
  }

  const devices = Object.entries(payload.devices ?? {}).flatMap(([runtime, runtimeDevices]) => {
    if (!Array.isArray(runtimeDevices)) return [];
    return runtimeDevices
      .filter((device) => device?.isAvailable !== false)
      .map((device) => ({
        name: device.name,
        udid: device.udid,
        state: device.state,
        runtime
      }));
  });
  const matches = devices
    .filter((device) => device.name === simulatorName && device.udid)
    .sort(compareSimulators);

  if (matches.length === 0) {
    const availableNames = [...new Set(devices.map((device) => device.name).filter(Boolean))].sort();
    throw new IosReviewError(
      `No available simulator named ${simulatorName}. Available simulators: ${availableNames.join(", ") || "none"}.`,
      { availableSimulators: availableNames }
    );
  }

  return matches[0];
}

export function findBuiltAppByBundleId({
  derivedData,
  bundleId,
  processRunner = runProcess,
  logPath,
  commands = []
}) {
  const productsRoot = path.join(derivedData, "Build", "Products");
  const appPaths = findAppBundles(productsRoot)
    .sort((left, right) => mtimeMs(right) - mtimeMs(left));

  for (const appPath of appPaths) {
    const infoPlistPath = path.join(appPath, "Info.plist");
    if (!fs.existsSync(infoPlistPath)) continue;

    const result = runLoggedCommand({
      label: "read-bundle-id",
      command: "plutil",
      args: ["-extract", "CFBundleIdentifier", "raw", "-o", "-", infoPlistPath],
      processRunner,
      logPath,
      commands,
      captureStdout: true,
      allowFailure: true
    });

    if (result.status === 0 && result.stdout.trim() === bundleId) {
      return appPath;
    }
  }

  throw new IosReviewError(
    `Build completed, but no .app with bundle id ${bundleId} was found under ${productsRoot}.`,
    { productsRoot, bundleId }
  );
}

function bootAndOpenSimulator({ simulator, processRunner, logPath, commands }) {
  if (simulator.state !== "Booted") {
    runLoggedCommand({
      label: "boot-simulator",
      command: "xcrun",
      args: ["simctl", "boot", simulator.udid],
      processRunner,
      logPath,
      commands
    });
    runLoggedCommand({
      label: "wait-for-simulator",
      command: "xcrun",
      args: ["simctl", "bootstatus", simulator.udid, "-b"],
      processRunner,
      logPath,
      commands
    });
  }

  runLoggedCommand({
    label: "open-simulator",
    command: "open",
    args: ["-a", "Simulator"],
    processRunner,
    logPath,
    commands
  });
}

function runLoggedCommand({
  label,
  command,
  args,
  cwd,
  processRunner,
  logPath,
  commands,
  captureStdout = false,
  allowFailure = false
}) {
  if (logPath) {
    appendLog(logPath, [
      `$ ${shellQuote([command, ...args])}`,
      cwd ? `cwd: ${cwd}` : undefined
    ].filter(Boolean).join("\n") + "\n");
  }

  const result = processRunner(command, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 50
  });
  const stdout = result.stdout?.toString?.() ?? "";
  const stderr = result.stderr?.toString?.() ?? "";
  const signal = typeof result.signal === "string" && result.signal.length > 0
    ? result.signal
    : undefined;
  const status = typeof result.status === "number"
    ? result.status
    : result.error || signal
      ? 1
      : 0;

  if (logPath) {
    appendLog(logPath, [
      stdout ? `stdout:\n${stdout}` : undefined,
      stderr ? `stderr:\n${stderr}` : undefined,
      `exit: ${status}`,
      signal ? `signal: ${signal}` : undefined,
      ""
    ].filter(Boolean).join("\n"));
  }

  commands.push({
    label,
    command,
    args,
    cwd,
    status,
    signal
  });

  if (result.error && !allowFailure) {
    throw new IosReviewError(`${label} failed to start: ${errorMessage(result.error)}`, {
      command,
      args,
      cwd
    });
  }

  if (status !== 0 && !allowFailure) {
    const logDetail = logPath ? ` See ${logPath}.` : "";
    const reason = signal
      ? `terminated by signal ${signal}`
      : `failed with exit code ${status}`;
    throw new IosReviewError(`${label} ${reason}.${logDetail}`, {
      command,
      args,
      cwd,
      status,
      signal,
      logPath
    });
  }

  return {
    status,
    stdout: captureStdout ? stdout : "",
    stderr
  };
}

function upsertReviewRecords({ repository, project, issueId, workspace, clock }) {
  const now = clock().toISOString();
  const projectRecord = repository.upsertProject({
    id: project.id,
    displayName: project.displayName,
    repoPath: project.canonicalPath,
    linearTeamKey: project.linear?.teamKey,
    linearProjectId: project.linear?.projectId,
    metadata: {
      source: "project-config",
      updatedBy: "ios-review",
      updatedAt: now
    }
  });
  const existingIssue = repository.getIssueByIdentifier(project.id, issueId);
  const issue = repository.upsertIssue({
    id: existingIssue?.id ?? `${project.id}:${issueId}`,
    projectId: project.id,
    identifier: issueId,
    title: existingIssue?.title ?? `${issueId} iOS review`,
    status: existingIssue?.status ?? "Review",
    linearUrl: existingIssue?.linearUrl,
    priority: existingIssue?.priority,
    metadata: {
      ...(existingIssue?.metadata ?? {}),
      reviewSessionTouchedAt: now
    }
  });
  const existingWorkspace = repository
    .listWorkspacesByPath(workspace.path)
    .find((candidate) => candidate.issueId === issue.id);
  const workspaceRecord = repository.upsertWorkspace({
    id: existingWorkspace?.id ?? `${issue.id}:workspace`,
    issueId: issue.id,
    path: workspace.path,
    branch: workspace.branch,
    baseBranch: project.canonicalBranch,
    headSha: workspace.headSha,
    dirty: Boolean(workspace.dirty),
    metadata: {
      ...(existingWorkspace?.metadata ?? {}),
      projectId: project.id,
      projectName: project.displayName,
      root: workspace.root,
      matchType: workspace.matchType,
      remote: workspace.remote,
      upstream: workspace.upstream,
      gitStatus: workspace.statusLines,
      touchedAt: now
    }
  });

  return {
    project: projectRecord,
    issue,
    workspace: workspaceRecord
  };
}

function findAppBundles(root) {
  if (!fs.existsSync(root)) return [];

  const entries = fs.readdirSync(root, { withFileTypes: true });
  const matches = [];

  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name.endsWith(".app")) {
      matches.push(entryPath);
      continue;
    }
    matches.push(...findAppBundles(entryPath));
  }

  return matches;
}

function reviewLogPath({ issueId, sessionId, logRoot }) {
  const root = logRoot
    ?? path.join(path.dirname(defaultRegistryDatabasePath()), DEFAULT_LOG_ROOT);
  return path.join(root, issueId, `${sessionId}.log`);
}

function reviewScreenshotPath({ issueId, sessionId, logRoot }) {
  const root = logRoot
    ?? path.join(path.dirname(defaultRegistryDatabasePath()), DEFAULT_LOG_ROOT);
  return path.join(root, issueId, `${sessionId}.png`);
}

function buildSimulatorEvidence({
  issueId,
  status,
  sessionId,
  startedAt,
  finishedAt,
  logPath,
  screenshotPath,
  screenshotCaptured = false,
  simulator,
  bundleId,
  appPath,
  derivedDataPath,
  error
}) {
  const screenshotText = screenshotCaptured
    ? ` Screenshot: ${screenshotPath}.`
    : screenshotPath
      ? ` Screenshot requested but not captured: ${screenshotPath}.`
      : " Screenshot: not requested.";
  const simulatorText = simulator?.name ? ` on ${simulator.name}` : "";
  const bundleText = bundleId ? ` for ${bundleId}` : "";
  const errorText = error ? ` Error: ${error}.` : "";

  return compactObject({
    issueId,
    target: SIMULATOR_REVIEW_TARGET,
    status,
    sessionId,
    startedAt,
    finishedAt,
    logPath,
    screenshotPath,
    screenshotCaptured,
    simulator,
    bundleId,
    appPath,
    derivedDataPath,
    error,
    summary: `${issueId} simulator review ${status}${bundleText}${simulatorText}. Log: ${logPath}.${screenshotText}${errorText}`
  });
}

function buildDeviceEvidence({
  issueId,
  status,
  sessionId,
  startedAt,
  finishedAt,
  logPath,
  xcodePath,
  scheme,
  bundleId,
  error
}) {
  const bundleText = bundleId ? ` for ${bundleId}` : "";
  const errorText = error ? ` Error: ${error}.` : "";

  return compactObject({
    issueId,
    target: DEVICE_REVIEW_TARGET,
    status,
    sessionId,
    startedAt,
    finishedAt,
    logPath,
    xcodePath,
    scheme,
    bundleId,
    error,
    summary: `${issueId} device review ${status}${bundleText}. Xcode: ${xcodePath}. Log: ${logPath}.${errorText}`
  });
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function writeLog(logPath, body) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.writeFileSync(logPath, body);
}

function appendLog(logPath, body) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, body);
}

function compareSimulators(left, right) {
  const booted = Number(right.state === "Booted") - Number(left.state === "Booted");
  if (booted !== 0) return booted;
  return runtimeSortValue(right.runtime) - runtimeSortValue(left.runtime);
}

function runtimeSortValue(runtime) {
  const match = String(runtime).match(/iOS-([0-9]+)(?:-([0-9]+))?/);
  if (!match) return 0;
  return Number(match[1]) * 1000 + Number(match[2] ?? 0);
}

function shellQuote(parts) {
  return parts.map((part) => {
    const value = String(part);
    if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) return value;
    return `'${value.replaceAll("'", "'\\''")}'`;
  }).join(" ");
}

function mtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function runProcess(command, args, options) {
  return spawnSync(command, args, options);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
