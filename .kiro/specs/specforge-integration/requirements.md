# Requirements Document

## Introduction

This document specifies the integration layer that makes SpecForge production-ready by connecting the existing in-memory engine to live Firestore persistence, Express API endpoints, and the broader Architex platform spine. The integration covers eight domains: Firestore persistence, API endpoints with role-based access, Project Passport integration, Inbox/Action Centre events, Audit Trail integration, Drawing Register interop, multi-project support, and Product Catalogue/Library wiring.

## Glossary

- **SpecForge_Repository**: The persistence interface (`SpecForgeRepository`) defining CRUD operations for workspaces, items, sections, snapshots, approvals, substitutions, audit events, and procurement entries.
- **Firestore_Repository**: The `FirestoreSpecForgeRepository` class implementing `SpecForgeRepository` using Firebase Admin SDK against the Firestore database.
- **API_Layer**: The Express 5 route handler module at `/api/specforge/*` providing server-side operations for SpecForge.
- **Role_Gate**: The `specRoleCan` capability check enforcing role-based access control across all 15 SpecForge roles and 30+ capabilities.
- **Project_Passport**: The central project health card service (`projectPassportService`) that aggregates project state from all platform modules.
- **Action_Centre**: The platform inbox/event system that surfaces pending approvals, decisions, and warnings to users.
- **Audit_Trail**: The platform-wide immutable audit logging service recording all project actions.
- **Drawing_Register**: The Drawing Intelligence/Document Register service managing drawing references, revisions, and superseded drawing detection.
- **Spec_Library**: The product data source providing searchable specification library items across personal, practice, platform, manufacturer, and standards scopes.
- **Issue_Snapshot**: An immutable, write-once record of a specification at the point of issue, including all items, sections, budget summary, and readiness findings.
- **Procurement_Entry**: A record tracking an issued spec item through the procurement pipeline from RFQ to installation.
- **Workspace**: A `SpecForgeWorkspace` instance representing the specification state for a single project.

## Requirements

### Requirement 1: Firestore Persistence — Workspace CRUD

**User Story:** As an architect, I want specification workspaces to persist in Firestore, so that specification data survives across sessions and is available to all team members.

#### Acceptance Criteria

1. WHEN `getWorkspace` is called with a project ID, THE Firestore_Repository SHALL query the `projects/{projectId}/specWorkspaces` collection and return the matching workspace document, or return null if no document exists for that project ID.
2. WHEN `saveWorkspace` is called with a workspace object, THE Firestore_Repository SHALL write the workspace document to `projects/{projectId}/specWorkspaces/{workspaceId}` using a Firestore set operation with merge, where projectId and workspaceId are derived from the workspace object's `projectId` and `id` fields.
3. WHEN `addItem` is called with a project ID and spec item, THE Firestore_Repository SHALL write the item to `projects/{projectId}/specItems/{itemId}` where itemId is the item's `id` field.
4. WHEN `updateItem` is called with a project ID, item ID, and partial updates, THE Firestore_Repository SHALL apply the partial update to the existing item document at `projects/{projectId}/specItems/{itemId}` using a Firestore update operation.
5. WHEN `deleteItem` is called with a project ID and item ID, THE Firestore_Repository SHALL remove the item document from `projects/{projectId}/specItems/{itemId}`.
6. WHEN `addSection` is called with a project ID and section, THE Firestore_Repository SHALL write the section document to `projects/{projectId}/specSections/{sectionId}` where sectionId is the section's `id` field.
7. WHEN `updateSection` is called with a project ID, section ID, and partial updates, THE Firestore_Repository SHALL apply the partial update to the existing section document at `projects/{projectId}/specSections/{sectionId}` using a Firestore update operation.
8. THE Firestore_Repository SHALL validate all input data against the corresponding Zod schema before performing any write operation, and SHALL reject the operation by throwing a validation error without writing to Firestore if the schema validation fails.
9. IF a Firestore update or delete operation targets a document that does not exist, THEN THE Firestore_Repository SHALL throw an error indicating the target document was not found, without modifying any data.
10. IF a Firestore write operation fails due to a network or permission error, THEN THE Firestore_Repository SHALL propagate the error to the caller without silently swallowing the failure, and SHALL NOT leave partial writes in an inconsistent state.

