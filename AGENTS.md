# Architex Agent Guide

> Role-based, action-driven Built Environment OS coordinating the complete lifecycle of construction and architectural projects.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| **Frontend** | React 19 + TypeScript + Vite 6 |
| **Styling** | Tailwind v4 CSS-only (`@tailwindcss/vite` plugin — no config file, `@theme inline` in `src/index.css`) |
| **UI Components** | shadcn/ui (`@radix-ui/react-*` + `@base-ui/react`) + `lucide-react` icons |
| **Animation** | `framer-motion` / `framer-motion-mcp` |
| **Backend** | Express 5 (`api-server.ts` production, `server.ts` dev with Vite middleware) |
| **Database** | Firebase (Auth + Firestore non-default DB: `ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635` + Storage) |
| **File Storage** | Vercel Blob (`@vercel/blob`) |
| **AI** | Google Gemini (`@google/genai`) + multi-agent orchestration (`src/services/agents/`) |
| **Forms/Validation** | `zod` schemas in `src/lib/schemas.ts` |
| **Dev Server** | `npm run dev` → Express on `:3000` with Vite middleware |

**Path alias:** `@/` → `src/`

---

## Project Structure

```
├── index.html                    # Entry point
├── server.ts                     # Dev server (Express + Vite middleware)
├── api-server.ts                 # Production API server (cPanel/DigitalOcean)
├── vite.config.ts                # Vite build config
├── firebase-applet-config.json   # Firebase client config
├── firebase-admin.ts             # Server-side Firebase Admin SDK
├── scripts/                      # Build, deploy, smoke-test scripts
│   ├── build-cpanel-api-bundle.mjs
│   ├── build-static-upload-bundle.mjs
│   ├── deploy-smoke.mjs
│   ├── predeploy-check.mjs
│   └── ...
├── src/
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # Main app shell, routing, role-based auth
│   ├── types.ts                  # Shared TypeScript types (UserRole, Firm, Project, etc.)
│   ├── index.css                 # Tailwind v4 + @theme inline customizations
│   ├── lib/                      # Core libraries
│   │   ├── firebase.ts           # Client Firebase init
│   │   ├── firebase-admin.ts     # Server Admin SDK
│   │   ├── api-router.ts         # Express API router (lazy-loaded)
│   │   ├── apiClient.ts          # Client-side API fetch wrapper
│   │   ├── schemas.ts            # Zod validation schemas
│   │   └── ...
│   ├── demo-context/AGENTS.md         ← Demo Mode Context — role switching, sandbox seeding
│   ├── demo-seed/AGENTS.md           ← Demo Mock Data — projects, users, CPD, submissions
│   ├── components/               # UI components + role-specific dashboards
│   │   ├── ui/                   # shadcn/ui primitives (button, card, dialog, etc.)
│   │   ├── ClientDashboard.tsx
│   │   ├── ArchitectDashboard.tsx
│   │   ├── AdminDashboard.tsx
│   │   ├── ContractorDashboard.tsx
│   │   ├── BEPDashboard.tsx
│   │   └── ...
│   ├── features/                 # Feature modules
│   │   └── project-communications/  # Project chat + messaging
│   ├── services/                 # ~150+ business logic services
│   │   ├── agents/               # AI agent implementations
│   │   ├── tools/                # Standalone tool registry
│   │   ├── toolsets/             # Tool grouping + orchestration
│   │   ├── geminiService.ts      # AI seeding + orchestration
│   │   ├── workflowToolAgentService.ts
│   │   └── ...
│   ├── navigation/               # Role-aware navigation config
│   │   ├── architexNavigationConfig.ts
│   │   └── navTypes.ts
│   ├── hooks/                    # Custom React hooks
│   ├── data/                     # Static data (demo, seed, examples)
│   └── __tests__/                # Test files
```

---

## 8-Stage Project Lifecycle

```
[1. Brief] → [2. Appoint] → [3. Design] → [4. Comply]
    → [5. Procure] → [6. Build] → [7. Pay] → [8. Close-out]
```

