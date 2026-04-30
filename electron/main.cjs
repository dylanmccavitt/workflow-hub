const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged;
const projectConfigModuleUrl = pathToFileURL(
  path.join(__dirname, "..", "scripts", "lib", "project-config.mjs")
).href;

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

function normalizeIssueId(issueId) {
  if (typeof issueId !== "string" || !/^[a-z]+-\d+$/i.test(issueId.trim())) {
    throw new Error("issueId must look like AGE-346");
  }

  return issueId.trim().toUpperCase();
}

async function resolveIssueWorkspace(_event, inputIssueId) {
  const issueId = normalizeIssueId(inputIssueId);
  const { findWorkspace } = await import(projectConfigModuleUrl);
  const match = findWorkspace(issueId);

  if (!match) {
    return {
      issueId,
      found: false
    };
  }

  const branch = runGit(["branch", "--show-current"], match.path);
  const headSha = runGit(["rev-parse", "--short", "HEAD"], match.path);
  const remote = runGit(["remote", "get-url", "origin"], match.path);
  const statusText = runGit(["status", "--short", "--branch"], match.path) ?? "";
  const gitStatus = statusText.split("\n").filter(Boolean);
  const dirty = gitStatus.slice(1).length > 0;

  return {
    issueId,
    found: true,
    projectId: match.project.id,
    projectName: match.project.displayName,
    path: match.path,
    branch,
    headSha,
    remote,
    dirty,
    gitStatus
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
    mainWindow.loadURL("http://127.0.0.1:5173");
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
