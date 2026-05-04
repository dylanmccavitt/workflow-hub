# Handoff: AGE-352 iOS Device Review

## Status

Ready for Human Review on `feat/age-352-device-review`.

PR: https://github.com/DylanMcCavitt/workflow-hub/pull/22

Implemented `workflow review <issue> --device` as a recorded Xcode launch path for iOS-configured issue worktrees. The command resolves the issue workspace, opens the configured Xcode project/workspace under that worktree, prints the configured scheme, bundle ID, device target guidance, and signing caveats, and records requested/launched or failed review session events in the local registry.

The device path intentionally does not build, install, run on a device, modify signing settings, save credentials, or attempt to bypass Apple signing, provisioning, or device trust. It only opens Xcode at the exact resolved issue target and leaves signing/device state to local Xcode.

## Next

Review the PR and run the manual device path against a configured iOS issue workspace:

```sh
node scripts/workflow-hub.mjs status AGE-481 --json
node scripts/workflow-hub.mjs review AGE-481 --device --json
node scripts/workflow-hub.mjs api-state AGE-481 --json
```

Use another configured iOS issue if `AGE-481` is not the desired review target. `AGE-352` itself resolves to the Workflow Hub project, which does not define iOS settings.

## Risks

- Live validation opened `/Users/dylanmccavitt/.codex/symphony-workspaces/chores/AGE-481/ChoreLadder.xcodeproj` in Xcode and recorded device session `a647afd7-43e7-4d24-80e7-6a153a47629a`.
- Local API validation showed the recorded device session and events through `api-state AGE-481 --json`; the ChoreLadder Linear adapter remains `not-configured` because that project has no `linear.projectId`, but cached local review state is available.
- `npm install` completed to restore dependencies in this workspace and reported 10 existing audit findings. No dependency files changed in this slice.

## Files

- `scripts/lib/ios-review.mjs`
- `scripts/lib/ios-review.test.mjs`
- `scripts/workflow-hub.mjs`
- `scripts/lib/local-api-service.mjs`
- `README.md`
- `docs/configuration.md`
- `docs/architecture.md`
- `docs/handoffs/2026-05-04-age-352-device-review.md`

## Checks

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check scripts/lib/ios-review.mjs`
- `node --test scripts/lib/ios-review.test.mjs`
- `npm run test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `git diff --check`
- `node scripts/workflow-hub.mjs review AGE-352 --device --json` failed as expected because Workflow Hub has no iOS settings.
- `node scripts/workflow-hub.mjs review AGE-481 --device --json` opened Xcode and recorded device session `a647afd7-43e7-4d24-80e7-6a153a47629a`.
- `node scripts/workflow-hub.mjs api-state AGE-481 --json` confirmed the recorded device session and `review:device` adapter are visible through the local API payload.

## Review Notes

- Unit tests cover successful device Xcode launch recording and missing Xcode target failure recording.
- The JSON payload includes `xcodePath`, `scheme`, `bundleId`, `deviceTargetGuidance`, `signingCaveats`, `session`, `event`, `logPath`, and the recorded `open -a Xcode` command.