| Stage | Description |
|-------|-------------|
| **1. Brief & Diagnostic** | Guided client wizard; AI analysis + BEP technical brief refinement |
| **2. Appoint** | BEP search, proposal comparison, contract generation, digital signature, escrow setup |
| **3. Design** | Design team matrix, freelancer work packages, remote workstation booking |
| **4. Comply** | AI drawing checker, SANS form autofill, municipal submission tracking |
| **5. Procure** | Drawing-to-BoM extraction, supplier API lookups, purchase orders |
| **6. Build** | Construction OS, daily site logs, staff/plant management, programme/Gantt |
| **7. Pay** | Invoice builder, escrow gateway, FICA compliance, milestone releases |
| **8. Close-out** | Snagging, rectification, handover pack, project archive |

---

## User Roles

17 roles defined in `src/types.ts`:

| Role | Description |
|------|-------------|
| `client` | Property owner / developer |
| `architect` | Design professional (SACAP registered) |
| `engineer` | Structural / civil engineer |
| `quantity_surveyor` | Cost management professional |
| `town_planner` | Urban planning |
| `energy_professional` | SANS 10400-XA compliance |
| `fire_engineer` | Fire safety design |
| `site_manager` | Construction site management |
| `bep` | Built Environment Professional (multi-discipline) |
| `contractor` | Main contractor |
| `subcontractor` | Specialist contractor |
| `supplier` | Material/equipment supplier |
| `freelancer` | Independent professional |
| `developer` | Property developer |
| `firm_admin` | Firm/organization administrator |
| `platform_admin` | Platform governance |
| `admin` | System administration |

Plus firm-level roles: `owner`, `admin`, `coordinator`, `staff`, `billing_viewer`

---

## Navigation

Role-aware multi-level navigation defined in `src/navigation/architexNavigationConfig.ts`:

| Module | Key Sections | Roles |
|--------|-------------|-------|
| **Command Centre** | Today/Next, Active Projects, CPD Status, Messages, Agent Recommendations | All |
| **Inbox / Action Centre** | Required Actions, Approvals, Retakes, Overdue | All |
| **Projects** | Dashboard, Team, Documents, RFIs, Instructions, Snags, Payments, Audit Trail | Client, Architect, Admin, BEP, Contractor, Sub, Supplier |
| **Toolboxes** | Proposal & Appointment, Design & Compliance, Costing & Procurement, Construction Admin, Closeout, Full Library | Architect, Admin, Freelancer, Contractor |
| **CPD & Learning** | Dashboard, Courses, Assessments, Certificates, Submissions, Partner Admin | Architect, Admin, Freelancer |
| **Documents / Knowledge Hub** | My Documents, Project Documents, Templates, Knowledge Base | Client, Architect, Admin, BEP, Contractor, Sub |
| **People** | Professionals, Firms, Team Matrix, CPD Directory | Client, Architect, Admin |
| **Marketplace** | Client Projects, Freelancer/Team, CPD Courses, Proposals | All |
| **Payments / Finance** | Dashboard, Payment Schedule, Escrow, FICA, Invoices | Client, Architect, Admin, Contractor |
| **Compliance Hub** | SANS Checks, Municipal Dashboard, SACAP Verification, POPIA | Architect, Admin |
| **Admin / Governance** | Verification Queue, AI Review, CPD Admin, Platform Settings | Admin, Platform Admin |

---

## AI Agent System

Multi-agent orchestration for automated compliance + workflow. Agents defined in `src/services/agents/`:

| Agent | File | Purpose |
|-------|------|---------|
| Briefing Agent | `services/agents/briefingAgent.ts` | Client requirement analysis, brief generation |
| Construction Agent | `services/agents/constructionAgent.ts` | Site execution, programme, snagging |
| Matching Agent | `services/agents/matchingAgent.ts` | BEP-professional matchmaking |
| Tender Agent | `services/agents/tenderAgent.ts` | Tender evaluation, bid comparison |
| Workflow Agent Utils | `services/agents/workflowAgentUtils.ts` | Shared agent utilities |

Additional compliance agents (prompts stored in Firestore `agents` collection):
- **Orchestrator** — coordinates specialized agents
- **Wall Compliance Agent** — SANS 10400-K wall thickness, DPC
- **Fenestration Agent** — SANS 10400-N ventilation 5%, lighting 10%
- **Door & Fire Safety Agent** — SANS 10400-T escape routes, fire doors
- **Area Sizing Agent** — SANS 10400-C minimum room sizes
- **General Compliance Agent** — Title blocks, north points, scale bars

