# Requirements Document

## Introduction

This feature extends Architex's existing Pack 9 (Site Execution & Field Control) snagging and field-control tools with Autodesk Build / Forma-style field capabilities, tailored to the Architex platform and its role model. The goal is to raise the existing `SnagManager`, `NCRManager`, `SiteInstructionManager`, and their backing services to a mobile-first field-issue product: pin-on-drawing location referencing, inspection checklist and form templates, photo markup and annotation, offline field capture with sync, a role-aware issue lifecycle dashboard, and field reporting.

This is an EXTEND/ENHANCE effort, not a greenfield build. It reuses and augments existing assets:

- **Components:** `src/components/SnagManager.tsx`, `src/components/NCRManager.tsx`, `src/components/SiteInstructionManager.tsx`.
- **Services:** `src/services/snagService.ts` (snag state machine: `open → allocated → ready_for_reinspection → closed / rejected`), `fieldEvidenceService`, `ncrService`, `siteInstructionService`, `paymentBlockerService`, `dailyLogService`, `programmeImpactService`, `siteExecutionService`, `delayWarningService`.
- **Types in `src/types.ts`:** `Severity`, `SnagItem`, `SnagStatus`, `NonConformanceReport`, `FieldEvidence`, `EvidenceType`, `InspectionRecord`, `PaymentBlocker`, `SiteLog`, `SiteAuditRecord`, `SiteInboxEvent`.
- **Navigation:** `src/navigation/architexNavigationConfig.ts` — Projects → `snags` section, Toolboxes → `construction_admin` and `closeout` sections.

The feature aligns with the Architex 8-stage lifecycle (especially Stage 6 Build and Stage 8 Close-out) and is scoped to site-relevant roles: `site_manager`, `contractor`, `subcontractor`, `architect`, `engineer`, `bep`, `client`.

### Scope guardrails

- Reuses the existing snag state machine and payment-blocker governance; the site_manager cannot release payment, and high/critical issues continue to block payment per existing rules.
- File storage uses Vercel Blob; persistence uses Firebase Firestore (non-default DB) following existing service patterns.
- Offline capture is decision-support; no autonomous fund movement and no statutory certification.

## Glossary

- **Field_Tools**: The set of Architex site execution features extended by this spec (the overall system under design).
- **Field_Issue**: A site-captured item requiring tracking. Concrete subtypes reuse existing types: `SnagItem`, `NonConformanceReport`, and `InspectionRecord` findings.
- **Snag_Service**: The existing `snagService` module governing snag lifecycle and payment-blocking, extended by this feature.
- **Field_Evidence_Service**: The existing `fieldEvidenceService` storing `FieldEvidence` (photo/video/document) with location and GPS.
- **Drawing_Pin**: A coordinate reference (drawing reference + normalized x/y) locating a Field_Issue on a project drawing.
- **Checklist_Template**: A reusable, admin- or role-authored inspection form definition consisting of ordered checklist items.
- **Checklist_Instance**: A completed or in-progress execution of a Checklist_Template against a project location.
- **Photo_Annotation**: Markup (shapes, arrows, text, freehand) overlaid on a captured photo, stored as structured data plus a flattened rendered image.
- **Sync_Engine**: The client component that queues field captures made offline and reconciles them with Firestore when connectivity returns.
- **Field_Report**: A dated site report (daily/progress) aggregating field activity, issues, evidence, and weather, extending the existing `SiteLog`.
- **Issue_Dashboard**: A role-aware filtered view of Field_Issues with status, severity, assignment, and reporting.
- **Site_Audit_Service**: The existing audit trail writing `SiteAuditRecord` entries for field actions.
- **Lifecycle_Stage**: One of the Architex 8 stages; this feature targets Stage 6 (Build) and Stage 8 (Close-out).

## Requirements

### Requirement 1: Pin-on-drawing location referencing

**User Story:** As a site_manager, I want to place a Field_Issue at a precise point on a project drawing, so that the responsible party can locate the defect on site without ambiguous text descriptions.

#### Acceptance Criteria

