# Implementation Plan: Project Command Centre Unification

## Overview

This plan implements the Command Centre as the canonical unified project workspace in Architex OS. It consolidates legacy project navigation, standalone field managers, and wires real Firestore data end-to-end. The implementation is structured in phases: core infrastructure (routing, context, sidebar), subsystem integration, data wiring, advanced features (event feed, approval gates, mobile inbox), and performance optimisation.

## Tasks

- [x] 1. Core Infrastructure — Unified Router, Project Context, and Navigation Redirect

  - [x] 1.1 Create UnifiedRouter with route resolution and access gating
    - Create `src/navigation/UnifiedRouter.tsx`
    - Implement route matching for `/command-centre/:projectId/:viewId`
    - Resolve valid viewId to `CommandCentreView` type; fallback to `'dashboard'` for unrecognized viewId
    - Implement access check (auth + role permission) before rendering
    - Redirect to access-denied page for unauthorized access
    - Redirect to dashboard with notification for non-existent project or unrecognized view
    - _Requirements: 1.1, 1.6, 8.1, 8.2, 8.3, 8.4_

  - [x] 1.2 Create NavigationRedirect for legacy route mapping
    - Create `src/navigation/NavigationRedirect.tsx`
    - Define `RouteMapping[]` for all legacy patterns (`/projects/:id/documents`, `/projects/:id/snags` → `quality`, etc.)
    - Preserve projectId and all query string parameters during redirect
    - Set 6-month TTL configuration for redirect mappings
    - Redirect to Command Centre root with notification for unmapped legacy routes
    - _Requirements: 1.4, 2.6, 2.7, 13.1, 13.2, 13.6_

  - [x] 1.3 Create ProjectContextProvider with project state management
    - Create `src/components/commandCentre/ProjectContextProvider.tsx`
    - Define `ProjectContext` interface (projectId, projectName, lifecyclePhase, contractValue, complexityMode, userRole, activeFilters)
    - Implement context persistence across subsystem view transitions
    - Support project switching via Project Switcher (update URL without page reload)
    - _Requirements: 1.5, 6.2, 7.7, 8.5_

  - [x] 1.4 Implement URL encoding utilities (buildCommandCentreUrl, parseCommandCentreUrl)
    - Create `src/navigation/commandCentreUrlUtils.ts`
    - Implement `buildCommandCentreUrl(projectId, viewId)` → `/command-centre/:projectId/:viewId`
    - Implement `parseCommandCentreUrl(url)` → `{ projectId, viewId }`
    - Support `history.pushState` for client-side URL updates on view/project switch
    - Support browser back/forward navigation between previously visited views
    - _Requirements: 8.1, 8.5, 8.6, 8.7_

  - [ ]* 1.5 Write property tests for route resolution (Properties 1, 2, 3)
    - **Property 1: Route Resolution Correctness** — For any valid viewId, router resolves correctly; for unrecognized viewId, resolves to 'dashboard'
    - **Property 2: Legacy Route Redirect Preservation** — For any legacy route pattern, produces correct Command Centre URL preserving projectId and query params
    - **Property 3: URL Round-Trip** — buildCommandCentreUrl → parseCommandCentreUrl returns original {projectId, viewId}
    - Create `src/__tests__/unifiedRouter.property.test.ts` and `src/__tests__/urlEncoding.property.test.ts`
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 1.1, 1.4, 1.6, 2.6, 8.1, 8.2, 8.5, 8.6, 13.2**

