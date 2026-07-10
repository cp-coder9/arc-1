# Requirements Document

## Introduction

This document specifies the hardening work required to bring the SpecForge specification spine to full production readiness within the Architex platform. SpecForge exists today as a meaningful but incomplete implementation (estimated 45–55% complete). The existing core types, business logic, Firestore repository, API router, UI workspace, and platform adapters are already built or specified in the separate `specforge-integration` spec. This spec covers the critical blockers, missing features, and production safeguards that must be resolved before SpecForge can operate as a real production system — organized into six phases from immediate blockers through full procurement lifecycle.

## Glossary

- **SpecForge_Router**: The Express 5 router module at `src/lib/specforge-api-router.ts` providing server-side SpecForge endpoints.
- **Dev_Server**: The development Express server at `server.ts` with Vite middleware.
- **Prod_Server**: The production Express server at `api-server.ts` deployed to cPanel/DigitalOcean.
- **Vite_Bundler**: The Vite 6 build tool responsible for producing browser-safe client bundles.
- **TypeScript_Compiler**: The `tsc --noEmit` check that validates type correctness across the codebase.
- **Standalone_Workspace**: A SpecForge workspace that operates without an Architex project context, persisted under user or firm scope.
- **Client_Decision_Endpoint**: A dedicated API endpoint allowing clients to record approval/rejection decisions on spec items without mutating arbitrary spec fields.
- **QS_Review_Endpoint**: A dedicated API endpoint for quantity surveyors to submit budget reviews with the `review_budget` capability.
- **Package_Scope**: A grouping of spec items, sections, or RFQ line items assigned to a specific supplier or subcontractor for tendering and delivery.
- **Supplier_Visibility_Filter**: Server-side filtering that restricts supplier and subcontractor access to only their assigned packages and related data.
- **RFQ_Writeback**: The process by which RFQ marketplace award data is written back into SpecForge procurement entries using the correct Firestore collections.
- **Product_Catalogue_Adapter**: The interface layer connecting SpecForge's library search to real product data sources including CSV uploads, supplier connectors, and tenant-scoped catalogues.
- **Connector_Level**: A classification (Level 0 through Level 6) describing the integration sophistication between SpecForge and an external supplier system.
- **Procurement_Lifecycle**: The full workflow from approved baseline through RFQ, quoting, award, PO generation, delivery, site acceptance, payment release, and warranty handover.
- **Approved_Baseline**: A specification issue snapshot with status `issued` that has been formally approved, serving as the prerequisite for procurement operations.
- **Substitution_Endpoint**: A dedicated API endpoint pair for requesting and approving/rejecting specification substitutions with correct role capability enforcement.
- **Audit_Event**: An immutable record written to the `specAuditEvents` collection and platform audit trail on every state transition.
- **Inbox_Event**: A notification surfaced in the Action Centre when a user has a pending action, approval, or warning.
- **ProjectRecord**: A generic envelope in the Project Passport service recording lifecycle events from any platform module.

## Requirements

### Requirement 1: API Router Mount in Dev and Production Servers

**User Story:** As a frontend developer, I want the SpecForge API router to be reachable at `/api/specforge` in both development and production, so that the UI can communicate with the SpecForge backend.

#### Acceptance Criteria

