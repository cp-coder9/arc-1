# Architex — Full-Scope Review

**Repo:** `cp-coder9/arc-1` · **Local:** `/home/gmt/arc`
**Branch:** `main` · **HEAD:** `90dda127` · **Origin/main:** `90dda127` (in sync)
**Date:** 2026-06-30

---

## 1. Build & Typecheck

| Gate | Result |
|---|---|
| `npm run lint` (tsc --noEmit -p tsconfig.app.json) | **CLEAN** (0 errors) |
| `npm run build` | **PASS** (~43s, dist/firebase 700 kB) |
| Local main vs origin/main | **MATCH** |
| Working tree | only `dist/index.html` modified (untracked build artifact) |

---

## 2. Remote Status

### Open PRs

| # | Title | Mergeable | State |
|---|---|---|---|
| 122 | feat(specforge): integrate SpecForge specification workspace | yes | UNSTABLE |
| 118 | Feature/bom builder tool | yes | CLEAN |
| 116 | feat(ui): liquid glass website redesign | yes | CLEAN |

#116 and #118 are ready to merge. #122 has CI in progress.

### Stale branches (unmerged to main, 15+)

```
All-branch-fixes, deploy-restore, feat/landing-go-live
feat/pack-2-14-passport-orchestration
feat/pack-2-professional-fee-proposal-builder
feat/pack-3-compliance-calculators
feat/pack-4-document-control-core
feat/pack-5-appointment-kickoff
feat/pack-5-contractor-commercial-tools
feat/pack-6-site-execution-tools
feat/pack-6-submission-readiness
feat/pack-7-supplier-tools
feat/pack-8-admin-governance-tools
feat/specforge-workspace-integration
feature/bom-builder-tool
```

Most look like superseded pack branches. Audit + delete recommended.

### Deploy state

| Surface | Commit | Timestamp |
|---|---|---|
| test.architex.co.za | `90dda127` | 2026-06-30T12:26:48Z |
| app.architex.co.za | no build meta tags emitted | — |
| origin/main | `90dda127` | — |

**test.architex.co.za matches main.** `app.architex.co.za` index.html missing `architex-build-commit` meta — either older deploy or different bundle. Worth checking Vercel project link.

### Recent main commits (last 5)

```
90dda127 fix(admin): paginate User Management table
51f173b5 fix(auth): fall back to client-side profile on any API gateway error (#123)
69ce161a Feature/xa compliance tool (#117)
56343ef1 hotfix(typecheck): unblock CI (#120)
8448e1c3 feat(site-tools): Forma Build field-issue tools (Pack 9 ext) (#119)
```

---

## 3. Bugs & Errors

### TODO/FIXME (4 hits — low)

```
src/lib/api-router.ts:4              // TODO: Install csurf — CSRF protection disabled
src/services/geminiService.ts:478    // TODO: parallel specialist agents (PRD §18.1)
src/services/specforge/firestoreSpecForgeRepository.ts:25, 43  TODO: implement
```

**Real gap:** `FirestoreSpecForgeRepository` is a TODO stub. SpecForge production persistence is unimplemented — falls back to in-memory only.

### Type-safety escape hatches: **1037 hits** (`any`, `as any`, `@ts-ignore`)

Volume too high — codebase is heavily typed-loose. No breakdown done, but 1k+ on ~190 service files is a debt signal.

### Security — VITE_ env vars on server side (10 hits)

VITE_ prefix is Vite's client-side namespace. Server reading VITE_ leaks the same vars to the browser bundle.

```
src/lib/blob.ts:12             VITE_FIREBASE_PROJECT_ID fallback in initializeApp
src/lib/firebase-admin.ts:8-9  VITE_FIREBASE_PROJECT_ID + VITE_FIREBASE_DATABASE_ID
src/lib/api-router.ts:73,4340  VITE_BLOB_READ_WRITE_TOKEN  <- write token in client namespace
scripts/inspect-real-world-jobs.ts:15-16  VITE_FIREBASE_PROJECT_ID, VITE_FIREBASE_DATABASE_ID
```

