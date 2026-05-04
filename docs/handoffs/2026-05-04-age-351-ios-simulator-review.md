# Handoff: AGE-351 iOS Simulator Review

## Status

Ready for Human Review on `feat/age-351-ios-simulator-review`.

Implemented `workflow review <issue> --sim` as an executable simulator review path instead of a printed draft. The command resolves the issue worktree, validates the configured simulator against currently available devices, boots/opens Simulator as needed, builds the configured scheme with per-issue DerivedData, installs the built `.app` matching the configured bundle ID, launches it, and records review session status/events plus a local log path in the registry.

## Next

Review the PR and the CLI/session evidence.

Manual review path:

```sh
node scripts/workflow-hub.mjs status AGE-481 --json
node scripts/workflow-hub.mjs review AGE-481 --sim --json
```

Use another configured iOS issue if `AGE-481` is not the desired review target. The simulator name is resolved from current `xcrun simctl list devices available --json` output, not from stale issue-packet device IDs.

## Risks

- Live validation against clean ChoreLadder issue workspace `AGE-481` reached real `xcodebuild` on the available `iPhone 17 Pro` simulator and recorded a failed review session. The build failed in the Firebase Crashlytics script with `Could not get GOOGLE_APP_ID in Google Services file from build environment`, which indicates that issue worktree needs its ignored local app config for full launch. Workflow Hub does not print or commit those local-only files.
- Desktop UI simulator launch remains disabled until a guarded UI action owns the explicit review action. This slice wires the CLI review path and local session/log recording.

## Files

- `scripts/lib/ios-review.mjs`
- `scripts/lib/ios-review.test.mjs`
- `scripts/workflow-hub.mjs`
- `scripts/lib/local-api-service.mjs`
- `src/lib/workflowHubApi.ts`
- `README.md`
- `docs/configuration.md`
- `docs/architecture.md`
- `docs/handoffs/2026-05-04-age-351-ios-simulator-review.md`

## Checks

- `node --check scripts/lib/ios-review.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --test scripts/lib/ios-review.test.mjs`
- `node --test scripts/lib/ios-review.test.mjs scripts/lib/project-config.test.mjs scripts/lib/local-api-service.test.mjs`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`
- `node scripts/workflow-hub.mjs status AGE-351 --json`
- `node scripts/workflow-hub.mjs status AGE-481 --json`
- `node scripts/workflow-hub.mjs review AGE-481 --device --json`
- `node scripts/workflow-hub.mjs review AGE-481 --sim --json` failed at ChoreLadder build step after recording simulator review session/log because ignored Firebase local config is missing in that issue worktree.
- `node scripts/workflow-hub.mjs api-state AGE-481 --json` confirmed the failed simulator review session and registry events are visible through the local API payload.

## Review Notes

- Unit tests cover the successful build/install/launch path, failed build recording path, available-simulator selection, and app bundle matching by `CFBundleIdentifier`.
- Live simulator validation selected available `iPhone 17 Pro` UDID `133D0555-F32D-4471-9554-5068D9CC24C8`, used `/tmp/WorkflowHubDerivedData-AGE-481`, and wrote the log at `/Users/dylanmccavitt/Library/Application Support/Workflow Hub/review-logs/AGE-481/32d642be-e76f-4175-993d-b4effdf1ef1f.log`.