1. WHEN the Dev_Server starts, THE Dev_Server SHALL mount the SpecForge_Router at the `/api/specforge` path prefix using lazy-loaded dynamic import, following the same pattern used for the marketplace, fee-proposal, practice, and BIM routers.
2. WHEN the Prod_Server starts, THE Prod_Server SHALL mount the SpecForge_Router at the `/api/specforge` path prefix using lazy-loaded dynamic import, following the same pattern used for the marketplace, fee-proposal, practice, and BIM routers.
3. WHEN the SpecForge_Router fails to load due to an import error, THE Dev_Server SHALL return a 500 response with a JSON body containing an `error` field with a human-readable description and a `details` field with the underlying error message, without crashing the server process.
4. WHEN the SpecForge_Router fails to load due to an import error, THE Prod_Server SHALL return a 500 response with a JSON body containing an `error` field with a human-readable description and a `details` field with the underlying error message, without crashing the server process.
5. WHEN a GET request is made to `/api/specforge/:projectId/workspace` on the Dev_Server, THE Dev_Server SHALL route the request to the SpecForge_Router workspace handler and return a 200 response with a JSON body.
6. WHEN a GET request is made to `/api/specforge/:projectId/workspace` on the Prod_Server, THE Prod_Server SHALL route the request to the SpecForge_Router workspace handler and return a 200 response with a JSON body.
7. THE Dev_Server SHALL mount the SpecForge_Router BEFORE the generic catch-all `/api` router mount, so that SpecForge routes are matched with higher priority than the general API router.
8. THE Prod_Server SHALL mount the SpecForge_Router BEFORE the generic catch-all `/api` router mount, so that SpecForge routes are matched with higher priority than the general API router.

### Requirement 2: Production Build — Remove Node-Only Imports from Browser Bundle

**User Story:** As a platform engineer, I want the Vite production build to complete without errors, so that the application can be deployed to production environments.

#### Acceptance Criteria

1. WHEN `npm run build` is executed, THE Vite_Bundler SHALL produce a successful production build that exits with code 0 and without any `node:crypto` resolution errors in client-side code paths.
2. WHEN a service file uses `node:crypto` for operations needed on both client and server (such as UUID generation), THE service SHALL use the Web Crypto API (`crypto.randomUUID()` or `crypto.getRandomValues()`) for any module that is imported—directly or transitively—by client-side code, or the service SHALL be split into a server-only module (retaining `node:crypto`) and a client-safe module (using Web Crypto API) where no client-bundled file imports the server-only module.
3. WHEN a service file uses `node:crypto` exclusively for server-side operations (hashing, HMAC, signing), THE service SHALL remain as a server-only module that is never imported—directly or transitively through barrel files or re-exports—by client-side React components or any module included in the browser bundle.
4. THE Vite_Bundler SHALL produce a clean build where no browser chunk references `node:crypto`, `node:fs`, `node:path`, or any other Node-only built-in module.
5. WHEN the `copilotService.ts` module is required by client-side code, THE module SHALL be restructured so that any `node:crypto` dependency is isolated to a server-only entry point that is not included in the browser bundle, and the client-importable portion of the module SHALL contain zero imports of Node-only built-in modules at any depth of its dependency tree.
6. WHEN `npm run build` completes successfully, THE production output in `dist/` SHALL contain zero occurrences of unresolved `node:` protocol imports when the JavaScript bundle files are statically inspected (e.g., via text search of all `.js` files in `dist/assets/`).

### Requirement 3: TypeScript Baseline — Zero Type Errors

**User Story:** As a developer, I want `tsc --noEmit` to pass with zero errors, so that the CI pipeline succeeds and type safety is maintained across the codebase.

#### Acceptance Criteria

1. WHEN `npm run lint` (tsc --noEmit -p tsconfig.app.json) is executed against the project source files, THE TypeScript_Compiler SHALL report zero type errors and exit with code 0.
2. WHEN `npm run lint:tests` (tsc --noEmit) is executed against the project test files, THE TypeScript_Compiler SHALL report zero type errors and exit with code 0.
3. THE `UserRole` type in `src/types.ts` SHALL include every role literal that the `toSpecForgeRole` mapping in `src/types/specforgeTypes.ts` references as a key, so that the mapping compiles without type assertions or `as` casts.
4. IF a new type or interface is added to `src/types/specforgeTypes.ts` that is consumed by an existing module, THEN THE TypeScript_Compiler SHALL validate the addition against all consuming modules and report zero new type errors when `npm run lint` is executed.
5. THE `toSpecForgeRole` mapping function in `src/types/specforgeTypes.ts` SHALL compile without any explicit type assertions (`as` casts), non-null assertions (`!`), or `@ts-ignore`/`@ts-expect-error` comments.

