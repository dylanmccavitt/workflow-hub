import assert from "node:assert/strict";
import test from "node:test";
import {
  SecurityGuardrailError,
  assertActionConfirmation,
  assertArtifactUploadAllowed,
  assertGuardedActionAllowed,
  assertNoConfigSecrets,
  buildSecurityGuardrailState,
  detectSensitiveText,
  evaluateArtifactUploadCandidates
} from "./security-guardrails.mjs";

test("detects sensitive-looking text without returning the secret value", () => {
  const findings = detectSensitiveText("token=FAKE_TOKEN_VALUE_1234567890");

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, "credential-assignment");
  assert.equal(JSON.stringify(findings).includes("FAKE_TOKEN"), false);
});

test("allows environment variable references but rejects direct config secrets", () => {
  assert.doesNotThrow(() => assertNoConfigSecrets({
    runners: {
      cursor: {
        apiKeyEnv: "CURSOR_API_KEY"
      }
    }
  }));

  assert.throws(
    () => assertNoConfigSecrets({
      runners: {
        cursor: {
          apiKey: "FAKE_DIRECT_SECRET_VALUE_123456"
        }
      }
    }),
    SecurityGuardrailError
  );
});

test("requires confirmation for risky non-dry-run actions", () => {
  assert.throws(
    () => assertActionConfirmation({ actionId: "runner-codex", confirmed: false }),
    /Confirmation is required/
  );

  assert.doesNotThrow(() => assertActionConfirmation({
    actionId: "runner-codex",
    confirmed: false,
    dryRun: true
  }));
});

test("requires sensitive-data confirmation before guarded transmission", () => {
  assert.throws(
    () => assertGuardedActionAllowed({
      actionId: "runner-cursor",
      confirmed: true,
      textFields: [{ name: "prompt", value: "client_secret=FAKE_SECRET_VALUE_123456" }]
    }),
    /Sensitive-looking content/
  );

  assert.doesNotThrow(() => assertGuardedActionAllowed({
    actionId: "runner-cursor",
    confirmed: true,
    sensitiveDataConfirmed: true,
    textFields: [{ name: "prompt", value: "client_secret=FAKE_SECRET_VALUE_123456" }]
  }));
});

test("marks restricted artifact paths and requires upload confirmations", () => {
  const candidates = evaluateArtifactUploadCandidates([
    "/tmp/screenshot.png",
    "/repo/config/projects.json",
    "/repo/docs/handoff.md"
  ]);

  assert.equal(candidates[0].restricted, true);
  assert.equal(candidates[1].restricted, true);
  assert.equal(candidates[2].restricted, false);

  assert.throws(
    () => assertArtifactUploadAllowed({
      filePaths: ["/tmp/screenshot.png"],
      confirmed: true
    }),
    /sensitive-data confirmation/
  );

  assert.doesNotThrow(() => assertArtifactUploadAllowed({
    filePaths: ["/tmp/screenshot.png"],
    confirmed: true,
    sensitiveDataConfirmed: true
  }));
});

test("builds credential states without exposing secret values", () => {
  const state = buildSecurityGuardrailState({
    project: {
      linear: { projectId: "linear-project" },
      runners: {
        cursor: { apiKeyEnv: "CURSOR_API_KEY" },
        codex: { command: "codex" }
      }
    },
    env: {
      LINEAR_API_KEY: "linear-secret-value",
      CURSOR_API_KEY: "cursor-secret-value"
    },
    generatedAt: "2026-05-01T12:00:00.000Z"
  });

  assert.equal(state.credentials.find((credential) => credential.id === "linear-api-key").status, "available");
  assert.equal(state.credentials.find((credential) => credential.id === "cursor-api-key").status, "available");
  assert.equal(JSON.stringify(state).includes("linear-secret-value"), false);
  assert.equal(JSON.stringify(state).includes("cursor-secret-value"), false);
  assert.equal(state.artifactPolicy.uploadsEnabled, false);
});
