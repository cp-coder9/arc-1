# Task List — forma-build-site-tools

## Overview

This task list implements the forma-build-site-tools feature extending Pack 9 (Site Execution & Field Control) with Autodesk Build/Forma-style field capabilities. Tasks are grouped by domain area, ordered by dependency, and each includes concrete acceptance criteria tied to requirements.

**Total scope:** 62 implementation tasks + 26 property-based testing tasks + 8 integration/testing tasks + 2 documentation tasks = **98 total tasks**

### Architecture Layers

1. **Service Layer** (`src/services/`) — Pure logic, Firestore-touched functions, error handling
2. **UI Components** (`src/components/`) — React components consuming services
3. **Data Models** (`src/types.ts`, `src/lib/schemas.ts`) — Type definitions and Zod schemas
4. **Navigation Integration** — Wiring into existing Projects and Toolboxes sections

---

## Dependency Graph

```
Type Changes (1.1)
  ↓
  ├→ Service Layer Tasks (2.x - 8.x)
  │   ├→ Drawing Pin Service (2.x)
  │   ├→ Photo Annotation Service (3.x)
  │   ├→ Checklist Service (4.x)
  │   ├→ Sync Engine Service (5.x)
  │   ├→ Field Report Service (6.x)
  │   ├→ Field Access Service (7.x)
  │   └→ Schema Definitions (8.x)
  │
  ├→ UI Component Tasks (9.x - 14.x)
  │   ├→ IssueDashboard (9.x) [depends on 2.x, 7.x]
  │   ├→ DrawingPinViewer (10.x) [depends on 2.x]
  │   ├→ PhotoAnnotator (11.x) [depends on 3.x]
  │   ├→ ChecklistRunner (12.x) [depends on 4.x, 5.x]
  │   ├→ ChecklistTemplateEditor (13.x) [depends on 4.x]
  │   └→ FieldReportView (14.x) [depends on 6.x]
  │
  ├→ Integration Tasks (15.x - 16.x)
  │   ├→ Navigation Integration (15.x) [depends on 9.x - 14.x]
  │   └→ API Router Updates (16.x) [depends on 2.x - 7.x]
  │
  ├→ Property-Based Testing (17.x - 42.x)
  │   └→ One PBT task per correctness property
  │
  ├→ Integration & UI Testing (43.x - 50.x)
  │
  └→ Documentation (51.x - 52.x)
```

---

## Phase 1: Data Model & Type Changes

### Task 1.1: Extend type definitions (src/types.ts)

- [ ] **1.1 Extend SnagItem with optional drawingPin field**
  - Add `drawingPin?: DrawingPin` to existing `SnagItem` type
  - Ensure text `location` (1–500 chars) remains required as fallback
  - Acceptance: Type compiles, existing snag records unaffected, new records may carry drawingPin

- [ ] **1.2 Extend SiteAuditRecord with outcome and actionType**
  - Add `outcome: 'permitted' | 'denied'` field
  - Add `actionType: FieldActionType` field
  - Acceptance: Audits capture both permitted and denied outcomes per Req 6.4

- [ ] **1.3 Add new types to src/types.ts**
  - DrawingPin, PhotoAnnotation, AnnotationShape, ChecklistTemplate, ChecklistItem, ChecklistInstance, ChecklistResponse, QueuedCapture, FieldReport, FieldActionType
  - Follows existing type conventions and interfaces from Pack 9
  - Acceptance: All 10 types defined, compile cleanly, exported for service use

---

## Phase 2: Service Layer — Drawing Pin Service

### Task 2.1: Implement drawingPinService.ts

- [ ] **2.1 Implement validateDrawingPin pure function**
  - Validates `drawingId` is non-empty, `x` and `y` are present and within 0..1
  - Returns structured `PinValidationError[]` naming each offending field
  - Acceptance: Validates in-range pins, rejects out-of-range, all errors named

- [ ] **2.2 Implement pinsForDrawing pure function**
  - Filters issues whose stored pin drawingId matches displayed drawing
  - Returns exactly one entry per matching issue, zero for non-matching
  - Acceptance: Filtering by drawingId produces correct result set (Req 1.3)

- [ ] **2.3 Implement attachDrawingPin I/O function**
  - Validates pin (structure + drawing existence), persists atomically, rolls back on failure
  - Rejects unknown drawing without modifying existing location
  - Acceptance: Pin persists on valid input, existing location preserved on error (Req 1.5, 1.6)

---

## Phase 3: Service Layer — Photo Annotation Service

### Task 3.1: Implement photoAnnotationService.ts

- [ ] **3.1 Implement serializeAnnotation and deserializeAnnotation pure functions**
  - Round-trip serialization of PhotoAnnotation (shapes, styles, text)
  - Deserialized form equals original in shape count, order, and fields
  - Acceptance: Round-trip property verified, no data loss (Req 2.3, 2.4)

