# Implementation Plan: SpecForge Integration

## Overview

This plan implements SpecForge's production integration layer: Firestore persistence (`FirestoreSpecForgeRepository`), a dedicated Express API router with role-based access, Zod validation schemas, and five platform spine adapters (Passport, Inbox, Audit, Drawing Register, Product Catalogue). Tasks build incrementally — core infrastructure first, then domain services, then spine wiring, then validation.

## Tasks

- [x] 1. Set up Zod validation schemas and custom error classes
  - [x] 1.1 Create `src/services/specforge/specforgeSchemas.ts` with Zod schemas
    - Define `specItemSchema`, `specItemUpdateSchema`, `specSectionSchema`, `specSectionUpdateSchema`, `specApprovalSchema`, `specSubstitutionSchema`, `specWorkspaceSchema`, `issueRequestSchema`, `specProcurementEntryUpdateSchema`
    - Each schema must enforce required fields, correct types, and constraints matching the `specforgeTypes.ts` definitions
    - Export all schemas for use in repository and API layers
    - _Requirements: 1.8, 4.12_

  - [x] 1.2 Create `src/services/specforge/specforgeErrors.ts` with custom error classes
    - Implement `SpecForgeValidationError` (wraps Zod issues), `SpecForgeNotFoundError` (resource + id), `SpecForgeImmutableError` (resource name), `SpecForgeCapabilityError` (role + capability)
    - Each class extends `Error` with descriptive `name` property
    - _Requirements: 1.8, 1.9, 2.2, 2.4, 5.10_

  - [ ]* 1.3 Write property test for schema validation (Property 4)
    - **Property 4: Schema Validation Rejects Invalid Writes**
    - Generate arbitrary objects violating Zod schemas (missing required fields, wrong types, constraint violations) and verify validation throws `SpecForgeValidationError`
    - Use fast-check arbitraries that produce invalid variants of `SpecItem`, `SpecSection`, `SpecApproval`, `SpecSubstitution`
    - **Validates: Requirements 1.8, 4.12**

- [x] 2. Implement FirestoreSpecForgeRepository
  - [x] 2.1 Create `src/services/specforge/firestoreSpecForgeRepository.ts` implementing `SpecForgeRepository`
    - Import `adminDb` from `@/lib/firebase-admin`
    - Implement helper `col(projectId, subcol)` for subcollection references
    - Implement `getWorkspace`, `saveWorkspace` (set with merge)
    - Implement `addItem`, `updateItem` (verify existence first), `deleteItem` (verify existence first)
    - Implement `addSection`, `updateSection` (verify existence first)
    - All write methods validate input against Zod schemas before writing; throw `SpecForgeValidationError` on failure
    - `updateItem`/`updateSection`/`deleteItem` throw `SpecForgeNotFoundError` if document missing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10_

  - [x] 2.2 Implement immutable snapshot and append-only audit methods
    - `saveSnapshot` uses Firestore `create()` (not `set()`) — throws on duplicate snapshotId
    - `logAuditEvent` uses `create()` — append-only semantics
    - No `updateSnapshot`, `deleteSnapshot`, `updateAuditEvent`, `deleteAuditEvent` methods exposed
    - Reject any attempt to modify/delete snapshots or audit events with `SpecForgeImmutableError`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [x] 2.3 Implement ordered retrieval methods with limit clamping
    - `getSnapshots(projectId)` — ordered by `issuedAt` DESC, max 500
    - `getAuditEvents(projectId, limit?)` — ordered by `performedAt` DESC, limit clamped to [1, 500], default 50
    - `getApprovals(projectId)` — ordered by `requestedAt` DESC
    - `getSubstitutions(projectId)` — ordered by `requestedAt` DESC
    - _Requirements: 2.5, 2.6, 3.2, 3.4_

  - [x] 2.4 Implement approval, substitution, and procurement persistence
    - `saveApproval` — write to `specApprovals/{approvalId}`
    - `saveSubstitution` — write to `specSubstitutions/{subId}`
    - `getProcurementEntries` — return all entries for project
    - `updateProcurementEntry` — verify existence, merge partial updates, throw `SpecForgeNotFoundError` if missing
    - _Requirements: 3.1, 3.3, 3.5, 3.6, 3.7, 3.8_

  - [x] 2.5 Update repository factory in `src/services/specforge/specforgeRepository.ts`
    - Add `initSpecForgeRepository()` function that checks `VITE_DEMO_MODE`
    - Return `LocalSpecForgeRepository` in demo mode, `FirestoreSpecForgeRepository` in production
    - Update `getSpecForgeRepository()` to use `initSpecForgeRepository()` as default factory
    - _Requirements: 11.4_

  - [ ]* 2.6 Write property tests for repository persistence (Properties 1–3, 5–7)
    - **Property 1: Persistence Round-Trip** — save then retrieve produces equal object
    - **Property 2: Partial Update Field Preservation** — update changes only specified fields
    - **Property 3: Not-Found Error on Missing Documents** — update/delete on non-existent throws NotFoundError
    - **Property 5: Snapshot and Audit Event Immutability** — modify/delete attempts rejected
    - **Property 6: Duplicate Snapshot Rejection** — same snapshotId rejected with conflict error
    - **Property 7: Ordered Retrieval with Limit Clamping** — results ordered DESC, count respects clamped limit
    - Place in `src/services/specforge/__tests__/firestoreRepository.property.test.ts`
    - Use mocked `adminDb` with in-memory state for deterministic property testing
    - **Validates: Requirements 1.1–1.9, 2.1–2.7, 3.1–3.7**

