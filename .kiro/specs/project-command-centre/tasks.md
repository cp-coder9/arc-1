# Implementation Plan: Project Command Centre

## Overview

The Project Command Centre is implemented as a modular React + TypeScript feature within the Architex OS shell. Implementation proceeds from core types and service foundations through individual subsystem views, platform integrations, and AI-powered features. Each task builds incrementally, wiring into the existing Architex OS infrastructure (Firebase, services layer, navigation, and shell).

## Tasks

- [x] 1. Set up project structure, core types, and shared infrastructure
  - [x] 1.1 Create core TypeScript types and interfaces for the Command Centre
    - Create `src/services/commandCentre/types.ts` with all shared types: `CommandCentreView`, `ComplexityMode`, `CommandCentreConfig`, `IntegrationStatus`, `AuditEntry`, `CalendarEvent`, `CommandCentreMilestone`, `BBBEEProcurementSummary`, `PassportWriteback`, `SpecForgeLink`, `CommandCentreAction`
    - Create enums/unions for `RiskCategory`, `RiskSeverity`, `RiskStatus`, `CertificateStatus`, `ContractForm`, `ContractStatus`, `ProcurementStatus`, `RecommendationCategory`
    - Create interfaces for all entity types: `TaskBoardItem`, `BudgetPackage`, `BudgetSummary`, `RiskItem`, `PaymentCertificate`, `ContractItem`, `ProcurementOrder`, `AIRecommendation`, `SuggestedAction`
    - _Requirements: 28.1, 27.5_

  - [x] 1.2 Create the role-view access matrix and complexity mode gating utilities
    - Create `src/services/commandCentre/roleViewMatrix.ts` with `getViewsForRole(role: UserRole, mode: ComplexityMode): CommandCentreView[]`
    - Implement the full 17-role → view mapping per design spec
    - Implement complexity mode filtering (Simple shows subset, Full shows all)
    - Implement default mode derivation based on contract value threshold (R 5M)
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8, 16.1, 16.2, 16.3, 16.5_

  - [x]* 1.3 Write property tests for role-view access control (Property 10)
    - **Property 10: Role-Based View Access Control**
    - For any UserRole, the returned views match exactly the role-view matrix
    - Access attempts outside role scope are denied
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7, 18.8**

  - [x]* 1.4 Write property tests for complexity mode view gating (Property 11)
    - **Property 11: Complexity Mode View Gating**
    - Simple mode shows only [Task Board, Milestones, Budget summary, Site Diary, Quality/Snags, Documents]
    - Full mode shows all views; toggling preserves data; default mode derived from contract value
    - **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**

  - [x] 1.5 Create validation schemas (Zod) for all entity creation forms
    - Create `src/services/commandCentre/schemas.ts` with Zod schemas for task creation, milestone creation, risk creation, snag creation, RFI creation, procurement order creation, contract creation, project creation, variation creation, payment certificate creation, diary entry creation
    - Each schema enforces required fields per acceptance criteria
    - _Requirements: 2.2, 3.2, 4.2, 6.2, 7.2, 10.2, 12.2, 13.2, 17.5_

  - [x]* 1.6 Write property tests for entity creation validation (Property 1)
    - **Property 1: Entity Creation Validation**
    - For any entity type and any input missing required fields, validation rejects without persisting
    - For any input with all required fields valid, validation succeeds
    - **Validates: Requirements 2.2, 3.2, 4.2, 6.2, 7.2, 10.2, 12.2, 13.2, 17.5**