- [ ] **3.2 Implement saveAnnotation I/O function**
  - Persists PhotoAnnotation to Firestore `photo_annotations` collection
  - Links via `evidenceId` to FieldEvidence
  - Acceptance: Annotation persists and can be loaded (Req 2.2)

- [ ] **3.3 Implement loadAnnotation I/O function**
  - Retrieves PhotoAnnotation by projectId and evidenceId
  - Returns null if not found
  - Acceptance: Load after save retrieves identical annotation

---

## Phase 4: Service Layer — Checklist Service

### Task 4.1: Implement checklistService.ts (part 1 — validation)

- [ ] **4.1 Implement validateTemplate pure function**
  - Validates 1–200 items, prompts 1–500 chars, responseType enum
  - Returns TemplateValidationError[] naming invalid fields
  - Acceptance: Valid templates accepted, invalid rejected with field names (Req 3.1, 3.7)

- [ ] **4.2 Implement validateResponse pure function**
  - Checks response value against item's responseType (pass_fail_na, numeric, text)
  - Text max 1000 chars
  - Acceptance: Valid responses accepted, invalid rejected (Req 3.3, 3.8)

- [ ] **4.3 Implement computeCounts pure function**
  - Counts pass, fail, na over pass_fail_na items only
  - Sum equals number of pass_fail_na items
  - Numeric and text items do not affect counts
  - Acceptance: Counts are exhaustive and accurate (Req 3.5, 3.10)

### Task 4.2: Implement checklistService.ts (part 2 — serialization & conversion)

- [ ] **4.4 Implement serializeTemplate and deserializeTemplate pure functions**
  - Round-trip serialization of ChecklistTemplate
  - Deserialized form equals original in item count, order, definition
  - Acceptance: Round-trip property verified (Req 3.6, 3.11)

- [ ] **4.5 Implement failedItemToIssue pure function**
  - Converts a failed checklist item to a FieldIssueDraft
  - Carries item prompt, checklist reference, evidence
  - Acceptance: Converted issue carries all context (Req 3.4, 3.9)

### Task 4.3: Implement checklistService.ts (part 3 — I/O)

- [ ] **4.6 Implement createTemplate I/O function**
  - Validates, then persists ChecklistTemplate to Firestore
  - Assigns ID and createdAt
  - Acceptance: Template persists and can be loaded

- [ ] **4.7 Implement startInstance I/O function**
  - Creates ChecklistInstance from template
  - Copies items in order, initializes responses empty
  - Acceptance: Instance items match template items exactly (Req 3.2, 3.7)

- [ ] **4.8 Implement recordResponse I/O function**
  - Validates response, persists to instance
  - Rejects invalid response, leaves existing unchanged
  - Acceptance: Valid response persists, invalid rejected (Req 3.3, 3.8)

- [ ] **4.9 Implement completeInstance I/O function**
  - Computes counts and marks instance completed
  - Persists to Firestore
  - Acceptance: Counts persist with instance (Req 3.5)

---

## Phase 5: Service Layer — Sync Engine Service

### Task 5.1: Implement syncEngineService.ts (part 1 — local logic)

- [ ] **5.1 Implement serializeQueue and deserializeQueue pure functions**
  - Round-trip serialization of QueuedCapture[] to localStorage
  - Deserialized form equals original in count, order, fields
  - Acceptance: Round-trip property verified (Req 4.7, 4.12)

- [ ] **5.2 Implement orderForTransmission pure function**
  - Orders captures by createdAt ascending
  - Preserves order from queue
  - Acceptance: Transmission order is creation order (Req 4.2, 4.13)

- [ ] **5.3 Implement enqueue pure function**
  - Adds capture to queue if size < capacity (500)
  - Rejects with queue_full if at capacity
  - Accepts at least 500 captures
  - Acceptance: Queue capacity enforced (Req 4.1, 4.6, 4.14)

- [ ] **5.4 Implement reconcile pure function**
  - Idempotent: returns 'persist' if client ID not yet persisted, 'skip' if already persisted
  - Tracks persisted client IDs to ensure single record per ID
  - Acceptance: Idempotent sync produces single record per client ID (Req 4.8, 4.15)

### Task 5.2: Implement syncEngineService.ts (part 2 — I/O & retry)

- [ ] **5.5 Implement enqueue I/O wrapper**
  - Calls pure enqueue, serializes to localStorage on success
  - Returns queue_full error if capacity exceeded
  - Acceptance: Offline captures queued locally, serialized to survive restart (Req 4.1)

