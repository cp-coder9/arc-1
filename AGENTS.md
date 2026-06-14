# Architex Agent Guide

AI-powered architectural marketplace connecting clients with SACAP-registered architects. Features automated SANS 10400 compliance checking via specialized AI agents.

## Tech Stack

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 (via `@tailwindcss/vite` plugin, **no tailwind.config file**)
- shadcn/ui (base-nova style) in `src/components/ui/`
- Firebase (Auth + Firestore + Storage)
- Express dev server with LLM proxy
- Google Gemini AI with multi-agent orchestration

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (Express + Vite middleware)
npm run dev

# Build for production
npm run build

# Type check only (no emit)
npm run lint
```

**Dev server:** Express on `localhost:3000` with Vite middleware. API routes (like `/api/review`) are handled by Express before Vite SPA fallback.

## Path Aliases

- `@/` → `src/` (configured in `vite.config.ts` and `tsconfig.json`)
- Use for all imports: `@/components/ui/button`, `@/lib/firebase`, etc.

## Environment Variables

Copy `.env.example` → `.env.local`:

```bash
GEMINI_API_KEY=""           # Required for AI compliance checking
VITE_BLOB_READ_WRITE_TOKEN=""  # Vercel Blob for file storage
```

Vite exposes env vars to client via `process.env.GEMINI_API_KEY` (see `vite.config.ts`).

## Firebase Configuration

Config lives in `firebase-applet-config.json`. Firestore database ID is non-default: `ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635`.

**Admin hardcoding:** Two emails (`gm.tarb@gmail.com`, `leor@slutzkin.co.za`) are auto-assigned `admin` role on signup. See `src/App.tsx` lines 127-128.

## Architecture Notes

### AI Agent System
Multi-agent orchestration for SANS 10400 compliance review:

- **Orchestrator:** Coordinates specialized agents
- **Wall Compliance Agent:** SANS 10400-K (wall thicknesses, DPC)
- **Fenestration Agent:** SANS 10400-N (ventilation 5%, lighting 10%)
- **Door & Fire Safety Agent:** SANS 10400-T (fire doors, escape routes)
- **Area Sizing Agent:** SANS 10400-C (min 6m² rooms, 2.4m ceilings)
- **General Compliance Agent:** Title blocks, north points, scale bars
- **SANS Specialist:** Cross-reference regulations

Agent prompts stored in Firestore `agents` collection. Run `npx tsx update_agents.ts` to update agent prompts from source. Run `npx tsx list_agents.ts` to view current agents.

### LLM Proxy
All LLM calls go through `/api/review` (Express route in `server.ts`). Supports Gemini (native) and OpenAI-compatible providers (OpenRouter, etc.) via `callOpenAICompatible()`.

### File Storage
Uses Vercel Blob (not Firebase Storage). Token from `VITE_BLOB_READ_WRITE_TOKEN`.

### Tailwind v4 Quirks
- Uses `@import "tailwindcss"` in `src/index.css`
- Theme config is inline in CSS via `@theme inline`
- **No `tailwind.config.ts`** — all customization in CSS
- `@tailwindcss/vite` plugin handles processing

### HMR in AI Studio
HMR can be disabled via `DISABLE_HMR=true` env var. Do not modify this logic in `vite.config.ts` — file watching is disabled to prevent flickering during agent edits.

## Key Directories

```
src/
  components/
    ui/              # shadcn/ui components (radix + tailwind)
    *Dashboard.tsx   # Role-specific dashboards (Client, Architect, Admin)
  lib/
    firebase.ts      # Firebase init, auth, db, error handling
    utils.ts         # cn() utility for tailwind classes
  services/
    geminiService.ts # AI review logic, agent orchestration
  types.ts           # Shared TypeScript types
```

## Types to Know

- `UserRole`: 'client' | 'architect' | 'admin'
- `Job`: Client-posted architectural job
- `Submission`: Architect's drawing upload with AI review status
- `SubmissionStatus`: 'processing' → 'ai_reviewing' → 'ai_passed'/'ai_failed' → 'admin_reviewing' → 'approved'
- `Agent`: Configurable AI specialist with system prompt, temperature, status

## Testing

Run tests in order: `npm run lint && npm test && npm run test:e2e`

- `npm run lint` - TypeScript type checking
- `npm test` - Jest unit tests
- `npm run test:e2e` - Playwright end-to-end tests

## Common Tasks

**Add new shadcn component:**
```bash
npx shadcn add button
# or manually: create file in src/components/ui/, use @/lib/utils for cn()
```

**Update agent prompts in Firestore:**
```bash
npx tsx update_agents.ts
```

**Seed agents (happens automatically in geminiService.ts):**
- `SPECIALIZED_AGENTS` array defines default agents
- `seedAgents()` adds missing agents to Firestore

## Recently Merged

Packs #27 (Pack 8 Finance), #28 (CPD Assessment), #29 (Pack 9 Site Execution) merged 2026-06-14. Builds clean — zero tsc errors.

### Pack 8 — Finance / Payment / Escrow + Commercial Control
- New: `src/lib/finance-api-router.ts` — 20+ finance endpoints
- Services in `src/services/finance/` (14 services, 10 test suites, 132 assertions)
- **No Architex-held funds** — orchestrates provider references, approvals, webhooks
- UI components not yet built; Firestore persistence not yet wired

### CPD Assessment Platform (PR #28)
- New: `src/cpd/` — 8 services (accreditation, analytics, assessment, category rules, certificates, payment, role-body mapping, types)
- New: `src/components/cpd/CPDHub.tsx`
- CPD professional body research matrix at `docs/reference/CPD_PROFESSIONAL_BODY_RESEARCH_MATRIX.md`

### Pack 9 — Site Execution & Field Control (PR #29)
- New: `src/components/NCRManager.tsx`, `SiteInstructionManager.tsx`, `SnagManager.tsx`
- New: `src/services/` — dailyLog, delayWarning, fieldEvidence, ncr, paymentBlocker, programmeImpact, siteExecution, siteInstruction, snag (9 services)
- **7 test suites** — dailyLog, delayWarning, fieldEvidence, ncr, paymentBlocker, programmeImpact, siteExecution, siteInstruction, snag
- Site execution types merged into `src/types.ts`: Severity, NonConformanceReport, SnagItem, DelayEarlyWarning, SiteInstruction, FieldEvidence, PaymentBlocker, ProgrammeImpact, SiteLog

## Security Notes

- Firestore rules in `firestore.rules` (not examined — verify production rules)
- Admin assignment is client-side check + server-side update — don't rely solely on client check
- Firebase config is public (client-side) but uses security rules for access control
