# Project Command Centre and Coordination API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for project command-centre projection, team-member invitation, and coordination item routes. These examples document local/dev contract shape only. They do not accept invitations on behalf of users, send live email, certify deliverables, or replace human project coordination.

## `GET /api/projects/:projectId/command-centre`

Returns and persists a viewer-scoped project command-centre projection in `project_command_views/{projectId}_{viewerUserId}`.

```http
GET /api/projects/project-1/command-centre
Authorization: Bearer <project-participant-id-token>
```

```json
{
  "commandCentre": {
    "id": "project-1",
    "projectId": "project-1",
    "projectCode": "ARC-2026-001",
    "viewer": {
      "userId": "architect-1",
      "role": "lead_bep",
      "normalizedUserRole": "bep"
    },
    "currentStage": "municipal_submission",
    "stageHistory": [
      { "stage": "brief", "at": "2026-05-01T09:00:00.000Z", "by": "client-1" },
      { "stage": "municipal_submission", "at": "2026-05-15T09:00:00.000Z", "by": "architect-1" }
    ],
    "team": {
      "leadBepId": "architect-1",
      "clientId": "client-1",
      "activeCount": 2,
      "members": [
        { "userId": "architect-1", "role": "lead_bep", "discipline": "Architecture", "verificationId": "verification-1" },
        { "userId": "engineer-1", "role": "bep", "discipline": "Structural", "verificationId": "verification-2" }
      ]
    },
    "panels": {
      "tasks": { "total": 3, "open": 2, "overdue": 1 },
      "approvals": { "total": 2, "pending": 1 },
      "documents": { "total": 5, "latestRevisionAt": "2026-05-15T12:00:00.000Z" },
      "messages": { "threadCount": 2, "unreadForViewer": 1 },
      "aiIssues": { "total": 4, "unresolved": 2 }
    },
    "generatedAt": "2026-05-15T12:30:00.000Z"
  }
}
```

Access gate examples:

```json
[
  { "error": "Project not found" },
  {
    "error": "BEP verification is required before accessing this project coordination workflow",
    "verificationRequired": { "subjectType": "bep", "statutoryBody": "SACAP" }
  },
  { "error": "Only project participants can access this project coordination workflow" }
]
```

## `POST /api/projects/:projectId/team-members`

Invites a verified participant into a project team and optionally creates initial deliverable coordination items. The invite remains pending until the invited user accepts through the directory/invitation workflow.

```http
POST /api/projects/project-1/team-members
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "userId": "engineer-1",
  "role": "bep",
  "discipline": "Structural",
  "deliverables": [
    "Structural design report",
    "Form 2 competent person declaration"
  ]
}
```

```json
{
  "teamMember": {
    "userId": "engineer-1",
    "role": "bep",
    "discipline": "Structural",
    "joinedAt": "2026-05-15T12:40:00.000Z",
    "status": "invited",
    "invitedBy": "architect-1",
    "invitedAt": "2026-05-15T12:40:00.000Z",
    "verificationId": "verification-2",
    "deliverables": [
      "Structural design report",
      "Form 2 competent person declaration"
    ]
  },
  "deliverables": [
    { "id": "coordination-1", "title": "Structural design report", "assigneeId": "engineer-1", "discipline": "Structural", "status": "open" },
    { "id": "coordination-2", "title": "Form 2 competent person declaration", "assigneeId": "engineer-1", "discipline": "Structural", "status": "open" }
  ]
}
```

Invitation gate examples:

```json
[
  { "error": "userId and discipline are required" },
  { "error": "You cannot invite yourself to the coordination team" },
  { "error": "Target user profile not found" },
  { "error": "Unsupported target role for project coordination" },
  {
    "error": "Verified profile is required before joining a project coordination team",
    "verificationRequired": { "role": "bep" }
  }
]
```

## `POST /api/projects/:projectId/coordination/items`

Creates a project coordination item such as an RFI, dependency, deliverable, deadline, compliance status, or municipal readiness item.

```http
POST /api/projects/project-1/coordination/items
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "itemType": "rfi",
  "title": "Confirm stormwater invert level",
  "description": "Engineer to confirm invert level before drainage drawing issue.",
  "discipline": "Civil",
  "assigneeId": "engineer-1",
  "dependsOnIds": ["coordination-1"],
  "dueAt": "2026-05-20T12:00:00.000Z",
  "status": "open"
}
```

```json
{
  "id": "coordination-3",
  "projectId": "project-1",
  "jobId": "job-1",
  "itemType": "rfi",
  "title": "Confirm stormwater invert level",
  "description": "Engineer to confirm invert level before drainage drawing issue.",
  "discipline": "Civil",
  "assigneeId": "engineer-1",
  "dependsOnIds": ["coordination-1"],
  "dueAt": "2026-05-20T12:00:00.000Z",
  "status": "open",
  "createdBy": "architect-1",
  "createdAt": "2026-05-15T12:50:00.000Z",
  "updatedAt": "2026-05-15T12:50:00.000Z"
}
```

Coordination item gate examples:

```json
[
  { "error": "Unsupported coordination item type" },
  { "error": "title is required" }
]
```

## Audit events

```json
[
  {
    "category": "access",
    "action": "project.command_centre_viewed",
    "metadata": { "viewerProjectRole": "lead_bep", "taskCount": 3, "approvalCount": 2, "documentCount": 5 }
  },
  {
    "category": "project",
    "action": "coordination.team_member_invited",
    "metadata": { "targetUserId": "engineer-1", "targetRole": "bep", "discipline": "Structural", "verificationId": "verification-2", "deliverableCount": 2 }
  },
  {
    "category": "access",
    "action": "coordination.team_invitation_blocked_unverified",
    "metadata": { "targetUserId": "engineer-unverified", "targetRole": "bep", "discipline": "Structural" }
  },
  {
    "category": "project",
    "action": "coordination.rfi_created",
    "metadata": { "itemType": "rfi", "assigneeId": "engineer-1", "discipline": "Civil", "status": "open" }
  }
]
```

## Human confirmations still required

- Which project roles may become active immediately after invitation versus requiring explicit acceptance.
- Whether team invitations should send live transactional email or remain pending in-app/dry-run notifications.
- Which coordination item types require professional sign-off, second review, or client visibility restrictions.
- Retention rules for command-centre projections and viewer-scoped access audit records.
- Whether deliverable coordination items created during team invitation need template approval per discipline or municipality.