- [x] 3. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement API router with role-based access
  - [x] 4.1 Create `src/lib/specforge-api-router.ts` with Express 5 router
    - Mount at `/api/specforge` in server entry points (`server.ts` and `api-server.ts`)
    - Apply `requireAuth` middleware to all routes
    - Implement `requireCapability` middleware using `toSpecForgeRole` + `specRoleCan`
    - Define all CRUD routes: GET workspace, POST/PATCH/DELETE items, POST/PATCH sections
    - Define workflow routes: POST issue, POST/PATCH approvals, POST/PATCH substitutions, GET/PATCH procurement
    - Define read-only routes: GET snapshots, GET audit (with limit query param clamped to [1, 200], default 50)
    - Map errors to HTTP status codes: 400 (validation), 401 (auth), 403 (capability), 404 (not found), 409 (duplicate)
    - _Requirements: 4.1–4.12, 5.1–5.10, 6.1–6.4_

  - [x] 4.2 Implement item visibility filtering in workspace GET handler
    - Call `getVisibleSpecItems(workspace, role)` to filter items by role capability
    - `view_all` → all items; `view_client_items` → clientDecision OR approved/issued status
    - `view_issued` → issued/rfq/ordered/delivered/installed/as_built status
    - `view_assigned` → ownerRole/reviewerRole/approverRole match
    - `view_package` → issued pipeline items scoped to assignments
    - No view capabilities → empty item array
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 4.3 Mount specforge router in `server.ts` and `api-server.ts`
    - Import `specforgeRouter` from `@/lib/specforge-api-router`
    - Mount with `app.use('/api/specforge', specforgeRouter)` alongside existing routers
    - _Requirements: 4.1_

  - [ ]* 4.4 Write property test for role capability enforcement (Property 8)
    - **Property 8: Role Capability Enforcement**
    - For any role/capability pair, `specRoleCan` returns true iff capability is in the role's set
    - For API requests where mapped role lacks capability, verify 403 response
    - Place in `src/services/specforge/__tests__/specforgeService.property.test.ts`
    - **Validates: Requirements 5.10, 6.1, 6.3**

  - [ ]* 4.5 Write property test for item visibility filtering (Property 9)
    - **Property 9: Item Visibility Filtering by Role**
    - Generate arbitrary workspaces with mixed item statuses/roles, verify filter rules
    - Place in `src/services/specforge/__tests__/specforgeService.property.test.ts`
    - **Validates: Requirements 6.5, 6.6, 6.7, 6.8, 6.9**

