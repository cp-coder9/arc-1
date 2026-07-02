# Implementation Plan: Contract Administration & Legal Layer

## Overview

Implement the Contract Administration feature as a bounded service domain under `src/services/contractAdmin/` with corresponding UI components. The implementation follows incremental steps: types and pure functions first, then core services with state machines, then integration and UI wiring. Each service integrates with the platform spine (Project Passport, SpecForge, Audit Trail, Action Centre) through the integration adapter.

## Tasks

- [x] 1. Set up project structure, types, and pure utilities
  - [x] 1.1 Create `src/services/contractAdmin/contractTypes.ts` with all TypeScript types
    - Define ContractForm, ContractParty, ClauseElection, form-specific param interfaces (JbccParams, NecParams, GccParams, FidicParams), FormSpecificParams union
    - Define ContractConfig, NoticeRecord, NoticeStatus, VariationRecord, VariationStatus, VariationCumulativeSummary
    - Define EoTClaimRecord, EoTStatus, DelayCause, EvidenceAttachment
    - Define ClaimRecord, ClaimStatus, ClaimType, ClaimsCumulativeSummary
    - Define PaymentScheduleEntry, PaymentCycleStatus
    - Define ContractAuditRecord, HolidayCalendar, PublicHoliday
    - Define ContractError interface and error codes
    - Define ContractFeature, ContractPermission types for RBAC
    - Define IntegrationWriteResult, all input/output interfaces
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 6.1, 7.2, 8.1_

  - [x] 1.2 Create `src/services/contractAdmin/contractFormConfigs.ts` with per-form configuration data
    - Define ContractFormConfig structure encoding form-specific notice types, deadline rules, deemed outcomes, and payment intervals
    - Implement configs for JBCC PBA, NEC ECC, GCC 2025, and FIDIC
    - Include clause-to-response-period mappings, day type (working/calendar), and deemed outcome per clause
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 4.6, 4.7_

  - [x] 1.3 Create `src/services/contractAdmin/workingDayCalculator.ts` as pure function module
    - Implement `getSouthAfricanHolidays(year)` returning all gazetted SA public holidays for a given year
    - Implement `isWorkingDay(date, holidays)` excluding Saturdays, Sundays, and listed holidays
    - Implement `addWorkingDays(startDate, days, holidays)` counting from first working day after start
    - Implement `countWorkingDaysBetween(startDate, endDate, holidays)` exclusive of start, inclusive of end
    - Implement `getNextWorkingDay(date, holidays)` returning the next working day if date is non-working
    - Implement `getRemainingWorkingDays(fromDate, deadline, holidays)` for countdown display
    - Include overflow guard: reject if result exceeds 10 years from start
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [x] 1.4 Write property tests for WorkingDayCalculator
    - **Property 11: Working Day Calculation Correctness**
    - Verify `addWorkingDays` result never falls on Saturday, Sunday, or holiday
    - Verify count of working days between start and result equals exactly the period
    - **Property 12: Calendar Day Calculation**
    - Verify calendar-day deadlines equal start + period calendar days, adjusted to next working day only if landing on non-working day
    - **Validates: Requirements 12.1, 12.3, 12.4, 3.2**

  - [x] 1.5 Write unit tests for WorkingDayCalculator
    - Test known SA holidays (e.g., 2025-03-21 Human Rights Day)
    - Test weekend skipping
    - Test year boundary
    - Test edge case: start date is a holiday
    - Test overflow guard
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 1.6 Create `src/services/contractAdmin/disclaimerService.ts`
    - Implement `getDisclaimerBannerText()` returning the non-dismissible advisory text
    - Implement `getDocumentDisclaimerFooter()` returning footer text for generated outputs
    - Implement `validateDisclaimerPresence(output)` checking that output contains required phrases: "advisory", "does not constitute legal advice", "professional review"
    - Implement `isDeemedOutcomeDisclaimer()` returning verification notice text
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 1.7 Create `src/services/contractAdmin/contractRbacService.ts`
    - Implement `getPermissions(userRole, feature, projectAssignment)` returning permission array
    - Implement `canAccess(userRole, feature, permission, projectAssignment)` returning boolean
    - Implement `resolveMultiRolePermissions(roles, feature, projectAssignment)` returning union of permissions (least restrictive)
    - Encode role-feature-permission matrix per Requirements 9.1–9.6
    - Return `UNAUTHORIZED` error on denied access per Requirement 9.7
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x] 1.8 Write property test for RBAC resolution
    - **Property 15: RBAC Union Resolution**
    - Verify multi-role permissions equal the set union (least restrictive combination)
    - Verify if any role grants 'write', user has 'write'
    - **Validates: Requirements 9.1–9.8**

  - [x] 1.9 Create `src/services/contractAdmin/index.ts` barrel export
    - Export all public functions and types from each service module
    - _Requirements: all_

