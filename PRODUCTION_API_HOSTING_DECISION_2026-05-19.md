# Production API Hosting Decision

Date: 2026-05-19  
Corrected: 2026-05-19 after human instruction

## Corrected decision

`test.architex.co.za` is the working deployment target. Do **not** treat the old Vercel deployment as the production/test working version.

The correct path is to make `test.architex.co.za` serve both:

1. the uploaded React/Vite SPA, and
2. real JSON `/api/*` routes through either cPanel Node.js application support or a server-level reverse proxy/API subdomain owned by the same deployment stack.

## Evidence from live probes

| Host | `/api/health` | `/api/auth/check-admin` POST `{}` | Result |
|---|---:|---:|---|
| `https://test.architex.co.za` | `200 text/html` | `200 text/html` | Current target, but `/api/*` is still falling through to the static SPA |
| `https://architex.co.za/architex.co.za/ai` | `200 text/html` | `200 text/html` | Static SPA fallback, not API |
| `https://arc-1-orpin.vercel.app` | `200 application/json` | `401 application/json` | Old API-capable deployment, useful only as a reference, not the current target |

The `Unexpected token '<'` error happens because frontend code calls `/api/auth/check-admin` on `test.architex.co.za` and receives `index.html` instead of JSON.

## Selected path

1. Continue uploading frontend builds to `test.architex.co.za`.
2. Do **not** redirect active work back to Vercel.
3. Configure `test.architex.co.za/api/*` to reach the real Node/Express API:
   - preferred: cPanel Node.js app for this repository/API bundle, mounted/proxied under `/api`, or
   - acceptable: owned API subdomain such as `api.test.architex.co.za`, with the SPA configured to call that endpoint, or
   - fallback: Apache/LiteSpeed reverse proxy if the host supports proxy modules.
4. Keep the static-hosting non-admin Firestore fallback only as a temporary safety net.
5. Admin login and all secured server workflows must require JSON responses from the real `test.architex.co.za` API path.

## Implementation requirements

- Inspect cPanel for Node.js application support and/or available proxy/rewrite capability.
- Deploy the API bundle (`api/`, `server.ts`, `src/lib/api-router.ts`, needed services, `package.json`) with secure Firebase Admin env vars.
- Configure `/api/*` on `test.architex.co.za` so it no longer returns `index.html`.
- Verify:
  - `https://test.architex.co.za/api/health` returns JSON.
  - `https://test.architex.co.za/api/auth/check-admin` returns JSON `401` without auth, never HTML.
  - admin login and server-backed workflows do not throw `Unexpected token '<'`.

## Do not do

- Do not use `https://arc-1-orpin.vercel.app` as the working production target.
- Do not deploy new frontend builds to Vercel for this task unless explicitly instructed.
- Do not enable payment/signature/escrow execution until the `test.architex.co.za` API path is live and secured.