1. WHEN a user creates or edits a Field_Issue, THE Field_Tools SHALL allow the user to attach a Drawing_Pin that references a non-empty project drawing identifier and contains a normalized coordinate pair providing both an x value and a y value, each between 0 and 1 inclusive.
2. WHEN a Drawing_Pin is attached to a Field_Issue, THE Field_Tools SHALL persist the drawing identifier and the coordinate pair together on the issue record as a single atomic update, such that either both values are stored or neither is stored.
3. WHEN a drawing is displayed with associated Field_Issues, THE Issue_Dashboard SHALL render exactly one pin marker per Field_Issue whose stored drawing identifier matches the displayed drawing identifier, positioned at that issue's stored coordinate pair, and SHALL NOT render markers for issues whose stored drawing identifier does not match the displayed drawing.
4. IF a Drawing_Pin x or y value is outside the range 0 to 1 inclusive, or if the x value or the y value is absent, THEN THE Field_Tools SHALL reject the Drawing_Pin, leave the issue's existing location data unchanged, and return a validation error identifying each out-of-range or missing coordinate.
5. IF a Drawing_Pin references a drawing identifier that does not match an existing project drawing, THEN THE Field_Tools SHALL reject the Drawing_Pin, leave the issue's existing location data unchanged, and return a validation error indicating that the referenced drawing does not exist.
6. IF persistence of a Drawing_Pin to the issue record fails, THEN THE Field_Tools SHALL return an error indicating the save failed and SHALL retain the issue's previous location data unchanged.
7. WHERE a Field_Issue has no Drawing_Pin, THE Field_Tools SHALL persist and display the issue using its text location field, which SHALL accept between 1 and 500 characters inclusive.

### Requirement 2: Photo capture and annotation

**User Story:** As a contractor, I want to capture photos and mark them up with arrows and notes, so that the defect and required action are unmistakable.

#### Acceptance Criteria

1. WHEN a user attaches a photo in a supported raster image format (JPEG or PNG) not exceeding 25 MB to a Field_Issue, THE Field_Evidence_Service SHALL create a `FieldEvidence` record of type `photo` linked to the issue identifier within 2 seconds even if the Vercel Blob upload has not yet completed, and SHALL store the image to Vercel Blob.
2. WHEN a user adds markup to a photo, THE Field_Tools SHALL store the Photo_Annotation as structured shape data supporting at least arrow and text-note shape types, and SHALL store a flattened rendered image preserving the markup.
3. WHEN an annotated photo is re-opened for editing, THE Field_Tools SHALL restore every previously stored annotation shape with its type, position coordinates, and style attributes, with no loss of any stored shape.
4. WHEN Photo_Annotation data is serialized for storage and then deserialized for display, THE Field_Tools SHALL produce annotation shapes equivalent to the originals (round-trip property).
5. IF an image upload to Vercel Blob fails, THEN THE Field_Evidence_Service SHALL return an error indicating the upload failure, SHALL retain the capture in the Sync_Engine queue, and SHALL retry the upload up to 5 times before marking the capture as failed while preserving the `FieldEvidence` record.
6. IF a user attempts to attach a file that is not a supported image format or exceeds 25 MB, THEN THE Field_Evidence_Service SHALL reject the attachment, SHALL NOT create a `FieldEvidence` record, and SHALL return an error indicating the unsupported format or size limit.

### Requirement 3: Inspection checklist and form templates

**User Story:** As a bep, I want reusable inspection checklist templates, so that site inspections are consistent and produce structured records.

#### Acceptance Criteria

1. WHEN a user with role site_manager, contractor, subcontractor, architect, engineer, or bep creates a Checklist_Template, THE Field_Tools SHALL persist the template with an ordered list of 1 to 200 checklist items, each item having a prompt of 1 to 500 characters and a response type of pass-fail-na, numeric, or text.
2. WHEN a user starts an inspection from a Checklist_Template, THE Field_Tools SHALL create a Checklist_Instance scoped to a project and location, copying the template item definitions in their defined order.
3. WHEN a user records a response for a checklist item, THE Field_Tools SHALL validate the response against the item's response type and, on success, persist the response against the corresponding Checklist_Instance item, where a text response SHALL not exceed 1000 characters.
4. WHEN a pass-fail-na checklist item has a recorded response of fail, THE Field_Tools SHALL allow the user to convert that failed item into a Field_Issue carrying the item prompt, the checklist reference, and any attached evidence.
5. WHEN a Checklist_Instance is completed, THE Field_Tools SHALL compute and persist a pass count, fail count, and not-applicable count computed across the instance's pass-fail-na items only.
6. WHEN a Checklist_Template is serialized for storage and then deserialized, THE Field_Tools SHALL produce template items equivalent to the originals in count, order, and definition (round-trip property).
7. IF a Checklist_Template is submitted with zero items, an item prompt that is empty or exceeds 500 characters, or an item response type that is not pass-fail-na, numeric, or text, THEN THE Field_Tools SHALL reject the template and return a validation error identifying the invalid field.
8. IF a recorded checklist item response does not match the item's response type, THEN THE Field_Tools SHALL reject the response, leave the existing response unchanged, and return a validation error naming the expected response type.

