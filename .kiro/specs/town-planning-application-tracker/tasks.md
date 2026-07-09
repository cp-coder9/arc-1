# Implementation Plan: Town Planning Application Tracker

## Overview

Build a complete town planning application lifecycle tracker module within the Architex platform. The implementation follows the bounded feature module pattern at `src/features/town-planning/`, with 9 services, ~25 UI components, 3 custom hooks, an Express API router, and full platform spine integration. The module manages South African SPLUMA-governed planning applications through 10 lifecycle stages with statutory deadline tracking, public participation management, condition fulfilment, appeal handling, and environmental/heritage triggers.

## Tasks

- [x] 1. Set up project structure, types, and constants
  - [x] 1.1 Create the feature directory structure and TypeScript types
    - Create `src/features/town-planning/` directory with subdirectories: `components/`, `hooks/`, `services/`, `__tests__/`
    - Create `src/features/town-planning/types.ts` with all planning-specific types from the design (PlanningApplicationType, PlanningStage, ApplicationStatus, ConditionType, AppealOutcome, DeadlineStatus, ObjectionStatus, TriggerType, ParallelProcessStatus, and all interfaces: PlanningApplication, ContactDetails, StageTransition, Deadline, MunicipalityProfile, FeeScheduleItem, RequiredForm, ProcessVariation, CustomTimeframe, Objection, ObjectionResponse, PublicParticipationSummary, Condition, Appeal, Hearing, EnvironmentalHeritageTrigger, DocumentChecklistItem, StageGateResult, StageRequirement, PlanningPermission)
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 1.2 Create constants and stage definitions
    - Create `src/features/town-planning/constants.ts` with: ordered PLANNING_STAGES array (10 stages), APPLICATION_TYPES array (7 types), SPLUMA default timeframes (28-day objection, 21-day appeal, 60-day decision), default document types per stage, priority levels, and planning audit action types
    - _Requirements: 2.1, 3.4, 5.5_

- [x] 2. Implement core services — Planning Application and Municipality Profile
  - [x] 2.1 Implement Municipality Profile Service
    - Create `src/features/town-planning/services/municipalityProfileService.ts`
    - Implement: createProfile, updateProfile, getProfile, getProfileByName, listProfiles, resolveProfile (with SPLUMA default fallback), getDefaultProfile, getRequiredDocuments, getFees, getTimeframes
    - Use Firestore collection `planning_municipality_profiles` scoped by tenantId
    - Ensure resolveProfile returns SPLUMA default when no municipality-specific config exists
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 2.2 Write property test for Municipality Profile fallback
    - **Property 10: Municipality Profile Fallback**
    - **Validates: Requirements 5.5, 5.2**

  - [x] 2.3 Implement Planning Application Service
    - Create `src/features/town-planning/services/planningApplicationService.ts`
    - Implement: createApplication (generates unique reference number, writes audit event, updates Project Passport), getApplication, getApplicationsByProject, getApplicationsByTownPlanner, advanceStage (validates stage gate, enforces sequential progression, checks parallel process blockers), validateStageGate, getCurrentStageRequirements, updateStatus, markDeemedRefused
    - Reference number format: `TP-{MUNICIPALITY_CODE}-{YEAR}-{SEQ}` ensuring uniqueness per tenant
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3_

  - [x] 2.4 Write property test for sequential stage progression
    - **Property 1: Sequential Stage Progression**
    - **Validates: Requirements 2.1**

  - [x] 2.5 Write property test for stage gate completeness
    - **Property 2: Stage Gate Completeness**
    - **Validates: Requirements 2.2, 7.3**

  - [x] 2.6 Write property test for reference number uniqueness
    - **Property 14: Reference Number Uniqueness**
    - **Validates: Requirements 1.4**

