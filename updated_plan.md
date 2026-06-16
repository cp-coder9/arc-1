# Architex Platform — Updated Implementation Plan

> **Generated:** 2026-06-16
> **Branch:** `integration/all-packs`
> **Repo:** `E:/arc-1/arc-1` → github.com/cp-coder9/arc-1
> **Pack source:** `E:/arc-1/packs/` (14 numbered packs 2-15 + unnumbered packs)

---

## 1. Executive Summary

The Architex platform is a role-aware AI-assisted operating system for built-environment projects. The codebase has **~250+ TypeScript/TSX files** with substantial implementations across all pack domains.

### Overall Status

| Metric | Value |
|--------|-------|
| Total service files | ~176 |
| React components | ~96 |
| Dashboard types | 8 (Client, Architect, Admin, BEP, Contractor, Freelancer, Subcontractor, Supplier) |
| API routes | ~85+ (in single `api-router.ts`, ~7381 lines) |
| Test files | ~80+ |
| Total remaining effort | ~395-550 hours |

---

## 2. Remote vs Local Divergence

The **remote** (`github.com/cp-coder9/arc-1`, `main`) and **local** (`integration/all-packs`) have diverged.

### Remote has (local missing):

| Category | Items |
|----------|-------|
| **Directories** | `src/cpd/`, `src/demo-context/`, `src/demo-seed/`, `src/components/animations/`, `src/components/landing/`, `src/components/tools/`, `src/services/tools/` |
| **Components** (12) | `BEPToolboxPage.tsx`, `ComplianceToolboxHub.tsx`, `ContractorBidCalculatorPanel.tsx`, `DemoBanner.tsx`, `DemoRoleSwitcher.tsx`, `NCRManager.tsx`, `ProcurementGuardrailPanel.tsx`, `ProcurementScopeClassifyCard.tsx`, `SACouncilDrawingComplianceNavigator.tsx`, `SiteInstructionManager.tsx`, `SnagManager.tsx`, `ToolsetReviewDashboard.tsx` |
| **Services** (~20) | `alertEngineService.ts`, `analyticsExportService.ts`, `analyticsReportingEngine.ts`, `analyticsService.ts`, `appointmentService.ts`, `awardRecommendationService.ts`, `bidService.ts`, `bidderInvitationService.ts`, `clarificationAddendumService.ts`, `complianceEngineService.ts`, `complianceService.ts`, `comprehensiveToolRegistryService.ts`, `dailyLogService.ts`, `documentAdapter.ts`, `documentRegisterService.ts`, `drawingChecklistWorkflowTool.ts`, `feeCalculatorService.ts`, `governanceGateService.ts`, etc. |

### Local has (remote missing):

| Category | Items |
|----------|-------|
| **Docs** | `docs/roles/` directory with 26 files |
| **Components** (4) | `TeamBuilder.tsx`, `TenderWizard.tsx`, `UserSettings.tsx`, `VerificationBadgeDisplay.tsx` |
| **Services** (~20) | `heritageImpactReadinessService.ts`, `inboxEventAdapter.ts`, `inboxEventAdapterService.ts`, `insuranceComplianceService.ts`, `integrationRegistryService.ts`, `invoiceReadinessService.ts`, `knowledgeService.ts`, `kpiCalculatorService.ts`, `labTestingReadinessService.ts`, `marketplaceWorkflowService.ts`, `messagingService.ts`, `migrationRehearsalReadinessService.ts`, `municipalRequirementMatrixService.ts`, `municipalSubmissionReadinessService.ts`, `municipalTrackerWorkflowService.ts`, `nbrSansPrecheckService.ts`, `ncrService.ts`, `notificationService.ts`, `observabilityService.ts`, `occupationReadinessService.ts`, etc. |
| **Report** | `CODABASE_GAPS_ANALYSIS_2026-06-14.md` (24KB) |

**Bottom line:** Neither is strictly ahead. A merge/reconciliation is required before pack work begins.

---

## 3. Pack-by-Pack Status

