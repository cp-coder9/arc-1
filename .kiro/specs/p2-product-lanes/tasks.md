# Implementation Plan: P2 Product Lanes

## Overview

Implements three P2 product lane modules for the Architex Built Environment OS: FM Bridge (P2.8), Practice Management (P2.9), and Environmental & Heritage Impact (P2.10). Each module follows the bounded feature module pattern at `src/features/{name}/` with pure service layers, Zod validation schemas, Express routers with dependency injection, adapter layers for platform spine integration, and React UI components. A shared `p2-shared/` module provides subscription management, audit trail, and notification adapters used across all three modules.

## Tasks

- [x] 1. Set up shared infrastructure and core types

  - [x] 1.1 Create p2-shared module structure and types
    - Create `src/features/p2-shared/index.ts`, `types.ts`, `schemas.ts`
    - Define shared types: `AuditEvent`, `ActionCentreNotification`, `SubscriptionState`, `SubscriptionTier`, `SubscriptionStatus`, `BillingCycle`
    - Implement Zod schemas for shared types (subscription state, audit event, notification)
    - _Requirements: 7.1, 7.7, 14.6, 20.7_

  - [x] 1.2 Implement subscription engine service
    - Create `src/features/p2-shared/services/subscriptionEngine.ts`
    - Implement `evaluateSubscriptionAccess()` — derives access level from subscription state and current date
    - Implement `transitionSubscription()` — handles activate, upgrade, downgrade, cancel, renew, lapse actions
    - Return `ServiceResult<T>` pattern for all operations
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 14.3, 14.4, 14.5_

  - [x]* 1.3 Write property test for subscription access level derivation
    - **Property 4: Subscription access level derivation**
    - **Validates: Requirements 2.7, 7.3, 7.4, 7.5, 7.6, 14.5**

  - [x] 1.4 Implement notification adapter and audit adapter
    - Create `src/features/p2-shared/services/notificationAdapter.ts`
    - Create `src/features/p2-shared/services/auditAdapter.ts`
    - Notification adapter: `publishNotification()` — surfaces events to Action Centre
    - Audit adapter: `createAuditEvent()` — writes immutable audit records
    - _Requirements: 1.4, 7.7, 20.7_

  - [x]* 1.5 Write property test for audit trail universality
    - **Property 32: Audit trail universality**
    - **Validates: Requirements 1.4, 4.2, 5.5, 7.7, 8.8, 13.8, 15.8, 16.3, 17.6, 19.8, 20.7**

- [x] 2. Implement FM Bridge types, schemas, and handover transition
  - [x] 2.1 Create FM Bridge module structure and types
    - Create `src/features/fm-bridge/index.ts`, `types.ts`, `schemas.ts`
    - Define all FM Bridge domain types: `BuildingPassport`, `BuildingAccessRecord`, `WarrantyItem`, `WarrantyClaim`, `AssetItem`, `DLPRecord`, `DefectRecord`, `PPMScheduleEntry`, `MaintenanceOccurrence`
    - Define all enums/unions: `FMBuildingRole`, `FMSubscriptionTier`, `WarrantyCategory`, `WarrantyStatus`, `WarrantyClaimStage`, `AssetCategory`, `AssetCondition`, `DefectCategory`, `DefectSeverity`, `DefectStage`, `DLPStatus`, `MaintenanceFrequency`, `MaintenancePriority`, `MaintenanceState`
    - Implement Zod schemas for all input validation (warranty creation, asset creation, defect logging, maintenance schedule creation, warranty claim)
    - _Requirements: 1.1, 2.1, 3.1, 3.7, 4.1, 5.3, 6.1_

  - [x] 2.2 Implement handover transition service
    - Create `src/features/fm-bridge/services/handoverTransition.ts`
    - Implement `validateHandoverEligibility()` — checks project status (practical completion) and actor role permissions
    - Implement `executeHandoverTransition()` — creates BuildingPassport, transfers warranties, generates audit events
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x]* 2.3 Write property tests for handover transition
    - **Property 1: Handover data preservation**
    - **Property 2: Handover precondition validation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**

  - [x] 2.4 Implement building passport service
    - Create `src/features/fm-bridge/services/buildingPassport.ts`
    - Implement CRUD operations with role-based access control (building_owner, facility_manager, body_corporate_admin, read_only)
    - Implement access record management: grant access, revoke access
    - Enforce read-only rejection for read_only role users
    - Enforce subscription-based access degradation (lapsed → read-only)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x]* 2.5 Write property test for building access role enforcement
    - **Property 3: Building access role enforcement**
    - **Validates: Requirements 2.2, 2.4**

