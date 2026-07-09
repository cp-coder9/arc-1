# Implementation Plan: QA/QC & Inspection Test Plans

## Overview

Implements the QA/QC & Inspection Test Plans (ITP) module as a sub-tool within Module 7 (Site Execution). The implementation progresses from types and validation schemas, through the service layer and adapters, to API endpoints, UI components, and finally integration wiring. TypeScript throughout, with property-based tests using fast-check via Vitest.

## Tasks

- [x] 1. Define types and validation schemas
  - [x] 1.1 Add ITP TypeScript interfaces to `src/types.ts`
    - Add all ITP-related types: `ITPStatus`, `InspectionType`, `InspectionItemStatus`, `InspectorRole`, `ConstructionStage`, `ITP`, `InspectionItem`, `SignOffRecord`, `SelfInspectionRecord`, `WitnessAttendanceRecord`, `ConditionalFollowUp`
    - Add material testing types: `MaterialType`, `ThresholdDirection`, `MaterialTestStatus`, `SANSTestCategory`, `TestingSchedule`, `ApprovedLaboratory`, `MaterialTest`, `LabResult`
    - Add support types: `InspectionRequest`, `ITPAuditAction`, `ITPAuditRecord`, `QualitySummary`, `ComplianceScore`
    - Add `'inspection_test_plan'` to `ProjectRecordType` union
    - Add `'site'` to `WorkflowEvent.sourceModule` union if not already present
    - _Requirements: 1.1, 2.1, 5.1, 5.2, 6.1, 10.1, 8.5_

  - [x] 1.2 Add Zod validation schemas to `src/lib/schemas.ts`
    - Add `createITPSchema`, `createInspectionItemSchema`, `specificationReferenceSchema`
    - Add `holdPointRequestSchema`, `inspectionSignOffSchema`
    - Add `createTestingScheduleSchema`, `updateTestingScheduleSchema`, `recordLabResultSchema`
    - Add `approvedLaboratorySchema`, `witnessPointOutcomeSchema`
    - Enforce all field length constraints, enum validations, and format checks
    - _Requirements: 1.1, 2.1, 2.5, 2.8, 3.2, 5.1, 6.1, 6.8_

- [x] 2. Implement core ITP service
  - [x] 2.1 Create `src/services/itpService.ts` with ITP CRUD operations
    - Implement `createITP()` — validate input, persist to Firestore `projects/{pid}/itps`, set status='draft', revisionNumber=1, isDeleted=false
    - Implement `getITP()`, `getITPs()` with filter support (by status, construction stage)
    - Implement `updateITP()` — enforce draft-only modification
    - Implement `deleteITP()` — soft-delete draft only, reject approved/in_progress
    - Implement `approveITP()` — require engineer/architect sign-off, transition draft→approved
    - Implement `createRevision()` — copy items, increment revision, supersede original
    - Enforce single non-superseded revision per stage per project constraint
    - Write audit records for all state changes via auditTrailService
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 10.1_

  - [x] 2.2 Write property tests for ITP creation (Property 1)
    - **Property 1: ITP creation produces valid draft record**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 2.3 Write property tests for draft-only modification (Property 2)
    - **Property 2: Modification operations restricted to draft status**
    - **Validates: Requirements 1.3, 1.6, 1.10, 1.11**

  - [x] 2.4 Write property tests for revision creation (Property 3)
    - **Property 3: Revision creates incremented copy and supersedes original**
    - **Validates: Requirements 1.7, 1.9**

