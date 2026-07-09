# Implementation Plan: P1 Platform Extensions

## Overview

Implements four specialised workflow modules (Insurance Register, Dispute Resolution, NHBRC Enrolment, Survey & Geomatics) plus shared cross-cutting infrastructure following the established feature module pattern at `src/features/{module-name}/`. Each module includes types, Zod schemas, services, platform adapters, UI components, and tests. The implementation builds incrementally from shared infrastructure through each domain module, wiring everything together at the end.

## Tasks

- [x] 1. Set up P1 Shared infrastructure module
  - [x] 1.1 Create `src/features/p1-shared/` directory structure with types, services, and test directories
    - Create `index.ts`, `types.ts` with RetryConfig, IntegrationWriteResult, DisclaimerConfig, WorkingDayConfig, SAPublicHoliday types
    - _Requirements: 6.1, 23.6_

  - [x] 1.2 Implement Working Day Calculator service
    - Create `src/features/p1-shared/services/workingDayCalculator.ts`
    - Implement SA public holidays (Public Holidays Act 36 of 1994) including observed-Monday logic
    - Implement countWorkingDays, addWorkingDays, subtractWorkingDays, isWorkingDay, getPublicHolidays
    - _Requirements: 6.1, 6.2, 6.4, 9.3, 17.6_

  - [x] 1.3 Write property test for Working Day Calculator
    - **Property 1: Working Day Calculator Correctness**
    - **Validates: Requirements 6.1, 6.2, 6.4, 9.3, 17.6**

  - [x] 1.4 Implement Retry Queue service
    - Create `src/features/p1-shared/services/retryQueue.ts`
    - Implement exponential backoff (3 retries, base 1000ms, max 60000ms, multiplier 2)
    - Implement enqueue, processQueue, getFailedOperations
    - Create failed-sync alert on exhaustion
    - _Requirements: 4.8, 10.8, 23.6_

  - [x] 1.5 Write property test for Retry Queue exponential backoff
    - **Property 23: Retry Queue Exponential Backoff**
    - **Validates: Requirements 4.8, 10.8, 23.6**

  - [x] 1.6 Implement Platform Integration adapters
    - Create `src/features/p1-shared/services/platformIntegration.ts`
    - Implement shared write helpers for Project Passport, Audit Trail, Action Centre, Risk Engine, Documents
    - Each adapter uses retry queue on failure
    - _Requirements: 23.1, 23.2, 23.3, 23.4, 23.6, 23.7_

  - [x] 1.7 Implement RBAC Access Control service
    - Create `src/features/p1-shared/services/accessControl.ts`
    - Define permission matrices for all 4 modules (INSURANCE_REGISTER, DISPUTE_RESOLUTION, NHBRC, SURVEY_GEOMATICS)
    - Implement checkAccess, getPermittedActions, isAdminRole with union-of-roles logic
    - _Requirements: 21.1–21.14_

  - [x] 1.8 Write property test for RBAC Permission Matrix
    - **Property 22: RBAC Permission Matrix Enforcement**
    - **Validates: Requirements 21.1–21.14**

  - [x] 1.9 Implement Disclaimer Banner component
    - Create `src/features/p1-shared/components/DisclaimerBanner.tsx`
    - Non-dismissible, persistent, configurable per module (advisory, legal, compliance)
    - Create `src/features/p1-shared/components/StatusBadge.tsx` for workflow status display
    - _Requirements: 22.1–22.5, 22.9_