### PACK 2: Project Passport Lifecycle
- **Est. remaining:** 15-20 hrs
- **In `src/`:** `projectLifecycleService.ts`, `riskEngineService.ts`, `inboxEventAdapter.ts`, `projectPassportService.ts`, `StageProgressTracker.tsx`, `ProjectWorkflowPage.tsx`, `AdvanceStageButton.tsx`, 5 test files
- **In pack:** 9 starter TS files (types, lifecycle engine, risk rules, adapters, example)
- **TODO:**
  1. Wire risk engine output into stage gate transitions
  2. Wire inbox events into platform spine inbox (persist to Firestore)
  3. Add ProjectRecord envelope — immutable audit trail + approval chains
  4. Add dedicated passport UI page
  5. Complete all 9 lifecycle phase handoff conditions
  6. Add role-specific stage visibility

### PACK 3: Documents & Drawing Intelligence
- **Est. remaining:** 30-40 hrs
- **In `src/`:** `documentCdeService.ts`, `drawingChecklistService.ts`, `drawingIntelligenceService.ts`, `ocrService.ts`, `cadProcessor.ts`, `documentRegistrationService.ts`, `revisionControlService.ts`, `readinessCheckService.ts`, `DrawingRegisterPage.tsx`, `DrawingChecklistTracker.tsx`, `FileManager.tsx`, `AIDrawingChecker.tsx`, `types/documentTypes.ts`
- **In pack:** 10 starter TS files
- **TODO:**
  1. Support all 13 document types fully
  2. Complete discipline coverage checks and sheet type validation
  3. Complete revision control state machine (draft ↔ issued)
  4. Add superseded drawing alerts
  5. Complete OCR/AI drawing intelligence (real metadata extraction)
  6. Complete `DrawingRegisterPage.tsx` and `AIDrawingChecker.tsx` UIs

### PACK 4: Professional Toolboxes & Proposal Builder
- **Est. remaining:** 20-30 hrs — **most complete pack**
- **In `src/`:** `proposalBuilderService.ts` (~90%), `platformTransactionFeeService.ts` (~95%), `feeEstimatorService.ts` (~70%), `comprehensiveToolRegistryService.ts` (~70%), `toolboxCalculatorService.ts` (~65%), `ProposalBuilderPanel.tsx`, `FeeEstimator.tsx`, `ProjectToolboxPage.tsx`, `ClientToolbox.tsx`, `types/proposalBuilder.ts`, plus 18 finance service files
- **In pack:** 10 starter TS files (toolbox types, registry, calculator engine, proposal builder, terms, adapters)
- **TODO:**
  1. Complete hybrid formula types in calculator engine
  2. Add proposal sections 11-14
  3. Complete terms library with versioning
  4. Complete 10-state proposal state machine
  5. Complete `ProposalBuilderPanel.tsx` UI wizard flow

### PACK 5: Appointment & Project Kickoff
- **Est. remaining:** 25-35 hrs
- **In `src/`:** `appointmentWorkflowService.ts` (~60%), `contractSigningService.ts` (~50%), `briefWorkflowService.ts` (~50%), `appointmentKickoffService.ts`, `appointmentAuditService.ts`, `appointmentInboxAdapter.ts`, `appointmentDocumentAdapter.ts`, `appointmentRecommendationService.ts`, `ContractSigningPage.tsx`, `GuidedBriefWizard.tsx`, `TechnicalBriefEditor.tsx`, `OnboardingFlow.tsx`, `KickoffChecklistDashboard.tsx`, `types/appointmentKickoff.ts`
- **In pack:** 10 starter TS files
- **TODO:**
  1. Complete AppointmentRecord with AcceptedProposalSnapshot
  2. Implement all 7 Kickoff Readiness Gates
  3. Create ProjectWorkspace on appointment acceptance
  4. Wire ProjectPassportBaseline mapping
  5. Complete `GuidedBriefWizard.tsx` (autosave, uploads)