- [x] 3. Implement inspection item management
  - [x] 3.1 Add inspection item operations to `src/services/itpService.ts`
    - Implement `addInspectionItem()` — validate all fields via Zod, enforce 200-item max, assign sequence number
    - Implement `updateInspectionItem()` — validate draft-only, validate input
    - Implement `removeInspectionItem()` — draft-only, re-sequence remaining items
    - Implement `reorderInspectionItems()` — validate new order covers all items, re-assign contiguous sequence numbers starting at 1
    - Validate specificationReference format (SANS/NHBRC/SpecForge pattern)
    - Validate linkedMaterialTestIds max 20 entries
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 1.4_

  - [x] 3.2 Write property tests for inspection item validation (Property 4)
    - **Property 4: Inspection item validation enforces field constraints**
    - **Validates: Requirements 2.1, 2.5, 2.6, 2.8**

  - [x] 3.3 Write property tests for reorder operation (Property 5)
    - **Property 5: Reorder maintains contiguous sequence starting at 1**
    - **Validates: Requirements 2.7**

- [x] 4. Implement hold point execution logic
  - [x] 4.1 Add hold point operations to `src/services/itpService.ts`
    - Implement `requestHoldPointInspection()` — validate ≥24h future date, create inspection request record, trigger Action Centre notification
    - Implement `signOffInspection()` — record SignOffRecord, handle pass/fail/conditional outcomes
    - On pass: update item to 'passed', unblock subsequent items
    - On fail: update item to 'failed', trigger NCR creation with severity rules
    - On conditional_pass: record conditions text, unblock subsequent, create follow-up action with deadline
    - Implement hold point blocking logic — items after pending hold point cannot transition to 'in_progress'
    - Implement conditional expiration — when deadline passes without resolution, transition to 'failed' and re-block
    - Implement hold point breach detection — flag when work proceeds past unsigned hold point, create critical NCR
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 4.2 Write property tests for hold point blocking (Property 6)
    - **Property 6: Hold point blocks subsequent items until sign-off**
    - **Validates: Requirements 2.2, 3.4, 3.9**

  - [x] 4.3 Write property tests for inspection request date validation (Property 7)
    - **Property 7: Hold point inspection request date must be ≥ 24 hours future**
    - **Validates: Requirements 3.2**

  - [x] 4.4 Write property tests for conditional expiration (Property 9)
    - **Property 9: Conditional pass expiration transitions item to failed**
    - **Validates: Requirements 3.7, 3.8**

- [x] 5. Implement witness point execution logic
  - [x] 5.1 Add witness point operations to `src/services/itpService.ts`
    - Implement `recordWitnessPointOutcome()` — handle inspector-witnessed vs contractor-recorded scenarios
    - Implement `acknowledgeWitnessNotification()` — record acknowledgement or no_response
    - On fail (either mode): trigger NCR with severity based on spec category (structural/safety → 'high', else 'medium')
    - Record complete attendance record: notification timestamp, response, attendance, final sign-off identity
    - Implement 24-hour pre-notification trigger logic for Action Centre
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 6. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement material testing and lab results
  - [x] 7.1 Add material testing operations to `src/services/itpService.ts`
    - Implement `createTestingSchedule()` — validate input, persist to `projects/{pid}/testing_schedules`
    - Implement `updateTestingSchedule()` — apply changes only to future tests
    - Implement `createMaterialTest()` — calculate `dateTestDue` from `dateSampled + expectedTurnaroundDays`, persist to `projects/{pid}/material_tests`
    - Implement `updateMaterialTestStatus()` — enforce state machine transitions
    - Implement overdue test detection — tests not completed by due date + 1 day at 08:00
    - Implement testing compliance gap detection — `floor(cumQty / freqQty) - completedTests >= 1`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.7_

  - [x] 7.2 Add lab result recording to `src/services/itpService.ts`
    - Implement `recordLabResult()` — validate unit matches schedule, validate lab accreditation, reject duplicates
    - Implement threshold evaluation: gte direction → pass if value ≥ threshold; lte → pass if value ≤ threshold
    - On pass: update test to 'passed'
    - On fail: update test to 'failed', create NCR with material-based severity
    - Implement 7-day concrete failure detection — flag matching 28-day test as isPriority
    - Recalculate material pass rate on each result/status change
    - Support file attachment via existing Vercel Blob upload pattern (PDF/JPEG/PNG, max 25MB)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 5.5_

  - [x] 7.3 Write property tests for due date calculation (Property 10)
    - **Property 10: Material test due date calculation**
    - **Validates: Requirements 5.3**

  - [x] 7.4 Write property tests for lab accreditation validation (Property 11)
    - **Property 11: Lab accreditation validation**
    - **Validates: Requirements 5.5**

  - [x] 7.5 Write property tests for compliance gap detection (Property 12)
    - **Property 12: Testing compliance gap detection**
    - **Validates: Requirements 5.6**

  - [x] 7.6 Write property tests for schedule modification scope (Property 13)
    - **Property 13: Schedule modifications only affect future tests**
    - **Validates: Requirements 5.7**

  - [x] 7.7 Write property tests for threshold evaluation (Property 14)
    - **Property 14: Lab result threshold evaluation**
    - **Validates: Requirements 6.2, 6.3**

  - [x] 7.8 Write property tests for 7-day concrete failure flagging (Property 15)
    - **Property 15: 7-day concrete failure flags corresponding 28-day test**
    - **Validates: Requirements 6.4**

  - [x] 7.9 Write property tests for unit mismatch rejection (Property 16)
    - **Property 16: Lab result unit must match testing schedule unit**
    - **Validates: Requirements 6.8**