- [x] 2. Role-View Matrix and Tool Nav Sidebar Configuration

  - [x] 2.1 Extend roleViewMatrix with new views and complexity gating
    - Update `src/services/roleViewMatrix.ts` to add new views: `passport`, `form-system`, `audit-trail`
    - Implement `getViewsForRole(role, complexityMode)` returning filtered view set
    - Implement `isViewAccessible(role, view, mode)` returning boolean
    - Define `SIMPLE_MODE_VIEWS` subset (Dashboard, Tasks, Milestones, Budget, Site Diary, Quality/Snags, Documents, Actions)
    - Implement `getDefaultComplexityMode(contractValue)` — returns 'simple' when < R5M, 'full' when >= R5M
    - Ensure role-view mappings match requirements (client: limited views; architect/bep: all; site_manager, QS, contractor, supplier: scoped)
    - _Requirements: 4.2, 4.3, 4.4, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8_

  - [x] 2.2 Update toolNavRegistry with Command Centre section configuration
    - Update `src/navigation/toolNavRegistry.ts` with expanded Command Centre config
    - Add sections: Overview, Delivery, Commercial, Quality & Site, Intelligence, Administration
    - Include new items: Passport, Form System, Audit Trail in Administration section
    - Implement role-based filtering: hide items not in user's permitted view list
    - Implement complexity-mode filtering: show only SIMPLE_MODE_VIEWS in simple mode
    - Hide entire section group header when all items in group are filtered out
    - Update visible items within 200ms when complexity mode changes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [ ]* 2.3 Write property tests for role-view matrix (Properties 4, 5, 6)
    - **Property 4: Role-View Matrix Enforcement** — getViewsForRole returns subset of ALL_VIEWS; simple mode = intersection of role views and SIMPLE_MODE_VIEWS; views outside set return isViewAccessible=false
    - **Property 5: Complexity Mode Derivation** — contractValue < 5M → 'simple'; >= 5M → 'full'
    - **Property 6: Empty Section Group Hiding** — if section items ∩ permitted views = ∅, section excluded from output
    - Create `src/__tests__/roleViewMatrix.property.test.ts`
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 4.2, 4.4, 4.6, 10.1–10.8**