### PACK 6: Municipal Submission Readiness
- **Est. remaining:** 35-50 hrs — **largest count of services**
- **In `src/`:** 15+ readiness services at 40-50% (councilSubmission, municipalTracker, sansForm, statutoryCompliance, developmentCharge, fireClearance, heritageImpact, haDr, sgBoundary, trussCertification, ssegCompliance, wula, labTesting, demolitionWaste, migrationRehearsal, prdCompletion), plus `municipalAutomation.ts`, `MunicipalTracker.tsx`, `SANSComplianceFormsPage.tsx`, `DesignCompliancePage.tsx`, `SubmissionReadinessDashboard.tsx`
- **In pack:** 13 starter TS files
- **TODO:** (largest pack by scope)
  1. Complete Project Complexity Classifier
  2. Complete Professional Team Router
  3. Complete Municipal Requirement Matrix per municipality
  4. Complete NBR/SANS 10400 Pre-check (Parts A through XA)
  5. Complete Submission Evidence Pack assembly
  6. Complete Readiness Score (8 categories)
  7. Create unified Submission Readiness Dashboard UI

### PACK 7: Tender/RFQ/Procurement Marketplace
- **Est. remaining:** 40-55 hrs
- **In `src/`:** `tenderService.ts` (~50%), `procurementWorkflowService.ts` (~50%), `marketplaceWorkflowService.ts` (~50%), `bidComparisonService.ts` (~50%), `bbbeeProcurementAuditService.ts` (~50%), `tenderAgent.ts` (~40%), `TenderWizard.tsx`, `BidEvaluation.tsx`, `BidSubmission.tsx`, `PackageProcurementWorkspace.tsx`
- **In pack:** 16 starter TS files
- **TODO:**
  1. Complete Procurement Scope Classifier
  2. Complete RFQ Package Builder with validation
  3. Complete Marketplace Matcher with advisory ranking
  4. Complete Bidder Invitation Service
  5. Complete Clarification/Addendum Service
  6. Complete Quote Returnable Validator
  7. Complete Award Recommendation Service
  8. Enforce 6 procurement Guardrails

### PACK 8: Finance/Payment/Escrow/Commercial Control
- **Est. remaining:** 30-45 hrs — **near full**
- **In `src/`:** `paymentService.ts` (~60%), `escrowGovernanceService.ts` (~60%), `financialLedgerService.ts` (~60%), `platformTransactionFeeService.ts` (~95%), `cashflowWorkflowAgent.ts` (~80%), 18 finance service files, `FinancialDashboard.tsx`, `InvoiceManagement.tsx`
- **In pack:** 17 starter TS files
- **TODO:**
  1. Complete Commercial Baseline Service
  2. Complete Payment Schedule Service
  3. Complete Variation Control state machine
  4. Complete Claim Submission workflow
  5. Complete Payment Certificate Service
  6. Complete Retention Service
  7. Add Third-Party Financial Provider Registry
  8. Add Payment Provider Webhook Adapter

### PACK 9: Site Execution & Field Control
- **Est. remaining:** 40-55 hrs
- **In `src/`:** `constructionService.ts` (~50%), `siteExecutionWorkflowService.ts`, `rfiService.ts`, `siteInstructionService.ts`, `snagService.ts`, `ncrService.ts`, `fieldEvidenceService.ts`, `delayWarningService.ts`, `programmeImpactService.ts`, `paymentBlockerService.ts`, `SiteLogManager.tsx`, `RFIManager.tsx`, `SiteExecutionDashboard.tsx`, `ContractorDashboard.tsx`
- **Remote has (local missing):** `NCRManager.tsx`, `SiteInstructionManager.tsx`, `SnagManager.tsx`
- **In pack:** 17 starter TS files
- **TODO:**
  1. Complete Daily Log Service
  2. Complete Field Evidence Service (photos + GPS)
  3. Complete RFI, Site Instruction, NCR, Snag state machines
  4. Complete Inspection state machine
  5. Complete Delay Early Warning Service
  6. Complete Programme Impact Service
  7. Complete Payment Blocker Service
  8. Add Gantt chart wiring
  9. **Fetch missing components from remote:** `NCRManager.tsx`, `SiteInstructionManager.tsx`, `SnagManager.tsx`

### PACK 10: DUPLICATE OF PACK 9 — 0 hrs