- [x] 8. Implement NCR integration
  - [x] 8.1 Add NCR integration logic to `src/services/itpService.ts`
    - Implement NCR severity determination: hold point (structural/fire_safety/geotechnical → critical, else high), material test (concrete/steel → critical, soil → high, aggregate/bituminous → medium), hold point breach → always critical, witness point (structural/safety → high, else medium)
    - Implement `handleNCRClosed()` — when linked NCR reaches 'verified_closed', update originating item to 'ncr_resolved'
    - Implement NCR blocking — while linked NCR open, prevent item from being marked 'passed'
    - Store bidirectional references: item stores ncrId, NCR metadata stores source item/test ID
    - Expose open NCR count per ITP for Project Passport risk indicators
    - Handle NCR creation failure gracefully: item still transitions, audit logged, engineer notified
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 8.2 Write property tests for NCR severity determination (Property 8)
    - **Property 8: NCR severity determination follows specification and material rules**
    - **Validates: Requirements 3.6, 4.6, 7.2, 7.3**

  - [x] 8.3 Write property tests for NCR lifecycle constraints (Property 22)
    - **Property 22: NCR lifecycle constrains item state**
    - **Validates: Requirements 7.4, 7.5**

- [x] 9. Implement compliance score and passport integration
  - [x] 9.1 Add compliance score calculation and passport adapter
    - Implement `calculateComplianceScore()` — (passed inspections + passed tests) / (total required inspections + total required tests), 1 decimal place, 100% if denominator is 0
    - Implement `getQualitySummary()` — total ITPs, by status, compliance score, open breaches, pending tests, open NCRs
    - Create `src/services/itpPassportAdapter.ts` — `buildITPPassportData()`, `emitComplianceRiskSignal()`, `mapITPToProjectRecord()`
    - Emit ProjectRiskSignal when score crosses below 80% (previously ≥80%, now <80%)
    - Map ITP statuses to ProjectRecord: draft→draft, approved→approved, in_progress→issued, completed→approved
    - Handle data unavailability: return null score with unavailable flag, no risk signal
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 9.2 Write property tests for compliance score calculation (Property 17)
    - **Property 17: Compliance score calculation**
    - **Validates: Requirements 8.2**

  - [x] 9.3 Write property tests for threshold crossing signal (Property 18)
    - **Property 18: Compliance score threshold crossing emits risk signal**
    - **Validates: Requirements 8.3**

  - [x] 9.4 Write property tests for ITP completion (Property 19)
    - **Property 19: ITP completion when all items in terminal pass state**
    - **Validates: Requirements 8.4**

  - [x] 9.5 Write property tests for ProjectRecord mapping (Property 20)
    - **Property 20: ITP-to-ProjectRecord status mapping**
    - **Validates: Requirements 8.5**

