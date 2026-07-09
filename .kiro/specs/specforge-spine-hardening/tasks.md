# Implementation Plan: SpecForge Spine Hardening

## Overview

This plan implements the 12 requirements for hardening the SpecForge specification spine to full production readiness. Tasks are organized into phases: infrastructure blockers first, then core services, feature endpoints, cross-cutting governance, and integration wiring. All code is TypeScript following the existing Express 5 + Zod + Firestore repository patterns.

## Tasks

- [x] 1. Infrastructure Blockers (Router Mount, Build, Types)
  - [x] 1.1 Mount SpecForge API router in dev and production servers
    - Add lazy-loaded dynamic import of `src/lib/specforge-api-router.ts` at `/api/specforge` in `server.ts`
    - Add same mount in `api-server.ts`
    - Position BEFORE the generic `/api` catch-all in both files
    - Include error handling that returns 500 JSON with `error` and `details` fields without crashing the process
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 1.8_

  - [x] 1.2 Fix build isolation — remove node:crypto from browser bundle
    - Identify all modules importing `node:crypto` that are transitively imported by client code
    - Replace `crypto.randomUUID()` with `globalThis.crypto.randomUUID()` in client-importable paths
    - Split `copilotService.ts` into `.server.ts` (node:crypto) and `.client.ts` (Web Crypto) variants
    - Update Vite config `rollupOptions.external` to reject `node:` protocol in client chunks
    - Verify `npm run build` exits with code 0 and no `node:` references in `dist/assets/*.js`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.3 Fix TypeScript baseline — UserRole alignment
    - Add `admin` to the `UserRole` type in `src/types.ts` (or ensure all roles referenced by `toSpecForgeRole` exist)
    - Update `toSpecForgeRole` in `src/types/specforgeTypes.ts` to use `Partial<Record<UserRole, SpecForgeRole>>` with no `as` casts
    - Remove any `@ts-ignore`, `@ts-expect-error`, or non-null assertions from the mapping
    - Verify `npm run lint` (tsc --noEmit) exits with zero errors
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 1.4 Write smoke tests for router mount and build
    - Create `src/services/specforge/__tests__/routerMount.test.ts` verifying router loads and responds at `/api/specforge`
    - Create `src/services/specforge/__tests__/buildOutput.test.ts` verifying no `node:` imports in dist output
    - Create `src/services/specforge/__tests__/typeBaseline.test.ts` verifying tsc exits cleanly
    - _Requirements: 1.5, 1.6, 2.6, 3.1_

- [x] 2. Checkpoint — Infrastructure baseline
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Core Type Definitions and Zod Schemas
  - [x] 3.1 Define new type interfaces in specforgeTypes.ts
    - Add `StandaloneSpecForgeWorkspace`, `SpecPackageAssignment`, `SpecSupplierQuote`, `SpecPurchaseOrder`, `DeliveryScheduleEntry`, `SpecDeliveryRecord`, `SpecWarrantyRecord`, `SpecAddendum`, `SpecAwardRequest` interfaces
    - Add `SpecItemClientDecisionFields`, `SpecQsReview`, `ExtendedProcurementStatus`, `ExtendedSpecProcurementEntry` types
    - Add `EnhancedAuditEvent`, `EnhancedInboxEvent` interfaces
    - Add `ConnectorLevel`, `SupplierConnector`, `CatalogueSearchParams`, `CatalogueSearchResult`, `CsvImportResult` interfaces
    - _Requirements: 4.1, 5.2, 6.2, 7.3, 9.4, 10.2, 10.6, 10.8, 10.11, 11.5, 12.9, 12.10_

  - [x] 3.2 Create Zod validation schemas for new endpoints
    - Add `clientDecisionSchema`, `qsReviewSchema`, `substitutionRequestSchema`, `substitutionApprovalSchema` in a new schemas file or extend existing `specforgeSchemas.ts`
    - Add `standaloneWorkspaceCreateSchema`, `packageAssignmentSchema`
    - Define `csvUploadConstraints` constants
    - Validate all schemas compile without errors
    - _Requirements: 5.2, 6.2, 6.3, 11.10, 4.2, 4.10, 7.3_

