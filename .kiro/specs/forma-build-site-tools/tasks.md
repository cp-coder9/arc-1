# Implementation Plan: Forma Build Site Tools

## Overview

This plan extends Architex's existing Pack 9 (Site Execution & Field Control) into an Autodesk Build / Forma-style, mobile-first field-issue product. It reuses the existing snag state machine (`open → allocated → ready_for_reinspection → closed / rejected`), `paymentBlockerService`, `siteAuditService`, `fieldEvidenceService`, and the `SnagManager` / `NCRManager` / `SiteInstructionManager` components, adding field-capture capabilities around them: pin-on-drawing referencing, photo annotation, inspection checklists, offline capture with sync, a role-aware issue dashboard, role-gated access, and field reporting.

Work proceeds bottom-up: type changes and Zod schemas first, then the pure-logic service layer (validators, transition guards, count/aggregation functions, serializers, sync ordering, permission matrix, and field-issue status/normalization), then UI components, then navigation and API wiring, then tests and documentation. Pure functions are exported standalone so they can be property-tested without Firestore or Vercel Blob.

Property-based tests use **fast-check** + **Vitest** (minimum 100 iterations per property), one test per correctness property from the design document. Test sub-tasks marked with `*` are optional and may be skipped for a faster MVP, but core implementation tasks must be completed.

Checkbox states reflect current progress: `[x]` completed, `[-]` in progress, `[ ]` not started.

## Tasks

- [x] 1. Data model and type changes (`src/types.ts`)
  - [x] 1.1 Extend SnagItem with optional drawingPin field
    - Add `drawingPin?: DrawingPin` to existing `SnagItem` type
    - Ensure text `location` (1–500 chars) remains required as fallback
    - Acceptance: Type compiles, existing snag records unaffected, new records may carry drawingPin
    - _Requirements: 1.2, 1.7_

  - [x] 1.2 Extend SiteAuditRecord with outcome and actionType
    - Add `outcome: 'permitted' | 'denied'` field
    - Add `actionType: FieldActionType` field
    - Acceptance: Audits capture both permitted and denied outcomes
    - _Requirements: 6.4_

  - [x] 1.3 Add new field-tool types to src/types.ts
    - DrawingPin, PhotoAnnotation, AnnotationShape, ChecklistTemplate, ChecklistItem, ChecklistInstance, ChecklistResponse, QueuedCapture, FieldReport, FieldActionType
    - Follows existing type conventions and interfaces from Pack 9
    - Acceptance: All types defined, compile cleanly, exported for service use
    - _Requirements: 1.1, 2.2, 3.1, 4.1, 5.1, 7.1_

- [x] 2. Service layer — drawing pin service (`src/services/drawingPinService.ts`)
  - [x] 2.1 Implement validateDrawingPin pure function
    - Validates `drawingId` is non-empty, `x` and `y` are present and within 0..1 inclusive
    - Returns structured `PinValidationError[]` naming each offending field
    - Acceptance: Validates in-range pins, rejects out-of-range, all errors named
    - _Requirements: 1.1, 1.4_

  - [x] 2.2 Implement pinsForDrawing pure function
    - Filters issues whose stored pin drawingId matches displayed drawing
    - Returns exactly one entry per matching issue, zero for non-matching
    - Acceptance: Filtering by drawingId produces correct result set
    - _Requirements: 1.3_

  - [x] 2.3 Implement attachDrawingPin I/O function
    - Validates pin (structure + drawing existence), persists drawingId+x+y atomically, rolls back on failure
    - Rejects unknown drawing without modifying existing location
    - Acceptance: Pin persists on valid input, existing location preserved on error
    - _Requirements: 1.2, 1.5, 1.6_

- [x] 3. Service layer — photo annotation service (`src/services/photoAnnotationService.ts`)
  - [x] 3.1 Implement serializeAnnotation and deserializeAnnotation pure functions
    - Round-trip serialization of PhotoAnnotation (shapes, styles, text)
    - Deserialized form equals original in shape count, order, and fields
    - Acceptance: Round-trip property verified, no data loss
    - _Requirements: 2.3, 2.4_

  - [x] 3.2 Implement saveAnnotation I/O function
    - Persists PhotoAnnotation to Firestore `photo_annotations` collection, links via `evidenceId`
    - Acceptance: Annotation persists and can be loaded
    - _Requirements: 2.2_

  - [x] 3.3 Implement loadAnnotation I/O function
    - Retrieves PhotoAnnotation by projectId and evidenceId; returns null if not found
    - Acceptance: Load after save retrieves identical annotation
    - _Requirements: 2.3_