- [ ] **5.6 Implement flush I/O function**
  - Transmits queued captures to Firestore in creation order
  - On success, removes from queue and localStorage
  - On failure, retains in queue and increments attempt count
  - Accepts up to 5 retries per capture, then marks failed
  - Returns failed count
  - Acceptance: Sync transmits in order, retries on failure, surfaces failed count (Req 4.2, 4.3, 4.4, 4.5)

---

## Phase 6: Service Layer — Field Report Service

### Task 6.1: Implement fieldReportService.ts

- [ ] **6.1 Implement aggregateReport pure function**
  - Aggregates issues and evidence by date (00:00-23:59 in project TZ)
  - Counts blocking issues not closed/rejected
  - Returns weather or 'not_recorded' if absent
  - For Close-out stage, includes outstanding snag count
  - Acceptance: Aggregation by date is exhaustive, counts accurate (Req 7.1, 7.2, 7.23, 7.24)

- [ ] **6.2 Implement exportReport pure function**
  - Exports FieldReport to document format
  - Contains date, project ID, issue summary (ID, status, severity), evidence references
  - Acceptance: Export document contains all required fields (Req 7.4, 7.25)

- [ ] **6.3 Implement generateReport I/O function**
  - Calls aggregateReport with Firestore queries
  - Persists to `field_reports` collection
  - Acceptance: Report persists and can be retrieved

---

## Phase 7: Service Layer — Field Access Service

### Task 7.1: Implement fieldAccessService.ts

- [ ] **7.1 Implement canPerform pure function**
  - Returns true if role is editor role (site_manager, contractor, subcontractor, architect, engineer, bep) for create/edit/delete/status-transition
  - Returns true if role is client for view only
  - Returns false for all other deny cases
  - Acceptance: Role permission matrix enforced (Req 6.1, 6.2, 6.21)

- [ ] **7.2 Implement assertFieldAction pure function**
  - Returns permit/deny decision with authorization error on deny
  - Does not modify target record
  - Acceptance: Decision pure, no side effects (Req 6.2, 6.5, 6.21)

- [ ] **7.3 Implement assertFieldAction I/O wrapper**
  - Wraps pure decision, writes SiteAuditRecord with outcome on every attempt
  - Denied actions leave target unchanged and write audit with outcome='denied'
  - Acceptance: Every action audited with outcome (Req 6.4, 6.22)

---

## Phase 8: Schema Definitions

### Task 8.1: Define Zod schemas (src/lib/schemas.ts)

- [ ] **8.1 Implement drawingPinSchema**
  - `drawingId`: non-empty string
  - `x`, `y`: numbers between 0 and 1 inclusive
  - Validation matches validateDrawingPin
  - Acceptance: Schema validates pins per Req 1.1, 1.4

- [ ] **8.2 Implement checklistTemplateSchema**
  - Items: 1–200, prompt 1–500 chars, responseType enum
  - Validation matches validateTemplate
  - Acceptance: Schema validates templates per Req 3.1, 3.7

- [ ] **8.3 Implement checklistResponseSchema**
  - Text: max 1000 chars
  - Pass/fail/na, numeric, or text per responseType
  - Acceptance: Schema validates responses per Req 3.3, 3.8

- [ ] **8.4 Implement queuedCaptureSchema**
  - clientId, kind, payload, createdAt, attempts, status
  - Validation matches QueuedCapture type
  - Acceptance: Schema validates queue entries per Req 4.7, 4.12

---

## Phase 9: UI Components — Dashboard

### Task 9.1: Implement IssueDashboard.tsx

- [ ] **9.1 Implement dashboard with AND-filtered view**
  - Filters by status, severity, responsible party, lifecycle stage
  - Displays only issues matching all filters
  - Shows per-status counts (open, allocated, ready_for_reinspection, closed, rejected)
  - Acceptance: Dashboard AND-filters correctly, counts accurate (Req 5.4, 5.5, 5.6, 5.18, 5.19)

- [ ] **9.2 Implement drawing pin entry point**
  - Link/button to DrawingPinViewer for issues with pins
  - Acceptance: Drawing pins accessible from dashboard (Req 1.3, 5.4)

- [ ] **9.3 Implement checklist and report access**
  - Links to ChecklistRunner and FieldReportView
  - Gated by role (Req 6)
  - Acceptance: Checklist and report entry points available (Req 3.2, 5.4, 7.1)

- [ ] **9.4 Implement keyboard navigation and a11y**
  - All controls keyboard-reachable, accessible names exposed
  - Screen reader support for interactive elements
  - Acceptance: WCAG 2.1 AA compliance per Req 9.4, 9.5

---

## Phase 10: UI Components — Drawing Pin Viewer

### Task 10.1: Implement DrawingPinViewer.tsx