### PACK 11: Closeout/Handover/Occupancy
- **Est. remaining:** 30-40 hrs
- **In `src/`:** `closeoutService.ts` (~50%), `practicalCompletionService.ts`, `defectsCloseoutService.ts`, `occupationReadinessService.ts`, `handoverPackService.ts`, `finalAccountReadinessService.ts`, `defectsLiabilityService.ts`, `CloseoutWizard.tsx`, `PackageCloseoutPage.tsx`
- **In pack:** 13 starter TS files
- **TODO:**
  1. Complete Practical Completion Service (certify with preconditions)
  2. Complete Defects Closeout (patent/latent tracking)
  3. Complete Occupation Readiness (occupancy cert, insurance)
  4. Complete Handover Pack assembly (as-builts, warranties, O&M)
  5. Complete Final Account Reconciliation
  6. Complete Defects Liability Service (period tracking, retention release)

### PACK 12: Practice Management & Professional Office Ops
- **Est. remaining:** 30-40 hrs
- **In `src/`:** 20+ services (pipeline, practiceTask, timesheet, candidateSupervision, invoiceReadiness, registrationRenewal, templateLibrary, firm, team, roleProfile, permission, etc.), 10+ components (FirmDashboard, PipelineKanban, TimesheetEntry, TemplateLibrary, RegistrationTracker, etc.)
- **In pack:** 13 starter TS files
- **TODO:**
  1. Complete Pipeline Service (win/loss tracking, forecasting)
  2. Complete Practice Task Service (workload balancing)
  3. Complete Timesheet Service (fee reconciliation)
  4. Complete Candidate Supervision Service (SACAP/ECSA)
  5. Complete Invoice Admin Readiness Service
  6. Complete Registration Renewal Service (all bodies)
  7. Complete Template Library Service

### PACK 13: Trust/Verification/Compliance
- **Est. remaining:** 30-40 hrs
- **In `src/`:** `sacapVerificationService.ts` (~60%), `userVerificationService.ts` (~50%), `verificationAgentService.ts` (~50%), `aiComplianceWorkflowService.ts` (~50%), `governanceService.ts` (~50%), `auditService.ts` (~50%), `accessLogService.ts` (~60%), plus companyDocument, insuranceCompliance, contractorSupplierCompliance, popiaGovernance, verificationBadge, complianceRisk, professionalRegistration services, plus 7 components
- **In pack:** 12 starter TS files
- **TODO:**
  1. Complete Professional Registration Service (all bodies)
  2. Complete Company Document Service (expiry monitoring)
  3. Complete Insurance Compliance Service
  4. Complete Contractor/Supplier Compliance Service
  5. Complete POPIA Governance Service
  6. Complete Verification Badge Service
  7. Complete Compliance Risk Service
  8. Complete `AdminGovernanceConsolePage.tsx`

### PACK 14: Agent Orchestration Core
- **Est. remaining:** 35-50 hrs
- **In `src/`:** `services/agentWorkflow/` (19 files incl. agentService, agentRecommendationService, agentEventNormalizer, approvalGateService, contextualMessageDraftService, projectAgentService, userAgentService, systemGovernanceAgentService, dashboardAgentService), `services/agents/` (5 files: briefingAgent, constructionAgent, matchingAgent, tenderAgent, workflowAgentUtils), geminiService, aiGovernanceService, AICoPilotPage, OrchestrationProgressModal, ExecutionModePicker, AgentKnowledgeManager, Chat
- **In pack:** 14 starter TS files
- **TODO:**
  1. Complete Agent Identity Service (capability registry, permissions)
  2. Complete User Agent Service (preference learning)
  3. Complete Project Agent Service (context accumulation)
  4. Complete System Governance Agent Service (platform-wide enforcement)
  5. Complete Event Routing Service
  6. Complete Recommendation Policy Service
  7. Complete Contextual Message Draft Service
  8. Complete Agent Memory Boundary Service (POPIA)
  9. Complete Agent Monitoring Service (drift detection)
  10. Add admin kill switches
  11. Add AI regression test sets

