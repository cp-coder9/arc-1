# Implementation Plan: Tool Discoverability Routing

## Overview

Wire five existing-but-buried tools into first-class discoverable routes in App.tsx, register them in the standalone tool registry, update navigation configuration, and create two new workspace/dashboard components (ContractAdminWorkspace, ContractorComplianceDashboard) plus two lightweight standalone wrappers (NCRManagerStandalone, SiteInstructionManagerStandalone). The approach is purely additive — no existing routes, components, or services are modified in a breaking way.

## Tasks

- [x] 1. Route registry and lazy-load additions in App.tsx
  - [x] 1.1 Add lazy imports and CANONICAL_DASHBOARD_PAGES entries for all 5 new tool pages
    - Add `lazyWithChunkRetry` imports for: SACouncilDrawingComplianceNavigator, NCRManagerStandalone, SiteInstructionManagerStandalone, ContractAdminWorkspace, ContractorComplianceDashboard
    - Add 5 new entries to the `CANONICAL_DASHBOARD_PAGES` array with correct id, label, roles, group, icon, summary, and backedBy fields as defined in the design
    - Add page IDs to `DIRECT_WORKFLOW_PAGE_IDS`: 'council-navigator', 'ncr-manager', 'site-instructions', 'contract-admin', 'contractor-compliance'
    - Add 'disputes' to `DIRECT_WORKFLOW_PAGE_IDS` (keeping it also in `PROJECT_WORKFLOW_PAGE_IDS` for dual-mode)
    - Wire the lazy-loaded components into the page rendering switch/map
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 6.1, 7.1, 7.2, 7.4, 7.5_

  - [x] 1.2 Write property tests for route registry correctness
    - **Property 1: Role-based page access gating** — For any UserRole and any page in CANONICAL_DASHBOARD_PAGES, `pagesForRole(role)` includes that page iff the role appears in the page's `roles` array
    - **Property 2: Page ID set partitioning** — No page id appears in both DIRECT and PROJECT sets unless it is the documented dual-mode page ('disputes')
    - **Property 3: CANONICAL_DASHBOARD_PAGES structural completeness** — Every entry has valid id (kebab-case, ≤40, unique), non-empty label, non-empty roles of valid UserRole values, valid group, non-null icon, non-empty summary, non-empty backedBy
    - **Validates: Requirements 1.2, 1.7, 2.2, 2.4, 3.2, 4.2, 5.2, 7.1, 7.2, 7.3, 7.4, 7.7**

- [x] 2. Standalone tool registry updates
  - [x] 2.1 Add new StandaloneToolCategory and 5 registry entries
    - Add `'construction_admin'` to the StandaloneToolCategory union type
    - Add 5 entries to STANDALONE_TOOL_REGISTRY: council_navigator, ncr_manager, site_instruction_manager, contract_admin_workspace, contractor_compliance_dashboard
    - Each entry must have: id, label, category, description, roles, icon, route, standaloneOnly, requiresInput, canExport, canAssignToProject, recentRunsCount, tags, calculatorDefinitionId — as specified in the design
    - _Requirements: 1.4, 2.6, 3.6, 4.7, 5.8, 8.1, 8.2_

  - [x] 2.2 Write property tests for standalone tool registry
    - **Property 4: Standalone tool registry structural completeness** — Every entry has id (≤64 chars, lowercase underscores, unique), label (≤80 chars), valid category, description (≤160 chars), non-empty roles array, non-empty icon, non-empty route, tags array (3–12 entries)
    - **Property 5: Standalone tool tile role filtering** — For any tool and any UserRole NOT in that tool's roles, the tool is excluded from that user's visible list
    - **Validates: Requirements 8.1, 8.3**

- [x] 3. Navigation configuration updates
  - [x] 3.1 Add navigation items to architexNavigationConfig.ts
    - Add 'Council Drawing Navigator' item to the `design_compliance` section with key 'council-navigator', description, and role subset
    - Add 5 items to the `construction_admin` section: 'NCR Manager', 'Site Instructions', 'Contract Administration', 'Contractor Compliance', 'Dispute Resolution' — with correct keys, labels, descriptions, and roles
    - Ensure nav item labels match their CANONICAL_DASHBOARD_PAGES label counterparts
    - Ensure nav item roles are a subset of or equal to corresponding page roles
    - _Requirements: 1.5, 2.7, 3.7, 4.8, 5.9, 6.3, 7.6_

  - [x] 3.2 Write property test for navigation consistency
    - **Property 12: Navigation config consistency with page registry** — For any nav item corresponding to a CANONICAL_DASHBOARD_PAGES entry, the label matches and the nav roles are a subset of or equal to the page roles
    - **Validates: Requirements 7.6**