### Requirement 4: Standalone SpecForge Mode

**User Story:** As an architect, I want to create and manage specification workspaces without requiring an active Architex project, so that I can begin product selection and scheduling early and assign the workspace to a project later.

#### Acceptance Criteria

1. WHEN a user creates a standalone workspace without an active `projectId`, THE SpecForge_Router SHALL persist the workspace at `users/{uid}/standaloneSpecForgeWorkspaces/{workspaceId}` when the workspace is user-scoped, or at `firms/{firmId}/standaloneSpecForgeWorkspaces/{workspaceId}` when the workspace is firm-scoped.
2. WHEN a standalone workspace is created, THE SpecForge_Router SHALL accept a user-typed project reference string (free text name, address, or description) of 1 to 500 characters in place of a system `projectId`, and persist the reference on the workspace document.
3. WHILE a workspace is in standalone mode, THE Standalone_Workspace SHALL support all SpecForge operations including: product library search, pictorial schedule management, budget tracking, section and item CRUD, approval workflows, substitution requests, and PDF/CSV export — excluding procurement workflow operations restricted by criterion 9.
4. WHEN a user assigns a standalone workspace to an Architex project, THE SpecForge_Router SHALL atomically move the workspace data from the standalone collection to `projects/{projectId}/specWorkspaces/{workspaceId}` and update all subcollection paths (specItems, specSections, specApprovals, specSubstitutions, specProcurement, specAuditEvents) to the project-scoped collections, preserving the original free-text project reference as metadata on the migrated workspace.
5. IF the assignment migration partially fails (any subcollection write fails after the workspace document is created at the target path), THEN THE SpecForge_Router SHALL roll back all written documents at the target path and retain the workspace in its original standalone location unchanged, returning an error response indicating the migration failure.
6. WHEN a standalone workspace is assigned to a project, THE SpecForge_Router SHALL write an audit event recording the assignment including the original standalone path, the target project ID, the performing user, and the assignment timestamp.
7. IF a standalone workspace is assigned to a project that already has an active workspace, THEN THE SpecForge_Router SHALL reject the assignment with a 409 conflict response indicating the project already has a workspace.
8. WHEN a user lists their standalone workspaces, THE SpecForge_Router SHALL return all standalone workspaces owned by the user (from `users/{uid}/standaloneSpecForgeWorkspaces`) and all firm-scoped standalone workspaces for firms the user belongs to (from `firms/{firmId}/standaloneSpecForgeWorkspaces`), returning a maximum of 100 workspaces per request ordered by last-modified descending.
9. THE Standalone_Workspace SHALL NOT permit procurement workflow operations (RFQ, ordering, delivery) until the workspace is assigned to an Architex project and an approved baseline exists, where an approved baseline is defined as an issued snapshot (issueStatus = 'issued_snapshot') with at least one specItem in 'approved' or 'issued' status.
10. IF a user attempts to create a standalone workspace with a project reference string that is empty or exceeds 500 characters, THEN THE SpecForge_Router SHALL reject the request with a validation error indicating the reference must be between 1 and 500 characters.

### Requirement 5: Client Approval Flow — Dedicated Decision Endpoint