- [x] 3. Implement FM Bridge warranty and asset services
  - [x] 3.1 Implement warranty register service
    - Create `src/features/fm-bridge/services/warrantyRegister.ts`
    - Implement `evaluateWarrantyStatus()` — derives active/expired/claimed from dates
    - Implement `calculateWarrantyAlerts()` — generates 90-day and 30-day alerts
    - Implement `validateWarrantyClaim()` — rejects claims against expired warranties
    - Implement `transitionWarrantyClaim()` — forward-only state machine (lodged → acknowledged → inspection_scheduled → rectification_in_progress → rectified → closed)
    - Support manual warranty item creation with field validation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [x]* 3.2 Write property tests for warranty register
    - **Property 5: Warranty status evaluation**
    - **Property 6: Warranty claim state machine**
    - **Property 7: Expired warranty claim rejection**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.6, 3.8**

  - [x] 3.3 Implement asset register service
    - Create `src/features/fm-bridge/services/assetRegister.ts`
    - Implement `calculateAssetMetrics()` — totals by category, replacement value, end-of-life, condition, overdue inspection
    - Implement `validateAssetImport()` — CSV row validation with field ranges, produces valid rows + errors by row number
    - Implement `evaluateAssetAlerts()` — end-of-life (24 months), failed condition with warranty cross-reference
    - Enforce role-based modification (building_owner, facility_manager only)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 3.4 Write property tests for asset register
    - **Property 8: Asset metrics calculation**
    - **Property 9: Asset CSV import validation**
    - **Validates: Requirements 4.3, 4.4, 4.6**

- [x] 4. Implement FM Bridge DLP and maintenance services
  - [x] 4.1 Implement DLP manager service
    - Create `src/features/fm-bridge/services/dlpManager.ts`
    - Implement `calculateDLPCountdown()` — remaining days, notification thresholds at 60/30/14/7 days
    - Implement `transitionDefect()` — forward-only state machine (logged → notified → inspection_scheduled → rectification_in_progress → rectified → verified → closed)
    - Implement `generateDLPSummary()` — total defects, closed, outstanding, outstanding by severity
    - Handle post-DLP defect acceptance with "post-DLP" flag
    - Auto-transition DLP to "all_defects_resolved" when all defects closed
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x]* 4.2 Write property tests for DLP manager
    - **Property 10: DLP countdown and summary**
    - **Property 11: Defect state machine**
    - **Validates: Requirements 5.2, 5.4, 5.6, 5.7, 5.8**

  - [x] 4.3 Implement maintenance scheduler service
    - Create `src/features/fm-bridge/services/maintenanceScheduler.ts`
    - Implement `generateScheduledOccurrences()` — produces occurrences for a date range based on frequency (daily/weekly/monthly/quarterly/semi-annually/annually/custom)
    - Implement `transitionMaintenance()` — forward-only state machine (scheduled → in_progress → completed → verified)
    - Implement `calculateMaintenanceMetrics()` — total scheduled, completed vs overdue, annual cost, assets without schedules
    - Flag overdue when not in_progress/completed within 7 days of scheduled date
    - Validate asset reference exists and field ranges
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8_

  - [x]* 4.4 Write property tests for maintenance scheduler
    - **Property 12: Maintenance schedule occurrence generation**
    - **Property 13: Maintenance state machine**
    - **Validates: Requirements 6.2, 6.4, 6.5**