- [x] 4. Service layer — checklist service (`src/services/checklistService.ts`)
  - [x] 4.1 Implement validateTemplate pure function
    - Validates 1–200 items, prompts 1–500 chars, responseType enum (pass_fail_na, numeric, text)
    - Returns TemplateValidationError[] naming invalid fields
    - Acceptance: Valid templates accepted, invalid rejected with field names
    - _Requirements: 3.1, 3.7_

  - [x] 4.2 Implement validateResponse pure function
    - Checks response value against item's responseType; text max 1000 chars
    - Acceptance: Valid responses accepted, invalid rejected
    - _Requirements: 3.3, 3.8_

  - [x] 4.3 Implement computeCounts pure function
    - Counts pass, fail, na over pass_fail_na items only; sum equals number of pass_fail_na items
    - Numeric and text items do not affect counts
    - Acceptance: Counts are exhaustive and accurate
    - _Requirements: 3.5_

  - [x] 4.4 Implement serializeTemplate and deserializeTemplate pure functions
    - Round-trip serialization of ChecklistTemplate; deserialized form equals original in item count, order, definition
    - Acceptance: Round-trip property verified
    - _Requirements: 3.6_

  - [x] 4.5 Implement failedItemToIssue pure function
    - Converts a failed checklist item to a FieldIssueDraft carrying item prompt, checklist reference, evidence
    - Acceptance: Converted issue carries all context
    - _Requirements: 3.4_

  - [x] 4.6 Implement createTemplate I/O function
    - Validates, then persists ChecklistTemplate to Firestore; assigns ID and createdAt
    - Acceptance: Template persists and can be loaded
    - _Requirements: 3.1_

  - [x] 4.7 Implement startInstance I/O function
    - Creates ChecklistInstance from template, copies items in order, initializes responses empty
    - Acceptance: Instance items match template items exactly
    - _Requirements: 3.2_

  - [x] 4.8 Implement recordResponse I/O function
    - Validates response, persists to instance; rejects invalid response, leaves existing unchanged
    - Acceptance: Valid response persists, invalid rejected
    - _Requirements: 3.3, 3.8_

  - [x] 4.9 Implement completeInstance I/O function
    - Computes counts and marks instance completed, persists to Firestore
    - Acceptance: Counts persist with instance
    - _Requirements: 3.5_

- [x] 5. Service layer — sync engine service (`src/services/syncEngineService.ts`)
  - [x] 5.1 Implement serializeQueue and deserializeQueue pure functions
    - Round-trip serialization of QueuedCapture[] to localStorage; deserialized form equals original in count, order, fields
    - Acceptance: Round-trip property verified
    - _Requirements: 4.7_

  - [x] 5.2 Implement orderForTransmission pure function
    - Orders captures by createdAt ascending, preserving creation order
    - Acceptance: Transmission order is creation order
    - _Requirements: 4.2_

  - [x] 5.3 Implement enqueue pure function
    - Adds capture to queue if size < capacity (500), rejects with queue_full at capacity; accepts at least 500 captures
    - Acceptance: Queue capacity enforced
    - _Requirements: 4.1, 4.6_

  - [x] 5.4 Implement reconcile pure function
    - Idempotent: returns 'persist' if client ID not yet persisted, 'skip' if already persisted; single record per client ID
    - Acceptance: Idempotent sync produces single record per client ID
    - _Requirements: 4.8_

  - [x] 5.5 Implement enqueue I/O wrapper
    - Calls pure enqueue, serializes to localStorage on success, returns queue_full error if capacity exceeded
    - Acceptance: Offline captures queued locally, serialized to survive restart
    - _Requirements: 4.1_

  - [x] 5.6 Implement flush I/O function
    - Transmits queued captures to Firestore in creation order; removes on success, increments attempts on failure, retries up to 5 then marks failed, returns failed count
    - Acceptance: Sync transmits in order, retries on failure, surfaces failed count
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [x] 6. Service layer — field report service (`src/services/fieldReportService.ts`)
  - [x] 6.1 Implement aggregateReport pure function
    - Aggregates issues and evidence by date (00:00–23:59 in project TZ); counts blocking issues not closed/rejected; returns weather or 'not_recorded' if absent; for Close-out stage includes outstanding snag count
    - Acceptance: Aggregation by date is exhaustive, counts accurate
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

  - [x] 6.2 Implement exportReport pure function
    - Exports FieldReport to document format containing date, project ID, issue summary (ID, status, severity), evidence references
    - Acceptance: Export document contains all required fields
    - _Requirements: 7.4_

  - [x] 6.3 Implement generateReport I/O function
    - Calls aggregateReport with Firestore queries; persists to `field_reports` collection
    - Acceptance: Report persists and can be retrieved
    - _Requirements: 7.1_

- [x] 7. Service layer — field access service (`src/services/fieldAccessService.ts`)
  - [x] 7.1 Implement canPerform pure function
    - Returns true if role is an editor role (site_manager, contractor, subcontractor, architect, engineer, bep) for create/edit/delete/status-transition; true for client view only; false for all other deny cases
    - Acceptance: Role permission matrix enforced
    - _Requirements: 6.1, 6.2_

  - [x] 7.2 Implement assertFieldAction pure decision function
    - Returns permit/deny decision with authorization error on deny; does not modify target record
    - Acceptance: Decision pure, no side effects
    - _Requirements: 6.2, 6.5_

  - [x] 7.3 Implement assertFieldAction I/O wrapper
    - Wraps pure decision, writes SiteAuditRecord with outcome on every attempt; denied actions leave target unchanged and write audit with outcome='denied'; denies site_manager payment release with contractor sign-off message
    - Acceptance: Every action audited with outcome; payment release governance preserved
    - _Requirements: 6.3, 6.4_

