# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Architex Built Environment OS** is a role-based, action-driven platform coordinating the complete lifecycle of construction and architectural projects. The system adapts dynamically to user role, active project stage, and "Next Best Action" prioritization.

## 8-Stage Project Lifecycle

```
[1. Brief] → [2. Appoint] → [3. Design] → [4. Comply] → [5. Procure] → [6. Build] → [7. Pay] → [8. Close-out]
```

### Stage Summary
1. **Brief & Diagnostic**: Guided wizard for client requirements; AI analysis and BEP technical brief refinement
2. **Appoint**: BEP search, proposal comparison, contract generation, digital signature, escrow setup
3. **Design**: Design team matrix, freelancer work packages, remote workstation booking
4. **Comply**: AI drawing checker, SANS form autofill, municipal submission tracking
5. **Procure**: Drawing-to-BoM extraction, supplier API lookups, purchase order generation
6. **Build**: Construction OS, daily site logs, staff/plant management, programme/Gantt
7. **Pay**: Invoice builder, escrow gateway, FICA compliance, milestone-based releases
8. **Close-out**: Snagging tool, snag rectification, handover pack compilation, project archive

## Six User Roles

1. **Client** - Guided brief wizard, BEP proposal comparison, contract signing, escrow payments
2. **BEP/Design Team** - Technical brief editor, fee proposal builder, design team matrix, AI drawing checker
3. **Main Contractor** - Construction OS, staff/plant management, BoQ/BoM procurement, Gantt programme
4. **Subcontractor/Supplier** - Shop drawings, delivery uploads, progress claims, compliance certificates
5. **Freelancer** - Assigned work tasks, submissions/feedback, remote desktop booking, invoicing
6. **Admin/Governance** - Verification queues, dispute resolution, marketplace curation, rate settings

## Tech Stack