- [x] 10. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement permission enforcement and audit trail
  - [x] 11.1 Add permission enforcement to ITP service
    - Implement permission check helper using Permission_Service: validate (role + active project membership)
    - Enforce `itp:create` → engineer, architect
    - Enforce `itp:approve` → engineer, architect
    - Enforce `itp:read` → all project members
    - Enforce `inspection:request` → site_manager, contractor, subcontractor, quantity_surveyor
    - Enforce `inspection:sign_off` → engineer, architect
    - Enforce `test:record_result` → engineer, site_manager
    - Return permission denied error with missing permission identifier on rejection
    - Return not-a-member error when user has no active project membership
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [x] 11.2 Add audit trail integration
    - Write immutable audit records to `projects/{pid}/itp_audit` via auditTrailService
    - Record: entityType, entityId, action, actorUserId, timestamp, previousState, newState, metadata (≤10KB)
    - Record professional registration number on inspector sign-offs (ECSA/SACAP/NHBRC or 'not_available')
    - Implement `generateComplianceReport()` — assemble all items, sign-offs, test results, NCRs, pass/fail/pending counts
    - Retain all records indefinitely, no purge mechanism
    - Retain superseded revision audit trails with bidirectional links
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 11.3 Write property tests for permission matrix (Property 21)
    - **Property 21: Permission matrix enforcement**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8**

- [x] 12. Implement adapter services
  - [x] 12.1 Create `src/services/itpActionCentreAdapter.ts`
    - Implement `createHoldPointRequestEvent()` — priority high, category inspection_required
    - Implement `createWitnessNotificationEvent()` — priority medium, category witness_notification
    - Implement `createTestOverdueEvent()` — priority high, category test_overdue, deduplicate
    - Implement `createHoldPointBreachEvent()` — priority critical, category hold_point_breach
    - Implement `createTestFailureEvent()` — priority high, category test_failed
    - Implement `createConditionalFollowUpEvent()` — for conditional pass deadline tracking
    - Implement `resolveActionItem()` — mark resolved when trigger condition addressed
    - Map all events using existing `inboxEventAdapter` pattern with sourceModule='site'
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_

  - [x] 12.2 Create `src/services/itpSpecForgeAdapter.ts`
    - Implement `linkInspectionToSpecItem()` — create bidirectional reference on both entities
    - Implement `unlinkInspectionFromSpecItem()` — remove both references, create audit record
    - Implement `getInspectionVerificationStatus()` — all passed→'passed', any failed→'failed', else→'pending'
    - Implement `suggestSpecItemLinks()` — query SpecForge for matching items by material/discipline, return max 20
    - Implement `handleSpecItemChanged()` — transition linked items to 'review_required', notify engineer
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x] 12.3 Write property tests for SpecForge link integrity (Property 23)
    - **Property 23: SpecForge bidirectional link integrity**
    - **Validates: Requirements 12.1, 12.6**

  - [x] 12.4 Write property tests for spec item change propagation (Property 24)
    - **Property 24: Spec item change propagates to linked inspection items**
    - **Validates: Requirements 12.2, 12.5**

  - [x] 12.5 Write property tests for aggregated verification status (Property 25)
    - **Property 25: Aggregated verification status logic**
    - **Validates: Requirements 12.3**