- [x] 2. Implement core services — Command Centre, Task Board, and Budget
  - [x] 2.1 Create the commandCentreService with config management and audit trail
    - Create `src/services/commandCentre/commandCentreService.ts`
    - Implement `getConfig(projectId)`, `updateConfig(projectId, config)`, `initializeCommandCentre(projectId, settings)`
    - Implement audit trail functions: `recordAudit(entry: AuditEntry)`, `getAuditTrail(projectId, filters)`
    - Implement Firestore persistence under `projects/{projectId}/command_centre_config/settings`
    - _Requirements: 26.1, 26.3, 28.1, 28.2_

  - [x]* 2.2 Write property tests for audit trail recording (Property 16)
    - **Property 16: Audit Trail Recording**
    - For any CRUD operation on any entity, an audit entry is recorded with actor, timestamp, action type, entity type, entity ID, and before/after values
    - Audit trail is append-only — no modification or deletion
    - **Validates: Requirements 28.2**

  - [x] 2.3 Implement the taskBoardService with CRUD and status transitions
    - Create `src/services/commandCentre/taskBoardService.ts`
    - Implement `createTask(projectId, data)`, `updateTask(projectId, taskId, data)`, `moveTask(projectId, taskId, targetStatus)`, `deleteTask(projectId, taskId)`
    - Implement `getTasks(projectId, filters?)` with filtering by assignee, priority, due date range, linked subsystem
    - Record audit entries on every status transition with previous/new status, timestamp, and actor
    - Persist to Firestore `projects/{projectId}/tasks/`
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.7_

  - [x]* 2.4 Write property tests for task status transitions (Property 8)
    - **Property 8: Task Status Transition Correctness**
    - Moving a task updates persisted status to match target column; audit entry created with previous/new status, timestamp, actor
    - Task data (title, assignee, priority, due date) remains unchanged
    - **Validates: Requirements 3.4**

  - [x]* 2.5 Write property tests for task board filtering (Property 9)
    - **Property 9: Task Board Filtering**
    - For any list of tasks and any combination of filter criteria, filtered result contains exactly tasks satisfying ALL active conditions
    - No false inclusions, no false exclusions
    - **Validates: Requirements 3.7**

  - [x] 2.6 Implement the budgetService with cost breakdown and variation management
    - Create `src/services/commandCentre/budgetService.ts`
    - Implement `getBudgetSummary(projectId): BudgetSummary`, `getBudgetPackages(projectId): BudgetPackage[]`
    - Implement `addVariation(projectId, variation)` — recalculates contract sum and forecast
    - Implement `checkOverBudget(package): boolean` — flags when expenditure exceeds budget by >5%
    - Implement `recordExpenditure(projectId, packageId, amount)` — updates spent, recalculates variance
    - Persist to Firestore `projects/{projectId}/budget_packages/` and `projects/{projectId}/variations/`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x]* 2.7 Write property tests for budget variation recalculation (Property 4)
    - **Property 4: Budget Variation Recalculation**
    - For any contract sum and set of approved variations, adjustedContractSum = contractSum + sum(variations)
    - Forecast at completion recalculated accordingly
    - **Validates: Requirements 5.3**

  - [x]* 2.8 Write property tests for over-budget detection (Property 5)
    - **Property 5: Over-Budget Detection Threshold**
    - Package flagged when (spent - budget) / budget > 0.05; not flagged when ≤ 0.05
    - Exact 5% threshold — no false positives or missed detections
    - **Validates: Requirements 5.4**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement risk, quality, and valuation services
  - [x] 4.1 Implement the riskRegisterService with CRUD, escalation, and severity stats
    - Create `src/services/commandCentre/riskRegisterService.ts`
    - Implement `createRisk(projectId, data)`, `updateRisk(projectId, riskId, data)`, `escalateRisk(projectId, riskId)`
    - Implement `getRisks(projectId)`, `getRiskStats(projectId)` — summary counts by severity
    - On escalation, create an Action Centre event for the principal agent
    - Persist to Firestore `projects/{projectId}/risks/`
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 4.2 Implement the qualityTrackerService with snag management and stats
    - Create `src/services/commandCentre/qualityTrackerService.ts`
    - Implement `createSnag(projectId, data)`, `updateSnag(projectId, snagId, data)`, `resolveSnag(projectId, snagId)`
    - Implement `getSnags(projectId)`, `getQualityStats(projectId)` — open snags, resolved this week, active NCRs, inspections due
    - On resolution, record resolution date and update resolution rate KPI
    - Integrate with existing snagService for data persistence and bidirectional sync
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 4.3 Implement the valuationService with payment certificates and retention
    - Create `src/services/commandCentre/valuationService.ts`
    - Implement `createCertificate(projectId, data)`, `updateCertificate(projectId, certId, data)`
    - Implement `calculateRetention(grossValue, retentionPercent)` — returns `{ retentionAmount, netCertifiedAmount }`
    - Implement `getCertificates(projectId)`, `linkCertificateToMilestone(certId, milestoneId)`
    - On certificate requiring signature, create Action Centre event for principal agent
    - Persist to Firestore `projects/{projectId}/payment_certificates/`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [x]* 4.4 Write property tests for retention calculation (Property 6)
    - **Property 6: Payment Certificate Retention Calculation**
    - For any grossValue and retentionPercent (0-100): retentionAmount = grossValue * retentionPercent / 100
    - Invariant: netCertified + retention = grossValue always holds
    - **Validates: Requirements 11.2**

  - [x]* 4.5 Write property tests for summary stat aggregation (Property 3)
    - **Property 3: Summary Stat Aggregation**
    - For any collection of entities, computed summary counts equal actual filtered counts
    - Risk counts per severity, quality stats, action centre stats, budget stats all correct
    - **Validates: Requirements 1.1, 5.1, 6.3, 7.3, 8.2, 22.2**