- [x] 3. Checkpoint — Core services foundation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement deadline and participation services
  - [x] 4.1 Implement Deadline Engine Service
    - Create `src/features/town-planning/services/deadlineEngineService.ts`
    - Implement: registerStatutoryDeadlines (auto-calculate on stage entry), recalculateDeadlines, getDeadlineRegister, getApproachingDeadlines, getOverdueDeadlines, evaluateDeadlineAlerts, markDeadlineMet, suspendDeadlines (for appeals), resumeDeadlines, calculateObjectionPeriodEnd (+28 days), calculateAppealDeadline (+21 days), calculateDecisionPeriodEnd (+60 days or custom), checkDeemedRefused
    - Respect municipality-specific custom timeframes over SPLUMA defaults
    - Alert escalation: 7 days → approaching, 2 days → urgent, past due → overdue high-priority
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 2.4, 2.5, 2.6_

  - [x] 4.2 Write property test for objection period calculation
    - **Property 3: Objection Period Calculation**
    - **Validates: Requirements 2.4, 3.4**

  - [x] 4.3 Write property test for appeal deadline calculation
    - **Property 4: Appeal Deadline Calculation**
    - **Validates: Requirements 2.5, 3.4**

  - [x] 4.4 Write property test for decision period deemed-refusal
    - **Property 5: Decision Period Deemed-Refusal**
    - **Validates: Requirements 2.6, 3.6**

  - [x] 4.5 Write property test for deadline alert escalation
    - **Property 6: Deadline Alert Escalation**
    - **Validates: Requirements 3.2, 3.3, 10.1, 10.2**

  - [x] 4.6 Implement Public Participation Service
    - Create `src/features/town-planning/services/publicParticipationService.ts`
    - Implement: recordObjection (detect late objections by comparing dateReceived to objection period end), recordResponse (link to original objection), flagLateObjection, decideLateObjection, getParticipationSummary, generateParticipationReport, getObjections, getUnansweredObjections
    - Notify Town Planner immediately when objection is received
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 4.7 Write property test for late objection detection
    - **Property 7: Late Objection Detection**
    - **Validates: Requirements 4.5**

  - [x] 4.8 Write property test for objection response linkage
    - **Property 15: Objection Response Linkage**
    - **Validates: Requirements 4.2**

- [x] 5. Implement condition, appeal, and trigger services
  - [x] 5.1 Implement Condition Register Service
    - Create `src/features/town-planning/services/conditionRegisterService.ts`
    - Implement: captureCondition (classify as precedent/ongoing), getConditions, getConditionsByType, markFulfilled (record evidence + confirmer), checkAllPrecedentFulfilled, getFulfilmentStatus, writeConditionsToSpecForge, registerConditionDeadlines, updateConditionsFromAppeal
    - When all precedent conditions fulfilled → update application status to approval effective → notify Project Passport
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 5.2 Write property test for condition fulfilment implies approval effective
    - **Property 8: Condition Fulfilment Implies Approval Effective**
    - **Validates: Requirements 6.4**

  - [x] 5.3 Implement Appeal Management Service
    - Create `src/features/town-planning/services/appealManagementService.ts`
    - Implement: lodgeAppeal (validate within 21-day statutory period, transition status to Appeal In Progress, suspend condition deadlines), getAppeal, getAppealsByApplication, scheduleHearing, postponeHearing (recalculate deadlines, notify stakeholders), getHearingsByProject, getHearingChecklist, recordOutcome (update condition register if varied), validateWithinStatutoryPeriod
    - Generate hearing preparation alerts at 14 and 7 days before hearing
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 5.4 Write property test for appeal suspends condition deadlines
    - **Property 9: Appeal Suspends Condition Deadlines**
    - **Validates: Requirements 8.3**

  - [x] 5.5 Implement Environmental & Heritage Trigger Service
    - Create `src/features/town-planning/services/environmentalHeritageTriggerService.ts`
    - Implement: evaluateTriggers, checkHeritageAge (>60 years), checkEnvironmentalScreening, confirmTrigger, createParallelProcess (with own deadlines and document requirements), resolveParallelProcess, deferParallelProcess, hasUnresolvedTriggers, getBlockingTriggers
    - Block main application from advancing past Tribunal/Decision while unresolved triggers exist
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 5.6 Write property test for parallel process gate
    - **Property 12: Parallel Process Gate**
    - **Validates: Requirements 14.4**