- [x] 2. Checkpoint — Verify pure utilities compile and pass tests
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Contract Engine Service
  - [x] 3.1 Create `src/services/contractAdmin/contractEngineService.ts`
    - Implement `validateContractSetup(input)` validating all mandatory fields, ranges, and form-specific constraints; return all invalid fields in a single response
    - Implement `setupContract(input)` persisting ContractConfig to Firestore `projects/{projectId}/contractConfig/config`
    - Implement `getContractConfig(projectId)` reading contract config from Firestore
    - Implement `updateContractParameter(projectId, field, value, updatedBy)` with audit trail write
    - On successful setup: write to Project Passport, create audit record, surface Action Centre item
    - Enforce RBAC check before all mutations
    - _Requirements: 1.1, 1.2, 1.7, 1.8, 1.9, 1.10, 2.5_

  - [x] 3.2 Write property test for validation rejection
    - **Property 2: Validation Rejects Incomplete Submissions**
    - Generate random ContractSetupInput with one or more mandatory fields missing/invalid
    - Verify rejection with error indicators for every invalid field
    - Verify no state change on rejection
    - **Validates: Requirements 1.10, 5.2, 6.5, 8.8**

  - [x] 3.3 Write unit tests for Contract Engine Service
    - Test successful setup for each contract form (JBCC, NEC, GCC, FIDIC)
    - Test validation failure cases
    - Test parameter update with audit trail
    - _Requirements: 1.1–1.10_

- [x] 4. Implement Contract Data Sheet Service
  - [x] 4.1 Create `src/services/contractAdmin/contractDataSheetService.ts`
    - Implement `getDataSheet(projectId)` assembling all contract parameters, key dates, named persons, and commercial rates from ContractConfig
    - Implement `getKeyDates(config)` returning commencement, practical completion, revised completion, defects liability end, final account date
    - Implement `getNamedPersons(config)` returning all parties with contractual roles
    - Implement `getCommercialRates(config)` returning penalty rate, retention %, performance guarantee %, insurance requirements
    - Display pending indicator for unconfigured fields (not omit)
    - Enforce RBAC: viewable by all project members, editable only by architect/bep/quantity_surveyor/platform_admin
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8_

  - [x] 4.2 Write property test for data sheet completeness
    - **Property 3: Contract Data Sheet Completeness**
    - For any valid ContractConfig with N parties and M parameters, verify output contains all N parties and all M parameters
    - **Validates: Requirements 2.1, 2.3**