### Requirement 4: Offline field capture with sync

**User Story:** As a subcontractor working in an area with no connectivity, I want to capture issues, photos, and checklist responses offline, so that my field work is not lost and syncs when I am back online.

#### Acceptance Criteria

1. WHILE the device has no network connectivity, THE Field_Tools SHALL accept creation of Field_Issues, Photo_Annotations, and Checklist_Instance responses and SHALL store them in the Sync_Engine queue locally, supporting at least 500 queued captures.
2. WHEN network connectivity is restored, THE Sync_Engine SHALL begin transmitting queued captures to Firestore within 10 seconds, in the order each capture was created.
3. WHEN a queued capture is successfully persisted to Firestore, THE Sync_Engine SHALL remove that capture from the local queue.
4. IF a queued capture fails to persist, THEN THE Sync_Engine SHALL retain the capture in the queue and SHALL retry it up to 5 times.
5. WHEN a capture has failed to persist after its retry attempts are exhausted, THE Sync_Engine SHALL surface the count of failed captures to the user.
6. IF the Sync_Engine queue has reached its capacity, THEN THE Field_Tools SHALL reject a new offline capture and return an error indicating the queue is full.
7. WHEN a Sync_Engine queue entry is serialized to local storage and then deserialized on app restart, THE Sync_Engine SHALL reconstruct a capture equivalent to the original (round-trip property).
8. WHEN the same offline capture is synced more than once, THE Sync_Engine SHALL produce a single persisted record using the capture's client-generated identifier (idempotent sync).

### Requirement 5: Issue assignment and lifecycle dashboard

**User Story:** As a site_manager, I want a filtered dashboard of all field issues with their status and assignee, so that I can manage open items to closure.

#### Acceptance Criteria

1. WHEN a Field_Issue is created or updated, THE Field_Tools SHALL record its current lifecycle status as exactly one of the existing snag state machine values open, allocated, ready_for_reinspection, closed, or rejected, defaulting to open on creation, and SHALL record a responsible party identifier, storing the value unassigned when no responsible party is provided.
2. IF a status value other than open, allocated, ready_for_reinspection, closed, or rejected is supplied for a Field_Issue, THEN THE Snag_Service SHALL reject the update, preserve the issue's existing status unchanged, and return a validation error naming the invalid status value.
3. WHEN a status transition is requested, THE Snag_Service SHALL permit the transition only if it is allowed by the existing snag state machine, and IF the transition is not allowed THEN THE Snag_Service SHALL reject it, preserve the source status unchanged, and return an error naming the source status and the target status.
4. WHEN a user applies one or more filters on the Issue_Dashboard by status, severity, responsible party, or Lifecycle_Stage, THE Issue_Dashboard SHALL display only the Field_Issues matching all applied filters combined with logical AND.
5. IF no Field_Issue matches the applied filters, THEN THE Issue_Dashboard SHALL display an empty result set with each lifecycle status count equal to zero.
6. WHEN the Issue_Dashboard renders a filtered set, THE Issue_Dashboard SHALL display a count for each of the five lifecycle statuses open, allocated, ready_for_reinspection, closed, and rejected over that set, showing zero for any status with no matching issues.
7. WHEN a Field_Issue has severity high or critical and its status is neither closed nor rejected, THE Field_Tools SHALL mark the issue as blocking payment, consistent with the existing payment-blocker rule.
8. WHEN a Field_Issue transitions to status closed or status rejected, THE Field_Tools SHALL clear the issue's payment-blocking flag.

### Requirement 6: Role-aware access for site tools

**User Story:** As the platform, I want field tool actions gated by user role, so that site governance boundaries are preserved.

#### Acceptance Criteria

1. WHERE the current user role is site_manager, contractor, subcontractor, architect, engineer, or bep, THE Field_Tools SHALL permit creating and editing Field_Issues, Checklist_Instances, and field evidence.
2. WHERE the current user role is client, THE Field_Tools SHALL permit viewing Field_Issues, Field_Reports, and the Issue_Dashboard, and SHALL deny any create, edit, delete, or status-transition action by returning an authorization error and leaving the target record unchanged.
3. WHEN a user with role site_manager attempts to release a payment that is blocked by an open Field_Issue, THE Field_Tools SHALL deny the release, return a message indicating that payment release requires contractor sign-off, and leave the payment-blocking flag and the payment state unchanged.
4. WHEN a field action — defined as creating, editing, or deleting a Field_Issue, Checklist_Instance, or field evidence, performing a status transition, or attempting a payment release — is attempted, THE Site_Audit_Service SHALL write a `SiteAuditRecord` capturing the actor identifier, actor role, action type, source object identifier, the outcome of permitted or denied, and a timestamp.
5. IF a user whose role is not site_manager, contractor, subcontractor, architect, engineer, or bep attempts to create, edit, or delete a Field_Issue, Checklist_Instance, or field evidence, THEN THE Field_Tools SHALL deny the action, return an authorization error identifying the attempted action and the user role, and leave the target record unchanged.

