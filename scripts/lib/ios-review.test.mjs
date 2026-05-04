import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  findBuiltAppByBundleId,
  runIosDeviceReview,
  runIosSimulatorReview,
  selectAvailableSimulator
} from "./ios-review.mjs";
import {
  createRegistryRepository,
  openRegistryDatabase
} from "./registry-db.mjs";

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-hub-ios-review-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function testProject(root) {
  return {
    id: "chores",
    displayName: "ChoreLadder / Still Haven't",
    canonicalPath: path.join(root, "canonical"),
    canonicalBranch: "main",
    linear: { teamKey: "AGE" },
    ios: {
      projectPath: "ChoreLadder.xcodeproj",
      scheme: "ChoreLadder",
      bundleId: "com.example.ChoreLadder",
      simulatorName: "iPhone 17 Pro",
      derivedDataRoot: path.join(root, "DerivedData")
    }
  };
}

function testWorkspace(root) {
  return {
    path: path.join(root, "AGE-481"),
    root,
    matchType: "template",
    branch: "feat/age-481-ios-review",
    headSha: "abc1234",
    dirty: false,
    statusLines: []
  };
}

function simctlListPayload(devices) {
  return JSON.stringify({
    devices: {
      "com.apple.CoreSimulator.SimRuntime.iOS-26-0": devices.ios260 ?? [],
      "com.apple.CoreSimulator.SimRuntime.iOS-26-4": devices.ios264 ?? []
    }
  });
}

test("selects an available configured simulator instead of trusting stale device names", () => {
  const calls = [];
  const processRunner = (command, args) => {
    calls.push([command, ...args]);
    return {
      status: 0,
      stdout: simctlListPayload({
        ios260: [
          { name: "iPhone 17 Pro", udid: "old-sim", state: "Shutdown", isAvailable: true }
        ],
        ios264: [
          { name: "iPhone 17 Pro", udid: "booted-sim", state: "Booted", isAvailable: true }
        ]
      }),
      stderr: ""
    };
  };

  const simulator = selectAvailableSimulator({
    simulatorName: "iPhone 17 Pro",
    processRunner,
    commands: []
  });

  assert.equal(simulator.udid, "booted-sim");
  assert.deepEqual(calls[0], ["xcrun", "simctl", "list", "devices", "available", "--json"]);
});

test("finds the built app by configured bundle id", (t) => {
  const root = tempDir(t);
  const appPath = path.join(root, "Build", "Products", "Debug-iphonesimulator", "ChoreLadder.app");
  fs.mkdirSync(appPath, { recursive: true });
  fs.writeFileSync(path.join(appPath, "Info.plist"), "plist placeholder");

  const found = findBuiltAppByBundleId({
    derivedData: root,
    bundleId: "com.example.ChoreLadder",
    processRunner(command, args) {
      assert.equal(command, "plutil");
      assert.equal(args.at(-1), path.join(appPath, "Info.plist"));
      return {
        status: 0,
        stdout: "com.example.ChoreLadder\n",
        stderr: ""
      };
    },
    commands: []
  });

  assert.equal(found, appPath);
});

