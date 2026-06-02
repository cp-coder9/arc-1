# Project command centre workflow

Status: implemented backend projection and operational workflow notes aligned to the current API router, backend API reference, Firestore schema notes, and `backend.html` command-centre dashboard intent.

## Purpose and dashboard alignment

The command centre is the project-facing dashboard surface for the current stage, team, tasks, approvals, documents, messages, and unresolved AI/compliance issues. The backend currently implements it as a server-built projection from project records and project subcollections, then persists a per-viewer read model.

This matches the `backend.html` intent for a central project command centre while leaving frontend-only dashboard composition to the dashboard owners.

## Read-model API

### `GET /api/projects/:projectId/command-centre`

Builds and persists the caller's command-centre projection.

- **Auth:** required.
- **Access:** project coordinator context. Allowed callers are admins, project clients, lead BEP/architects, or active project team members.
- **Verification:** non-admin BEP coordinators require active SACAP/BEP verification.
- **Durable reads:** `projects/{projectId}` plus `tasks`, `approvals`, `documents`, `message_threads`, and `ai_issues` subcollections.
- **Durable write:** `project_command_views/{projectId}_{viewerUid}`.
- **Audit action:** `project.command_centre_viewed`.

## Projection contents

| Area | Source | Current projection fields |
| --- | --- | --- |
| Project identity | `projects/{projectId}` | `projectId`, `projectCode`, `currentStage` |
| Viewer context | Auth context and project membership | viewer user ID, viewer project role, normalized user role |
| Stage history | `projects/{projectId}.stageHistory` | Ordered stage entries as stored by project workflow |
| Team | `projects/{projectId}.teamMembers` | lead BEP, client, active count, active member roles/disciplines/verification IDs |
| Tasks | `projects/{projectId}/tasks` | total, open, overdue |
| Approvals | `projects/{projectId}/approvals` | total, pending |
| Documents | `projects/{projectId}/documents` | total, latest revision/update timestamp |
| Messages | `projects/{projectId}/message_threads` | thread count, unread threads for viewer |
| AI issues | `projects/{projectId}/ai_issues` | total, unresolved |

## Related write workflows feeding the command centre

These APIs populate the subcollections summarized by the command centre. They are protected by project coordination gates unless their route has narrower logic.

| API | Durable collection(s) | Audit action |
| --- | --- | --- |
| `POST /api/projects/:projectId/documents` | `projects/{projectId}/documents`, initial `versions/v1` | `document.created` |
| `POST /api/projects/:projectId/document-versions` | `projects/{projectId}/documents/{documentId}/versions` | `document.version_created` |
| `POST /api/projects/:projectId/tasks` | `projects/{projectId}/tasks` | `task.created` |
| `POST /api/projects/:projectId/approvals` | `projects/{projectId}/approvals` | `approval.requested` |
| `POST /api/projects/:projectId/message-threads` | `projects/{projectId}/message_threads` | `message.thread_created` |
| `POST /api/projects/:projectId/messages` | `projects/{projectId}/message_threads/{threadId}/messages` and thread metadata | `message.created` |
| `POST /api/projects/:projectId/transmittals` | `projects/{projectId}/transmittals` | `transmittal.issued` |
| `POST /api/projects/:projectId/ai-issues` | `projects/{projectId}/ai_issues` | `ai.issue_created` |
| `POST /api/projects/:projectId/ai-issues/:issueId/resolve` | `projects/{projectId}/ai_issues/{issueId}` | `ai.issue_resolved` |
| `POST /api/projects/:projectId/ai-issues/:issueId/review` | `projects/{projectId}/ai_issues/{issueId}` | `ai.issue_reviewed` |
| `POST /api/projects/:projectId/team-members` | `projects/{projectId}.teamMembers`, `notifications` | `coordination.team_member_invited` or `coordination.team_invitation_blocked_unverified` |
| `POST /api/projects/:projectId/coordination/items` | `projects/{projectId}/coordination_items` | `coordination.{itemType}_created` |

## Durable collections

| Collection / path | Role in workflow |
| --- | --- |
| `projects/{projectId}` | Canonical project shell, current stage, stage history, client, lead BEP/architect, active team members |
| `project_command_views/{viewId}` | Server-owned per-viewer command-centre projection, generated on read |
| `projects/{projectId}/tasks` | Task board summary source |
| `projects/{projectId}/approvals` | Approval queue summary source |
| `projects/{projectId}/documents` | Document register summary source |
| `projects/{projectId}/documents/{documentId}/versions` | Document revision history |
| `projects/{projectId}/message_threads` | Project communications summary source |
| `projects/{projectId}/message_threads/{threadId}/messages` | Thread messages |
| `projects/{projectId}/ai_issues` | Advisory AI/compliance issue queue summary source |
| `projects/{projectId}/transmittals` | Issued document/transmittal records |
| `projects/{projectId}/coordination_items` | RFI, dependency, deadline, compliance, municipal readiness, and related action items |
| `audit_logs` | Immutable audit trail for projection reads and operational writes |
| `notifications` | Team invite and assignment notifications |

## Human blockers and governance

- Non-project users are denied command-centre access.
- BEP users must have active verification before acting as project coordinators through protected routes.
- Team-member invitation blocks existing unverified targets and records `coordination.team_invitation_blocked_unverified`.
- AI issues are advisory records. Compliance/professional conclusions require human review routes and verified human sign-off where applicable.
- Firestore browser rules keep `project_command_views` server-owned: browser reads are limited to the viewer's own projection when they can read the referenced project; browser writes/deletes are denied.
- Deletes for operational collections should remain denied; use status transitions, superseding records, or revision records instead.

## Known alignment gaps and follow-ups

- The command centre projection is rebuilt on read. If high-frequency dashboard polling grows, add cache invalidation or event-driven refresh instead of increasing unaudited polling.
- `project_command_views` schema notes expect `viewerUserId`/`updatedAt`; the current route stores `viewer.userId` and `generatedAt`. Keep docs, rules, indexes, and route fields aligned in the next static alignment pass.
- Stage history is stored inline on `projects/{projectId}`. If the product requires an append-only `project_stage_history` collection, add a migration/dual-write plan.
- Dedicated frontend dashboard modules should consume the projection and avoid recomputing authorization-sensitive counts client-side.