- [x] 5. Implement Project Passport adapter
  - [x] 5.1 Create `src/services/specforge/specforgePassportAdapter.ts`
    - Implement `buildSpecForgePassportData(workspace)` — computes budget summary (allowance sum, estimate sum, delta, deltaPct), readiness counts (blockers, pendingClientDecisions, longLeadItemCount where leadTimeDays ≥ 56), issue status, latest revision
    - Implement `specForgeRiskFindings(data)` — returns RiskFinding array; if deltaPct > 10% set risk to `high` with budget category
    - Return null values when workspace is null (no error)
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 5.2 Wire passport adapter into `projectPassportService.ts`
    - Import `buildSpecForgePassportData` and `specForgeRiskFindings`
    - Call within `buildProjectPassport()` to include SpecForge data in passport output
    - Record `WorkflowEvent` of type `project_phase_changed` when spec is issued
    - _Requirements: 7.4_

  - [ ]* 5.3 Write property tests for passport data correctness (Properties 10–11)
    - **Property 10: Passport Data Correctness** — budget sums match item totals, readiness counts accurate
    - **Property 11: Budget Risk Threshold Escalation** — deltaPct > 10% → risk level ≥ high with budget finding
    - Place in `src/services/specforge/__tests__/specforgeService.property.test.ts`
    - **Validates: Requirements 7.1, 7.2, 7.5**

- [x] 6. Implement Inbox/Action Centre adapter
  - [x] 6.1 Create `src/services/specforge/specforgeInboxAdapter.ts`
    - Implement `emitApprovalCreatedEvent` — targets users with matching reviewer capability
    - Implement `emitClientDecisionEvent` — targets users with `approve_client_decision`
    - Implement `emitIssueNotifications` — one event per recipient, capped at 200
    - Implement `emitSubstitutionEvent` — targets users with `approve_substitution`
    - Implement `emitBudgetWarning` — triggers when estimatedCost > budgetAllowance × 1.1
    - Implement `emitLongLeadWarning` — triggers when leadTimeDays ≥ 56
    - Implement deduplication check — skip if unresolved event with same trigger type + item + recipient exists
    - Implement fallback — if no matching recipients, route to admin role users
    - Use `inboxEventAdapter` from platform spine for actual event creation
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [ ]* 6.2 Write property tests for inbox event routing (Properties 12–15)
    - **Property 12: Inbox Event Routing to Correct Recipients** — events target correct capability holders
    - **Property 13: Threshold-Based Warning Generation** — budget > 110% generates warning; leadTime ≥ 56 generates warning
    - **Property 14: Issue Event Fan-Out with Recipient Cap** — N recipients → N events (capped at 200)
    - **Property 15: Inbox Event Deduplication** — duplicate trigger type + item + recipient not re-emitted
    - Place in `src/services/specforge/__tests__/specforgeInboxAdapter.property.test.ts`
    - **Validates: Requirements 8.1–8.6, 8.9**

- [x] 7. Implement Audit Trail adapter
  - [x] 7.1 Create `src/services/specforge/specforgeAuditAdapter.ts`
    - Implement `logSpecForgeAction(params)` — persists `SpecAuditEvent` to both SpecForge collection and platform audit trail
    - Record previous/new values for updates, each capped at 10,000 characters
    - Record snapshotId, revision, auditHash for issue snapshot creation
    - Queue retry (exponential backoff, max 3) if platform audit service unavailable
    - Only call after successful write — never on failed/rolled-back operations
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 7.2 Wire audit adapter into specforge service layer
    - Call `logSpecForgeAction` after each successful write in API handlers (create, update, delete, issue, approve, substitute, status_change)
    - Ensure audit is NOT called when write fails (validation error, not-found, rollback)
    - _Requirements: 9.1, 9.7_

  - [ ]* 7.3 Write property tests for audit trail (Properties 16–18)
    - **Property 16: Audit Event Completeness** — every successful write produces corresponding audit event with correct fields
    - **Property 17: Audit Change Capture with Cap** — updates record prev/new values, each ≤ 10,000 chars
    - **Property 18: Failed Write Produces No Audit Event** — failed operations yield zero audit events
    - Place in `src/services/specforge/__tests__/specforgeAuditAdapter.property.test.ts`
    - **Validates: Requirements 9.1, 9.2, 9.7**

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement Drawing Register adapter
  - [x] 9.1 Create `src/services/specforge/specforgeDrawingAdapter.ts`
    - Implement `resolveDrawingRefs(drawingRefs, projectId)` — queries `documentRegisterService` and `revisionControlService` for each ref
    - Return `DrawingRefResolution` array with drawingNumber, title, currentRevision, discipline, status (current/superseded/not_found)
    - For superseded drawings, include `supersededBy` with drawingNumber, drawingId, revision
    - Implement `buildDrawingWarnings(resolutions)` — generate structured warning for each superseded ref (severity: "high")
    - Implement degradation handling — if Drawing Register unavailable, return unresolved refs with `degraded: true` flag
    - Cache last-known revision status for 60 seconds
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 9.2 Wire drawing resolution into API item responses
    - When returning items with `drawingRefs`, call `resolveDrawingRefs` and attach enriched data
    - Include structured warnings for superseded drawings in response
    - Include `degraded` flag when Drawing Register unavailable
    - _Requirements: 10.3, 10.5, 10.6_

  - [ ]* 9.3 Write property tests for drawing resolution (Properties 19–20)
    - **Property 19: Superseded Drawing Warning Generation** — superseded refs produce warning with affected ref, superseding ref, severity "high"
    - **Property 20: Drawing Reference Enrichment Completeness** — resolved refs include drawingNumber, title, revision, discipline, status
    - Place in `src/services/specforge/__tests__/specforgeDrawingAdapter.property.test.ts`
    - **Validates: Requirements 10.2, 10.3, 10.5**