test("builds, installs, launches, and records a simulator review session", (t) => {
  const root = tempDir(t);
  const project = testProject(root);
  const workspace = testWorkspace(root);
  const issueId = "AGE-481";
  const derivedData = path.join(project.ios.derivedDataRoot, `WorkflowHubDerivedData-${issueId}`);
  const appPath = path.join(derivedData, "Build", "Products", "Debug-iphonesimulator", "ChoreLadder.app");
  const logRoot = path.join(root, "logs");
  const calls = [];
  const repository = createRegistryRepository(openRegistryDatabase(":memory:"));
  t.after(() => repository.close());

  fs.mkdirSync(workspace.path, { recursive: true });
  fs.mkdirSync(appPath, { recursive: true });
  fs.writeFileSync(path.join(appPath, "Info.plist"), "plist placeholder");

  const result = runIosSimulatorReview({
    issueId,
    project,
    workspace,
    repository,
    logRoot,
    clock: () => new Date("2026-05-04T15:00:00.000Z"),
    processRunner(command, args) {
      calls.push([command, ...args]);
      if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
        return {
          status: 0,
          stdout: simctlListPayload({
            ios264: [
              { name: "iPhone 17 Pro", udid: "sim-1", state: "Shutdown", isAvailable: true }
            ]
          }),
          stderr: ""
        };
      }
      if (command === "plutil") {
        return { status: 0, stdout: `${project.ios.bundleId}\n`, stderr: "" };
      }
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(result.status, "succeeded");
  assert.equal(result.simulator.udid, "sim-1");
  assert.equal(result.appPath, appPath);
  assert.equal(result.derivedDataPath, derivedData);
  assert.equal(fs.existsSync(result.logPath), true);
  assert.ok(calls.some((call) => call.join(" ") === "xcrun simctl boot sim-1"));
  assert.ok(calls.some((call) => call.join(" ") === "xcrun simctl bootstatus sim-1 -b"));
  assert.ok(calls.some((call) => call.join(" ") === "open -a Simulator"));
  assert.ok(calls.some((call) => call[0] === "xcodebuild" && call.includes(`platform=iOS Simulator,id=sim-1`)));
  assert.ok(calls.some((call) => call.join(" ") === `xcrun simctl install sim-1 ${appPath}`));
  assert.ok(calls.some((call) => call.join(" ") === `xcrun simctl launch sim-1 ${project.ios.bundleId}`));

  const issue = repository.getIssueByIdentifier(project.id, issueId);
  const sessions = repository.listIssueReviewSessions(issue.id);
  const events = repository.listIssueEvents(issue.id);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].status, "succeeded");
  assert.equal(sessions[0].metadata.logPath, result.logPath);
  assert.deepEqual(
    events.map((event) => event.type),
    ["review.simulator.started", "review.simulator.succeeded"]
  );
});

test("opens the issue worktree Xcode project and records a device review session", (t) => {
  const root = tempDir(t);
  const project = testProject(root);
  const workspace = testWorkspace(root);
  const issueId = "AGE-481";
  const xcodePath = path.join(workspace.path, project.ios.projectPath);
  const logRoot = path.join(root, "logs");
  const calls = [];
  const repository = createRegistryRepository(openRegistryDatabase(":memory:"));
  t.after(() => repository.close());

  fs.mkdirSync(xcodePath, { recursive: true });

  const result = runIosDeviceReview({
    issueId,
    project,
    workspace,
    repository,
    logRoot,
    clock: () => new Date("2026-05-04T15:00:00.000Z"),
    processRunner(command, args) {
      calls.push([command, ...args]);
      return { status: 0, stdout: "", stderr: "" };
    }
  });

  assert.equal(result.status, "launched");
  assert.equal(result.target, "device");
  assert.equal(result.xcodePath, xcodePath);
  assert.equal(result.scheme, project.ios.scheme);
  assert.equal(result.bundleId, project.ios.bundleId);
  assert.match(result.deviceTargetGuidance, /connected, trusted/);
  assert.ok(result.signingCaveats.some((caveat) => caveat.includes("does not save credentials")));
  assert.equal(fs.existsSync(result.logPath), true);
  assert.deepEqual(calls, [["open", "-a", "Xcode", xcodePath]]);

  const issue = repository.getIssueByIdentifier(project.id, issueId);
  const sessions = repository.listIssueReviewSessions(issue.id);
  const events = repository.listIssueEvents(issue.id);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].target, "device");
  assert.equal(sessions[0].status, "launched");
  assert.equal(sessions[0].metadata.xcodePath, xcodePath);
  assert.equal(sessions[0].metadata.scheme, project.ios.scheme);
  assert.equal(sessions[0].metadata.bundleId, project.ios.bundleId);
  assert.deepEqual(
    events.map((event) => event.type),
    ["review.device.requested", "review.device.launched"]
  );
});