- [x] 5. Checkpoint — FM Bridge services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement Practice Management types, schemas, and enquiry pipeline
  - [x] 6.1 Create Practice Management module structure and types
    - Create `src/features/practice-management/index.ts`, `types.ts`, `schemas.ts`
    - Define all Practice Management domain types: `EnquiryRecord`, `PracticeProject`, `TimesheetEntry`, `ChargeOutRates`, `Disbursement`, `Invoice`, `InvoiceLineItem`, `StaffMember`, `Allocation`, `LeaveRecord`, `StaffComplianceRecord`
    - Define calculated types: `WIPCalculation`, `PipelineMetrics`, `ProfitabilityMetrics`, `StaffUtilisation`, `CapacityForecast`
    - Define enums: `PracticeSubscriptionTier`, `EnquirySource`, `EnquiryStage`, `LossReason`, `PracticeDiscipline`, `ActivityCategory`, `BillingModel`, `TimesheetStatus`, `LeaveType`, `RegistrationBody`
    - Implement Zod schemas for all input validation (enquiry creation, timesheet entry, invoice config, allocation, compliance record)
    - _Requirements: 8.1, 9.1, 10.1, 12.2, 13.1_

  - [x] 6.2 Implement enquiry pipeline service
    - Create `src/features/practice-management/services/enquiryPipeline.ts`
    - Implement `transitionEnquiry()` — permitted transitions only, require loss reason for "lost" terminal state
    - Implement `calculatePipelineMetrics()` — total by stage, fee value, conversion rate, avg time per stage, win/loss ratio
    - Implement `evaluateStaleEnquiries()` — flag enquiries unchanged for > threshold days
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x]* 6.3 Write property tests for enquiry pipeline
    - **Property 14: Enquiry pipeline state machine**
    - **Property 15: Pipeline metrics calculation**
    - **Validates: Requirements 8.2, 8.3, 8.4**

- [x] 7. Implement Practice Management WIP and timesheet services
  - [x] 7.1 Implement WIP tracker service
    - Create `src/features/practice-management/services/wipTracker.ts`
    - Implement `calculateProjectWIP()` — (billable_hours × rate) + unbilled_disbursements − invoiced_amounts
    - Implement `calculateFirmWIP()` — aggregate across all active projects
    - Implement `evaluateWIPAlerts()` — 80% budget warning, 100% budget critical alert
    - Implement `ageWIP()` — ageing buckets: 0–30, 31–60, 61–90, 90+ days
    - Support per-discipline WIP within multi-discipline projects
    - Handle projects without budgets (no threshold alerts)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x]* 7.2 Write property test for WIP calculation
    - **Property 16: WIP calculation correctness**
    - **Validates: Requirements 9.1, 9.2, 9.4, 9.5, 9.8**

  - [x] 7.3 Implement timesheet engine service
    - Create `src/features/practice-management/services/timesheetEngine.ts`
    - Implement `validateTimesheetEntry()` — enforce daily max 24h, 0.25 increments, date not in future, required fields
    - Implement `calculateTimesheetMetrics()` — total hours week/month, billable %, utilisation rate
    - Implement `submitWeekForApproval()` — locks entries, routes to approver
    - Enforce immutability of approved/invoiced entries (reject edits)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.9, 10.10_

  - [x]* 7.4 Write property tests for timesheet engine
    - **Property 17: Timesheet daily maximum invariant**
    - **Property 18: Timesheet entry validation**
    - **Property 20: Approved/invoiced entry immutability**
    - **Validates: Requirements 10.1, 10.2, 10.9**

