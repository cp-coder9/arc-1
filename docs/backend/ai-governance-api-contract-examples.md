# AI Governance Persistence API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for persisted AI governance routes. These examples document local/dev contract shape only. They do not let AI certify compliance, sign declarations, approve municipal submissions, release escrow, or replace human judgement.

## `POST /api/ai/action-logs`

Persists an immutable AI action log. If confidence is below `0.72` or normalized risk flags are present, the route also creates an open review queue item.

### High-confidence advisory output

```http
POST /api/ai/action-logs
Authorization: Bearer <project-participant-id-token>
Content-Type: application/json

{
  "projectId": "project-1",
  "actionKind": "drawing_check",
  "target": { "type": "drawing_check_run", "id": "run-1" },
  "prompt": {
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "promptVersion": "drawing-check-v1",
    "temperature": 0.2,
    "requestId": "req-1",
    "tokenUsage": { "input": 1000, "output": 250, "total": 1250 }
  },
  "sourceReferences": [
    { "type": "drawing", "id": "drawing-1", "label": "Stair detail", "excerptHash": "sha256:abc" }
  ],
  "confidence": 0.91,
  "outputSummary": "Detected no major checklist gaps. Advisory only.",
  "flags": []
}
```

```json
{
  "actionLog": {
    "id": "ai-log-1",
    "projectId": "project-1",
    "actionKind": "drawing_check",
    "actorUid": "architect-1",
    "target": { "type": "drawing_check_run", "id": "run-1" },
    "prompt": {
      "provider": "gemini",
      "model": "gemini-2.0-flash",
      "promptVersion": "drawing-check-v1",
      "temperature": 0.2,
      "requestId": "req-1",
      "tokenUsage": { "input": 1000, "output": 250, "total": 1250 }
    },
    "sourceReferences": [
      { "type": "drawing", "id": "drawing-1", "label": "Stair detail", "excerptHash": "sha256:abc" }
    ],
    "confidence": 0.91,
    "outputSummary": "Detected no major checklist gaps. Advisory only.",
    "flags": [],
    "status": "advisory",
    "createdAt": "2026-05-15T12:00:00.000Z",
    "requiresHumanConfirmation": false,
    "immutable": true
  },
  "reviewQueueItem": null
}
```

### Low-confidence or flagged output

```json
{
  "actionLog": {
    "id": "ai-log-2",
    "projectId": "project-1",
    "actionKind": "municipal_status_summary",
    "actorUid": "architect-1",
    "target": { "type": "municipal_submission", "id": "municipal-1" },
    "prompt": { "provider": "gemini", "model": "gemini-2.0-flash", "promptVersion": "municipal-summary-v1" },
    "sourceReferences": [{ "type": "municipal_record", "id": "municipal-1" }],
    "confidence": 0.68,
    "outputSummary": "Portal wording appears to indicate examiner allocation, but evidence is incomplete.",
    "flags": ["legal_or_compliance_risk"],
    "status": "requires_review",
    "createdAt": "2026-05-15T12:10:00.000Z",
    "requiresHumanConfirmation": true,
    "immutable": true
  },
  "reviewQueueItem": {
    "id": "ai-review-1",
    "projectId": "project-1",
    "actionLogId": "ai-log-2",
    "target": { "type": "municipal_submission", "id": "municipal-1" },
    "priority": "critical",
    "reason": "AI output flagged for review: legal_or_compliance_risk",
    "flags": ["legal_or_compliance_risk"],
    "status": "open",
    "assignedRole": "admin",
    "createdAt": "2026-05-15T12:10:00.000Z"
  }
}
```

Gate examples:

```json
[
  { "error": "projectId is required" },
  { "error": "Project not found" },
  { "error": "Only project participants can create AI action logs" },
  { "error": "confidence must be a number between 0 and 1" },
  { "error": "at least one source reference is required" }
]
```

## `POST /api/admin/ai-review/:itemId/resolve`

Resolves an open AI review queue item. Admin-only. Optional `humanSignOff` creates an immutable human sign-off record and updates the linked action log to `human_confirmed`.

