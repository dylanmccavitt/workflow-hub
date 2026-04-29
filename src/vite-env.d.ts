/// <reference types="vite/client" />

interface Window {
  workflowHub?: {
    version: string;
    platform: string;
  };
}