- [x] 6. Checkpoint — All domain services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement integration and reporting services
  - [x] 7.1 Implement Planning Integration Service
    - Create `src/features/town-planning/services/planningIntegrationService.ts`
    - Implement: updateProjectPassportPlanning, reportPlanningRisk, writeConditionsToSpecForge, notifyPlanningApprovalComplete, createSurveyHandoff, generateDocumentChecklist, registerDocument, surfaceAction (to Action Centre using existing WorkflowEvent pattern), auditEvent (using existing createAuditEntry pattern)
    - Central point for all outbound platform spine integrations
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 7.1, 7.2_

  - [x] 7.2 Write property test for audit trail completeness
    - **Property 11: Audit Trail Completeness**
    - **Validates: Requirements 1.4, 2.3, 9.5**

  - [x] 7.3 Implement Planning Reporting Service
    - Create `src/features/town-planning/services/planningReportingService.ts`
    - Implement: generatePortfolioReport (grouped by status, municipality, type), generateClientReport (per-project summary with deadlines, actions, risk), generateComplianceReport (deadlines met/missed over date range), getAverageProcessingTimes, getAtRiskApplications, getDashboardMetrics, generateGanttData
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 7.4 Write unit tests for Planning Reporting Service
    - Test portfolio report grouping, compliance rate calculation, risk detection logic, Gantt data generation
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 8. Implement API router and role-based access
  - [x] 8.1 Create Planning API Router with application and stage routes
    - Create `src/lib/planning-api-router.ts` following the `finance-api-router.ts` pattern
    - Implement application routes: POST /api/planning/applications, GET /api/planning/applications/:id, GET /api/planning/applications (with projectId and townPlannerId query params), PATCH /api/planning/applications/:id/advance, PATCH /api/planning/applications/:id/status, GET /api/planning/applications/:id/gate
    - Add Zod validation schemas for all request bodies (createApplicationSchema, etc.)
    - Implement role-based access middleware: town_planner (full read-write on assigned), client (read + comment), architect (read on team projects), surveyor (read status + conditions), firm_admin (configure access), admin (full)
    - Deny unauthorized access and log attempts to audit trail
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 8.2 Write property test for role-based access enforcement
    - **Property 13: Role-Based Access Enforcement**
    - **Validates: Requirements 11.5**

  - [x] 8.3 Add deadline, participation, condition, appeal, municipality, reporting, and trigger routes
    - Add deadline routes: GET deadlines, GET approaching, GET overdue, PATCH met
    - Add participation routes: POST objections, GET objections, POST respond, PATCH late-decision, GET participation-summary, GET participation-report
    - Add condition routes: POST conditions, GET conditions, PATCH fulfil, GET conditions/summary
    - Add appeal routes: POST appeals, GET appeals, PATCH outcome, POST hearings, PATCH hearings/postpone, GET hearings
    - Add municipality routes: POST municipalities, GET municipalities, GET/:id, PATCH/:id
    - Add reporting routes: GET portfolio, GET client, GET compliance, GET dashboard, GET gantt
    - Add trigger routes: GET triggers, POST confirm, POST defer, POST resolve
    - Wire planning-api-router into main api-router.ts
    - _Requirements: 3.1, 4.1, 4.2, 5.1, 6.1, 6.2, 8.1, 12.1, 14.1_

  - [x] 8.4 Write API route integration tests
    - Test all planning API endpoints with mocked services
    - Verify role-based access control returns 403 for unauthorized roles
    - Verify Zod validation rejects malformed requests
    - _Requirements: 11.5, 1.1_

- [x] 9. Checkpoint — Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement custom hooks and feature root component
  - [x] 10.1 Create custom React hooks
    - Create `src/features/town-planning/hooks/usePlanningApplication.ts` — fetches single application with deadlines, conditions, objections; provides mutation functions; handles loading/error/refetch
    - Create `src/features/town-planning/hooks/usePlanningPortfolio.ts` — fetches all applications for a town planner; provides dashboard metrics; handles filter/sort state
    - Create `src/features/town-planning/hooks/usePlanningDeadlines.ts` — fetches approaching and overdue deadlines; polls at 5-minute intervals; provides alert count for badge display
    - All hooks use `apiClient` from `src/lib/apiClient.ts` for data fetching
    - _Requirements: 1.3, 3.1, 3.2, 12.4_

  - [x] 10.2 Create TownPlanningTracker feature root component with dual-mode toggle
    - Create `src/features/town-planning/TownPlanningTracker.tsx` accepting `user: UserProfile` and optional `projectId`
    - Implement dual operating mode: Project-scoped mode (when projectId present — show project context, cross-module links) and Standalone mode (no projectId — show practice portfolio view)
    - Add visible ProjectToggleBar allowing mode switching
    - Follow workspace template pattern: Hero (eyebrow "TOWN PLANNING" + h1 + sub + pills) → Stat Row → Tabbed content
    - Implement tab navigation: Dashboard, Applications, Deadlines, Reports, Hearings, Municipality Profiles
    - Use `.hero`, `.pill`, `.panel`, `.btn`, `.table` CSS classes from the UI Steering document
    - Use `var(--token)` for all colors, never hardcode hex values
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.7_

