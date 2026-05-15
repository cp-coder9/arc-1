# Municipal Tracker API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for project-scoped municipal tracker routes. These examples document local/dev contract shape only. They do not submit plans to a municipality, confirm statutory acceptance, operate a municipal portal, replace registered-professional sign-off, or certify compliance.

## Operational boundaries

- Project-scoped municipal tracker routes are coordination records under `projects/{projectId}/municipal_submissions`.
- Status values are project workflow labels, not official municipal determinations unless a human records and verifies supporting evidence.
- AI/OCR extracted statuses remain advisory until explicitly confirmed by a human with authority to review the evidence.
- Client/contractor views intentionally omit control-only fields such as evidence URLs and linked compliance form IDs.
- Live municipal portal automation remains behind separate sensitive workflow controls and human/provider confirmation.

## `POST /api/projects/:projectId/municipal/submissions`

Creates a project municipal submission tracker record. Access is limited to the project lead/coordinator context.

```http
POST /api/projects/project-1/municipal/submissions
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "municipality": "City of Cape Town",
  "submissionReference": "BP-2026-000123",
  "status": "submitted",
  "aiExtractedStatus": "Application received",
  "clientUpdate": "The building plan pack has been submitted and is awaiting allocation.",
  "contractorImpact": "No site start date change until plan approval is confirmed.",
  "expectedNextStep": "Confirm allocation to plans examiner and upload stamped receipt.",
  "actionItems": [
    "Upload stamped submission receipt",
    "Confirm zoning departure is not required"
  ],
  "evidenceUrls": [
    "https://example.test/evidence/submission-receipt.pdf"
  ],
  "linkedDrawingIds": ["drawing-1", "drawing-2"],
  "linkedComplianceFormIds": ["sans-10400-a"],
  "linkedSubmissionPackId": "pack-1"
}
```

```json
{
  "submission": {
    "id": "municipal-1",
    "projectId": "project-1",
    "jobId": "job-1",
    "municipality": "City of Cape Town",
    "submissionReference": "BP-2026-000123",
    "status": "submitted",
    "aiExtractedStatus": "Application received",
    "aiStatusConfirmed": false,
    "clientUpdate": "The building plan pack has been submitted and is awaiting allocation.",
    "contractorImpact": "No site start date change until plan approval is confirmed.",
    "expectedNextStep": "Confirm allocation to plans examiner and upload stamped receipt.",
    "actionItems": [
      "Upload stamped submission receipt",
      "Confirm zoning departure is not required"
    ],
    "evidenceUrls": [
      "https://example.test/evidence/submission-receipt.pdf"
    ],
    "linkedDrawingIds": ["drawing-1", "drawing-2"],
    "linkedComplianceFormIds": ["sans-10400-a"],
    "linkedSubmissionPackId": "pack-1",
    "visibility": "published",
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z",
    "statusHistory": [
      {
        "status": "submitted",
        "at": "2026-05-15T12:00:00.000Z",
        "by": "architect-1",
        "note": "Municipal tracker record created"
      }
    ]
  }
}
```

Missing required municipality:

```json
{
  "error": "municipality is required"
}
```

## `POST /api/projects/:projectId/municipal/submissions/:submissionId/status`

Updates a tracker status, optional client/contractor summary fields, evidence, action items, and append-only status history.

```http
POST /api/projects/project-1/municipal/submissions/municipal-1/status
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "status": "plans_examiner_allocated",
  "aiExtractedStatus": "Allocated to plans examiner",
  "confirmAiStatus": true,
  "clientUpdate": "The submission has been allocated to a plans examiner.",
  "contractorImpact": "Procurement may proceed at risk, but construction cannot start before approval.",
  "expectedNextStep": "Respond to examiner queries within five business days.",
  "actionItems": [
    "Monitor portal for examiner queries",
    "Prepare structural engineer response pack"
  ],
  "evidenceUrls": [
    "https://example.test/evidence/portal-allocation.png"
  ],
  "note": "Portal screenshot checked by project lead."
}
```

