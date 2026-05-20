# Production API Hosting Decision

Date: 2026-05-19  
Corrected: 2026-05-19 after human instruction  
Updated API target: 2026-05-19

## Corrected decision

`test.architex.co.za` is the working SPA deployment target. Do **not** treat the old Vercel deployment as the production/test working version.

API calls may be hosted on the owned subdomain:

```text
https://api.architex.co.za
```

The correct target architecture is:

1. `https://test.architex.co.za` serves the uploaded React/Vite SPA.
2. `https://api.architex.co.za` serves real JSON `/api/*` routes through the Node/Express API bundle.
3. The SPA is configured to call `https://api.architex.co.za/api/...` for server workflows.

## Evidence from live probes

| Host | Probe | Result |
|---|---|---|
| `https://test.architex.co.za/api/health` | `GET/HEAD` | `200 text/html`, SPA fallback, not API |
| `https://test.architex.co.za/api/auth/check-admin` | `POST {}` | `200 text/html`, SPA fallback, not API |
| `http://api.architex.co.za/api/health` | `HEAD` | `404 text/html` from LiteSpeed, subdomain exists but API not deployed |
| `https://api.architex.co.za/...` | TLS probe | self-signed/invalid certificate at probe time; SSL must be fixed before frontend API calls use it |
| `https://arc-1-orpin.vercel.app` | reference only | Old API-capable deployment, not the working production target |

The `Unexpected token '<'` error happens because frontend code calls an API path and receives HTML instead of JSON.

## Selected path

1. Continue uploading frontend builds to `test.architex.co.za`.
2. Deploy the API bundle to `api.architex.co.za`.
3. Fix TLS for `api.architex.co.za` so browser `fetch` can call it without certificate errors.
4. Configure frontend API base to `https://api.architex.co.za` for the test-domain build.
5. Keep the static-hosting non-admin Firestore fallback only as a temporary safety net.
6. Admin login and all secured server workflows must require JSON responses from `https://api.architex.co.za/api/*`.

## Implementation requirements

- In cPanel, configure `api.architex.co.za` document root / Node.js application / application startup.
- Ensure valid SSL certificate for `api.architex.co.za`.
- Deploy API bundle with secure env vars:
  - `api/`
  - `server.ts` or a cPanel-compatible API entrypoint
  - `src/lib/api-router.ts`
  - required `src/services` and Firebase Admin modules
  - `package.json` / lockfile
  - Firebase Admin service account env var, not committed to git
- Add a frontend API URL helper and configure the test build to call `https://api.architex.co.za`.
- Verify:
  - `https://api.architex.co.za/api/health` returns JSON.
  - `https://api.architex.co.za/api/auth/check-admin` returns JSON `401` without auth, never HTML.
  - `https://test.architex.co.za` login/admin/server-backed workflows call the API subdomain and do not throw `Unexpected token '<'`.

## Do not do

- Do not use `https://arc-1-orpin.vercel.app` as the working production target.
- Do not deploy new frontend builds to Vercel for this task unless explicitly instructed.
- Do not enable payment/signature/escrow execution until `api.architex.co.za` is live, secured, and verified.

## 2026-05-20 API bundle progress

Prepared and locally validated a cPanel Node API deployment path for `api.architex.co.za`:

- Added `api-server.ts`, a dedicated API-only startup entrypoint that loads environment files before importing the Express API app.
- Added `npm run start:api:host`, `npm run smoke:api`, and `npm run deploy:api:bundle`.
- Added `scripts/build-cpanel-api-bundle.mjs` to create `release/api-architex-co-za/` and `release/api-architex-co-za-node.tgz` without secrets.
- Added `scripts/cpanel-api-smoke.mjs` to assert `/api/health` and unauthenticated `/api/auth/check-admin` return JSON, not SPA HTML.
- Added the cPanel runbook at `docs/deployment/api-architex-co-za-cpanel.md` and linked it from the shared-hosting deployment guide.
- Validation run: `npm run lint && npm run deploy:api:bundle` passed locally.

Remaining live blocker: external network access to the hosting endpoints has been intermittently timing out from the harness, so final upload/configuration and remote smoke checks must run as soon as `ftp.architex.co.za`, `cp73.domains.co.za:2083`, and `api.architex.co.za` are reachable.