- [x] 5. Implement programme, procurement, contract, and resource services
  - [x] 5.1 Implement the programmeService extensions for Gantt, dependencies, and critical path
    - Create `src/services/commandCentre/programmeService.ts`
    - Implement `createActivity(projectId, data)`, `updateActivity(projectId, activityId, data)`, `deleteActivity(projectId, activityId)`
    - Implement `getActivities(projectId)`, `calculateCriticalPath(activities, dependencies)`
    - Implement dependency types: finish-to-start, start-to-start, finish-to-finish, start-to-finish
    - Generate alerts when critical path activities fall behind schedule
    - Link activities to SpecForge items for bidirectional traceability
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x]* 5.2 Write property tests for critical path identification (Property 15)
    - **Property 15: Critical Path Identification**
    - For any DAG of activities with dependencies, critical path is the longest path
    - Modifying critical-path activity duration changes project end date
    - Modifying non-critical activity within float does not change project end date
    - **Validates: Requirements 2.6**

  - [x] 5.3 Implement the procurementWorkflowService with orders, RFQs, and B-BBEE scoring
    - Create `src/services/commandCentre/procurementWorkflowService.ts`
    - Implement `createOrder(projectId, data)`, `updateOrder(projectId, orderId, data)`, `getOrders(projectId)`
    - Implement `calculateBBBEEPercentage(orders): BBBEEProcurementSummary`
    - Implement `checkOverdueDeliveries(projectId)` — flags overdue, generates risk entry
    - Support bid comparison with value, delivery, and B-BBEE score columns
    - Link procurement items to SpecForge specification items
    - Persist to Firestore `projects/{projectId}/procurement_orders/`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_

  - [x]* 5.4 Write property tests for B-BBEE procurement percentage (Property 7)
    - **Property 7: B-BBEE Procurement Percentage**
    - Aggregate B-BBEE % = sum(values of orders with B-BBEE level ≥ 1) / sum(all order values) * 100
    - Per-supplier breakdown sums to total procurement value
    - **Validates: Requirements 12.5, 25.5**

  - [x] 5.5 Implement the contractRegisterService with JBCC/NEC forms and expiry tracking
    - Create `src/services/commandCentre/contractRegisterService.ts`
    - Implement `createContract(projectId, data)`, `updateContract(projectId, contractId, data)`, `getContracts(projectId)`
    - Support JBCC (PBA, N/S, MWA) and NEC (ECC, PSC, TSC) contract forms
    - Implement `checkExpiringContracts(projectId)` — flags contracts expiring within 30 days, generates Action Centre notification
    - Link contracts to procurement orders and payment certificates
    - Persist to Firestore `projects/{projectId}/contracts/`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 25.1_

  - [x] 5.6 Implement the resourceManagerService with team register and utilisation tracking
    - Create `src/services/commandCentre/resourceManagerService.ts`
    - Implement `getTeamMembers(projectId)`, `addTeamMember(projectId, data)`, `removeTeamMember(projectId, memberId)`
    - Implement `getResourceStats(projectId)` — total members, average utilisation, hours this month vs budget, pending approvals
    - Implement `checkOverAllocated(projectId)` — flags members with >90% utilisation for 2+ weeks, generates AI Advisor recommendation
    - Integrate with existing Project Passport team data
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 6. Implement deadline detection, calendar aggregation, KPI, and SA-context services
  - [x] 6.1 Implement deadline and threshold detection utility
    - Create `src/services/commandCentre/deadlineDetectionService.ts`
    - Implement `classifyDeadlineStatus(entity, currentDate)` for all entity types with deadline fields
    - Tasks overdue past due date; milestones overdue past planned date; RFIs escalated past response period; deliveries overdue past expected date; contracts flagged when expiry within 30 days; inspections flagged when due within 7 days
    - Generate appropriate Action Centre events on threshold breach
    - _Requirements: 3.6, 4.3, 7.6, 10.5, 12.4, 13.4_

  - [x]* 6.2 Write property tests for deadline and threshold detection (Property 2)
    - **Property 2: Deadline and Threshold Detection**
    - For any entity with a deadline field, correctly classify as overdue/triggered when current date exceeds deadline
    - Not triggered when deadline has not passed
    - **Validates: Requirements 3.6, 4.3, 7.6, 10.5, 12.4, 13.4**

  - [x] 6.3 Implement the calendarService with unified event aggregation
    - Create `src/services/commandCentre/calendarService.ts`
    - Implement `getCalendarEvents(projectId, dateRange)` — aggregates from milestones, inspections, deliveries, meetings, task due dates
    - Implement `getEventsByDate(projectId, date)`, `getEventsByType(projectId, type)`
    - Each event references source entity type and ID for navigation
    - Persist aggregated events to Firestore `projects/{projectId}/calendar_events/`
    - _Requirements: 23.1, 23.2, 23.3_

  - [x]* 6.4 Write property tests for calendar event aggregation (Property 12)
    - **Property 12: Calendar Event Aggregation**
    - Total event count equals sum of events from all source types, no duplicates, no omissions
    - Each event references source entity type and ID
    - **Validates: Requirements 23.1, 23.2**

  - [x] 6.5 Implement the KPI and analytics computation service
    - Create `src/services/commandCentre/kpiService.ts`
    - Implement `computeScheduleVariance(milestones)` — planned vs actual dates
    - Implement `computeCostVariance(forecast, contractSum)` — (forecast - contractSum) / contractSum * 100
    - Implement `computeQualityScore(snags)` — snag resolution rate percentage
    - Implement `computeRFIResponseTime(rfis)` — average response days
    - Implement `deriveTrend(currentValue, previousValue)` — improving/stable/deteriorating
    - Integrate with existing analyticsReportingEngine service
    - _Requirements: 24.1, 24.2, 24.3, 24.4, 24.5_

  - [x]* 6.6 Write property tests for KPI formula computation (Property 13)
    - **Property 13: KPI Formula Computation**
    - Schedule variance formula produces deterministic results for identical inputs
    - Cost variance = (forecast - contractSum) / contractSum * 100
    - **Validates: Requirements 24.1, 24.3, 24.4**

  - [x]* 6.7 Write property tests for KPI trend derivation (Property 14)
    - **Property 14: KPI Trend Derivation**
    - For any sequence of KPI values (≥2 data points), trend is "improving" when latest better, "deteriorating" when worse, "stable" when unchanged
    - Classification is deterministic for any pair of consecutive values
    - **Validates: Requirements 24.2**

  - [x] 6.8 Implement SACAP stage mapping and SA construction context utilities
    - Create `src/services/commandCentre/saContextService.ts`
    - Implement `mapToSACAPStage(architexStage): string` — deterministic bijective mapping
    - Implement `getNHBRCChecklist(stage: 1-7): string[]` — stage-specific documentation checklists
    - Implement `getMunicipalSubmissionChecklist(municipality, type): string[]`
    - _Requirements: 25.2, 25.3, 25.4_

  - [x]* 6.9 Write property tests for SACAP stage mapping (Property 17)
    - **Property 17: SACAP Stage Mapping**
    - For any Architex lifecycle stage, mapping to SACAP Work Stage is deterministic and bijective
    - Same Architex stage always produces same SACAP stage label
    - **Validates: Requirements 25.2**