- [x] 8. Implement Practice Management billing, profitability, and capacity services
  - [x] 8.1 Implement billing bridge service
    - Create `src/features/practice-management/services/billingBridge.ts`
    - Implement `compileDraftInvoice()` — aggregate approved unbilled entries + disbursements, calculate subtotal, VAT at 15%, total
    - Support three billing models: hourly, fixed_fee, percentage_of_construction
    - Implement `approveInvoice()` — marks entries as invoiced, reduces WIP, creates audit record
    - Generate line items grouped by activity category or staff member
    - _Requirements: 10.6, 10.7, 10.8_

  - [x]* 8.2 Write property test for invoice compilation
    - **Property 19: Invoice compilation correctness**
    - **Validates: Requirements 10.6, 10.8**

  - [x] 8.3 Implement profitability dashboard service
    - Create `src/features/practice-management/services/profitabilityDashboard.ts`
    - Implement `calculateProjectProfitability()` — gross margin, margin %, effective hourly rate, budget burn rate
    - Implement `calculateFirmProfitability()` — firm-wide summary, top/bottom 5 projects by margin
    - Support configurable underperformance threshold (default 20%)
    - Support internal cost rate per staff member (separate from client charge-out rate)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x]* 8.4 Write property test for profitability metrics
    - **Property 21: Profitability metrics calculation**
    - **Validates: Requirements 11.1, 11.3**

  - [x] 8.5 Implement capacity planner service
    - Create `src/features/practice-management/services/capacityPlanner.ts`
    - Implement `calculateStaffUtilisation()` — allocated / (available − leave) × 100
    - Implement `forecastCapacity()` — 12-week forward forecast weighted by pipeline conversion probability
    - Implement `evaluateCapacityAlerts()` — flag over-allocation and firm >85% utilisation
    - Support leave recording (reduces available hours)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x]* 8.6 Write property test for capacity utilisation
    - **Property 22: Capacity utilisation calculation**
    - **Validates: Requirements 12.1, 12.4, 12.6, 12.7**

  - [x] 8.7 Implement staff compliance tracker service
    - Create `src/features/practice-management/services/staffCompliance.ts`
    - Implement `evaluateComplianceStatus()` — derives valid/expiring/lapsed from dates per staff member
    - Implement `calculateFirmCompliance()` — compliance score = (valid PI AND current reg) / total × 100
    - Implement `generateComplianceAlerts()` — PI 60-day warning, 30-day urgent, expired critical; registration 90-day warning
    - Integrate with Trust & Verification module data exposure
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9_

  - [x]* 8.8 Write property test for staff compliance alerts
    - **Property 23: Staff compliance alert thresholds**
    - **Validates: Requirements 13.2, 13.3, 13.4, 13.5, 13.6**

- [x] 9. Checkpoint — Practice Management services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Environmental & Heritage types, schemas, and EIA checker
  - [x] 10.1 Create Environmental & Heritage module structure and types
    - Create `src/features/environmental-heritage/index.ts`, `types.ts`, `schemas.ts`
    - Define all Environmental domain types: `SelectedActivity`, `GeographicContext`, `ScreeningReport`, `EAApplication`, `HeritageAssessment`, `RODCondition`, `EMPrRecord`, `ECOAudit`, `CorrectiveAction`, `EnvironmentalIncident`
    - Define enums: `ListingNotice`, `AssessmentType`, `EAStageBasic`, `EAStageScoping`, `EAStage`, `HeritageStage`, `ConditionComplianceState`, `ConditionCategory`, `VerificationMethod`, `ECOAuditRating`, `CorrectiveActionState`, `ConstructionPhase`, `IncidentType`, `AuditFrequency`, `Section38Trigger`
    - Implement Zod schemas for all input validation (screening, EA application, heritage assessment, ROD condition, EMPr record, ECO audit, corrective action, environmental incident)
    - _Requirements: 15.1, 16.1, 17.1, 18.1, 19.1, 19.3_

  - [x] 10.2 Implement EIA checker service
    - Create `src/features/environmental-heritage/services/eiaChecker.ts`
    - Implement `determineAssessmentType()` — LN2 → scoping_and_eir, LN1/LN3 only → basic_assessment, none → none; derive competent authority
    - Implement `generateScreeningReport()` — assemble report with project context, activities, geographic context, assessment type, next steps
    - Support geographic context refinement (province required, LN3 zone applicability)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x]* 10.3 Write property test for EIA assessment determination
    - **Property 24: EIA assessment type determination**
    - **Validates: Requirements 15.2, 15.4**