- [x] 5. Implement Notice Engine Service
  - [x] 5.1 Create `src/services/contractAdmin/noticeEngineService.ts`
    - Implement `registerNotice(input)` persisting to `projects/{projectId}/contractNotices/{noticeId}`
    - Implement `calculateDeadline(dateIssued, responsePeriodDays, dayType, holidays)` using working or calendar day calculation
    - Implement `acknowledgeNotice`, `respondToNotice`, `withdrawNotice` state transitions
    - Implement `getActiveNotices(projectId)` returning all non-terminal notices
    - Implement `runDeadlineCheck(projectId)` calculating remaining days for all active deadlines
    - Implement deadline warning generation at 7, 3, 1 working day thresholds (exactly one per threshold per entity)
    - Implement deemed outcome application on expiry (acceptance/rejection based on form config, or null)
    - Cancel pending warnings when notice is responded/withdrawn
    - Write audit record on registration, surface Action Centre item for receiving party
    - Enforce RBAC checks
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 5.2 Write property tests for notice deadline warnings
    - **Property 7: Deadline Warning at Exact Thresholds**
    - Verify exactly one warning at each threshold (7, 3, 1) per entity, no duplicates
    - **Property 8: No Warnings After Response**
    - Verify zero warnings generated for responded/withdrawn notices
    - **Property 9: Deemed Outcome Application**
    - Verify expired notices with configured deemed outcome get acceptance/rejection; without config get null
    - **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.7**

  - [x] 5.3 Write property test for clause reference integrity
    - **Property 1: Clause Reference Format Integrity**
    - Verify all outputs reference clauses by number and title only, no body text exceeding 100 chars
    - **Validates: Requirements 1.9, 11.3**

  - [x] 5.4 Write unit tests for Notice Engine Service
    - Test notice registration with deadline calculation
    - Test notice without configured response period (no deadline)
    - Test status transitions: issued → acknowledged → responded
    - Test expiry with deemed acceptance and deemed rejection
    - _Requirements: 3.1–3.6, 4.1–4.8_

- [x] 6. Checkpoint — Verify contract engine, data sheet, and notice services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Variation Register Service
  - [x] 7.1 Create `src/services/contractAdmin/variationRegisterService.ts`
    - Implement `createVariation(input)` with validation (unique number, mandatory fields) persisting to `projects/{projectId}/contractVariations/{variationId}`
    - Implement `isValidVariationTransition(from, to)` using the transition map: instructed→valued, valued→approved|rejected, approved→implemented
    - Implement `transitionVariation(projectId, variationId, toStatus, actorId)` enforcing valid transitions, writing audit record
    - Implement `valueVariation(projectId, variationId, costImpact, timeImpactDays, valuedBy)` recording cost (addition/omission) and time impact
    - Implement `getCumulativeSummary(projectId)` computing total variations, additions, omissions, net cost delta, total time impact
    - Implement `linkToSpecForge(projectId, variationId, specItemId)` creating linked change record
    - Reject invalid transitions with structured error
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9_

  - [x] 7.2 Write property tests for variation state machine and cumulative summary
    - **Property 5: State Machine Transition Validity (Variations)**
    - Verify transition succeeds iff targetStatus is in permitted list for currentStatus
    - **Property 6: Cumulative Summary Invariant (Variations)**
    - Verify netCostDelta = sum(additions) - sum(omissions) for any set of variation records
    - **Validates: Requirements 5.3, 5.5**

  - [x] 7.3 Write unit tests for Variation Register Service
    - Test full variation lifecycle: instructed → valued → approved → implemented
    - Test rejection path: valued → rejected
    - Test invalid transition attempt
    - Test cumulative summary calculation with mixed additions/omissions
    - _Requirements: 5.1–5.9_

- [x] 8. Implement Extension of Time Engine Service
  - [x] 8.1 Create `src/services/contractAdmin/eotEngineService.ts`
    - Implement `createEoTClaim(input)` with auto-generated claim reference, persisting to `projects/{projectId}/contractEotClaims/{claimId}`
    - Implement `submitEoTClaim(projectId, claimId, submittedBy)` validating all mandatory fields (cause, period, date, narrative, min 1 evidence) before allowing submission
    - Implement `reviewEoTClaim(projectId, claimId, decision, approvedDays, reviewedBy)` with transitions: submitted→under_review, under_review→granted|partially_granted|rejected
    - Implement `calculateNotificationDeadline(contractForm, delayEventDate, holidays)` returning deadline and remaining days
    - On grant: update revised completion date by adding full period via `addWorkingDays`
    - On partial grant: update revised completion date by adding approved days (1 ≤ approvedDays < periodClaimed)
    - Mark late submission if notification deadline has passed
    - Surface Action Centre item for Principal Agent / Employer Agent on submission
    - Track states: draft, submitted, under_review, granted, partially_granted, rejected, withdrawn
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 8.2 Write property test for EoT date advancement
    - **Property 10: EoT Date Advancement**
    - Verify granted claims advance completion date by full period via addWorkingDays
    - Verify partially granted claims advance by approved days (1 ≤ A < periodClaimed)
    - **Validates: Requirements 6.8, 6.9**

  - [x] 8.3 Write unit tests for EoT Engine Service
    - Test claim creation with auto-generated reference
    - Test submission validation (missing evidence rejection)
    - Test late submission flagging
    - Test review flow: granted, partially granted, rejected
    - Test completion date update on grant
    - _Requirements: 6.1–6.9_

