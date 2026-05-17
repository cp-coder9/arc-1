# Role Login and Firebase Stabilization Log

Start: 2026-05-17 09:43 UTC
Branch: phase-2-verification-workflows
Scope: user requested six-hour autonomous pass to check every role login/dashboard with Playwright, compare live test.architex.co.za, and remove production Firebase errors without changing unrelated site behavior.

## Operating constraints
- Production code only. No mock production data, placeholders, or simulated runtime behavior.
- Local Playwright harness may mock Firebase only to validate role navigation without requiring real user credentials.
- Do not print or commit secrets from .env or FTP/MySQL configuration.
- Commit only agent changes, not user-provided `backend.html`, `BACKEND_HTML_OUTSTANDING_ITEMS.md`, `12/`, or release artifacts.

## Timeline
- 09:43 UTC: Started role-login/Firebase stabilization pass and created goal/todo plan.
- 09:44 UTC: Spawned focused agents for role login, Firestore/rules, production comparison, Playwright harness, and dashboard query audit.
- 09:47 UTC: Live unauthenticated login modal on `https://test.architex.co.za` exposes all 7 public roles with no console errors, but fixed modal leaves `body` with zero layout height. Playwright probes must assert role-card locators/html text instead of body visibility after opening the modal.
- 09:50 UTC: Inventory found sidebar harness only covers client, architect, admin, freelancer, and BEP. Contractor, subcontractor, and supplier were untested even though they are exposed in login/onboarding and canonical dashboards.
- 09:52 UTC: Static rules-to-frontend comparison found multiple dashboard collections used in production components but absent from `firestore.rules`, including directory profiles/invitations, technical briefs, delegated tasks, CPD attempts, resource sharing, contractor resources, package readiness, progress reports, and top-level construction evidence collections.

## In progress
- Patching Firestore rules for dashboard-owned collections and supplier package visibility.
- Removing composite-index-prone role dashboard queries where client-side sorting is sufficient.
- Extending Playwright sidebar harness and Firebase test harness to every canonical role.

## Validation
- Pending after patches.

## Human follow-up / blockers
- Firebase rules must be deployed to the configured Firebase project after validation. I will attempt safe CLI deployment only if credentials/session allow it; otherwise I will document the exact command.
- 10:08 UTC: Extended sidebar Playwright harness to all production roles and reran it with a real timeout; 8/8 role dashboards passed without console errors.
- 10:18 UTC: Hardened auth E2E startup waits and verified the public login/onboarding role selectors expose all seven public roles; auth E2E passed 4/4.
- 10:25 UTC: Full unit regression passed with `npm test -- --testTimeout 20000`.
- 10:30 UTC: Hardened `/admin` and sidebar Playwright navigation against cold Vite startup blank pages/timeouts.
- 10:37 UTC: Full Chromium E2E passed 22/22 after the navigation hardening.
- 10:38 UTC: Production relative-base build passed with 3051 transformed modules.
- 10:41 UTC: Live pre-upload smoke passed on `https://test.architex.co.za` and `https://architex.co.za/architex.co.za/ai`: landing, `/admin`, all seven public role cards, no bad resources, no console errors.
- 10:43 UTC: Firebase rules deploy dry-run with local service-account authentication was blocked by IAM: the service account lacks permission to read Service Usage status for `firestore.googleapis.com` on project `gen-lang-client-0880960511`.
- 10:45 UTC: Uploaded 73 verified production files to the shared-hosting FTPS target and reran live smoke. Both `test.architex.co.za` and the main hosted subpath passed landing, `/admin`, role login-card exposure, no bad resources, and no browser console errors.
- 14:18 UTC: Deployed Firestore rules to the target database release via Firebase Rules API after user approval; read-back verification confirmed the active ruleset and remote SHA.

## Validation summary
- PASS: `npm run lint`
- PASS: `npm run lint:tests`
- PASS: Firestore/static registry focused tests, 46 tests
- PASS: `npm test -- --testTimeout 20000`
- PASS: `npx playwright test e2e/auth.spec.ts --project=chromium --reporter=line`, 4 tests
- PASS: `npx playwright test e2e/sidebar-harness.spec.ts --project=chromium --reporter=line`, 8 roles
- PASS: `npx playwright test --project=chromium --reporter=line`, 22 tests
- PASS: `npx vite build --base ./`
- PASS: Live Playwright smoke for `https://test.architex.co.za` and `https://architex.co.za/architex.co.za/ai`
- PASS: Firebase Rules API read-back for target Firestore release and deployed `firestore.rules` SHA256

## Firebase rules deployment status
- 10:43 UTC: Firebase CLI deployment remained blocked by IAM Service Usage preflight: HTTP 403 while checking `firestore.googleapis.com` on project `gen-lang-client-0880960511`. This means future CLI deploys should still add Service Usage Viewer to the deploy credential or use an owner account.
- 14:18 UTC: Firestore rules were deployed successfully through the Firebase Rules REST API, bypassing the CLI Service Usage preflight while still using the authenticated service account.
- Target release: `projects/gen-lang-client-0880960511/releases/cloud.firestore/ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635`
- Active ruleset: `projects/gen-lang-client-0880960511/rulesets/e017dc65-1c74-401b-8101-2a3b5925559c`
- Release update time: `2026-05-17T14:18:31.714748Z`
- Deployed `firestore.rules` SHA256: `f39cfedeb93beb68c315f95061c3dd387b2ab11ba648e4f16ad91dc8512c9f53`
- 14:20 UTC: Read-back verification passed by fetching the active release and ruleset from Firebase Rules API and comparing the remote rules content SHA256 to the local `firestore.rules` file.