- [x] 11. Implement Environmental & Heritage EA tracker and heritage workflow
  - [x] 11.1 Implement EA tracker service
    - Create `src/features/environmental-heritage/services/eaTracker.ts`
    - Implement `getPermittedTransitions()` — returns valid next stages based on assessment type and current stage
    - Implement `transitionEAApplication()` — sequential stage transitions, decision branching (ea_granted/ea_refused), appeal path
    - Implement `calculateRegulatoryTimeframes()` — elapsed days vs prescribed periods (BA: 107 days, Scoping: 43 days, EIR: 107 days), 14-day warning
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5, 16.6, 16.7, 16.8_

  - [x]* 11.2 Write property tests for EA tracker
    - **Property 25: EA application state machine**
    - **Property 26: Regulatory timeframe calculation**
    - **Validates: Requirements 16.2, 16.4, 16.5**

  - [x] 11.3 Implement heritage workflow service
    - Create `src/features/environmental-heritage/services/heritageWorkflow.ts`
    - Implement `transitionHeritageAssessment()` — valid transitions: notification_submitted → interim_comment_received → (assessment_required path OR no_further_action_required shortcut)
    - Record HIA practitioner details when "assessment_required"
    - Update Project Passport with heritage compliance status on determination
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8_

  - [x]* 11.4 Write property test for heritage workflow state machine
    - **Property 27: Heritage workflow state machine**
    - **Validates: Requirements 17.2**

- [x] 12. Implement Environmental & Heritage ROD register and EMPr compliance
  - [x] 12.1 Implement ROD register service
    - Create `src/features/environmental-heritage/services/rodRegister.ts`
    - Implement `transitionCondition()` — forward-only state machine (outstanding → in_progress → evidence_submitted → verified_compliant)
    - Implement `calculateConditionCompliance()` — total conditions, by category, verified count, outstanding, overdue, compliance %
    - Implement `evaluateConditionAlerts()` — 30-day deadline warning, overdue critical alert
    - Support evidence recording (document refs, inspection records, monitoring data)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8_

  - [x]* 12.2 Write property tests for ROD register
    - **Property 28: ROD condition compliance state machine and alerts**
    - **Property 29: ROD compliance summary calculation**
    - **Validates: Requirements 18.2, 18.3, 18.4, 18.5**

  - [x] 12.3 Implement EMPr compliance service
    - Create `src/features/environmental-heritage/services/emprCompliance.ts`
    - Implement `generateAuditSchedule()` — produce scheduled audit dates based on frequency within a date range
    - Implement `transitionCorrectiveAction()` — forward-only (issued → in_progress → completed → verified_closed)
    - Implement `calculateEMPrComplianceStatus()` — derives overall status from most recent ECO audit rating
    - Support environmental incident logging (type, description, location, evidence, remedial action)
    - Flag overdue corrective actions
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 19.9_

  - [x]* 12.4 Write property test for corrective action state machine
    - **Property 30: Corrective action state machine**
    - **Validates: Requirements 19.4, 19.5**

- [x] 13. Checkpoint — Environmental & Heritage services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement FM Bridge adapters and API router
  - [x] 14.1 Implement FM Bridge adapters
    - Create `src/features/fm-bridge/adapters/projectPassportAdapter.ts` — reads construction project data for handover
    - Create `src/features/fm-bridge/adapters/auditTrailAdapter.ts` — writes to building-scoped audit trail
    - Create `src/features/fm-bridge/adapters/actionCentreAdapter.ts` — surfaces warranty alerts, DLP notifications, maintenance reminders, subscription prompts
    - All adapters use graceful degradation (fail silently with logged warnings if spine unavailable)
    - _Requirements: 1.2, 1.4, 2.6, 3.2, 3.3, 5.2, 5.5, 6.3, 7.7_

  - [x] 14.2 Implement FM Bridge API router
    - Create `src/features/fm-bridge/router.ts` with dependency injection pattern
    - Wire endpoints: POST /handover, GET/PUT /buildings/:id/passport, GET/POST /buildings/:id/warranties, POST /buildings/:id/warranties/:wId/claims, GET/POST/PUT /buildings/:id/assets, POST /buildings/:id/assets/import, GET/POST /buildings/:id/dlp, POST /buildings/:id/dlp/:dlpId/defects, GET/POST /buildings/:id/maintenance, POST /buildings/:id/subscription
    - Apply Zod validation at API boundary, role-based auth middleware, subscription tier checks
    - Return structured error responses (ValidationError, AuthorizationError, TransitionError, SubscriptionError, BusinessRuleViolation)
    - _Requirements: 1.5, 1.6, 2.4, 3.8, 4.7, 7.1, 7.2_