- [x] 9. Implement Payment Scheduler Service
  - [x] 9.1 Create `src/services/contractAdmin/paymentSchedulerService.ts`
    - Implement `generateSchedule(commencementDate, completionDate, paymentIntervalDays, holidays)` creating PaymentScheduleEntry array spanning the contract period
    - Implement `regenerateRemainingSchedule(projectId, revisedCompletionDate)` recalculating future entries when completion date changes
    - Implement `linkCertificate(projectId, scheduleEntryId, certificateId, certifiedAmount)` linking finance module certificates
    - Implement `calculateRetention(cumulativeCertified, retentionPercentage, retentionLimit)` returning retention held and atLimit flag
    - Implement `runPaymentDeadlineCheck(projectId)` surfacing overdue notifications
    - Persist schedule entries to `projects/{projectId}/contractPaymentSchedule/{entryId}`
    - Surface reminders at 7, 3, 1 working days before certificate deadline
    - Record schedule changes in audit trail when completion date is amended
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 9.2 Write property tests for payment schedule and retention
    - **Property 13: Retention Calculation**
    - Verify retention held = min(C × P / 100, L) and atLimit flag correctness
    - **Property 14: Payment Schedule Coverage**
    - Verify first entry within one interval of commencement, last on or before completion, consecutive entries spaced exactly one interval apart
    - **Validates: Requirements 7.1, 7.4**

  - [x] 9.3 Write unit tests for Payment Scheduler Service
    - Test schedule generation for a 12-month contract with 30-day intervals
    - Test retention calculation at limit and below limit
    - Test schedule regeneration after EoT grant
    - Test overdue detection
    - _Requirements: 7.1–7.7_

- [x] 10. Checkpoint — Verify variation, EoT, and payment services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement Claims Register Service
  - [x] 11.1 Create `src/services/contractAdmin/claimsRegisterService.ts`
    - Implement `registerClaim(input)` with validation of mandatory fields (claim type, date of event, notification date, amount claimed), auto-generated claim reference, persisting to `projects/{projectId}/contractClaims/{claimId}`
    - Implement `isValidClaimTransition(from, to)` using transition map: notified→substantiated, substantiated→assessed, assessed→accepted|partially_accepted|rejected, accepted|partially_accepted|rejected→disputed
    - Implement `transitionClaim(projectId, claimId, toStatus, actorId, reason)` enforcing valid transitions with audit trail
    - Implement `registerDissatisfaction(projectId, claimId, noticeDate, actorId)` calculating adjudication referral deadline
    - Implement `getCumulativeSummary(projectId)` computing totals by type, amount claimed, assessed, settled
    - Calculate contractual submission deadline and surface warnings at 14 and 7 calendar days
    - Support evidence linking from site diary, payment records, variations, site instructions, correspondence
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [x] 11.2 Write property tests for claims state machine and cumulative summary
    - **Property 5: State Machine Transition Validity (Claims)**
    - Verify transition succeeds iff targetStatus is in permitted list for currentStatus
    - **Property 6: Cumulative Summary Invariant (Claims)**
    - Verify totalAmountClaimed = sum of all individual claim amounts
    - **Validates: Requirements 8.2, 8.6, 8.9**

  - [x] 11.3 Write unit tests for Claims Register Service
    - Test claim registration with valid and invalid inputs
    - Test full claim lifecycle: notified → substantiated → assessed → accepted
    - Test dispute escalation with adjudication deadline calculation
    - Test invalid transition rejection
    - Test cumulative summary accuracy
    - _Requirements: 8.1–8.9_