- [ ] **10.1 Render drawing with pin markers**
  - Display one marker per issue whose drawingId matches displayed drawing
  - Position markers at stored (x, y) coordinates
  - Do not render markers for non-matching issues
  - Acceptance: Markers accurate to stored coordinates (Req 1.2, 1.3)

- [ ] **10.2 Implement pin placement UI**
  - Click-to-place or drag-to-place pin on drawing canvas
  - Normalize coordinates to 0..1
  - Acceptance: Pin placement captures normalized coordinates (Req 1.1)

- [ ] **10.3 Implement pin editing**
  - Edit existing pin coordinates
  - Reject invalid coordinates, preserve prior location on error
  - Acceptance: Pin editing validates and preserves location on error (Req 1.4, 1.6)

- [ ] **10.4 Implement keyboard navigation**
  - Tab to pin marker, arrow keys to adjust coordinates
  - Accessible name for each pin
  - Acceptance: Pin viewer fully keyboard-navigable (Req 9.4, 9.5)

---

## Phase 11: UI Components — Photo Annotator

### Task 11.1: Implement PhotoAnnotator.tsx

- [ ] **11.1 Implement photo capture**
  - Accept JPEG/PNG files ≤ 25 MB
  - Create FieldEvidence record within 2 seconds before blob upload completes
  - Reject unsupported format/size, return error, do not create FieldEvidence
  - Acceptance: Fast FieldEvidence creation ahead of blob upload (Req 2.1, 2.6)

- [ ] **11.2 Implement annotation UI**
  - Draw arrows and text notes on photo
  - Store structured shapes with type, points, style, text
  - Flattened rendered image alongside structured data
  - Acceptance: Annotations stored as structured + flattened (Req 2.2)

- [ ] **11.3 Implement annotation round-trip**
  - Save and reload annotation
  - All shapes restored with type, coordinates, style, text intact
  - Acceptance: Annotation round-trip preserves all data (Req 2.3, 2.4)

- [ ] **11.4 Implement blob retry logic**
  - On blob upload failure, retain in sync queue
  - Retry up to 5 times
  - On exhaustion, mark failed, surface error, preserve FieldEvidence
  - Acceptance: Blob failures don't lose FieldEvidence, retry on failure (Req 2.5)

- [ ] **11.5 Implement keyboard navigation**
  - Tab through annotation tools, keyboard shortcuts (arrow tool, text tool, undo/redo)
  - Accessible names and ARIA labels
  - Acceptance: Annotator fully keyboard-navigable (Req 9.4, 9.5)

---

## Phase 12: UI Components — Checklist Runner

### Task 12.1: Implement ChecklistRunner.tsx

- [ ] **12.1 Implement checklist instance display**
  - Show template items in order with response type indicators
  - Display pass/fail/na counts as checklist progresses
  - Acceptance: Items rendered in order, counts accurate (Req 3.2, 3.5, 3.10)

- [ ] **12.2 Implement response recording**
  - Accept pass/fail/na, numeric, or text responses per item type
  - Validate response, reject invalid, leave existing unchanged
  - Store response against item
  - Acceptance: Valid responses persist, invalid rejected (Req 3.3, 3.8)

- [ ] **12.3 Implement fail-to-issue conversion**
  - For failed items, provide "convert to issue" action
  - Create FieldIssueDraft carrying prompt, checklist reference, evidence
  - Acceptance: Failed items convertible to issues with context (Req 3.4, 3.9)

- [ ] **12.4 Implement completion and counts**
  - Mark instance completed
  - Compute and persist pass/fail/na counts
  - Acceptance: Counts persist with completed instance (Req 3.5, 3.10)

- [ ] **12.5 Implement keyboard navigation**
  - Tab through items, keyboard shortcuts for response options
  - Accessible names for all interactive elements
  - Acceptance: Runner fully keyboard-navigable (Req 9.4, 9.5)

---

## Phase 13: UI Components — Checklist Template Editor

### Task 13.1: Implement ChecklistTemplateEditor.tsx

- [ ] **13.1 Implement template authoring**
  - Add/remove items, edit prompts and response types
  - Validate as user types (1–200 items, 1–500 char prompts, responseType enum)
  - Rejection UI with field names
  - Acceptance: Invalid templates rejected with field names (Req 3.1, 3.7)

- [ ] **13.2 Implement template persistence**
  - Save template to Firestore
  - Validate before save
  - Acceptance: Valid templates persist, invalid rejected

- [ ] **13.3 Implement keyboard navigation**
  - Tab through form fields, keyboard shortcuts for add/remove
  - Accessible form labels and descriptions
  - Acceptance: Editor fully keyboard-navigable (Req 9.4, 9.5)

---

## Phase 14: UI Components — Field Report View

### Task 14.1: Implement FieldReportView.tsx