- [x] 7. Checkpoint — Ensure all service-layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement Site Diary, RFI, and milestone services
  - [x] 8.1 Implement the site diary service integrating with existing dailyLogService
    - Create `src/services/commandCentre/siteDiaryService.ts`
    - Implement `createEntry(projectId, data)` — weather, workforce count, work completed, issues/delays
    - Implement `getEntries(projectId)` — reverse chronological order
    - Integrate with existing `dailyLogService` for persistence
    - Surface entries mentioning delays to Programme_Engine and Risk_Register
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 8.2 Implement the RFI and Site Instruction service integrating with existing siteExecution
    - Create `src/services/commandCentre/rfiService.ts`
    - Implement `createRFI(projectId, data)` — generates sequential RFI number, creates Action Centre event for addressee
    - Implement `getRFIs(projectId)`, `updateRFI(projectId, rfiId, data)`, `escalateRFI(projectId, rfiId)`
    - Implement Site Instruction support: `createSiteInstruction(projectId, data)`, `getSiteInstructions(projectId)`
    - Integrate with existing siteExecution RFI/Site Instruction services
    - Escalate to Critical when past contractual response period
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 8.3 Implement the milestoneService with NHBRC inspection support
    - Create `src/services/commandCentre/milestoneService.ts`
    - Implement `createMilestone(projectId, data)`, `updateMilestone(projectId, milestoneId, data)`, `completeMilestone(projectId, milestoneId)`
    - Implement `getMilestones(projectId)` — sorted by due date ascending
    - Support NHBRC inspection milestones with stage-specific documentation checklists
    - On overdue, change status and create Action Centre event
    - On completion, record actual date and notify linked payment certificate holders
    - Persist to Firestore `projects/{projectId}/milestones/`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 25.4_

  - [x]* 8.4 Write property tests for milestone and diary chronological ordering (Property 18)
    - **Property 18: Milestone and Diary Chronological Ordering**
    - Milestones sorted ascending by due date; diary entries sorted descending by entry date
    - Sort is stable for items with equal dates
    - **Validates: Requirements 1.4, 9.3**