- [x] 4. Standalone Workspace Service
  - [x] 4.1 Implement standaloneWorkspaceService.ts
    - Create `src/services/specforge/standaloneWorkspaceService.ts`
    - Implement `create()` — persist to `users/{uid}/standaloneSpecForgeWorkspaces/{id}` or `firms/{firmId}/standaloneSpecForgeWorkspaces/{id}` based on scope
    - Implement `list()` — return union of user-scoped and firm-scoped workspaces, max 100, ordered by last-modified desc
    - Implement `assignToProject()` — atomic migration using Firestore batch writes with rollback on partial failure
    - Validate projectReference 1-500 chars, reject 409 if project already has workspace
    - Write audit event on assignment including original path, target project, user, timestamp
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10_

  - [ ]* 4.2 Write property tests for standalone workspace
    - **Property 22: Standalone Workspace Listing Scope**
    - **Property 23: Standalone Workspace Project Reference Validation**
    - **Validates: Requirements 4.2, 4.8, 4.10**

  - [ ]* 4.3 Write unit tests for standalone workspace
    - Test migration rollback on partial failure (Req 4.5)
    - Test 409 conflict when project has existing workspace (Req 4.7)
    - Test procurement operations blocked without approved baseline (Req 4.9)
    - _Requirements: 4.5, 4.7, 4.9_

- [x] 5. Client Decision Service and Endpoint
  - [x] 5.1 Implement clientDecisionService.ts
    - Create `src/services/specforge/clientDecisionService.ts`
    - Implement `recordDecision()` — validate item exists (404), validate `clientDecision` field is true (400), write decision fields only (decidedBy, decidedAt, decisionComment, status)
    - Support overwrite of prior decisions with audit of previous value
    - Write Audit_Event (action = approved|rejected, target type = item)
    - Generate Inbox_Event for users with `view_all` capability
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ]* 5.2 Write property tests for client decision
    - **Property 1: Capability Enforcement** (client decision portion)
    - **Property 2: Client Decision Write Isolation**
    - **Validates: Requirements 5.1, 5.2, 5.5, 5.8**

  - [ ]* 5.3 Write unit tests for client decision
    - Test 404 when item not found
    - Test 400 when item's clientDecision is false
    - Test overwrite scenario with audit of previous value
    - _Requirements: 5.6, 5.7, 5.8_

- [x] 6. QS Review Service and Endpoint
  - [x] 6.1 Implement qsReviewService.ts
    - Create `src/services/specforge/qsReviewService.ts`
    - Implement `submitReview()` — validate with Zod (400 on failure), write review record, update item estimatedCost if revisedEstimate provided
    - Implement budget threshold check — if estimatedCost > budgetAllowance * 1.1, emit Inbox_Event to `view_all` + `approve_client_decision` users
    - Write Audit_Event with previous/new estimated cost
    - Return 404 if project or item not found
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 6.2 Write property tests for QS review
    - **Property 3: QS Review Input Validation**
    - **Property 4: QS Budget Threshold Warning**
    - **Property 5: QS Revised Estimate Propagation**
    - **Validates: Requirements 6.3, 6.5, 6.6**

  - [ ]* 6.3 Write unit tests for QS review
    - Test 404 for missing project/item
    - Test budget warning generation at exact threshold boundary
    - Test no budget warning when overage ≤ 10%
    - _Requirements: 6.5, 6.7_

- [x] 7. Supplier Visibility Filter
  - [x] 7.1 Implement supplierVisibilityFilter.ts
    - Create `src/services/specforge/supplierVisibilityFilter.ts`
    - Implement `getVisibleItems()` — query specPackageAssignments by user UID, return only items with status in [issued, rfq, ordered, delivered, installed] AND belonging to assigned packages
    - Implement `getVisibleProcurement()` — filter procurement entries by supplier firm name (case-insensitive) or item in assigned packages
    - Implement `getVisibleRfqs()` — return only RFQs where user UID is in invitedSuppliers array
    - Return empty list if no assignments (fail-closed)
    - Strip budget summaries, other supplier quotes, client commercial data, QS review notes from responses
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [ ]* 7.2 Write property tests for supplier visibility
    - **Property 6: Supplier Visibility Filter Correctness**
    - **Validates: Requirements 7.1, 7.2, 7.5, 7.7, 7.8**

  - [ ]* 7.3 Write unit tests for supplier visibility
    - Test fail-closed behavior (no assignments → empty result)
    - Test revoked assignment exclusion within 5 seconds
    - Test procurement entry filtering by firm name (case-insensitive)
    - _Requirements: 7.5, 7.7, 7.9_

