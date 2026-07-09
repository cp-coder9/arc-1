# Implementation Plan: Practice Management Professional Services

## Overview

This implementation plan builds the Practice Management Professional Services module for Architex OS — a firm-level practice management layer that extends the existing Project Command Centre with timesheet capture, expense management, billing rates, fee tracking, WIP calculations, profitability analysis, practice invoicing, resource planning, leave management, write-off tracking, income forecasting, firm-wide reporting, and CRM pipeline integration. Implementation follows the service-first approach: domain types → pure business logic → persistence → API routes → UI components → integration adapters.

## Tasks

- [x] 1. Set up module structure, domain types, and core interfaces
  - [x] 1.1 Create the practice management module directory structure and barrel exports
    - Create `src/services/practiceManagement/` directory with `index.ts` barrel export
    - Create `src/services/practiceManagement/types.ts` with all domain types (SacapWorkStage, TimesheetSubmission, ExpenseClaim, BillingRate, ProjectFeeStructure, WipPosition, ProfitabilityResult, PracticeInvoice, PersonCapacity, LeaveRequest, WriteOffEntry, MonthlyForecastEntry, FirmSummaryMetrics, PipelineOpportunity, etc.)
    - Create `src/services/practiceManagement/persistence/` directory for Firestore operations
    - Create `src/services/practiceManagement/adapters/` directory for integration adapters
    - _Requirements: 15.1, 15.5_

  - [x] 1.2 Create Zod validation schemas for all input types
    - Add schemas to `src/services/practiceManagement/schemas.ts`: createExpenseClaimSchema, createBillingRateSchema, projectFeeStructureSchema, createWriteOffSchema, leaveRequestSchema, createPipelineOpportunitySchema, createPracticeInvoiceSchema, timesheetSubmissionSchema
    - _Requirements: 1.1, 2.1, 3.2, 4.1, 7.1, 9.1, 10.1, 13.1_


- [x] 2. Implement Billing Rate Table service
  - [x] 2.1 Implement BillingRateTableService with rate CRUD and temporal lookup
    - Create `src/services/practiceManagement/billingRateTableService.ts`
    - Implement createRate(), updateRate(), getApplicableRate(), getRatesForRole(), getAllRates()
    - Rate lookup must find the most recent effective date on or before the query date
    - If no applicable rate exists, return null (entry saved with zero cost, flagged)
    - Support multiple rate versions per role with effective dates
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 2.2 Write property test for billing rate temporal lookup
    - **Property 2: Billing rate temporal lookup correctness**
    - **Validates: Requirements 3.3, 3.4**

  - [ ]* 2.3 Write unit tests for BillingRateTableService
    - Test rate creation and update
    - Test temporal lookup with multiple rate versions
    - Test edge case: no applicable rate returns null
    - Test SACAP fee schedule reference view
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_


- [x] 3. Implement Timesheet Engine service
  - [x] 3.1 Implement TimesheetEngineService with entry creation, cost calculation, and submission workflow
    - Create `src/services/practiceManagement/timesheetEngineService.ts`
    - Extend existing timesheetService with approval workflow status fields
    - Implement submitWeeklyTimesheet(), approveSubmission(), rejectSubmission(), getSubmissionsForApproval(), getMySubmissions()
    - On entry save: calculate duration in hours, compute cost using applicable billing rate from BillingRateTableService
    - On submit: change status to pending_approval, create Action Centre action for approver
    - On approve: mark entries as approved, update project time cost totals
    - On reject: mark as rejected with reason, notify staff member
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [ ]* 3.2 Write property test for timesheet cost calculation
    - **Property 1: Timesheet cost calculation invariant**
    - **Validates: Requirements 1.2**

  - [ ]* 3.3 Write property test for approval workflow state transitions
    - **Property 3: Approval workflow state transitions**
    - **Validates: Requirements 1.4, 1.5, 2.3, 2.4, 9.3, 9.4**

  - [ ]* 3.4 Write unit tests for TimesheetEngineService
    - Test entry creation with required fields (project, SACAP stage, activity, date, start/end time)
    - Test cost calculation using billing rate
    - Test weekly submission workflow
    - Test approval and rejection flows
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_


