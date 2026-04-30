/// <reference types="vite/client" />

import type { WorkflowHubApi } from "./lib/workflowHubApi";

declare global {
  interface Window {
    workflowHub?: WorkflowHubApi;
  }
}

export {};