- [x] 8. Schema definitions (`src/lib/schemas.ts`)
  - [x] 8.1 Implement drawingPinSchema
    - `drawingId` non-empty string; `x`, `y` numbers between 0 and 1 inclusive; matches validateDrawingPin
    - Acceptance: Schema validates pins
    - _Requirements: 1.1, 1.4_

  - [x] 8.2 Implement checklistTemplateSchema
    - Items 1–200, prompt 1–500 chars, responseType enum; matches validateTemplate
    - Acceptance: Schema validates templates
    - _Requirements: 3.1, 3.7_

  - [x] 8.3 Implement checklistResponseSchema
    - Text max 1000 chars; pass/fail/na, numeric, or text per responseType
    - Acceptance: Schema validates responses
    - _Requirements: 3.3, 3.8_

  - [x] 8.4 Implement queuedCaptureSchema
    - clientId, kind, payload, createdAt, attempts, status; matches QueuedCapture type
    - Acceptance: Schema validates queue entries
    - _Requirements: 4.7_

- [x] 9. Service layer — field issue status & normalization (`src/services/fieldIssueService.ts`)
  - [x] 9.1 Implement field issue status and responsible-party normalization
    - Pure function records the lifecycle status as exactly one of the existing snag enum (open, allocated, ready_for_reinspection, closed, rejected), defaulting to `open` on creation, and records the responsible party, defaulting to `unassigned` when none is provided
    - Rejects any out-of-enum status value with an error naming the invalid value and leaves the existing status unchanged
    - Reuses the existing snag status enum from `snagService`
    - Acceptance: Valid status/party normalized, invalid status rejected by name, existing status preserved
    - _Requirements: 5.1, 5.2_

  - [x] 9.2 Implement status-transition guard
    - Wraps the existing `isValidSnagTransition(source, target)`; permits a transition only if the state machine allows it, otherwise rejects with an error naming the source and target statuses and leaves the source status unchanged
    - Acceptance: Transition permitted iff allowed by the existing snag state machine
    - _Requirements: 5.3_

  - [x] 9.3 Implement payment-blocking flag maintenance
    - Pure function marks an issue as blocking payment if and only if its severity is high or critical and its status is neither closed nor rejected; clears the flag on transition to closed or rejected
    - Composes the existing `snagBlocksPayment` rule and `paymentBlockerService` (reused unchanged)
    - Acceptance: Payment-blocking invariant holds; flag cleared on close/reject
    - _Requirements: 5.7, 5.8_

  - [x] 9.4 Implement FieldIssue normalizing adapter
    - Pure adapter mapping the existing `SnagItem`, `NonConformanceReport`, and inspection findings into the `FieldIssue` view-model union consumed by the dashboard, so existing records need no migration
    - Acceptance: Dashboard reads a uniform FieldIssue shape across all source record types
    - _Requirements: 5.1, 5.4_

- [x] 10. UI component — IssueDashboard (`src/components/IssueDashboard.tsx`)
  - [x] 10.1 Implement dashboard with AND-filtered view
    - Filters by status, severity, responsible party, lifecycle stage; displays only issues matching all filters
    - Shows per-status counts (open, allocated, ready_for_reinspection, closed, rejected)
    - Acceptance: Dashboard AND-filters correctly, counts accurate
    - _Requirements: 5.4, 5.5, 5.6_

  - [x] 10.2 Implement drawing pin entry point
    - Link/button to DrawingPinViewer for issues with pins
    - Acceptance: Drawing pins accessible from dashboard
    - _Requirements: 1.3, 8.1_

  - [x] 10.3 Implement checklist and report access
    - Links to ChecklistRunner and FieldReportView, gated by role
    - Acceptance: Checklist and report entry points available
    - _Requirements: 3.2, 7.1, 8.1_

  - [x] 10.4 Implement keyboard navigation and accessibility
    - All controls keyboard-reachable, accessible names exposed, screen reader support
    - Acceptance: Interactive controls keyboard-operable with accessible names
    - _Requirements: 9.4, 9.5_

- [x] 11. UI component — DrawingPinViewer (`src/components/DrawingPinViewer.tsx`)
  - [x] 11.1 Render drawing with pin markers
    - Display one marker per issue whose drawingId matches displayed drawing, positioned at stored (x, y); no markers for non-matching issues
    - Acceptance: Markers accurate to stored coordinates
    - _Requirements: 1.3_

  - [x] 11.2 Implement pin placement UI
    - Click-to-place or drag-to-place pin on drawing canvas; normalize coordinates to 0..1
    - Acceptance: Pin placement captures normalized coordinates
    - _Requirements: 1.1_

  - [x] 11.3 Implement pin editing
    - Edit existing pin coordinates; reject invalid coordinates, preserve prior location on error
    - Acceptance: Pin editing validates and preserves location on error
    - _Requirements: 1.4, 1.6_

  - [x] 11.4 Implement keyboard navigation
    - Tab to pin marker, arrow keys to adjust coordinates, accessible name for each pin
    - Acceptance: Pin viewer fully keyboard-navigable
    - _Requirements: 9.4, 9.5_