- [x] 8. Checkpoint — Core services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. RFQ Writeback Correction
  - [x] 9.1 Implement rfqWritebackService.ts
    - Create `src/services/specforge/rfqWritebackService.ts`
    - Refactor `writeBackToSpecForge` in `src/services/rfqMarketplace/rfqIntegrationService.ts` to delegate to the new service
    - Write to `projects/{projectId}/specProcurement/{entryId}` via repository interface (`updateProcurementEntry`)
    - Create new procurement entries when `specProcurementEntryId` doesn't exist (with status `ordered`)
    - Remove ALL references to legacy path `projects/{projectId}/specforge/entries/{id}/data`
    - Write Audit_Event recording RFQ ID, awarded supplier, updated spec item IDs, timestamp
    - Log warning (skip, don't block) if specItemId doesn't exist
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ]* 9.2 Write property tests for RFQ writeback
    - **Property 7: RFQ Writeback Path Correctness**
    - **Validates: Requirements 8.1, 8.4, 8.8**

  - [ ]* 9.3 Write integration tests for RFQ writeback
    - Test end-to-end writeback with valid award data
    - Test creation of new procurement entry when entryId missing
    - Test skip behavior when specItemId doesn't exist
    - _Requirements: 8.5, 8.6, 8.7_

- [x] 10. Product Catalogue Adapter
  - [x] 10.1 Implement productCatalogueAdapter.ts
    - Create `src/services/specforge/productCatalogueAdapter.ts`
    - Implement `search()` — query Firestore `productCatalogue` in production (not mock data), scope filtering (personal=userId, practice=firmId, platform/manufacturer/standards=no tenant restriction)
    - Implement pagination with offset/limit, clamp limit to max 200
    - Implement `uploadCsv()` — parse CSV (max 10MB, 5000 rows), validate each row against SpecLibraryItem schema, persist valid rows, return import/rejection summary with per-row reasons
    - Define `SupplierConnector` interface with `searchProducts`, `getProductDetail`, `checkAvailability`, `getPricing` methods (Levels 0–6)
    - Add Specifile licensing guard — check firm subscription before returning Specifile-sourced products
    - Normalize all results to `SpecLibraryItem` (typicalCostRange in whole Rands, leadTimeRange as positive integers, sustainability/finishes/clauses with defaults)
    - Return `degraded: true` on timeout (5s) or unavailability, never fall back to mock in production
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [ ]* 10.2 Write property tests for product catalogue
    - **Property 8: Product Catalogue Scope Filtering**
    - **Property 9: CSV Import Partial Success**
    - **Property 10: Product Normalization**
    - **Property 11: Pagination Limit Clamping**
    - **Validates: Requirements 9.2, 9.3, 9.7, 9.8, 9.9**

  - [ ]* 10.3 Write unit tests for product catalogue
    - Test Specifile licensing guard (expired subscription exclusion)
    - Test degraded response on timeout
    - Test CSV rejection reasons include row number and error
    - _Requirements: 9.5, 9.6, 9.9_

- [x] 11. Procurement Lifecycle Service
  - [x] 11.1 Implement procurementLifecycleService.ts
    - Create `src/services/specforge/procurementLifecycleService.ts`
    - Implement `verifyApprovedBaseline()` — check for issued snapshot with `issueStatus = 'issued_snapshot'`, reject procurement ops with 400 if missing
    - Implement `createRfq()` — store RFQ, write Audit_Event
    - Implement `submitQuote()` — store supplier quote as separate record (support 2–20 per item)
    - Implement `requestAward()` — create award request with `pending_approval` status, require capability gate
    - Implement `approveAward()` — verify approver has `approve_substitution` or `approve_technical_section`, generate PO on approval
    - Implement `rejectAward()` — record rejection reason, retain `pending_award`, emit Inbox_Event
    - Implement `recordDelivery()` — support partial/rejected/full statuses, write Audit_Event
    - Implement `confirmSiteAcceptance()` — unblock payment, emit Inbox_Event to `review_budget` users
    - Implement `uploadWarranty()` — store warranty record linked to entry and item (min 1 document ref)
    - Implement `checkCloseoutEligibility()` — all line items `installed` AND warranty uploaded → eligible
    - Implement `calculateLatestOrderDate()` — requiredOnSiteDate minus leadTimeDays, flag `missing_lead_time` if undefined
    - Handle addendum creation with supplier notification via Inbox_Event
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 10.11, 10.12, 10.13, 10.14_

  - [ ]* 11.2 Write property tests for procurement lifecycle
    - **Property 12: Procurement Requires Approved Baseline**
    - **Property 13: Award Requires Approval Gate**
    - **Property 14: Delivery Status and Payment Blocking**
    - **Property 15: Closeout Eligibility**
    - **Property 16: Latest-Order-Date Calculation**
    - **Validates: Requirements 4.9, 10.1, 10.4, 10.8, 10.9, 10.12, 10.13, 10.14, 12.2, 12.4, 12.5**

  - [ ]* 11.3 Write unit tests for procurement lifecycle
    - Test addendum notification to invited suppliers (Req 10.3)
    - Test award rejection retains pending_approval status (Req 10.5)
    - Test PO generation on award approval (Req 10.6)
    - Test site acceptance unblocks payment (Req 10.10)
    - Test latest-order-date 14-day warning Inbox_Event (Req 10.13)
    - _Requirements: 10.3, 10.5, 10.6, 10.10, 10.13_