### Requirement 2: Firestore Persistence — Immutable Snapshots and Append-Only Audit

**User Story:** As a platform administrator, I want issued snapshots to be write-once and audit events append-only, so that historical specification records cannot be tampered with.

#### Acceptance Criteria

1. WHEN `saveSnapshot` is called with an issue snapshot, THE Firestore_Repository SHALL write the snapshot to `projects/{projectId}/specSnapshots/{snapshotId}`.
2. WHEN an update or delete operation is attempted on a saved snapshot document, THE Firestore_Repository SHALL reject the operation with an error indicating snapshots are immutable and SHALL leave the existing document unchanged.
3. WHEN `logAuditEvent` is called, THE Firestore_Repository SHALL append the event to `projects/{projectId}/specAuditEvents/{eventId}`.
4. WHEN a delete or update operation is attempted on an audit event document, THE Firestore_Repository SHALL reject the operation with an error indicating audit events are append-only and SHALL leave the existing document unchanged.
5. WHEN `getSnapshots` is called for a project, THE Firestore_Repository SHALL return all snapshots ordered by `issuedAt` descending, limited to a maximum of 500 documents per query.
6. WHEN `getAuditEvents` is called with a limit parameter, THE Firestore_Repository SHALL return audit events ordered by `performedAt` descending, limited to the specified count where limit is between 1 and 500 inclusive, defaulting to 50 when the parameter is omitted or zero.
7. IF `saveSnapshot` is called with a `snapshotId` that already exists in the collection, THEN THE Firestore_Repository SHALL reject the write with an error indicating duplicate snapshot and SHALL leave the existing document unchanged.

### Requirement 3: Firestore Persistence — Approvals, Substitutions, and Procurement

**User Story:** As a quantity surveyor, I want approvals, substitutions, and procurement entries persisted reliably, so that I can track cost decisions and supply chain status across the project lifecycle.

#### Acceptance Criteria

1. WHEN `saveApproval` is called with a valid SpecApproval record, THE Firestore_Repository SHALL write the approval record to `projects/{projectId}/specApprovals/{approvalId}` and resolve the returned Promise without error.
2. WHEN `getApprovals` is called for a project, THE Firestore_Repository SHALL return all approval records for the specified project ordered by `requestedAt` descending, or an empty array if no approvals exist.
3. WHEN `saveSubstitution` is called with a valid SpecSubstitution record, THE Firestore_Repository SHALL write the substitution record to `projects/{projectId}/specSubstitutions/{substitutionId}` and resolve the returned Promise without error.
4. WHEN `getSubstitutions` is called for a project, THE Firestore_Repository SHALL return all substitution records for the specified project ordered by `requestedAt` descending, or an empty array if no substitutions exist.
5. WHEN `getProcurementEntries` is called, THE Firestore_Repository SHALL return all procurement entries for the specified project, or an empty array if no entries exist.
6. WHEN `updateProcurementEntry` is called with partial updates and the specified `entryId` exists in `projects/{projectId}/specProcurement/{entryId}`, THE Firestore_Repository SHALL merge the provided fields into the existing document without overwriting unspecified fields.
7. IF `updateProcurementEntry` is called with an `entryId` that does not exist in the specified project's `specProcurement` collection, THEN THE Firestore_Repository SHALL reject the returned Promise with an error indicating the entry was not found.
8. IF a Firestore write operation for `saveApproval`, `saveSubstitution`, or `updateProcurementEntry` fails due to a network or service error, THEN THE Firestore_Repository SHALL reject the returned Promise with an error indicating the persistence failure, and no partial data SHALL be written to the collection.

### Requirement 4: API Endpoints — CRUD Operations

**User Story:** As a frontend developer, I want RESTful API endpoints for SpecForge operations, so that the UI can perform specification management through the server layer.

#### Acceptance Criteria

