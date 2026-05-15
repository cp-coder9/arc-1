# Project Workflow Write API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for project workflow write routes. These examples document local/dev contract shape only. They do not approve work, certify compliance, execute contracts, submit municipal applications, send external email, or create payment obligations.

## Shared behaviour

- Routes run behind the project coordination gate.
- Non-admin BEP access is expected to be backed by active verification where the route context requires it.
- IDs and timestamps below are deterministic examples, not generated production values.
- Workflow writes are coordination records. Human professional judgement remains required for approvals, transmittals, AI issue review, and municipal/compliance implications.

## `POST /api/projects/:projectId/documents`

Creates a project document register record and immutable first version `v1`.

```http
POST /api/projects/project-1/documents
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "title": "Site plan",
  "documentType": "drawing",
  "discipline": "Architecture",
  "status": "active",
  "revision": "P01",
  "fileUrl": "https://example.test/files/site-plan-p01.pdf",
  "fileName": "site-plan-p01.pdf",
  "checksum": "sha256:example",
  "notes": "Issued for internal coordination.",
  "tags": ["site-plan", "municipal-pack"]
}
```

```json
{
  "document": {
    "id": "document-1",
    "projectId": "project-1",
    "title": "Site plan",
    "documentType": "drawing",
    "discipline": "Architecture",
    "status": "active",
    "currentVersionId": "v1",
    "currentRevision": "P01",
    "latestFileUrl": "https://example.test/files/site-plan-p01.pdf",
    "tags": ["site-plan", "municipal-pack"],
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z"
  },
  "version": {
    "id": "v1",
    "documentId": "document-1",
    "projectId": "project-1",
    "versionNumber": 1,
    "revision": "P01",
    "fileUrl": "https://example.test/files/site-plan-p01.pdf",
    "fileName": "site-plan-p01.pdf",
    "checksum": "sha256:example",
    "notes": "Issued for internal coordination.",
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:00:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/document-versions`

Appends a new immutable version and updates only the document current-version pointer.

```http
POST /api/projects/project-1/document-versions
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "documentId": "document-1",
  "revision": "P02",
  "fileUrl": "https://example.test/files/site-plan-p02.pdf",
  "fileName": "site-plan-p02.pdf",
  "checksum": "sha256:example-p02",
  "notes": "Updated erf boundary note."
}
```

```json
{
  "version": {
    "id": "v2",
    "documentId": "document-1",
    "projectId": "project-1",
    "versionNumber": 2,
    "revision": "P02",
    "fileUrl": "https://example.test/files/site-plan-p02.pdf",
    "fileName": "site-plan-p02.pdf",
    "checksum": "sha256:example-p02",
    "notes": "Updated erf boundary note.",
    "supersedesVersionId": "v1",
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:15:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/tasks`

Creates a coordination task linked to project workflow objects.

```http
POST /api/projects/project-1/tasks
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "title": "Confirm zoning certificate",
  "description": "Check whether the uploaded certificate covers the current erf.",
  "status": "open",
  "assigneeId": "planner-1",
  "dueDate": "2026-05-22",
  "linkedItems": [
    { "type": "document", "id": "document-1" },
    { "type": "municipal_submission", "id": "municipal-1" }
  ]
}
```

```json
{
  "task": {
    "id": "task-1",
    "projectId": "project-1",
    "title": "Confirm zoning certificate",
    "description": "Check whether the uploaded certificate covers the current erf.",
    "status": "open",
    "assigneeId": "planner-1",
    "dueDate": "2026-05-22",
    "linkedItems": [
      { "type": "document", "id": "document-1" },
      { "type": "municipal_submission", "id": "municipal-1" }
    ],
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:20:00.000Z",
    "updatedAt": "2026-05-15T12:20:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/approvals`

Creates an approval request record. This does not constitute a legal or statutory approval by itself.

```http
POST /api/projects/project-1/approvals
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "title": "Client review of concept pack",
  "description": "Please review concept drawings before municipal pack preparation.",
  "status": "requested",
  "approverId": "client-1",
  "dueDate": "2026-05-24",
  "linkedItems": [
    { "type": "document", "id": "document-1" }
  ]
}
```