- [x] 4. Checkpoint - Verify route registry wiring
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. NCR Manager standalone wrapper
  - [x] 5.1 Create NCRManagerStandalone component
    - Create `src/components/NCRManagerStandalone.tsx`
    - Accept `{ user: UserProfile; projectId?: string }` props
    - When `projectId` is provided: render existing `NCRManager` directly with `projectId` and `currentUserId` from user
    - When no `projectId`: render a project selection prompt showing the user's accessible projects
    - On project selection: render `NCRManager` with the selected project
    - Follow workspace template pattern: Header Card with "NCR Manager" label, project toggles, then content
    - _Requirements: 2.3, 2.5, 2.8_

  - [x] 5.2 Write unit tests for NCRManagerStandalone
    - Test: renders project selection prompt when no projectId
    - Test: renders NCRManager directly when projectId provided
    - Test: passes user.uid as currentUserId to NCRManager
    - _Requirements: 2.5_

- [x] 6. Site Instruction Manager standalone wrapper
  - [x] 6.1 Create SiteInstructionManagerStandalone component
    - Create `src/components/SiteInstructionManagerStandalone.tsx`
    - Accept `{ user: UserProfile; projectId?: string }` props
    - When `projectId` is provided: render existing `SiteInstructionManager` with `projectId`, `currentUserId`, and `currentUserRole` from user
    - When no `projectId`: render project selection prompt; do NOT render instruction data until project selected
    - On project selection: render `SiteInstructionManager` with selected project
    - Follow workspace template pattern: Header Card with "Site Instructions" label
    - Handle audit trail write failures: display error toast, retain instruction data in local state
    - _Requirements: 3.3, 3.4, 3.5, 3.8, 3.9_

  - [x] 6.2 Write unit tests for SiteInstructionManagerStandalone
    - Test: renders project selection prompt when no projectId
    - Test: does not render instruction data until project selected
    - Test: passes correct props (projectId, currentUserId, currentUserRole) to SiteInstructionManager
    - _Requirements: 3.4, 3.5_

- [x] 7. Contract Administration Workspace
  - [x] 7.1 Create ContractAdminWorkspace component
    - Create `src/components/ContractAdminWorkspace.tsx`
    - Accept `{ user: UserProfile; projectId?: string }` props
    - Follow SpecForge workspace template: Header Card → Project Toggles → Disclaimer Banner → Tab Navigation → Active Tab Content
    - Header Card: "Contract Administration" label, project name, role badge
    - Disclaimer Banner: persistent, non-dismissible, text from `disclaimerService.getDisclaimerBannerText()`
    - Tab bar with exactly 6 tabs: Claims Register, Variation Register, Extension of Time, Notices, Payment Scheduler, Contract Data Sheet — Claims Register selected by default
    - Each tab renders content consuming the corresponding service: claimsRegisterService, variationRegisterService, eotEngineService, noticeEngineService, paymentSchedulerService, contractDataSheetService
    - Integrate `contractRbacService.canAccess(userId, tabFeature)` — tabs where access is denied render disabled with permission message
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.13_

  - [x] 7.2 Implement integration hooks for ContractAdminWorkspace
    - Wire `contractIntegrationService.writeToAuditTrail()` on every contract action (claim registered, variation approved, notice issued, EoT submitted)
    - Wire `contractIntegrationService.surfaceToActionCentre()` when deadline ≤5 working days away
    - Wire `contractIntegrationService.writeToProjectPassport()` on status changes (within 60 seconds of action)
    - Wrap all integration writes with `retryWithBackoff()` (3 attempts)
    - On 3-retry failure: create `failed-sync` alert in Action Centre identifying target module, originating event, failure timestamp
    - _Requirements: 4.9, 4.10, 4.11, 4.12_

  - [x] 7.3 Write property tests for contract admin logic
    - **Property 6: Contract admin RBAC tab disablement** — For any tab and user where canAccess returns false, the tab renders disabled with permission message
    - **Property 7: Contract deadline action surfacing** — For any deadline with ≤5 working days remaining and >0, an action is surfaced to Action Centre with deadline, response type, clause ref, remaining days
    - **Validates: Requirements 4.10, 4.13**

  - [x] 7.4 Write unit tests for ContractAdminWorkspace
    - Test: 6 tabs render in correct order
    - Test: Claims Register tab selected by default
    - Test: Disclaimer banner renders and is non-dismissible
    - Test: disabled tab shows permission message when canAccess returns false
    - Test: audit trail write called on contract action
    - Test: failed-sync alert created after 3 retry failures
    - _Requirements: 4.4, 4.6, 4.9, 4.12, 4.13_