- [x] 12. Implement Integration Service
  - [x] 12.1 Create `src/services/contractAdmin/contractIntegrationService.ts`
    - Implement `writeToProjectPassport(projectId, update)` updating contract status, key dates, outstanding notices count, and nearest deadline
    - Implement `writeToAuditTrail(projectId, record)` creating immutable ContractAuditRecord in `projects/{projectId}/contractAudit/{auditId}`
    - Implement `surfaceToActionCentre(event)` creating high-priority actions with deadline date, clause reference, required response type, and remaining days
    - Implement `writeToSpecForge(projectId, changeRecord)` creating linked change records for variations
    - Implement `registerDocument(projectId, docMeta)` registering controlled documents with metadata
    - Implement `createRiskEvent(projectId, risk)` creating risk events with severity mapping
    - Implement `retryWithBackoff(fn, maxRetries, delayMs)` — retry up to 3 times over 60 seconds; on final failure, create failed-sync alert in Action Centre
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 12.2 Write property test for audit trail production
    - **Property 4: State Changes Produce Audit Records**
    - Verify every state-changing operation produces exactly one immutable audit record with entity type, entity ID, action, actor ID, timestamp, and previous/new status
    - **Validates: Requirements 2.5, 5.8, 8.7**

  - [x] 12.3 Write property test for disclaimer presence on outputs
    - **Property 16: Disclaimer Presence on Generated Outputs**
    - Verify every generated output document contains disclaimer footer with "advisory", "does not constitute legal advice", and "professional review"
    - **Validates: Requirements 11.2, 11.4**

  - [x] 12.4 Write unit tests for Integration Service
    - Test successful writes to each target module (mock Firestore and platform spine)
    - Test retry logic with simulated failures
    - Test failed-sync alert creation after max retries
    - _Requirements: 10.1–10.10_

- [x] 13. Checkpoint — Verify all service layer code compiles and tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement UI Components — Dashboard, Setup Wizard, and Data Sheet
  - [x] 14.1 Create `src/components/ContractAdminDashboard.tsx`
    - Render inside Architex OS shell content area with tab-based navigation
    - Tabs: Overview, Setup, Data Sheet, Notices, Variations, EoT Claims, Payments, Claims
    - Accept `user: UserProfile` and `projectId: string` props
    - Derive permissions via ContractRbacService; hide tabs the user cannot access
    - Render `ContractDisclaimerBanner` as persistent non-dismissible element
    - Use glass card styling (`bg-surface-800/70 backdrop-blur border-surface-700/50`)
    - _Requirements: 9.1–9.8, 11.1, 11.5_

  - [x] 14.2 Create `src/components/ContractSetupWizard.tsx`
    - Multi-step wizard: Select Form → Configure Parties → Set Dates & Sum → Form-Specific Params → Clause Elections → Review & Confirm
    - Show form-specific parameter fields based on selected contract form (JBCC, NEC, GCC, FIDIC)
    - Validate all mandatory fields before allowing submission; show field-level error indicators
    - On submit, call `setupContract()` and display success/failure
    - Block disclaimer rendering failure: prevent interaction if disclaimer not visible
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 11.1, 11.5_

  - [x] 14.3 Create `src/components/ContractDataSheet.tsx`
    - Display all contract parameters, key dates, named persons, commercial rates
    - Show pending indicator for unconfigured fields
    - Read-only for users without edit permission (no edit controls visible)
    - Editable for architect/bep/quantity_surveyor/platform_admin with inline edit + audit logging
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6, 2.7, 2.8_

- [x] 15. Implement UI Components — Notice, Variation, and EoT
  - [x] 15.1 Create `src/components/NoticeRegister.tsx`
    - Display notice register list with status, deadline, and remaining days
    - Registration form: notice type (form-specific), issuing/receiving party, clause reference, date, subject (max 500), linked documents (0–20)
    - Deadline countdown display with color-coded urgency (green/amber/red)
    - Status transition buttons (acknowledge, respond, withdraw) respecting current status
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.3, 4.4_

  - [x] 15.2 Create `src/components/VariationRegister.tsx`
    - Display variation list with status badges and cumulative summary card
    - Variation creation form with all required fields
    - Detail panel showing cost/time impact, linked instructions/RFIs, SpecForge links
    - Status transition controls based on current state and user role
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 15.3 Create `src/components/EoTClaimManager.tsx`
    - EoT claim builder with structured evidence linking (site diary, weather, instructions, photos)
    - Notification deadline countdown display with late submission warning
    - Submission validation (all mandatory fields + min 1 evidence attachment)
    - Review interface for Principal Agent / Employer Agent with grant/partial/reject actions
    - Display revised completion date impact on grant
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