- [x] 12. Substitution Service and Endpoints
  - [x] 12.1 Implement substitutionService.ts
    - Create `src/services/specforge/substitutionService.ts`
    - Implement `requestSubstitution()` — validate body with Zod (400 on failure), validate originalItemId exists and is not superseded (409), create substitution record
    - Flag procurement impact warning if item status is ordered or later
    - Generate Inbox_Event for `approve_substitution` users
    - Implement `approveSubstitution()` — multi-gate logic: if clientDecision=true, require additional client approval; if ownerRole is professional, require professional approval
    - On all approvals granted: atomically set original item to `superseded`, create replacement item with `approved` status, write Audit_Event
    - Implement `rejectSubstitution()` — set status `rejected`, preserve original unchanged, emit Inbox_Event to requester
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9, 11.10_

  - [ ]* 12.2 Write property tests for substitution
    - **Property 17: Substitution Multi-Gate Approval**
    - **Property 18: Substitution Request Validation**
    - **Property 19: Substitution Procurement Impact Warning**
    - **Property 20: Substitution Rejection Preserves Original**
    - **Validates: Requirements 11.3, 11.4, 11.7, 11.8, 11.10, 12.3**

  - [ ]* 12.3 Write unit tests for substitution
    - Test 409 for already-superseded item (Req 11.9)
    - Test multi-gate approval with clientDecision=true
    - Test multi-gate approval with professional ownerRole
    - Test atomic item supersession and replacement creation
    - _Requirements: 11.3, 11.4, 11.5, 11.9_

- [x] 13. Checkpoint — All services implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Cross-Cutting Governance Layer
  - [x] 14.1 Enhance audit and inbox adapters for triple-write
    - Extend `specforgeAuditAdapter.ts` to support `EnhancedAuditEvent` schema (performedBy, action, targetId, targetType, timestamp, previousValue/newValue capped at 10,000 chars)
    - Extend `specforgeInboxAdapter.ts` to support `EnhancedInboxEvent` schema (targetUsers/role, eventType, sourceEntityType/Id, message ≤ 500 chars, deepLinkRoute)
    - Create `specforgeProjectRecordAdapter.ts` for ProjectRecord triple-write integration
    - Ensure every service (clientDecision, qsReview, standalone, substitution, procurement, rfqWriteback) calls all three adapters on state transitions
    - _Requirements: 12.1, 12.9, 12.10_

  - [ ]* 14.2 Write property tests for governance
    - **Property 21: Governance Triple-Write Invariant**
    - **Validates: Requirements 12.1, 12.9, 12.10**

  - [ ]* 14.3 Write unit tests for governance guardrails
    - Test procurement blocked without approved baseline (Req 12.2)
    - Test substitution blocked without required approvals (Req 12.3)
    - Test award/PO blocked without approval gate (Req 12.4)
    - Test payment blocked without delivery confirmation (Req 12.5)
    - Test supplier visibility enforced on every response (Req 12.6)
    - Test no mock data in production paths (Req 12.7)
    - _Requirements: 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 15. API Router Integration — Wire All Endpoints
  - [x] 15.1 Add standalone workspace routes to specforge-api-router.ts
    - `POST /api/specforge/standalone-workspaces` — create standalone workspace (requires auth)
    - `GET /api/specforge/standalone-workspaces` — list user's standalone workspaces
    - `POST /api/specforge/standalone-workspaces/:workspaceId/assign` — assign to project
    - Wire Zod validation, capability checks, and service delegation
    - _Requirements: 4.1, 4.2, 4.8_

  - [x] 15.2 Add client decision and QS review routes to specforge-api-router.ts
    - `POST /api/specforge/:projectId/items/:itemId/client-decision` — requires `approve_client_decision`
    - `POST /api/specforge/:projectId/items/:itemId/qs-review` — requires `review_budget`
    - Wire Zod validation, capability middleware, service delegation
    - _Requirements: 5.1, 6.1_

  - [x] 15.3 Add supplier visibility middleware to specforge-api-router.ts
    - Apply supplier visibility filter on GET endpoints when user role is `supplier` or `subcontractor`
    - Filter items, procurement entries, and RFQs through the SupplierVisibilityFilter before returning responses
    - Add package assignment CRUD routes for admin use
    - _Requirements: 7.1, 7.4, 7.6_

  - [x] 15.4 Add substitution routes to specforge-api-router.ts
    - `POST /api/specforge/:projectId/substitutions` — requires `request_substitution`
    - `PATCH /api/specforge/:projectId/substitutions/:substitutionId` — requires `approve_substitution`
    - Wire Zod validation, capability middleware, multi-gate service delegation
    - _Requirements: 11.1, 11.2_

  - [x] 15.5 Add procurement lifecycle routes to specforge-api-router.ts
    - `POST /api/specforge/:projectId/rfqs` — create RFQ (requires approved baseline check)
    - `POST /api/specforge/:projectId/rfqs/:rfqId/quotes` — submit supplier quote
    - `POST /api/specforge/:projectId/procurement/:entryId/award-request` — request award
    - `PATCH /api/specforge/:projectId/award-requests/:awardId` — approve/reject award
    - `POST /api/specforge/:projectId/procurement/:entryId/delivery` — record delivery
    - `POST /api/specforge/:projectId/procurement/:entryId/site-acceptance` — confirm site acceptance
    - `POST /api/specforge/:projectId/procurement/:entryId/warranty` — upload warranty
    - Wire approved baseline verification, capability checks, and service delegation
    - _Requirements: 10.1, 10.2, 10.4, 10.7, 10.8, 10.9, 10.11_

  - [x] 15.6 Add product catalogue routes to specforge-api-router.ts
    - `GET /api/specforge/catalogue/search` — search products with scope/pagination
    - `POST /api/specforge/catalogue/csv-upload` — CSV upload endpoint
    - Wire pagination clamping, scope filtering, and service delegation
    - _Requirements: 9.1, 9.3, 9.8_

