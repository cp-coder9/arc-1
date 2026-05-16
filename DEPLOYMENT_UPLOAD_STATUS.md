# Architex FTP Upload Status

Date: 2026-05-16

## What was uploaded
- Built frontend SPA with relative asset paths for subfolder/shared-hosting compatibility.
- Uploaded via explicit FTPS to the jailed FTP root for `ai@architex.co.za`.
- Uploaded files include `index.html`, `assets/*`, `logo.png`, `.htaccess` SPA fallback, and a protected `_backend/architex-co-za-backend-bundle.tgz` reference package.

## Public verification
- Reachable deployed URL: https://architex.co.za/architex.co.za/ai/
- Browser verification passed: hero rendered and bad resources = none.
- `_backend/architex-co-za-backend-bundle.tgz` returns HTTP 403 as intended.

## Important blocker
- Requested URL `https://test.architex.co.za/` still returns HTTP 404.
- The FTP account is jailed to a directory that is publicly visible at `/architex.co.za/ai/` under the main domain path, not the `test.architex.co.za` document root.
- Hosting control panel/cPanel must map `test.architex.co.za` document root to this FTP directory, or provide FTP access to the actual `test.architex.co.za` docroot.

## Backend note
- The uploaded `_backend` bundle is not running as a Node process. It is a protected reference package for server setup.
- Running the API requires Node process manager support and production env vars on the host.
- MySQL credentials were stored outside the repo in local config only; no MySQL migration was applied because the current app uses Firebase/Firestore and Vercel Blob.

## 2026-05-16 workflow projection hotfix
- Fixed role dashboard workflow projections that could show `Workflow unavailable` after login when Firestore rejected composite-index or broad project queries.
- Shared command/workflow pages now use rule-safe, default-index-safe Firestore reads and client-side recent sorting.
- Contractor, subcontractor, and supplier workflows no longer attempt broad project list reads that Firestore rules deny; they continue from visible open jobs/packages and show an empty-state if no live records are visible.
- Validation passed: `npm run lint`, dashboard registry regression tests, direct `api-router.security` rerun, `npm run build`, Chromium sidebar E2E across role harness (5 passed), and clean FTP staging check with no `Workflow unavailable` text in built assets.
- Full `npm test` was also run: 413/414 tests passed; the single failure was the pre-existing flaky `api-router.security` cross-origin test timeout when run inside the full suite. Direct rerun of that exact test file passed 62/62.

