# Phase 3 Report: Durable Project Workflow Write APIs

Date: 2026-05-15
Branch: `phase-2-verification-workflows`
Scope source: `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` Phase 3

## Implemented

### Document register and immutable versions
- Added `POST /api/projects/:projectId/documents`.
- Creates `projects/{projectId}/documents/{documentId}` plus first immutable `versions/v1` record.
- Added `POST /api/projects/:projectId/document-versions`.
- Appends a new immutable version under `projects/{projectId}/documents/{documentId}/versions/{versionId}` and updates only the parent document's current-version pointer.
- Previous version records remain untouched and attributable.

### Task board
- Added `POST /api/projects/:projectId/tasks`.
- Persists task title, description, status, assignee, due date, and linked project workflow items.

### Approval requests
- Added `POST /api/projects/:projectId/approvals`.
- Persists requested approval records with approver, linked items, status history, and audit trail.

### Contextual messenger
- Added `POST /api/projects/:projectId/message-threads`.
- Added `POST /api/projects/:projectId/messages`.
- Threads support contextual links to task, drawing, document, approval, RFI, invoice, municipal submission, claim, snag, contract, payment hold, compliance flag, transmittal, or general context.
- Messages update thread last-message and unread recipient state.

### Transmittals
- Added `POST /api/projects/:projectId/transmittals`.
- Persists recipients, issued document version IDs, purpose, status, and issue metadata.

## Authorization and audit behavior

- All write APIs reuse `getProjectCoordinatorContext`, so access is limited to admins, lead BEPs, active project team members, and project clients according to the existing helper.
- Non-admin BEP access remains gated by active BEP/SACAP verification through the existing context helper.
- Audit actions emitted:
  - `document.created`
  - `document.version_created`
  - `task.created`
  - `approval.requested`
  - `message.thread_created`
  - `message.created`
  - `transmittal.issued`

## Collections created/changed

- `projects/{projectId}/documents/{documentId}`
- `projects/{projectId}/documents/{documentId}/versions/{versionId}`
- `projects/{projectId}/tasks/{taskId}`
- `projects/{projectId}/approvals/{approvalId}`
- `projects/{projectId}/message_threads/{threadId}`
- `projects/{projectId}/messages/{messageId}`
- `projects/{projectId}/transmittals/{transmittalId}`
- `audit_logs/{auditLogId}`

## Tests added

- Added API coverage in `src/lib/__tests__/api-router.security.test.ts` that verifies:
  - intruders are denied workflow writes
  - document creation persists parent register record plus `v1`
  - new document versions append immutable version records and update parent pointer
  - original `v1` version remains intact
  - task, approval, thread, message, and transmittal records persist
  - message writes update thread unread/last-message metadata
  - all expected audit actions are emitted

## Validation

- `npx vitest run src/lib/__tests__/api-router.security.test.ts`
  - 46 tests passed.
- `npm run lint`
  - TypeScript validation passed.

## Known limitations and follow-ups

- Firestore rules, indexes, and schema docs are intentionally left to the separate Firestore rules/docs pass.
- Approval state transitions beyond initial request are not included in this slice.
- Document deletion/retraction is not included; current behavior favors append-only version history.
- Dedicated read/list endpoints for each workflow collection can be added after authorization and index rules are finalized.
