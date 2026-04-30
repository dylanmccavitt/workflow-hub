/// <reference types="vite/client" />

import type { ResolvedWorkspace } from "./lib/types";

declare global {
  interface Window {
    workflowHub?: {
      version: string;
      platform: string;
      resolveIssueWorkspace(issueId: string): Promise<ResolvedWorkspace>;
    };
  }
}

export {};