1. WHEN a GET request is made to `/api/specforge/:projectId/workspace`, THE API_Layer SHALL return a 200 response containing the workspace for the specified project, including its sections and items.
2. IF a GET request is made to `/api/specforge/:projectId/workspace` and no workspace exists for the specified projectId, THEN THE API_Layer SHALL return a 404 response with an error message indicating the workspace was not found.
3. WHEN a POST request is made to `/api/specforge/:projectId/items` with a payload that passes Zod schema validation, THE API_Layer SHALL create the item and return a 201 response containing the created item with its assigned identifier.
4. WHEN a PATCH request is made to `/api/specforge/:projectId/items/:itemId` with a payload that passes Zod schema validation, THE API_Layer SHALL update only the provided fields on the item and return a 200 response containing the updated item.
5. IF a PATCH or DELETE request is made to `/api/specforge/:projectId/items/:itemId` and no item with that itemId exists, THEN THE API_Layer SHALL return a 404 response with an error message indicating the item was not found.
6. WHEN a DELETE request is made to `/api/specforge/:projectId/items/:itemId`, THE API_Layer SHALL delete the item and return a 204 response with no body.
7. WHEN a POST request is made to `/api/specforge/:projectId/sections` with a payload that passes Zod schema validation, THE API_Layer SHALL create the section and return a 201 response containing the created section with its assigned identifier.
8. WHEN a PATCH request is made to `/api/specforge/:projectId/sections/:sectionId` with a payload that passes Zod schema validation, THE API_Layer SHALL update the section and return a 200 response containing the updated section.
9. IF a PATCH request is made to `/api/specforge/:projectId/sections/:sectionId` and no section with that sectionId exists, THEN THE API_Layer SHALL return a 404 response with an error message indicating the section was not found.
10. WHEN a GET request is made to `/api/specforge/:projectId/snapshots`, THE API_Layer SHALL return a 200 response containing all issue snapshots for the project, up to a maximum of 500 snapshots, ordered by creation date descending.
11. WHEN a GET request is made to `/api/specforge/:projectId/audit`, THE API_Layer SHALL return audit events for the project limited by the `limit` query parameter, defaulting to 50 and capped at a maximum of 200 records, ordered by timestamp descending.
12. IF any POST or PATCH request contains a payload that fails Zod schema validation, THEN THE API_Layer SHALL return a 400 response containing an array of Zod validation error details, each indicating the field path and the validation rule that failed.

### Requirement 5: API Endpoints — Workflow Operations

**User Story:** As an architect, I want API endpoints for issuing specifications, managing approvals, and processing substitutions, so that governance workflows execute through the server with proper access control.

#### Acceptance Criteria

1. WHEN a POST request is made to `/api/specforge/:projectId/issue` with a body containing `issuer` (with userId, name, role) and `recipients` (array of recipient objects), THE API_Layer SHALL execute the `issueSpecification` function, persist the snapshot via the repository, and return the snapshot with a 201 response.
2. IF the `issueSpecification` function throws due to a readiness blocker, missing capability, pending client decision, or budget exceedance, THEN THE API_Layer SHALL return a 400 response with an error message indicating the reason for rejection without persisting any data.
3. WHEN a POST request is made to `/api/specforge/:projectId/approvals` with a body containing `itemId`, `sectionId`, `requestedBy`, and `reviewerRole`, THE API_Layer SHALL save the approval with a `pending` decision and return the created approval record with a 201 response.
4. WHEN a PATCH request is made to `/api/specforge/:projectId/approvals/:approvalId` with a body containing `decision` (one of approved, rejected, or deferred) and `decidedBy`, THE API_Layer SHALL update the approval decision and `decidedAt` timestamp and return the updated record with a 200 response.
5. IF a PATCH request targets an approval or substitution identified by `:approvalId` or `:substitutionId` that does not exist in the project, THEN THE API_Layer SHALL return a 404 response with an error message indicating the resource was not found.
6. WHEN a POST request is made to `/api/specforge/:projectId/substitutions` with a body containing `originalItemId`, `proposedTitle`, `reason`, and `requestedBy`, THE API_Layer SHALL save the substitution with status `requested` and return the created substitution record with a 201 response.
7. WHEN a PATCH request is made to `/api/specforge/:projectId/substitutions/:substitutionId` with a body containing `status` (one of approved or rejected), `reviewedBy`, and optionally `reviewComments`, THE API_Layer SHALL update the substitution status and `reviewedAt` timestamp and return the updated record with a 200 response.
8. WHEN a PATCH request is made to `/api/specforge/:projectId/procurement/:entryId` with a body containing at least one updatable procurement field (status, supplier, or delivery date), THE API_Layer SHALL update the procurement entry and return the updated record with a 200 response.
9. WHEN a GET request is made to `/api/specforge/:projectId/procurement`, THE API_Layer SHALL return all procurement entries for the project as a JSON array with a 200 response.
10. IF any workflow operation request is made by a user whose SpecForge role lacks the required capability for that operation, THEN THE API_Layer SHALL return a 403 response with an error message indicating insufficient permissions.