- [ ] **14.1 Implement report generation**
  - Date picker, project selector
  - Generate report for date (aggregates 00:00-23:59 in project TZ)
  - Handles missing weather (displays 'not recorded')
  - Acceptance: Report generation by date, weather handling (Req 7.1, 7.3, 7.23)

- [ ] **14.2 Implement report display**
  - Show aggregated issues (ID, status, severity)
  - Show blocking count, outstanding snag count (Close-out only)
  - Show evidence references
  - Acceptance: Report displays all aggregated data (Req 7.2, 7.25)

- [ ] **14.3 Implement report export**
  - Export to PDF/DOCX format
  - Contains date, project, issue summary, evidence refs
  - Acceptance: Export document contains all fields (Req 7.4, 7.25)

- [ ] **14.4 Implement keyboard navigation**
  - Tab through date picker, project selector, export button
  - Accessible names and labels
  - Acceptance: Report view fully keyboard-navigable (Req 9.4, 9.5)

---

## Phase 15: Integration — Navigation & Routing

### Task 15.1: Integrate into existing navigation

- [ ] **15.1 Wire IssueDashboard to Projects → snags section**
  - Mount IssueDashboard in existing snags navigation key
  - Preserve existing SnagManager functionality
  - Acceptance: Dashboard accessible via Projects → snags (Req 8.1, 8.8)

- [ ] **15.2 Wire stage-specific capture entry points**
  - Build stage: enable field capture, checklists, reporting through Toolboxes construction_admin
  - Close-out stage: enable snag rectification + handover reporting through Toolboxes closeout
  - Other stages: read-only dashboard + reporting
  - Acceptance: Stage-gated capture capabilities enforced (Req 8.2, 8.3, 8.4, 8.26)

- [ ] **15.3 Implement role-aware visibility**
  - Editor roles (site_manager, contractor, subcontractor, architect, engineer, bep): full access
  - Client: read/reporting only
  - Other roles: deny with authorization error
  - Acceptance: Role-aware access enforced across navigation (Req 6.1, 6.2, 6.21)

---

## Phase 16: Integration — API Router

### Task 16.1: Add field tools endpoints to api-router.ts

- [ ] **16.1 Add POST /api/field-issues (create field issue)**
  - Calls fieldAccessService.assertFieldAction, then snagService
  - Payload: location/drawingPin, description, severity, responsible party
  - Returns FieldIssue with ID or authorization error
  - Acceptance: Issues created via API, access controlled (Req 6.2)

- [ ] **16.2 Add PATCH /api/field-issues/{id} (update field issue)**
  - Calls fieldAccessService.assertFieldAction, then snagService
  - Supports location/drawingPin update, status transition, responsible party change
  - Returns updated issue or authorization error
  - Acceptance: Updates gated by access control (Req 6.2, 6.21)

- [ ] **16.3 Add POST /api/photo-annotations (save annotation)**
  - Calls photoAnnotationService.saveAnnotation
  - Payload: evidenceId, shapes, flattened URI
  - Acceptance: Annotations persist via API

- [ ] **16.4 Add POST /api/checklist-instances (start checklist)**
  - Calls checklistService.startInstance
  - Payload: templateId, projectId, location
  - Returns ChecklistInstance with items
  - Acceptance: Checklist instances created via API

- [ ] **16.5 Add PATCH /api/checklist-instances/{id}/responses (record response)**
  - Calls checklistService.recordResponse
  - Payload: itemId, value
  - Validates response, returns updated instance or error
  - Acceptance: Responses recorded with validation (Req 3.3, 3.8)

- [ ] **16.6 Add GET /api/field-reports (generate report)**
  - Calls fieldReportService.generateReport
  - Query params: projectId, date, timeZone
  - Returns FieldReport
  - Acceptance: Reports generated via API (Req 7.1)

- [ ] **16.7 Add POST /api/field-reports/{id}/export (export report)**
  - Calls fieldReportService.exportReport
  - Returns document (PDF/DOCX)
  - Acceptance: Reports exported via API (Req 7.4, 7.25)

- [ ] **16.8 Add POST /api/sync-queue/flush (offline sync)**
  - Calls syncEngineService.flush
  - Transmits queued captures to Firestore
  - Returns failed count
  - Acceptance: Offline captures synced via API (Req 4.2, 4.3, 4.4, 4.5)

---

## Phase 17–42: Property-Based Testing (26 tasks, one per correctness property)

All PBT tasks use Vitest with fast-check or Hypothesis generators. Each test validates the correctness property across minimum 100 iterations.


### Task 17.1: Write property test for drawing pin and text location validation