**User Story:** As a client, I want a dedicated endpoint to record my approval or rejection of spec items, so that I can make decisions without having the ability to mutate arbitrary specification fields.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/specforge/:projectId/items/:itemId/client-decision`, THE Client_Decision_Endpoint SHALL require the `approve_client_decision` capability and reject requests from roles lacking this capability with a 403 response.
2. WHEN a valid client decision request is submitted with a body containing `decision` (one of `approved` or `rejected`) and an optional `comment` (string, maximum 2000 characters), THE Client_Decision_Endpoint SHALL write the decision to the spec item record including: the decision value, the authenticated user's UID as `decidedBy`, the current ISO 8601 UTC timestamp as `decidedAt`, and the comment if provided.
3. WHEN a client decision is recorded, THE Client_Decision_Endpoint SHALL write an Audit_Event with action matching the decision value (`approved` or `rejected`), target type `item`, the item ID as target, and the decision details including the comment.
4. WHEN a client decision is recorded, THE Client_Decision_Endpoint SHALL generate an Inbox_Event for users with the `view_all` capability indicating the client's decision on the item, including the item code, decision value, and deciding user's name.
5. THE Client_Decision_Endpoint SHALL NOT permit the client to modify any spec item fields other than: the client decision status, `decidedBy`, `decidedAt`, and the decision comment.
6. IF the specified `itemId` does not exist in the project, THEN THE Client_Decision_Endpoint SHALL return a 404 response.
7. IF the spec item's `clientDecision` field is false (item does not require client input), THEN THE Client_Decision_Endpoint SHALL return a 400 response indicating the item does not accept client decisions.
8. IF a client decision has already been recorded for the item (decidedAt is not null), THEN THE Client_Decision_Endpoint SHALL overwrite the previous decision with the new one, recording a new audit event that includes the previous decision value.

### Requirement 6: QS Review — Dedicated Budget Review Endpoint

**User Story:** As a quantity surveyor, I want a dedicated endpoint for submitting budget reviews, so that my cost assessments are captured with proper audit trails and the correct capability enforcement.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/specforge/:projectId/items/:itemId/qs-review`, THE QS_Review_Endpoint SHALL require the `review_budget` capability and reject requests from roles lacking this capability with a 403 response.
2. WHEN a valid QS review is submitted with a body containing `reviewStatus` (one of: `approved`, `flagged`, or `requires_revision`), `comments` (non-empty string, maximum 2000 characters), and optional `revisedEstimate` (number in ZAR, minimum 0.01, maximum 999,999,999.99), THE QS_Review_Endpoint SHALL write the review record including: review status, reviewer UID, ISO 8601 UTC timestamp, comments, and revised estimate if provided.
3. IF the request body is missing `reviewStatus` or `comments`, or `reviewStatus` is not one of the allowed values, or `comments` is empty or exceeds 2000 characters, or `revisedEstimate` is present but outside the range 0.01–999,999,999.99, THEN THE QS_Review_Endpoint SHALL return a 400 response with an error message indicating the validation failure without writing any record.
4. WHEN a QS review is recorded, THE QS_Review_Endpoint SHALL write an Audit_Event with action `updated`, target type `item`, the item ID as target, and the review details including previous and new estimated cost if a revised estimate was provided.
5. WHEN a QS review is recorded and the item's resulting `estimatedCost` (updated by `revisedEstimate` if provided, otherwise the existing value) exceeds the item's `budgetAllowance` by more than 10%, THE QS_Review_Endpoint SHALL generate an Inbox_Event for users with the `view_all` capability and the `approve_client_decision` capability indicating the budget concern.
6. IF a `revisedEstimate` is provided, THEN THE QS_Review_Endpoint SHALL update the item's `estimatedCost` field to the revised value.
7. IF the specified `projectId` does not exist or the specified `itemId` does not exist in the project, THEN THE QS_Review_Endpoint SHALL return a 404 response.

### Requirement 7: Supplier and Subcontractor Package-Scoped Visibility

**User Story:** As a supplier, I want to see only the RFQs, packages, and issued items that are assigned to me, so that I cannot access unrelated project data, other suppliers' quotes, or confidential commercial information.

#### Acceptance Criteria

