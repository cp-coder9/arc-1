# Implementation Plan: Health & Safety Module

## Overview

Build the H&S Module as a services-first, event-driven system integrated into the Architex platform. Services are implemented before UI, with dependency-aware ordering ensuring each service is independently testable. All business logic lives in `src/services/healthSafety/` with pure functions, state machines for workflows, and event-driven integration with Project Passport and Action Centre.

## Tasks

- [x] 1. Set up project structure, types, and schemas
  - [x] 1.1 Add `health_safety` role to UserRole and extend lifecycle types
    - Add `'health_safety'` to the `UserRole` union in `src/types.ts`
    - Add new `ProjectRecordType` extensions to `src/services/lifecycleTypes.ts`: `'hs_plan_approved'`, `'permit_issued'`, `'incident_reported'`, `'safety_file_score_changed'`, `'hs_specification_complete'`
    - Add `'health_safety'` as a valid `sourceModule` for `WorkflowEvent`
    - _Requirements: 10.1, 11.1, 11.2_

  - [x] 1.2 Create H&S type interfaces
    - Create `src/services/healthSafety/hsTypes.ts` with all interfaces from the design: `SafetyFileSection`, `SafetyFile`, `HSPlan`, `HSPlanState`, `HazardEntry`, `RiskLevel`, `Permit`, `PermitType`, `PermitState`, `Incident`, `InjuryClassification`, `IncidentState`, `CorrectiveAction`, `ToolboxTalk`, `Induction`, `InductionType`, `FallProtectionPlan`, `FallProtectionMethod`, `InspectionSchedule`, `ClientHSSpecification`, `DesignerRiskAssessment`
    - _Requirements: 1.1, 5.1, 7.1, 8.2, 9.1_

  - [x] 1.3 Create Zod validation schemas
    - Create `src/services/healthSafety/hsSchemas.ts` with all Zod schemas: `HazardEntrySchema`, `PermitRequestSchema`, `IncidentReportSchema`, `ToolboxTalkSchema`, `InductionSchema`, `FallProtectionPlanSchema`, `ClientHSSpecificationSchema`, `DesignerRiskAssessmentSchema`, `HSPlanSchema`
    - _Requirements: 5.1, 7.1, 8.2, 9.1_

  - [x] 1.4 Create shared error types and constants
    - Create `src/services/healthSafety/hsErrors.ts` with `InvalidStateTransitionError`, `NotFoundError`, `PersistenceError`
    - Create `src/services/healthSafety/hsConstants.ts` with risk matrix thresholds, mandatory Safety File section IDs, business day calculation helper, and advisory disclaimer text
    - _Requirements: 1.1, 11.5_

- [x] 2. Implement HIRA Service
  - [x] 2.1 Implement HIRA Engine core logic
    - Create `src/services/healthSafety/hiraService.ts`
    - Implement `calculateRiskRating(likelihood, severity)` using 5×5 matrix with classification thresholds (Low: 1–4, Medium: 5–9, High: 10–15, Critical: 16–25)
    - Implement `createHazard(input)` with risk rating calculation and residualRisk derivation
    - Implement `updateControls(hazard, controls)` with residual risk recalculation
    - Implement `getHighRiskHazards(hazards)` filtering for high/critical entries
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Write property test: HIRA risk rating calculation (Property 10)
    - **Property 10: HIRA risk rating calculation and classification**
    - Use `fast-check` with `fc.integer({ min: 1, max: 5 })` for likelihood and severity
    - Assert `rating === likelihood × severity` and level matches thresholds
    - Assert `createHazard()` preserves all input fields and populates riskRating/residualRisk
    - **Validates: Requirements 5.1, 5.2**

  - [x] 2.3 Write property test: High/critical hazard notification (Property 11)
    - **Property 11: High/critical hazard Action Centre notification**
    - Generate arbitrary HazardEntry with varying residualRisk levels
    - Assert high/critical generates a WorkflowEvent; low/medium does not
    - **Validates: Requirements 5.3**

  - [x] 2.4 Write unit tests for HIRA edge cases
    - Test boundary values (likelihood=1,severity=1 → low; 5,5 → critical)
    - Test control update triggers recalculation
    - Test empty controls array handling
    - _Requirements: 5.4_