- [x] 9. Implement platform integration services
  - [x] 9.1 Implement Project Passport writeback integration
    - Create `src/services/commandCentre/passportWritebackService.ts`
    - Implement `writeScheduleHealth(projectId, status)`, `writeFinancialHealth(projectId, status)`, `writeRiskProfile(projectId, profile)`, `writeMilestoneProgress(projectId, progress)`, `writeQualityScore(projectId, score)`
    - Implement `recordSignificantAction(projectId, action)` — writes to Passport audit trail
    - Wire triggers: milestone status change → schedule health; budget overrun → financial health; critical risk → risk profile; programme variance → schedule metric
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5_

  - [x] 9.2 Implement SpecForge bidirectional sync integration
    - Create `src/services/commandCentre/specForgeSyncService.ts`
    - Implement `linkToSpecForgeItem(entityType, entityId, specForgeItemId)`, `getLinkedSpecForgeItems(entityType, entityId)`
    - Implement `onSpecForgeStatusChange(specForgeItemId, newStatus)` — updates linked tasks and procurement items
    - Implement `inheritSpecForgeReference(procurementOrderId, specForgeItemId)` — inherits spec reference and material details
    - Display SpecForge integration badges on views with active sync
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [x] 9.3 Implement Compliance Hub and Finance Module integration
    - Create `src/services/commandCentre/complianceFinanceIntegrationService.ts`
    - Implement `registerNHBRCInspection(projectId, milestoneId)` — registers with Compliance Hub, tracks documentation readiness
    - Implement `surfaceMunicipalChecklist(projectId, milestoneId)` — retrieves submission checklist from Compliance Hub
    - Implement `triggerPaymentWorkflow(projectId, certificateId)` — triggers Finance Module escrow release or direct payment
    - Implement `readRetentionRules(projectId)` — reads retention % and payment terms from Finance Module config
    - On Compliance Hub gap detection, create risk entry and Action Centre event
    - _Requirements: 21.1, 21.2, 21.3, 21.4, 21.5_

  - [x] 9.4 Implement Action Centre event generation service
    - Create `src/services/commandCentre/actionCentreService.ts`
    - Implement `createAction(projectId, action: CommandCentreAction)` — persists to platform-wide Action Centre / Inbox
    - Implement `getActions(projectId, filters?)` — categorised by type with due dates and priority
    - Implement `getActionStats(projectId)` — overdue, due today, upcoming (7 days), awaiting others
    - Implement `createNotification(projectId, notification)` — categorised with icon and severity
    - Wire all subsystem event generators to this service
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

- [x] 10. Implement the AI Advisor service
  - [x] 10.1 Implement the aiAdvisorService with recommendation generation
    - Create `src/services/commandCentre/aiAdvisorService.ts`
    - Implement `generateRecommendations(projectId)` — analyses programme, budget, risks, quality, procurement data
    - Implement `acceptRecommendation(projectId, recommendationId)` — executes suggested action (create task, risk, notification, programme update)
    - Implement `dismissRecommendation(projectId, recommendationId)`
    - Implement recommendation categories: Schedule Optimisation, Risk Detection, Cost Savings, Compliance Alert, Supply Chain Risk
    - Integrate with existing Gemini agent system for inference
    - Throttle recommendation generation to once per 5 minutes per project
    - Persist to Firestore `projects/{projectId}/ai_recommendations/`
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 11. Checkpoint — Ensure all service and integration tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Build the root Command Centre shell component and sidebar navigation
  - [x] 12.1 Create the ProjectCommandCentre root component with sidebar and view routing
    - Create `src/components/commandCentre/ProjectCommandCentre.tsx`
    - Accept `user: UserProfile` and `projectId: string` props
    - Implement internal state for `activeView`, `complexityMode`
    - Render inside Architex OS authenticated content area (no standalone shell)
    - Implement view switching via sidebar navigation
    - Apply role-based view filtering and complexity mode gating
    - _Requirements: 27.1, 27.4, 27.5, 16.4, 18.1_

  - [x] 12.2 Create the CommandCentreSidebar with grouped tool navigation
    - Create `src/components/commandCentre/CommandCentreSidebar.tsx`
    - Implement sidebar sections: Command (Dashboard, Action Centre, Notifications), Planning (Programme, Tasks, Milestones, Calendar), Execution (Team, Site Diary, RFIs, Issues, Quality), Commercial (Budget, Valuations, Procurement, Contracts), Intelligence (Analytics, AI Advisor, Documents, Settings)
    - Show/hide items based on `userRole` and `complexityMode`
    - Use lucide-react icons, dark theme glass styling, Inter typography
    - _Requirements: 27.2, 27.3, 18.1, 16.2, 16.3_

  - [x] 12.3 Create the CommandCentreHeader with project context and sync badges
    - Create `src/components/commandCentre/CommandCentreHeader.tsx`
    - Display project name, current stage, contract value
    - Display sync status badges: "Synced with Project Passport", "SpecForge Active", "Document Intelligence Connected"
    - Display breadcrumb showing "Command Centre / [Active Page Name]"
    - _Requirements: 27.4, 27.6, 26.2_