1. WHILE a user has the `supplier` or `subcontractor` SpecForge role, THE Supplier_Visibility_Filter SHALL restrict workspace item responses to ONLY include items that meet ALL of the following conditions: the item has status in [issued, rfq, ordered, delivered, installed], AND the item belongs to a Package_Scope assigned to the authenticated user's UID.
2. WHILE a user has the `supplier` or `subcontractor` SpecForge role, THE Supplier_Visibility_Filter SHALL exclude from responses: whole-project budget summaries, other suppliers' quote data, items in packages not assigned to the user, client commercial data (budget allowances, cost deltas), and QS review notes.
3. WHEN a package assignment is created, THE SpecForge_Router SHALL write a package assignment record to `projects/{projectId}/specPackageAssignments/{assignmentId}` containing: package identifier, assigned supplier/subcontractor UID, assigned sections or item IDs, assignment date, and assigning user UID.
4. WHEN a supplier or subcontractor requests workspace data, THE Supplier_Visibility_Filter SHALL verify the user's UID against the `specPackageAssignments` collection and return the union of all items and sections across every package assignment matching the user's UID within the requested project.
5. IF a supplier or subcontractor's UID has no matching package assignment in the project, THEN THE Supplier_Visibility_Filter SHALL return an empty item list (fail-closed) rather than returning all items.
6. THE Supplier_Visibility_Filter SHALL execute server-side in the API layer and SHALL NOT rely on client-side filtering for security enforcement.
7. WHILE a user has the `supplier` or `subcontractor` role, THE SpecForge_Router SHALL restrict procurement entry responses to only entries where the `supplier` field matches the user's firm name (case-insensitive exact match) or the entry's `itemId` belongs to one of the user's assigned packages as determined by the `specPackageAssignments` collection.
8. WHEN a supplier requests RFQ data through the SpecForge API, THE Supplier_Visibility_Filter SHALL return only RFQs where the user's UID appears in the `invitedSuppliers` array of the RFQ document.
9. WHEN a package assignment record is deleted or its status is set to revoked, THE Supplier_Visibility_Filter SHALL exclude items from that package in all subsequent responses for the affected user's UID within 5 seconds of the deletion or revocation event.

### Requirement 8: RFQ-to-SpecForge Writeback Path Correction

**User Story:** As a procurement manager, I want RFQ award data to write back to the correct SpecForge Firestore collections, so that procurement status is accurately reflected in the specification workspace.

#### Acceptance Criteria

1. WHEN `writeBackToSpecForge` is called with award data, THE RFQ_Writeback SHALL write procurement updates to `projects/{projectId}/specProcurement/{entryId}` (the correct SpecForge procurement collection) instead of `projects/{projectId}/specforge/entries/{id}/data`.
2. WHEN an RFQ line item is linked to a spec item, THE RFQ_Writeback SHALL reference the spec item by its `specItemId` field matching an item in the `projects/{projectId}/specItems` collection.
3. WHEN an RFQ line item is linked to a procurement entry, THE RFQ_Writeback SHALL reference the procurement entry by its `specProcurementEntryId` field matching an entry in the `projects/{projectId}/specProcurement` collection.
4. WHEN a procurement status update is written, THE RFQ_Writeback SHALL use the SpecForge repository interface (`updateProcurementEntry`) rather than direct Firestore document references, ensuring Zod validation and audit logging are applied.
5. WHEN a successful writeback occurs, THE RFQ_Writeback SHALL write an Audit_Event to `projects/{projectId}/specAuditEvents` recording the RFQ ID, awarded supplier, each updated spec item ID, and the timestamp.
6. IF a referenced `specItemId` does not exist in the project's `specItems` collection, THEN THE RFQ_Writeback SHALL log a warning to the audit trail and skip the update for that item without blocking the overall award operation.
7. IF a referenced `specProcurementEntryId` does not exist in the project's `specProcurement` collection, THEN THE RFQ_Writeback SHALL create a new procurement entry with the award data (including specItemId, supplier name, unit rate, total cost, lead time, and status `ordered`) rather than failing silently.
8. THE RFQ_Writeback SHALL NOT read from or write to the legacy path `projects/{projectId}/specforge/entries/{id}/data` under any circumstance.

### Requirement 9: Product Catalogue — Real Implementation

**User Story:** As an architect, I want to search real product catalogues when selecting specification items, so that I can find actual products with current pricing, lead times, and availability rather than mock data.

#### Acceptance Criteria