- [x] 3. Legacy Project Module Consolidation

  - [x] 3.1 Remove Legacy Project Module from top-level navigation
    - Update `src/navigation/architexNavigationConfig.ts`
    - Remove `key: 'projects'` from `architexNavigation` array
    - Ensure zero navigation items with `key: 'projects'` remain at top level
    - Preserve all role assignments from legacy module in Command Centre config
    - _Requirements: 2.1, 2.3_

  - [x] 3.2 Merge legacy section entries into Command Centre
    - Add Command Centre section entries for: dashboard, team, documents, rfis, instructions, snags, payments, passport, form-system, audit_trail
    - Retain `projectScoped` and `phaseAware` flags from original legacy definitions
    - Ensure all 14 legacy roles retain access to previously available sections
    - _Requirements: 2.2, 2.3, 2.5_

  - [x] 3.3 Implement TeamView within Command Centre
    - Modify `src/components/commandCentre/views/TeamView.tsx`
    - Render project team member list, role assignments, and responsibility matrix
    - Ensure rendering completes within 200ms of navigation
    - _Requirements: 2.4_

  - [ ]* 3.4 Write property test for legacy section flag preservation (Property 11)
    - **Property 11: Legacy Section Flags Preservation** — For any legacy section key with projectScoped or phaseAware flags, the Command Centre entry retains those same values
    - Create `src/__tests__/dataBridge.property.test.ts` (legacy flag section)
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 2.2**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Standalone Manager Integration (NCR, Snag, SiteInstruction)

  - [x] 5.1 Integrate SnagManager and NCRManager into QualityView
    - Modify `src/components/commandCentre/views/QualityView.tsx`
    - Render existing `SnagManager` in compact mode with full CRUD (create, read, update, close)
    - Render existing `NCRManager` in compact mode with full lifecycle (raise, investigate, resolve, close)
    - Display first page of up to 50 items ordered by createdAt descending
    - Show project selection prompt when no active project is selected
    - _Requirements: 3.1, 3.2, 3.7_

  - [x] 5.2 Integrate SiteInstructionManager into RFIView
    - Modify `src/components/commandCentre/views/RFIView.tsx`
    - Add tabbed sub-section with "RFIs" (default selected) and "Site Instructions" tabs
    - Render existing `SiteInstructionManager` component in the Site Instructions tab
    - Show project selection prompt when no active project is selected
    - _Requirements: 3.3, 3.7_

  - [x] 5.3 Wire standalone manager CRUD through platform services
    - Ensure all creates/updates call existing snagService, ncrService, siteInstructionService
    - Display success confirmation within 2 seconds of service call resolving
    - On failure: display error indication, retain user-entered data in form
    - _Requirements: 3.4_

  - [x] 5.4 Set up Firestore real-time listeners for shared collections
    - Subscribe to `projects/{projectId}/snags/`, `projects/{projectId}/ncrs/`, `projects/{projectId}/site_instructions/` via onSnapshot
    - Reflect updated state within 30 seconds of changes
    - Maintain bidirectional data consistency (same collection paths as standalone managers)
    - _Requirements: 3.5, 3.6, 12.5_

  - [ ]* 5.5 Write property test for Data Bridge collection path consistency (Property 12)
    - **Property 12: Data Bridge Collection Path Consistency** — For snags, NCRs, site instructions: Command Centre collection path === standalone manager collection path
    - Add to `src/__tests__/dataBridge.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 3.6, 5.1, 5.2, 5.3, 5.4**

- [x] 6. End-to-End Firestore Data Wiring (Data Bridge)

  - [x] 6.1 Implement Data Bridge adapter services for budget, site diary, quality, RFI, programme, tasks
    - Wire `budgetService` to read from Finance Module Firestore collections
    - Wire `siteDiaryService` to read/write `projects/{projectId}/daily_logs/`
    - Wire `qualityTrackerService` to read/write snag and NCR collections
    - Wire `rfiService` to read/write site instruction and RFI collections
    - Wire `programmeService` to read/write `projects/{projectId}/programme_activities/`
    - Wire `taskBoardService` to read/write `projects/{projectId}/tasks/`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 6.2 Implement write-with-retry pattern and error handling
    - Implement `writeWithRetry<T>(operation, maxRetries=3)` utility
    - On failure: display error notification, retain unsaved state in memory, allow up to 3 retries
    - On read failure: display error notification with manual refresh action
    - Ensure data freshness — no stale cache older than 30 seconds
    - _Requirements: 5.7, 5.8, 5.9, 5.10_

  - [ ]* 6.3 Write property test for write retry invariant (Property 13)
    - **Property 13: Write Retry Invariant** — Failed write allows up to 3 retries, preserves unsaved data unchanged, does not alter Firestore state until retry succeeds
    - Create `src/__tests__/writeRetry.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 5.8**

  - [ ]* 6.4 Write property test for malformed data resilience (Property 26)
    - **Property 26: Malformed Data Resilience** — For any mix of valid and malformed Firestore docs, Data Bridge returns all valid docs without throwing; displays inline notice for unparseable entries
    - Create `src/__tests__/legacyCompat.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 13.5**

- [x] 7. Seamless Subsystem Transitions and View State Management

  - [x] 7.1 Implement client-side view switching with state preservation
    - Modify `src/components/commandCentre/ProjectCommandCentre.tsx`
    - Use React state + `history.pushState` for subsystem transitions (no full page reload)
    - Render target view within 300ms of user action
    - Preserve scroll position and active filter/sort selections per view for browser session
    - Restore prior state when returning to a previously visited view
    - _Requirements: 6.1, 6.2, 6.6_

  - [x] 7.2 Implement persistent header and breadcrumb generation
    - Modify `src/components/commandCentre/CommandCentreHeader.tsx`
    - Display persistent header: active project name, lifecycle stage, health indicators (schedule, budget, compliance)
    - No re-render or visual shift during transitions
    - Implement `buildBreadcrumb(projectName, viewId)` → `"Architex › Command Centre › {projectName} › {viewLabel}"`
    - Display breadcrumbs in Top Bar
    - _Requirements: 6.3, 6.4_

  - [ ]* 7.3 Write property tests for context persistence and view state (Properties 7, 8, 10)
    - **Property 7: Project Context Persistence Across Transitions** — For any sequence of view transitions, ProjectContext (projectId, name, phase, value, role) remains unchanged
    - **Property 8: View State Preservation** — For any view with scroll S and filter F, navigating away and returning restores both S and F
    - **Property 10: Breadcrumb Generation** — For any projectName and viewId, produces `"Architex › Command Centre › {projectName} › {viewLabel}"`
    - Create `src/__tests__/viewStateManager.property.test.ts` and add breadcrumb tests to `src/__tests__/linkChip.property.test.ts`
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 1.5, 4.5, 6.2, 6.4**

- [x] 8. Cross-Subsystem Linking (LinkChip)

  - [x] 8.1 Implement LinkChip universal cross-subsystem navigation component
    - Create `src/components/commandCentre/LinkChip.tsx`
    - Render for any entity with `linkedEntityId` and `linkedEntityType`
    - Display linked entity name/reference as label, truncated to 40 chars with ellipsis
    - On click: navigate to target subsystem view via client-side transition (no page reload)
    - Apply visible highlight to referenced item for 2–3 seconds after navigation
    - If linked entity not found: display inline notification, do NOT navigate away
    - Style with `.chip` class per platform convention
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x] 8.2 Wire LinkChip into subsystem views (TaskBoard, Milestone, Procurement, Risk)
    - TaskBoard: show chip for `linkedActivityId` → navigate to ProgrammeView
    - MilestoneView: show chip for `linkedCertificateId` → navigate to ValuationView
    - ProcurementView: show chip for `linkedSpecForgeItemId` → navigate to SpecForge detail
    - RiskView: show chip for linked budget package → navigate to BudgetView
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.3 Write property test for LinkChip rendering and truncation (Property 9)
    - **Property 9: Link Chip Rendering and Truncation** — For any entity with non-empty linkedEntityId and valid linkedEntityType: chip renders; label ≤ 40 chars; if original > 40 chars, ends with ellipsis
    - Add to `src/__tests__/linkChip.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 7.5, 7.7**

