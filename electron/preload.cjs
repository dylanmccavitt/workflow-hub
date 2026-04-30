const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workflowHub", {
  version: "0.1.0",
  platform: process.platform,
  issues: {
    getState(issueId) {
      return ipcRenderer.invoke("workflow-hub:get-issue-state", issueId);
    }
  }
});