- [x] 11. Implement dashboard and application detail components
  - [x] 11.1 Create PlanningDashboard component
    - Create `src/features/town-planning/components/PlanningDashboard.tsx`
    - Display stat cards: total active applications, at-risk count, overdue deadlines, approaching deadlines, pending objection responses, hearings this month
    - Show ActiveApplicationsList with status badges (`.chip` variants), StageProgressBar snippets, and risk indicators
    - Show DeadlineWidget with colour-coded deadline status using `var(--green)`, `var(--amber)`, `var(--red)`
    - Show RiskIndicatorPanel highlighting applications at risk
    - Show upcoming HearingCalendar widget
    - _Requirements: 12.4, 3.1, 1.3_

  - [x] 11.2 Create ApplicationDetail component with StageProgressBar
    - Create `src/features/town-planning/components/ApplicationDetail.tsx` — full detail view with ApplicationHeader (ref number, type, status pill), StageProgressBar (10-stage visual tracker with current stage highlighted in `var(--teal)`), and tabbed sub-views
    - Create `src/features/town-planning/components/StageProgressBar.tsx` — horizontal 10-step progress indicator showing completed stages in `var(--green)`, current stage in `var(--teal)`, upcoming stages in `var(--muted)`
    - Create `src/features/town-planning/components/StageAdvanceDialog.tsx` — modal showing stage gate validation results (missing docs, missing actions, blockers) with advance button disabled until all requirements met
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 11.3 Create deadline and timeline components
    - Create `src/features/town-planning/components/DeadlineRegisterTable.tsx` — table showing all deadlines with status pills (approaching=amber, overdue=red, met=green), due dates, days remaining, and linked stage
    - Create `src/features/town-planning/components/GanttTimeline.tsx` — Gantt-style visualization showing application stages with planned/actual durations, critical path deadlines, and milestone markers
    - _Requirements: 3.1, 3.5_

- [x] 12. Implement public participation and condition components
  - [x] 12.1 Create public participation components
    - Create `src/features/town-planning/components/ObjectionsList.tsx` — table of recorded objections with status chips, date received, objector name, and response status
    - Create `src/features/town-planning/components/ObjectionForm.tsx` — form to record new objection (name, contact, grounds, supporting docs, date received)
    - Create `src/features/town-planning/components/ResponseForm.tsx` — form to record response linked to specific objection
    - Create `src/features/town-planning/components/ParticipationSummaryCard.tsx` — stat card showing total objections, comments, responses complete/pending, period open/closed status
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 12.2 Create condition register components
    - Create `src/features/town-planning/components/ConditionRegisterTable.tsx` — table showing conditions with type (precedent/ongoing), status chips, deadline, responsible party, fulfilment evidence
    - Create `src/features/town-planning/components/ConditionCaptureForm.tsx` — form to capture RoD condition (number, description, type, responsible party, deadline, fulfilment criteria)
    - Create `src/features/town-planning/components/FulfilmentDialog.tsx` — dialog to mark condition fulfilled (evidence upload, confirmation)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 13. Implement appeal, hearing, municipality, and supporting components
  - [x] 13.1 Create appeal and hearing components
    - Create `src/features/town-planning/components/AppealForm.tsx` — form to lodge appeal (appellant details, grounds, supporting docs, date lodged) with statutory period validation
    - Create `src/features/town-planning/components/HearingDetails.tsx` — hearing scheduling view (date, time, venue, tribunal panel, preparation alerts, document checklist)
    - Create `src/features/town-planning/components/HearingCalendar.tsx` — calendar view of all hearings across project applications with colour-coded status
    - _Requirements: 8.1, 8.2, 8.4, 13.1, 13.2, 13.3, 13.4_

  - [x] 13.2 Create municipality profile and document components
    - Create `src/features/town-planning/components/MunicipalityProfileForm.tsx` — config editor for municipality profiles (name, contact, fee schedule, required forms, process variations, custom timeframes, provincial forms)
    - Create `src/features/town-planning/components/DocumentChecklist.tsx` — stage-aware checklist generated from municipality profile, showing required/uploaded/waived status with upload actions
    - _Requirements: 5.1, 5.2, 5.4, 7.1, 7.4_

  - [x] 13.3 Create RiskIndicatorPanel and ApplicationAuditLog components
    - Create `src/features/town-planning/components/RiskIndicatorPanel.tsx` — panel showing applications at risk (overdue deadlines, stuck stages, approaching limits) with colour-coded risk levels
    - Create `src/features/town-planning/components/ApplicationAuditLog.tsx` — chronological log of all audit events for a specific application
    - _Requirements: 12.4, 9.5_

