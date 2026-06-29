# Tech Stack & Build System

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite 6 |
| Styling | Tailwind CSS v4 (CSS-only, `@tailwindcss/vite` plugin, `@theme inline` in `src/index.css`) |
| UI Components | shadcn/ui (`@radix-ui/react-*` + `@base-ui/react`) + `lucide-react` icons |
| Animation | `framer-motion` |
| Backend | Express 5 (`api-server.ts` production, `server.ts` dev with Vite middleware) |
| Database | Firebase (Auth + Firestore, non-default DB) + Firebase Admin SDK v13 |
| File Storage | Vercel Blob (`@vercel/blob`) |
| AI | Google Gemini (`@google/genai`) + multi-agent orchestration |
| Validation | Zod schemas (`src/lib/schemas.ts`) |
| Testing | Vitest (unit) + Playwright (E2E) |

## Key Conventions

- **Path alias**: `@/` maps to `src/`
- **Tailwind v4**: No `tailwind.config` file — customization via `@theme inline {}` in `src/index.css`
- **Dark theme default**: App wraps in `ThemeProvider` with Dark_Theme
- **HMR disabled**: `DISABLE_HMR=true` in dev to prevent flicker during agent edits
- **File uploads**: Base64 JSON to `/api/files/upload` — 50MB body limit
- **Client env vars**: Must be prefixed `VITE_*`

## Common Commands

```bash
npm install               # Install dependencies
npm run dev               # Dev server (Express + Vite on :3000)
npm run build             # Production build (Vite → dist/)
npm run lint              # TypeScript type check (tsc --noEmit)
npm test                  # Vitest unit tests (single run)
npm run test:watch        # Vitest watch mode
npm run test:coverage     # Coverage report
npm run test:e2e          # Playwright E2E tests
npm run predeploy:check   # Pre-deployment validation
npm run smoke:deploy      # Smoke test deployed site
```

## Deployment

- **Dev**: `npm run dev` → Express on port 3000 with Vite middleware
- **Production API**: `npm run start:api:host` → standalone Express (cPanel/DigitalOcean)
- **Static bundle**: `npm run deploy:static:bundle`
- **API bundle**: `npm run deploy:api:bundle`
- **CI**: `.github/workflows/verification.yml` runs lint → tests → build

## Type Checking

- App types: `tsconfig.app.json`
- Test types: `tsconfig.json`
- Run `npm run lint` (tsc --noEmit) to verify — target is zero errors