- [x] 13. Build the Dashboard, Task Board, and Budget views
  - [x] 13.1 Create the DashboardView with stat cards, lifecycle bar, AI panel, and milestones
    - Create `src/components/commandCentre/views/DashboardView.tsx`
    - Implement StatCardGrid: overall progress %, budget spent vs contract sum, open action count, active RFI count
    - Implement LifecycleBar showing completed stages and current active stage (8-stage lifecycle)
    - Implement AIRecommendationsPanel showing up to 5 recommendations with accept/dismiss controls
    - Implement UpcomingMilestonesList sorted by due date with red/amber/green status indicators
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 13.2 Create the TaskBoardView with Kanban columns, cards, and filters
    - Create `src/components/commandCentre/views/TaskBoardView.tsx`
    - Implement KanbanBoard with 4 columns: To Do, In Progress, In Review, Done
    - Implement TaskCard with title, assignee name, priority badge, due date indicator
    - Implement TaskCreateDialog with required fields (title, assignee, priority, due date)
    - Implement drag-and-drop between columns triggering status transition
    - Implement TaskFilters panel (assignee, priority, due date range, linked subsystem)
    - Support linking tasks to SpecForge items, programme activities, procurement orders
    - Visual flag for overdue tasks
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 13.3 Create the BudgetView with stat cards, cost breakdown table, and variation form
    - Create `src/components/commandCentre/views/BudgetView.tsx`
    - Implement BudgetStatCards: contract sum, approved variations total, spent to date, forecast at completion
    - Implement CostBreakdownTable: work package name, budget, committed, spent, progress %, variance with over-budget flagging
    - Implement VariationForm for adding approved variations
    - Display SACAP stage alongside Architex lifecycle stage
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 25.2_