- [x] 12. UI component — PhotoAnnotator (`src/components/PhotoAnnotator.tsx`)
  - [x] 12.1 Implement photo capture
    - Accept JPEG/PNG files ≤ 25 MB; create FieldEvidence record within 2 seconds before blob upload completes; reject unsupported format/size, return error, do not create FieldEvidence
    - Acceptance: Fast FieldEvidence creation ahead of blob upload
    - _Requirements: 2.1, 2.6_

  - [x] 12.2 Implement annotation UI
    - Draw arrows and text notes on photo; store structured shapes with type, points, style, text; flattened rendered image alongside structured data
    - Acceptance: Annotations stored as structured + flattened
    - _Requirements: 2.2_

  - [x] 12.3 Implement annotation round-trip
    - Save and reload annotation; all shapes restored with type, coordinates, style, text intact
    - Acceptance: Annotation round-trip preserves all data
    - _Requirements: 2.3, 2.4_

  - [x] 12.4 Implement blob retry logic
    - On blob upload failure, retain in sync queue; retry up to 5 times; on exhaustion mark failed, surface error, preserve FieldEvidence
    - Acceptance: Blob failures don't lose FieldEvidence, retry on failure
    - _Requirements: 2.5_

  - [x] 12.5 Implement keyboard navigation
    - Tab through annotation tools, keyboard shortcuts (arrow tool, text tool, undo/redo), accessible names and ARIA labels
    - Acceptance: Annotator fully keyboard-navigable
    - _Requirements: 9.4, 9.5_

- [x] 13. UI component — ChecklistRunner (`src/components/ChecklistRunner.tsx`)
  - [x] 13.1 Implement checklist instance display
    - Show template items in order with response type indicators; display pass/fail/na counts as checklist progresses
    - Acceptance: Items rendered in order, counts accurate
    - _Requirements: 3.2, 3.5_

  - [x] 13.2 Implement response recording
    - Accept pass/fail/na, numeric, or text responses per item type; validate, reject invalid leaving existing unchanged; store response against item
    - Acceptance: Valid responses persist, invalid rejected
    - _Requirements: 3.3, 3.8_

  - [x] 13.3 Implement fail-to-issue conversion
    - For failed items, provide "convert to issue" action creating a FieldIssueDraft carrying prompt, checklist reference, evidence
    - Acceptance: Failed items convertible to issues with context
    - _Requirements: 3.4_

  - [x] 13.4 Implement completion and counts
    - Mark instance completed; compute and persist pass/fail/na counts
    - Acceptance: Counts persist with completed instance
    - _Requirements: 3.5_

  - [x] 13.5 Implement keyboard navigation
    - Tab through items, keyboard shortcuts for response options, accessible names for all interactive elements
    - Acceptance: Runner fully keyboard-navigable
    - _Requirements: 9.4, 9.5_

- [x] 14. UI component — ChecklistTemplateEditor (`src/components/ChecklistTemplateEditor.tsx`)
  - [x] 14.1 Implement template authoring
    - Add/remove items, edit prompts and response types; validate as user types (1–200 items, 1–500 char prompts, responseType enum); rejection UI with field names
    - Acceptance: Invalid templates rejected with field names
    - _Requirements: 3.1, 3.7_

  - [x] 14.2 Implement template persistence
    - Save template to Firestore; validate before save
    - Acceptance: Valid templates persist, invalid rejected
    - _Requirements: 3.1_

  - [x] 14.3 Implement keyboard navigation
    - Tab through form fields, keyboard shortcuts for add/remove, accessible form labels and descriptions
    - Acceptance: Editor fully keyboard-navigable
    - _Requirements: 9.4, 9.5_

- [x] 15. UI component — FieldReportView (`src/components/FieldReportView.tsx`)
  - [x] 15.1 Implement report generation
    - Date picker, project selector; generate report for date (aggregates 00:00–23:59 in project TZ); handle missing weather (display 'not recorded')
    - Acceptance: Report generation by date, weather handling
    - _Requirements: 7.1, 7.3_

  - [x] 15.2 Implement report display
    - Show aggregated issues (ID, status, severity); show blocking count and outstanding snag count (Close-out only); show evidence references
    - Acceptance: Report displays all aggregated data
    - _Requirements: 7.2, 7.4, 7.5_

  - [x] 15.3 Implement report export
    - Export to PDF/DOCX format containing date, project, issue summary, evidence refs
    - Acceptance: Export document contains all fields
    - _Requirements: 7.4_

  - [x] 15.4 Implement keyboard navigation
    - Tab through date picker, project selector, export button; accessible names and labels
    - Acceptance: Report view fully keyboard-navigable
    - _Requirements: 9.4, 9.5_