- [ ] **17.1 Write property test for drawing pin and text location validation**
  - **Validates: Requirements 1.1, 1.4, 1.7**
  - Property: For any candidate drawing pin, `validateDrawingPin` accepts it iff it has non-empty drawingId and x, y ∈ [0, 1] inclusive
  - For any out-of-range or missing coordinate, errors name that coordinate
  - For any text-only location, accept iff length ∈ [1, 500]
  - Minimum 100 iterations with fast-check generators
  - Acceptance: Property passes across randomized inputs

### Task 18.1: Write property test for pin rejection and location preservation

- [ ] **18.1 Write property test for pin rejection and location preservation**
  - **Validates: Requirements 1.5**
  - Property: For any drawing pin with unknown drawingId, `attachDrawingPin` rejects with drawing_not_found, existing location unchanged
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 19.1: Write property test for pin markers and drawing matching

- [ ] **19.1 Write property test for pin markers and drawing matching**
  - **Validates: Requirements 1.3**
  - Property: For any issues and any displayed drawing ID, `pinsForDrawing` returns exactly one entry per issue whose pin drawingId matches, zero for others
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 20.1: Write property test for photo annotation round-trip

- [ ] **20.1 Write property test for photo annotation round-trip**
  - **Validates: Requirements 2.3, 2.4**
  - Property: For any photo annotation, deserializing its serialized form equals original in shape count, order, type, coordinates, style
  - Minimum 100 iterations
  - Acceptance: Property passes, no data loss

### Task 21.1: Write property test for photo attachment format and size validation

- [ ] **21.1 Write property test for photo attachment format and size validation**
  - **Validates: Requirements 2.6**
  - Property: For any file descriptor (mime type, byte size), accept iff format is JPEG/PNG and size ≤ 25 MB; reject otherwise with format/size error
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 22.1: Write property test for checklist template validation

- [ ] **22.1 Write property test for checklist template validation**
  - **Validates: Requirements 3.1, 3.7**
  - Property: For any checklist template, accept iff 1–200 items, each prompt ∈ [1, 500] chars, responseType in enum; reject invalid with field-naming error
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 23.1: Write property test for checklist instance item preservation

- [ ] **23.1 Write property test for checklist instance item preservation**
  - **Validates: Requirements 3.2**
  - Property: For any template, starting instance produces instance items equal to template items in count and order
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 24.1: Write property test for checklist response validation

- [ ] **24.1 Write property test for checklist response validation**
  - **Validates: Requirements 3.3, 3.8**
  - Property: For any item and candidate response, accept iff matches item's responseType (text ≤ 1000 chars); reject mismatch with error, existing response unchanged
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 25.1: Write property test for failed item to issue conversion

- [ ] **25.1 Write property test for failed item to issue conversion**
  - **Validates: Requirements 3.4**
  - Property: For any completed instance and any item with fail response, converting produces issue draft carrying item prompt, checklist reference, evidence
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 26.1: Write property test for checklist counts computation

- [ ] **26.1 Write property test for checklist counts computation**
  - **Validates: Requirements 3.5, 3.10**
  - Property: For any instance, `computeCounts` produces pass, fail, na counts whose sum equals pass_fail_na item count; each count equals matching responses; numeric/text items do not affect counts
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 27.1: Write property test for checklist template round-trip

- [ ] **27.1 Write property test for checklist template round-trip**
  - **Validates: Requirements 3.6, 3.11**
  - Property: For any template, deserializing its serialized form equals original in item count, order, definition
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 28.1: Write property test for sync queue serialization round-trip

- [ ] **28.1 Write property test for sync queue serialization round-trip**
  - **Validates: Requirements 4.7, 4.12**
  - Property: For any queue, deserializing its serialized localStorage form reconstructs queue equivalent in entry count, order, all fields
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 29.1: Write property test for queue transmission order

- [ ] **29.1 Write property test for queue transmission order**
  - **Validates: Requirements 4.2, 4.13**
  - Property: For any queue, `orderForTransmission` yields entries ordered by ascending createdAt, preserving creation order
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 30.1: Write property test for queue capacity enforcement

- [ ] **30.1 Write property test for queue capacity enforcement**
  - **Validates: Requirements 4.1, 4.6, 4.14**
  - Property: For any sequence of captures, `enqueue` accepts while size < capacity (≥ 500), rejects with queue_full once at capacity
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 31.1: Write property test for idempotent reconciliation

- [ ] **31.1 Write property test for idempotent reconciliation**
  - **Validates: Requirements 4.3, 4.4, 4.5, 4.8, 4.15**
  - Property: For any queued captures and persist outcomes, reconciliation removes on success, retains and increments attempts on failure (up to 5), marks failed when exhausted, surfaces failed count, produces ≤ 1 persisted record per client ID
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 32.1: Write property test for field issue status and defaults

