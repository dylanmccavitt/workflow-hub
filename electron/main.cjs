const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged;
const localApiModuleUrl = pathToFileURL(
  path.join(__dirname, "..", "scripts", "lib", "local-api-service.mjs")
).href;
let localApiServicePromise;

<<<<<<< HEAD
async function getLocalApiService() {
  if (!localApiServicePromise) {
    localApiServicePromise = import(localApiModuleUrl)
      .then(({ createLocalApiService }) => createLocalApiService());
  }

  return localApiServicePromise;
}

ipcMain.handle("workflow-hub:get-issue-state", async (_event, issueId) => {
  const localApiService = await getLocalApiService();
  return localApiService.getIssueState(issueId);
});
=======
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
>>>>>>> 6e3f02e ([age-350]: add issue workspace resolver)

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