- [x] 4. Implement Expense Manager service
  - [x] 4.1 Implement ExpenseManagerService with claim creation, approval, and aggregation
    - Create `src/services/practiceManagement/expenseManagerService.ts`
    - Implement createExpenseClaim(), submitForApproval(), approveClaim(), rejectClaim(), getProjectExpenses(), getExpenseSummary()
    - Support categorising expenses as reimbursable or disbursement
    - On approve: add amount to project disbursement total
    - Aggregate approved expenses per project for WIP calculations and invoicing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ]* 4.2 Write property test for expense aggregation consistency
    - **Property 16: Expense aggregation consistency**
    - **Validates: Requirements 2.6**

  - [ ]* 4.3 Write unit tests for ExpenseManagerService
    - Test claim creation with required fields
    - Test approval and rejection flows
    - Test reimbursable vs disbursement categorisation
    - Test expense summary aggregation per project
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_


- [x] 5. Implement Fee Tracker service
  - [x] 5.1 Implement FeeTrackerService with fee structure definition and health monitoring
    - Create `src/services/practiceManagement/feeTrackerService.ts`
    - Implement defineProjectFee(), getStageBreakdown(), checkFeeHealth()
    - Support fee basis types: lump sum, time-based, percentage of construction cost
    - Calculate per-stage breakdown: agreed fee, time costs, disbursements, net position
    - Generate warning when costs exceed 80% of stage fee
    - Flag over-run and generate risk entry when costs exceed 100%
    - Write fee health metrics into Project Passport
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 5.2 Write property test for fee stage health status determination
    - **Property 4: Fee stage health status determination**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [ ]* 5.3 Write unit tests for FeeTrackerService
    - Test fee structure creation with different fee bases
    - Test stage breakdown calculation
    - Test warning at 80% threshold
    - Test over-run flag at 100% threshold
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_


- [x] 6. Implement WIP Engine service
  - [x] 6.1 Implement WipEngineService with project and firm-wide WIP calculations
    - Create `src/services/practiceManagement/wipEngineService.ts`
    - Implement calculateProjectWip(), calculateStageWip(), getFirmWipReport()
    - WIP formula: agreed_fee − costs_incurred − amount_invoiced
    - Loss indicator: true when costs >= fee
    - Firm-wide totals aggregate across all active projects
    - Recalculate on timesheet approval, expense approval, and invoice issuance
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [ ]* 6.2 Write property test for WIP calculation formula
    - **Property 5: WIP calculation formula**
    - **Validates: Requirements 5.1, 5.3, 5.4**

  - [ ]* 6.3 Write unit tests for WipEngineService
    - Test WIP calculation per project and per stage
    - Test loss indicator flag
    - Test firm-wide aggregation
    - Test WIP report column output
    - _Requirements: 5.1, 5.2, 5.3, 5.4_


- [x] 7. Implement Profitability Calculator service
  - [x] 7.1 Implement ProfitabilityCalculatorService with margin and status classification
    - Create `src/services/practiceManagement/profitabilityCalculatorService.ts`
    - Implement calculateProjectMargin(), calculateStageMargin(), getFirmProfitability()
    - Margin formula: (fee_earned − time_cost − disbursements − write_offs) / fee_earned × 100
    - Status: profitable (≥20%), at_risk (0–20%), loss_making (<0%)
    - Notify project lead when margin < 20%, notify directors when margin < 0%
    - Support per-stage profitability within a project
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 7.2 Write property test for profitability margin formula and status
    - **Property 6: Profitability margin formula and status classification**
    - **Validates: Requirements 6.1, 6.3, 6.4, 6.5**

  - [ ]* 7.3 Write unit tests for ProfitabilityCalculatorService
    - Test margin calculation with various inputs
    - Test status classification at threshold boundaries
    - Test per-stage profitability
    - Test firm-wide profitability report
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_


