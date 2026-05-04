# Handoff: AGE-353 Review Evidence Capture

## Status

Ready for Human Review on `feat/age-353-review-evidence`.

Implemented first-class local evidence capture for iOS review sessions. Simulator review now supports `--screenshot`, stores the local screenshot path beside the review log, and writes an evidence summary into the session metadata and review events. Device review now records the same evidence shape for Xcode launch/failure sessions. Screenshots and logs remain local artifacts only; no upload path was added.

The local API now exposes `issue.latestReviewEvidence`, and the issue inspector shows latest evidence status, log path, screenshot state, and summary.

## Next

Review the PR and inspect the issue inspector against an issue with recorded iOS review evidence.

Manual review path:

```sh
node scripts/workflow-hub.mjs review <ios-issue> --sim --screenshot --json
node scripts/workflow-hub.mjs api-state <ios-issue> --json
npm run dev
```

Use a configured iOS issue such as a ChoreLadder issue workspace when local app config is present. `AGE-353` itself is the Workflow Hub project and has no iOS settings, so its review adapters correctly report not configured/unavailable.

## Risks

- A real simulator screenshot smoke was not run in this issue workspace because Workflow Hub itself has no iOS project config. Unit coverage verifies the `xcrun simctl io <udid> screenshot <path>` command is issued after launch and that evidence metadata is persisted.
- Local `npm install` was required because the issue worktree did not have dependencies installed. It reported the existing 10 npm audit findings; no dependency files changed.
- Browser/Vite preview cannot exercise the Electron desktop bridge. Use Electron for live inspector data.

## Files

- `scripts/lib/ios-review.mjs`
- `scripts/lib/ios-review.test.mjs`
- `scripts/lib/local-api-service.mjs`
- `scripts/lib/local-api-service.test.mjs`
- `scripts/workflow-hub.mjs`
- `src/lib/workflowHubApi.ts`
- `src/App.tsx`
- `src/styles.css`
- `README.md`
- `docs/configuration.md`
- `docs/architecture.md`
- `docs/handoffs/2026-05-04-age-353-review-evidence.md`

## Checks

- `node --check scripts/lib/ios-review.mjs`
- `node --check scripts/lib/local-api-service.mjs`
- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check scripts/workflow-hub.mjs`
- `node --test scripts/lib/ios-review.test.mjs`
- `node --test scripts/lib/local-api-service.test.mjs`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run check`
- `git diff --check`
- `node scripts/workflow-hub.mjs api-state AGE-353 --json`

## Review Notes

- Unit tests cover successful simulator evidence with screenshot request, failed simulator evidence, successful device evidence, failed device evidence, and local API latest evidence projection.
- `api-state AGE-353 --json` confirmed the new API shape works in the live workspace; no evidence is present for AGE-353 because this repo has no iOS config.