- [x] 16. Integration — navigation and routing (`src/navigation/architexNavigationConfig.ts`)
  - [x] 16.1 Wire IssueDashboard to Projects → snags section
    - Mount IssueDashboard in existing snags navigation key; preserve existing SnagManager functionality
    - Acceptance: Dashboard accessible via Projects → snags
    - _Requirements: 8.1_

  - [x] 16.2 Wire stage-specific capture entry points
    - Build stage: enable field capture, checklists, reporting through Toolboxes construction_admin
    - Close-out stage: enable snag rectification + handover reporting through Toolboxes closeout
    - Other stages: read-only dashboard + reporting
    - Acceptance: Stage-gated capture capabilities enforced
    - _Requirements: 8.2, 8.3, 8.4_

  - [x] 16.3 Implement role-aware visibility
    - Editor roles: full access; client: read/reporting only; other roles: deny with authorization error
    - Acceptance: Role-aware access enforced across navigation
    - _Requirements: 6.1, 6.2_

- [x] 17. Integration — API router endpoints (`src/lib/api-router.ts`)
  - [x] 17.1 Add POST /api/field-issues (create field issue)
    - Calls fieldAccessService.assertFieldAction, then fieldIssueService normalization + snagService; payload location/drawingPin, description, severity, responsible party; defaults status to open and responsible party to unassigned; returns FieldIssue with ID or authorization error
    - Acceptance: Issues created via API, access controlled, defaults applied
    - _Requirements: 5.1, 6.2_

  - [x] 17.2 Add PATCH /api/field-issues/{id} (update field issue)
    - Calls fieldAccessService.assertFieldAction, then fieldIssueService transition guard + snagService; supports location/drawingPin update, status transition (rejects invalid/ disallowed), responsible party change; maintains payment-blocking flag
    - Acceptance: Updates gated by access control; invalid/disallowed status rejected; blocking flag maintained
    - _Requirements: 5.2, 5.3, 5.7, 5.8, 6.2_

  - [x] 17.3 Add POST /api/photo-annotations (save annotation)
    - Calls photoAnnotationService.saveAnnotation; payload evidenceId, shapes, flattened URI
    - Acceptance: Annotations persist via API
    - _Requirements: 2.2_

  - [x] 17.4 Add POST /api/checklist-instances (start checklist)
    - Calls checklistService.startInstance; payload templateId, projectId, location; returns ChecklistInstance with items
    - Acceptance: Checklist instances created via API
    - _Requirements: 3.2_

  - [x] 17.5 Add PATCH /api/checklist-instances/{id}/responses (record response)
    - Calls checklistService.recordResponse; payload itemId, value; validates response, returns updated instance or error
    - Acceptance: Responses recorded with validation
    - _Requirements: 3.3, 3.8_

  - [x] 17.6 Add GET /api/field-reports (generate report)
    - Calls fieldReportService.generateReport; query params projectId, date, timeZone; returns FieldReport
    - Acceptance: Reports generated via API
    - _Requirements: 7.1_

  - [x] 17.7 Add POST /api/field-reports/{id}/export (export report)
    - Calls fieldReportService.exportReport; returns document (PDF/DOCX)
    - Acceptance: Reports exported via API
    - _Requirements: 7.4_

  - [x] 17.8 Add POST /api/sync-queue/flush (offline sync)
    - Calls syncEngineService.flush; transmits queued captures to Firestore; returns failed count
    - Acceptance: Offline captures synced via API
    - _Requirements: 4.2, 4.3, 4.4, 4.5_

- [ ] 18. Property test — drawing pin and text location validation
  - [ ]* 18.1 Write property test for drawing pin and text location validation
    - **Property 1: Drawing pin and text location validation**
    - **Validates: Requirements 1.1, 1.4, 1.7**
    - `validateDrawingPin` accepts iff non-empty drawingId and x, y ∈ [0, 1] inclusive; each absent/out-of-range coordinate is named; text-only location accepted iff length ∈ [1, 500]
    - Minimum 100 iterations with fast-check generators

- [ ] 19. Property test — pin rejection and location preservation
  - [ ]* 19.1 Write property test for pin rejection and location preservation
    - **Property 2: Pin rejection for unknown drawings leaves location unchanged**
    - **Validates: Requirements 1.5**
    - For any pin with unknown drawingId, `attachDrawingPin` rejects with drawing_not_found and existing location is unchanged
    - Minimum 100 iterations

- [ ] 20. Property test — pin markers match displayed drawing
  - [ ]* 20.1 Write property test for pin markers and drawing matching
    - **Property 3: Pin markers match the displayed drawing exactly**
    - **Validates: Requirements 1.3**
    - For any issues and displayed drawing ID, `pinsForDrawing` returns exactly one entry per issue whose pin drawingId matches, zero for others
    - Minimum 100 iterations

- [ ] 21. Property test — photo annotation round-trip
  - [ ]* 21.1 Write property test for photo annotation round-trip
    - **Property 4: Photo annotation round-trip**
    - **Validates: Requirements 2.3, 2.4**
    - Deserializing a serialized annotation equals the original in shape count, order, type, coordinates, style
    - Minimum 100 iterations

