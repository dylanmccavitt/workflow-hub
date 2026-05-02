export const SECURITY_GUARDRAIL_VERSION = "2026-05-01";

export class SecurityGuardrailError extends Error {
  constructor(message, code = "SECURITY_GUARDRAIL_ERROR", details = {}) {
    super(message);
    this.name = "SecurityGuardrailError";
    this.code = code;
    this.details = details;
  }
}

export const SECURITY_ACTION_POLICIES = [
  {
    id: "linear-status",
    label: "Linear status and Workpad write",
    risk: "external-write",
    destination: "Linear",
    confirmationRequired: "action-dependent",
    sensitiveDataConfirmationRequired: true,
    detail: "Status actions use their per-state confirmation rules; Workpad notes are scanned before being sent to Linear."
  },
  {
    id: "dispatch-ready",
    label: "Ready issue dispatch",
    risk: "external-runner",
    destination: "Linear plus selected runner",
    confirmationRequired: true,
    sensitiveDataConfirmationRequired: true,
    detail: "Dispatch can move Linear state, create or switch an issue worktree, and send prompt context to Codex or Cursor."
  },
  {
    id: "runner-codex",
    label: "Codex local run",
    risk: "external-runner",
    destination: "Codex CLI",
    confirmationRequired: true,
    sensitiveDataConfirmationRequired: true,
    detail: "Codex receives the prompt and can mutate the issue worktree when sandbox is workspace-write."
  },
  {
    id: "runner-cursor",
    label: "Cursor SDK local run",
    risk: "external-runner",
    destination: "Cursor SDK",
    confirmationRequired: true,
    sensitiveDataConfirmationRequired: true,
    detail: "Cursor receives the prompt and runs against the selected issue worktree."
  },
  {
    id: "ios-review",
    label: "iOS simulator or device review",
    risk: "local-tooling",
    destination: "Xcode, Simulator, or local device",
    confirmationRequired: true,
    sensitiveDataConfirmationRequired: false,
    detail: "Device review may open Xcode and depends on local signing, provisioning, and device trust."
  },
  {
    id: "artifact-upload",
    label: "Log, screenshot, or artifact upload",
    risk: "external-upload",
    destination: "External review surface",
    confirmationRequired: true,
    sensitiveDataConfirmationRequired: true,
    detail: "Workflow Hub has no automatic upload endpoint; future upload actions must require explicit file selection and secret review."
  },
  {
    id: "worktree-cleanup",
    label: "Destructive worktree cleanup",
    risk: "destructive-local",
    destination: "Local filesystem and git worktrees",
    confirmationRequired: true,
    sensitiveDataConfirmationRequired: false,
    detail: "Destructive cleanup must remain unavailable until a dedicated confirmed action owns that behavior."
  }
];

const SECRET_TEXT_PATTERNS = [
  {
    kind: "private-key",
    label: "private key block",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/i
  },
  {
    kind: "openai-key",
    label: "OpenAI-style API key",
    pattern: /\bsk-[a-zA-Z0-9_-]{20,}\b/
  },
  {
    kind: "github-token",
    label: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}\b|\bgithub_pat_[a-zA-Z0-9_]{20,}\b/
  },
  {
    kind: "slack-token",
    label: "Slack token",
    pattern: /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/
  },
  {
    kind: "authorization-bearer",
    label: "Authorization bearer token",
    pattern: /\bauthorization\s*[:=]\s*["']?bearer\s+[a-zA-Z0-9._~+/=-]{12,}\b/i
  },
  {
    kind: "credential-assignment",
    label: "credential assignment",
    pattern: /\b(?:api[_-]?key|token|secret|password|client[_-]?secret|authorization)\s*[:=]\s*["']?[a-zA-Z0-9_./+=-]{12,}/i
  }
];

const SECRET_CONFIG_KEY_PATTERN = /\b(api[_-]?key|token|secret|password|client[_-]?secret|private[_-]?key|authorization|credential)\b/i;
const ENV_REFERENCE_KEY_PATTERN = /(?:env|envName|apiKeyEnv)$/i;
const ENV_VAR_PATTERN = /^[A-Z_][A-Z0-9_]*$/;

const RESTRICTED_ARTIFACT_PATTERNS = [
  { kind: "env-file", label: "environment file", pattern: /(^|[/\\])\.env(?:\.|$)/i },
  { kind: "local-config", label: "ignored local project config", pattern: /(^|[/\\])config[/\\]projects\.json$/i },
  { kind: "runner-log", label: "runner log", pattern: /\.(?:log|jsonl)$/i },
  { kind: "screenshot", label: "screenshot", pattern: /(^|[/\\])(?:screenshots?|captures?)[/\\]|screenshot|screen-shot/i },
  { kind: "firebase-plist", label: "Firebase plist", pattern: /GoogleService-Info\.plist$/i }
];

export function getSecurityActionPolicy(actionId) {
  return SECURITY_ACTION_POLICIES.find((policy) => policy.id === actionId);
}

export function detectSensitiveText(value) {
  if (typeof value !== "string" || value.length === 0) return [];

  const findings = [];
  for (const rule of SECRET_TEXT_PATTERNS) {
    if (rule.pattern.test(value)) {
      findings.push({
        kind: rule.kind,
        label: rule.label
      });
    }
  }

  return uniqueFindings(findings);
}

export function findSecretConfigFindings(value) {
  const findings = [];

  function visit(node, parts = []) {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...parts, String(index)]));
      return;
    }

    if (!isRecord(node)) return;

    for (const [key, child] of Object.entries(node)) {
      const childPath = [...parts, key];
      const pathText = childPath.join(".");
      const envReference = isAllowedEnvReference(key, child);

      if (SECRET_CONFIG_KEY_PATTERN.test(key) && !envReference) {
        findings.push({
          path: pathText,
          kind: "secret-like-key",
          label: "secret-like config key"
        });
      }

      if (typeof child === "string" && !envReference) {
        for (const finding of detectSensitiveText(child)) {
          findings.push({
            path: pathText,
            kind: finding.kind,
            label: finding.label
          });
        }
      }

      visit(child, childPath);
    }
  }

  visit(value);
  return uniqueConfigFindings(findings);
}

