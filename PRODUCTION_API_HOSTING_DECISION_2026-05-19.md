# Production API Hosting Decision

Date: 2026-05-19

## Decision

Use the existing Vercel deployment `https://arc-1-orpin.vercel.app` as the short-term secured API host for static cPanel domains, while planning a longer-term Node/API runtime or reverse proxy for `test.architex.co.za`.

## Evidence from live probes

| Host | `/api/health` | `/api/auth/check-admin` POST `{}` | Result |
|---|---:|---:|---|
| `https://arc-1-orpin.vercel.app` | `200 application/json` | `401 application/json` | Valid API host |
| `https://test.architex.co.za` | `200 text/html` | `200 text/html` | Static SPA fallback, not API |
| `https://architex.co.za/architex.co.za/ai` | `200 text/html` | `200 text/html` | Static SPA fallback, not API |

The `Unexpected token '<'` error happens when frontend code calls `/api/auth/check-admin` on a static cPanel domain and receives `index.html` instead of JSON.

## Selected path

1. Keep the cPanel/test domain as static SPA hosting for now.
2. Route API calls to `https://arc-1-orpin.vercel.app` until a cPanel Node app or server-level reverse proxy is available.
3. Add/use a frontend API base configuration so `/api/*` requests do not hit the static SPA fallback.
4. Keep the static-hosting non-admin Firestore fallback as a safety net only, not the primary production auth path.
5. Admin login must continue to require a real JSON API response and must not use the client-side fallback.

## Implementation requirements

- Add a shared API URL helper for frontend fetches.
- Replace relative `/api/*` calls with helper-generated URLs where server workflows matter.
- Build test deployment with an API base pointing at the Vercel API host, or configure an Apache/server reverse proxy if the host supports it.
- Verify:
  - `/api/health` JSON through the chosen path.
  - `/api/auth/check-admin` returns JSON 401 without auth, never HTML.
  - admin login and server-backed workflows do not throw `Unexpected token '<'`.

## Longer-term target

Deploy the Node/Express API on the same production hosting stack or a dedicated API subdomain, then switch the frontend API base to that owned endpoint. This avoids cross-host operational coupling while preserving server-side Firebase Admin verification.