### Requirement 6: API Endpoints — Role-Based Access Enforcement

**User Story:** As a platform administrator, I want all SpecForge API endpoints to enforce role-based access, so that users can only perform actions their role permits.

#### Acceptance Criteria

1. THE API_Layer SHALL extract the authenticated user's SpecForge role from the request context on every request by mapping their platform `UserRole` via `toSpecForgeRole`.
2. WHEN a request is made without a valid authenticated session, THE API_Layer SHALL return a 401 response with a body indicating the request is unauthenticated.
3. WHEN an authenticated user attempts an operation their role does not permit according to `specRoleCan`, THE API_Layer SHALL return a 403 response with a message indicating the specific capability that was denied.
4. IF the authenticated user's platform role does not map to a recognized SpecForge role, THEN THE API_Layer SHALL return a 403 response indicating the role has no SpecForge access.
5. WHILE a user has the `view_package` capability, THE API_Layer SHALL filter workspace item responses to only include items with status in [issued, rfq, ordered, delivered, installed] that are further scoped to sections or items where the user's role is assigned as reviewerRole or approverRole.
6. WHILE a user has the `view_assigned` capability, THE API_Layer SHALL filter workspace item responses to only include items where the user's SpecForge role matches the item's ownerRole, reviewerRole, or approverRole.
7. WHILE a user has the `view_client_items` capability, THE API_Layer SHALL filter workspace item responses to only include items where `clientDecision` is true OR status is one of [approved, issued].
8. WHILE a user has the `view_issued` capability, THE API_Layer SHALL filter workspace item responses to only include items with status in [issued, rfq, ordered, delivered, installed, as_built].
9. IF an authenticated user's SpecForge role has none of the view capabilities (view_all, view_client_items, view_issued, view_assigned, view_package), THEN THE API_Layer SHALL return an empty item list for workspace item responses.

### Requirement 7: Project Passport Integration

**User Story:** As a project manager, I want SpecForge data to feed the Project Passport, so that specification health is visible in the central project health card.

#### Acceptance Criteria

1. WHEN `buildProjectPassport` is called for a project that has a SpecForge workspace, THE Project_Passport SHALL include SpecForge budget summary data containing total allowance, total estimate, delta amount, delta percentage, and the count of items where estimated cost exceeds budget allowance.
2. WHEN `buildProjectPassport` is called for a project that has a SpecForge workspace, THE Project_Passport SHALL include specification readiness status containing the count of blocker-severity findings, the count of items awaiting client decision, and the count of long-lead items (lead time ≥ 56 days).
3. WHEN `buildProjectPassport` is called for a project, THE Project_Passport SHALL include the current specification issue status (one of: draft, issued, or superseded) and the latest revision identifier string from the SpecForge workspace.
4. WHEN a specification is issued via `issueSpecification`, THE Project_Passport SHALL record a WorkflowEvent of type `project_phase_changed` containing the snapshot ID, the issued-at ISO 8601 timestamp, and the revision identifier.
5. WHEN specification budget delta percentage exceeds 10%, THE Project_Passport SHALL set the passport `riskLevel` to no lower than `high` and include a risk finding with category `budget` indicating the over-budget percentage.
6. IF `buildProjectPassport` is called for a project that has no SpecForge workspace, THEN THE Project_Passport SHALL return null values for the SpecForge budget summary, readiness status, and issue status fields without raising an error.