- [x] 14. Build the Programme/Gantt, Milestone, and Calendar views
  - [x] 14.1 Create the ProgrammeView with Gantt chart and activity management
    - Create `src/components/commandCentre/views/ProgrammeView.tsx`
    - Implement GanttChart with horizontal time bars, start/end dates, percentage complete, today-line marker
    - Implement colour coding: red for critical path, green for complete, blue for on-track
    - Implement ActivityForm dialog for creating/editing activities (name, start date, end date, assignee)
    - Implement dependency visualisation between activities
    - Display CriticalPathIndicator highlighting longest path
    - Display SpecForge reference on linked activities
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 14.2 Create the MilestoneView with table and creation dialog
    - Create `src/components/commandCentre/views/MilestoneView.tsx`
    - Implement MilestoneTable: planned date, actual date, status (Complete, On Track, At Risk, Overdue, Pending), linked certificate reference
    - Implement MilestoneCreateDialog: name, planned date, optional link to certificate and programme activity
    - Support NHBRC inspection milestones as a category with documentation requirements
    - Status indicators: red (overdue), amber (at risk), green (on track)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 14.3 Create the CalendarView with unified calendar and multiple view modes
    - Create `src/components/commandCentre/views/CalendarView.tsx`
    - Implement UnifiedCalendar aggregating milestones, inspections, deliveries, meetings, task due dates
    - Display events grouped by date with description and type indicator
    - Implement month, week, and day view modes
    - On event click, navigate to or display source item detail
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [x] 15. Checkpoint — Ensure all component tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Build the Risk, Quality, Team, and Site Diary views
  - [x] 16.1 Create the RiskView with stat cards, risk table, and creation dialog
    - Create `src/components/commandCentre/views/RiskView.tsx`
    - Implement RiskStatCards: summary counts by severity (Critical, High, Medium, Low)
    - Implement RiskTable: ID, description, category, severity, owner, status columns
    - Implement RiskCreateDialog: description, category, severity, owner (required fields)
    - Support escalation action with confirmation
    - Display AI-generated badge on risks created by AI Advisor
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 16.2 Create the QualityView with snag table and inspection management
    - Create `src/components/commandCentre/views/QualityView.tsx`
    - Implement QualityStatCards: open snags, resolved this week, active NCRs, inspections due
    - Implement SnagTable: ID, description, location, severity, assigned party, status
    - Implement SnagCreateDialog: description, location, severity, assigned party (required)
    - Support resolve/close actions with date recording
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 16.3 Create the TeamView with resource register and capacity stats
    - Create `src/components/commandCentre/views/TeamView.tsx`
    - Implement TeamStatCards: total members, average utilisation, hours this month vs budget, pending approvals
    - Implement TeamRegisterTable: name, role, firm, utilisation % (with progress bar), hours logged, status
    - Display SpecForge team reference links
    - Flag over-allocated members visually
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 16.4 Create the SiteDiaryView with entry form and log list
    - Create `src/components/commandCentre/views/SiteDiaryView.tsx`
    - Implement DiaryEntryForm: weather condition selector, workforce count, work completed, issues/delays
    - Implement DiaryEntryList: previous entries in reverse chronological order with date, weather icon, content summary
    - Auto-persist entry with current date, author, timestamp on save
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 17. Build the RFI, Valuation, Procurement, and Contract views
  - [x] 17.1 Create the RFIView with RFI table, creation dialog, and site instructions
    - Create `src/components/commandCentre/views/RFIView.tsx`
    - Implement RFITable: RFI number, subject, from, to, date raised, status (Pending, Critical, Closed)
    - Implement RFICreateDialog: subject, description, addressee, priority (required)
    - Implement SiteInstructionTable: issuer, recipient, instruction content, compliance confirmation
    - Display escalation indicator for overdue RFIs
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 17.2 Create the ValuationView with certificate table and creation dialog
    - Create `src/components/commandCentre/views/ValuationView.tsx`
    - Implement CertificateTable: certificate number, period, gross value, retention amount, net certified amount, status
    - Implement CertificateCreateDialog with retention calculation preview
    - Display linked milestone reference on each certificate
    - Support signature request action generating Action Centre event
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

  - [x] 17.3 Create the ProcurementView with order table, bid comparison, and B-BBEE display
    - Create `src/components/commandCentre/views/ProcurementView.tsx`
    - Implement OrderTable: order number, description, supplier, value, expected delivery, status
    - Implement OrderCreateDialog: description, supplier, value, expected delivery date (required)
    - Implement BidComparisonPanel: value, delivery, B-BBEE score columns
    - Display aggregate B-BBEE procurement percentage and per-supplier breakdown
    - Display SpecForge specification link on items sourced from BOM
    - Support overdue delivery flagging
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 25.5_

  - [x] 17.4 Create the ContractView with contract table and creation dialog
    - Create `src/components/commandCentre/views/ContractView.tsx`
    - Implement ContractTable: reference, contractor/supplier, scope, value, expiry date, status
    - Implement ContractCreateDialog: contractor/supplier, scope, value, form (JBCC PBA/N-S/MWA, NEC ECC/PSC/TSC, Custom), start/expiry dates
    - Display expiry warning badge for contracts within 30 days of expiry
    - Show linked procurement orders and payment certificates
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 25.1_