- [x] 15. Implement Practice Management adapters and API router
  - [x] 15.1 Implement Practice Management adapters
    - Create `src/features/practice-management/adapters/auditTrailAdapter.ts` — firm-scoped audit trail
    - Create `src/features/practice-management/adapters/actionCentreAdapter.ts` — stale enquiry, WIP budget, capacity, compliance alerts
    - Create `src/features/practice-management/adapters/projectLinkAdapter.ts` — optional link to construction projects
    - _Requirements: 8.7, 8.8, 9.4, 9.5, 12.5, 13.2, 13.3, 13.4, 14.8_

  - [x] 15.2 Implement Practice Management API router
    - Create `src/features/practice-management/router.ts` with dependency injection pattern
    - Wire endpoints: GET/POST/PUT /enquiries, GET /wip, GET /wip/:projectId, GET/POST /timesheets, POST /timesheets/submit, POST /timesheets/approve, POST /billing/generate, POST /billing/approve, GET /profitability, GET /capacity, POST /capacity/allocations, GET/POST/PUT /staff/compliance, POST /subscription
    - Enforce firm-level data isolation, FirmRole checks (firm_admin, owner for mutations)
    - Enforce subscription tier feature gating (Essentials vs Professional)
    - _Requirements: 14.1, 14.2, 14.3, 14.9_

- [x] 16. Implement Environmental & Heritage adapters and API router
  - [x] 16.1 Implement Environmental & Heritage adapters
    - Create `src/features/environmental-heritage/adapters/projectPassportAdapter.ts` — updates project environmental/heritage status
    - Create `src/features/environmental-heritage/adapters/municipalComplianceAdapter.ts` — adds EA and Heritage line items to readiness checklist
    - Create `src/features/environmental-heritage/adapters/documentsAdapter.ts` — registers environmental documents with metadata
    - Create `src/features/environmental-heritage/adapters/siteExecutionAdapter.ts` — environmental incident integration with daily log
    - Create `src/features/environmental-heritage/adapters/riskEngineAdapter.ts` — emits risk events (EA overdue, heritage pending, EMPr non-conformance, ROD overdue)
    - Create `src/features/environmental-heritage/adapters/auditTrailAdapter.ts` — project-scoped audit trail
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7_

  - [x]* 16.2 Write property test for construction commencement blocking
    - **Property 31: Construction commencement blocking**
    - **Validates: Requirements 20.3**

  - [x] 16.3 Implement Environmental & Heritage API router
    - Create `src/features/environmental-heritage/router.ts` with dependency injection pattern
    - Wire endpoints: POST /screenings, GET/POST /ea-applications, PUT /ea-applications/:id/transition, GET/POST /heritage, PUT /heritage/:id/transition, GET/POST /rod-conditions, PUT /rod-conditions/:id/transition, GET/POST /empr, POST /empr/:id/audits, POST /empr/:id/incidents
    - Apply Zod validation, role-based auth (town_planner, developer, architect, bep, energy_professional, platform_admin), structured error responses
    - Display Disclaimer_Banner metadata in all responses
    - _Requirements: 15.6, 15.7, 16.7, 16.8, 17.7, 18.8, 19.9, 20.8_