```json
{
  "id": "municipal-1",
  "status": "plans_examiner_allocated",
  "aiExtractedStatus": "Allocated to plans examiner",
  "aiStatusConfirmed": true,
  "clientUpdate": "The submission has been allocated to a plans examiner.",
  "contractorImpact": "Procurement may proceed at risk, but construction cannot start before approval.",
  "expectedNextStep": "Respond to examiner queries within five business days.",
  "actionItems": [
    "Monitor portal for examiner queries",
    "Prepare structural engineer response pack"
  ],
  "evidenceUrls": [
    "https://example.test/evidence/portal-allocation.png"
  ],
  "updatedAt": "2026-05-15T12:30:00.000Z",
  "statusHistory": [
    {
      "status": "submitted",
      "at": "2026-05-15T12:00:00.000Z",
      "by": "architect-1",
      "note": "Municipal tracker record created"
    },
    {
      "status": "plans_examiner_allocated",
      "at": "2026-05-15T12:30:00.000Z",
      "by": "architect-1",
      "note": "Portal screenshot checked by project lead."
    }
  ]
}
```

Missing status:

```json
{
  "error": "status is required"
}
```

Unknown submission:

```json
{
  "error": "Municipal submission not found"
}
```

## `GET /api/projects/:projectId/municipal/status`

Returns project municipal tracker status. Admins and project leads receive the control view. Clients and active project team members receive an insight view with public coordination fields only.

### Control view

```http
GET /api/projects/project-1/municipal/status
Authorization: Bearer <project-lead-bep-id-token>
```

```json
{
  "projectId": "project-1",
  "controlView": true,
  "submissions": [
    {
      "id": "municipal-1",
      "projectId": "project-1",
      "jobId": "job-1",
      "municipality": "City of Cape Town",
      "submissionReference": "BP-2026-000123",
      "status": "plans_examiner_allocated",
      "aiExtractedStatus": "Allocated to plans examiner",
      "aiStatusConfirmed": true,
      "clientUpdate": "The submission has been allocated to a plans examiner.",
      "contractorImpact": "Procurement may proceed at risk, but construction cannot start before approval.",
      "expectedNextStep": "Respond to examiner queries within five business days.",
      "actionItems": ["Monitor portal for examiner queries"],
      "evidenceUrls": ["https://example.test/evidence/portal-allocation.png"],
      "linkedDrawingIds": ["drawing-1", "drawing-2"],
      "linkedComplianceFormIds": ["sans-10400-a"],
      "linkedSubmissionPackId": "pack-1",
      "visibility": "published",
      "createdBy": "architect-1",
      "createdAt": "2026-05-15T12:00:00.000Z",
      "updatedAt": "2026-05-15T12:30:00.000Z"
    }
  ]
}
```

### Client/contractor insight view

```http
GET /api/projects/project-1/municipal/status
Authorization: Bearer <project-client-id-token>
```

```json
{
  "projectId": "project-1",
  "controlView": false,
  "submissions": [
    {
      "id": "municipal-1",
      "projectId": "project-1",
      "municipality": "City of Cape Town",
      "status": "plans_examiner_allocated",
      "clientUpdate": "The submission has been allocated to a plans examiner.",
      "contractorImpact": "Procurement may proceed at risk, but construction cannot start before approval.",
      "expectedNextStep": "Respond to examiner queries within five business days.",
      "actionItems": ["Monitor portal for examiner queries"],
      "updatedAt": "2026-05-15T12:30:00.000Z"
    }
  ]
}
```

Non-participant block:

```json
{
  "error": "Only project participants can view municipal status insight"
}
```

## Audit events

```json
[
  {
    "category": "project",
    "action": "municipal.submission_created",
    "target": { "type": "municipal_submission", "id": "municipal-1", "projectId": "project-1" },
    "metadata": {
      "municipality": "City of Cape Town",
      "status": "submitted",
      "evidenceCount": 1,
      "actionItemCount": 2
    }
  },
  {
    "category": "project",
    "action": "municipal.status_updated",
    "target": { "type": "municipal_submission", "id": "municipal-1", "projectId": "project-1" },
    "metadata": {
      "status": "plans_examiner_allocated",
      "aiStatusConfirmed": true,
      "actionItemCount": 2
    }
  },
  {
    "category": "access",
    "action": "municipal.control_viewed",
    "target": { "type": "project", "id": "project-1", "projectId": "project-1" },
    "metadata": { "resultCount": 1 }
  }
]
```

## Human confirmations still required

- Which municipal portals or APIs may be used, and under what terms and credentials.
- Whether portal screenshots, email receipts, stamped drawings, or other evidence are sufficient for each municipal status.
- Which statuses can be shown to clients/contractors without additional professional review.
- Whether AI/OCR status extraction may ever prefill fields in production, and what review threshold is required.
- Retention and POPIA handling for municipal evidence URLs, official references, and portal credentials.
