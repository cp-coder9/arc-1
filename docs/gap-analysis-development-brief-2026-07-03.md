# Architex Gap Analysis — Development Brief

**Date:** 3 July 2026  
**Purpose:** Continuation brief for developing features against the built environment gap analysis across new chat sessions.

---

## Context

Architex is a Built Environment OS for South Africa with 19 user roles, 8 workflow modules, 54+ tools, and a SpecForge specification spine. A comprehensive gap analysis was performed identifying missing domains needed to make the platform a complete industry operating system.

**Key reference documents:**
- `docs/built-environment-gap-analysis-2026-07-01.md` — Full gap analysis with prioritised recommendations
- `docs/architecture-review-2026-07-01.md` — Tool integration and OS structure review
- `.kiro/steering/toolbox-architecture.md` — 8 module architecture rules
- `.kiro/steering/architecture-rules.md` — Core architecture rules
- `.kiro/steering/tech.md` — Tech stack reference
- `.kiro/steering/structure.md` — Project structure
- `AGENTS.md` — Full project documentation (DOX framework)

---

## P0 Items — Status

### P0.1: Contract Administration & Legal Layer ✅ SPEC COMPLETE + IMPLEMENTED

**Branch:** `feature/contract-administration` (PR open)  
**Spec:** `.kiro/specs/contract-administration/` (requirements.md + design.md + tasks.md — all tasks complete)

**What was built:**
- 12 requirements covering JBCC PBA, NEC ECC, GCC 2025, FIDIC contract forms
- Contract setup wizard, data sheet, notice register, deadline engine (7/3/1 day warnings)
- Variation order register with cost/time impact
- Extension of Time claims with evidence linking
- Payment clause awareness with schedule generation
- Claims & dispute register with adjudication support
- Working day calculator (SA public holidays)
- Role-based access control
- Platform integration (Passport, SpecForge, Finance, Inbox, Audit Trail, Documents, Risk Engine)
- Advisory-only disclaimers throughout

**Files created:** `src/services/contractAdmin/` + `src/lib/contract-admin-api-router.ts` + tests

---

### P0.2: Add `land_surveyor` + `cpm` to UserRole ✅ CODE COMPLETE

**Branch:** `feature/contract-administration` (same PR, committed)

**What was done:**
- Added `'land_surveyor' | 'cpm'` to `UserRole` union in `src/types.ts` (17 → 19 roles)
- Added both roles to all relevant navigation modules in `src/navigation/architexNavigationConfig.ts`:
  - Command Centre, Inbox, Projects, Toolboxes, CPD & Learning, Documents, Marketplace, Analytics, Messages

**Regulatory mapping:**
- `land_surveyor` → PLATO (SA Geomatics Council)
- `cpm` → SACPCMP (SA Council for Project and Construction Management Professions)

---

### P0.3: Town Planning & Land Development Workflow ✅ SPEC + CODE COMPLETE