- [x] 3. Implement Induction Tracker Service
  - [x] 3.1 Implement Induction Tracker core logic
    - Create `src/services/healthSafety/inductionTrackerService.ts`
    - Implement `recordToolboxTalk(input)` preserving all input fields with generated ID and timestamp
    - Implement `recordInduction(input)` preserving all input fields with generated ID and timestamp
    - Implement `getUninductedWorkers(projectId, workforce, inductions)` computing set difference W \ inducted
    - Implement `isWorkerInducted(workerId, projectId, inductions)` returning boolean
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 3.2 Write property test: Uninducted worker detection (Property 12)
    - **Property 12: Uninducted worker detection**
    - Generate arbitrary workforce lists and induction records
    - Assert result equals exactly `W \ {inductees in I with matching projectId}`
    - **Validates: Requirements 6.3**

  - [x] 3.3 Write property test: Induction/toolbox talk data preservation (Property 13)
    - **Property 13: Induction and toolbox talk data preservation**
    - Generate arbitrary valid inputs and verify all fields preserved in output
    - **Validates: Requirements 6.1, 6.2**

- [x] 4. Implement Incident Reporter Service
  - [x] 4.1 Implement Incident Reporter core logic
    - Create `src/services/healthSafety/incidentReporterService.ts`
    - Implement `reportIncident(input)` with initial state 'reported' and auto-classification
    - Implement `classifySection24(incident)` — fatality → true, first_aid → false, medical_treatment/lost_time per statutory definition
    - Implement `assignInvestigation(incident, investigatorId)` transitioning to 'under_investigation'
    - Implement `addCorrectiveAction(incident, action)` adding action with 'open' status
    - Implement `checkOverdueActions(incident, now)` generating high-priority WorkflowEvents for overdue items
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.2 Write property test: Incident Section 24 classification (Property 14)
    - **Property 14: Incident Section 24 classification**
    - Generate incidents with varying injuryClassification
    - Assert fatality → true, first_aid → false
    - **Validates: Requirements 7.2**

  - [x] 4.3 Write property test: Corrective action overdue escalation (Property 15)
    - **Property 15: Corrective action overdue escalation**
    - Generate incidents with corrective actions at various due dates
    - Assert overdue + incomplete → non-empty WorkflowEvents; completed/not-due → empty array
    - **Validates: Requirements 7.4**

  - [x] 4.4 Write unit tests for Incident Reporter state transitions
    - Test invalid state transitions throw `InvalidStateTransitionError`
    - Test investigation assignment populates investigatorId
    - Test state machine: reported → under_investigation → corrective_actions → closed
    - _Requirements: 7.3_

- [x] 5. Implement Permit Service
  - [x] 5.1 Implement Permit System state machine
    - Create `src/services/healthSafety/permitService.ts`
    - Implement `requestPermit(input)` creating permit in 'draft' → 'submitted' state
    - Implement `approvePermit(permit, approverId)` transitioning submitted → approved
    - Implement `transitionPermitState(permit, newState, actor)` with valid transition enforcement
    - Implement `checkPermitExpiry(permit, now)` detecting active permits past validTo
    - Implement `closeOutPermit(permit, actor, conditionsMet)` recording close-out details
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 5.2 Write property test: Permit time-window enforcement (Property 17)
    - **Property 17: Permit time-window enforcement and expiry transition**
    - Generate permits with arbitrary validTo timestamps and check against arbitrary now
    - Assert `now > validTo` → expired with WorkflowEvent; `now <= validTo` → not expired
    - **Validates: Requirements 9.3, 9.4**

  - [x] 5.3 Write property test: Permit close-out records (Property 18)
    - **Property 18: Permit close-out records details**
    - Generate active/expired permits and arbitrary actor/conditionsMet values
    - Assert state → 'closed', closeOutBy/closeOutAt/closeOutConditionsMet populated correctly
    - **Validates: Requirements 9.5**

  - [x] 5.4 Write unit tests for Permit state machine edge cases
    - Test invalid transitions (approve from draft, close from submitted)
    - Test reject → draft → resubmit flow
    - Test all valid state transitions in the lifecycle diagram
    - _Requirements: 9.1, 9.2_