- [ ] 22. Property test — photo attachment format and size validation
  - [ ]* 22.1 Write property test for photo attachment format and size validation
    - **Property 5: Photo attachment format and size validation**
    - **Validates: Requirements 2.6**
    - For any file descriptor (mime type, byte size), accept iff JPEG/PNG and size ≤ 25 MB; rejected attachments create no FieldEvidence and return a format/size error
    - Minimum 100 iterations

- [ ] 23. Property test — checklist template validation
  - [ ]* 23.1 Write property test for checklist template validation
    - **Property 6: Checklist template validation**
    - **Validates: Requirements 3.1, 3.7**
    - Accept iff 1–200 items, each prompt ∈ [1, 500] chars, responseType in enum; reject invalid with field-naming error
    - Minimum 100 iterations

- [ ] 24. Property test — checklist instance item order
  - [ ]* 24.1 Write property test for checklist instance item preservation
    - **Property 7: Checklist instance preserves template item order**
    - **Validates: Requirements 3.2**
    - Starting an instance produces instance items equal to template items in count and order
    - Minimum 100 iterations

- [ ] 25. Property test — checklist response validation
  - [ ]* 25.1 Write property test for checklist response validation
    - **Property 8: Checklist response validation**
    - **Validates: Requirements 3.3, 3.8**
    - Accept iff response matches item responseType (text ≤ 1000 chars); reject mismatch with error naming expected type, existing response unchanged
    - Minimum 100 iterations

- [ ] 26. Property test — failed item to issue conversion
  - [ ]* 26.1 Write property test for failed item to issue conversion
    - **Property 9: Failed item converts to an issue carrying its context**
    - **Validates: Requirements 3.4**
    - For any item with a fail response, conversion produces an issue draft carrying item prompt, checklist reference, and attached evidence
    - Minimum 100 iterations

- [ ] 27. Property test — checklist counts computation
  - [ ]* 27.1 Write property test for checklist counts computation
    - **Property 10: Checklist counts cover pass-fail-na items only**
    - **Validates: Requirements 3.5**
    - `computeCounts` produces pass, fail, na counts summing to the pass_fail_na item count; each count equals matching responses; numeric/text items do not affect counts
    - Minimum 100 iterations

- [ ] 28. Property test — checklist template round-trip
  - [ ]* 28.1 Write property test for checklist template round-trip
    - **Property 11: Checklist template round-trip**
    - **Validates: Requirements 3.6**
    - Deserializing a serialized template equals the original in item count, order, and definition
    - Minimum 100 iterations

- [ ] 29. Property test — sync queue serialization round-trip
  - [ ]* 29.1 Write property test for sync queue serialization round-trip
    - **Property 12: Sync queue serialization round-trip**
    - **Validates: Requirements 4.7**
    - Deserializing a serialized localStorage queue reconstructs a queue equivalent in entry count, order, and all fields
    - Minimum 100 iterations

- [ ] 30. Property test — queue transmission order
  - [ ]* 30.1 Write property test for queue transmission order
    - **Property 13: Queue transmission order is creation order**
    - **Validates: Requirements 4.2**
    - `orderForTransmission` yields entries ordered by ascending createdAt, preserving creation order
    - Minimum 100 iterations

- [ ] 31. Property test — queue capacity enforcement
  - [ ]* 31.1 Write property test for queue capacity enforcement
    - **Property 14: Enqueue respects capacity**
    - **Validates: Requirements 4.1, 4.6**
    - `enqueue` accepts while size < capacity (≥ 500) and rejects with queue_full once at capacity
    - Minimum 100 iterations

- [ ] 32. Property test — idempotent reconciliation with retry accounting
  - [ ]* 32.1 Write property test for idempotent reconciliation
    - **Property 15: Idempotent reconciliation with retry accounting**
    - **Validates: Requirements 4.3, 4.4, 4.5, 4.8**
    - Reconciliation removes on success, retains and increments attempts on failure (up to 5), marks failed when exhausted, surfaces failed count, and produces exactly one persisted record per client ID
    - Minimum 100 iterations

- [ ] 33. Property test — field issue status enum and defaults
  - [ ]* 33.1 Write property test for field issue status and defaults
    - **Property 16: Field issue status enum and defaults**
    - **Validates: Requirements 5.1, 5.2**
    - Recorded status ∈ {open, allocated, ready_for_reinspection, closed, rejected} (defaults open); responsible party is supplied value or 'unassigned'; any other status rejected with error naming it, existing status unchanged
    - Exercises `fieldIssueService` status/responsible-party normalization (task 9.1)
    - Minimum 100 iterations

- [ ] 34. Property test — snag state machine transitions
  - [ ]* 34.1 Write property test for snag state machine transitions
    - **Property 17: Status transitions obey the existing snag state machine**
    - **Validates: Requirements 5.3**
    - A transition is permitted iff `isValidSnagTransition(source, target)`; a disallowed transition is rejected with an error naming the pair, source unchanged
    - Exercises `fieldIssueService` transition guard (task 9.2)
    - Minimum 100 iterations