```json
{
  "approval": {
    "id": "approval-1",
    "projectId": "project-1",
    "title": "Client review of concept pack",
    "description": "Please review concept drawings before municipal pack preparation.",
    "status": "requested",
    "requestedBy": "architect-1",
    "approverId": "client-1",
    "dueDate": "2026-05-24",
    "linkedItems": [
      { "type": "document", "id": "document-1" }
    ],
    "history": [
      {
        "status": "requested",
        "by": "architect-1",
        "at": "2026-05-15T12:25:00.000Z",
        "note": "Approval requested"
      }
    ],
    "createdAt": "2026-05-15T12:25:00.000Z",
    "updatedAt": "2026-05-15T12:25:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/message-threads`

Creates a contextual project message thread and marks other participants as unread.

```http
POST /api/projects/project-1/message-threads
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "subject": "Municipal submission query",
  "contextType": "municipal_submission",
  "contextId": "municipal-1",
  "participantIds": ["client-1", "planner-1"]
}
```

```json
{
  "thread": {
    "id": "thread-1",
    "projectId": "project-1",
    "subject": "Municipal submission query",
    "contextType": "municipal_submission",
    "contextId": "municipal-1",
    "participantIds": ["architect-1", "client-1", "planner-1"],
    "unreadFor": ["client-1", "planner-1"],
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:30:00.000Z",
    "updatedAt": "2026-05-15T12:30:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/messages`

Adds a message and updates the parent thread last-message metadata.

```http
POST /api/projects/project-1/messages
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "threadId": "thread-1",
  "body": "Please review the planner query before we respond to council.",
  "attachments": [
    { "type": "document", "id": "document-1" }
  ]
}
```

```json
{
  "message": {
    "id": "message-1",
    "projectId": "project-1",
    "threadId": "thread-1",
    "body": "Please review the planner query before we respond to council.",
    "contextType": "municipal_submission",
    "contextId": "municipal-1",
    "attachments": [
      { "type": "document", "id": "document-1" }
    ],
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:35:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/transmittals`

Creates a transmittal record for document versions. This records issue metadata only and does not guarantee external delivery.

```http
POST /api/projects/project-1/transmittals
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "title": "Concept pack issue",
  "status": "issued",
  "recipientIds": ["client-1", "planner-1"],
  "documentVersionIds": ["v2"],
  "purpose": "Client and planner coordination before municipal pack finalisation."
}
```

```json
{
  "transmittal": {
    "id": "transmittal-1",
    "projectId": "project-1",
    "title": "Concept pack issue",
    "status": "issued",
    "recipientIds": ["client-1", "planner-1"],
    "documentVersionIds": ["v2"],
    "purpose": "Client and planner coordination before municipal pack finalisation.",
    "issuedBy": "architect-1",
    "issuedAt": "2026-05-15T12:40:00.000Z",
    "createdAt": "2026-05-15T12:40:00.000Z",
    "updatedAt": "2026-05-15T12:40:00.000Z"
  }
}
```

## Common validation errors

```json
[
  { "route": "POST /api/projects/:projectId/documents", "error": "title is required" },
  { "route": "POST /api/projects/:projectId/document-versions", "error": "documentId is required" },
  { "route": "POST /api/projects/:projectId/document-versions", "error": "Document not found" },
  { "route": "POST /api/projects/:projectId/tasks", "error": "title is required" },
  { "route": "POST /api/projects/:projectId/approvals", "error": "title is required" },
  { "route": "POST /api/projects/:projectId/message-threads", "error": "subject is required" },
  { "route": "POST /api/projects/:projectId/messages", "error": "threadId and body are required" },
  { "route": "POST /api/projects/:projectId/messages", "error": "Message thread not found" },
  { "route": "POST /api/projects/:projectId/transmittals", "error": "title is required" }
]
```

## Audit events

```json
[
  { "category": "document", "action": "document.created" },
  { "category": "document", "action": "document.version_created" },
  { "category": "project", "action": "task.created" },
  { "category": "approval", "action": "approval.requested" },
  { "category": "message", "action": "message.thread_created" },
  { "category": "message", "action": "message.created" },
  { "category": "document", "action": "transmittal.issued" }
]
```

## Human confirmations still required

- Which approval states create contractual or statutory obligations, if any.
- Whether transmittals trigger external notifications, registered delivery, or signature workflows.
- Retention rules for document versions, message attachments, and approval history.
- Whether client approval text requires legal copy before production launch.
- Which workflow events should be visible to clients, contractors, freelancers, and inspectors by role.