```http
POST /api/admin/ai-review/ai-review-1/resolve
Authorization: Bearer <admin-id-token>
Content-Type: application/json

{
  "decision": "resolved",
  "reason": "Evidence reviewed and project lead declaration recorded.",
  "humanSignOff": {
    "domain": "municipal_submission",
    "target": { "type": "municipal_submission", "id": "municipal-1", "projectId": "project-1" },
    "declaration": "I reviewed the municipal submission evidence and confirm the coordination status update."
  }
}
```

```json
{
  "item": {
    "id": "ai-review-1",
    "projectId": "project-1",
    "actionLogId": "ai-log-2",
    "target": { "type": "municipal_submission", "id": "municipal-1" },
    "priority": "critical",
    "reason": "AI output flagged for review: legal_or_compliance_risk",
    "flags": ["legal_or_compliance_risk"],
    "status": "resolved",
    "assignedRole": "admin",
    "createdAt": "2026-05-15T12:10:00.000Z",
    "decision": "resolved",
    "resolutionReason": "Evidence reviewed and project lead declaration recorded.",
    "resolvedBy": "admin-1",
    "resolvedAt": "2026-05-15T12:30:00.000Z",
    "humanSignOffRecorded": true,
    "updatedAt": "2026-05-15T12:30:00.000Z"
  },
  "humanSignOff": {
    "domain": "municipal_submission",
    "actorUid": "admin-1",
    "actorRole": "admin",
    "target": { "type": "municipal_submission", "id": "municipal-1", "projectId": "project-1" },
    "declaration": "I reviewed the municipal submission evidence and confirm the coordination status update.",
    "aiActionLogIds": ["ai-log-2"],
    "createdAt": "2026-05-15T12:30:00.000Z",
    "humanConfirmed": true,
    "aiMayNotSign": true,
    "immutable": true
  }
}
```

Dismissed without sign-off:

```json
{
  "item": {
    "id": "ai-review-2",
    "status": "dismissed",
    "decision": "dismissed",
    "resolutionReason": "Duplicate queue item superseded by ai-review-1.",
    "resolvedBy": "admin-1",
    "resolvedAt": "2026-05-15T12:45:00.000Z",
    "humanSignOffRecorded": false,
    "updatedAt": "2026-05-15T12:45:00.000Z"
  },
  "humanSignOff": null
}
```

Gate examples:

```json
[
  { "error": "Only admins can resolve AI review queue items" },
  { "error": "decision must be resolved, dismissed, or rejected" },
  { "error": "reason is required" },
  { "error": "AI review queue item not found" },
  { "error": "AI review queue item is already resolved" },
  { "error": "AI/system actors cannot complete human sign-off" },
  { "error": "municipal_submission requires verified professional status" }
]
```

## Audit events

```json
[
  {
    "category": "ai",
    "action": "ai.action_logged_advisory",
    "target": { "type": "ai_action_log", "id": "ai-log-1", "projectId": "project-1" },
    "metadata": { "actionKind": "drawing_check", "status": "advisory", "confidence": 0.91, "reviewQueueId": null, "flags": [] }
  },
  {
    "category": "ai",
    "action": "ai.action_logged_requires_review",
    "target": { "type": "ai_action_log", "id": "ai-log-2", "projectId": "project-1" },
    "metadata": { "actionKind": "municipal_status_summary", "status": "requires_review", "confidence": 0.68, "reviewQueueId": "ai-review-1", "flags": ["legal_or_compliance_risk"] }
  },
  {
    "category": "approval",
    "action": "ai.review_resolved_with_human_signoff",
    "target": { "type": "ai_review_queue", "id": "ai-review-1", "projectId": "project-1" },
    "metadata": { "decision": "resolved", "actionLogId": "ai-log-2", "humanSignOffRecorded": true }
  }
]
```

## Human confirmations still required

- Who may override each review priority and what reason text is legally sufficient.
- Whether critical AI governance items require two-person review.
- Which sign-off domains are enabled in production and which remain dry-run/advisory only.
- Whether review queue resolution should notify clients, contractors, or municipal stakeholders.
- Retention policy for prompt metadata, source references, action logs, review queue items, and sign-off records.