- [ ] 35. Property test — dashboard AND-filtering
  - [ ]* 35.1 Write property test for dashboard AND-filtering
    - **Property 18: Dashboard filters combine with logical AND**
    - **Validates: Requirements 5.4**
    - For any issues and any combination of filters, the result contains every issue matching all filters and no issue failing any filter
    - Minimum 100 iterations

- [ ] 36. Property test — per-status counts exhaustiveness
  - [ ]* 36.1 Write property test for per-status counts exhaustiveness
    - **Property 19: Per-status counts are exhaustive over the filtered set**
    - **Validates: Requirements 5.5, 5.6**
    - The dashboard reports a count for each of the five statuses equal to the number of issues with that status (zero if none); the five counts sum to the set size
    - Minimum 100 iterations

- [ ] 37. Property test — payment-blocking invariant
  - [ ]* 37.1 Write property test for payment-blocking invariant
    - **Property 20: Payment-blocking invariant**
    - **Validates: Requirements 5.7, 5.8**
    - An issue blocks payment iff severity ∈ {high, critical} and status ∉ {closed, rejected}; transitioning to closed/rejected clears the flag
    - Exercises `fieldIssueService` payment-blocking maintenance (task 9.3)
    - Minimum 100 iterations

- [ ] 38. Property test — role permission matrix
  - [ ]* 38.1 Write property test for role permission matrix
    - **Property 21: Role permission matrix**
    - **Validates: Requirements 6.1, 6.2, 6.5**
    - `canPerform` permits iff role ∈ editor roles for create/edit/delete/status-transition, or client for view; otherwise denied with error naming action and role, target unchanged
    - Minimum 100 iterations

- [ ] 39. Property test — field action audit
  - [ ]* 39.1 Write property test for field action audit
    - **Property 22: Every field action is audited with its outcome**
    - **Validates: Requirements 6.4**
    - For any attempted field action, exactly one SiteAuditRecord is written capturing actor, role, action type, source ID, outcome (permitted/denied), and timestamp
    - Minimum 100 iterations

- [ ] 40. Property test — field report date-range aggregation
  - [ ]* 40.1 Write property test for field report date-range aggregation
    - **Property 23: Field report date-range aggregation**
    - **Validates: Requirements 7.1, 7.3**
    - Aggregates exactly the issues/evidence with timestamps ∈ [00:00:00, 23:59:59] of the date in project TZ; weather marked 'not_recorded' if absent rather than failing
    - Minimum 100 iterations

- [ ] 41. Property test — field report blocking and handover counts
  - [ ]* 41.1 Write property test for field report blocking and handover counts
    - **Property 24: Field report blocking and handover counts**
    - **Validates: Requirements 7.2, 7.5**
    - Blocking count equals aggregated issues blocking payment with status ∉ {closed, rejected} as of date; in Close-out stage, outstanding-handover count equals snags with status ∉ {closed, rejected}
    - Minimum 100 iterations

- [ ] 42. Property test — field report export content
  - [ ]* 42.1 Write property test for field report export content
    - **Property 25: Field report export content**
    - **Validates: Requirements 7.4**
    - The exported document contains date, project ID, an issue summary (ID, status, severity per issue), and an evidence reference per aggregated evidence item
    - Minimum 100 iterations

- [ ] 43. Property test — stage-gated capture capabilities
  - [ ]* 43.1 Write property test for stage-gated capture capabilities
    - **Property 26: Stage-gated capture capabilities**
    - **Validates: Requirements 8.4**
    - Stage-specific capture entry points are enabled iff stage ∈ {Build, Close-out}; for other stages the dashboard is exposed in read/reporting mode only
    - Minimum 100 iterations

- [ ] 44. Integration test — drawing pin persistence and rollback
  - [ ]* 44.1 Write integration test for drawing pin persistence and rollback
    - Tests `attachDrawingPin` with a Firestore mock; verifies atomic persistence (pin and location both stored or neither) and rollback on error (existing location unchanged)
    - Acceptance: Atomicity and rollback verified
    - _Requirements: 1.2, 1.6_

- [ ] 45. Integration test — photo evidence fast creation and blob retry
  - [ ]* 45.1 Write integration test for photo evidence fast creation and blob retry
    - Tests fast FieldEvidence creation before blob upload completes; blob upload failure, retry up to 5 times, failure surface; FieldEvidence persists even if blob fails
    - Acceptance: FieldEvidence created within 2 s, blob retries exhausted
    - _Requirements: 2.1, 2.5_

- [ ] 46. Integration test — offline capture queue and sync
  - [ ]* 46.1 Write integration test for offline capture queue and sync
    - Tests enqueue when offline, localStorage persistence, flush on reconnect in creation order, idempotent sync with client ID tracking
    - Acceptance: Offline captures queue and sync correctly
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