- [x] 2. Checkpoint — Shared infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Insurance Register module — types, schemas, and core service
  - [x] 3.1 Create Insurance Register directory structure and types
    - Create `src/features/insurance-register/` with index.ts, types.ts, schemas.ts
    - Define InsurancePolicy, ClaimsNotification, ClaimsSummary, InsuranceComplianceSummary types
    - Define InsurancePolicyType, PolicyStatus, ClaimNotificationStatus, ClaimCategory enums
    - _Requirements: 1.1, 1.2, 3.1, 3.8_

  - [x] 3.2 Implement Zod validation schemas for Insurance Register
    - Create `src/features/insurance-register/schemas.ts`
    - Implement insurancePolicySchema with SA phone regex, email, date ordering, broker contact refinement
    - Implement claimsNotificationSchema with discovery date >= incident date, evidence refs max 20
    - _Requirements: 1.1, 1.8, 3.1, 3.9_

  - [x] 3.3 Implement Insurance Register Service
    - Create `src/features/insurance-register/services/insuranceRegisterService.ts`
    - Implement registerPolicy, updatePolicy, cancelPolicy, getProjectPolicies, getPolicyById
    - Implement getExpiringPolicies, processExpiryNotifications (60/30/14 day thresholds)
    - Enforce role-based access (architect, bep, cpm, quantity_surveyor, platform_admin)
    - _Requirements: 1.1–1.10_

  - [x] 3.4 Implement Policy Checker Service
    - Create `src/features/insurance-register/services/policyCheckerService.ts`
    - Implement getRequiredTypes based on contract form (JBCC, NEC, GCC, FIDIC)
    - Implement checkCompliance comparing registered policies against requirements
    - Determine compliant/non_compliant/expiring_soon per type and overall status
    - _Requirements: 2.1–2.11_

  - [x] 3.5 Implement Claims Notification Service
    - Create `src/features/insurance-register/services/claimsNotificationService.ts`
    - Implement registerClaim with deadline calculation (earlier of 30 days or custom period)
    - Implement state machine transitions (reported → notified_to_insurer → under_investigation → claim_lodged → settled|rejected, withdrawn from any non-terminal)
    - Implement getClaimsSummary aggregation, getOverdueNotifications
    - _Requirements: 3.1–3.9_

  - [x] 3.6 Write property tests for Insurance Register
    - **Property 2: Policy Expiry Notification Thresholds**
    - **Property 3: Insurance Compliance Determination**
    - **Property 4: Claims Notification State Machine**
    - **Property 5: Claims Notification Deadline Calculation**
    - **Property 6: Claims Summary Aggregation**
    - **Validates: Requirements 1.3–1.5, 2.1–2.4, 3.2, 3.3–3.5, 3.8**

  - [x] 3.7 Implement Insurance Register adapters
    - Create `src/features/insurance-register/adapters/passportAdapter.ts` — compliance summary writes
    - Create `src/features/insurance-register/adapters/actionCentreAdapter.ts` — renewal/claims notifications
    - Create `src/features/insurance-register/adapters/riskEngineAdapter.ts` — lapsed policy risk events
    - Create `src/features/insurance-register/adapters/documentsAdapter.ts` — policy document registration
    - All adapters use shared retry queue pattern
    - _Requirements: 4.1–4.8_

  - [x] 3.8 Implement Insurance Register access control
    - Create `src/features/insurance-register/services/accessControl.ts`
    - Wire module-specific permission checks using p1-shared RBAC service
    - _Requirements: 1.9, 21.1, 21.2_

  - [x] 3.9 Write unit tests for Insurance Register services
    - Test policy registration with valid/invalid data
    - Test expiry notification generation at each threshold
    - Test compliance checker for each contract form
    - Test claims state machine transitions (valid and invalid)
    - Test adapter payload shapes
    - _Requirements: 1.1–1.10, 2.1–2.11, 3.1–3.9, 4.1–4.8_