### Requirement 8: Inbox and Action Centre Events

**User Story:** As a team member, I want specification-related actions to appear in my inbox, so that I am notified of pending approvals, decisions, and warnings.

#### Acceptance Criteria

1. WHEN an approval is created, THE Action_Centre SHALL generate an inbox event for the designated reviewer containing the item code, section reference, approval type, and a route linking to the approval detail view.
2. WHEN a spec item's status is changed to `needs_decision`, THE Action_Centre SHALL generate an inbox event for users with the `approve_client_decision` capability containing the item code, section, and decision description.
3. WHEN a specification is issued, THE Action_Centre SHALL generate one inbox event per recipient listed in the issue operation, up to a maximum of 200 recipients per issue.
4. WHEN a substitution is requested, THE Action_Centre SHALL generate an inbox event for users with the `approve_substitution` capability containing the original item code, proposed substitute title, and reason for substitution.
5. WHEN a spec item's estimated cost exceeds its budget allowance by more than 10%, THE Action_Centre SHALL generate a budget threshold warning event for users with the `review_budget` capability.
6. WHEN a spec item has a lead time of 56 days or greater, THE Action_Centre SHALL generate a long-lead warning event for users with the `view_all` capability.
7. WHEN any triggering event in criteria 1–6 occurs, THE Action_Centre SHALL generate the corresponding inbox event within 5 seconds of the trigger being persisted.
8. IF no users with the required capability or designated reviewer exist at the time of event generation, THEN THE Action_Centre SHALL generate a fallback inbox event for users with the `admin` role indicating the unroutable action and its source item code.
9. IF an inbox event with the same trigger type, item code, and recipient already exists in an unresolved state, THEN THE Action_Centre SHALL not generate a duplicate event.

### Requirement 9: Audit Trail Integration

**User Story:** As a compliance officer, I want all SpecForge actions logged in the platform audit trail, so that specification changes are recorded in the project-wide immutable audit record.

#### Acceptance Criteria

1. WHEN any SpecForge write operation completes (create, update, delete, issue, approve, substitute, comment, status_change, snapshot_create), THE Audit_Trail SHALL receive a corresponding `SpecAuditEvent` with action type, target ID, target type (`item`, `section`, `workspace`, or `snapshot`), performer identity, and ISO 8601 UTC timestamp within the same request lifecycle as the originating write operation.
2. WHEN a spec item is updated, THE Audit_Trail SHALL record the previous value and new value for each changed field as serialised string representations, each capped at 10,000 characters.
3. WHEN an issue snapshot is created, THE Audit_Trail SHALL record the snapshot ID, revision, and audit hash as returned by the `SpecIssueSnapshot` creation.
4. THE Audit_Trail SHALL store each SpecForge audit event in both the SpecForge-specific collection (`specAuditEvents`) and the platform-wide audit trail service in a single logical transaction.
5. THE Audit_Trail SHALL never update or delete existing audit records from SpecForge operations; all records are append-only.
6. IF the platform-wide audit trail service is unavailable when a SpecForge write operation completes, THEN THE Audit_Trail SHALL retain the `SpecAuditEvent` in the SpecForge-specific collection (`specAuditEvents`) and queue the event for retry to the platform-wide service, ensuring no audit data is lost.
7. IF a SpecForge write operation fails or is rolled back, THEN THE Audit_Trail SHALL NOT persist an audit event for that operation.

### Requirement 10: Drawing Register Interoperability

**User Story:** As an architect, I want spec item drawing references linked to the Drawing Register, so that I receive live revision status and superseded drawing warnings.

#### Acceptance Criteria