- [x] 6. Checkpoint — Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Fall Protection Service
  - [x] 7.1 Implement Fall Protection Plan logic
    - Create `src/services/healthSafety/fallProtectionService.ts`
    - Implement `createFallProtectionPlan(input)` with generated ID and timestamps
    - Implement `approveFallProtectionPlan(plan, approverId)` setting approvedAt/approvedBy
    - Implement `checkInspectionOverdue(plan, now)` comparing nextDue against current date
    - Implement `linkToPermit(plan, permitId)` adding permitId to linkedPermitIds
    - Add permit-gating logic: block permit issuance when no approved fall protection plan is linked for height work
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 7.2 Write property test: Fall protection plan gating (Property 16)
    - **Property 16: Fall protection plan gating of permits**
    - Generate permit requests with/without linked approved FallProtectionPlan
    - Assert no approved plan → blocked; approved plan linked → proceeds
    - **Validates: Requirements 8.1**

  - [x] 7.3 Write unit tests for Fall Protection Service
    - Test inspection overdue detection at boundary dates
    - Test linking multiple permits to a plan
    - Test Action Centre event on expired plan / overdue inspection
    - _Requirements: 8.3, 8.4_

- [x] 8. Implement Client Specification Engine
  - [x] 8.1 Implement Client Specification wizard logic
    - Create `src/services/healthSafety/clientSpecificationService.ts`
    - Implement `createSpecification(projectId)` initialising empty spec
    - Implement `updateSpecificationStep(spec, step, value)` updating individual fields
    - Implement `isSpecificationComplete(spec)` checking all required fields non-empty
    - Implement `generateSpecificationDocument(spec)` producing formatted string containing all input fields
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 8.2 Write property test: Client specification document generation (Property 8)
    - **Property 8: Client specification document generation preserves all input**
    - Generate complete ClientHSSpecification with arbitrary valid strings
    - Assert output string contains projectDescription, scopeOfWork, all knownHazards, all minimumHSRequirements, complianceMonitoringArrangements
    - **Validates: Requirements 3.2, 3.3**

  - [x] 8.3 Write unit tests for Client Specification Engine
    - Test incomplete spec detection (missing fields)
    - Test step-by-step update flow
    - Test advisory guidance when no spec exists
    - _Requirements: 3.1, 3.4_

- [x] 9. Implement Designer Risk Capture
  - [x] 9.1 Implement Designer Risk Capture logic
    - Create `src/services/healthSafety/designerRiskService.ts`
    - Implement `captureDesignerRisk(input)` storing assessment with generated ID and timestamps
    - Implement `getProjectDesignerRisks(projectId, assessments)` filtering by projectId
    - Implement `generateDesignerRiskSummary(assessments)` producing summary string mentioning every hazardDescription
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.2 Write property test: Designer risk assessment round-trip (Property 9)
    - **Property 9: Designer risk assessment round-trip**
    - Generate arbitrary valid DesignerRiskAssessment inputs
    - Assert capture → filter returns assessment with all fields preserved
    - Assert generateDesignerRiskSummary mentions every hazardDescription
    - **Validates: Requirements 4.1, 4.2, 4.4**

- [x] 10. Implement H&S Plan Workflow Service
  - [x] 10.1 Implement H&S Plan approval state machine
    - Create `src/services/healthSafety/hsPlanWorkflowService.ts`
    - Implement `submitPlan(plan, submitterId)` transitioning draft → submitted → pending_approval
    - Implement `approvePlan(plan, approverId)` transitioning pending_approval → approved with timestamp
    - Implement `rejectPlan(plan, approverId, reasons)` transitioning to rejected with reasons preserved
    - Implement `canCreateSiteDiary(projectId, plan)` — returns true only when plan is approved
    - Implement `checkEscalation(plan, now)` — returns high-priority event after 5 business days
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 10.2 Write property test: H&S Plan approval round-trip (Property 5)
    - **Property 5: H&S Plan approval round-trip unblocks site operations**
    - Generate plans in draft state, apply submitPlan → approvePlan
    - Assert final state is 'approved', approvedBy/approvedAt populated, canCreateSiteDiary returns true
    - Assert pending_approval state → canCreateSiteDiary returns false
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x] 10.3 Write property test: H&S Plan rejection preserves reasons (Property 6)
    - **Property 6: H&S Plan rejection preserves reasons**
    - Generate plans in pending_approval state with arbitrary non-empty reason arrays
    - Assert rejectPlan transitions to 'rejected' and rejectionReasons equals input reasons
    - **Validates: Requirements 2.4**

  - [x] 10.4 Write property test: H&S Plan escalation on timeout (Property 7)
    - **Property 7: H&S Plan escalation on timeout**
    - Generate submitted plans with arbitrary submission times and now values
    - Assert >5 business days → non-null high-priority event; ≤5 days → null
    - **Validates: Requirements 2.5**