- [x] 8. Checkpoint - Core calculation services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Practice Invoice Manager service
  - [x] 9.1 Implement PracticeInvoiceManagerService with invoice creation and lifecycle
    - Create `src/services/practiceManagement/practiceInvoiceManagerService.ts`
    - Implement createInvoice(), updateInvoiceStatus(), getProjectInvoices(), getOverdueInvoices(), checkOverdueInvoices()
    - Support three invoice types: lump_sum, time_based, disbursement
    - For time-based: link to approved timesheet entries, calculate total from hours × rates
    - On issuance: update WIP invoiced amount
    - Track status through: draft → submitted → sent_to_client → paid/overdue/write_off (allow return to draft)
    - Flag overdue after 30+ days past due date, create Action Centre action
    - Integrate with invoiceReadinessService for pre-invoice validation
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 9.2 Write property test for time-based invoice total calculation
    - **Property 7: Practice invoice total for time-based invoices**
    - **Validates: Requirements 7.2**

  - [ ]* 9.3 Write property test for invoice overdue detection
    - **Property 8: Invoice overdue detection**
    - **Validates: Requirements 7.5**

  - [ ]* 9.4 Write unit tests for PracticeInvoiceManagerService
    - Test invoice creation for each type
    - Test status transitions
    - Test overdue detection logic
    - Test WIP update on issuance
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_


- [x] 10. Implement Leave Manager service
  - [x] 10.1 Implement LeaveManagerService with leave requests, balance tracking, and approval
    - Create `src/services/practiceManagement/leaveManagerService.ts`
    - Implement requestLeave(), approveLeave(), rejectLeave(), getLeaveBalance(), getTeamLeave()
    - Calculate working days excluding weekends and public holidays
    - Validate balance sufficiency before processing (reject if exceeds available)
    - On approve: deduct leave days from staff member's capacity in Resource Planner
    - Maintain leave balance per staff member per leave type per annual cycle
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 10.2 Write property test for leave working days calculation
    - **Property 10: Leave working days calculation**
    - **Validates: Requirements 9.2**

  - [ ]* 10.3 Write property test for leave balance sufficiency validation
    - **Property 11: Leave balance sufficiency validation**
    - **Validates: Requirements 9.5**

  - [ ]* 10.4 Write unit tests for LeaveManagerService
    - Test leave request creation with required fields
    - Test working days calculation (weekend/holiday exclusion)
    - Test balance validation and rejection on insufficient balance
    - Test approval and capacity deduction
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_


- [x] 11. Implement Resource Planner service
  - [x] 11.1 Implement ResourcePlannerService with capacity views and over-allocation detection
    - Create `src/services/practiceManagement/resourcePlannerService.ts`
    - Implement getCapacityView(), getPersonCapacity(), getOverAllocated()
    - Available hours = standard_working_hours − approved_leave − public_holidays
    - Over-allocated when allocated > available (including when available is zero)
    - Support forward-looking views: 4, 8, 12 weeks ahead
    - Show pipeline impact as separate layer from confirmed allocations
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 11.2 Write property test for resource capacity calculation
    - **Property 9: Resource capacity calculation**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.5**

  - [ ]* 11.3 Write unit tests for ResourcePlannerService
    - Test capacity calculation per person per week
    - Test over-allocation detection
    - Test forward-looking views
    - Test pipeline impact layer
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_


- [x] 12. Implement Write-Off Tracker service
  - [x] 12.1 Implement WriteOffTrackerService with write-off recording and cumulative tracking
    - Create `src/services/practiceManagement/writeOffTrackerService.ts`
    - Implement createWriteOff(), createReversal(), getProjectWriteOffs(), getFirmWriteOffs()
    - Record write-off amount, reason, authorising user, date
    - Maintain cumulative total per project (monotonically non-decreasing without explicit reversal)
    - Support reversal entries for any business reason
    - Display cumulative write-offs as percentage of agreed fee
    - Generate warning when write-offs exceed 10% of agreed fee
    - Feed write-off totals into Profitability Calculator and WIP Engine
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 12.2 Write property test for write-off cumulative monotonicity
    - **Property 12: Write-off cumulative monotonicity**
    - **Validates: Requirements 10.2, 10.3, 10.4**

  - [ ]* 12.3 Write unit tests for WriteOffTrackerService
    - Test write-off creation with required fields
    - Test cumulative total tracking
    - Test reversal entry creation
    - Test warning threshold at 10%
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_