**Branch:** `feature/town-planning-workflow` (PR #132 open)  
**Spec:** `.kiro/specs/town-planning-workflow/` (requirements.md + design.md + tasks.md)

**What was built (13 files, 3,060 lines):**

| File | Purpose |
|------|---------|
| `src/features/town-planning/types.ts` | Full type system — ApplicationType, ApplicationStage, LandUseApplication, PropertyIntelligence, ZoningParameters, conditions, SDP, subdivision, appeals, municipality config, access control |
| `src/features/town-planning/schemas.ts` | 7 Zod validation schemas (CreateApplicationParams, ConditionInput, CommentInput, MunicipalityProfileInput, StageTransitionParams, AppealInput, ChecklistItemUpdate) |
| `src/features/town-planning/services/dateUtils.ts` | SA working day calculator — Easter computation, 12 fixed holidays, Sunday substitution rule, addWorkingDays, addCalendarDays, getRemainingWorkingDays |
| `src/features/town-planning/services/accessControl.ts` | 19-role permission matrix, checkPermission(), getEffectivePermissions(), isAdminRole(), FirestoreDB DI interface |
| `src/features/town-planning/services/workflowTracker.ts` | 10-stage SPLUMA state machine (preparation→submission→acknowledgement→circulation→advertising→comment_period→hearing→decision→conditions_compliance, any→withdrawn), TransitionError, getDeadlines() |
| `src/features/town-planning/services/conditionsRegister.ts` | Forward-only state machine (outstanding→in_progress→fulfilled/waived), createCondition(), updateConditionStatus(), isConditionsCompliant(), getConditionsSummary() |
| `src/features/town-planning/services/applicationEngine.ts` | createApplication() with Zod + type-specific field enforcement, getApplication(), listApplicationsByProject(), generateReferenceNumber() |
| `src/features/town-planning/services/sequentialDependency.ts` | SPLUMA→SDP→Building Plan chain: checkReadiness(), markPlanningNotApplicable(), getProgressIndicator() |
| `src/features/town-planning/router.ts` | Express Router with 30+ API endpoints, placeholder auth via x-user-id/x-user-role headers |
| `src/features/town-planning/index.ts` | Barrel exports |
| `src/features/town-planning/AGENTS.md` | DOX file |
| `src/features/town-planning/__tests__/dateUtils.test.ts` | Unit tests for SA working day calculator |
| `src/features/town-planning/__tests__/e2e-workflows.test.ts` | Integration tests with in-memory mock Firestore |

**Navigation:** Added `town_planning` section under Toolboxes in architexNavigationConfig.ts

---

## P1 Items — NOT YET STARTED

### P1.4: Insurance Register (Gap 4)
- Project-level policy tracking (CAR, PI, public liability, SASRIA, LDI)
- Policy expiry tracking and renewal warnings
- Insurance requirement checker per contract type
- Claims notification register
- Integration: Trust & Verification, Project Passport, Closeout, Risk Engine

### P1.5: Dispute Resolution & Formal Claims (Gap 6)
- Claims register (EoT, loss & expense, disruption, prolongation)
- Notice timeline engine per contract type
- Supporting evidence linkage
- Adjudication workflow
- Quantum/delay analysis support
- Note: Some overlap with Contract Administration (P0.1) — this extends it into formal dispute resolution

### P1.6: NHBRC Enrolment & Home Builder Workflow (Gap 7)
- NHBRC enrolment checklist and fee calculator
- Stage inspection tracking (foundation → wall plate → roof → completion)
- Warranty claim management (5-year structural warranty)
- Builder registration status check
- Integration: Project Passport, Site Execution, Closeout, Municipal, Verification

### P1.7: Survey & Geomatics Layer (Gap 3)
- Survey instruction and brief
- SG diagram tracking (lodgement → Surveyor-General approval)
- Beacon/boundary point register
- As-built survey comparison
- Note: Basic subdivision/survey workflow already exists in P0.3 town-planning module — this would extend it into a standalone survey management tool

---

## P2 Items — SEPARATE PRODUCT LANES (NOT YET STARTED)

### P2.8: Post-Occupancy & Facility Management Bridge (Gap 5)
- Digital building passport (lives on after project closes)
- Maintenance schedule generator
- Warranty register with expiry tracking
- Asset register
- Defects liability period management
- Planned preventive maintenance schedules
- Extends the existing Closeout module (Pack 11) into post-occupancy

### P2.9: Practice Management for Small/Medium Firms (Gap 9)
- Enquiry pipeline (lead → quote → appoint → active → complete)
- WIP tracking per project per discipline
- Timesheet → billing bridge
- Project profitability dashboard
- Capacity planning
- PI insurance/registration expiry per staff member
- Subscription revenue driver

### P2.10: Environmental & Heritage Impact (Gap 8)
- EIA/Basic Assessment trigger checklist (NEMA Listed Activities)
- Environmental Authorisation tracking
- Heritage impact assessment (NHRA Section 38) workflow
- Record of Decision conditions register
- EMPr compliance during construction

---

## What NOT to Build (Correctly Excluded)

| Domain | Reason |
|--------|--------|
| Estate Agency | Separate industry (PPRA regulated). Integration point only. |
| Full Legal Practice | Architex supports contract awareness, not legal practice management |
| Banking/Bond Origination | Track "finance approved" as passport milestone only |
| Full Accounting | Xero/Sage territory. Integration-friendly export only. |
| Body Corporate Management | Handover-to-BC workflow only, not running the BC |
| BIM Authoring | Architex reads/analyses BIM; doesn't author it |

---

## Architecture Context for New Features

### Module Mapping
All new features should map to one of the 8 modules:

| # | Module | Features Implemented |
|---|--------|---------------------|
| 1 | Project Passport | ✅ Pack 2 (lifecycle engine, risk, passport) |
| 2 | Brief + Appointment | ✅ Pack 5 (appointment, kickoff) |
| 3 | SpecForge | ✅ Spec complete, PR merged |
| 4 | Compliance + Municipal Readiness | ✅ Town Planning (P0.3), existing municipal matrix |
| 5 | Documents + Drawing Intelligence | ✅ Pack 3 |
| 6 | Tender / Procurement / Supplier | ✅ Tools exist (BoQ, RFQ, bid bench) |
| 7 | Site Execution | ✅ Pack 9, ✅ Contract Admin (P0.1) |
| 8 | Closeout + Payment + Audit | ✅ Pack 11, ✅ Pack 8 Finance |

### Integration Contracts (every new feature MUST)
1. Write back into Project Passport
2. Expose data to SpecForge where relevant
3. Write into the project audit trail
4. Surface actions to the Action Centre / Inbox
5. Respect role-based access scoping

### Feature Module Pattern
New features should use `src/features/{feature-name}/` with:
- `types.ts` — Domain types
- `schemas.ts` — Zod validation
- `services/` — Pure business logic (DI pattern, no UI deps)
- `adapters/` — Integration with platform modules
- `components/` — React UI
- `router.ts` — Express API endpoints
- `index.ts` — Barrel export
- `AGENTS.md` — DOX file
- `__tests__/` — Vitest unit + integration tests

### Tech Stack
- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 (no config file, @theme inline)
- shadcn/ui + lucide-react
- Express 5 API
- Firebase (Auth + Firestore non-default DB)
- Zod validation
- Vitest + fast-check (property-based testing)

---

## Git Workflow

### Open PRs
| PR | Branch | Feature |
|----|--------|---------|
| #131 | `feature/contract-administration` | Contract Admin (P0.1) + UserRole expansion (P0.2) |
| #132 | `feature/town-planning-workflow` | Town Planning (P0.3) |

### Branch Strategy
- Always push to feature branch, never directly to main
- Create PR with `gh pr create`
- Do not merge — leave for human review

---

## Recommended Next Steps

1. **Merge P0.1 and P0.3 PRs** (after review)
2. **Start P1.4 (Insurance Register)** — smallest P1 item, natural extension of verification
3. **Start P1.5 (Disputes & Claims)** — extends Contract Administration naturally
4. **Start P1.6 (NHBRC)** — important for residential market depth
5. **Consider P2.8 (Post-Occupancy/FM)** as a separate product lane scoping exercise

---

## Key Decisions Made

1. `land_surveyor` and `cpm` are now first-class roles (not string hacks)
2. Town Planning lives as a bounded feature module at `src/features/town-planning/`
3. Contract Administration lives at `src/services/contractAdmin/` + `src/lib/contract-admin-api-router.ts`
4. All services use dependency injection for Firestore (testable without emulator)
5. State machines are explicit constants with permitted transitions — invalid transitions throw typed errors
6. Working day calculations use SA Public Holidays Act 36 of 1994 (including Easter computation and Sunday substitution rule)
7. Advisory-only posture on all compliance/legal features — no autonomous legal opinions, no clause text reproduction
8. Sequential dependency enforcement: SPLUMA → SDP → Building Plan (with bypass for within-existing-rights)