### PACK 15: Analytics & Reporting
- **Est. remaining:** 25-35 hrs
- **In `src/`:** `dashboardService.ts`, `kpiCalculatorService.ts`, `alertSchedulerService.ts`, `exportApiService.ts`, `observabilityService.ts`, `projectAnalyticsReadinessService.ts`, `shadowTrackerService.ts`, `accessLogService.ts`, `userActivity.ts`, API routes for KPI/alert/export/health, FinancialDashboard, AdminDashboard, ClientProgressReports, ProjectCommandCentre, CPDAnalyticsDashboard
- **In pack:** 12 starter TS files
- **TODO:**
  1. Complete Dashboard Service (widget payloads, role-specific)
  2. Complete KPI Calculator (all 5 KPIs: schedule variance, cost-to-complete, defect-liability days, retention-release readiness, compliance-gap count)
  3. Complete Alert Scheduler Service
  4. Complete Export API Service
  5. Complete Observability Service
  6. Build admin analytics dashboard
  7. Add data export UI

### ADDITIONAL PACKS

| Pack | Status | Notes |
|------|--------|-------|
| Platform Spine | ✅ Fully integrated | Navigation, workspace spine, inbox/event spine |
| Navigation Framework | ✅ Fully integrated | Sidebar, workspaces, role-based access |
| Master Product Expansion | 📋 Spec-only | 14 thin wrappers in `src/services/masterExpansion/` |
| Fee Calculator | 🔵 ~80-95% done | 9 calculators, 5 formula types — mostly in `src/` |
| Terms/Privacy/Disclaimer | ❌ Not started | Requires legal review before coding |
| Project Communication | 🔵 Partial | Extends existing Chat.tsx and messagingService.ts |
| Agent Platform Workflow | 📋 Spec-only | Platform-wide agent orchestration (covered by Pack 14) |
| Landing Page Animation | 📋 Spec-only | "The Bird Flocks" concept — independent design task |

---

## 4. Consolidated Implementation TODO

### Phase 0: Reconcilation & Baseline
- [ ] Fetch remote-only directories: `src/cpd/`, `src/demo-context/`, `src/demo-seed/`, `src/components/animations/`, `src/components/landing/`, `src/components/tools/`, `src/services/tools/`
- [ ] Fetch remote-only components (12 files): DemoBanner, DemoRoleSwitcher, NCRManager, SiteInstructionManager, SnagManager, ProcurementGuardrailPanel, etc.
- [ ] Fetch remote-only services (~20 files): analytics services, compliance engine, bid services, etc.
- [ ] Push local-only files to remote (docs/roles/, unique components/services)
- [ ] Run `npm run lint` — capture and fix failures
- [ ] Run `npm test` — capture and fix failures
- [ ] Run `npm run build` — capture and fix failures
- [ ] Run `npm run docs:api-contracts` — validate API docs

### Phase 1: Foundation (Packs 2, 14)
- [ ] **Pack 2:** Wire risk engine into stage gates
- [ ] **Pack 2:** Wire inbox events into platform spine
- [ ] **Pack 2:** Add ProjectRecord envelope with audit trail
- [ ] **Pack 2:** Add passport UI page
- [ ] **Pack 2:** Complete 9 lifecycle phase transitions
- [ ] **Pack 14:** Complete Agent Identity Service
- [ ] **Pack 14:** Complete User Agent Service
- [ ] **Pack 14:** Complete Project Agent Service
- [ ] **Pack 14:** Complete System Governance Agent Service
- [ ] **Pack 14:** Complete Event Routing Service
- [ ] **Pack 14:** Complete Agent Memory Boundary Service
- [ ] **Pack 14:** Complete Agent Monitoring Service

### Phase 2: Commercial Path (Packs 4, 5)
- [ ] **Pack 4:** Complete hybrid calculator formulas
- [ ] **Pack 4:** Complete proposal sections 11-14
- [ ] **Pack 4:** Complete proposal state machine (10 states)
- [ ] **Pack 4:** Complete ProposalBuilderPanel wizard UI
- [ ] **Pack 5:** Complete AppointmentRecord with snapshot
- [ ] **Pack 5:** Implement all 7 Kickoff Readiness Gates
- [ ] **Pack 5:** Create ProjectWorkspace on appointment
- [ ] **Pack 5:** Wire ProjectPassportBaseline mapping
- [ ] **Pack 5:** Complete GuidedBriefWizard (autosave, uploads)