- [x] 8. Contractor & Supplier Compliance Dashboard
  - [x] 8.1 Create ContractorComplianceDashboard component
    - Create `src/components/ContractorComplianceDashboard.tsx`
    - Accept `{ user: UserProfile; projectId?: string }` props
    - Follow workspace template: Header Card → Project Toggles → Compliance Table with Pagination
    - Display per-entity: overall compliance status, individual check statuses (health_safety_file, coida_registration, sars_tax_pin, bbbee_verification, cips_registration, letter_of_good_standing), evidence refs, expiry dates
    - Visual indicators: red for non_compliant/expired, amber for pending, green for compliant
    - Compliance gate indicator for entities with non_compliant/expired status (blocked from site access + payment)
    - Pagination: max 50 entities per page
    - Consume `contractorSupplierComplianceService` (buildContractorCompliance, getMissingComplianceChecks, getExpiredChecks, getComplianceCheckSummary)
    - _Requirements: 5.3, 5.4, 5.5, 5.6, 5.11_

  - [x] 8.2 Implement compliance early warning and error handling
    - For checks expiring within 30 calendar days: surface early warning to Action Centre (entity, check type, expiry date)
    - On audit event (compliance check update): write to project audit trail with entity, check type, previous status, new status, timestamp
    - Error handling: if service returns error/unavailable, show error banner "Compliance data could not be loaded", retain previously displayed data, show Retry button
    - Empty state: if no entities for current project, show message prompting user to add contractors/suppliers
    - _Requirements: 5.7, 5.10, 5.12, 5.13_

  - [x] 8.3 Write property tests for compliance dashboard
    - **Property 8: Compliance expiry early warning** — For any check where expiresAt is within 30 calendar days, an early warning is surfaced to Action Centre with entity, check type, and expiry date
    - **Property 9: Compliance gate indicator for non-compliant entities** — For any entity with overallStatus 'non_compliant' or 'expired', a gate indicator marks it as blocked
    - **Property 10: Compliance dashboard pagination** — For N entities (N>0), exactly min(N, 50) display on current page with ceil(N/50) total pages
    - **Validates: Requirements 5.4, 5.7, 5.11**

  - [x] 8.4 Write unit tests for ContractorComplianceDashboard
    - Test: renders compliance table with correct columns
    - Test: red/amber/green indicators match compliance status
    - Test: gate indicator displayed for non_compliant/expired entities
    - Test: pagination renders 50 max per page
    - Test: error state shows banner and retains previous data
    - Test: empty state shows add-entity prompt
    - _Requirements: 5.4, 5.6, 5.11, 5.12, 5.13_

- [x] 9. Checkpoint - Verify all components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Dispute Resolution dual-mode wiring
  - [x] 10.1 Wire dispute resolution dual-mode access and role-scoped visibility
    - Confirm 'disputes' exists in both DIRECT_WORKFLOW_PAGE_IDS and PROJECT_WORKFLOW_PAGE_IDS
    - Verify DisputeResolutionPage handles both modes: project-scoped (filter by jobId) and cross-project (role-scoped visibility with 75-record limit)
    - Verify role scoping: admin=all, client=their jobs, architect/bep/freelancer=assigned jobs, others=filed/against
    - Verify empty state: "No disputes available" without error styling when no disputes exist
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

  - [x] 10.2 Write property test for dispute visibility
    - **Property 11: Role-scoped dispute visibility** — For any user without a project context, visible disputes are limited to those matching role scoping rules (admin=all, client=their jobs, arch/bep/freelancer=assigned, others=filed/against)
    - **Validates: Requirements 6.2**

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design's Correctness Properties section
- Unit tests validate specific examples and edge cases
- No service-layer changes are needed — all business logic already exists in `src/services/contractAdmin/`, `contractorSupplierComplianceService`, `ncrService`, and `siteInstructionService`
- The wrapper pattern (NCRManagerStandalone, SiteInstructionManagerStandalone) avoids modifying existing components that require projectId
- ContractAdminWorkspace follows the SpecForge workspace template pattern (Header Card → Project Toggles → Tabs → Content)
- All property tests use `fast-check` with minimum 100 iterations per property

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.2", "5.1", "6.1"] },
    { "id": 2, "tasks": ["5.2", "6.2", "7.1", "8.1", "10.1"] },
    { "id": 3, "tasks": ["7.2", "8.2"] },
    { "id": 4, "tasks": ["7.3", "7.4", "8.3", "8.4", "10.2"] }
  ]
}
```