- [x] 4. Checkpoint — Insurance Register complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Dispute Resolution module — types, schemas, and core services
  - [x] 5.1 Create Dispute Resolution directory structure and types
    - Create `src/features/dispute-resolution/` with index.ts, types.ts, schemas.ts
    - Define FormalClaim, EvidenceLink, NoticeDeadline, QuantumAssessment, QuantumLineItem, DelayAnalysis, DelayEvent, Adjudication types
    - Define ClaimType, ClaimStage, ResponseSubState, EvidenceRelevance, CostCategory, DelayType, AdjudicationStage enums
    - _Requirements: 5.1, 7.1, 8.1, 9.1, 9.3_

  - [x] 5.2 Implement Zod validation schemas for Dispute Resolution
    - Create `src/features/dispute-resolution/schemas.ts`
    - Implement formalClaimSchema with type-specific required fields (amountClaimed for monetary, timeClaimed for EoT/prolongation)
    - Implement evidenceLinkSchema, quantumLineItemSchema, delayEventSchema, adjudicationSchema
    - _Requirements: 5.5, 5.7, 7.2, 8.1, 9.1, 9.3_

  - [x] 5.3 Implement Dispute Engine Service
    - Create `src/features/dispute-resolution/services/disputeEngineService.ts`
    - Implement registerClaim with auto-generated reference number (type prefix + sequence)
    - Implement state machine transitions with permitted-transitions logic
    - Implement getPermittedTransitions, getClaimsDashboard, createFromContractAdmin
    - Enforce response sub-state requirement at "responded" stage
    - _Requirements: 5.1–5.7, 10.1–10.5_

  - [x] 5.4 Implement Notice Timeline Service
    - Create `src/features/dispute-resolution/services/noticeTimelineService.ts`
    - Implement calculateDeadlines per contract form (JBCC 20WD, NEC 8wk, GCC 28d, FIDIC 28d)
    - Implement particulars deadline, response deadline, adjudication referral deadline
    - Implement getApproachingDeadlines (14/7/3 day warnings), getOverdueDeadlines
    - Use Working Day Calculator for JBCC calculations
    - _Requirements: 6.1–6.9_

  - [x] 5.5 Implement Evidence Linkage Service
    - Create `src/features/dispute-resolution/services/evidenceLinkageService.ts`
    - Implement linkEvidence, unlinkEvidence (max 100 items per claim, min 1 after adjudication)
    - Implement read-only cross-references to source modules
    - Implement generateEvidenceSchedule (sorted by date ascending)
    - Handle source unavailable detection
    - _Requirements: 7.1–7.9_

  - [x] 5.6 Implement Quantum Analyser Service
    - Create `src/features/dispute-resolution/services/quantumAnalyserService.ts`
    - Implement createAssessment, addLineItem (max 500), removeLineItem
    - Auto-calculate amount = round(quantity × rate, 2), subtotals, percentages
    - Implement createDelayAnalysis, addDelayEvent (max 200), removeDelayEvent
    - Auto-calculate working days impacted using Working Day Calculator
    - Implement net claimable delay calculation
    - _Requirements: 9.1–9.9_

  - [x] 5.7 Implement Adjudication Service
    - Create `src/features/dispute-resolution/services/adjudicationService.ts`
    - Implement createAdjudication, transitionStage (sequential with hearing bypass option)
    - Implement recordDecision with time/monetary awards
    - Write adjudication outcomes to Contract Data Sheet and Finance module
    - _Requirements: 8.1–8.10_

  - [x] 5.8 Write property tests for Dispute Resolution
    - **Property 7: Formal Claim State Machine Transitions**
    - **Property 8: Notice Timeline Deadline Calculations**
    - **Property 9: Quantum Line Item Amount Calculation**
    - **Property 10: Quantum Summary Aggregation**
    - **Property 11: Delay Event Working Days Calculation**
    - **Property 12: Net Claimable Delay Calculation**
    - **Property 13: Adjudication State Machine Transitions**
    - **Validates: Requirements 5.2, 5.6, 6.1, 6.2, 6.4, 8.2, 9.1–9.4**

  - [x] 5.9 Implement Dispute Resolution adapters
    - Create `src/features/dispute-resolution/adapters/passportAdapter.ts` — dispute health card updates
    - Create `src/features/dispute-resolution/adapters/actionCentreAdapter.ts` — deadline warnings, submissions
    - Create `src/features/dispute-resolution/adapters/contractAdminAdapter.ts` — bidirectional cross-references, outcome write-back
    - Create `src/features/dispute-resolution/adapters/financeAdapter.ts` — monetary award payment instructions
    - _Requirements: 10.1–10.8_

  - [x] 5.10 Implement Dispute Resolution access control
    - Create `src/features/dispute-resolution/services/accessControl.ts`
    - Wire module-specific permission checks
    - _Requirements: 21.3, 21.4_

  - [x] 5.11 Write unit tests for Dispute Resolution services
    - Test claim registration and state transitions (valid/invalid)
    - Test notice deadline calculations for each contract form
    - Test quantum line item calculations and aggregation
    - Test delay analysis and net claimable delay
    - Test adjudication stage transitions including hearing bypass
    - Test evidence linkage limits and source unavailable handling
    - Test Contract Admin integration (create from escalation, bidirectional refs)
    - _Requirements: 5.1–5.7, 6.1–6.9, 7.1–7.9, 8.1–8.10, 9.1–9.9, 10.1–10.8_