All orchestrated via `src/services/geminiService.ts` (Google Gemini + multi-agent workflow).

---

## Key Platform Modules

### Compliance & Regulatory
- **SANS 10400** — Walls (K), Fenestration (N), Fire (T), Area (C), Water (W), Access (S), Energy (XA)
- **SANS 10082** — Timber truss certification (ITC-SA A19)
- **SANS 10142-1-2 SSEG** — Solar PV compliance
- **SANS 10252** — Water use license applications (WULA)
- **SANS 3001** — Lab testing (concrete, soil compaction)
- **POPIA/FICA** — Data protection, cash threshold reports
- **B-BBEE** — Procurement scoring, certificate verification
- **NHRA Section 38** — Heritage impact assessments

### Financial
- **Escrow State Machine**: Unfunded → FundedHeld → Released / Disputed
- **Platform Fees**: Auto-split milestone certification
- **PayFast Integration**: Webhook handling
- **FICA Reporting**: CTR ≥ R50,000, STR/SAR

### Construction
- **Construction OS**: Site diary, daily logs
- **Staff/Plant Management**: Resource tracking
- **Programme/Gantt**: Schedule management
- **Snagging**: Defect tracking + rectification workflow

### Procurement
- **RFQ/RFP**: Bidder invitation, comparison, award
- **BoQ/BoM**: Drawing extraction, supplier lookup
- **Purchase Orders**: Generation + approval chain

---

## API Architecture

Two server modes:

### Dev Server (`server.ts`)
```bash
npm run dev    # Port 3000, Vite middleware for HMR
```
- Express 5 + Vite dev middleware
- API routes at `/api/*` (lazy-loaded `src/lib/api-router.ts`)
- CORS: `localhost:3000`, `localhost:5173`
- Body limit: 50MB (for base64 file uploads)
- Notification worker subscribes to Firestore `notifications` collection