### Requirement 7: Field reporting

**User Story:** As a site_manager, I want to generate a daily field report, so that project stakeholders have a dated record of site activity and outstanding issues.

#### Acceptance Criteria

1. WHEN a user generates a Field_Report for a project and a date, THE Field_Report SHALL aggregate the Field_Issues created between 00:00:00 and 23:59:59 of that date in the project time zone, the evidence captured within the same range, and the recorded weather condition for that date.
2. WHEN a Field_Report is generated, THE Field_Tools SHALL include the count of Field_Issues that are blocking payment and whose status is neither closed nor rejected as of the report date.
3. IF no weather condition is recorded for the report date, THEN THE Field_Tools SHALL generate the Field_Report with the weather condition marked as not recorded rather than failing generation.
4. WHEN a user exports a Field_Report, THE Field_Tools SHALL produce a document containing the report date, project identifier, an issue summary listing each aggregated issue's identifier, lifecycle status, and severity, and an evidence reference for each aggregated FieldEvidence item.
5. WHERE the Lifecycle_Stage is Close-out, THE Field_Report SHALL include the count of outstanding snags whose status is neither closed nor rejected that prevent handover as of the report date.

### Requirement 8: Lifecycle and navigation integration

**User Story:** As a user, I want the enhanced field tools surfaced in the existing navigation and lifecycle stages, so that I reach them where I already work.

#### Acceptance Criteria

1. WHEN a user opens the Projects module snags section, THE Field_Tools SHALL render the Issue_Dashboard with Drawing_Pin display, checklist access, and Field_Report access.
2. WHERE the current Lifecycle_Stage is Build, THE Field_Tools SHALL surface field capture, checklists, and field reporting through the Toolboxes construction_admin section.
3. WHERE the current Lifecycle_Stage is Close-out, THE Field_Tools SHALL surface snag rectification and handover-readiness reporting through the Toolboxes closeout section.
4. WHERE the current Lifecycle_Stage is neither Build nor Close-out, THE Field_Tools SHALL surface the Issue_Dashboard in read and reporting mode without the stage-specific construction_admin or closeout capture entry points.
5. WHEN field tools are added or changed, THE role sheets in `docs/toolbox-specs/` for each role granted access under Requirement 6 SHALL be updated to reference the changed capabilities.
6. IF a field tool change is submitted for deployment while the corresponding role sheets in `docs/toolbox-specs/` have not been updated, THEN THE deployment SHALL be blocked and an error SHALL identify the role sheets that have not been updated.

### Requirement 9: Quality and verification

**User Story:** As the team, I want the enhanced field tools tested and type-safe, so that the extension does not regress existing Pack 9 behavior.

#### Acceptance Criteria

1. WHEN a new or modified Field_Tools service module is added, THE same change SHALL include unit tests covering Drawing_Pin coordinate validation (at least one in-range coordinate accepted and one out-of-range coordinate rejected), each snag state machine transition including at least one disallowed transition that is rejected, checklist pass/fail/not-applicable count computation, and Sync_Engine queue behavior covering creation-order transmission, removal on successful persistence, retention on failure, and single-record idempotent sync.
2. WHEN serialization logic is added for Photo_Annotations, Checklist_Templates, and Sync_Engine queue entries, THE same change SHALL include round-trip tests asserting that the deserialized output equals the original in item count, item order, and field values after a serialize-then-deserialize cycle.
3. WHEN the feature is submitted for merge, THE verification suite SHALL be run, and the commands `npm run lint`, `npm test`, and `npm run build` SHALL each complete with a zero exit code.
4. WHEN new UI forms or dashboard controls are added, THE Field_Tools SHALL make every interactive control reachable and operable using only the keyboard, including focus movement to and from the control and activation of its primary action.
5. WHEN new UI forms or dashboard controls are added, THE Field_Tools SHALL expose a programmatic accessible name for each interactive control so that screen readers announce the control's purpose.