- [x] 13. Implement Income Forecaster service
  - [x] 13.1 Implement IncomeForecastService with monthly forecasting and confidence levels
    - Create `src/services/practiceManagement/incomeForecastService.ts`
    - Implement generateForecast(), getMonthlyBreakdown(), updateForecastOnEvent()
    - Generate month-by-month forecast based on stage completion dates and fee milestones
    - Categorise by confidence: confirmed (invoice raised), probable (stage nearing completion), pipeline (CRM entries)
    - Move probable to confirmed when stage marked complete and ready for invoicing
    - Provide rolling 12-month forecast aggregated across all active and pipeline projects
    - Auto-update as timelines change, invoices raised, or pipeline projects won/lost
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [ ]* 13.2 Write property test for income forecast confidence transitions
    - **Property 13: Income forecast confidence transitions**
    - **Validates: Requirements 11.2, 11.3**

  - [ ]* 13.3 Write unit tests for IncomeForecastService
    - Test monthly forecast generation
    - Test confidence level categorisation
    - Test probable-to-confirmed transition
    - Test rolling 12-month view
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_


- [x] 14. Implement CRM Pipeline service
  - [x] 14.1 Implement CrmPipelineService extending existing pipelineService
    - Create `src/services/practiceManagement/crmPipelineService.ts`
    - Implement createOpportunity(), updateOpportunity(), winOpportunity(), loseOpportunity(), getWeightedPipelineValue(), getHighConfidenceOpportunities()
    - Calculate weighted pipeline value: estimated_fee × (probability / 100)
    - Flag as high-confidence when probability > 75%
    - On win: transition to active project, trigger project setup
    - Feed weighted values into Income Forecaster for pipeline-category entries
    - Include high-confidence opportunities in Resource Planner capacity view
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [ ]* 14.2 Write property test for pipeline weighted value calculation
    - **Property 14: Pipeline weighted value calculation**
    - **Validates: Requirements 13.2, 13.3**

  - [ ]* 14.3 Write unit tests for CrmPipelineService
    - Test opportunity creation with required fields
    - Test weighted value calculation
    - Test high-confidence flag at 75% threshold
    - Test win/lose transitions
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_


- [x] 15. Checkpoint - All business logic services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Firm Dashboard service
  - [x] 16.1 Implement FirmDashboardService with firm-wide metrics and portfolio reporting
    - Create `src/services/practiceManagement/firmDashboardService.ts`
    - Implement getSummaryMetrics(), getProjectPortfolio(), getUtilisationMetrics(), exportToPdf()
    - Summary metrics: total revenue, total WIP exposure, average margin, utilisation rate, pipeline value
    - Project portfolio table: each active project with fee, costs, WIP, margin, status
    - Staff utilisation: average rate, billable vs non-billable, per-person with trend
    - Aggregate write-off totals as percentage of total fees
    - Support date range filtering (monthly, quarterly, annually)
    - Support PDF export for board reporting
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 16.2 Write property test for firm dashboard utilisation calculation
    - **Property 17: Firm dashboard utilisation calculation**
    - **Validates: Requirements 12.3**

  - [ ]* 16.3 Write unit tests for FirmDashboardService
    - Test summary metrics calculation
    - Test project portfolio table generation
    - Test utilisation metrics consistency
    - Test date range filtering
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_


- [x] 17. Implement role-based access control layer
  - [x] 17.1 Implement role-based access middleware and data visibility scoping
    - Create `src/services/practiceManagement/roleAccessService.ts`
    - Staff/freelancer: own timesheets, own expenses, own leave, project time summaries only
    - Architect/BEP: project-level fee tracking, WIP, profitability for own projects, team timesheets/expense approvals
    - Firm_admin: all views including billing rates, firm-wide reporting, invoicing, resource planning, pipeline
    - Client: read-only project fee summary and invoice history only
    - Prevent access outside role scope, log violations to audit trail
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [ ]* 17.2 Write property test for role-based data visibility
    - **Property 15: Role-based data visibility**
    - **Validates: Requirements 14.1, 14.4, 14.5**

  - [ ]* 17.3 Write unit tests for role-based access
    - Test each role's visible data scope
    - Test access denial for out-of-scope requests
    - Test audit trail logging on access violations
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_