- [x] 13. Implement API endpoints
  - [x] 13.1 Add ITP CRUD endpoints to `src/lib/api-router.ts`
    - POST `/api/projects/:projectId/itps` — create ITP
    - GET `/api/projects/:projectId/itps` — list ITPs with filters
    - GET `/api/projects/:projectId/itps/:itpId` — get single ITP with items
    - PUT `/api/projects/:projectId/itps/:itpId` — update ITP (draft only)
    - DELETE `/api/projects/:projectId/itps/:itpId` — soft-delete (draft only)
    - POST `/api/projects/:projectId/itps/:itpId/approve` — approve ITP
    - POST `/api/projects/:projectId/itps/:itpId/revise` — create new revision
    - Validate permissions at each endpoint before processing
    - Apply Zod validation on request bodies
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.10, 1.11, 9.6, 9.7_

  - [x] 13.2 Add inspection item and execution endpoints to `src/lib/api-router.ts`
    - POST `/api/projects/:projectId/itps/:itpId/items` — add inspection item
    - PUT `/api/projects/:projectId/itps/:itpId/items/:itemId` — update item
    - DELETE `/api/projects/:projectId/itps/:itpId/items/:itemId` — remove item
    - POST `/api/projects/:projectId/itps/:itpId/items/reorder` — reorder items
    - POST `/api/projects/:projectId/inspections/request` — request hold point inspection
    - POST `/api/projects/:projectId/inspections/:itemId/sign-off` — inspector sign-off
    - POST `/api/projects/:projectId/inspections/:itemId/record` — record witness outcome
    - POST `/api/projects/:projectId/inspections/:itemId/acknowledge` — acknowledge witness notification
    - _Requirements: 2.1, 2.7, 3.1, 3.5, 4.3, 4.4, 4.5_

  - [x] 13.3 Add material testing and compliance endpoints to `src/lib/api-router.ts`
    - POST `/api/projects/:projectId/testing-schedules` — create testing schedule
    - PUT `/api/projects/:projectId/testing-schedules/:scheduleId` — update schedule
    - GET `/api/projects/:projectId/testing-schedules` — list schedules
    - POST `/api/projects/:projectId/material-tests` — create material test
    - PUT `/api/projects/:projectId/material-tests/:testId/status` — update test status
    - POST `/api/projects/:projectId/material-tests/:testId/result` — record lab result
    - GET `/api/projects/:projectId/material-tests` — list material tests
    - GET `/api/projects/:projectId/itp/compliance-score` — get compliance score
    - GET `/api/projects/:projectId/itp/quality-summary` — get quality summary
    - GET `/api/projects/:projectId/itps/:itpId/compliance-report` — generate compliance report
    - _Requirements: 5.1, 5.3, 6.1, 8.1, 8.2, 10.4_

- [x] 14. Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement UI components
  - [x] 15.1 Create `src/components/itp/ITPWorkspace.tsx` and overview tab
    - Create main workspace component following Hero → Stat Row → Panels pattern
    - Accept `user: UserProfile` prop, operate within project context
    - Implement stat cards: total ITPs, compliance score, open NCRs, pending tests
    - Implement ITP list table with status chips, construction stage, revision number
    - Add filter/sort controls (by status, construction stage)
    - Register in `toolNavRegistry.ts` with sections: Overview, ITPs, Material Testing, Reports
    - _Requirements: 8.1, 9.5_

  - [x] 15.2 Create `src/components/itp/ITPDetailView.tsx` and `InspectionItemsTable.tsx`
    - Create ITP detail view: metadata panel, progress bar, inspection items list
    - Create inspection items table: ordered list with sequence numbers, status badges, type indicators, actions column
    - Show hold point/witness point/surveillance type icons
    - Show linked NCR status alongside failed items
    - Support expand/collapse for item details (acceptance criteria, spec reference)
    - _Requirements: 1.3, 2.1, 7.5_

  - [x] 15.3 Create `src/components/itp/CreateITPDialog.tsx` and `AddInspectionItemDialog.tsx`
    - Create multi-step ITP creation dialog: title, description, construction stage selection
    - Show SpecForge spec item suggestions during creation
    - Create inspection item add/edit dialog with all required fields
    - Implement specificationReference format validation feedback
    - Support linking material tests (multi-select, max 20)
    - _Requirements: 1.1, 2.1, 2.6, 12.4_

  - [x] 15.4 Create hold point and witness point execution forms
    - Create `src/components/itp/HoldPointSignOffForm.tsx` — pass/fail/conditional options, conditions text field, observations, deadline selector (1-30 days for conditional)
    - Create `src/components/itp/WitnessPointRecordForm.tsx` — outcome recording with attendance tracking (inspector-witnessed vs contractor-recorded)
    - Both forms show inspection item context (title, acceptance criteria, spec reference)
    - _Requirements: 3.5, 3.7, 4.3, 4.4, 4.5_

  - [x] 15.5 Create material testing UI components
    - Create `src/components/itp/TestingScheduleTab.tsx` — schedule management, SANS test category selection, frequency/threshold configuration
    - Create `src/components/itp/MaterialTestList.tsx` — test list with status, due dates, overdue flags (red badges), priority indicators
    - Create `src/components/itp/LabResultForm.tsx` — result value, unit (pre-filled from schedule), lab name, report reference, file attachment upload
    - Show auto-calculated pass/fail determination before submission
    - _Requirements: 5.1, 5.3, 6.1, 6.7_

  - [x] 15.6 Create compliance report view
    - Create `src/components/itp/ComplianceReportView.tsx` — all items with outcomes, sign-off records, linked test results, NCRs, overall counts
    - Support PDF-style layout for print/export
    - Show compliance score prominently
    - _Requirements: 10.4, 8.2_

