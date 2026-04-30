const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workflowHub", {
  version: "0.1.0",
  platform: process.platform,
  resolveIssueWorkspace(issueId) {
    return ipcRenderer.invoke("workflow-hub:resolve-issue-workspace", issueId);
  }
});