- **Frontend**: React 19 + TypeScript + Vite 6
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/vite` plugin - no config file)
- **UI Components**: shadcn/ui (radix-ui + base-ui) in `src/components/ui/`
- **Backend**: Express server (`server.ts` / `api-server.ts`) with Vite middleware
- **Database**: Firebase (Auth + Firestore + Storage) / PostgreSQL (alternative)
- **File Storage**: Vercel Blob
- **AI**: Google Gemini + multi-agent orchestration

## Development Commands

```bash
npm install              # Install dependencies
npm run dev             # Start dev server (Express + Vite on port 3000)
npm run build           # Build for production
npm run lint            # Type check (no emit)
npm test                # Run Vitest unit tests
npm run test:watch      # Run tests in watch mode
npm run test:e2e        # Run Playwright E2E tests
npm run docs:api-contracts  # Validate API contract documentation
npx tsx update_agents.ts    # Update AI agent prompts in Firestore
npx tsx list_agents.ts      # List current AI agents
```

## Verification Pipeline (GitHub Actions)

```bash
npm run lint          # TypeScript type checking
npm run lint:tests    # Test file type checking
npm test              # Vitest unit tests
npm run docs:api-contracts  # API contract validation
npm run build         # Production bundle
```

## Key Platform Modules

### Compliance & Regulatory Integration

- **SANS 10400 Compliance**: Wall thicknesses (K), fenestration (N), fire safety (T), area sizing (C)
- **SANS 10400-T Fire Protection**: Escape route geometry, fire compartmentation, municipal fire department submission
- **SANS 10082 Timber Truss**: ITC-SA A19 structural timber roof certification
- **SANS 10142-1-2 SSEG**: Solar PV installation compliance, inverter certificates
- **SANS 10252 Water**: Borehole, greywater, water use license applications (WULA)
- **SANS 3001 Lab Testing**: Concrete cube crushing, soil compaction, material test tracking

### AI Agent System

Multi-agent orchestration for automated compliance:
- **Orchestrator**: Coordinates specialized agents
- **Wall Compliance Agent**: SANS 10400-K (wall thicknesses, DPC)
- **Fenestration Agent**: SANS 10400-N (ventilation 5%, lighting 10%)
- **Door & Fire Safety Agent**: SANS 10400-T (escape routes, fire doors)
- **Area Sizing Agent**: SANS 10400-C (min 6m² rooms, 2.4m ceilings)
- **General Compliance Agent**: Title blocks, north points, scale bars

Agent prompts stored in Firestore `agents` collection. `geminiService.ts` handles seeding and orchestration.

### Specialized Workflows

- **FICA Compliance**: Cash Threshold Reports (CTR ≥ R50,000), Suspicious Transaction Reports (STR/SAR)
- **Surveyor-General Integration**: SG Diagram vectorisation, boundary/encroachment detection
- **Heritage Impact Assessment (NHRA Section 38)**: Spatial trigger scanning (>5000m² or >300m linear)
- **B-BBEE Procurement**: Certificate verification, preferential procurement scoring, real-time spend tracking
- **Demolition & Waste Management**: Asbestos abatement, NEM:WA compliance, disposal certificates
- **Soil/Concrete Lab Testing**: SANS 3001 compaction, cube crushing at 7/28 days, compliance alerts

### Escrow State Machine

Multi-state escrow system binding financial releases to compliance events:
- States: Unfunded → FundedHeld → Released / Disputed
- Milestone certification by appointed professional (QS/Engineer)
- Auto-split: Platform fee deducted, rest routed to payee
- Dispute mechanism freezes funds, routes to arbitration console

## Architecture

### Server Setup (`server.ts`)

- Express server with Vite middleware in development
- API routes mounted at `/api/*` (lazy-loaded from `src/lib/api-router.ts`)
- **Notification Worker**: Subscribes to Firestore `notifications` collection
- **Vercel deployment**: Static file serving from `dist/`, SPA fallback in production

### API Router (`src/lib/api-router.ts`)

Express router with rate limiting for:
- LLM proxy for AI compliance review (`/api/review`)
- File uploads via multer to Vercel Blob
- Payment integration (PayFast) with webhook handling
- Municipal automation endpoints
- User verification workflows
- AI governance and audit logging
- Fee estimation and marketplace opportunity services

### Frontend Architecture

- **Entry**: `index.html` → `src/main.tsx` → `src/App.tsx`
- **Path Alias**: `@/` → `src/` (configured in `vite.config.ts` and `tsconfig.json`)
- **Routing**: React Router in `src/App.tsx` with role-based protected routes
- **State**: Firebase / PostgreSQL real-time listeners for data sync
- **Theme**: `next-themes` for dark/light mode

### Key Services (`src/services/`)

- **Workflow services**: `briefWorkflowService`, `marketplaceWorkflowService`, `approvalGateService`
- **Compliance**: `sansComplianceFormPackService`, `aiComplianceWorkflowService`, `verificationAgentService`
- **Financial**: `feeEstimatorService`, `financialLedgerService`, `paymentService`, `escrowGovernanceService`
- **Construction**: `constructionService`, `tenderService`, `contractorWorkflowService`, `closeoutService`
- **Governance**: `governanceService`, `aiGovernanceService`, `auditService`, `sacupVerificationService`

### Key Components (`src/components/`)

Role-specific dashboards:
- `ClientDashboard.tsx`, `ArchitectDashboard.tsx`, `AdminDashboard.tsx`
- `ContractorDashboard.tsx`, `FirmDashboard.tsx`, `FreelancerDashboard.tsx`

Specialized tools:
- `GuidedBriefWizard.tsx`, `TechnicalBriefEditor.tsx`, `FeeEstimator.tsx`
- `BEPDashboard.tsx`, `DesignCompliancePage.tsx`, `DrawingRegisterPage.tsx`
- `StageProgressTracker.tsx`, `ResponsibilityMatrix.tsx`, `TenderWizard.tsx`

## Environment Variables

```env
GEMINI_API_KEY=""           # Required for AI compliance checking
VITE_BLOB_READ_WRITE_TOKEN=""  # Vercel Blob for file storage
VITE_FIREBASE_*             # Firebase client config
PAYFAST_*                   # Payment gateway credentials
GOOGLE_SEARCH_API_KEY=""    # For agent web search
```

Client vars exposed via `process.env.VITE_*`. Server uses `process.env.*` directly.

## Firebase Setup

- Client config in `firebase-applet-config.json`
- Non-default Firestore DB: `ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635`
- Admin users hardcoded: `gm.tarb@gmail.com`, `leor@slutzkin.co.za`
- Admin SDK initialized in `firebase-admin.ts`

## Testing Structure

- **Unit tests**: `*.test.ts` / `*.test.tsx` alongside source or in `__tests__/`
- **E2E tests**: `e2e/` directory with Playwright
- **Setup**: `src/test/setup.ts` with Firebase, Vercel Blob mocks

Run specific test:
```bash
npm test -- src/lib/__tests__/api-router.security.test.ts
```

## Files to Understand First

1. `src/App.tsx` - Main app shell, routing, role-based access
2. `src/lib/firebase.ts` / `firebase-admin.ts` - Firebase initialization
3. `src/lib/api-router.ts` - Backend API endpoints
4. `src/services/geminiService.ts` - AI agent orchestration
5. `src/components/*Dashboard.tsx` - Role-specific dashboards
6. `src/types.ts` - Shared TypeScript type definitions
7. `server.ts` - Express + Vite dev server setup
8. `docs/architex-built-environment-prd.md` - Full product requirements document

## Development Notes

- Tailwind v4: No config file, customization in `src/index.css` via `@theme inline`
- Path aliases: Use `@/` for all imports from `src/`
- HMR: Disabled via `DISABLE_HMR=true` env var to prevent flickering during agent edits
- Type checking: Separate configs for app (`tsconfig.app.json`) and tests (`tsconfig.json`)