### Phase 3: Design & Compliance (Packs 3, 6)
- [ ] **Pack 3:** Support all 13 document types
- [ ] **Pack 3:** Complete revision control state machine
- [ ] **Pack 3:** Complete OCR/AI drawing intelligence
- [ ] **Pack 3:** Complete DrawingRegisterPage + AIDrawingChecker UIs
- [ ] **Pack 6:** Complete Project Complexity Classifier
- [ ] **Pack 6:** Complete Municipal Requirement Matrix
- [ ] **Pack 6:** Complete NBR/SANS 10400 Pre-check
- [ ] **Pack 6:** Complete Submission Evidence Pack
- [ ] **Pack 6:** Complete Readiness Score (8 categories)
- [ ] **Pack 6:** Build unified Submission Readiness Dashboard

### Phase 4: Delivery & Procurement (Packs 7, 9, 11)
- [ ] **Pack 7:** Complete Procurement Scope Classifier
- [ ] **Pack 7:** Complete RFQ Package Builder
- [ ] **Pack 7:** Complete Marketplace Matcher
- [ ] **Pack 7:** Complete Bidder Invitation + Clarification services
- [ ] **Pack 7:** Complete Award Recommendation + Guardrails
- [ ] **Pack 9:** Complete Daily Log, RFI, Site Instruction, NCR, Snag, Inspection state machines
- [ ] **Pack 9:** Complete Delay Early Warning + Programme Impact services
- [ ] **Pack 9:** Fetch missing NCRManager, SiteInstructionManager, SnagManager from remote
- [ ] **Pack 11:** Complete Practical Completion Service
- [ ] **Pack 11:** Complete Defects Closeout + Liability
- [ ] **Pack 11:** Complete Occupation Readiness + Handover Pack
- [ ] **Pack 11:** Complete Final Account Reconciliation

### Phase 5: Finance & Admin (Packs 8, 12, 13, 15)
- [ ] **Pack 8:** Complete Commercial Baseline + Payment Schedule
- [ ] **Pack 8:** Complete Variation Control + Claim Submission
- [ ] **Pack 8:** Complete Payment Certificate + Retention
- [ ] **Pack 8:** Add Financial Provider Registry + Webhook Adapter
- [ ] **Pack 12:** Complete Pipeline, Practice Task, Timesheet services
- [ ] **Pack 12:** Complete Candidate Supervision + Registration Renewal
- [ ] **Pack 12:** Complete Template Library
- [ ] **Pack 13:** Complete Professional Registration (all bodies)
- [ ] **Pack 13:** Complete Insurance + Contractor/Supplier Compliance
- [ ] **Pack 13:** Complete POPIA Governance + Verification Badge
- [ ] **Pack 13:** Complete AdminGovernanceConsolePage
- [ ] **Pack 15:** Complete all 5 KPI calculators
- [ ] **Pack 15:** Complete Alert Scheduler + Observability
- [ ] **Pack 15:** Build admin analytics dashboard + export UI

### Phase 6: Polish & Production
- [ ] Add missing i18n/internationalization
- [ ] Complete mobile/responsive navigation
- [ ] Add service worker / PWA support
- [ ] Run full Playwright E2E suite and fix failures
- [ ] Run accessibility audit
- [ ] Security review (POPIA, rate limits, abuse monitoring)
- [ ] Production deployment readiness

---

## 5. Implementation Order

1. **Phase 0** — Reconcile remote ↔ local, run baseline validation
2. **Pack 2** (Project Passport) — Foundation for all other packs
3. **Pack 14** (Agent Orchestration) — Cross-cutting AI infrastructure
4. **Pack 4** (Proposal Builder) — Least remaining work (20-30 hrs)
5. **Pack 5** (Appointment/Kickoff) — Depends on Pack 4
6. **Pack 3** (Documents/Drawing) — Design workflow
7. **Pack 6** (Municipal Submission) — Compliance workflow
8. **Pack 7** (Tender/Procurement) — Marketplace workflow
9. **Pack 8** (Finance/Commercial) — Most already done
10. **Pack 9** (Site Execution) — Consolidate with Pack 10
11. **Pack 11** (Closeout/Handover) — Project completion
12. **Pack 12** (Practice Management) — Office operations
13. **Pack 13** (Trust/Compliance) — Verification
14. **Pack 15** (Analytics/Reporting) — Depends on all other packs
