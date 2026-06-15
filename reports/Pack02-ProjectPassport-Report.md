# Pack 02 — Project Passport Lifecycle — Report

**Date:** 2026-06-15
**Reviewer:** Hermes Agent
**Pack Spec:** `architex-all-packs.zip/01-numbered-core-packs/02-architex-project-passport-lifecycle-pack.zip`
**Target Branch:** `origin/main`

---

## Spec Summary

Central project state layer. 9-phase lifecycle (onboarding → closeout), ProjectRecord generic envelope, risk engine, inbox events, agent recommendations.

**Spec files:**
- `lifecycleTypes.ts` — ProjectRecord envelope, types
- `lifecycleDefinitions.ts` — 9-phase definitions
- `lifecycleEngine.ts` — Phase readiness evaluation
- `projectPassportService.ts` — Builds Project Passport
- `riskEngine.ts` — Workflow risk detection
- `inboxEventAdapter.ts` — Platform Spine-compatible events
- `agentRecommendationService.ts` — Next-best-action output
- `sampleData.ts` — Sample data
- `projectPassportLifecycleExample.ts` — Runnable demo (NOT in main)

---

## File Verification

| File | In Main | Lines | Raw DB Calls | Notes |
|------|---------|-------|-------------|-------|
| `lifecycleTypes.ts` | ✅ | 191 | 0 ✅ | Has ProjectRecord envelope |
| `lifecycleDefinitions.ts` | ✅ | 81 | 0 ✅ | 9 phases match spec |
| `lifecycleEngine.ts` | ✅ | 88 | 0 ✅ | Pure logic |
| `projectPassportService.ts` | ✅ | 78 | 0 ✅ | Pure logic |
| `riskEngine.ts` | ✅ | 120 | 0 ✅ | Pure logic |
| `inboxEventAdapter.ts` | ✅ | 95 | 0 ✅ | Stubs only |
| `agentRecommendationService.ts` | ✅ | 125 | 0 ✅ | Pure logic |
| `sampleData.ts` | ✅ | 61 | 0 ✅ | Static data only |
| `projectPassportLifecycleExample.ts` | ❌ **MISSING** | — | — | Runnable demo example not in main |

---

## Demo-Scope Audit (Greg's specific checks)

| Check | Status | Evidence |
|-------|--------|----------|
| Project passport records demo-scoped? | ✅ N/A | Passport service is pure logic — no Firestore writes. Receives data as parameters, returns computed objects. |
| Lifecycle state writes hit live records? | ✅ No writes | `evaluateLifecycle()` is read-only — accepts `ProjectRecord[]` as input, returns `LifecycleEvaluation`. |
| Notifications/inbox write-backs demo-aware? | ⚠️ **Stubs only** | `inboxEventAdapter.ts` has `subscribeToInboxEvents()` and `createInboxEvent()` as stubs that return empty/no-ops. Inbox events are NOT persisting to Firestore at all. |
| Audit/history entries demo-scoped? | ✅ N/A | `lifecycleTypes.ts` defines `audit` field on ProjectRecord but no service persists it. |
| Hidden Firestore calls inside helpers? | ✅ 0 calls | All 8 services = 0 raw Firestore calls. Pure business logic. |

---

## Issues Found

### 1. ⚠️ Duplicate lifecycle implementations
There are **two separate lifecycle implementations** in main:

| Location | Phases | Types Source |
|----------|--------|-------------|
| `src/services/` (Pack 2) | 9-phase | `lifecycleTypes.ts` |
| `src/services/masterExpansion/` (Platform Spine) | 11-phase | `architexMasterTypes.ts` |

The masterExpansion version has 2 extra phases (`lead_enquiry`, `practical_completion`). This creates ambiguity — which lifecycle engine should modules use? The spec says "future modules should plug into this, not work around it" but the masterExpansion version doesn't use Pack 2's types.

**Fix needed:** Consolidate. Either merge the extra phases into Pack 2's lifecycleDefinitions or alias Pack 2's engine from the masterExpansion layer.

### 2. ❌ projectPassportLifecycleExample.ts not in main
The pack includes a runnable demo example. This file is absent from main.

### 3. ⚠️ Two passport services
Similarly duplicate:
- `src/services/projectPassportService.ts` (Pack 2, 78 lines)
- `src/services/masterExpansion/projectPassportService.ts` (Platform Spine, ~50 lines)

Different type systems, different aims. Needs consolidation.

### 4. ✅ Firestore isolation
All 8 Pack 2 services are pure logic with 0 raw Firestore calls. However, the **consumers** that call these services may do Firestore writes. The only UI consumer found is `ProposalBuilderPanel.tsx` which has 2 raw Firestore calls — needs demo-scope conversion.

### 5. ✅ TypeScript compilation
Zero errors from Pack 2 services. Only pre-existing errors in `documentsDrawingExample.ts`.

---

## TypeScript & Build

```
npx tsc --noEmit: PASS (0 pack errors)
npm run build: Not verified (Firebase creds needed for production build)
```

---

## Summary

| Category | Status |
|----------|--------|
| Files present | ✅ 8/9 (example file missing) |
| Business logic correct | ✅ Phase models match spec |
| Raw Firestore calls in pack | ✅ 0 — all pure logic |
| Demo sandbox isolation | ✅ N/A (no Firestore writes) |
| Consumer Firestore calls | 🔥 ProposalBuilderPanel.tsx has 2 raw calls |
| Duplicate implementations | ⚠️ Two lifecycle engines, two passport services |
| Runnable demo | ❌ Not in main |
| Browser testing | ⏭️ Skipped (page timeout) — static audit + tsc done |

---

*Corrected from Greg's QC: "145 raw db calls across 20 service files" — applies to the codebase as a whole, not Pack 2 specifically. Pack 2 services themselves have 0 raw calls.*
