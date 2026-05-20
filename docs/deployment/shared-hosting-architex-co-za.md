# Architex shared-hosting deployment preparation for architex.co.za

Status: prepared for review, not uploaded. Control-panel, SSH/FTP, DNS, Firebase, and database credentials are not present in the workspace.

## Important hosting constraint

The current production application is a React/Vite SPA plus a Node/Express API using Firebase Auth, Firestore, Firebase Admin, and Vercel Blob-oriented integrations. It is **not** a PHP/MySQL application.

A shared-hosting plan can run this project only if it provides one of these:

1. **Node.js application support** with a long-running process and environment variables, recommended for this codebase.
2. **Static-only hosting** for the built `dist/` SPA, with the API hosted elsewhere such as Vercel/Firebase/Node VPS.
3. A separate funded migration to a MySQL-backed API. No MySQL data-access layer, schema, migrations, or ORM currently exists, so claiming MySQL readiness would be inaccurate.

## Domain checklist

- Add `architex.co.za` and `www.architex.co.za` to Firebase Authentication authorized domains.
- Ensure CORS allows `https://architex.co.za` and, if used, `https://www.architex.co.za`.
- Point DNS A/CNAME records to the selected hosting provider.
- Configure HTTPS certificate before enabling production auth redirects.

## Node shared-hosting deployment path

For the owned API subdomain, use the dedicated cPanel Node runbook: [`api-architex-co-za-cpanel.md`](./api-architex-co-za-cpanel.md). It defines the repeatable bundle command, cPanel Node settings, environment variables, DNS/SSL checklist, and JSON smoke checks.

1. Upload repository files, or a release bundle containing:
   - `dist/` after `npm run build`
   - `server.ts`
   - `api/`
   - `src/` service modules required by the API router
   - `package.json` and lockfile
   - Firebase config JSON if required by the server
2. On the host:
   ```bash
   npm ci --omit=dev=false
   npm run build
   NODE_ENV=production npm start
   ```
3. Set environment variables in the hosting panel:
   - `NODE_ENV=production`
   - `PORT=<host assigned port>`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_DATABASE_ID`
   - `FIREBASE_SERVICE_ACCOUNT` or `FIREBASE_SERVICE_ACCOUNT_KEY` as JSON or base64 JSON
   - Blob/storage/provider secrets used by enabled API routes
4. Configure the Node app document root/proxy to the Node process, not just `dist/`.
5. Run smoke checks:
   ```bash
   curl https://architex.co.za/api/health
   curl https://architex.co.za/
   ```

## Static-only shared-hosting fallback

If the plan only supports static files/PHP:

1. Run `npm run build` locally.
2. Upload `dist/` contents to `public_html/`.
3. Configure SPA fallback to `index.html` in `.htaccess`.
4. Keep API routes on the owned Node/API host and configure `VITE_API_BASE_URL` before building the frontend. For the current test/static domain, use `VITE_API_BASE_URL=https://api.architex.co.za` so authenticated server workflows call the JSON API host instead of the SPA fallback.

Example `.htaccess` for SPA fallback. Keep the `/api` and `/health` guards before the frontend fallback so static preview domains return a real 404 for direct API probes instead of serving the React HTML shell. The committed `public/.htaccess` is copied into `dist/` by Vite builds:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  RewriteRule ^api(?:/|$) - [R=404,L]
  RewriteRule ^health$ - [R=404,L]

  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

## MySQL readiness

Current status: **not implemented**.

Required before using MySQL as the system database:

- Canonical relational schema for users, role profiles, projects, jobs, applications/proposals, contracts, invoices, escrow ledger, packages, procurement, audit logs, files, notifications, and AI governance records.
- Migration runner and rollback strategy.
- Data-access repository layer replacing or bridging Firestore calls.
- Auth/session strategy compatible with Firebase Auth or replacement identity provider.
- File storage replacement for Vercel Blob/Firebase patterns.
- Full regression test suite against a real MySQL instance.

Until that work is explicitly scoped, production deployment should remain Firebase/Firestore-backed.

## Security notes before upload

- Rotate any real secrets found in local `.env` files before production.
- Do not commit production service-account JSON.
- Use least-privilege Firebase service accounts.
- Keep AI/payment/escrow/signature actions behind human confirmation and audit logs.