- [x] 18. Implement Firestore persistence layer
  - [x] 18.1 Create persistence services for all practice management collections
    - Create `src/services/practiceManagement/persistence/timesheetPersistence.ts`
    - Create `src/services/practiceManagement/persistence/expensePersistence.ts`
    - Create `src/services/practiceManagement/persistence/billingRatePersistence.ts`
    - Create `src/services/practiceManagement/persistence/feePersistence.ts`
    - Create `src/services/practiceManagement/persistence/invoicePersistence.ts`
    - Create `src/services/practiceManagement/persistence/leavePersistence.ts`
    - Create `src/services/practiceManagement/persistence/writeOffPersistence.ts`
    - Create `src/services/practiceManagement/persistence/resourcePersistence.ts`
    - All collections scoped by firmId for multi-tenant isolation
    - Use Firestore transactions for approval workflows (atomic status + cost total updates)
    - Implement optimistic locking via updatedAt field
    - _Requirements: 1.6, 5.5, 7.3_

  - [x] 18.2 Extend existing timesheets and pipeline_projects collections
    - Extend timesheets collection with: sacapStage, activity, submissionId, approvalStatus, billingRateId fields
    - Extend pipeline_projects collection with: requiredDisciplines, expectedStartDate, isHighConfidence, includedInCapacity fields
    - _Requirements: 1.6, 13.3_


- [x] 19. Implement integration adapters
  - [x] 19.1 Create Project Passport adapter for practice management metrics
    - Create `src/services/practiceManagement/adapters/passportAdapter.ts`
    - Write practice financial health metrics into Project Passport: WIP position, margin status, write-off percentage, fee health (total fee, costs incurred, net position, over-run stages)
    - _Requirements: 4.5, 15.3_

  - [x] 19.2 Create Inbox/Action Centre event adapter
    - Create `src/services/practiceManagement/adapters/inboxAdapter.ts`
    - Surface practice management actions: timesheet approvals, expense approvals, overdue invoices, fee threshold warnings, margin alerts, write-off warnings
    - Integrate with existing notificationService
    - _Requirements: 1.3, 2.2, 4.3, 6.3, 6.4, 7.5, 10.4, 15.4_

  - [x] 19.3 Create Audit Trail adapter
    - Create `src/services/practiceManagement/adapters/auditAdapter.ts`
    - Emit PracticeAuditEvent for all state-changing operations
    - Log access violations for role-based access control
    - _Requirements: 14.5, 15.4_


- [x] 20. Implement API routes
  - [x] 20.1 Create the practice management API router with all endpoints
    - Create `src/lib/practice-management-api-router.ts` (split file pattern like finance-api-router.ts)
    - Implement all routes: timesheets (submit, approve, reject, list), expenses (create, approve, reject, list), billing-rates (list, create), fees (get, define), wip (firm, project), profitability (firm, project), invoices (create, status, list), capacity, leave (request, approve, reject, balance), write-offs (create, get), forecast, dashboard (metrics, portfolio, utilisation), pipeline (create, update, win)
    - Apply Zod validation on all inputs
    - Apply role-based access middleware per endpoint
    - Wire router into main api-router.ts or server.ts
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ]* 20.2 Write integration tests for API endpoints
    - Test input validation (400 responses for invalid data)
    - Test role-based access control per endpoint
    - Test happy-path flows for key endpoints
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_


