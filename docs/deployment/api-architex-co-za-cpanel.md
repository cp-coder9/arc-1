# api.architex.co.za cPanel Node API deployment runbook

Status: prepared while external network probes are timing out. No secrets are stored in this repository.

## Target architecture

- `https://test.architex.co.za` or another static host serves the Vite SPA from `release/ftp-upload` or `dist/`.
- `https://api.architex.co.za` serves the Node/Express JSON API.
- Frontend builds must set `VITE_API_BASE_URL=https://api.architex.co.za` before `npm run build`.

## Hosting requirements

The cPanel account must provide:

1. **Setup Node.js App** or equivalent Passenger/Node feature.
2. Node **20.x**. The project declares this in `package.json`.
3. Ability to set environment variables for the Node app.
4. Valid AutoSSL/Let’s Encrypt certificate for `api.architex.co.za`.
5. Enough memory to install and run Firebase Admin plus the API router.

If the account only supports static files/PHP, do not deploy this API there. Keep the SPA on shared hosting and put the API on a Node-capable host.

## Create the API release bundle locally

```bash
npm ci
npm run predeploy:check
npm run deploy:api:bundle
```

This creates:

- `release/api-architex-co-za/`, an unpacked upload directory.
- `release/api-architex-co-za-node.tgz`, the archive to upload.

The bundle intentionally contains source, shared type definitions, and dependency manifests, not production secrets. The current cPanel-compatible startup uses `tsx`, so the first cPanel install command must include dev dependencies unless/until a transpiled server artifact is introduced.

## cPanel setup

In **Setup Node.js App**:

| Field | Value |
|---|---|
| Node.js version | `20.x` |
| Application mode | `production` |
| Application root | directory where `api-architex-co-za` is unpacked |
| Application URL | `api.architex.co.za` |
| Application startup file | `api-server.ts` |
| Passenger/start command | `npm run start:api:host` if the panel exposes a command field |

Then run from the app root in cPanel Terminal or the Node app UI:

```bash
npm ci --include=dev
npm run predeploy:check
```

If the panel only accepts a startup file and ignores package scripts, set the startup file to `api-server.ts` and ask hosting support to run it through `tsx`/the package script. Running raw `node api-server.ts` will not work because the server is TypeScript. If the host cannot run TypeScript with `tsx`, use a VPS/Node host or add a transpiled startup artifact in a separate release task.

## Required environment variables

Set these in cPanel, not in committed files:

```text
NODE_ENV=production
PORT=<cPanel assigned port, only if cPanel requires it>
VITE_API_BASE_URL=https://api.architex.co.za
VITE_FIREBASE_API_KEY=<public web config>
VITE_FIREBASE_AUTH_DOMAIN=<Firebase auth domain>
VITE_FIREBASE_PROJECT_ID=<Firebase project>
VITE_FIREBASE_STORAGE_BUCKET=<Firebase storage bucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<Firebase sender id>
VITE_FIREBASE_APP_ID=<Firebase app id>
VITE_FIREBASE_DATABASE_ID=<Firestore database id or blank/default>
FIREBASE_SERVICE_ACCOUNT=<JSON or base64 JSON service account>
BLOB_READ_WRITE_TOKEN=<if file upload routes are enabled>
GEMINI_API_KEY=<if AI workflows are enabled>
NVIDIA_API_KEY=<if NVIDIA-backed workflows are enabled>
```

`FIREBASE_SERVICE_ACCOUNT_KEY` is also accepted by `api/index.ts`; prefer one variable and keep it private.

## DNS and SSL checklist

1. `api.architex.co.za` resolves to the cPanel server or the Node-capable host.
2. cPanel subdomain document root is not serving the SPA fallback for `/api/*`.
3. AutoSSL/Let’s Encrypt certificate is issued for `api.architex.co.za`.
4. HTTP redirects to HTTPS after the certificate is valid.
5. Firebase Authentication authorized domains include the frontend domain used by the SPA, for example `test.architex.co.za` and/or `architex.co.za`.

## Smoke checks

Local after starting the server:

```bash
NODE_ENV=production PORT=3000 npm run start:api:host
node scripts/cpanel-api-smoke.mjs http://127.0.0.1:3000
```

Remote after cPanel restart and SSL activation:

```bash
node scripts/cpanel-api-smoke.mjs https://api.architex.co.za
```

Expected results:

- `GET /api/health` returns `200 application/json` with `{ "status": "ok" }`.
- `POST /api/auth/check-admin` with no token returns a JSON error, not HTML. A `401` is ideal. A JSON `500` indicates app dependencies loaded but Firebase/env still need correction. Any HTML response means cPanel is still serving the wrong document root or SPA fallback.

## Current blocker while network is timing out

Remote verification cannot be completed until DNS/SSL/cPanel are reachable. The local artifacts and checks are ready, but final live acceptance requires the smoke command against `https://api.architex.co.za` to pass.