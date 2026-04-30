const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const isDev = !app.isPackaged;
const localApiModuleUrl = pathToFileURL(
  path.join(__dirname, "..", "scripts", "lib", "local-api-service.mjs")
).href;
let localApiServicePromise;

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