- [x] 6. Checkpoint — Dispute Resolution complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement NHBRC Enrolment module — types, schemas, and core services
  - [x] 7.1 Create NHBRC directory structure and types
    - Create `src/features/nhbrc/` with index.ts, types.ts, schemas.ts
    - Define EnrolmentChecklist, ChecklistItem, FeeBand, InspectionRecord, UnitInspectionStatus, WarrantyClaim, BuilderVerification types
    - Define EnrolmentStatus, InspectionStage, InspectionOutcome, WarrantyDefectCategory, WarrantyClaimStage, BuilderVerificationStatus enums
    - _Requirements: 11.1, 12.1, 13.1, 14.1_

  - [x] 7.2 Implement Zod validation schemas for NHBRC
    - Create `src/features/nhbrc/schemas.ts`
    - Implement enrolmentChecklistSchema, inspectionRecordSchema (outcome-dependent conditions field)
    - Implement warrantyClaimSchema (evidence min 1 max 20, 10MB, JPEG/PNG/HEIF)
    - Implement builderVerificationSchema (alphanumeric 4-20, non-future date)
    - _Requirements: 12.2, 13.1, 13.2, 14.1, 14.2_

  - [x] 7.3 Implement NHBRC Engine Service
    - Create `src/features/nhbrc/services/nhbrcEngineService.ts`
    - Implement createEnrolment with checklist items, updateChecklistItem
    - Implement calculateFee using configurable fee bands (units × feeRate by value band)
    - Implement readiness percentage calculation (completed applicable / total applicable × 100)
    - Handle missing fee band configuration gracefully
    - _Requirements: 11.1–11.9_

  - [x] 7.4 Implement Inspection Tracker Service
    - Create `src/features/nhbrc/services/inspectionTrackerService.ts`
    - Implement recordInspection with stage sequence enforcement (foundation → wall_plate → roof → completion)
    - Implement waiveStage (restricted to architect, engineer, site_manager roles)
    - Implement canRecordStage checking preceding stages
    - Handle failed/conditionally passed outcomes with Action Centre notifications
    - Implement resolveConditions with configurable deadline (default 14 days)
    - _Requirements: 12.1–12.10_

  - [x] 7.5 Implement Warranty Manager Service
    - Create `src/features/nhbrc/services/warrantyManagerService.ts`
    - Implement registerClaim with warranty period validation (practical completion + 5 years)
    - Implement state machine transitions (reported → acknowledged → ... → claim_closed, no_liability → claim_closed)
    - Implement rectification deadline tracking and overdue warnings
    - Implement getClaimsSummary, getOverdueRectifications
    - _Requirements: 13.1–13.10_

  - [x] 7.6 Implement Builder Verification Service
    - Create `src/features/nhbrc/services/builderVerificationService.ts`
    - Implement verifyBuilder with input validation, 30-second timeout, status recording
    - Record verification badges via Trust & Verification module
    - Implement getPriorVerifications for repeat checks
    - _Requirements: 14.1–14.9_

  - [x] 7.7 Write property tests for NHBRC
    - **Property 14: NHBRC Enrolment Readiness Percentage**
    - **Property 15: NHBRC Fee Calculation**
    - **Property 16: Inspection Stage Sequence Enforcement**
    - **Property 17: Warranty Period Validation**
    - **Property 18: Warranty Claim State Machine**
    - **Validates: Requirements 11.2, 11.3, 12.1, 12.8, 13.3, 13.4**

  - [x] 7.8 Implement NHBRC adapters
    - Create `src/features/nhbrc/adapters/passportAdapter.ts` — enrolment status, inspection progress, warranty count
    - Create `src/features/nhbrc/adapters/actionCentreAdapter.ts` — inspection failures, condition deadlines, warranty actions
    - Create `src/features/nhbrc/adapters/riskEngineAdapter.ts` — failed inspection risk events
    - Create `src/features/nhbrc/adapters/siteExecutionAdapter.ts` — inspection hold points on programme view
    - _Requirements: 15.1–15.8_

  - [x] 7.9 Implement NHBRC access control
    - Create `src/features/nhbrc/services/accessControl.ts`
    - Wire module-specific permission checks (contractor, developer, site_manager, client, architect, engineer)
    - _Requirements: 21.5–21.7_

  - [x] 7.10 Write unit tests for NHBRC services
    - Test enrolment checklist readiness calculation
    - Test fee calculator with various band configurations and edge cases
    - Test inspection stage enforcement (blocking, waiving, re-inspection)
    - Test warranty period validation and state transitions
    - Test builder verification input validation and timeout handling
    - _Requirements: 11.1–11.9, 12.1–12.10, 13.1–13.10, 14.1–14.9, 15.1–15.8_