- [x] 16. Wire UI into application shell
  - [x] 16.1 Register ITP workspace in App.tsx and navigation
    - Lazy-load `ITPWorkspace` via `lazyWithChunkRetry` in `App.tsx`
    - Add to `pages` array with correct roles (all project members for read)
    - Register Tool Nav config in `toolNavRegistry.ts` with sections: Overview, Inspection Plans, Material Testing, Reports
    - Register in `architexNavigationConfig.ts` under Module 7 (Site Execution)
    - Add route rendering: `{activeTab === 'itp-workspace' && <ITPWorkspace user={user} />}`
    - _Requirements: 9.1, 9.2, 9.5_

- [x] 17. Integration wiring
  - [x] 17.1 Wire ITP service to existing platform services
    - Connect `itpService` → `ncrService.createNcr()` for failure-triggered NCR creation
    - Connect `itpActionCentreAdapter` → `inboxEventAdapter.createWorkflowEvent()` for all notifications
    - Connect `itpPassportAdapter` → `projectPassportService` for quality data contribution
    - Connect `itpSpecForgeAdapter` → SpecForge repository for bidirectional linking
    - Connect permission checks → `Permission_Service` for role validation
    - Connect audit writes → `auditTrailService` for immutable audit records
    - Wire NCR `verified_closed` callback → `itpService.handleNCRClosed()`
    - Wire SpecForge spec item change events → `itpSpecForgeAdapter.handleSpecItemChanged()`
    - _Requirements: 7.1, 7.4, 8.1, 11.7, 12.1, 12.2, 9.7, 10.1_

- [-] 18. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–25)
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all code examples use TypeScript
- The UI follows the workspace template pattern (Hero → Stat Row → Panels) per workspace steering rules
- All Firestore operations use transactions for state transitions to prevent race conditions
- The service layer is designed as pure functions where possible, with Firestore operations isolated

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "5.1"] },
    { "id": 4, "tasks": ["7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4", "9.5", "11.1", "11.2"] },
    { "id": 8, "tasks": ["11.3", "12.1", "12.2"] },
    { "id": 9, "tasks": ["12.3", "12.4", "12.5", "13.1", "13.2", "13.3"] },
    { "id": 10, "tasks": ["15.1", "15.5"] },
    { "id": 11, "tasks": ["15.2", "15.3", "15.4", "15.6"] },
    { "id": 12, "tasks": ["16.1", "17.1"] }
  ]
}
```