1. WHEN a spec item contains `drawingRefs`, THE Drawing_Register SHALL resolve each reference to its current revision status (current, superseded, or not found) and return the result within 2 seconds.
2. WHEN a referenced drawing has been superseded, THE Drawing_Register SHALL return the superseding drawing reference (drawingNumber and drawingId) and its revision code.
3. WHEN a spec item's drawing reference has a status of superseded, THE API_Layer SHALL include a structured warning object in the item response containing the affected drawingRef identifier, the superseding drawing reference, and a severity level of "high".
4. WHEN a drawing revision is updated in the Drawing Register, THE Drawing_Register SHALL update the status and supersededByDrawingId fields on the affected DrawingRecord so that SpecForge can detect stale references by comparing the stored drawingRefs against current Drawing Register status within 60 seconds of the revision update.
5. WHEN `drawingRefs` are queried through the API, THE API_Layer SHALL return enriched drawing data including drawingNumber, title, current revision code, discipline, and current status from the Drawing Register for each resolved reference.
6. IF the Drawing Register is unavailable when resolving `drawingRefs`, THEN THE API_Layer SHALL return the spec item with drawingRefs unresolved, include a service degradation indicator in the response, and preserve any previously cached revision status until the Drawing Register becomes available again.

### Requirement 11: Multi-Project Support

**User Story:** As an architect managing multiple projects, I want SpecForge to load the workspace for my active project, so that I can switch between project specifications without manual configuration.

#### Acceptance Criteria

1. WHEN a user navigates to SpecForge, THE Workspace SHALL query Firestore for the workspace document matching the active project ID from the application context and display the workspace contents within 3 seconds of navigation.
2. IF no workspace document exists in Firestore for the active project ID, THEN THE Workspace SHALL create a new empty workspace with the project's ID, the project's name, an initial issue status of "draft", an empty sections array, and an empty items array, and persist it to Firestore before rendering.
3. WHEN a user switches active projects, THE Workspace SHALL discard all in-memory state of the current workspace (sections, items, team, audit events) and load the workspace for the newly selected project ID, displaying a loading indicator until the new workspace is fully loaded.
4. IF `VITE_DEMO_MODE` is not set to "true", THEN THE Workspace SHALL load workspace data exclusively from Firestore and SHALL NOT fall back to hardcoded sample data.
5. WHEN a new workspace is created and the project has a discipline value defined in its project record, THE Workspace SHALL seed the workspace with default sections whose discipline field matches the project's discipline value; if the project has no discipline value, the workspace SHALL be created with an empty sections array.
6. IF the Firestore query for the active project workspace fails due to a network or permission error, THEN THE Workspace SHALL display an error message indicating the workspace could not be loaded and SHALL NOT render stale data from a previously loaded workspace.

### Requirement 12: Product Catalogue and Library Integration

**User Story:** As an architect, I want the spec library search to query real product data sources, so that I can find and specify products from catalogues and manufacturer databases.

#### Acceptance Criteria

1. WHEN `searchSpecLibrary` is called in production mode, THE Spec_Library SHALL query the product catalogue data source instead of the mock library array.
2. WHEN a scope filter is provided (personal, practice, platform, manufacturer, standards), THE Spec_Library SHALL restrict results to items matching the specified scope.
3. WHEN a text query is provided, THE Spec_Library SHALL perform a case-insensitive substring search across item title, category, tags, and supplier fields, returning all items where at least one field contains the query string.
4. THE Spec_Library SHALL return results conforming to the `SpecLibraryItem` type including cost range in ZAR, lead time range in calendar days, sustainability notes, and usage statistics.
5. WHEN no results are found, THE Spec_Library SHALL return an empty array without error.
6. THE Spec_Library SHALL support pagination with offset and limit parameters, where limit defaults to 50 and has a maximum value of 200, and offset defaults to 0.
7. IF the product catalogue data source is unavailable or returns an error, THEN THE Spec_Library SHALL return an empty array and include an error indicator in the response so the caller can distinguish no-results from a data-source failure.
8. WHEN results are returned, THE Spec_Library SHALL sort items by usage count descending as the default ordering.