- [x] 18. Build the AI Advisor, Analytics, Actions, Documents, and Settings views
  - [x] 18.1 Create the AIAdvisorView with recommendation cards and action controls
    - Create `src/components/commandCentre/views/AIAdvisorView.tsx`
    - Implement RecommendationCardList showing categorised recommendations (Schedule, Risk, Cost, Compliance, Supply Chain)
    - Each card: title, explanation text, action buttons (Accept, Dismiss, Share with Team, Create Action, Alert Procurement)
    - On accept, execute recommended action and record in audit trail
    - Display status badges (pending, accepted, dismissed)
    - _Requirements: 15.1, 15.2, 15.3_

  - [x] 18.2 Create the AnalyticsView with KPI stat cards and trend table
    - Create `src/components/commandCentre/views/AnalyticsView.tsx`
    - Implement KPIStatCards: schedule variance (days), cost variance (%), RFI response time (days avg), quality score (%)
    - Implement KPITable: KPI name, target, actual, trend indicator (improving/stable/deteriorating), status (On Target, At Risk, Over)
    - Display trend arrows and colour coding
    - _Requirements: 24.1, 24.2, 24.3, 24.4_

  - [x] 18.3 Create the ActionCentreView with action table and notification feed
    - Create `src/components/commandCentre/views/ActionCentreView.tsx`
    - Implement ActionTable: type (Approval, Technical, Financial, Design, Planning), title, due date, priority, status
    - Implement stat cards: overdue, due today, upcoming (7 days), awaiting others
    - Implement NotificationFeed: recent project activity with icons and severity levels
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 22.5_

  - [x] 18.4 Create the DocumentView with document register integration
    - Create `src/components/commandCentre/views/DocumentView.tsx`
    - Implement DocumentRegisterTable: reference, title, revision, author, date, status (Draft, For Review, Approved, Superseded)
    - Integrate with existing Document Intelligence and Drawing Register services
    - Display SpecForge integration badge indicating active sync
    - Reflect document status changes within 30 seconds via Firestore listener
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 18.5 Create the SettingsView with project config, integrations, and mode toggle
    - Create `src/components/commandCentre/views/SettingsView.tsx`
    - Implement ProjectDetailsForm: project name, contract value, duration, current stage (editable)
    - Implement IntegrationStatusGrid: SpecForge, Project Passport, Document Intelligence, Payment Gateway connection status
    - Implement ComplexityModeToggle: Simple ↔ Full with immediate navigation update
    - On save, persist to project record and write to Project Passport
    - _Requirements: 26.1, 26.2, 26.3, 26.4, 26.5_

- [x] 19. Implement Project Switcher and multi-project support
  - [x] 19.1 Create the ProjectSwitcher component with portfolio dashboard
    - Create `src/components/commandCentre/ProjectSwitcher.tsx`
    - Display active project name and metadata (value, current stage) in sidebar header
    - Implement dropdown listing all accessible projects sorted by most recently accessed
    - On project selection, load selected project data into all subsystems within 3 seconds
    - Implement "New Project" button opening guided creation wizard
    - Wizard requires: project name, client, estimated value, project type, location, estimated duration
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 19.2 Implement the Portfolio Dashboard for multi-project overview
    - Create `src/components/commandCentre/views/PortfolioDashboardView.tsx`
    - Display aggregated health metrics across all user-accessible projects
    - Show project cards with status, progress, and key indicators
    - Available only when user has access to multiple projects
    - _Requirements: 17.6_

- [x] 20. Wire real-time listeners, optimistic updates, and error handling
  - [x] 20.1 Implement Firestore real-time listeners and optimistic update patterns
    - Create `src/services/commandCentre/realtimeService.ts`
    - Implement real-time listeners for all subsystem collections using Firestore onSnapshot
    - Implement optimistic update pattern: localUpdate → remoteWrite → rollback on failure
    - Implement error handling: retry with exponential backoff (1s, 2s, 4s, 8s max), error toast on failure, revert UI state
    - Implement batched writes for mutations within 500ms window
    - _Requirements: 28.3, 28.4, 1.5, 14.3_

  - [x] 20.2 Wire navigation registration and OS shell integration
    - Update `src/navigation/architexNavigationConfig.ts` to include Command Centre entry
    - Register Command Centre in App.tsx routing/tab system
    - Ensure breadcrumb displays "Command Centre / [Active Page Name]"
    - Verify dark theme, glass card styling, and lucide-react icons across all views
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [x] 21. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (18 properties)
- Unit tests validate specific examples and edge cases
- The design uses TypeScript throughout — all implementation uses TypeScript with React 19
- Existing services (dailyLogService, snagService, siteExecution, programmeService) are integrated rather than replaced
- All data persists to Firestore under `projects/{projectId}/command_centre/` subcollections
- Firestore security rules must enforce project-scoped, role-based access (Requirement 28.5)
- The Command Centre renders inside the Architex OS shell — no standalone routing or chrome

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.5"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.6", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.6"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.7", "2.8", "4.1", "4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "4.5", "5.1", "5.3", "5.5", "5.6"] },
    { "id": 6, "tasks": ["5.2", "5.4", "6.1", "6.3", "6.5", "6.8"] },
    { "id": 7, "tasks": ["6.2", "6.4", "6.6", "6.7", "6.9", "8.1", "8.2", "8.3"] },
    { "id": 8, "tasks": ["8.4", "9.1", "9.2", "9.3", "9.4", "10.1"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3", "14.1", "14.2", "14.3"] },
    { "id": 11, "tasks": ["16.1", "16.2", "16.3", "16.4", "17.1", "17.2", "17.3", "17.4"] },
    { "id": 12, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5", "19.1"] },
    { "id": 13, "tasks": ["19.2", "20.1", "20.2"] }
  ]
}
```