- [x] 21. Checkpoint - Backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 22. Implement PCC sidebar UI components (Time & Costs)
  - [x] 22.1 Create TimesheetCapture component for weekly timesheet grid entry
    - Create `src/components/practiceManagement/TimesheetCapture.tsx`
    - Weekly grid with project, SACAP stage, activity, date, start/end time fields
    - Show submission status and allow weekly submit for approval
    - Follow Hero → Stat Row → Panels content pattern
    - Use CSS token classes (.panel, .pill, .btn, .table)
    - _Requirements: 1.1, 1.3, 15.5_

  - [x] 22.2 Create TimesheetApproval component for approval queue
    - Create `src/components/practiceManagement/TimesheetApproval.tsx`
    - Display pending submissions with approve/reject actions
    - Show submitter name, week, total hours, total value
    - _Requirements: 1.4, 1.5, 15.5_

  - [x] 22.3 Create ExpenseClaimForm and ExpenseApproval components
    - Create `src/components/practiceManagement/ExpenseClaimForm.tsx`
    - Create `src/components/practiceManagement/ExpenseApproval.tsx`
    - Expense form with description, amount, date, project, category, type, receipt upload
    - Approval queue with approve/reject actions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 15.5_

  - [x] 22.4 Create BillingRateConfig component for firm_admin rate management
    - Create `src/components/practiceManagement/BillingRateConfig.tsx`
    - Table of rates per role with effective dates
    - Create/update rate form
    - SACAP fee schedule reference view
    - _Requirements: 3.1, 3.2, 3.5, 15.5_


- [x] 23. Implement PCC sidebar UI components (Financials)
  - [x] 23.1 Create FeeTrackerPanel component
    - Create `src/components/practiceManagement/FeeTrackerPanel.tsx`
    - Per-project fee health display with stage breakdown
    - Show agreed fee, time costs, disbursements, net position per stage
    - Visual indicators for healthy/warning/over-run status
    - _Requirements: 4.2, 15.1, 15.2_

  - [x] 23.2 Create WipReport component
    - Create `src/components/practiceManagement/WipReport.tsx`
    - WIP report table: project name, agreed fee, costs, invoiced, collected, WIP balance, loss indicator
    - _Requirements: 5.2, 15.1, 15.2_

  - [x] 23.3 Create ProfitabilityPanel component
    - Create `src/components/practiceManagement/ProfitabilityPanel.tsx`
    - Per-project profitability with fee earned, time cost, disbursements, write-offs, net profit, margin %
    - Per-stage profitability drill-down
    - Status pills (profitable, at-risk, loss-making)
    - _Requirements: 6.2, 6.5, 15.1, 15.2_

  - [x] 23.4 Create PracticeInvoiceBuilder and PracticeInvoiceList components
    - Create `src/components/practiceManagement/PracticeInvoiceBuilder.tsx`
    - Create `src/components/practiceManagement/PracticeInvoiceList.tsx`
    - Invoice builder: type selection, timesheet/expense linking, amount calculation
    - Invoice list: status tracking with chips (draft, submitted, sent, paid, overdue, write-off)
    - _Requirements: 7.1, 7.2, 7.4, 15.1, 15.2_

  - [x] 23.5 Create WriteOffPanel component
    - Create `src/components/practiceManagement/WriteOffPanel.tsx`
    - Write-off creation form with reason, amount, description
    - Cumulative write-off display as percentage of fee
    - Reversal entry support
    - _Requirements: 10.1, 10.2, 10.3, 15.1, 15.2_


- [x] 24. Implement Planning UI components
  - [x] 24.1 Create ResourceCapacityView component
    - Create `src/components/practiceManagement/ResourceCapacityView.tsx`
    - Capacity table: team member, available hours, allocated hours, leave, remaining capacity per week/month
    - Over-allocation indicators
    - Forward-looking view toggle (4/8/12 weeks)
    - Pipeline impact as separate visual layer
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 15.5_

  - [x] 24.2 Create LeaveRequestForm and LeaveCalendar components
    - Create `src/components/practiceManagement/LeaveRequestForm.tsx`
    - Create `src/components/practiceManagement/LeaveCalendar.tsx`
    - Leave form: type, start/end date, notes, working days preview
    - Calendar: team leave view with approval status
    - Balance display per leave type
    - _Requirements: 9.1, 9.2, 9.5, 15.5_

  - [x] 24.3 Create IncomeForecastChart component
    - Create `src/components/practiceManagement/IncomeForecastChart.tsx`
    - Rolling 12-month forecast visualisation
    - Stacked by confidence level: confirmed, probable, pipeline
    - Monthly breakdown with project detail
    - _Requirements: 11.1, 11.2, 11.4, 15.5_

  - [x] 24.4 Create CrmPipelineBoard component
    - Create `src/components/practiceManagement/CrmPipelineBoard.tsx`
    - Pipeline opportunities with weighted values
    - High-confidence indicators
    - Win/lose actions
    - _Requirements: 13.1, 13.2, 13.3, 15.5_