**VITE_BLOB_READ_WRITE_TOKEN on server is the same anti-pattern as the B1 PayFast leak fixed earlier.** Vercel Blob write tokens should never share namespace with `VITE_` (i.e. browser-bundled) vars. Recommend rename to `BLOB_READ_WRITE_TOKEN` only and drop the VITE_ fallback.

### Refactor candidates (>1000 lines)

| Lines | File |
|---:|---|
| 8355 | `src/lib/api-router.ts` |
| 2143 | `src/components/tools/StandaloneToolRunner.tsx` |
| 2009 | `src/App.tsx` |
| 1909 | `src/types.ts` |
| 1786 | `src/components/AdminDashboard.tsx` |
| 1262 | `src/components/ProposalBuilderPanel.tsx` |
| 1193 | `src/components/ArchitectDashboard.tsx` |
| 1043 | `src/services/pdfGenerationService.ts` |
| 1038 | `src/components/PhotoAnnotator.tsx` |

`api-router.ts` 8355 lines is the worst offender — single file owns 159 routes. Split by domain (auth, projects, finance, files, compliance) recommended.

---

## 4. Placeholders & Unfinished

### Total placeholder/keyword hits: **555** (in non-test src)

Sample of substantive ones (excluding HTML `placeholder=` attrs):

| Severity | Location | Note |
|---|---|---|
| HIGH | `paymentProviderWebhookAdapter.ts:7,52` | Signature verification is a **placeholder**, needs real provider keys |
| HIGH | `xaCompliance/xaDrawingIntelligence.ts:156` | `return 87; // Placeholder — real impl averages AI fields` (hardcoded score) |
| MED | `submissionEvidencePackService.ts` | `'placeholder'` status threaded through evidence pack model |
| MED | `appointmentDocumentAdapter.ts` | Creates `status: 'placeholder'` documents — intentional but downstream readers must handle |
| LOW | `finance/sampleData.ts` | "Registered Escrow Provider Placeholder" demo seed (not exposed in prod) |
| LOW | `professionalFee/demo.ts:23` | `SACAP-PLACEHOLDER` registration number in demo |
| LOW | `geminiService.ts:478` | Future PRD §18.1 parallel-agent enhancement |
| INFO | `submissionEvidencePackService.ts:123-128` | Counts items where `status === 'placeholder'` — feature, not bug |
| INFO | `agentWorkflow/contextualMessageDraftService.ts:114-116` | `{{placeholder}}` template substitution — feature |

**Action items:**
1. `xaDrawingIntelligence.ts:156` `return 87` hardcoded score — production XA compliance returns fake confidence
2. `paymentProviderWebhookAdapter.ts` signature verification stub — payment webhooks not cryptographically verified

### Stub returns / unimplemented functions

```
src/services/specforge/firestoreSpecForgeRepository.ts  (entire file is TODO)
```

### Demo isolation gap — raw Firestore calls bypassing wrapper: **45**

Top offenders:
```
src/services/agentWorkflow/agentService.ts                   8 calls
src/services/agentWorkflow/agentRecommendationService.ts     6 calls
src/components/cpd/AdminCPDManager.tsx                       8 calls
src/components/cpd/CPDAssessmentRunner.tsx                   4 calls
src/components/cpd/CPDHub.tsx                                3 calls
src/components/cpd/CPDAnalyticsDashboard.tsx                 3 calls
src/components/cpd/CPDCertificateViewer.tsx                  2 calls
src/services/toolbox/tables/guidelineTableStore.ts           2 calls
```

**CPD module + agentWorkflow are not demo-isolated** — in demo mode they write to live Firestore. Match the established conversion pattern from architex-development skill.

---

## 5. API & Dashboards

### API surface

| Router | Route calls |
|---|---:|
| `src/lib/api-router.ts` | 159 |
| `src/lib/finance-api-router.ts` | 28 |
| **Total** | **187** |

### Dashboards inventory (16 dashboards)