- [x] 8. Checkpoint — NHBRC module complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Survey & Geomatics module — types, schemas, and core services
  - [x] 9.1 Create Survey & Geomatics directory structure and types
    - Create `src/features/survey-geomatics/` with index.ts, types.ts, schemas.ts
    - Define SurveyInstruction, SGDiagram, Beacon, BeaconReplacement, BoundaryLine, AsBuiltComparison, MeasurementPair types
    - Define SurveyType, SurveyInstructionStage, SGDiagramType, SGDiagramStage, SGOffice, BeaconType, BeaconCondition, CoordinateSystem enums
    - _Requirements: 16.1, 17.1, 18.1, 19.1_

  - [x] 9.2 Implement Zod validation schemas for Survey & Geomatics
    - Create `src/features/survey-geomatics/schemas.ts`
    - Implement surveyInstructionSchema, sgDiagramSchema (unique reference per project)
    - Implement beaconSchema with coordinate system refinements and SA geographic bounds
    - Implement measurementPairSchema (range 0.001–99999.999, tolerance 0.001–1.000)
    - _Requirements: 16.5, 17.11, 18.1, 18.7, 18.8, 19.2_

  - [x] 9.3 Implement Survey Engine Service
    - Create `src/features/survey-geomatics/services/surveyEngineService.ts`
    - Implement createInstruction, issueInstruction with mandatory field validation
    - Implement stage transitions (sequential with SG bypass for topographic/as-built)
    - Implement createFromTownPlanning for auto-generation from subdivision conditions
    - Implement completion date reminders (14/7 days before)
    - _Requirements: 16.1–16.7, 20.1, 20.2_

  - [x] 9.4 Implement SG Tracker Service
    - Create `src/features/survey-geomatics/services/sgTrackerService.ts`
    - Implement registerDiagram with unique reference validation
    - Implement stage transitions (sequential + queries loop + withdrawal from pre-approved)
    - Implement processing time calculation (Working_Days since lodgement vs expected)
    - Implement overdue processing detection (expected + 20% threshold)
    - Implement withdrawDiagram with reason recording
    - _Requirements: 17.1–17.11_

  - [x] 9.5 Implement Beacon Register Service
    - Create `src/features/survey-geomatics/services/beaconRegisterService.ts`
    - Implement registerBeacon with unique identifier validation and SA bounds warning
    - Implement updateCondition with damaged/missing Action Centre notifications
    - Implement replaceBeacon with history recording
    - Implement defineBoundaryLine (ordered beacon sequences, min 2)
    - Implement getDamagedOrMissing for risk event generation
    - _Requirements: 18.1–18.8_

  - [x] 9.6 Implement As-Built Comparator Service
    - Create `src/features/survey-geomatics/services/asBuiltComparatorService.ts`
    - Implement createComparison, addMeasurement, removeMeasurement
    - Auto-calculate deviation (asBuilt - approved), absolute deviation, within-tolerance flag
    - Implement compliance percentage (within/total × 100 to 1 decimal, 0.0% when empty)
    - Implement markCompleted (min 1 measurement) with Documents module registration
    - _Requirements: 19.1–19.9_

  - [x] 9.7 Write property tests for Survey & Geomatics
    - **Property 19: Survey Instruction Stage Transitions**
    - **Property 20: SG Diagram Stage Transitions**
    - **Property 21: As-Built Deviation and Compliance**
    - **Validates: Requirements 16.2, 16.7, 17.2, 19.3, 19.4**

  - [x] 9.8 Implement Survey & Geomatics adapters
    - Create `src/features/survey-geomatics/adapters/passportAdapter.ts` — survey/diagram status updates
    - Create `src/features/survey-geomatics/adapters/actionCentreAdapter.ts` — completion reminders, overdue processing, beacon warnings
    - Create `src/features/survey-geomatics/adapters/townPlanningAdapter.ts` — condition fulfilment, sequential dependency blocking
    - Create `src/features/survey-geomatics/adapters/documentsAdapter.ts` — survey documents registration
    - _Requirements: 20.1–20.8_

  - [x] 9.9 Implement Survey & Geomatics access control
    - Create `src/features/survey-geomatics/services/accessControl.ts`
    - Wire module-specific permission checks (land_surveyor, architect, bep, cpm, developer)
    - _Requirements: 21.8, 21.9_

  - [x] 9.10 Write unit tests for Survey & Geomatics services
    - Test survey instruction stage transitions including SG bypass
    - Test SG diagram transitions including queries loop and withdrawal
    - Test beacon registration with coordinate validation and SA bounds
    - Test as-built comparison calculations and compliance percentage
    - Test Town Planning integration (auto-instruction creation, condition fulfilment)
    - _Requirements: 16.1–16.7, 17.1–17.11, 18.1–18.8, 19.1–19.9, 20.1–20.8_