1. WHEN `searchSpecLibrary` is called in production mode (VITE_DEMO_MODE is not "true"), THE Product_Catalogue_Adapter SHALL query the Firestore `productCatalogue` collection instead of returning results from the mock library array in `specforgeService.ts`, and SHALL return results within 3 seconds of the request being initiated.
2. WHEN a tenant-scoped product catalogue query is executed, THE Product_Catalogue_Adapter SHALL restrict results to products visible to the querying user's firm, personal library, and platform-wide products, respecting the `SpecLibraryScope` (personal, practice, platform, manufacturer, standards), where personal scope filters by matching `userId`, practice scope filters by matching `firmId`, and platform/manufacturer/standards scopes return all items within that scope without tenant restriction.
3. WHEN a CSV product file is uploaded via the product catalogue API, THE Product_Catalogue_Adapter SHALL parse the CSV (maximum file size 10 MB, maximum 5,000 rows), validate each row against the `SpecLibraryItem` schema (requiring non-empty `title`, `category`, and valid `scope` value), persist valid rows to the firm's product collection, and return a summary indicating rows imported, rows rejected, and per-row rejection reasons.
4. THE Product_Catalogue_Adapter SHALL define a supplier connector interface with methods for: `searchProducts(query, filters)`, `getProductDetail(productId)`, `checkAvailability(productId)`, and `getPricing(productId, quantity)`, supporting Connector_Level 0 (manual/portal) through Connector_Level 6 (ERP/EDI).
5. WHEN a Specifile connector is available, THE Product_Catalogue_Adapter SHALL include a licensing guard that verifies the firm holds a valid, non-expired Specifile subscription before returning Specifile-sourced products; IF the subscription is missing or expired, THEN THE Product_Catalogue_Adapter SHALL exclude Specifile-sourced products from the result set and include a `specifileLicenseRequired: true` flag in the response.
6. IF the product catalogue data source is unavailable or the query exceeds a 5-second timeout, THEN THE Product_Catalogue_Adapter SHALL return an empty result set with a `degraded: true` indicator, and SHALL NOT fall back to mock data in production mode.
7. WHEN products are returned from any data source, THE Product_Catalogue_Adapter SHALL normalize results to the `SpecLibraryItem` type including: cost range in ZAR (as `typicalCostRange` with `min` and `max` in whole Rands), lead time range in calendar days (as `leadTimeRange` with `min` and `max` as positive integers), sustainability notes (as a string, empty string if unavailable), common finishes (as an array of strings, empty array if unavailable), and clause references (as an array of strings, empty array if unavailable).
8. THE Product_Catalogue_Adapter SHALL support pagination with `offset` and `limit` parameters, where offset defaults to 0, limit defaults to 50, limit has a maximum of 200, and any limit value exceeding 200 SHALL be clamped to 200.
9. IF the CSV upload contains rows that fail validation, THEN THE Product_Catalogue_Adapter SHALL persist all valid rows, skip invalid rows without aborting the import, and return the rejection summary including the row number and the specific validation error for each rejected row.

### Requirement 10: Full Procurement Lifecycle

**User Story:** As a project manager, I want a complete procurement workflow from approved baseline through delivery and warranty, so that I can track and govern every stage of the supply chain with proper approval gates.

#### Acceptance Criteria