test("records a failed device review session when the Xcode target is missing", (t) => {
  const root = tempDir(t);
  const project = testProject(root);
  const workspace = testWorkspace(root);
  const repository = createRegistryRepository(openRegistryDatabase(":memory:"));
  t.after(() => repository.close());
  fs.mkdirSync(workspace.path, { recursive: true });

  assert.throws(
    () => runIosDeviceReview({
      issueId: "AGE-481",
      project,
      workspace,
      repository,
      logRoot: path.join(root, "logs"),
      clock: () => new Date("2026-05-04T15:00:00.000Z"),
      processRunner() {
        throw new Error("open should not run when the Xcode target is missing");
      }
    }),
    /Xcode target not found/
  );

  const issue = repository.getIssueByIdentifier(project.id, "AGE-481");
  const sessions = repository.listIssueReviewSessions(issue.id);
  const events = repository.listIssueEvents(issue.id);
  assert.equal(sessions[0].target, "device");
  assert.equal(sessions[0].status, "failed");
  assert.match(sessions[0].metadata.error, /Xcode target not found/);
  assert.deepEqual(
    events.map((event) => event.type),
    ["review.device.requested", "review.device.failed"]
  );
});

test("records a failed simulator review session when xcodebuild fails", (t) => {
  const root = tempDir(t);
  const project = testProject(root);
  const workspace = testWorkspace(root);
  const repository = createRegistryRepository(openRegistryDatabase(":memory:"));
  t.after(() => repository.close());
  fs.mkdirSync(workspace.path, { recursive: true });

  assert.throws(
    () => runIosSimulatorReview({
      issueId: "AGE-481",
      project,
      workspace,
      repository,
      logRoot: path.join(root, "logs"),
      clock: () => new Date("2026-05-04T15:00:00.000Z"),
      processRunner(command, args) {
        if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
          return {
            status: 0,
            stdout: simctlListPayload({
              ios264: [
                { name: "iPhone 17 Pro", udid: "sim-1", state: "Booted", isAvailable: true }
              ]
            }),
            stderr: ""
          };
        }
        if (command === "xcodebuild") {
          return { status: 65, stdout: "", stderr: "build failed" };
        }
        return { status: 0, stdout: "", stderr: "" };
      }
    }),
    /build failed with exit code 65/
  );

  const issue = repository.getIssueByIdentifier(project.id, "AGE-481");
  const sessions = repository.listIssueReviewSessions(issue.id);
  const events = repository.listIssueEvents(issue.id);
  assert.equal(sessions[0].status, "failed");
  assert.match(sessions[0].metadata.error, /build failed with exit code 65/);
  assert.deepEqual(
    events.map((event) => event.type),
    ["review.simulator.started", "review.simulator.failed"]
  );
});

test("treats a signaled xcodebuild as a failed simulator review", (t) => {
  const root = tempDir(t);
  const project = testProject(root);
  const workspace = testWorkspace(root);
  const repository = createRegistryRepository(openRegistryDatabase(":memory:"));
  const derivedData = path.join(project.ios.derivedDataRoot, "WorkflowHubDerivedData-AGE-481");
  const appPath = path.join(derivedData, "Build", "Products", "Debug-iphonesimulator", "ChoreLadder.app");
  t.after(() => repository.close());
  fs.mkdirSync(workspace.path, { recursive: true });
  fs.mkdirSync(appPath, { recursive: true });
  fs.writeFileSync(path.join(appPath, "Info.plist"), "plist placeholder");

  assert.throws(
    () => runIosSimulatorReview({
      issueId: "AGE-481",
      project,
      workspace,
      repository,
      logRoot: path.join(root, "logs"),
      clock: () => new Date("2026-05-04T15:00:00.000Z"),
      processRunner(command, args) {
        if (command === "xcrun" && args.join(" ") === "simctl list devices available --json") {
          return {
            status: 0,
            stdout: simctlListPayload({
              ios264: [
                { name: "iPhone 17 Pro", udid: "sim-1", state: "Booted", isAvailable: true }
              ]
            }),
            stderr: ""
          };
        }
        if (command === "xcodebuild") {
          return { status: null, signal: "SIGTERM", stdout: "", stderr: "terminated" };
        }
        if (command === "plutil") {
          return { status: 0, stdout: `${project.ios.bundleId}\n`, stderr: "" };
        }
        return { status: 0, stdout: "", stderr: "" };
      }
    }),
    /build terminated by signal SIGTERM/
  );

  const issue = repository.getIssueByIdentifier(project.id, "AGE-481");
  const sessions = repository.listIssueReviewSessions(issue.id);
  assert.equal(sessions[0].status, "failed");
  assert.equal(sessions[0].metadata.commands.find((command) => command.label === "build").signal, "SIGTERM");
  assert.match(sessions[0].metadata.error, /build terminated by signal SIGTERM/);
});