- [x] 10. Checkpoint — Survey & Geomatics complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement UI components for all P1 modules
  - [x] 11.1 Implement Insurance Register UI components
    - Create `src/features/insurance-register/components/InsuranceRegisterView.tsx` — main register with tab navigation
    - Create `PolicyForm.tsx` — policy registration/edit form with Zod validation
    - Create `PolicyCompliancePanel.tsx` — compliance status per policy type
    - Create `ClaimsNotificationForm.tsx` — claims event registration
    - Create `ClaimsSummaryPanel.tsx` — cumulative claims summary display
    - Include DisclaimerBanner on all views
    - _Requirements: 1.2, 1.8, 2.2, 2.11, 3.8, 22.1_

  - [x] 11.2 Implement Dispute Resolution UI components
    - Create `src/features/dispute-resolution/components/DisputeResolutionView.tsx` — main view with tab navigation
    - Create `ClaimsRegisterPanel.tsx` — claims dashboard with totals
    - Create `ClaimDetailView.tsx` — individual claim detail and transitions
    - Create `NoticeTimelineVisualisation.tsx` — timeline with deadlines and current position
    - Create `QuantumAnalyserPanel.tsx` — cost line items with category breakdown
    - Create `DelayAnalysisPanel.tsx` — delay events with net claimable calculation
    - Create `EvidenceSchedulePanel.tsx` — evidence listing and linking interface
    - Create `AdjudicationWorkflowView.tsx` — adjudication stage management
    - Include DisclaimerBanner on all views
    - _Requirements: 5.3, 6.6, 7.6, 8.8, 9.2, 9.4, 22.2, 22.6_

  - [x] 11.3 Implement NHBRC UI components
    - Create `src/features/nhbrc/components/NHBRCEnrolmentView.tsx` — main view with tab navigation
    - Create `EnrolmentChecklist.tsx` — checklist items with status toggles and readiness percentage
    - Create `FeeCalculator.tsx` — fee band calculation with disclaimer
    - Create `InspectionTrackerView.tsx` — unit inspection grid showing stages per unit
    - Create `InspectionOutcomeForm.tsx` — inspection recording form with evidence upload
    - Create `WarrantyClaimForm.tsx` — warranty claim registration with period validation
    - Create `WarrantyClaimsList.tsx` — claims summary and list view
    - Create `BuilderVerificationPanel.tsx` — builder check form and result display
    - Include DisclaimerBanner on all views
    - _Requirements: 11.1, 11.5, 11.9, 12.2, 13.1, 13.10, 14.7, 22.3, 22.7_

  - [x] 11.4 Implement Survey & Geomatics UI components
    - Create `src/features/survey-geomatics/components/SurveyGeomaticsView.tsx` — main view with tab navigation
    - Create `SurveyInstructionForm.tsx` — instruction creation/issuance form
    - Create `SGDiagramTracker.tsx` — diagram lifecycle view with processing time indicators
    - Create `BeaconRegisterPanel.tsx` — beacon list with condition status and boundary lines
    - Create `AsBuiltComparisonView.tsx` — measurement pairs entry with live deviation calculation
    - Create `ComparisonSummaryPanel.tsx` — compliance summary with tolerance indicators
    - Include DisclaimerBanner on all views
    - _Requirements: 16.1, 17.1, 17.6, 18.2, 19.2, 19.4, 22.4, 22.8_

