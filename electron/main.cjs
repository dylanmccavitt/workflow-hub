const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged;
const repoRoot = path.join(__dirname, "..");
const workflowCliPath = path.join(repoRoot, "scripts", "workflow-hub.mjs");
const projectConfigModuleUrl = pathToFileURL(
  path.join(repoRoot, "scripts", "lib", "project-config.mjs")
).href;

function nodeExecutable() {
  return process.env.WORKFLOW_HUB_NODE_PATH
    ?? process.env.npm_node_execpath
    ?? process.env.NODE
    ?? "node";
}

function startupIssueQuery() {
  const issueId = process.env.WORKFLOW_HUB_ISSUE_ID ?? path.basename(process.cwd());

  if (!/^[a-z]+-\d+$/i.test(issueId)) {
    return "";
  }

  return `?issue=${encodeURIComponent(issueId.toUpperCase())}`;
}

function runWorkflowJsonCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(nodeExecutable(), [workflowCliPath, ...args, "--json"], {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Workflow Hub local API command timed out."));
    }, 15000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);

      if (code !== 0) {
        reject(new Error(stderr.trim() || `Workflow Hub local API command exited with code ${code}.`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Workflow Hub local API returned invalid JSON: ${error.message}`));
      }
    });
  });
}

async function getIssueState(_event, issueId) {
  if (typeof issueId !== "string") {
    throw new Error("issueId must be a string.");
  }

  return runWorkflowJsonCommand(["api-state", issueId]);
}

ipcMain.handle("workflow-hub:get-issue-state", getIssueState);

async function resolveIssueWorkspace(_event, inputIssueId) {
  const {
    normalizeIssueId,
    resolveIssueWorkspace: resolveWorkspaceFromConfig
  } = await import(projectConfigModuleUrl);
  const issueId = normalizeIssueId(inputIssueId);
  const resolved = resolveWorkspaceFromConfig(issueId);

  if (!resolved.found) {
    return {
      issueId,
      found: false
    };
  }

  return {
    issueId,
    found: true,
    projectId: resolved.project.id,
    projectName: resolved.project.displayName,
    canonicalPath: resolved.canonical.path,
    canonicalBranch: resolved.canonical.branch,
    canonicalDirty: resolved.canonical.dirty,
    path: resolved.workspace.path,
    branch: resolved.workspace.branch,
    headSha: resolved.workspace.headSha,
    remote: resolved.workspace.remote,
    dirty: resolved.workspace.dirty,
    gitStatus: resolved.workspace.statusLines
  };
}

ipcMain.handle("workflow-hub:resolve-issue-workspace", resolveIssueWorkspace);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    title: "Workflow Hub",
    backgroundColor: "#0e0f0d",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    mainWindow.loadURL(`http://127.0.0.1:5173/${startupIssueQuery()}`);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
