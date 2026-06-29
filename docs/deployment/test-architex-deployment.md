# test.architex.co.za deployment policy

Architex repository deployments are now routed through the owned test host instead of Vercel.

## Deployment target

- Frontend test site: `https://test.architex.co.za`
- API host used by the static frontend: `https://api.architex.co.za`
- Deployment branch: `main`

Feature branches and pull requests should run verification only. They must not create Vercel preview deployments or any other public deployment. Merge reviewed work into `main`; the `Deploy test.architex.co.za` GitHub Actions workflow builds and uploads the SPA to `test.architex.co.za` and the PHP API gateway to `api.architex.co.za`.

## Required GitHub Actions secrets

The deployment workflow requires these repository or environment secrets:

- `TEST_ARCHITEX_FTP_SERVER`
- `TEST_ARCHITEX_FTP_USERNAME`
- `TEST_ARCHITEX_FTP_PASSWORD`
- `TEST_ARCHITEX_FTP_SERVER_DIR`

`TEST_ARCHITEX_FTP_SERVER_DIR` should point to the document root for `test.architex.co.za`.

## Build and verification commands

Local bundle preparation:

```bash
npm run deploy:test:bundle
```

Live smoke verification:

```bash
npm run deploy:test:smoke
```

The workflow runs both steps automatically after pushes to `main`, with `VITE_API_BASE_URL=https://api.architex.co.za` so browser API calls do not fall back to the static SPA host.

## Vercel removal

The repository no longer contains `vercel.json` or the `vercel-build` script. Vercel project/GitHub-app auto-deployments must also be disabled or disconnected in the Vercel dashboard, because that external integration can still create preview status checks even after repo-level Vercel config is removed.