- [ ] **32.1 Write property test for field issue status and defaults**
  - **Validates: Requirements 5.1, 5.2, 5.16**
  - Property: For any creation/update, status ∈ {open, allocated, ready_for_reinspection, closed, rejected} (defaults open), responsible party ∈ supplied or 'unassigned'; any other status rejected with error, existing status unchanged
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 33.1: Write property test for snag state machine transitions

- [ ] **33.1 Write property test for snag state machine transitions**
  - **Validates: Requirements 5.3, 5.17**
  - Property: For any source/target statuses, transition permitted iff `isValidSnagTransition(source, target)` true; disallowed transition rejected with error naming pair, source unchanged
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 34.1: Write property test for dashboard AND-filtering

- [ ] **34.1 Write property test for dashboard AND-filtering**
  - **Validates: Requirements 5.4, 5.18**
  - Property: For any issues and any combination of filters, filtered result contains every issue matching all filters and no issue failing any filter
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 35.1: Write property test for per-status counts exhaustiveness

- [ ] **35.1 Write property test for per-status counts exhaustiveness**
  - **Validates: Requirements 5.5, 5.6, 5.19**
  - Property: For any filtered issue set, dashboard reports count for each of 5 statuses equaling number of issues with that status (zero if none); five counts sum to set size
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 36.1: Write property test for payment-blocking invariant

- [ ] **36.1 Write property test for payment-blocking invariant**
  - **Validates: Requirements 5.7, 5.8, 5.20**
  - Property: For any issue, blocking flag set iff severity ∈ {high, critical} and status ∉ {closed, rejected}; transitioning to closed/rejected clears flag
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 37.1: Write property test for role permission matrix

- [ ] **37.1 Write property test for role permission matrix**
  - **Validates: Requirements 6.1, 6.2, 6.5, 6.21**
  - Property: For any role and action, `canPerform` permits iff role ∈ editor roles for create/edit/delete/status-transition, or client for view; otherwise denied with error naming action and role, target unchanged
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 38.1: Write property test for field action audit

- [ ] **38.1 Write property test for field action audit**
  - **Validates: Requirements 6.4, 6.22**
  - Property: For any field action (create, edit, delete, status transition, payment release), exactly one SiteAuditRecord written capturing actor, role, action type, source ID, outcome (permitted/denied), timestamp
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 39.1: Write property test for field report date-range aggregation

- [ ] **39.1 Write property test for field report date-range aggregation**
  - **Validates: Requirements 7.1, 7.3, 7.23**
  - Property: For any issues/evidence with timestamps and any report date, report aggregates exactly issues/evidence with timestamps ∈ [00:00:00, 23:59:59] of date in project TZ; weather marked 'not_recorded' if absent
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 40.1: Write property test for field report blocking and handover counts

- [ ] **40.1 Write property test for field report blocking and handover counts**
  - **Validates: Requirements 7.2, 7.5, 7.24**
  - Property: For any report, blocking count equals aggregated issues blocking payment with status ∉ {closed, rejected} as of date; in Close-out stage, outstanding-handover count equals snags with status ∉ {closed, rejected}
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 41.1: Write property test for field report export content

- [ ] **41.1 Write property test for field report export content**
  - **Validates: Requirements 7.4, 7.25**
  - Property: For any report, exported document contains date, project ID, issue summary (ID, status, severity per issue), evidence reference per aggregated evidence
  - Minimum 100 iterations
  - Acceptance: Property passes

### Task 42.1: Write property test for stage-gated capture capabilities

- [ ] **42.1 Write property test for stage-gated capture capabilities**
  - **Validates: Requirements 8.2, 8.3, 8.4, 8.26**
  - Property: For any stage, capture entry points (field capture, checklists, reporting) enabled iff stage ∈ {Build, Close-out}; for other stages, dashboard exposed in read/reporting mode only
  - Minimum 100 iterations
  - Acceptance: Property passes

---

## Phase 43–50: Integration & UI Testing

### Task 43.1: Write integration test for drawing pin persistence and rollback

- [ ] **43.1 Write integration test for drawing pin persistence and rollback**
  - Tests `attachDrawingPin` with Firestore mock
  - Verifies atomic persistence: pin and location both stored or neither
  - Verifies rollback on error: existing location unchanged
  - Acceptance: Integration test passes, atomicity verified (Req 1.2, 1.6)

### Task 44.1: Write integration test for photo evidence fast creation + blob retry

- [ ] **44.1 Write integration test for photo evidence fast creation + blob retry**
  - Tests fast FieldEvidence creation before blob upload completes
  - Tests blob upload failure, retry up to 5 times, failure surface
  - Verifies FieldEvidence persists even if blob fails
  - Acceptance: FieldEvidence created within 2 sec, blob retries exhausted (Req 2.1, 2.5)

### Task 45.1: Write integration test for offline capture queue and sync