- [x] 11. Implement Safety File Builder
  - [x] 11.1 Implement Safety File Builder core logic
    - Create `src/services/healthSafety/safetyFileService.ts`
    - Implement `initialiseSafetyFile(projectId, tenantId)` creating file with all Regulation 7 mandatory sections in 'incomplete' status, version 0
    - Implement `updateSection(file, sectionId, update, actorId)` incrementing version by 1 and recording audit trail
    - Implement `calculateComplianceScore(file)` as `Math.round((completeSections / totalMandatory) * 100)`
    - Implement `getMissingSections(file)` returning sections with status 'incomplete' or 'expired'
    - Implement `generateComplianceEvents(file, previousScore)` producing exactly one event when score changes, zero when equal
    - Implement `getContractorHSProfile()` for procurement integration
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 11.4_

  - [x] 11.2 Write property test: Safety File initialisation completeness (Property 1)
    - **Property 1: Safety File initialisation completeness**
    - Generate arbitrary valid projectId and tenantId strings
    - Assert output contains all mandatory section IDs, each in 'incomplete' status with version 0
    - **Validates: Requirements 1.1, 1.4**

  - [x] 11.3 Write property test: Section update versioning (Property 2)
    - **Property 2: Section update versioning and audit trail**
    - Generate SafetyFiles and arbitrary valid updates
    - Assert new version === old version + 1 and audit trail entry preserves actorId/timestamp
    - **Validates: Requirements 1.2**

  - [x] 11.4 Write property test: Compliance score calculation (Property 3)
    - **Property 3: Compliance score calculation correctness**
    - Generate SafetyFiles with varying numbers of complete/incomplete sections
    - Assert score === Math.round((K/N) * 100)
    - Assert score change → 1 event; no change → 0 events
    - **Validates: Requirements 1.5, 1.6**

  - [x] 11.5 Write property test: Non-compliant section detection (Property 4)
    - **Property 4: Non-compliant section detection**
    - Generate SafetyFiles with at least one incomplete/expired section
    - Assert getMissingSections returns non-empty array with exactly those sections
    - **Validates: Requirements 1.3**

- [x] 12. Checkpoint — All domain services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement Integration Service
  - [x] 13.1 Implement H&S Integration Service
    - Create `src/services/healthSafety/hsIntegrationService.ts`
    - Implement Project Passport writes using `createWorkflowEvent()` with `moduleKey: 'site'` and H&S-specific `recordType` extensions
    - Implement Action Centre event generation using existing `inboxEventAdapter.ts` with priority escalation for overdue permits, pending approvals, and Section 24 incidents
    - Implement `getSiteContextSafetyData(projectId)` returning active permits, uninducted workers, and high-risk HIRA items for Site Execution (Pack 9)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x] 13.2 Write property test: Site context safety data surfacing (Property 20)
    - **Property 20: Site context safety data surfacing**
    - Generate project data with varying permits, workers, and HIRA items
    - Assert all three categories present when data exists; empty arrays when no data
    - **Validates: Requirements 11.3**

  - [x] 13.3 Write property test: Advisory disclaimer invariant (Property 21)
    - **Property 21: Advisory disclaimer invariant**
    - Generate arbitrary Safety File reports and compliance score outputs
    - Assert all output strings contain the advisory-only disclaimer text
    - **Validates: Requirements 11.5**

  - [x] 13.4 Write unit tests for Integration Service
    - Test WorkflowEvent shape for each compliance event type
    - Test Action Centre event priority levels (critical for Section 24, high for overdue)
    - Test deep-link generation for H&S context
    - _Requirements: 11.1, 11.2_

- [x] 14. Implement Dashboard Service
  - [x] 14.1 Implement H&S Dashboard aggregation service
    - Create `src/services/healthSafety/hsDashboardService.ts`
    - Implement role-differentiated view logic: H&S Officer (operational detail), Principal Contractor (file compliance + approvals), Client (plan approval + scores), Designer (risk assessment submissions)
    - Aggregate data from Safety File, Permit System, HIRA, Incident Reporter, Induction Tracker
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 14.2 Write property test: Dashboard role-differentiated aggregation (Property 19)
    - **Property 19: Dashboard role-differentiated aggregation**
    - Generate project H&S data and test with each role
    - Assert H&S Officer view includes permits, inductions, investigations
    - Assert Client view includes only plan approval status and compliance scores
    - **Validates: Requirements 10.2, 10.4**

  - [x] 14.3 Write unit tests for Dashboard Service
    - Test empty project data returns zero-state dashboard
    - Test aggregation across multiple projects
    - Test metric change detection for real-time updates
    - _Requirements: 10.3_