- [ ] 16. Capability Enforcement Property Test
  - [ ]* 16.1 Write cross-cutting capability enforcement property test
    - **Property 1: Capability Enforcement**
    - Test all new endpoints reject users whose SpecForge role lacks the declared capability
    - Covers: client-decision (approve_client_decision), qs-review (review_budget), substitutions POST (request_substitution), substitutions PATCH (approve_substitution)
    - **Validates: Requirements 5.1, 6.1, 11.1, 11.2**

- [x] 17. Final Integration and Wiring
  - [x] 17.1 Wire rfqIntegrationService.ts to use new rfqWritebackService
    - Update `src/services/rfqMarketplace/rfqIntegrationService.ts` to call `rfqWritebackService` methods
    - Remove all direct Firestore `setDoc` calls to legacy path
    - Ensure Zod validation and audit logging are applied through repository interface
    - _Requirements: 8.1, 8.4, 8.8_

  - [x] 17.2 Wire specforgeService.ts searchSpecLibrary to use productCatalogueAdapter
    - Update `searchSpecLibrary` in existing `specforgeService.ts` to delegate to `productCatalogueAdapter.search()` when `VITE_DEMO_MODE !== 'true'`
    - Retain mock data path only for demo mode
    - _Requirements: 9.1, 12.7_

- [x] 18. Final Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document using fast-check
- Unit tests validate specific examples and edge cases
- All services follow the existing pattern: Zod validation → repository write → audit + inbox emit
- The supplier visibility filter is server-side only — never rely on client-side filtering
- All Firestore atomic operations use batched writes or transactions with proper rollback
- Test files are organized under `src/services/specforge/__tests__/` as specified in the design

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["4.1", "5.1", "6.1", "7.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "5.2", "5.3", "6.2", "6.3", "7.2", "7.3"] },
    { "id": 5, "tasks": ["9.1", "10.1", "11.1", "12.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "10.2", "10.3", "11.2", "11.3", "12.2", "12.3"] },
    { "id": 7, "tasks": ["14.1"] },
    { "id": 8, "tasks": ["14.2", "14.3", "15.1", "15.2", "15.3", "15.4", "15.5", "15.6"] },
    { "id": 9, "tasks": ["16.1", "17.1", "17.2"] }
  ]
}
```
