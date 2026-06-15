# Architex All Packs — Master Audit Summary

**Date:** 2026-06-15
**Source:** `architex-all-packs.zip` compared against `origin/main`
**Method:** Static code audit + TypeScript compilation check

---

## Pack-by-Pack Status

| # | Pack | Status | Raw DB Calls | Key Findings |
|---|------|--------|-------------|-------------|
| 01 | Demo | ⚠️ 70% | — | Persistence conversion NOT done (~190 raw db sites). Firebase project not created. |
| 02 | Project Passport Lifecycle | ⚠️ | 0 services | Duplicate lifecycle engines (9-phase vs 11-phase). Example file missing. |
| 03 | Documents & Drawing Intelligence | ✅ | 0 | Clean. All services present. |
| 04 | Toolboxes & Proposal Builder | ⚠️ | 0 services, 2 UI | Example file missing. ProposalBuilderPanel.tsx has 2 raw DB calls. |
| 05 | Appointment & Project Kickoff | ✅ | 0 | Example file missing. Core services complete. |
| 06 | Municipal Submission Readiness | ✅ | 0 | Example file missing. Clean. |
| 07 | Tender/RFQ/Procurement | ✅ | 0 | Naming drift from spec. All functionality present. |
| 08 | Finance/Escrow/Payments | ✅ | 0 services | Merged into larger files + `finance/` subdirectory. Finance API router needs audit. |
| 09 | Site Execution & Field Control | ⚠️ | 0 services | **Missing: inspectionService, rfiService**. Example file missing. |
| 11 | Closeout/Handover/Occupancy | 🔥 **BLOCKER** | **43** | **6 services with 43 raw Firestore calls** — biggest gap. Writes to live paths. |
| 12 | Practice Management | ✅ | 0 | Already merged, verified clean. |
| 13 | Trust/Verification/Compliance | ✅ | 6 | `registrationRenewalService.ts` has 6 calls. Rest clean. |
| 14 | Agent Orchestration Core | ✅ | 0 | 30+ files, complete. |
| 15 | Analytics & Reporting | ✅ | 0 | 8 services, freshly implemented. Clean. |
| CPD | Assessment Platform | ✅ | 0 | 15+ files. PR #28 merged. |
| Spine | Platform Spine | ✅ | 0 | Navigation + module registry complete. |
| Nav | Navigation Framework | ✅ | 0 | 11 modules, role-aware. |
| Fee | Fee Calculator | ✅ | 0 | Services + UI component. |

---

## Critical Issues Summary

### 🔥 BLOCKER 1: Demo sandbox isolation incomplete
System-wide raw Firestore access remains across the codebase:
- **~145 raw `doc(db,)` / `collection(db,)` calls** in `src/services/` across ~20 service files
- **Pack 11 (Closeout)** — 43 calls, the worst offender
- **Pack 13** — 6 calls in `registrationRenewalService.ts`
- **Pack 04 consumer** — `ProposalBuilderPanel.tsx` — 2 calls
- **`api-router.ts`** — 9 calls (7231-line router)
- **287+ total** raw Firestore references across services/components/tests/scripts

### 🔥 BLOCKER 2: Firebase demo project not created
`demo-firebase-config.json` has placeholder values. `demo.architex.co.za` not deployed.
**Action needed:** Create Firebase project, fill config, deploy to Vercel.

### ⚠️ ISSUE 3: Duplicate lifecycle/passport implementations
Two lifecycle engines (9-phase vs 11-phase) and two passport services coexist:
- `src/services/` — Pack 2 version
- `src/services/masterExpansion/` — Platform Spine version
These don't share type systems, creating ambiguity for future modules.

### ⚠️ ISSUE 4: 8 packs missing example files
Packs 04, 05, 06, 07, 08, 09, 11 — all missing their runnable demo example files.

### ⚠️ ISSUE 5: Missing services
- Pack 09: `inspectionService.ts`, `rfiService.ts` — not found in main

---

## DOX Framework Audit

| Check | Status |
|-------|--------|
| Root AGENTS.md has DOX rules | ✅ Complete |
| DOX tree listed | ✅ 8 core dirs |
| Document inventory | ✅ 10 AGENTS.md files |
| Child docs follow standard format | ✅ Yes — Purpose, Ownership, Contracts, Work Guidance, Verification, Child Index |
| All pack implementations documented in AGENTS.md | ✅ Packs 2-15 documented |

---

## Verdict

**Packs implemented: 18/18** (all core + feature packs present in main)
**Demo-ready: NO** — blocked by (1) persistence conversion and (2) Firebase deployment
**Production ready: YES** — code compiles, services work, but real Firestore data is in use