- [x] 16. Implement UI Components — Payment, Claims, and Disclaimer
  - [x] 16.1 Create `src/components/PaymentScheduleView.tsx`
    - Display payment timeline with status per cycle (pending, certificate_issued, payment_confirmed, overdue)
    - Show valuation date, certificate deadline, payment deadline for each entry
    - Retention summary card showing cumulative retention held and release conditions
    - Certificate linking interface (connect to Finance module certificates)
    - Overdue highlighting with Action Centre notification trigger
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 16.2 Create `src/components/ClaimsRegister.tsx`
    - Claim registration form with mandatory fields and evidence linking
    - Claims list with status, submission deadline countdown, and cumulative summary
    - Status transition controls respecting the defined transition rules
    - Dispute escalation interface: notice of dissatisfaction → adjudication deadline display
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 16.3 Create `src/components/ContractDisclaimerBanner.tsx`
    - Persistent, non-dismissible banner rendered on every contract admin view
    - Text: system is advisory, does not constitute legal advice, requires professional review
    - Fixed position element that does not scroll away
    - If banner fails to render, block all user interaction with the view
    - Include disclaimer footer component for generated output documents
    - _Requirements: 11.1, 11.2, 11.4, 11.5_

- [x] 17. Checkpoint — Verify all UI components compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Wire services into UI and platform integration
  - [x] 18.1 Wire ContractAdminDashboard into App.tsx routing
    - Add contract administration route/tab in the Architex OS shell
    - Ensure the component is accessible from Module 7 (Site Execution) and Module 8 (Closeout + Payment + Audit) navigation
    - Pass `user` and `projectId` props from the shell context
    - Ensure role-based visibility (only show nav item to roles with contract access)
    - _Requirements: 9.1–9.7_

  - [x] 18.2 Wire integration service calls into all state-changing service operations
    - Contract setup → writeToProjectPassport + writeToAuditTrail
    - Notice registration → writeToAuditTrail + surfaceToActionCentre
    - Variation status change → writeToAuditTrail + writeToSpecForge (on approval)
    - EoT grant/partial → update Contract Data Sheet revised completion + writeToProjectPassport
    - Payment schedule change → writeToAuditTrail
    - Claim status change → writeToAuditTrail
    - Deadline miss → createRiskEvent
    - Document upload → registerDocument
    - Delay event in site diary exceeding early warning → surfaceToActionCentre for EoT prompt
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 18.3 Wire payment certificate linking from Finance module
    - Listen for payment certificate events from Finance API
    - Match certificate to schedule entry by valuation period
    - Update payment cycle status to "certificate_issued"
    - Flag unmatched certificates and create reconciliation action
    - _Requirements: 10.4, 10.10, 7.6_

- [x] 19. Final checkpoint — Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The working day calculator is implemented first as it is a dependency of all deadline-aware services
- Integration service is implemented after all domain services to wire them together
- UI components are implemented after services to ensure the API layer is stable

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.6"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.7"] },
    { "id": 2, "tasks": ["1.4", "1.5", "1.8", "1.9"] },
    { "id": 3, "tasks": ["3.1", "4.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "4.2", "5.1"] },
    { "id": 5, "tasks": ["5.2", "5.3", "5.4", "7.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "8.1", "9.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "9.2", "9.3", "11.1"] },
    { "id": 8, "tasks": ["11.2", "11.3", "12.1"] },
    { "id": 9, "tasks": ["12.2", "12.3", "12.4"] },
    { "id": 10, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 11, "tasks": ["15.1", "15.2", "15.3"] },
    { "id": 12, "tasks": ["16.1", "16.2", "16.3"] },
    { "id": 13, "tasks": ["18.1", "18.2", "18.3"] }
  ]
}
```
