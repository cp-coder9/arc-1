# Non-Node Deployment Plan for Architex Shared Hosting

Date: 2026-05-28
Context: `test.architex.co.za` can serve static/PHP files but cannot run a long-lived Node/Express process.

## Current deployed state

- Static Vite SPA is deployed and smoke-passing at `https://test.architex.co.za`.
- PHP shared-hosting API gateway is deployed and smoke-passing at `https://api.architex.co.za`.
- The current cPanel/shared-hosting environment does **not** support the Node/Express API runtime, so `/api/*` is handled by `api-php/index.php` through `.htaccess` rewrite rules.
- Live validation performed after deployment:
  - `npm run smoke:api -- https://api.architex.co.za`
  - `SMOKE_INCLUDE_API=1 SMOKE_API_BASE_URL=https://api.architex.co.za npm run smoke:deploy -- https://test.architex.co.za`
  - JSON probes for health, version, auth-required routes, PayFast invalid-signature rejection, and 404 handling.

## PHP gateway route coverage deployed

Implemented and deployed:

- `GET /api/health`
- `GET /api/version`
- `POST /api/auth/check-admin`
- `GET /api/profile/me`
- `PUT|PATCH /api/profile/me`
- `PUT|PATCH /api/users/:uid/profile`
- `POST /api/notifications/token`
- `GET /api/verifications/me`
- `POST /api/verifications/submit`
- `POST /api/admin/verifications/:id/review`
- `POST /api/admin/verifications/:id/recheck`
- `POST /api/architect/verify-sacap`
- `GET /api/jobs/opportunities`
- `POST /api/jobs/:jobId/applications`
- `POST /api/jobs/:jobId/applications/:applicationId/accept`
- `POST /api/files/upload`
- `POST /api/files/delete`
- `POST /api/review`
- `POST /api/agent/search`
- `POST /api/agent/scope`
- `POST /api/agent/test-settings`
- `POST /api/payment/notify`
- `POST /api/payment/escrow/init`
- `POST /api/payment/confirm`
- `POST /api/payment/milestone/request`
- `POST /api/payment/milestone/release`
- `POST /api/payment/refund`

Deliberate safe-degradation behavior:

- Payment confirm, milestone release, and refund routes authenticate and audit where possible, but return a non-mutating JSON conflict until provider/human approval parity is complete.
- Municipal provider routes return JSON `501` instead of cPanel HTML errors.
- Agent/AI routes call Gemini only when server-side keys are configured. Otherwise they return JSON `503` and do not imply regulated approval.

## Key finding

The original Node API is not a thin health endpoint. `src/lib/api-router.ts` defines roughly 100 routes covering:

- Auth/admin profile sync
- Directory/invitations
- Project briefs and command centre writes
- File upload/delete
- AI drawing review and agent testing/search
- Marketplace applications and proposal acceptance
- Payments, escrow, refunds, and PayFast ITN handling
- Municipal OCR/scraping/heatmaps
- Verification workflows
- Notifications

Frontend `apiFetch` callers currently depend on a smaller active subset. The PHP gateway now covers the high-impact active subset and returns deterministic JSON for unsupported areas.

## Architecture recommendation

### Preferred long-term path: Static cPanel + Node-capable backend

Keep the static app on cPanel and move the full API to a Node-capable managed backend, for example:

1. Firebase Cloud Functions v2, best Firebase/Admin fit.
2. Vercel serverless functions, fastest TypeScript/Express migration if repo deploy is allowed.
3. Cloud Run, most production-like and flexible.
4. A small VPS, if full Express process is required.

Then set the frontend build variable:

```text
VITE_API_BASE_URL=https://<api-host>
```

This keeps cPanel as static hosting only and avoids a permanent rewrite of regulated backend logic in PHP.

### Why this remains preferred

- Existing backend uses Firebase Admin, Vercel Blob, LLM provider calls, PayFast signature handling, and TypeScript domain services.
- PHP gateway now makes the deployed site functional on the current host, but the safest production backend for full parity is still a Node-capable runtime.
- Firestore rules already allow many direct client reads/writes where safe. The API should remain for privileged/server-only workflows.

## PHP gateway implementation notes

`api-php/` contains:

- `bootstrap.php`
  - CORS allowlist for `test.architex.co.za`, `architex.co.za`, and `www.architex.co.za`
  - JSON helpers
  - raw JSON helper for frontend endpoints that expect top-level arrays
  - route and bearer-token helpers
- `firebase.php`
  - Firebase ID token verification using Google public certs
  - service-account OAuth JWT exchange
  - Firestore REST get/set/create/delete/list/query helpers
  - Firestore value encoding/decoding, including empty arrays
- `index.php`
  - shared-hosting route dispatcher for `/api/*`
  - safe audit logging
  - provider-gated Gemini proxy
  - non-mutating payment safety gates
- `.htaccess`
  - rewrites `/api/*` to `index.php`
  - sets basic security headers

Secrets must stay outside the repo and web bundle. Required host-managed values for fully enabled provider routes:

- `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_KEY`
- `BLOB_READ_WRITE_TOKEN` or `VITE_BLOB_READ_WRITE_TOKEN`
- `GEMINI_API_KEY` for AI routes
- `PAYFAST_PASSPHRASE` or `VITE_PAYFAST_PASSPHRASE`

## Release gates passed on 2026-05-28

- PHP syntax lint passed for all gateway files.
- API bundle generation passed `npm run deploy:api:bundle`.
- Latest bundle uploaded to `https://api.architex.co.za`.
- `npm run smoke:api -- https://api.architex.co.za` passed.
- `SMOKE_INCLUDE_API=1 SMOKE_API_BASE_URL=https://api.architex.co.za npm run smoke:deploy -- https://test.architex.co.za` passed.
- Additional route probes confirmed JSON content types and expected unauthenticated statuses for newly added marketplace/admin routes.

## Remaining work before production cutover

- Exercise authenticated live workflows with real Firebase ID tokens and test records:
  - profile update
  - verification submit/review/recheck
  - application submit/accept
  - file upload to Vercel Blob
- Add automated PHP-specific mocked REST tests for Firestore write helpers and PayFast signature validation.
- Decide whether to keep expanding PHP parity or move the TypeScript API to Cloud Functions/Cloud Run/Vercel serverless.
- Keep human approval gates for payment, escrow release/refund, municipal provider actions, and AI-regulated workflows until full provider validation is complete.