- [x] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Integration Preservation (Passport, SpecForge, Finance, Action Centre)

  - [x] 10.1 Verify and wire passportWritebackService integration
    - Ensure milestone status changes trigger passport health document updates (scheduleHealth, milestoneProgress)
    - Ensure budget variance detection triggers financialHealth writeback
    - Preserve exported function names, parameter types, and return types unchanged
    - _Requirements: 9.1, 9.2, 9.6_

  - [x] 10.2 Verify and wire actionCentreService, specForgeSyncService, complianceFinanceIntegrationService
    - actionCentreService: task/RFI/milestone generates Action Centre entry with required fields (projectId, actionType, assigneeId, priority, dueDate, status: 'pending')
    - specForgeSyncService: maintain bidirectional link records in specforge_links collection; update within 5 seconds on status change
    - complianceFinanceIntegrationService: payment certification → queue payment workflow request
    - Preserve all exported API contracts unchanged
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

  - [x] 10.3 Implement safeIntegrationCall pattern for failure safety
    - On integration failure: log error, preserve Project Passport state unchanged, create failed_sync alert in Action Centre
    - Alert contains: target module name, affected entity ID
    - _Requirements: 9.7_

  - [ ]* 10.4 Write property tests for integration safety (Properties 14, 15, 16)
    - **Property 14: Financial Health Derivation** — variance ≤ 5% → "healthy"; > 5% and ≤ 15% → "at_risk"; > 15% → "over_budget"
    - **Property 15: Action Centre Entry Completeness** — action entry contains projectId, actionType, assigneeId, priority, dueDate, status="pending"
    - **Property 16: Integration Failure Safety** — on failure: error logged, passport unchanged, failed_sync alert created with module name + entity ID
    - Create `src/__tests__/integrationSafety.property.test.ts`
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 9.2, 9.3, 9.7**