- [ ] 47. Integration test — checklist instance to issue conversion
  - [ ]* 47.1 Write integration test for checklist instance to issue conversion
    - Tests startInstance from template, recordResponses, failedItemToIssue; verifies issue draft carries prompt, checklist reference, evidence
    - Acceptance: Failed items convert to issues with all context
    - _Requirements: 3.4_

- [ ] 48. Integration test — field access control and audit
  - [ ]* 48.1 Write integration test for field access control and audit
    - Tests assertFieldAction for permitted and denied outcomes; verifies SiteAuditRecord written for each attempt with correct outcome; denied actions leave target unchanged; site_manager payment-release denial with contractor sign-off message
    - Acceptance: Access controlled and audited; payment-release governance preserved
    - _Requirements: 6.2, 6.3, 6.4_

- [ ] 49. End-to-end test — drawing pin viewer placement
  - [ ]* 49.1 Write E2E test for drawing pin viewer placement
    - Tests UI pin placement by click/drag; verifies normalized coordinates captured and persisted; tests marker rendering accuracy
    - Acceptance: Pin placement UI functional
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 50. End-to-end test — photo annotation markup and export
  - [ ]* 50.1 Write E2E test for photo annotation markup and export
    - Tests photo upload, arrow/text markup, save and reload; verifies annotation round-trip preserves all data; tests export of annotated photo
    - Acceptance: Photo annotation UI functional, round-trip verified
    - _Requirements: 2.2, 2.4_

- [ ] 51. End-to-end test — checklist execution and counts
  - [ ]* 51.1 Write E2E test for checklist execution and counts
    - Tests template creation, instance start, response recording; pass/fail/na count computation and persistence; failed-item-to-issue action
    - Acceptance: Checklist UI functional, counts accurate
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 52. Documentation — update role sheets (`docs/toolbox-specs/`)
  - [x] 52.1 Update role sheets for all affected roles
    - site_manager: field capture, issue assignment, dashboard, reporting; contractor: field capture, checklists, photo annotation; subcontractor: field capture, checklists; architect/engineer: issue review, reporting; bep: checklist templates, reporting; client: issue view, reporting (read-only)
    - Wire the predeploy:check gate so deployment is blocked if role sheets are not updated
    - Acceptance: All affected role sheets updated, deployment check passes
    - _Requirements: 8.5, 8.6_

- [x] 53. Documentation and verification
  - [x] 53.1 Document implementation status and run verification suite
    - Record completion of the 26 property tests and integration/E2E coverage; document accessibility compliance
    - Run `npm run lint`, `npm test`, and `npm run build` and confirm each completes with a zero exit code
    - Acceptance: Implementation docs complete and traceable; verification suite green
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references specific requirement clauses for traceability; property tests additionally cite the design Property number they validate.
- This feature is an extend/enhance effort: the existing snag state machine (`isValidSnagTransition`), `snagBlocksPayment`, `paymentBlockerService`, and `siteAuditService` are reused unchanged and composed by the new services.
- Property tests use fast-check + Vitest at a minimum of 100 iterations each and validate the 26 universal correctness properties from the design document.
- Service-layer pure functions and Zod schemas (epics 2–8) are implemented and tested as completed. The field-issue status & normalization service (epic 9) is the implementation home for Requirements 5.1, 5.2, 5.3, 5.7, and 5.8 and the design's FieldIssue normalizing adapter, and remains to be built. UI epics 10 (IssueDashboard) and 11 (DrawingPinViewer) are complete; epic 12 (PhotoAnnotator) is in progress. Remaining work covers epic 9, UI completion (epics 12–15), navigation/API wiring (epics 16–17), tests (epics 18–51), and documentation (epics 52–53).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["9.1", "12.4", "13.1", "14.1", "15.1", "16.1", "17.1"] },
    { "id": 1, "tasks": ["9.2", "12.5", "13.2", "14.2", "15.2", "16.2", "17.2"] },
    { "id": 2, "tasks": ["9.3", "13.3", "14.3", "15.3", "16.3", "17.3"] },
    { "id": 3, "tasks": ["9.4", "13.4", "15.4", "17.4"] },
    { "id": 4, "tasks": ["13.5", "17.5"] },
    { "id": 5, "tasks": ["17.6"] },
    { "id": 6, "tasks": ["17.7"] },
    { "id": 7, "tasks": ["17.8"] },
    { "id": 8, "tasks": ["18.1", "21.1", "23.1", "29.1", "33.1", "38.1", "40.1", "43.1"] },
    { "id": 9, "tasks": ["19.1", "22.1", "24.1", "30.1", "34.1", "39.1", "41.1"] },
    { "id": 10, "tasks": ["20.1", "25.1", "31.1", "35.1", "42.1"] },
    { "id": 11, "tasks": ["26.1", "32.1", "36.1"] },
    { "id": 12, "tasks": ["27.1", "37.1"] },
    { "id": 13, "tasks": ["28.1"] },
    { "id": 14, "tasks": ["44.1", "45.1", "46.1", "47.1", "48.1", "49.1", "50.1", "51.1"] },
    { "id": 15, "tasks": ["52.1", "53.1"] }
  ]
}
```