- [x] 17. Checkpoint — All routers and adapters
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Implement FM Bridge UI components
  - [x] 18.1 Implement FMBridgeDashboard and BuildingPassportView components
    - Create `src/features/fm-bridge/components/FMBridgeDashboard.tsx` — main entry with tab navigation (Passport | Warranties | Assets | DLP | Maintenance | Subscription)
    - Create `src/features/fm-bridge/components/BuildingPassportView.tsx` — displays building overview sections, compliance record, installed systems, key contacts, document archive
    - Accept `user: UserProfile` and `buildingId: string` props
    - Derive permissions from user role + building access record
    - Use shadcn/ui Card, Tabs, Badge components; dark theme; lucide-react icons
    - _Requirements: 2.1, 2.2, 2.6_

  - [x] 18.2 Implement WarrantyPanel and AssetPanel components
    - Create `src/features/fm-bridge/components/WarrantyPanel.tsx` — warranty register list with status badges, expiry countdown, claim workflow UI, add warranty form
    - Create `src/features/fm-bridge/components/AssetPanel.tsx` — asset register table with filtering, metrics summary cards, CSV import UI, condition update
    - _Requirements: 3.1, 3.5, 3.7, 4.1, 4.3, 4.6_

  - [x] 18.3 Implement DLPPanel and MaintenancePanel components
    - Create `src/features/fm-bridge/components/DLPPanel.tsx` — DLP countdown display, defect logging form, defect list with stage progression, summary report
    - Create `src/features/fm-bridge/components/MaintenancePanel.tsx` — PPM calendar view (current month, next month, 12-month forward), task creation form, maintenance history per asset, overdue indicators colour-coded by priority
    - _Requirements: 5.2, 5.3, 6.1, 6.2, 6.6_

  - [x] 18.4 Implement SubscriptionPanel component
    - Create `src/features/fm-bridge/components/SubscriptionPanel.tsx` — subscription status, tier selection, upgrade/downgrade/cancel actions, trial countdown, renewal prompt
    - _Requirements: 7.1, 7.2, 7.5_

- [x] 19. Implement Practice Management UI components
  - [x] 19.1 Implement PracticeManagementHub and PipelineView components
    - Create `src/features/practice-management/components/PracticeManagementHub.tsx` — main entry with tab navigation (Pipeline | WIP | Timesheets | Billing | Profitability | Capacity | Compliance)
    - Create `src/features/practice-management/components/PipelineView.tsx` — kanban/list pipeline view with stage columns, drag-and-drop transitions, filtering/sorting, pipeline metrics cards
    - _Requirements: 8.1, 8.4, 8.6_

  - [x] 19.2 Implement WIPDashboard and TimesheetView components
    - Create `src/features/practice-management/components/WIPDashboard.tsx` — firm-wide WIP summary, WIP by project (sorted descending), WIP by discipline, ageing buckets, budget threshold indicators
    - Create `src/features/practice-management/components/TimesheetView.tsx` — weekly grid view, daily totals, billable/non-billable split, submit for approval action, edit restrictions on approved entries
    - _Requirements: 9.3, 10.3, 10.4, 10.10_

  - [x] 19.3 Implement BillingView and ProfitabilityView components
    - Create `src/features/practice-management/components/BillingView.tsx` — invoice generation UI, draft preview, line items by category/staff, VAT calc, approve action
    - Create `src/features/practice-management/components/ProfitabilityView.tsx` — KPI cards (margin, effective hourly rate, burn rate), firm summary, underperforming flags, date range filtering
    - _Requirements: 10.6, 11.1, 11.2, 11.6_

  - [x] 19.4 Implement CapacityView and ComplianceView components
    - Create `src/features/practice-management/components/CapacityView.tsx` — staff allocation table, utilisation %, 12-week forecast chart, over-allocation warnings, leave recording
    - Create `src/features/practice-management/components/ComplianceView.tsx` — staff compliance list, PI/registration status badges, firm compliance score, alert indicators, advisory disclaimer
    - _Requirements: 12.1, 12.3, 12.4, 13.1, 13.6, 13.9_