### Production API (`api-server.ts`)
```bash
npm run start:api:host    # Standalone API on cPanel/DigitalOcean
```
- Express 5 (no Vite middleware — static dist/ for SPA)
- CORS: `architex.co.za`, `test.architex.co.za`, `*.vercel.app`
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`
- Rate limiting via `express-rate-limit`
- Routes: `/api/health`, `/api/auth/check-admin`, `/api/review`, file uploads, payments, municipal automation

---

## Development Commands

```bash
npm install                 # Install deps
npm run dev                 # Dev server (Express + Vite on :3000)
npm run build               # Production build
npm run lint                # TypeScript check (tsc --noEmit)
npm test                    # Vitest unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # Coverage report
npm run test:e2e            # Playwright E2E
npm run docs:api-contracts  # Validate API contracts
```

### Deployment Commands
```bash
npm run build               # Vite build → dist/
npm run deploy:static:bundle    # Build + static upload bundle
npm run deploy:api:bundle       # API bundle for cPanel
npm run deploy:test:bundle      # Test deployment (VITE_API_BASE_URL=https://api.architex.co.za)
npm run smoke:deploy            # Smoke test deployed site
npm run predeploy:check         # Pre-deployment validation
```

---

## Verification Pipeline (CI)

```bash
npm run lint            # TypeScript type checking
npm run lint:tests      # Test file type checking
npm test                # Vitest unit tests
npm run docs:api-contracts  # API contract validation
npm run build           # Production bundle
```

---

## Firebase Setup

| Detail | Value |
|--------|-------|
| Client config | `firebase-applet-config.json` |
| Non-default DB | `ai-studio-2ae3d9c3-70e6-4323-8a95-9d566bd24635` |
| Admin SDK | `src/lib/firebase-admin.ts` |
| Admin emails | `gm.tarb@gmail.com`, `leor@slutzkin.co.za` |
| Firestore rules | `firestore.indexes.json`, `firebase.json` |

---

## Testing Structure

| Type | Tool | Location |
|------|------|----------|
| Unit tests | Vitest | `*.test.ts` / `*.test.tsx` alongside source or `__tests__/` |
| E2E tests | Playwright | `e2e/` directory (config: `playwright.config.ts`) |
| Setup | — | `src/test/setup.ts` (Firebase + Vercel Blob mocks) |
| Firestore rules | — | `scripts/run-firestore-rules-tests.mjs` |

Run specific test:
```bash
npm test -- src/lib/__tests__/api-router.security.test.ts
```

---

## Environment Variables

```env
GEMINI_API_KEY=""                    # Required for AI compliance
VITE_BLOB_READ_WRITE_TOKEN=""        # Vercel Blob storage
VITE_FIREBASE_*                      # Firebase client config
PAYFAST_*                            # Payment gateway credentials
GOOGLE_SEARCH_API_KEY=""             # Agent web search
DISABLE_HMR=true                     # Disable HMR for AI Studio
PORT=3000                            # Server port
```

Client vars: `process.env.VITE_*`. Server vars: `process.env.*`.

---

## Key Files to Understand First

1. `src/App.tsx` — Main app shell, routing, role-based auth, lazy loading
2. `src/lib/firebase.ts` / `firebase-admin.ts` — Firebase initialization
3. `src/lib/api-router.ts` — Backend API endpoints
4. `src/services/geminiService.ts` — AI agent orchestration
5. `src/services/agents/` — Agent implementations
6. `src/navigation/architexNavigationConfig.ts` — Role-aware navigation
7. `src/components/*Dashboard.tsx` — Role-specific dashboards
8. `src/types.ts` — Shared TypeScript types (UserRole, Firm, Project, etc.)
9. `server.ts` + `api-server.ts` — Express dev + production servers
10. `src/lib/schemas.ts` — Zod validation schemas

---

## Development Notes

- **Tailwind v4**: No `tailwind.config` — customization via `@theme inline {}` in `src/index.css`
- **Path aliases**: Use `@/` for all imports from `src/`
- **HMR**: Disabled with `DISABLE_HMR=true` — prevents flickering during agent file edits
- **Type checking**: Separate `tsconfig.app.json` (app) and `tsconfig.json` (tests)
- **File uploads**: Sent as base64 JSON to `/api/files/upload` — 50MB body limit
- **Build chunks**: Manual chunk splitting in `vite.config.ts` (firebase, react, framer, pdf-vendor, etc.)
- **Admin SDK**: Uses firebase-admin `v13` with service account credentials
- **cPanel deployment**: Build bundles via `scripts/build-static-upload-bundle.mjs` / `scripts/build-cpanel-api-bundle.mjs`
|- **~150+ services** in `src/services/` covering all project lifecycle phases
|- **~70+ components** in `src/components/` with role-specific dashboards + specialized tools

---

# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Demo Pack — Demo Mode Infrastructure

Same codebase, same `main` branch, one `VITE_DEMO_MODE` env flag. Demo-specific code tree-shaken from live builds.

| File | Purpose |
|------|---------|
| `demo-context/DemoModeProvider.tsx` | React context: detects `VITE_DEMO_MODE=true`, manages demo role state, auto-seeds sandbox on first login |
| `demo-seed/seedAllData.ts` | Master seeder: writes 12 projects, 19 users, CPD data, submissions, messages, compliance checks |
| `demo-seed/mockUsers.ts` | 19 user profiles (all roles + CPD Officer) |
| `demo-seed/mockProjects.ts` | 12 projects across all lifecycle stages (R3.2M-R220M) |
| `demo-seed/mockSubmissions.ts` | Per-project submissions with realistic drawing index per stage |
| `demo-seed/mockMessages.ts` | Per-project conversation threads (brief → close-out) |
| `demo-seed/mockCompliance.ts` | SANS compliance check results per project per stage |
| `demo-seed/mockCPD.ts` | 6 CPD articles, 4 assessments, 3 learning modules, 5 certificates |
| `demo-seed/demoFirestore.ts` | Persistence wrapper: transparently prefixes Firestore paths under `/demo/{uid}/` for per-user sandbox isolation |
| `components/DemoRoleSwitcher.tsx` | Nav dropdown: 22 roles in 7 groups, persists to localStorage |
| `components/DemoBanner.tsx` | Fixed-bottom "DEMO MODE" banner with role, seed status, reset button |

### Per-User Sandbox
All demo data lives under `/demo/{uid}/` in Firestore. Security rules enforce uid-scoped access. User changes persist across page reloads — isolated per user.

### Deploy
- Live: `VITE_DEMO_MODE=false` → demo code tree-shaken
- Demo: `VITE_DEMO_MODE=true` → demo code included
- Vercel dual-deploy from same `main` branch
- DNS: CNAME `demo.architex.co.za` → `cname.vercel-dns.com`

---

# DOX Framework

## Core Contract

1. AGENTS.md files are binding work contracts for their subtrees
2. Read the root AGENTS.md and walk the DOX chain before ANY project interaction
3. After editing, update the nearest owning AGENTS.md

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

## Child DOX Index

### DOX Tree
```
architex/
├── AGENTS.md                          ← Root (this file) — project-wide contracts
├── src/
│   ├── components/
│   │   └── ui/AGENTS.md               ← UI Primitives (shadcn/ui) — atomic components
│   ├── features/
│   │   └── project-communications/AGENTS.md ← Project Communication Feature
│   ├── navigation/AGENTS.md           ← Role-Aware Navigation — info architecture
│   └── services/
│       ├── agents/AGENTS.md           ← AI Agent Implementations — domain agents
│       ├── agentWorkflow/AGENTS.md    ← Agent Workflow Orchestration — orchestration core
│       ├── finance/AGENTS.md          ← Finance Domain Services — money, escrow, payments
│       └── masterExpansion/AGENTS.md  ← Master Product Expansion — modules, lifecycle, risk
```

### Document Inventory

| Path | Purpose | Why It Qualifies |
|------|---------|------------------|
| `src/services/agents/AGENTS.md` | AI agent implementations for built-environment compliance, matching, tender, construction | Each agent is a durable domain boundary with its own input/output contracts, SANS regulatory knowledge, and orchestration rules. Root doc references them but doesn't detail per-agent contracts. |
| `src/services/agentWorkflow/AGENTS.md` | Agent orchestration core: identity, routing, governance, monitoring, approval gates, audit trails | 20+ file subsystem with its own architecture, event routing, tenant scoping, and explicit module boundary (`agent_orchestration_core`). |
| `src/services/finance/AGENTS.md` | Financial domain: cashflow, claims, escrow, payments, certificates, retention, variation control | Financial domain with strict regulatory rules, third-party provider contracts, state machines, and audit requirements that differ from general business logic. |
| `src/services/masterExpansion/AGENTS.md` | Product expansion: module registry, navigation config, lifecycle engine, risk engine, passport | Architectural backbone defining product module structure, lifecycle state machine, and workspace routing — a durable platform expansion layer. |
| `src/components/ui/AGENTS.md` | Reusable shadcn/ui primitive components | Atomic component library with its own styling conventions, accessibility contracts, and prop patterns consumed by every feature component in the app. |
| `src/navigation/AGENTS.md` | Role-aware navigation configuration and routing | Central information architecture contract that determines what every user role sees. Consumed by App.tsx and all dashboards. |
| `src/features/project-communications/AGENTS.md` | Project chat, messaging, phase-aware communication panels | Bounded feature module with its own component tree, service layer, type system, and config — the clearest feature boundary in the project. |

### Directories Reviewed but NOT Qualifying

| Path | Reason |
|------|--------|
| `src/types/` | Pure type definitions (11 files), no behavioral rules or workflow — too thin for a separate doc |
| `src/lib/` | Heterogeneous collection of utilities (firebase, api, routes, schemas, encryption) — no single purpose boundary |
| `src/test/` | Test infrastructure (setup, mocks) — already documented in root AGENTS.md testing section |
| `src/hooks/` | Single custom hook — insufficient scope |
| `src/data/` | Only 2 static data files — operational, not a durable boundary |
| `src/demo-seed/` | Demo seed data — operational test data, not a durable code boundary |
| `src/demo-context/` | Single provider component — insufficient scope |
| `src/examples/` | Single example file — reference material, not a working boundary |
| `src/components/cpd/` | 6 CPD UI components nested under components — defers to when components/ as a whole gets indexed |
| `src/components/tools/` | Tool UI components — same deferral reasoning as cpd/ |
| `src/components/toolsets/` | Only 2 toolset UI components — too thin for a separate doc |
| `src/services/tools/` | 2 files (registry + run service) — registry logic covered by root doc |
| `src/services/toolsets/` | 7 files but tightly coupled to workflowToolAgentService — root doc already covers registry pattern |
| `src/__tests__/` | Single test file — insufficient scope |
| `src/services/__tests__/` | Test files for services — test organization, not a behavioral boundary |