export function assertNoConfigSecrets(config, label = "project config") {
  const findings = findSecretConfigFindings(config);
  if (findings.length === 0) return;

  throw new SecurityGuardrailError(
    `${label} contains secret-looking fields or values. Store secret values in ignored environment files or OS credential storage, and keep project config to paths and environment variable names.`,
    "CONFIG_SECRET_DETECTED",
    { findings }
  );
}

export function assertSensitiveTextAllowed({ actionId, destination, textFields = [], sensitiveDataConfirmed = false }) {
  const findings = [];
  for (const field of textFields) {
    for (const finding of detectSensitiveText(field?.value)) {
      findings.push({
        field: field.name,
        ...finding
      });
    }
  }

  if (findings.length > 0 && sensitiveDataConfirmed !== true) {
    const policy = getSecurityActionPolicy(actionId);
    const target = destination ?? policy?.destination ?? "external destination";
    throw new SecurityGuardrailError(
      `Sensitive-looking content was detected before sending data to ${target}. Confirm the sensitive-data boundary before continuing.`,
      "SENSITIVE_DATA_CONFIRMATION_REQUIRED",
      { actionId, destination: target, findings: uniqueConfigFindings(findings) }
    );
  }

  return uniqueConfigFindings(findings);
}

export function assertActionConfirmation({ actionId, confirmed, dryRun = false }) {
  const policy = getSecurityActionPolicy(actionId);
  if (!policy || policy.confirmationRequired !== true || dryRun) return;

  if (confirmed !== true) {
    throw new SecurityGuardrailError(
      `Confirmation is required before running ${policy.label}.`,
      "CONFIRMATION_REQUIRED",
      { actionId, policy }
    );
  }
}

export function assertGuardedActionAllowed({
  actionId,
  confirmed,
  dryRun = false,
  sensitiveDataConfirmed = false,
  textFields = []
}) {
  assertActionConfirmation({ actionId, confirmed, dryRun });
  return assertSensitiveTextAllowed({
    actionId,
    textFields,
    sensitiveDataConfirmed
  });
}

export function evaluateArtifactUploadCandidates(filePaths = []) {
  return filePaths.map((filePath) => {
    const normalizedPath = String(filePath ?? "");
    const matches = RESTRICTED_ARTIFACT_PATTERNS
      .filter((rule) => rule.pattern.test(normalizedPath))
      .map((rule) => ({ kind: rule.kind, label: rule.label }));

    return {
      path: normalizedPath,
      restricted: matches.length > 0,
      matches
    };
  });
}

