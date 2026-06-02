# Directory Invitation and Brief Intake API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for directory invitation and brief intake routes. These examples document local/dev contract shape only. They do not send live email, accept invitations for users, appoint professionals, certify scope, sign contracts, or trigger payments.

## `POST /api/directory/invitations`

Creates either a pending acceptance invitation for an existing verified user, or a pending registration invitation for an unregistered email. Invitations do not expire and use periodic reminder metadata.

```http
POST /api/directory/invitations
Authorization: Bearer <client-id-token>
Content-Type: application/json

{
  "targetUserId": "architect-1",
  "targetRole": "bep",
  "action": "project_invite",
  "context": {
    "projectId": "project-1",
    "message": "Please join the concept design project team."
  }
}
```

```json
{
  "id": "invitation-1",
  "status": "pending_acceptance",
  "targetUserId": "architect-1",
  "targetEmail": null,
  "targetRole": "bep",
  "verificationId": "verification-1",
  "onboardingRequired": false,
  "requiresAcceptance": true,
  "expiryPolicy": "none",
  "nextReminderAt": "2026-05-22T12:00:00.000Z"
}
```

Unregistered recipient example:

```json
{
  "id": "invitation-2",
  "status": "pending_registration",
  "targetUserId": null,
  "targetEmail": "new.architect@example.test",
  "targetRole": "bep",
  "verificationId": null,
  "onboardingRequired": true,
  "requiresAcceptance": true,
  "expiryPolicy": "none",
  "nextReminderAt": "2026-05-22T12:00:00.000Z"
}
```

Gate examples:

```json
[
  { "error": "Directory invitations are not available for this role" },
  { "error": "targetUserId or targetEmail is required" },
  { "error": "Unsupported directory invitation action" },
  { "error": "You cannot invite yourself" },
  { "error": "Directory target profile not found" },
  { "error": "This user role is not eligible for this invitation" },
  { "error": "This invitation action is not allowed for the inviter and target roles" },
  {
    "error": "Verified profile is required before this user can be invited",
    "verificationRequired": { "role": "bep" }
  }
]
```

## `POST /api/directory/invitations/:invitationId/respond`

Allows only the invited user, or an invited email after registration, to accept or reject.

```http
POST /api/directory/invitations/invitation-1/respond
Authorization: Bearer <verified-invitee-id-token>
Content-Type: application/json

{
  "decision": "accepted"
}
```

```json
{
  "id": "invitation-1",
  "status": "accepted",
  "verificationId": "verification-1"
}
```

Rejected response:

```json
{
  "id": "invitation-1",
  "status": "rejected",
  "verificationId": "verification-1"
}
```

Gate examples:

```json
[
  { "error": "decision must be accepted or rejected" },
  { "error": "Directory invitation not found" },
  { "error": "Only the invited user can respond to this invitation" },
  { "error": "Invitation is not awaiting a response" },
  {
    "error": "Verification is required before accepting this invitation",
    "verificationRequired": { "role": "bep" }
  }
]
```

## `POST /api/project-briefs`

Creates a durable client-owned project brief from structured intake data.

```http
POST /api/project-briefs
Authorization: Bearer <client-id-token>
Content-Type: application/json

{
  "title": "Residential alteration",
  "description": "Need plans for a kitchen addition and council approval.",
  "category": "Residential",
  "location": "Cape Town",
  "budgetRange": { "min": 50000, "max": 100000 },
  "requirements": ["kitchen addition", "municipal approval"],
  "propertyDetails": { "erfNumber": "12345", "suburb": "Observatory" }
}
```

```json
{
  "brief": {
    "id": "brief-1",
    "clientId": "client-1",
    "createdBy": "client-1",
    "title": "Residential alteration",
    "description": "Need plans for a kitchen addition and council approval.",
    "category": "Residential",
    "location": "Cape Town",
    "budgetRange": { "min": 50000, "max": 100000 },
    "requirements": ["kitchen addition", "municipal approval"],
    "propertyDetails": { "erfNumber": "12345", "suburb": "Observatory" },
    "status": "submitted",
    "assignedBepIds": [],
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z"
  }
}
```

## `POST /api/project-briefs/:briefId/attachments`

Adds evidence metadata to a project brief. The route stores metadata only, not binary upload contents.

```http
POST /api/project-briefs/brief-1/attachments
Authorization: Bearer <brief-owner-id-token>
Content-Type: application/json

{
  "fileName": "existing-plan.pdf",
  "fileUrl": "https://example.test/uploads/existing-plan.pdf",
  "evidenceType": "existing_drawing",
  "metadata": { "source": "client_upload" }
}
```