- [x] 15. Checkpoint — All services and integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Add H&S navigation and routing
  - [x] 16.1 Register H&S module in navigation config
    - Update `src/navigation/architexNavigationConfig.ts` to add `health_safety` section under `toolboxes`
    - Add navigation items: Dashboard, Safety File, Permits, Incidents, HIRA, Inductions, H&S Plan, Client Spec, Fall Protection
    - Configure role access: `health_safety`, `site_manager`, `contractor`, `client` roles
    - Add route registrations in `src/App.tsx` for lazy-loaded H&S components
    - _Requirements: 10.1, 11.2_

- [x] 17. Implement UI Components
  - [x] 17.1 Implement HealthSafetyWorkspace component (SpecForge template)
    - Create `src/components/healthSafety/HealthSafetyWorkspace.tsx` using the SpecForge workspace pattern:
      - Header Card with tool name, project context, role badge
      - Project toggles (multi-project buttons + All Projects + Standalone option)
      - Tab navigation (Overview, Safety File, Permits, HIRA, Incidents, Inductions, H&S Plans, Fall Protection)
      - StatCard sub-components with icons
      - Teal Architex colour scheme via CSS token system
    - Registered as lazy-loaded page in `src/App.tsx` with `id: 'health-safety'`
    - Added to navigation config under `toolboxes` module
    - Role access: `health_safety`, `site_manager`, `contractor`, `client`, `architect`, `engineer`, `admin`
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 17.2 Implement SafetyFileViewer tab
    - Integrated as `safety-file` tab in `HealthSafetyWorkspace.tsx`
    - Displays all Safety File sections with completion indicators (complete/incomplete/expired/not_applicable)
    - Shows compliance score with advisory-only disclaimer
    - _Requirements: 1.1, 1.3, 1.5, 11.5_

  - [x] 17.3 Implement PermitManager tab
    - Integrated as `permits` tab in `HealthSafetyWorkspace.tsx`
    - Permit register table with status badges, request form, approval/rejection flow
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 17.4 Implement IncidentReportForm tab
    - Integrated as `incidents` tab in `HealthSafetyWorkspace.tsx`
    - Incident register table with classification badges and Section 24 flags
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 17.5 Implement HIRARegister tab
    - Integrated as `hira` tab in `HealthSafetyWorkspace.tsx`
    - Hazard register table with risk matrix, colour-coded risk levels
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 17.6 Implement InductionPanel tab
    - Integrated as `inductions` tab in `HealthSafetyWorkspace.tsx`
    - Induction progress, toolbox talk recording, uninducted worker alerts
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 17.7 Implement HSPlanApproval tab
    - Integrated as `plans` tab in `HealthSafetyWorkspace.tsx`
    - Plan approval status card with blocking indicator
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 17.8 Implement ClientSpecWizard component
    - Create `src/components/healthSafety/ClientSpecWizard.tsx` as standalone dialog/sheet
    - Step-by-step wizard for Regulation 5(1) specification
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 17.9 Implement FallProtectionPlan tab
    - Integrated as `fall-protection` tab in `HealthSafetyWorkspace.tsx`
    - Plan cards with inspection schedule, permit linkage
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 18. Final checkpoint — Full module complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at service boundaries
- Property tests validate universal correctness properties defined in the design using `fast-check`
- Unit tests validate specific examples, edge cases, and error conditions
- All services are pure functions — no Firestore persistence in the business logic layer
- UI components follow the Architex OS shell integration pattern (no standalone pages)
- Advisory-only language is enforced on all generated reports and scores

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "4.2", "4.3", "4.4", "5.1"] },
    { "id": 3, "tasks": ["5.2", "5.3", "5.4", "7.1", "8.1", "9.1", "10.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "8.2", "8.3", "9.2", "10.2", "10.3", "10.4", "11.1"] },
    { "id": 5, "tasks": ["11.2", "11.3", "11.4", "11.5", "13.1"] },
    { "id": 6, "tasks": ["13.2", "13.3", "13.4", "14.1"] },
    { "id": 7, "tasks": ["14.2", "14.3", "16.1"] },
    { "id": 8, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7", "17.8", "17.9"] }
  ]
}
```