- [x] 14. Checkpoint — UI components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Platform registration and route wiring
  - [x] 15.1 Register in toolNavRegistry.ts and navigation config
    - Add `'town-planning'` entry to `TOOL_NAV_CONFIGS` in `src/navigation/toolNavRegistry.ts` with sections: Overview (Dashboard, Applications), Workflow (Deadlines, Public Participation, Conditions, Appeals), Intelligence (Reports, Hearings, Municipality Profiles)
    - Add navigation entry in `src/navigation/architexNavigationConfig.ts` under Projects module with key `town_planning`, roles: ['town_planner', 'architect', 'admin', 'client', 'developer', 'firm_admin']
    - Add standalone Toolboxes entry with key `planning_portfolio` for portfolio-level access, roles: ['town_planner', 'admin', 'firm_admin']
    - _Requirements: 15.1, 15.2, 15.3, 15.7_

  - [x] 15.2 Wire routes in App.tsx with lazy loading
    - Add lazy import: `const TownPlanningTracker = lazyWithChunkRetry(() => import('@/features/town-planning/TownPlanningTracker'))`
    - Add route for project-scoped mode: within authenticated project context
    - Add route for standalone/portfolio mode: within Toolboxes context
    - Add to `pages` array with correct roles and group
    - Ensure project switcher works in Project-scoped mode
    - _Requirements: 15.1, 15.2, 15.5, 15.6, 15.8_

  - [x] 15.3 Write unit tests for dual-mode toggle and navigation integration
    - Test that project-scoped mode shows cross-module links (Passport, SpecForge)
    - Test that standalone mode shows practice portfolio without project context
    - Test mode switching preserves application data
    - Test standalone application can be linked to a project
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 16. Final checkpoint — Full module integration complete
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (15 properties total)
- Unit tests validate specific examples and edge cases
- All services use Firestore through the existing Firebase Admin SDK pattern
- All UI components follow the Workspace Template pattern (Hero → Stat Row → Panels) and use CSS token classes exclusively
- The planning-api-router.ts follows the same Express 5 pattern as finance-api-router.ts
- Integration with platform spine (Project Passport, SpecForge, Audit Trail, Action Centre) uses existing service patterns from Pack 2, Pack 3, and Pack 5

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.3"] },
    { "id": 2, "tasks": ["2.2", "2.4", "2.5", "2.6"] },
    { "id": 3, "tasks": ["4.1", "4.6"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.7", "4.8"] },
    { "id": 5, "tasks": ["5.1", "5.3", "5.5"] },
    { "id": 6, "tasks": ["5.2", "5.4", "5.6"] },
    { "id": 7, "tasks": ["7.1", "7.3"] },
    { "id": 8, "tasks": ["7.2", "7.4"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2", "8.3"] },
    { "id": 11, "tasks": ["8.4"] },
    { "id": 12, "tasks": ["10.1", "10.2"] },
    { "id": 13, "tasks": ["11.1", "11.2", "11.3"] },
    { "id": 14, "tasks": ["12.1", "12.2"] },
    { "id": 15, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 16, "tasks": ["15.1", "15.2"] },
    { "id": 17, "tasks": ["15.3"] }
  ]
}
```