- [x] 11. Toolbox Cross-Reference Integration

  - [x] 11.1 Set up real-time listeners for toolbox-originated writes
    - Use Firestore onSnapshot on shared project collections (snags, NCRs, site_instructions, budget_packages, risks)
    - Propagate updates to active Command Centre views within 30 seconds without polling
    - On listener error/disconnection: log error, display non-blocking notification "live updates temporarily unavailable"
    - _Requirements: 12.1, 12.2, 12.3, 12.5, 12.6_

  - [x] 11.2 Implement H&S incident to Risk Register mapping
    - When H&S incident logged via Toolbox for active project, create risk entry in Command Centre
    - Set category: "health_and_safety", severity derived deterministically from incident severity, status: "open"
    - _Requirements: 12.4_

  - [ ]* 11.3 Write property test for H&S incident to risk mapping (Property 17)
    - **Property 17: H&S Incident to Risk Mapping** — Generated risk entry has category="health_and_safety", severity derived from incident severity, status="open"
    - Create `src/__tests__/incidentRiskMapping.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 12.4**

- [x] 12. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Mobile Decision Inbox

  - [x] 13.1 Create MobileDecisionInbox view component
    - Create `src/components/commandCentre/views/MobileDecisionInbox.tsx`
    - Optimise for viewport widths below 768px
    - Present pending actions as vertically-stacked decision cards
    - Each card displays: title (max 80 chars, truncated with ellipsis), requesting party, project reference, financial impact (currency), deadline, urgency, approve/reject/defer buttons
    - Sort by urgency: overdue → today → this_week → standard; within group by deadline ascending
    - _Requirements: 14.1, 14.2, 14.4_

  - [x] 13.2 Implement decision card actions (approve, reject, defer)
    - Approve/reject: show confirmation prompt with action type and title before executing
    - Execute same outcome and audit trail entry as desktop workflow
    - Defer: require new deadline (1–30 calendar days in future), record deferral in audit trail
    - On success: show confirmation indicator for 3 seconds, remove card from pending list
    - Supporting documents: display inline preview panel or tap-to-open link
    - _Requirements: 14.3, 14.5, 14.6, 14.7_

  - [x] 13.3 Implement urgency sorting and defer date validation utilities
    - Create `sortByUrgency(cards: DecisionCard[])` — overdue > today > this_week > standard; within group by deadline asc
    - Create `validateDeferDate(date, today)` — valid only when 1–30 calendar days after today
    - _Requirements: 14.4, 14.6_

  - [ ]* 13.4 Write property tests for decision inbox (Properties 18, 19)
    - **Property 18: Decision Inbox Urgency Sorting** — overdue precedes today precedes this_week precedes standard; within group sorted by deadline ascending
    - **Property 19: Defer Date Validation** — valid only when date is 1–30 calendar days after today
    - Create `src/__tests__/decisionInbox.property.test.ts`
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 14.4, 14.6**

- [x] 14. Cross-Module Event Feed

  - [x] 14.1 Create EventFeed component with real-time aggregation
    - Create `src/components/commandCentre/EventFeed.tsx`
    - Display most recent 50 project events in reverse chronological order
    - Aggregate from: SpecForge, Document Intelligence, RFIs, Site Diary, Programme, Procurement, Valuations, Contracts, Municipal, Messenger
    - Each item: relative timestamp (hover: full datetime), source module icon, description (truncated 120 chars, expandable), actor name, clickable link to source entity
    - Use Firestore real-time listeners for new events within 10 seconds
    - _Requirements: 15.1, 15.2, 15.3, 15.6_

  - [x] 14.2 Implement event feed filtering (by source module and severity)
    - Severity classification: critical (overdue, escalated, critical path, superseded), standard (approvals, completions, submissions), informational (new entries, status updates)
    - Filter applies to real-time events as they arrive
    - Show empty-state message when filtered result is empty
    - If a source module is unreachable: show events from other modules; muted indicator on affected filter option
    - _Requirements: 15.4, 15.5, 15.7_

  - [ ]* 14.3 Write property test for event feed filtering (Property 20)
    - **Property 20: Event Feed Filtering** — For any list of events and any combination of module/severity filter, returns only events matching both active filters (if set)
    - Create `src/__tests__/eventFeedFilter.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 15.4, 15.5**

- [x] 15. Action Execution and Writeback

  - [x] 15.1 Implement action execution with role validation and audit recording
    - Verify user holds required role permission before dispatching action
    - Invoke platform service API with authenticated user session credentials
    - On success: write audit record to Project Passport audit trail (actor ID, role, actionType, entityType, entityId, timestamp ISO 8601 UTC, before/after state)
    - On failure/timeout (15s): display error, preserve user data, do not alter entity state
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 15.2 Implement financial action confirmation and downstream workflow invocation
    - For financial actions (payment certification, variation approval, retention release): show confirmation dialog requiring explicit user confirm
    - Invoke downstream services with 30-second timeout
    - On downstream failure/timeout: display error with failing service name, record in audit trail, set action to "completed with pending downstream"
    - _Requirements: 16.4, 16.5, 16.6_

  - [x] 15.3 Implement precondition validation for action execution
    - Validate all preconditions before execution (required signatures, prerequisite milestones, budget availability)
    - If any precondition unmet: prevent execution, display list of unmet preconditions with specific condition and related entity
    - _Requirements: 16.7_

  - [ ]* 15.4 Write property tests for action execution (Properties 21, 22)
    - **Property 21: Audit Record Completeness** — successful action produces audit record with actorId, actorRole, actionType, entityType, entityId, valid ISO 8601 UTC timestamp, before/after state
    - **Property 22: Precondition Validation Blocking** — N preconditions with M unmet (M>0): returns exactly M unmet descriptions AND canExecute=false
    - Create `src/__tests__/actionExecution.property.test.ts`
    - Use fast-check with minimum 100 iterations per property
    - **Validates: Requirements 16.3, 16.7**

