# Firestore Schema and Rules Notes: Phase 3/4 Operational Collections

Status: rules/docs pass for the Phase 3/4 backend collections currently persisted by trusted API routes. Browser rules are intentionally narrower than Admin SDK behavior.

## Access model

- Project-scoped reads require authenticated project participation through `projects/{projectId}` membership: client, lead BEP, active `teamMembers[]`, or admin.
- Project-scoped management writes are limited to project client, lead BEP, or admin unless a collection has a narrower assignee/author update path.
- Deletes are denied for operational records that should remain auditable. Superseding records or status transitions should be used instead.
- Server/Admin SDK routes bypass Firestore rules, so API handlers must continue to enforce route-level permissions and write audit events.

## Collections covered

### `project_command_views/{viewId}`

Persisted per-viewer command-centre projection.

Required identity fields:

- `projectId`
- `viewerUserId`
- `viewer.role`
- `generatedAt` / `updatedAt`

Rules:

- Browser read only when `viewerUserId == request.auth.uid` and the viewer can read the referenced project.
- Browser create/update/delete denied. Projections are server-owned.

Recommended indexes:

- `viewerUserId ASC, updatedAt DESC`
- `projectId ASC, viewerUserId ASC`

### `resource_centre/{resourceId}`

Curated resource-centre material and templates.

Common fields:

- `title`
- `category`
- `municipality`, optional
- `discipline`, optional
- `status`
- `updatedAt`

Rules:

- Authenticated read.
- Admin write only.

Recommended indexes:

- `category ASC, status ASC`
- `municipality ASC, category ASC`
- `discipline ASC, status ASC`

### `projects/{projectId}/drawing_checklists/{checklistId}`

Drawing checklist tracker by municipality, discipline, and stage.

Common fields:

- `projectId`
- `municipality`
- `discipline`
- `stage`
- `items[]`
- `progress`
- `createdBy`
- `createdAt`
- `updatedAt`

Rules:

- Project participants can read.
- Project managers can create/update while preserving `projectId` and `createdBy`.
- Deletes denied.

Recommended indexes:

- collection group `drawing_checklists`: `projectId ASC, updatedAt DESC`
- collection group `drawing_checklists`: `municipality ASC, discipline ASC, stage ASC`

### `projects/{projectId}/municipal_submissions/{submissionId}`

Municipal submission record, evidence/status anchor, and audience projection source.

Common fields:

- `projectId`
- `municipality`
- `referenceNumber`, optional
- `status`
- `statusHistory[]`
- `evidence[]`
- `createdBy`
- `createdAt`
- `updatedAt`

Rules:

- Project participants can read.
- Project managers can create/update while preserving `projectId` and `createdBy`.
- Deletes denied.

Recommended indexes:

- collection group `municipal_submissions`: `projectId ASC, updatedAt DESC`
- collection group `municipal_submissions`: `municipality ASC, status ASC, updatedAt DESC`

### `projects/{projectId}/work_packages/{packageId}`

Freelancer/subcontractor/package workflow records.

Common fields:

- `projectId`
- `title`
- `scope`
- `status`
- `postedBy`
- `assignedFreelancerId`, optional
- `deliverables[]`
- `createdAt`
- `updatedAt`

Rules:

- Project participants can read. Assigned freelancers can read their package.
- Project managers can create/update.
- Assigned freelancer updates are limited to `status`, `deliverables`, and `updatedAt` while preserving identity fields.
- Deletes denied.

Recommended indexes:

- collection group `work_packages`: `projectId ASC, status ASC, updatedAt DESC`
- collection group `work_packages`: `assignedFreelancerId ASC, status ASC`

### `projects/{projectId}/ai_issues/{issueId}`

AI drawing/check issue records. AI output remains advisory until reviewed by a human.

Common fields:

- `projectId`
- `title`
- `description`
- `status`
- `resolutionStatus`
- `sourceReferences[]`
- `confidence`
- `model`, optional
- `promptHash`, optional
- `humanConfirmed`
- `assigneeId`, optional
- `createdBy`
- `createdAt`
- `updatedAt`

Rules:

- Project participants can read. Assigned users can read their issue.
- Project managers can create advisory issues only with `humanConfirmed == false` and can update issue state.
- Assignees can only update resolution fields/notes while preserving identity fields.
- Deletes denied.

Recommended indexes:

- collection group `ai_issues`: `projectId ASC, status ASC, updatedAt DESC`
- collection group `ai_issues`: `assigneeId ASC, resolutionStatus ASC`

### `projects/{projectId}/coordination_items/{itemId}`

RFI, coordination, dependency, and linked action items.

Common fields:

- `projectId`
- `itemType`
- `title`
- `description`
- `status`
- `linkedTaskId`, optional
- `linkedDrawingId`, optional
- `createdBy`
- `createdAt`
- `updatedAt`

Rules:

- Project participants can read/create.
- Project managers can update all state.
- Authors can update only content/link/status fields while preserving `projectId` and `createdBy`.
- Deletes denied.

Recommended indexes:

- collection group `coordination_items`: `projectId ASC, status ASC, updatedAt DESC`
- collection group `coordination_items`: `createdBy ASC, updatedAt DESC`

### `ai_action_logs/{logId}`

Append-only AI governance evidence created by trusted API routes.

Common fields:

- `projectId`
- `actionKind`
- `actorUid`
- `target`
- `prompt`
- `sourceReferences[]`
- `confidence`
- `status`
- `requiresHumanConfirmation`
- `createdAt`

Rules:

- Project participants can read logs for their project.
- Browser create/update/delete denied. Server routes own persistence and audit.

Recommended indexes:

- `projectId ASC, status ASC, createdAt DESC`

### `ai_review_queue/{itemId}`

Governance queue for low-confidence or flagged AI outputs.

Common fields:

- `projectId`
- `actionLogId`
- `target`
- `priority`
- `status`
- `assignedRole`
- `flags[]`
- `createdAt`
- `resolvedAt`, optional

Rules:

- Admins and project participants can read queue items for their project.
- Browser create/update/delete denied. Resolution must go through audited API routes.

Recommended indexes:

- `projectId ASC, status ASC, priority ASC, createdAt DESC`

### `human_signoffs/{signoffId}`

Human-only sign-off records created when an authorized human confirms a governed workflow item.

Common fields:

- `domain`
- `actorUid`
- `actorRole`
- `target.projectId`
- `declaration`
- `aiActionLogIds[]`
- `humanConfirmed`
- `aiMayNotSign`
- `createdAt`

Rules:

- Admins and project participants can read sign-offs for their project.
- Browser create/update/delete denied so AI/system actors cannot self-certify from the client.

Recommended indexes:

- `target.projectId ASC, domain ASC, createdAt DESC`

## Related audit/access collections

- `audit_logs/{auditId}` remains append-only and admin-readable.
- `user_verifications/{verificationId}` remains owner/admin readable with admin-only outcome updates.
- API routes that create or change municipal, AI, work package, checklist, or coordination records should write audit events with `target.projectId` and the relevant collection/document identifier.

## Blockers / human confirmations

- Exact production field requirements for checklist templates, municipal evidence files, and resource-centre publication workflow still need product/legal confirmation.
- Firestore emulator behavioral tests are not present; current coverage is static rules regression only.