- [x] 10. Implement Product Catalogue/Library adapter
  - [x] 10.1 Create `src/services/specforge/specforgeLibraryAdapter.ts`
    - Implement `searchProductCatalogue(params: LibrarySearchParams)` — query product data source in production, mock in demo
    - Apply scope filter (personal, practice, platform, manufacturer, standards) when provided
    - Perform case-insensitive substring search across title, category, tags, supplier fields
    - Support pagination with offset (default 0) and limit (default 50, max 200)
    - Sort results by `usageCount` descending
    - Return `{ items, total, error?: boolean }` — empty array with `error: true` when data source unavailable
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [ ]* 10.2 Write property tests for library search (Properties 21–22)
    - **Property 21: Library Search Correctness** — results match scope and contain query in title/category/tags/supplier
    - **Property 22: Library Pagination and Ordering** — result count ≤ clamped limit, sorted by usageCount DESC
    - Place in `src/services/specforge/__tests__/specforgeLibraryAdapter.property.test.ts`
    - **Validates: Requirements 12.2, 12.3, 12.6, 12.8**

- [x] 11. Implement auto-workspace creation for multi-project support
  - [x] 11.1 Implement workspace auto-creation logic in workspace GET handler
    - When GET `/api/specforge/:projectId/workspace` finds no workspace, create a new one
    - New workspace: project ID, project name, `issueStatus: 'draft'`, empty items
    - Seed sections from project discipline (or empty if no discipline defined)
    - Persist to Firestore before returning response
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ]* 11.2 Write property test for auto-workspace creation (Property 23)
    - **Property 23: Auto-Workspace Creation for New Projects**
    - For any project ID with no existing workspace, GET creates workspace with correct defaults
    - Verify projectId, name, `issueStatus: 'draft'`, empty items, discipline-seeded sections
    - Place in `src/services/specforge/__tests__/specforgeWorkspace.property.test.ts`
    - **Validates: Requirements 11.2, 11.5**

- [x] 12. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check` (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The existing `SpecForgeRepository` interface and `LocalSpecForgeRepository` are already in place — this plan adds the production implementation
- Firestore mocking strategy: unit/property tests mock `adminDb` methods; integration tests can use the Firestore emulator
- Router follows the `finance-api-router.ts` pattern — dedicated file, mounted in both server entry points

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 3, "tasks": ["2.5", "2.6"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5", "5.1", "6.1", "7.1"] },
    { "id": 7, "tasks": ["5.2", "5.3", "6.2", "7.2", "7.3"] },
    { "id": 8, "tasks": ["9.1", "10.1"] },
    { "id": 9, "tasks": ["9.2", "9.3", "10.2", "11.1"] },
    { "id": 10, "tasks": ["11.2"] }
  ]
}
```