1. WHEN a procurement operation (RFQ creation, order placement, PO generation) is attempted, THE Procurement_Lifecycle SHALL verify that an Approved_Baseline exists for the project (at least one issued snapshot with status `issued`) and reject the operation with a 400 response if no approved baseline exists.
2. WHEN multiple supplier quotes are received for the same spec item, THE Procurement_Lifecycle SHALL store each quote as a separate record (supporting a minimum of 2 and a maximum of 20 quotes per spec item) and provide a quote normalization view that compares quotes side-by-side on unit rate, total cost, lead time (in calendar days), warranty terms (duration and coverage scope), and B-BBEE score (level 1–8).
3. WHEN an addendum to a spec item is required after RFQ issuance, THE Procurement_Lifecycle SHALL create an addendum record linked to the original spec item and RFQ, notify all invited suppliers of the change within the system via an Inbox_Event per supplier, and write an Audit_Event recording the addendum including the user who initiated it, the timestamp, and a summary of what changed.
4. WHEN a supplier is selected for award, THE Procurement_Lifecycle SHALL require approval from a user with the `approve_substitution` or `approve_technical_section` capability before the award is confirmed, and SHALL NOT confirm an award without this approval gate.
5. IF an award approval is rejected by the approving user, THEN THE Procurement_Lifecycle SHALL retain the procurement entry in `pending_award` status, record the rejection reason in an Audit_Event, and generate an Inbox_Event for the user who initiated the award request indicating the rejection.
6. WHEN an award is approved, THE Procurement_Lifecycle SHALL generate a Purchase Order record containing: PO number (unique, system-generated), spec item references, supplier details, agreed unit rates, total cost, delivery schedule (with dates), and payment terms.
7. WHEN a supplier accepts a PO, THE Procurement_Lifecycle SHALL record the acceptance timestamp, update the procurement entry status to `ordered`, and generate an Inbox_Event for the project team.
8. WHEN a delivery is recorded, THE Procurement_Lifecycle SHALL support partial delivery (quantity delivered is greater than zero and less than ordered quantity), rejected delivery (delivery refused due to quality or damage with a rejection reason recorded), and full delivery (quantity delivered equals ordered quantity) statuses, with each status transition writing an Audit_Event that includes the delivery quantity, status, and recording user.
9. WHEN a delivery requires site acceptance, THE Procurement_Lifecycle SHALL block payment release until a user with the `upload_site_evidence` or `flag_site_conflict` capability confirms site acceptance.
10. WHEN site acceptance is confirmed, THE Procurement_Lifecycle SHALL unblock the payment release path and generate an Inbox_Event for users with the `review_budget` capability.
11. WHEN a supplier uploads warranty documentation, THE Procurement_Lifecycle SHALL store the warranty record linked to the spec item and procurement entry, including warranty period (start date and duration in months), terms, and document references (minimum one attached document).
12. WHEN all line items in a procurement entry have status `installed` and warranty documentation is uploaded for each line item, THE Procurement_Lifecycle SHALL mark the entry as eligible for closeout and generate a warranty/O&M handover record.
13. IF a programme/schedule is defined for the project, THEN THE Procurement_Lifecycle SHALL calculate a latest-order-date for each procurement entry based on the item's lead time and the programme's required-on-site date, and SHALL generate an Inbox_Event warning when the current date is within 14 days of the latest-order-date.
14. IF a procurement entry's lead time is not defined when the latest-order-date calculation is attempted, THEN THE Procurement_Lifecycle SHALL flag the entry as `missing_lead_time` and generate an Inbox_Event to the project manager indicating that the lead time must be provided before scheduling can proceed.

### Requirement 11: Dedicated Substitution Endpoints with Role Capabilities