- [x] 20. Implement Environmental & Heritage UI components
  - [x] 20.1 Implement EnvironmentalHub and EIACheckerView components
    - Create `src/features/environmental-heritage/components/EnvironmentalHub.tsx` — main entry with tab navigation (EIA Screening | EA Tracker | Heritage | ROD Register | EMPr)
    - Create `src/features/environmental-heritage/components/EIACheckerView.tsx` — structured checklist by listing notice, geographic context inputs, assessment determination display, screening report generation
    - Create `src/features/environmental-heritage/components/DisclaimerBanner.tsx` — reusable advisory-only disclaimer component
    - _Requirements: 15.1, 15.3, 15.6_

  - [x] 20.2 Implement EATrackerView and HeritageView components
    - Create `src/features/environmental-heritage/components/EATrackerView.tsx` — application list, stage progression timeline, regulatory timeframe display with countdown, role-gated create/advance actions
    - Create `src/features/environmental-heritage/components/HeritageView.tsx` — Section 38 workflow stages, HIA practitioner details form, heritage authority determination display, permit tracking
    - _Requirements: 16.1, 16.2, 16.4, 17.1, 17.2, 17.3_

  - [~] 20.3 Implement RODRegisterView and EMPrView components
    - Create `src/features/environmental-heritage/components/RODRegisterView.tsx` — conditions list with compliance state badges, evidence submission UI, compliance summary, deadline countdown, overdue indicators
    - Create `src/features/environmental-heritage/components/EMPrView.tsx` — EMPr record management, ECO audit recording form, corrective action tracker, environmental incident logging, compliance history dashboard with trend chart
    - _Requirements: 18.1, 18.5, 19.1, 19.3, 19.6, 19.7_

- [ ] 21. Wire modules into application shell and navigation
  - [~] 21.1 Register P2 module routes and navigation entries
    - Wire FM Bridge, Practice Management, and Environmental API routers into `src/lib/api-router.ts` (lazy-loaded)
    - Add navigation entries in `src/navigation/architexNavigationConfig.ts` for all three modules with role-based visibility
    - Add lazy-loaded route entries in `App.tsx` for FM Bridge (building_owner, facility_manager), Practice Management (firm_admin, owner, staff, coordinator), Environmental (town_planner, developer, architect, bep, energy_professional)
    - Feature flags control module visibility based on subscription status
    - _Requirements: 2.2, 14.1, 14.9, 16.8, 20.8_

  - [~] 21.2 Create AGENTS.md files for each module
    - Create `src/features/fm-bridge/AGENTS.md` — DOX contract defining purpose, ownership, local contracts, verification
    - Create `src/features/practice-management/AGENTS.md` — DOX contract
    - Create `src/features/environmental-heritage/AGENTS.md` — DOX contract
    - Create `src/features/p2-shared/AGENTS.md` — DOX contract
    - _Requirements: N/A (project convention)_

- [~] 22. Final checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- All service functions are pure (no Firestore imports) — persistence handled at router/adapter layer
- Adapters use graceful degradation — modules continue operating if platform spine is unavailable
- All modules enforce the "advisory only" posture on compliance, environmental, and legal features
- TypeScript is the implementation language throughout (matching existing project stack)


## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4", "2.1", "6.1", "10.1"] },
    { "id": 2, "tasks": ["1.3", "1.5", "2.2", "2.4", "6.2", "10.2"] },
    { "id": 3, "tasks": ["2.3", "2.5", "3.1", "3.3", "6.3", "7.1", "7.3", "10.3", "11.1", "11.3"] },
    { "id": 4, "tasks": ["3.2", "3.4", "4.1", "4.3", "7.2", "7.4", "8.1", "8.3", "8.5", "8.7", "11.2", "11.4", "12.1", "12.3"] },
    { "id": 5, "tasks": ["4.2", "4.4", "8.2", "8.4", "8.6", "8.8", "12.2", "12.4"] },
    { "id": 6, "tasks": ["14.1", "15.1", "16.1"] },
    { "id": 7, "tasks": ["14.2", "15.2", "16.2", "16.3"] },
    { "id": 8, "tasks": ["18.1", "18.2", "18.3", "18.4", "19.1", "19.2", "19.3", "19.4", "20.1", "20.2", "20.3"] },
    { "id": 9, "tasks": ["21.1", "21.2"] }
  ]
}
```