- [x] 25. Implement Firm Command Centre Dashboard
  - [x] 25.1 Create FirmCommandCentreDashboard component
    - Create `src/components/FirmCommandCentreDashboard.tsx`
    - Hero: firm name, active project count, current month revenue
    - Stat Row: Total WIP, Average Margin, Utilisation Rate, Pipeline Value
    - Modules Grid: Profitability card, WIP card, Utilisation card, Pipeline card
    - Panels: Project portfolio table, Staff utilisation table, Overdue invoices
    - Follow Hero → Stat Row → Modules → Panels content pattern
    - Use CSS token classes, render inside AppShell 3-column grid
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 15.5_

  - [x] 25.2 Create FirmPortfolioTable component
    - Create `src/components/practiceManagement/FirmPortfolioTable.tsx`
    - Project portfolio table: project name, fee, costs, WIP, margin, status indicators
    - Date range filtering (monthly, quarterly, annually)
    - _Requirements: 12.2, 12.5_


- [x] 26. Navigation registration and platform wiring
  - [x] 26.1 Register practice management in Tool Nav and navigation config
    - Add practice management tool nav config to `src/navigation/toolNavRegistry.ts` with sections: Time & Costs, Financials, Planning, Reporting
    - Register Firm Command Centre Dashboard in `architexNavigationConfig.ts`
    - Add lazy-loaded routes in App.tsx for all practice management views
    - Extend PCC sidebar with Timesheets, Expenses, and Practice Financials sections
    - Wire role-based visibility (staff sees timesheets/expenses, architect/bep sees financials, firm_admin sees all)
    - _Requirements: 15.1, 15.2, 14.1, 14.2, 14.3_

  - [x] 26.2 Wire practice management API router into server
    - Import and mount practice-management-api-router in server.ts and api-server.ts
    - Ensure routes are accessible at `/api/practice/*`
    - _Requirements: 15.1_


- [x] 27. Final checkpoint - Full module integration
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at key milestones
- Property tests validate universal correctness properties defined in the design document (17 properties total)
- Unit tests validate specific examples and edge cases
- All services are pure business logic functions testable without Firestore, following the professionalFeeCalculatorService pattern
- UI components must render inside AppShell 3-column grid using CSS token classes — no standalone pages
- The module integrates with existing services: timesheetService, invoiceReadinessService, pipelineService, notificationService

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "4.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "4.2", "4.3", "5.1", "10.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "6.1", "10.2", "10.3", "10.4", "11.1", "12.1"] },
    { "id": 5, "tasks": ["6.2", "6.3", "7.1", "11.2", "11.3", "12.2", "12.3", "14.1"] },
    { "id": 6, "tasks": ["7.2", "7.3", "9.1", "13.1", "14.2", "14.3"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4", "13.2", "13.3", "16.1"] },
    { "id": 8, "tasks": ["16.2", "16.3", "17.1"] },
    { "id": 9, "tasks": ["17.2", "17.3", "18.1", "18.2"] },
    { "id": 10, "tasks": ["19.1", "19.2", "19.3"] },
    { "id": 11, "tasks": ["20.1"] },
    { "id": 12, "tasks": ["20.2", "22.1", "22.2", "22.3", "22.4"] },
    { "id": 13, "tasks": ["23.1", "23.2", "23.3", "23.4", "23.5"] },
    { "id": 14, "tasks": ["24.1", "24.2", "24.3", "24.4"] },
    { "id": 15, "tasks": ["25.1", "25.2"] },
    { "id": 16, "tasks": ["26.1", "26.2"] }
  ]
}
```