**User Story:** As a contractor, I want to request material substitutions through a dedicated endpoint that enforces proper approval workflow, so that substitution requests are properly tracked and require professional/client sign-off where applicable.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/specforge/:projectId/substitutions`, THE Substitution_Endpoint SHALL require the `request_substitution` capability and reject requests from roles lacking this capability with a 403 response.
2. WHEN a PATCH request is made to `/api/specforge/:projectId/substitutions/:substitutionId` to approve or reject, THE Substitution_Endpoint SHALL require the `approve_substitution` capability and reject requests from roles lacking this capability with a 403 response.
3. WHEN a substitution is approved for an item where `clientDecision` is true, THE Substitution_Endpoint SHALL set the substitution status to `under_review` and require additional client approval (a user with `approve_client_decision` capability must also approve) before the substitution takes effect.
4. WHEN a substitution is approved for an item owned by a professional role (architect, engineer, energy_professional, fire_engineer), THE Substitution_Endpoint SHALL set the substitution status to `under_review` and require the owning professional's explicit approval (matching the item's `ownerRole`) before the substitution takes effect.
5. WHEN all required approvals for a substitution are granted, THE Substitution_Endpoint SHALL atomically update the original spec item status to `superseded`, set the `supersededBy` field to the new item ID, create the replacement item with the proposed details and status `approved`, and write an Audit_Event recording both the supersession and creation.
6. WHEN a substitution request is created, THE Substitution_Endpoint SHALL generate an Inbox_Event for users with the `approve_substitution` capability containing the original item code, proposed substitute title, reason, and requesting user.
7. IF a substitution is requested for an item that has already been ordered (procurement status `ordered` or later), THEN THE Substitution_Endpoint SHALL flag the request as requiring procurement impact review and include a warning in the response indicating potential cost and schedule implications.
8. IF a substitution is rejected by any required approver, THEN THE Substitution_Endpoint SHALL set the substitution status to `rejected`, record the reviewer identity and review comments, preserve the original item unchanged, and generate an Inbox_Event to the requesting user indicating the rejection reason.
9. IF a substitution request references an `originalItemId` that does not exist in the project workspace or whose status is already `superseded`, THEN THE Substitution_Endpoint SHALL reject the request with a 409 response and an error message indicating the item is not eligible for substitution.
10. WHEN a POST request is made to `/api/specforge/:projectId/substitutions`, THE Substitution_Endpoint SHALL validate that the request body contains `originalItemId` (non-empty string), `proposedTitle` (non-empty string, maximum 200 characters), and `reason` (non-empty string, maximum 1000 characters), and reject requests missing or exceeding these constraints with a 400 response.

### Requirement 12: Non-Negotiable Guardrails — Cross-Cutting Governance

**User Story:** As a platform administrator, I want non-negotiable governance rules enforced across all SpecForge operations, so that the system maintains integrity, auditability, and professional accountability.

#### Acceptance Criteria

1. THE SpecForge_Router SHALL write an Audit_Event AND an Inbox_Event AND a ProjectRecord for every state transition on items, sections, workspaces, approvals, substitutions, procurement entries, and snapshots.
2. THE SpecForge_Router SHALL NOT execute any procurement operation (RFQ send, order placement, PO generation, award confirmation) unless an Approved_Baseline exists for the project (at least one issued snapshot with issueStatus `issued_snapshot`).
3. THE SpecForge_Router SHALL NOT permit any substitution to take effect without explicit approval from a user with the `approve_substitution` capability, and additionally from the client (if `clientDecision` is true) or the owning professional (if the item's `ownerRole` is a professional role).
4. THE SpecForge_Router SHALL NOT permit an award or PO generation without explicit approval from a user with the `approve_technical_section` or `approve_substitution` capability.
5. THE SpecForge_Router SHALL NOT release payment recommendation for a procurement entry if delivery status is not `delivered` or site acceptance has not been confirmed.
6. THE SpecForge_Router SHALL NOT return unrelated packages or commercial data to suppliers or subcontractors — the Supplier_Visibility_Filter SHALL enforce this restriction server-side on every response.
7. THE SpecForge_Router SHALL NOT use mock data, sample data, or hardcoded arrays in any production code path (VITE_DEMO_MODE not set to "true").
8. THE SpecForge_Router SHALL NOT reproduce SANS or NBR clause text unless the source licensing has been verified and recorded in a licensing metadata field on the clause reference.
9. WHEN any Audit_Event is written, THE SpecForge_Router SHALL include: the performing user's UID, the action type, the target entity ID, the target entity type, the ISO 8601 UTC timestamp, and previous/new values where applicable (each capped at 10,000 characters).
10. WHEN any Inbox_Event is generated, THE SpecForge_Router SHALL include: the target user(s) or role, the event type, the source entity reference (entity type + ID), a human-readable message (maximum 500 characters), and a deep link route to the relevant UI view.