- [ ] **45.1 Write integration test for offline capture queue and sync**
  - Tests enqueue when offline, localStorage persistence
  - Tests flush on reconnect, transmission in creation order
  - Tests idempotent sync with client ID tracking
  - Acceptance: Offline captures queue and sync correctly (Req 4.1–4.8)

### Task 46.1: Write integration test for checklist instance to issue conversion

- [ ] **46.1 Write integration test for checklist instance to issue conversion**
  - Tests startInstance from template, recordResponses, failedItemToIssue
  - Verifies issue draft carries prompt, checklist reference, evidence
  - Acceptance: Failed items convert to issues with all context (Req 3.4, 3.9)

### Task 47.1: Write integration test for field access control and audit

- [ ] **47.1 Write integration test for field access control and audit**
  - Tests assertFieldAction for permitted and denied outcomes
  - Verifies SiteAuditRecord written for each attempt with correct outcome
  - Verifies denied actions leave target unchanged
  - Acceptance: Access controlled, audited (Req 6.2, 6.4, 6.21, 6.22)

### Task 48.1: Write E2E test for drawing pin viewer placement

- [ ] **48.1 Write E2E test for drawing pin viewer placement**
  - Tests UI pin placement by click/drag
  - Verifies normalized coordinates captured and persisted
  - Tests marker rendering accuracy
  - Acceptance: Pin placement UI functional (Req 1.1, 1.2, 1.3)

### Task 49.1: Write E2E test for photo annotation markup and export

- [ ] **49.1 Write E2E test for photo annotation markup and export**
  - Tests photo upload, arrow/text markup, save and reload
  - Verifies annotation round-trip preserves all data
  - Tests export of annotated photo
  - Acceptance: Photo annotation UI functional, round-trip verified (Req 2.2, 2.4)

### Task 50.1: Write E2E test for checklist execution and counts

- [ ] **50.1 Write E2E test for checklist execution and counts**
  - Tests template creation, instance start, response recording
  - Tests pass/fail/na count computation and persistence
  - Tests failed-item-to-issue action
  - Acceptance: Checklist UI functional, counts accurate (Req 3.1–3.5)

---

## Phase 51–52: Documentation

### Task 51.1: Update role sheets for all affected roles

- [ ] **51.1 Update role sheets in docs/toolbox-specs/**
  - **site_manager**: Add field capture, issue assignment, dashboard, reporting
  - **contractor**: Add field capture, checklists, photo annotation
  - **subcontractor**: Add field capture, checklists
  - **architect**: Add issue review, reporting
  - **engineer**: Add issue review, reporting
  - **bep**: Add checklist templates, reporting
  - **client**: Add issue view, reporting (read-only)
  - Acceptance: All affected role sheets updated, deployment check passes (Req 8.5, 8.6)

### Task 52.1: Update design.md with implementation notes and verification results

- [ ] **52.1 Document implementation status and verification**
  - Record completion of all 26 PBT tasks and results
  - Document all integration test coverage
  - Document accessibility compliance (Req 9.4, 9.5)
  - Acceptance: Implementation docs complete, traceable to requirements

---

## Summary

| Phase | Task Count | Scope |
|-------|-----------|-------|
| 1. Data Models | 3 | Type extensions |
| 2. Drawing Pin Service | 3 | Validation, filtering, I/O |
| 3. Photo Annotation Service | 3 | Serialization, storage |
| 4. Checklist Service | 6 | Validation, counting, I/O |
| 5. Sync Engine Service | 4 | Queue logic, retry, flush |
| 6. Field Report Service | 3 | Aggregation, export |
| 7. Field Access Service | 3 | Permission matrix, audit |
| 8. Schema Definitions | 4 | Zod schemas |
| 9–14. UI Components | 18 | 6 components + navigation |
| 15–16. Integration | 8 | Navigation, API endpoints |
| 17–42. PBT | 26 | One per correctness property |
| 43–50. Integration/E2E | 8 | Critical paths + accessibility |
| 51–52. Documentation | 2 | Role sheets + design notes |
| **TOTAL** | **98** | **Full feature scope** |

---

## Task Dependencies Quick Reference

**Must complete before UI components (Phase 9–14):**
- Phase 1: Data Models (1.1–1.3)
- Phase 2–8: All service layers and schemas (2.1–8.4)

**Must complete before integration (Phase 15–16):**
- Phase 9–14: All UI components

**PBT tasks (Phase 17–42):**
- Can run in parallel with implementation
- Each PBT tests one service module or service pair
- All 26 must pass before feature merge

**Integration/E2E tests (Phase 43–50):**
- Run after integration tasks completed
- Test critical user paths end-to-end
- Must pass before release

**Documentation (Phase 51–52):**
- Run final phase after all implementation/testing complete
- Deployment check (task 51.1) gates production

