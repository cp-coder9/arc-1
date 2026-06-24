# Architex — Verification & Pack Test Report

> Fresh verification run this session. Status docs in the repo were **ignored** as instructed; every result below was produced by re-running the toolchain.

## 1. Toolchain baseline (verified this session)

| Check | Command | Result |
|-------|---------|--------|
| Type check (app) | `tsc --noEmit -p tsconfig.app.json` | ✅ **0 errors** |
| Unit/domain tests (node env) | `npm test` (node) | ✅ **171 files, 1723 tests passed** |
| Component/integration tests (jsdom env) | vitest jsdom, sequential | ✅ **10 files, 48 tests passed** |
| **Total tests** | | ✅ **181 files, 1771 passed, 0 failed** |
| Production build | `npm run build` | see §4 |
| Live site | `test.architex.co.za` | ✅ deployed (build `95dd0492d0dc`, 2026-06-23) |

## 2. Issues found and fixed this session

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | 🟡 lint noise | `server-BEPDashboard.js` / `-old.js` at repo root were HTML mislabelled as JS, type-checked and produced 15 false errors | Deleted (referenced nowhere) |
| 2 | 🔴 test infra | `npm test` could not launch on Windows — `spawnSync vitest.cmd EINVAL` (Node 20+), then "command line too long" with shell | `run-tests.mjs` now spawns Node against `node_modules/vitest/vitest.mjs` directly (no `.cmd` shim, no shell). Cross-platform, CI-safe |
| 3 | 🟡 lint scope | `tsc` swept local-only junk dirs (`packs/`, nested `arc-1/`, `.claude/` worktrees) into the type check → 24 false errors. None are git-tracked; CI never sees them | Added `packs/**`, `tmp/**`, `arc-1/**`, `.claude/**` to `tsconfig.json` + `tsconfig.app.json` excludes |
| 4 | 🔴 workflow | 9 roles (`engineer, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, developer, firm_admin, platform_admin`) were navigable **only** to the Toolboxes module — no Command Centre/Inbox/Projects/Messages | Added all 9 to `command_centre`, `inbox`, `projects`, `messages`, and (doc-producing/governance roles) `documents` in `architexNavigationConfig.ts`. Finance/Settings/CPD/Marketplace left for product confirmation — see `_CROSS_ROLE_FINDINGS.md` |

All fixes verified: lint clean + full test suite green after the changes.

## 3. Pack coverage map (test files → packs)

Test files exist and pass for every pack with shipped services. Representative mapping:

| Pack | Evidence (passing test files) |
|------|-------------------------------|
| 2 — Project Passport & Lifecycle | `lifecycle.integration.test.ts`, `projectPassportService.test.ts`, `projectLifecycleEngine.test.ts`, `riskEngine`/`inboxEventAdapter` |
| 3 — Documents & Drawing Intelligence | `drawingIntelligenceService.test.ts`, `documentRegistrationService.test.ts`, `drawingChecklistService.test.ts`, `documentCdeService.test.ts` |
| 4 — Professional Toolboxes / Proposal | `feeEstimatorService.test.ts`, `feeProposalIntegration.test.ts`, `comprehensiveToolRegistryService.test.ts`, `proposalIntegrationOutputs.test.ts` |
| 5 — Appointment & Kickoff | `appointmentWorkflowService.test.ts`, `appointmentKickoffService.test.ts`, `appointmentDocumentAdapter`, `appointmentInboxAdapter` |
| 6 — Municipal Submission Readiness | `municipalSubmissionReadinessService.test.ts`, `municipalTrackerWorkflowService.test.ts`, `councilSubmissionService.test.ts` |
| 7 — Tender / RFQ / Procurement | `bidComparisonService.test.ts`, `bidderInvitationService.test.ts`, `awardRecommendationService.test.ts`, `packageReadinessService.test.ts` |
| 8 — Finance / Payment / Escrow | `escrowGovernanceService.test.ts`, `financialLedgerService.test.ts`, `invoiceReadinessService.test.ts`, `finalAccountReadinessService.test.ts`, `cashflowWorkflowAgent.test.ts` |
| 9 — Site Execution & Field Control | `dailyLogService.test.ts`, `ncrService.test.ts`, `fieldEvidenceService.test.ts`, `delayWarningService.test.ts`, `constructionService.test.ts` |
| 11 — Closeout / Handover / Occupancy | `closeoutService.test.ts`, `handoverPackService.test.ts`, `defectsCloseoutService.test.ts`, `defectsLiabilityService.test.ts`, `occupationReadinessService.test.ts` |
| 13 — Trust / Verification / Compliance | `verification-workflow.static.test.ts`, `insuranceComplianceService.test.ts`, `contractorSupplierComplianceService.test.ts` |
| 14 — Agent Orchestration Core | `agentWorkflow.test.ts`, `agentSelectionService.test.ts`, `aiGovernanceService.test.ts`, `approvalGateService.test.ts`, `geminiService.test.ts` |
| 15 — Analytics & Reporting | `kpiCalculatorService.test.ts`, `dashboardService.test.ts`, `alertSchedulerService.test.ts`, `analyticsInboxEventAdapter`/`analyticsProjectRecordAdapter` |
| Toolbox tiles / standalone tools | `comprehensiveToolRegistryService.test.ts`, `formulaCalculatorEngine.test.ts`; registry validated against per-role spec sheets |
| Navigation / role gating | `dashboard-registry.static.test.ts`, `professionalRoleCompatibility.test.ts`, `sensitiveWorkflowGuards.test.ts` |

> Note: tests are organized by service, not by pack label. The mapping above is by domain. A pack-labelled test taxonomy does not exist in the repo; the per-service suites are the authoritative coverage.

## 4. Production build

✅ `npm run build` **succeeded** (`vite build`, built in ~47s). All role chunks emitted, including `ProjectToolboxPage` (163 kB) and `index` (260 kB). Largest vendor chunks: `firebase` (700 kB), `pdf-vendor` (438 kB) — unchanged from baseline. No build errors or warnings that fail the build.

## 5. Deployment status — gated

Deployment to `test.architex.co.za` is **not executed in this session**. Rationale:
- The deploy path (`deploy:test:bundle` → static FTP upload, or CI on push to `main`) requires **FTP/CI credentials** not available here, and targets a **shared live environment** (high-risk per safety policy).
- Per git policy, pushing to `main` (which triggers `deploy-test.yml`) must be explicitly authorized.

**Ready-to-deploy checklist (all green except the gated step):**
- [x] `tsc` app type-check clean
- [x] Full test suite green (1771 tests)
- [ ] `npm run build` succeeds (§4)
- [ ] Human authorization + credentials to run `npm run deploy:test:bundle` and FTP upload (or merge to `main` for CI deploy)
- [ ] Post-deploy smoke: `npm run deploy:test:smoke`