- [x] 12. Checkpoint — UI components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Cross-cutting integration wiring and Zod round-trip validation
  - [x] 13.1 Wire all modules into module index exports
    - Create/update each module's `index.ts` with public API exports
    - Ensure each module is importable from `src/features/{module-name}`
    - Register modules in platform navigation configuration
    - _Requirements: 23.1–23.8_

  - [x] 13.2 Implement SpecForge integration
    - Add specification change record writes where modules affect design parameters
    - Insurance requirements → spec items, survey results → design parameters
    - _Requirements: 23.5_

  - [x] 13.3 Implement Closeout module integration
    - Insurance Register → defects liability period verification checklist item
    - NHBRC → completion certificates and warranty documentation items
    - Survey → as-built comparison results in handover pack
    - _Requirements: 4.4, 15.3, 19.7_

  - [x] 13.4 Write property test for Zod Schema Validation Round-Trip
    - **Property 24: Zod Schema Validation Round-Trip**
    - **Validates: Requirements 1.8, 3.9, 5.5, 14.2, 16.5, 17.11, 18.8**

  - [x] 13.5 Write integration tests for cross-module flows
    - Test end-to-end: policy registered → compliance checked → passport updated → action centre notified
    - Test end-to-end: claim registered → deadline calculated → warning surfaced → overdue alert
    - Test end-to-end: inspection failed → risk event created → action centre notified
    - Test end-to-end: SG diagram approved → town planning condition fulfilled
    - Test retry queue behaviour under simulated adapter failures
    - _Requirements: 4.1–4.8, 10.1–10.8, 15.1–15.8, 20.1–20.8, 23.1–23.8_

- [x] 14. Final checkpoint — Full P1 implementation complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation between module boundaries
- Property tests validate universal correctness properties from the design document (24 properties using fast-check)
- Unit tests validate specific examples, edge cases, and integration adapter payloads
- All modules follow the identical feature module pattern at `src/features/{module-name}/`
- Shared infrastructure (p1-shared) must be completed first as all modules depend on it
- UI components use shadcn/ui primitives within the Architex OS shell pattern
- TypeScript is the implementation language throughout (matching the design document)


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "1.7", "1.9"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.6", "1.8"] },
    { "id": 3, "tasks": ["3.1", "5.1", "7.1", "9.1"] },
    { "id": 4, "tasks": ["3.2", "5.2", "7.2", "9.2"] },
    { "id": 5, "tasks": ["3.3", "3.4", "3.5", "5.3", "5.4", "5.5", "5.6", "5.7", "7.3", "7.4", "7.5", "7.6", "9.3", "9.4", "9.5", "9.6"] },
    { "id": 6, "tasks": ["3.6", "3.7", "3.8", "5.8", "5.9", "5.10", "7.7", "7.8", "7.9", "9.7", "9.8", "9.9"] },
    { "id": 7, "tasks": ["3.9", "5.11", "7.10", "9.10"] },
    { "id": 8, "tasks": ["11.1", "11.2", "11.3", "11.4"] },
    { "id": 9, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 10, "tasks": ["13.4", "13.5"] }
  ]
}
```
