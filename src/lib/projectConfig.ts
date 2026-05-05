export interface ProjectRegistryConfig {
  schemaVersion: 1;
  projects: ProjectConfig[];
}

export interface ProjectConfig {
  id: string;
  displayName: string;
  linear?: ProjectLinearConfig;
  repo: ProjectRepoConfig;
  worktrees: ProjectWorktreeConfig;
  runners?: ProjectRunnerConfig;
  ios?: ProjectIosConfig;
}

export interface ProjectLinearConfig {
  teamKey?: string;
  projectId?: string;
  projectSlug?: string;
}

export interface ProjectRepoConfig {
  canonicalPath: string;
  canonicalBranch?: string;
}

export interface ProjectWorktreeConfig {
  roots: string[];
  issuePathTemplate?: string;
  branchTemplate?: string;
}

export interface ProjectRunnerConfig {
  cursor?: ProjectCursorRunnerConfig;
}

export interface ProjectCursorRunnerConfig {
  model?: string;
  configPath?: string;
  apiKeyEnv?: string;
  cloud?: ProjectCursorCloudRunnerConfig;
}

export interface ProjectCursorCloudRunnerConfig {
  enabled?: boolean;
  apiKeyEnv?: string;
  baseUrl?: string;
  repositoryUrl?: string;
  startingRef?: string;
  environment?: {
    type?: "cloud" | "pool" | "machine";
    name?: string;
  };
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
  skipReviewerRequest?: boolean;
}

export interface ProjectIosConfig {
  projectPath?: string;
  workspacePath?: string;
  scheme: string;
  bundleId: string;
  simulatorName?: string;
  derivedDataRoot?: string;
}