| Lines | Component |
|---:|---|
| 1786 | `AdminDashboard.tsx` |
| 1193 | `ArchitectDashboard.tsx` |
| 924 | `SubmissionReadinessDashboard.tsx` |
| 755 | `ClientDashboard.tsx` |
| 460 | `BEPDashboard.tsx` |
| 450 | `SiteExecutionDashboard.tsx` |
| 381 | `KickoffChecklistDashboard.tsx` |
| 373 | `IssueDashboard.tsx` |
| 255 | `cpd/CPDAnalyticsDashboard.tsx` |
| 246 | `FreelancerDashboard.tsx` |
| 236 | `FinancialDashboard.tsx` |
| 203 | `FirmDashboard.tsx` |
| 188 | `ContractorDashboard.tsx` |
| 150 | `SupplierDashboard.tsx` |
| 143 | `toolsets/ToolsetReviewDashboard.tsx` |
| 127 | `SubcontractorDashboard.tsx` |

`AdminDashboard.tsx` at 1786L is a refactor candidate. `ArchitectDashboard.tsx` close behind.

### Toolbox definitions

**80** tool definition files under `*toolbox/definitions*` — matches the "Comprehensive Professional Toolboxes" pack landed in #114.

---

## 6. Tests & E2E

### Unit tests

- Test files: **367**
- Service modules: **417** top-level `.ts` (excluding tests)
- Service test files: **261**
- Coverage gap: ~156 service files without a matching test (~37%)

### E2E (Playwright)

`playwright.config.ts` present. 7 spec files under `e2e/`:
```
admin-review.spec.ts
architect-dashboard.spec.ts
auth.spec.ts
onboarding.spec.ts
pack-10-site-execution.spec.ts
quickscan-browser-harness.spec.ts
sidebar-harness.spec.ts
```

E2E framework wired but **only 7 specs against 16 dashboards** — coverage thin (architect, admin, auth, onboarding covered; client, BEP, contractor, supplier, freelancer, financial, firm, kickoff, issue, submission-readiness, site-execution have no e2e).

### Test scripts (package.json)

```
test                  = node scripts/run-tests.mjs
test:firestore:rules  = node scripts/run-firestore-rules-tests.mjs
test:watch            = vitest
test:coverage         = vitest run --coverage
test:ui               = vitest --ui
test:e2e              = playwright test
test:e2e:ui           = playwright test --ui
smoke:api             = node scripts/cpanel-api-smoke.mjs
smoke:deploy          = node scripts/deploy-smoke.mjs
deploy:demo:smoke     = SMOKE_BASE_URL=https://demo.architex.co.za node scripts/deploy-smoke.mjs
deploy:test:smoke     = SMOKE against test.architex.co.za incl. API
```

### Skipped tests

**0** (`it.skip/describe.skip/xit/xdescribe` clean).

---

## 7. Summary — Priority Action Items

### P0 — Security
1. `VITE_BLOB_READ_WRITE_TOKEN` on server (`api-router.ts:73,4340`, `blob.ts:12`) — same anti-pattern as B1 PayFast fix
2. `paymentProviderWebhookAdapter.ts` signature verification is a placeholder — webhooks not cryptographically verified
3. CSRF protection commented-out (`api-router.ts:4`) — `csurf` package not installed

### P1 — Demo isolation
4. CPD module (5 files) + agentWorkflow (2 files) bypass demo wrapper — 45 raw `doc(db,)`/`collection(db,)` calls write to live Firestore in demo mode

### P1 — Functional gaps
5. `FirestoreSpecForgeRepository` is a TODO — SpecForge has no production persistence
6. `xaDrawingIntelligence.ts:156` hardcoded `return 87` — XA AI confidence is fake

### P2 — Tech debt
7. `api-router.ts` 8355 lines / 159 routes — split by domain
8. 1037 type-safety escape hatches — needs gradual `any` removal
9. ~156 service modules without unit tests
10. 9 dashboards without E2E specs
11. 15 stale unmerged pack branches — audit and delete
12. `app.architex.co.za` missing build meta tags — deploy linkage broken or older bundle

### P2 — PR queue
- Merge **#118** (BoM builder — CLEAN)
- Merge **#116** (liquid glass redesign — CLEAN)
- Watch **#122** (SpecForge — CI running)