- [ ] 16. Authority Matrix and Approval Gates

  - [x] 16.1 Implement Authority Matrix configuration and ApprovalGate component
    - Create `src/components/commandCentre/ApprovalGate.tsx`
    - Define authority rules: payment certificates (QS + principal agent), variations (architect + QS + client), milestone completions (site_manager or architect), risk escalations (project_manager or principal_agent), contract terminations (client + legal_advisor)
    - If user attempts action outside authority: deny with message showing required roles, offer to route to authorized party via inbox
    - _Requirements: 17.1, 17.2_

  - [x] 16.2 Implement multi-party approval state machine
    - Track approval state per signatory (pending, approved, rejected, expired)
    - Execute action only when ALL required approvals recorded within 14 calendar days
    - On rejection by any signatory: halt workflow, notify all signatories, mark as rejected
    - On 14-day expiry: mark as expired, notify all signatories, require resubmission
    - Display approval status badges (received, outstanding, time remaining)
    - Notify remaining signatories within 5 seconds of new approval
    - _Requirements: 17.3, 17.4, 17.5, 17.6, 17.7_

  - [ ]* 16.3 Write property test for approval state machine (Property 23)
    - **Property 23: Authority Matrix Approval State Machine** — (a) < N approvals AND < 14 days → "pending"; (b) exactly N approvals → "approved" + action executes; (c) any rejection → "rejected"; (d) 14 days elapsed → "expired"
    - Create `src/__tests__/approvalStateMachine.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 17.1, 17.3, 17.4, 17.7**

- [x] 17. Stale Source and Revision Warnings

  - [x] 17.1 Implement StaleBadge component and stale-source warning system
    - Create `src/components/commandCentre/StaleBadge.tsx`
    - When referenced document transitions to "superseded": display stale-source warning badge within 60 seconds
    - Badge shows: referenced revision code, current latest revision, supersession date (ISO-8601), link to latest version
    - When SpecForge item linked to entity has status "superseded": flag all linked entities via specforge_links collection
    - Dashboard stat card: show integer count of entities referencing outdated sources
    - _Requirements: 18.1, 18.2, 18.3, 18.4_

  - [x] 17.2 Implement stale warning acknowledgement and re-supersession lifecycle
    - On acknowledgement: record timestamp + user ID, remove badge from entity
    - If previously acknowledged reference is superseded again (newer revision > acknowledgement timestamp): generate new warning requiring separate acknowledgement
    - _Requirements: 18.5, 18.6_

  - [ ]* 17.3 Write property test for stale warning lifecycle (Property 24)
    - **Property 24: Stale Source Warning Lifecycle** — (a) doc superseded → warning generated; (b) acknowledgement → warning removed; (c) further supersession after acknowledgement → new warning generated
    - Create `src/__tests__/staleWarning.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 18.1, 18.5, 18.6**

- [x] 18. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 19. Migration, Backward Compatibility, and Legacy Preference Handling

  - [x] 19.1 Implement legacy preference mapping and graceful handling
    - Implement `applyLegacyPreference(key, value)` — maps to valid Command Centre setting if mapping exists; returns default without error if no mapping
    - Read existing project data from current Firestore collections without schema changes
    - Handle unexpected data formats gracefully: log issue, render valid data, show inline notice for unreadable entries
    - _Requirements: 13.3, 13.4, 13.5_

  - [ ]* 19.2 Write property test for legacy preference handling (Property 25)
    - **Property 25: Legacy Preference Graceful Handling** — For any legacy key-value pair: either maps to valid CC setting (if mapping exists) or returns CC default without throwing
    - Add to `src/__tests__/legacyCompat.property.test.ts`
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 13.4**

