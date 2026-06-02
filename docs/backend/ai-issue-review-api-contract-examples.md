# AI Issue Routing and Review API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for project-scoped AI issue routing, resolution, and human review routes. These examples document local/dev contract shape only. They do not certify compliance, close statutory obligations, sign professional declarations, or allow AI to approve its own output.

## Shared behaviour

- AI issue routes are project workflow records under `projects/{projectId}/ai_issues`.
- AI issues are advisory coordination items until resolved by an authorized human and reviewed by the project lead context.
- Assignees must have a supported profile role and a directory verification record before the router accepts assignment.
- Freelancers can resolve only issues assigned to them.
- Accepted review closes the issue; reopened review moves it back to assigned/open workflow for additional work.

## `POST /api/projects/:projectId/ai-issues`

Routes an AI/compliance issue to an optional verified assignee. Assignment also creates a pending in-app/email notification record.

```http
POST /api/projects/project-1/ai-issues
Authorization: Bearer <project-coordinator-id-token>
Content-Type: application/json

{
  "sourceSubmissionId": "drawing-check-1",
  "sourceFindingIndex": 2,
  "title": "Fire note missing from escape stair drawing",
  "description": "The AI checker could not find the required fire-rating note on the escape stair detail.",
  "severity": "high",
  "discipline": "Architecture",
  "responsibleParty": "BEP",
  "standardReference": "SANS 10400-T",
  "assigneeId": "architect-2"
}
```

```json
{
  "issue": {
    "id": "ai-issue-1",
    "projectId": "project-1",
    "jobId": "job-1",
    "sourceSubmissionId": "drawing-check-1",
    "sourceFindingIndex": 2,
    "title": "Fire note missing from escape stair drawing",
    "description": "The AI checker could not find the required fire-rating note on the escape stair detail.",
    "severity": "high",
    "discipline": "Architecture",
    "responsibleParty": "BEP",
    "standardReference": "SANS 10400-T",
    "assigneeId": "architect-2",
    "assigneeRole": "bep",
    "assigneeVerificationId": "verification-1",
    "status": "assigned",
    "resolutionStatus": "unresolved",
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z"
  }
}
```

Unassigned issue response:

```json
{
  "issue": {
    "id": "ai-issue-2",
    "projectId": "project-1",
    "jobId": "job-1",
    "sourceSubmissionId": "drawing-check-1",
    "sourceFindingIndex": 3,
    "title": "Door swing requires human review",
    "description": "The AI checker flagged a possible escape-route clash.",
    "severity": "medium",
    "discipline": "Architecture",
    "responsibleParty": "BEP",
    "standardReference": "SANS 10400-T",
    "assigneeId": null,
    "assigneeRole": null,
    "assigneeVerificationId": null,
    "status": "open",
    "resolutionStatus": "unresolved",
    "createdBy": "architect-1",
    "createdAt": "2026-05-15T12:05:00.000Z",
    "updatedAt": "2026-05-15T12:05:00.000Z"
  }
}
```

Assignment gate examples:

```json
[
  { "error": "title is required" },
  { "error": "Assignee profile not found" },
  { "error": "Unsupported assignee role" },
  {
    "error": "Verified assignee is required before routing AI issues",
    "verificationRequired": { "role": "bep" }
  }
]
```

## `POST /api/projects/:projectId/ai-issues/:issueId/resolve`

Records human resolution evidence. The issue remains pending review until a project lead/admin accepts or reopens it.

```http
POST /api/projects/project-1/ai-issues/ai-issue-1/resolve
Authorization: Bearer <assigned-reviewer-id-token>
Content-Type: application/json

{
  "resolutionNotes": "Added fire-rating note to stair detail and uploaded revised drawing.",
  "evidenceUrls": [
    "https://example.test/evidence/stair-detail-revision.pdf"
  ]
}
```

```json
{
  "id": "ai-issue-1",
  "status": "resolved",
  "resolutionStatus": "resolved_pending_review",
  "resolvedBy": "architect-2",
  "resolvedAt": "2026-05-15T12:30:00.000Z",
  "resolutionNotes": "Added fire-rating note to stair detail and uploaded revised drawing.",
  "evidenceUrls": [
    "https://example.test/evidence/stair-detail-revision.pdf"
  ],
  "updatedAt": "2026-05-15T12:30:00.000Z"
}
```

Resolution gate examples:

```json
[
  { "error": "Project not found" },
  { "error": "AI issue not found" },
  { "error": "Only the assignee, active project team, lead BEP, or admin can resolve this issue" },
  { "error": "Freelancers can only resolve issues assigned to them" }
]
```

## `POST /api/projects/:projectId/ai-issues/:issueId/review`

Records project lead/admin human review of a resolved issue. `accepted` closes the issue. `reopened` returns it for additional work.

### Accepted review

```http
POST /api/projects/project-1/ai-issues/ai-issue-1/review
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "decision": "accepted",
  "reviewNotes": "Reviewed revised drawing and evidence. Close this coordination issue."
}
```

```json
{
  "id": "ai-issue-1",
  "status": "closed",
  "resolutionStatus": "accepted",
  "reviewedBy": "architect-1",
  "reviewedAt": "2026-05-15T13:00:00.000Z",
  "reviewNotes": "Reviewed revised drawing and evidence. Close this coordination issue.",
  "updatedAt": "2026-05-15T13:00:00.000Z"
}
```

### Reopened review

```http
POST /api/projects/project-1/ai-issues/ai-issue-1/review
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "decision": "reopened",
  "reviewNotes": "Fire-rating note was added, but the stair landing detail still needs correction."
}
```

```json
{
  "id": "ai-issue-1",
  "status": "assigned",
  "resolutionStatus": "reopened",
  "reviewedBy": "architect-1",
  "reviewedAt": "2026-05-15T13:15:00.000Z",
  "reviewNotes": "Fire-rating note was added, but the stair landing detail still needs correction.",
  "updatedAt": "2026-05-15T13:15:00.000Z"
}
```

Review gate examples:

```json
[
  { "error": "decision must be accepted or reopened" },
  { "error": "AI issue not found" }
]
```

## Audit events

```json
[
  {
    "category": "ai",
    "action": "ai.issue_routed",
    "target": { "type": "ai_issue", "id": "ai-issue-1", "projectId": "project-1" },
    "metadata": {
      "assigneeId": "architect-2",
      "assigneeRole": "bep",
      "severity": "high",
      "discipline": "Architecture",
      "sourceSubmissionId": "drawing-check-1"
    }
  },
  {
    "category": "ai",
    "action": "ai.issue_resolved",
    "target": { "type": "ai_issue", "id": "ai-issue-1", "projectId": "project-1" },
    "metadata": { "evidenceCount": 1 }
  },
  {
    "category": "approval",
    "action": "ai.issue_resolution_accepted",
    "target": { "type": "ai_issue", "id": "ai-issue-1", "projectId": "project-1" },
    "metadata": { "decision": "accepted" }
  }
]
```

## Human confirmations still required

- Which AI issue severities require second-person review or admin escalation.
- Whether any accepted issue can support professional declarations, municipal evidence, or statutory submissions without additional sign-off records.
- Which evidence URL sources are allowed in production and how long they are retained.
- Whether email delivery for assignment notifications remains dry-run or can send transactional emails.
- Whether reviewer roles differ by discipline, project stage, municipality, or risk flag.