export function assertArtifactUploadAllowed({
  filePaths = [],
  confirmed = false,
  sensitiveDataConfirmed = false
}) {
  const candidates = evaluateArtifactUploadCandidates(filePaths);
  const restricted = candidates.filter((candidate) => candidate.restricted);

  if (confirmed !== true) {
    throw new SecurityGuardrailError(
      "Confirmation is required before uploading local artifacts.",
      "CONFIRMATION_REQUIRED",
      { actionId: "artifact-upload", candidates }
    );
  }

  if (restricted.length > 0 && sensitiveDataConfirmed !== true) {
    throw new SecurityGuardrailError(
      "Log, screenshot, local config, or secret-looking artifact paths require explicit sensitive-data confirmation before upload.",
      "SENSITIVE_DATA_CONFIRMATION_REQUIRED",
      { actionId: "artifact-upload", candidates }
    );
  }

  return candidates;
}

export function buildSecurityGuardrailState({ project, env = process.env, generatedAt = new Date().toISOString() } = {}) {
  return {
    version: SECURITY_GUARDRAIL_VERSION,
    generatedAt,
    status: "available",
    detail: "Local permission boundaries are enforced in the Node-side API before external writes or runner starts.",
    actionPolicies: SECURITY_ACTION_POLICIES,
    credentials: credentialStates(project, env),
    artifactPolicy: {
      uploadsEnabled: false,
      blockedByDefault: true,
      confirmationRequired: true,
      sensitiveDataConfirmationRequired: true,
      restrictedArtifacts: RESTRICTED_ARTIFACT_PATTERNS.map((rule) => ({
        kind: rule.kind,
        label: rule.label
      })),
      detail: "Workflow Hub does not auto-upload logs, screenshots, local config, or runner artifacts. Future upload actions must call the artifact guardrail."
    }
  };
}

function credentialStates(project, env) {
  const linearConfigured = Boolean(project?.linear && Object.keys(project.linear).length > 0);
  const cursorApiKeyEnv = project?.runners?.cursor?.apiKeyEnv;

  return [
    {
      id: "linear-api-key",
      label: "Linear API",
      status: linearConfigured
        ? env.LINEAR_API_KEY ? "available" : "unavailable"
        : "not-configured",
      storage: "environment",
      envName: "LINEAR_API_KEY",
      requiredFor: ["Linear sync", "Linear writes", "Workpad updates"],
      secretValueExposed: false,
      detail: linearConfigured
        ? env.LINEAR_API_KEY
          ? "LINEAR_API_KEY is available in the local process environment; the value is never returned to the renderer."
          : "LINEAR_API_KEY is not set; Linear sync and writes will show unavailable/error states until local credentials are provided."
        : "This project has no Linear project id configured."
    },
    {
      id: "cursor-api-key",
      label: "Cursor SDK API key",
      status: cursorApiKeyEnv
        ? env[cursorApiKeyEnv] ? "available" : "unavailable"
        : "not-configured",
      storage: "environment-or-local-auth",
      envName: cursorApiKeyEnv,
      requiredFor: ["Cursor SDK cloud/API auth when local auth is not enough"],
      secretValueExposed: false,
      detail: cursorApiKeyEnv
        ? env[cursorApiKeyEnv]
          ? `${cursorApiKeyEnv} is available in the local process environment; the value is not exposed to the renderer.`
          : `${cursorApiKeyEnv} is not set. Cursor local auth may still work, but API-key-backed runs will report credential failures.`
        : "No Cursor SDK API key environment variable is configured."
    },
    {
      id: "codex-auth",
      label: "Codex CLI auth",
      status: project?.runners?.codex ? "not-checked" : "not-configured",
      storage: "os-credential-store",
      requiredFor: ["Codex CLI runs"],
      secretValueExposed: false,
      detail: project?.runners?.codex
        ? "Codex auth is managed by the Codex CLI and local OS credential storage; Workflow Hub does not read token values."
        : "Codex runner config is not defined for this project."
    },
    {
      id: "github-auth",
      label: "GitHub CLI auth",
      status: "not-checked",
      storage: "os-credential-store",
      requiredFor: ["GitHub PR, check, review, and diff reads"],
      secretValueExposed: false,
      detail: "GitHub auth is delegated to gh and its credential storage; Workflow Hub reads PR state through the CLI without storing tokens."
    }
  ];
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isAllowedEnvReference(key, value) {
  return ENV_REFERENCE_KEY_PATTERN.test(key)
    && typeof value === "string"
    && ENV_VAR_PATTERN.test(value);
}

function uniqueFindings(findings) {
  return uniqueConfigFindings(findings);
}

function uniqueConfigFindings(findings) {
  const seen = new Set();
  const unique = [];

  for (const finding of findings) {
    const key = JSON.stringify(finding);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }

  return unique;
}