- [x] 20. New Subsystem Views (Passport, FormSystem, AuditTrail)

  - [x] 20.1 Create PassportView subsystem component
    - Create `src/components/commandCentre/views/PassportView.tsx`
    - Render Project Passport data from `projects/{projectId}/passport/` collection
    - Display as navigable sidebar entry in Administration section
    - Follow Hero → Stat Row → Panels content pattern
    - _Requirements: 2.5, 4.1_

  - [x] 20.2 Create FormSystemView subsystem component
    - Create `src/components/commandCentre/views/FormSystemView.tsx`
    - Render Form System data for active project
    - Display as navigable sidebar entry in Administration section
    - Follow Hero → Stat Row → Panels content pattern
    - _Requirements: 2.5, 4.1_

  - [x] 20.3 Create AuditTrailView subsystem component
    - Create `src/components/commandCentre/views/AuditTrailView.tsx`
    - Render audit trail from `projects/{projectId}/passport_audit/` collection
    - Display as navigable sidebar entry in Administration section
    - Follow Hero → Stat Row → Panels content pattern
    - _Requirements: 2.5, 4.1_

- [x] 21. Performance Optimisation (Lazy Loading, Code Splitting, Prefetch)

  - [x] 21.1 Implement lazy loading and code splitting per subsystem view
    - Use `lazyWithChunkRetry` for all subsystem view components
    - Ensure initial load bundle does not include code for inactive views
    - Display loading skeleton with stat card placeholders within 500ms if data fetch exceeds 3s
    - _Requirements: 11.2, 11.4, 11.6_

  - [x] 21.2 Implement view prefetching for recently visited subsystems
    - Prefetch view code for the 2 most recently visited subsystem views per user role while user interacts with current view
    - Ensure subsystem view renders within 500ms of navigation (excluding network fetch)
    - _Requirements: 11.3, 11.5_

- [x] 22. Final Integration Wiring and App.tsx Registration

  - [x] 22.1 Wire UnifiedRouter into App.tsx and register all new components
    - Register `UnifiedRouter` in App.tsx routing
    - Register `NavigationRedirect` for legacy route handling
    - Register all new views (PassportView, FormSystemView, AuditTrailView, MobileDecisionInbox) via lazy loading
    - Register EventFeed, StaleBadge, ApprovalGate, LinkChip in ProjectCommandCentre shell
    - Ensure existing integration service unit tests pass without modification
    - Verify CI pipeline (lint + test + build) remains green
    - _Requirements: 9.8, 11.1_

  - [ ]* 22.2 Write integration tests for end-to-end flows
    - Legacy route redirect: `/projects/:id/snags` → `/command-centre/:id/quality`
    - Deep-link restoration: bookmark URL → correct view loads
    - Role-based access: supplier login → only procurement and documents visible
    - Firestore real-time sync: write to collection → Command Centre view updates
    - Passport writeback: milestone change → passport health doc updated
    - _Requirements: 1.4, 8.2, 10.6, 3.5, 9.1_

- [x] 23. Final Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate all 26 universal correctness properties defined in the design document using fast-check (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- All components follow the AppShell 3-column grid pattern and use CSS token system (`.panel`, `.pill`, `.btn`, `.table`)
- Existing integration service exported API contracts (passportWritebackService, specForgeSyncService, complianceFinanceIntegrationService, actionCentreService) must remain unchanged
- Implementation uses TypeScript throughout (React 19 + Vite 6 stack)
- All new views registered via `lazyWithChunkRetry` in App.tsx with correct roles
- Firestore collections are read from existing paths (no schema migration required)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "2.1"] },
    { "id": 1, "tasks": ["1.5", "2.2", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.3", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "6.1"] },
    { "id": 4, "tasks": ["5.5", "6.2", "7.1", "7.2"] },
    { "id": 5, "tasks": ["6.3", "6.4", "7.3", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "10.1", "10.2", "10.3"] },
    { "id": 7, "tasks": ["10.4", "11.1", "11.2"] },
    { "id": 8, "tasks": ["11.3", "13.1", "13.2", "13.3"] },
    { "id": 9, "tasks": ["13.4", "14.1", "14.2"] },
    { "id": 10, "tasks": ["14.3", "15.1", "15.2", "15.3"] },
    { "id": 11, "tasks": ["15.4", "16.1", "16.2"] },
    { "id": 12, "tasks": ["16.3", "17.1", "17.2"] },
    { "id": 13, "tasks": ["17.3", "19.1", "19.2"] },
    { "id": 14, "tasks": ["20.1", "20.2", "20.3"] },
    { "id": 15, "tasks": ["21.1", "21.2"] },
    { "id": 16, "tasks": ["22.1", "22.2"] }
  ]
}
```