```json
{
  "attachment": {
    "id": "attachment-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "fileName": "existing-plan.pdf",
    "fileUrl": "https://example.test/uploads/existing-plan.pdf",
    "evidenceType": "existing_drawing",
    "metadata": { "source": "client_upload" },
    "uploadedBy": "client-1",
    "createdAt": "2026-05-15T12:10:00.000Z"
  }
}
```

## `POST /api/project-briefs/:briefId/interpretations`

Persists an advisory interpretation linked to a brief and evidence. AI or BEP interpretations cannot finalize scope without human review.

```http
POST /api/project-briefs/brief-1/interpretations
Authorization: Bearer <assigned-bep-id-token>
Content-Type: application/json

{
  "summary": "The project likely needs measured drawings, concept design, and municipal submission support.",
  "confidence": 0.74,
  "sourceAttachmentIds": ["attachment-1"],
  "likelyRequiredProfessionals": ["architect", "structural_engineer"],
  "risks": ["municipal approval timeline", "existing structure unknown"],
  "limitations": ["No site visit completed"]
}
```

```json
{
  "interpretation": {
    "id": "interpretation-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "createdBy": "architect-1",
    "createdByRole": "bep",
    "summary": "The project likely needs measured drawings, concept design, and municipal submission support.",
    "confidence": 0.74,
    "sourceAttachmentIds": ["attachment-1"],
    "likelyRequiredProfessionals": ["architect", "structural_engineer"],
    "risks": ["municipal approval timeline", "existing structure unknown"],
    "limitations": ["No site visit completed"],
    "advisoryOnly": true,
    "status": "ready_for_review",
    "createdAt": "2026-05-15T12:20:00.000Z"
  }
}
```

## `POST /api/client-briefs`

Creates a guided client brief and immediate advisory interpretation.

```http
POST /api/client-briefs
Authorization: Bearer <client-id-token>
Content-Type: application/json

{
  "selectedOption": "alteration_or_addition",
  "projectGoal": "I want to add a kitchen extension and understand what approvals are needed.",
  "siteAddress": "1 Example Road, Cape Town",
  "supportNeeds": ["concept_design", "municipal_submission"],
  "evidenceUploads": [
    { "fileName": "photos.zip", "fileUrl": "https://example.test/uploads/photos.zip" }
  ],
  "urgency": "next_3_months",
  "budgetComfort": "medium"
}
```

```json
{
  "brief": {
    "id": "client-brief-1",
    "clientId": "client-1",
    "clientName": "Client One",
    "status": "ai_interpreted",
    "selectedOption": "alteration_or_addition",
    "projectGoal": "I want to add a kitchen extension and understand what approvals are needed.",
    "siteAddress": "1 Example Road, Cape Town",
    "supportNeeds": ["concept_design", "municipal_submission"],
    "evidenceUploads": [
      { "fileName": "photos.zip", "fileUrl": "https://example.test/uploads/photos.zip" }
    ],
    "interpretation": {
      "summary": "Likely alteration/addition brief requiring professional review and municipal approval advice.",
      "advisoryOnly": true,
      "recommendedNextStep": "Assign a verified BEP to finalize the technical scope."
    },
    "assignedBepIds": [],
    "technicalBriefId": null,
    "createdAt": "2026-05-15T12:30:00.000Z",
    "updatedAt": "2026-05-15T12:30:00.000Z"
  }
}
```

Brief gate examples:

```json
[
  { "error": "Only clients can create project briefs" },
  { "error": "Project brief not found" },
  { "error": "Only the brief owner can attach evidence" },
  { "error": "Only the brief owner, admin, or assigned BEP can add interpretations" },
  { "error": "Only clients can create guided briefs" },
  { "error": "Project goal must explain what the client is trying to achieve" }
]
```

## Audit events

```json
[
  { "category": "project", "action": "directory.invitation_created" },
  { "category": "project", "action": "directory.registration_invitation_created" },
  { "category": "access", "action": "directory.invitation_blocked_unverified" },
  { "category": "project", "action": "directory.invitation_accepted" },
  { "category": "project", "action": "directory.invitation_rejected" },
  { "category": "project", "action": "project_brief.created" },
  { "category": "project", "action": "project_brief.attachment_added" },
  { "category": "ai", "action": "project_brief.interpretation_added" },
  { "category": "brief", "action": "brief.client_created" }
]
```

## Human confirmations still required

- Transactional email provider and reminder copy for invitation reminder delivery.
- Whether invitation reminders remain periodic forever or require a manual archive path despite no expiry.
- Which brief evidence types are accepted for professional/municipal review.
- Which AI interpretation wording is legally acceptable for client-facing triage.
- Whether guided brief creation should immediately notify marketplace/verified BEP roles or wait for client confirmation.
