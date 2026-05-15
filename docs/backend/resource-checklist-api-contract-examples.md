# Resource Centre and Drawing Checklist API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for resource centre and drawing checklist routes. These examples are local/dev contract documentation only. They do not submit municipal applications, certify professional compliance, provision paid resources, send provider requests, or replace human project review.

## `POST /api/resources/centre`

Creates a reusable resource centre item. Access is limited to admins, verified BEPs, and verified freelancers.

```http
POST /api/resources/centre
Authorization: Bearer <verified-bep-id-token>
Content-Type: application/json

{
  "resourceType": "checklist",
  "title": "Cape Town municipal drawing checklist",
  "description": "Checklist for basic municipal submission readiness.",
  "municipality": "Cape Town",
  "submissionType": "Building plan submission",
  "discipline": "Architecture",
  "url": "https://example.test/checklists/cape-town-drawings",
  "contact": {
    "name": "Planning Desk",
    "email": "planning@example.test",
    "phone": "+27000000000"
  },
  "tags": ["municipal", "drawings", "cape-town"],
  "checklistItems": [
    { "id": "site-plan", "label": "Site plan included", "status": "not_started" },
    { "id": "sg-diagram", "label": "SG diagram attached", "status": "not_started" }
  ],
  "visibility": "published"
}
```

```json
{
  "resource": {
    "id": "resource-1",
    "resourceType": "checklist",
    "title": "Cape Town municipal drawing checklist",
    "description": "Checklist for basic municipal submission readiness.",
    "municipality": "Cape Town",
    "submissionType": "Building plan submission",
    "discipline": "Architecture",
    "url": "https://example.test/checklists/cape-town-drawings",
    "contact": {
      "name": "Planning Desk",
      "email": "planning@example.test",
      "phone": "+27000000000"
    },
    "tags": ["municipal", "drawings", "cape-town"],
    "checklistItems": [
      { "id": "site-plan", "label": "Site plan included", "status": "not_started" },
      { "id": "sg-diagram", "label": "SG diagram attached", "status": "not_started" }
    ],
    "visibility": "published",
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z"
  }
}
```

Unverified BEP/freelancer block:

```json
{
  "error": "Verified participant is required for resource centre access",
  "verificationRequired": {
    "subjectType": "bep",
    "statutoryBody": "SACAP"
  }
}
```

## `GET /api/resources/centre`

Lists published resources plus private resources owned by the caller or visible to admins. Filters are applied after the resource centre access gate.

```http
GET /api/resources/centre?resourceType=checklist&municipality=cape&discipline=architecture
Authorization: Bearer <verified-bep-id-token>
```

```json
{
  "resources": [
    {
      "id": "resource-1",
      "resourceType": "checklist",
      "title": "Cape Town municipal drawing checklist",
      "municipality": "Cape Town",
      "submissionType": "Building plan submission",
      "discipline": "Architecture",
      "visibility": "published",
      "createdBy": "architect-1",
      "checklistItems": [
        { "id": "site-plan", "label": "Site plan included", "status": "not_started" },
        { "id": "sg-diagram", "label": "SG diagram attached", "status": "not_started" }
      ]
    }
  ]
}
```

## `POST /api/projects/:projectId/checklists/drawing`

Creates a project-scoped municipal drawing checklist. This is a coordination tracker, not professional or municipal certification.

```http
POST /api/projects/project-1/checklists/drawing
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "municipality": "Cape Town",
  "submissionType": "Building plan submission",
  "checklistType": "municipal_drawing",
  "stage": "municipal_submission",
  "disciplines": ["Architecture", "Structural"],
  "responsibleParty": "architect-1",
  "linkedDrawingIds": ["drawing-1"],
  "linkedMunicipalSubmissionId": "municipal-1",
  "linkedTaskIds": ["task-1"],
  "requirements": [
    { "id": "site-plan", "label": "Site plan included", "status": "not_started" }
  ],
  "componentChecks": [
    { "id": "fire-notes", "label": "Fire notes reviewed", "status": "not_started" }
  ]
}
```

```json
{
  "checklist": {
    "id": "checklist-1",
    "projectId": "project-1",
    "checklistType": "municipal_drawing",
    "municipality": "Cape Town",
    "submissionType": "Building plan submission",
    "stage": "municipal_submission",
    "disciplines": ["Architecture", "Structural"],
    "responsibleParty": "architect-1",
    "linkedDrawingIds": ["drawing-1"],
    "linkedMunicipalSubmissionId": "municipal-1",
    "linkedTaskBoardIds": ["task-1"],
    "requirements": [
      { "id": "site-plan", "label": "Site plan included", "status": "not_started" }
    ],
    "componentChecks": [
      { "id": "fire-notes", "label": "Fire notes reviewed", "status": "not_started" }
    ],
    "progress": { "total": 2, "complete": 0 },
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z"
  }
}
```

Missing required fields:

```json
{
  "error": "municipality and submissionType are required"
}
```

## `POST /api/projects/:projectId/checklists/drawing/:checklistId/items/:itemId/status`

Updates one checklist item status and appends status history. Allowed statuses are `not_started`, `in_progress`, `blocked`, `complete`, and `not_applicable`.

```http
POST /api/projects/project-1/checklists/drawing/checklist-1/items/site-plan/status
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "status": "complete",
  "notes": "Reviewed against current submission set.",
  "linkedDrawingIds": ["drawing-1"],
  "linkedTaskIds": ["task-1"]
}
```

```json
{
  "id": "checklist-1",
  "requirements": [
    {
      "id": "site-plan",
      "label": "Site plan included",
      "status": "complete",
      "notes": "Reviewed against current submission set.",
      "linkedDrawingIds": ["drawing-1"],
      "linkedTaskIds": ["task-1"],
      "updatedBy": "architect-1",
      "updatedAt": "2026-05-15T12:15:00.000Z"
    }
  ],
  "componentChecks": [
    { "id": "fire-notes", "label": "Fire notes reviewed", "status": "not_started" }
  ],
  "progress": { "total": 2, "complete": 1 },
  "updatedAt": "2026-05-15T12:15:00.000Z",
  "statusHistory": [
    {
      "itemId": "site-plan",
      "status": "complete",
      "at": "2026-05-15T12:15:00.000Z",
      "by": "architect-1",
      "note": "Reviewed against current submission set."
    }
  ]
}
```

Invalid status response:

```json
{
  "error": "valid status is required"
}
```

## `GET /api/projects/:projectId/checklists/drawing`

Returns drawing checklist progress for project participants only.

```http
GET /api/projects/project-1/checklists/drawing
Authorization: Bearer <project-participant-id-token>
```

```json
{
  "projectId": "project-1",
  "checklists": [
    {
      "id": "checklist-1",
      "projectId": "project-1",
      "municipality": "Cape Town",
      "submissionType": "Building plan submission",
      "progress": { "total": 2, "complete": 1 },
      "requirements": [
        { "id": "site-plan", "label": "Site plan included", "status": "complete" }
      ],
      "componentChecks": [
        { "id": "fire-notes", "label": "Fire notes reviewed", "status": "not_started" }
      ]
    }
  ]
}
```

Non-participant block:

```json
{
  "error": "Only project participants can view drawing checklist progress"
}
```

## Human confirmations still required

1. Whether each resource/checklist template is product-approved for the target municipality and discipline.
2. Whether any checklist status can contribute to official readiness certification, or remains coordination-only.
3. Municipal evidence standards and retention policy for checklist-linked drawings/submission records.
4. Professional sign-off ownership for checklist completion and final submission readiness.
5. Whether private resource visibility requires additional organization/team access rules beyond creator/admin visibility.
