# Backend API Reference

This reference covers production API routes implemented in recent backend commits for the project command centre, workflow write APIs, municipal tracking, resource centre and drawing checklist workflows, AI governance, directory invitations, and work packages.

Base path is the Express API router mount, typically `/api`. All state-changing routes are protected by the same-origin guard when an `Origin` header is present and by the global API rate limiter.

## Authentication and common behaviour

- **Authentication:** use `Authorization: Bearer <Firebase ID token>` for user requests. Agent service requests may use `api-key` or `x-agent-key`, matched against `AGENT_API_KEY`, and are treated as admin.
- **Audit collection:** all documented routes write immutable-style audit entries to `audit_logs` through `recordAuditEvent` / `buildAuditEvent`.
- **Errors:** responses use JSON `{ "error": string }`; some authorization failures include `verificationRequired` metadata.
- **Human blockers:** AI, project coordination, municipal, and sign-off APIs intentionally block when a verified professional, admin, client, or assigned human actor is required.

## Role and verification gates

| Gate | Roles allowed | Additional verification / membership |
| --- | --- | --- |
| Directory search/invite | client, bep, contractor, admin, scoped by target-role matrix | Existing invite targets must have active verification unless it is an onboarding invite. |
| Project coordination | admin, lead BEP, active project team member | BEP coordinators require active SACAP verification. |
| Project lead | admin, project lead BEP | Used for freelancer work package management. |
| Verified freelancer | freelancer | Active freelancer verification is required. |
| Resource centre | admin, verified BEP, verified freelancer | BEP requires SACAP; freelancer requires active freelancer verification. |
| AI review resolution | admin, BEP/compliance reviewer per queue item logic | Human sign-off domains enforce human actor role and verification rules. |

## Directory APIs

Deterministic request/response examples for profile projection, directory search, and admin verification review routes are maintained in `docs/backend/profile-directory-verification-api-contract-examples.md`.

### Route alias: `/api/directory/search`

When this router is mounted at `/api`, the canonical route alias is also exposed as `GET /api/directory/search` for clients generated from the platform API namespace. It delegates to the same verified directory search handler as `GET /directory/search`, writes the same `directory.search` audit event, and returns the same `results` payload.

### `GET /directory/search`

Searches `directory_profiles` for visible users eligible for the caller to engage.

- **Auth:** required.
- **Access:** target role scope is derived from caller role: clients can search BEPs/contractors; BEPs can search BEPs/contractors/freelancers; contractors can search subcontractors/suppliers/BEPs; admins can search all supported target roles.
- **Query:** `q`, `role`, `region`, `discipline`, `trade`, `verificationStatus=verified|unverified`, `limit` up to 50.
- **Durable reads:** `directory_profiles`, `user_verifications`.
- **Audit action:** `directory.search`.
- **Human blockers:** invitations should only proceed to verified existing profiles; unverified results are returned with `canInvite: false`.

### `POST /directory/invitations`

Creates a role-scoped invitation with periodic reminder metadata.

- **Auth:** required.
- **Access matrix:**
  - client to BEP: `quote`, `project`; client to contractor: `quote`, `tender`, `project`.
  - BEP to BEP: `project`; BEP to contractor: `quote`, `tender`, `project`; BEP to freelancer: `task`.
  - contractor to subcontractor: `quote`, `tender`, `package`; contractor to supplier: `quote`, `package`; contractor to BEP: `quote`, `project`.
  - admin can invite all supported target roles for all supported actions.
- **Body:** `targetUserId` or `targetEmail`, `targetRole`, `action`, optional `context` containing `jobId`, `projectId`, `packageId`, `taskId`, `tenderId`, `quoteRequestId`, `message`.
- **Durable writes:** `directory_invitations`; notification records for existing targets.
- **Audit actions:** `directory.invitation_created`; `directory.invitation_blocked_unverified` when an existing target lacks required verification.
- **Human blockers:** existing target users must be verified before invitation. Email-only onboarding invites stay in `pending_registration` and require later registration and acceptance.

### `POST /directory/invitations/:invitationId/respond`

Accepts or declines an invitation.

- **Auth:** required target user.
- **Body:** response/decision fields as implemented by route.
- **Durable writes:** updates `directory_invitations`; may add notifications.
- **Audit action:** invitation response audit entries.
- **Human blockers:** acceptance requires the invited human user and active verification where `verificationRequiredOnAcceptance` is true.

## Project command centre

### `GET /projects/:projectId/command-centre`

Builds and persists the caller's project command-centre projection.

- **Auth:** required.
- **Access:** project coordinator gate: admin, lead BEP, or active project team member. BEP callers require active SACAP verification.
- **Durable reads:** `projects/{projectId}`, subcollections `tasks`, `approvals`, `documents`, `message_threads`, `ai_issues`.
- **Durable writes:** `project_command_views/{projectId}_{viewerUid}`.
- **Response:** `commandCentre` with viewer role, stage history, team summary, and panel counts for tasks, approvals, documents, messages, and unresolved AI issues.
- **Audit action:** `project.command_centre_viewed`.
- **Human blockers:** non-team users are denied; unverified BEP coordinators receive a `verificationRequired` block.

## Project workflow write APIs

These endpoints operate under the project coordination gate unless noted.

| Method and path | Purpose | Durable collection(s) | Audit action |
| --- | --- | --- | --- |
| `POST /projects/:projectId/documents` | Create project document and initial `v1` version. | `projects/{projectId}/documents`, `documents/{documentId}/versions` | `document.created` |
| `POST /projects/:projectId/document-versions` | Add a new document revision and update current revision metadata. | `projects/{projectId}/documents/{documentId}/versions` | `document.version_created` |
| `POST /projects/:projectId/tasks` | Create coordination task. | `projects/{projectId}/tasks` | `task.created` |
| `POST /projects/:projectId/approvals` | Request project approval. | `projects/{projectId}/approvals` | `approval.requested` |
| `POST /projects/:projectId/message-threads` | Create a project message thread. | `projects/{projectId}/message_threads` | `message.thread_created` |
| `POST /projects/:projectId/messages` | Add message to a thread. | `projects/{projectId}/message_threads/{threadId}/messages` and thread metadata | `message.created` |
| `POST /projects/:projectId/transmittals` | Create a transmittal for documents or revisions. | `projects/{projectId}/transmittals` | `transmittal.issued` |
| `POST /projects/:projectId/ai-issues` | Record AI/compliance issue for project review. | `projects/{projectId}/ai_issues` | `ai.issue_created` |
| `POST /projects/:projectId/ai-issues/:issueId/resolve` | Mark AI issue resolved/closed. | `projects/{projectId}/ai_issues/{issueId}` | `ai.issue_resolved` |
| `POST /projects/:projectId/ai-issues/:issueId/review` | Record human review result on AI issue. | `projects/{projectId}/ai_issues/{issueId}` | `ai.issue_reviewed` |
| `POST /projects/:projectId/team-members` | Invite/add active project team member. | `projects/{projectId}` team member array, `notifications` | `coordination.team_member_invited`; blocked unverified targets use `coordination.team_invitation_blocked_unverified` |
| `POST /projects/:projectId/coordination/items` | Create coordination item such as RFI, dependency, deadline, compliance status, or municipal readiness. | `projects/{projectId}/coordination_items` | `coordination.{itemType}_created` |

- **Human blockers:** BEP coordination requires verified SACAP status. Approval, review, and AI issue endpoints are records of human project coordination and do not certify compliance by AI.

## Project brief and client brief APIs

These Phase 2 brief routes are the canonical client intake/read surface for project brief workflows. They complement the marketplace/proposal routes and keep AI output advisory until a verified human actor reviews or finalizes it.

### `POST /project-briefs`

Creates a client-owned durable project brief from structured intake data.

- **Auth:** client or admin acting for the client; non-client BEP/contractor callers are blocked.
- **Body:** `title`, `description`, optional `category`, `location`, `budgetRange`, `requirements`, and shallow `propertyDetails`.
- **Durable writes:** `project_briefs/{briefId}`.
- **Response:** `{ brief }` with sanitized strings/lists, immutable owner fields, `status: submitted`, and timestamps.
- **Audit action:** `project_brief.created` with `canonicalRoute: true` metadata.
- **Human blockers:** project brief creation is client intent capture only. It does not publish an opportunity, appoint a professional, or certify scope.

### `POST /project-briefs/:briefId/attachments`

Adds evidence metadata for a project brief attachment.

- **Auth:** brief owner/client or admin; unrelated users are denied.
- **Body:** `fileName`, HTTPS/blob `fileUrl`, optional `evidenceType` and metadata.
- **Durable writes:** `project_briefs/{briefId}/attachments`.
- **Response:** `{ attachment }` with storage provider metadata and owner fields.
- **Audit action:** `project_brief.attachment_added` with `canonicalRoute: true` metadata.
- **Human blockers:** attachments are evidence inputs and require later professional review before they can support compliance or municipal submissions.

### `POST /project-briefs/:briefId/interpretations`

Persists an advisory-only brief interpretation linked to one or more attachments.

- **Auth:** brief owner/client, assigned BEP, or admin depending on brief assignment state.
- **Body:** `summary`, optional `confidence`, `sourceAttachmentIds`, `likelyRequiredProfessionals`, `risks`, and limitations.
- **Durable writes:** `project_briefs/{briefId}/interpretations`.
- **Response:** `{ interpretation }` with `advisoryOnly: true`, clamped confidence, bounded lists, and `status: ready_for_review`.
- **Audit action:** `project_brief.interpretation_added` in the `ai` category.
- **Human blockers:** interpretations cannot finalize a technical brief or professional appointment without a verified human review step.

### `POST /client-briefs`

Creates a guided client brief and immediate advisory interpretation for client-friendly intake.

- **Auth:** client only, with admin support through trusted operational flows where implemented.
- **Body:** `selectedOption`, `projectGoal`, site/context fields, urgency/budget comfort fields, `supportNeeds`, and `evidenceUploads`.
- **Durable writes:** `client_briefs/{briefId}`.
- **Response:** `{ brief }` with sanitized support needs/evidence uploads, `status: ai_interpreted`, and an advisory interpretation summary/risk flags.
- **Audit action:** `brief.client_created`.
- **Human blockers:** AI interpretation is triage only. A verified BEP must be assigned and must finalize technical scope before proposal/appointment workflows rely on it.

### Client brief assignment/finalization reads and writes

Recent route tests cover the guided brief progression after `POST /client-briefs`: verified BEPs can be assigned, only assigned verified BEPs can finalize technical briefs, and downstream read/list views must preserve the owner/assignee gates. These routes read `client_briefs`, related `project_briefs`, and projected marketplace/proposal state rather than allowing unauthenticated list access.

## Phase 2 marketplace, proposal, and project brief read/list APIs

These read/list routes are the canonical Phase 2 surface for client briefs becoming marketplace opportunities, proposals, and appointment-readiness checks. They are safe reads: they do not create appointments, contracts, signatures, payments, or provider-side legal actions.

### `GET /marketplace/opportunities`

Lists canonical marketplace opportunities from `marketplace_opportunities`.

- **Auth:** required.
- **Access:**
  - clients see only opportunities where `clientId` is their UID.
  - verified BEPs see published opportunities and must have active `bep`/`SACAP` verification.
  - admins see published opportunities.
  - other roles are denied.
- **Query:** current implementation returns up to 50 records. Filtering is role-gated by server-side Firestore predicates, not by client-supplied owner IDs.
- **Durable reads:** `marketplace_opportunities`; BEP callers also read `user_verifications` through `getActiveUserVerification`.
- **Indexed query shapes:** `marketplace_opportunities where clientId == <uid> limit 50`; `marketplace_opportunities where status == published limit 50`.
- **Response:** `{ opportunities, verificationId?, advisoryOnly: true }`; each opportunity is returned with `advisoryMatchingOnly: true`.
- **Audit action:** none for this canonical Phase 2 read route; it is a safe read and relies on auth/access enforcement.
- **Human blockers:** unverified BEPs receive a verification block. Returned matching is advisory only and does not appoint or recommend a professional as a final decision.

### `GET /proposals/:proposalId/appointment-readiness`

Checks whether a submitted proposal currently satisfies appointment preconditions without mutating legal state.

- **Auth:** required.
- **Access:** client owner of the proposal or admin. The professional who submitted the proposal cannot use this route unless also an admin.
- **Path params:** `proposalId`.
- **Durable reads:** `proposals/{proposalId}`, `project_briefs/{briefId}`, and active `user_verifications` for the proposal `professionalId` as `bep`/`SACAP`.
- **Indexed query shape:** direct document reads by proposal ID and brief ID; verification lookup uses the active-user-verification query shape documented in the Firestore schema notes.
- **Response:** returns `ready: true` with `requiredHumanActions` when all preconditions pass, otherwise `ready: false` with `blocker` and `blockerStatus`.
- **Audit action:** none; this route is intentionally read-only.
- **Human blockers:** even a ready response sets `createsAppointment`, `createsContract`, `createsSignature`, and `createsPayment` to `false`. Client and professional contract acceptance must happen through explicit human/legal workflows.

### Related Phase 2 read/list posture

| Route | Reader gate | Primary reads | Notes |
| --- | --- | --- | --- |
| `GET /marketplace/opportunities` | owner client, verified BEP, admin | `marketplace_opportunities`, `user_verifications` for BEPs | Canonical published opportunity list; advisory matching only. |
| `GET /proposals/:proposalId/appointment-readiness` | proposal client owner, admin | `proposals`, `project_briefs`, `user_verifications` | Safe preflight only; no appointment, contract, signature, or payment side effects. |
| client/project brief list reads | brief owner, assigned verified BEP, admin | `client_briefs`, `project_briefs`, nested attachments/interpretations | Must preserve owner/assignee gates before exposing evidence or advisory interpretation detail. |

## AI governance APIs

### `POST /ai/action-logs`

Persists an AI action log and optionally creates a review queue item.

- **Auth:** required.
- **Body:** `projectId`, `actionKind`, `actorUid`, `target`, `prompt` metadata, `sourceReferences`, `confidence`, `outputSummary`, optional `flags`.
- **Supported action kinds:** `draft_technical_brief`, `autofill_compliance_form`, `drawing_check`, `municipal_status_summary`, `checklist_recommendation`, `other_advisory`.
- **Durable writes:** `ai_action_logs`; `ai_review_queue` when confidence is below `0.72` or flags are present.
- **Audit action:** `ai.action_logged_requires_review` or `ai.action_logged_advisory`.
- **Human blockers:** flagged or low-confidence outputs are `requires_review`; legal/compliance risk is critical and assigned to admin, otherwise review defaults to BEP.

### `POST /admin/ai-review/:itemId/resolve`

Resolves an AI review queue item and, where supplied, records human sign-off.

- **Auth:** required, admin/reviewer context.
- **Body:** decision/reason plus optional human sign-off payload with domain, declaration, and target.
- **Durable writes:** `ai_review_queue/{itemId}`, `ai_action_logs/{actionLogId}`, optional `human_signoffs`.
- **Audit actions:** `ai.review_resolved` or `ai.review_resolved_with_human_signoff`.
- **Human blockers:** AI/system actors cannot sign. Compliance declarations, professional certificates, and municipal submissions require a verified BEP/architect or admin. Escrow release sign-off requires client or admin.


## Canonical API examples

Examples use the `/api` mount and omit unrelated headers. IDs and timestamps are illustrative. Additional deterministic read-only Phase 2 examples for `GET /api/project-briefs`, `GET /api/project-briefs/:briefId`, `GET /api/marketplace/opportunities/:id`, and `GET /api/proposals/:proposalId` are maintained in `docs/backend/phase-2-read-api-contract-examples.md`.

### Project briefs

Create a project brief:

```http
POST /api/project-briefs
Authorization: Bearer <client-id-token>
Content-Type: application/json

{
  "title": "Residential alteration",
  "description": "Need plans for additions",
  "category": "Residential",
  "location": "Cape Town",
  "budgetRange": { "min": 50000, "max": 100000 },
  "requirements": ["survey", "concept design"],
  "propertyDetails": { "erf": "123" }
}
```

```json
{
  "brief": {
    "id": "brief-1",
    "clientId": "client-1",
    "createdBy": "client-1",
    "title": "Residential alteration",
    "description": "Need plans for additions",
    "requirements": ["survey", "concept design"],
    "status": "submitted"
  }
}
```

Add attachment metadata and an advisory interpretation:

```http
POST /api/project-briefs/brief-1/attachments
Authorization: Bearer <client-id-token>
Content-Type: application/json

{
  "fileName": "survey.pdf",
  "fileUrl": "https://files.public.blob.vercel-storage.com/survey.pdf",
  "evidenceType": "survey"
}
```

```json
{
  "attachment": {
    "id": "attachment-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "uploadedBy": "client-1",
    "evidenceType": "survey",
    "storageProvider": "vercel_blob"
  }
}
```

```http
POST /api/project-briefs/brief-1/interpretations
Authorization: Bearer <assigned-bep-id-token>
Content-Type: application/json

{
  "summary": "Likely needs an architect and municipal submission.",
  "confidence": 0.75,
  "sourceAttachmentIds": ["attachment-1"]
}
```

```json
{
  "interpretation": {
    "id": "interpretation-1",
    "briefId": "brief-1",
    "advisoryOnly": true,
    "confidence": 0.75,
    "sourceAttachmentIds": ["attachment-1"],
    "status": "ready_for_review"
  }
}
```

### Marketplace opportunities and proposals

Publish a client brief as a marketplace opportunity:

```http
POST /api/marketplace/opportunities
Authorization: Bearer <client-id-token>
Content-Type: application/json

{ "briefId": "brief-1" }
```

```json
{
  "opportunity": {
    "id": "brief-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "status": "published",
    "advisoryMatchingOnly": true
  }
}
```

List opportunities as a verified BEP and submit a proposal:

```http
GET /api/marketplace/opportunities
Authorization: Bearer <verified-bep-id-token>
```

```json
{
  "opportunities": [
    {
      "id": "brief-1",
      "title": "Residential alteration",
      "status": "published",
      "advisoryMatchingOnly": true
    }
  ],
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "advisoryOnly": true
}
```

List a client's own published opportunities:

```http
GET /api/marketplace/opportunities
Authorization: Bearer <client-id-token>
```

```json
{
  "opportunities": [
    {
      "id": "brief-1",
      "briefId": "brief-1",
      "clientId": "client-1",
      "title": "Residential alteration",
      "status": "published",
      "advisoryMatchingOnly": true
    }
  ],
  "advisoryOnly": true
}
```

Unverified BEP list attempt:

```json
{
  "error": "Verified participant is required for marketplace opportunity access"
}
```

```http
POST /api/proposals
Authorization: Bearer <verified-bep-id-token>
Content-Type: application/json

{
  "opportunityId": "brief-1",
  "feeAmount": 125000,
  "scopeSummary": "Stages 1 to 4",
  "exclusions": ["Council fees"]
}
```

```json
{
  "proposal": {
    "id": "proposal-1",
    "opportunityId": "brief-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "professionalId": "architect-1",
    "status": "submitted",
    "humanReviewRequired": true,
    "advisoryOnly": true,
    "autoAppointment": false
  }
}
```

### Appointment readiness

Read-only readiness checks never create contracts, signatures, payments, appointments, or audit entries.

```http
GET /api/proposals/proposal-1/appointment-readiness
Authorization: Bearer <client-id-token>
```

Ready response:

```json
{
  "ready": true,
  "proposalId": "proposal-1",
  "briefId": "brief-1",
  "professionalId": "architect-1",
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "requiredHumanActions": ["client_contract_acceptance", "professional_contract_acceptance"],
  "createsAppointment": false,
  "createsContract": false,
  "createsSignature": false,
  "createsPayment": false
}
```

Blocked response:

```json
{
  "ready": false,
  "proposalId": "proposal-1",
  "briefId": "brief-1",
  "professionalId": "architect-1",
  "blocker": "A professional has already been appointed for this brief",
  "blockerStatus": 409,
  "createsAppointment": false,
  "createsContract": false,
  "createsSignature": false,
  "createsPayment": false
}
```

### AI governance action logs and review

Log an AI action. Low confidence or flagged outputs create a human review queue item.

```http
POST /api/ai/action-logs
Authorization: Bearer <project-participant-id-token>
Content-Type: application/json

{
  "projectId": "project-1",
  "actionKind": "drawing_check",
  "target": { "type": "drawing_check_run", "id": "run-1" },
  "prompt": { "provider": "gemini", "model": "gemini-2.0-flash", "promptVersion": "drawing-check-v1" },
  "sourceReferences": [{ "type": "drawing", "id": "drawing-1", "excerptHash": "sha256:abc" }],
  "confidence": 0.41,
  "outputSummary": "Possible compliance risk. Advisory only.",
  "flags": ["legal_or_compliance_risk"]
}
```

```json
{
  "actionLog": {
    "id": "ai-log-1",
    "projectId": "project-1",
    "actorUid": "client-1",
    "status": "requires_review",
    "requiresHumanConfirmation": true,
    "immutable": true
  },
  "reviewQueueItem": {
    "id": "queue-1",
    "projectId": "project-1",
    "priority": "critical",
    "assignedRole": "admin",
    "status": "open"
  }
}
```

Resolve the review with human sign-off:

```http
POST /api/admin/ai-review/queue-1/resolve
Authorization: Bearer <admin-id-token>
Content-Type: application/json

{
  "decision": "resolved",
  "reason": "Admin reviewed evidence and recorded responsible human confirmation.",
  "humanSignOff": {
    "domain": "municipal_submission",
    "target": { "type": "municipal_submission", "id": "submission-1", "projectId": "project-1" },
    "declaration": "I reviewed the municipal package and approve this governance resolution."
  }
}
```

```json
{
  "reviewQueueItem": {
    "id": "queue-1",
    "status": "resolved",
    "resolvedBy": "admin-1",
    "humanSignOffRecorded": true
  },
  "actionLog": {
    "id": "ai-log-1",
    "status": "human_confirmed",
    "reviewedBy": "admin-1",
    "reviewDecision": "resolved"
  },
  "humanSignOff": {
    "actorUid": "admin-1",
    "actorRole": "admin",
    "humanConfirmed": true,
    "aiMayNotSign": true,
    "immutable": true
  }
}
```

## Work package APIs

### `POST /projects/:projectId/work-packages`

Creates a freelancer work package.

- **Auth:** project lead gate, admin or lead BEP.
- **Body:** `title`, optional `description`, `requirements`, `budget`, `deadline`, `invitedFreelancerIds`.
- **Durable writes:** `projects/{projectId}/work_packages`; notifications for invited verified freelancers.
- **Audit action:** `freelancer.work_package_created`.
- **Human blockers:** only project lead/admin can create; unverified invited freelancer IDs are skipped for notification.

### `POST /projects/:projectId/work-packages/:packageId/applications`

Verified freelancer applies to an open work package.

- **Auth:** verified freelancer only.
- **Body:** `proposal` required, optional `proposedFee`.
- **Durable writes:** `projects/{projectId}/work_packages/{packageId}/applications/{freelancerUid}`.
- **Audit action:** `freelancer.work_package_application_submitted`.
- **Human blockers:** route blocks non-freelancers and freelancers without active verification.

### `POST /projects/:projectId/work-packages/:packageId/applications/:applicationId/assign`

Assigns an application to a freelancer and marks the package pending signature.

- **Auth:** project lead gate.
- **Durable writes:** work package status, accepted application status, notification for freelancer.
- **Audit action:** `freelancer.work_package_assigned`.
- **Human blockers:** only open packages can be assigned; agreement still requires human signature outside this route.

### `POST /projects/:projectId/work-packages/:packageId/submissions`

Assigned freelancer submits deliverables.

- **Auth:** verified freelancer who is assigned to the package.
- **Body:** deliverable URLs/evidence as implemented by route.
- **Durable writes:** `projects/{projectId}/work_packages/{packageId}/submissions`; work package status.
- **Audit action:** `freelancer.work_package_submitted`.
- **Human blockers:** only assigned freelancer can submit.

### `POST /projects/:projectId/work-packages/:packageId/submissions/:submissionId/review`

Project lead/admin reviews deliverables.

- **Auth:** project lead gate.
- **Body:** decision/status and notes.
- **Durable writes:** submission review fields and work package status.
- **Audit action:** `freelancer.work_package_submission_approved` or `freelancer.work_package_submission_rejected`, based on review decision.
- **Human blockers:** approval/rejection is a human project lead/admin decision.

## Resource centre and drawing checklist APIs

Deterministic request/response examples for resource centre and drawing checklist routes are maintained in `docs/backend/resource-checklist-api-contract-examples.md`.

### `POST /resources/centre`

Creates a resource centre item.

- **Auth:** admin, verified BEP, or verified freelancer.
- **Body:** `title` required; optional `resourceType`, `description`, `municipality`, `submissionType`, `discipline`, `url`, `contact`, `tags`, `checklistItems`, `visibility`.
- **Resource types:** `municipal_link`, `inspector_contact`, `fire_contact`, `drainage_roads_contact`, `submission_portal`, `zoning_portal`, `template`, `poa_template`, `checklist`.
- **Durable writes:** `resource_centre`.
- **Audit action:** `resource_centre.resource_created`.
- **Human blockers:** unverified BEPs/freelancers are blocked.

### `GET /resources/centre`

Lists published resource centre items and caller-owned/admin private items.

- **Auth:** admin, verified BEP, or verified freelancer.
- **Query:** `resourceType`, `municipality`, `discipline`.
- **Durable reads:** `resource_centre`.
- **Audit action:** `resource_centre.resources_viewed`.

### `POST /projects/:projectId/checklists/drawing`

Creates a municipal drawing checklist for a project.

- **Auth:** project coordinator gate.
- **Body:** `municipality` and `submissionType` required; optional `checklistType`, `stage`, `disciplines`, `responsibleParty`, linked drawing/submission/task IDs, `requirements`, `componentChecks`.
- **Durable writes:** `projects/{projectId}/drawing_checklists`.
- **Audit action:** `resource_centre.drawing_checklist_created`.
- **Human blockers:** checklist progress is a coordination tracker only; professional/municipal sign-off remains human.

### `POST /projects/:projectId/checklists/drawing/:checklistId/items/:itemId/status`

Updates one checklist item status.

- **Auth:** project coordinator gate.
- **Body:** `status` one of `not_started`, `in_progress`, `blocked`, `complete`, `not_applicable`; optional notes, assignee, linked drawings/tasks.
- **Durable writes:** checklist arrays, progress, and status history in `projects/{projectId}/drawing_checklists/{checklistId}`.
- **Audit action:** `resource_centre.drawing_checklist_item_updated`.

### `GET /projects/:projectId/checklists/drawing`

Lists drawing checklists for the project.

- **Auth:** project coordinator gate.
- **Query:** optional filters implemented by route.
- **Durable reads:** `projects/{projectId}/drawing_checklists`.
- **Audit action:** `resource_centre.drawing_checklists_viewed`.

## Municipal tracker APIs

### `POST /projects/:projectId/municipal/submissions`

Creates a project municipal submission tracker record.

- **Auth:** project coordinator gate.
- **Body:** municipality/submission metadata, submission references, responsible party, and evidence fields as implemented by route.
- **Durable writes:** `projects/{projectId}/municipal_submissions`.
- **Audit action:** `municipal.submission_created`.
- **Human blockers:** submission tracking does not replace municipal acceptance or registered professional sign-off.

### `POST /projects/:projectId/municipal/submissions/:submissionId/status`

Updates municipal submission status and history.

- **Auth:** project coordinator gate.
- **Body:** status, notes/evidence fields as implemented by route.
- **Durable writes:** `projects/{projectId}/municipal_submissions/{submissionId}`.
- **Audit action:** `municipal.status_updated`.
- **Human blockers:** any official status remains subject to municipal confirmation and human review.

### `GET /projects/:projectId/municipal/status`

Returns project-level municipal tracker summary.

- **Auth:** project coordinator gate.
- **Durable reads:** `projects/{projectId}/municipal_submissions`, related checklist/status fields.
- **Audit action:** `municipal.control_viewed` for admin/control queries, otherwise `municipal.insight_viewed`.

### Legacy/global municipal helpers

The router also exposes operational municipal routes used by existing tooling:

| Method and path | Purpose | Durable collections / services | Notes |
| --- | --- | --- | --- |
| `POST /track-municipality` | Track municipality status from supplied details. | municipal automation service | Requires auth and returns tracker result. |
| `POST /municipal/scrape` | Run municipal browser automation. | `municipalAutomation` | Human credentials/portal constraints may block automation. |
| `POST /municipal/credentials` | Store encrypted municipal portal credentials. | municipal settings/credentials collection | Sensitive credential handling; human consent required operationally. |
| `GET /municipal/settings` | Read municipal automation settings. | settings collection | Admin/operator route. |
| `POST /municipal/ocr` | OCR municipal invoice/receipt data. | OCR/shadow tracker services | AI/OCR output is advisory. |
| `GET /municipal/heatmap/:municipality` | Get municipal heatmap. | shadow tracker service | Aggregated operational insight. |
| `POST /municipal/shadow-track` | Detect municipal invoices/status shadows. | shadow tracker service | Advisory signal requiring human confirmation. |
| `POST /municipal/submissions` | Create legacy/global municipal submission. | municipal submissions collection | Coexists with project-scoped tracker. |
| `GET /municipal/submissions` | List legacy/global municipal submissions. | municipal submissions collection | Existing dashboard compatibility. |
| `POST /municipal/crowdsource` | Submit crowdsource municipal data. | crowdsource municipal collection | Requires human-entered evidence. |

## Durable collections summary

- `audit_logs`
- `directory_profiles`, `directory_invitations`, `user_verifications`
- `client_briefs`, `project_briefs` plus project brief `attachments` and `interpretations` subcollections
- `notifications`
- `projects`, including subcollections: `documents`, `documents/{id}/versions`, `tasks`, `approvals`, `message_threads`, `message_threads/{id}/messages`, `transmittals`, `ai_issues`, `work_packages`, `work_packages/{id}/applications`, `work_packages/{id}/submissions`, `drawing_checklists`, `municipal_submissions`, `coordination_items`
- `project_command_views`
- `ai_action_logs`, `ai_review_queue`, `human_signoffs`
- `resource_centre`
- Legacy/global municipal settings, credentials, submissions, crowdsource/shadow tracker collections used by the municipal helper routes

## Audit action summary

Key action names observed in the implemented routes include:

- `directory.search`, `directory.invitation_created`, `directory.invitation_blocked_unverified`
- `project.command_centre_viewed`, `task.created`, `coordination.{itemType}_created`, `coordination.team_member_invited`, `coordination.team_invitation_blocked_unverified`
- `document.created`, `document.version_created`, `transmittal.issued`
- `approval.requested`
- `message.thread_created`, `message.created`
- `ai.action_logged_requires_review`, `ai.action_logged_advisory`, `ai.issue_routed`, `ai.issue_resolved`, `ai.issue_resolution_{decision}`, `ai.review_resolved`, `ai.review_resolved_with_human_signoff`
- `freelancer.work_package_created`, `freelancer.work_package_application_submitted`, `freelancer.work_package_assigned`, `freelancer.work_package_submitted`, `freelancer.work_package_submission_{decision}`
- `resource_centre.resource_created`, `resource_centre.resources_viewed`, `resource_centre.drawing_checklist_created`, `resource_centre.drawing_checklist_item_updated`, `resource_centre.drawing_checklists_viewed`
- `municipal.submission_created`, `municipal.status_updated`, `municipal.control_viewed`, `municipal.insight_viewed`, plus legacy/global municipal helper audit events such as `municipal.credentials_saved`

## Known human blockers and operational limits

- AI outputs are advisory and cannot certify, approve, submit, or sign on behalf of a human.
- Municipal submission readiness still requires registered professional judgement, municipal portal acceptance, and jurisdiction-specific evidence.
- SACAP/CIDB/NHBRC/CIPC/freelancer verification is enforced before sensitive directory, coordination, resource, and work package operations.
- Work package assignment sets `agreementStatus: pending_signature`; contractual execution remains a separate human-signature step.
- Municipal browser automation may be blocked by portal MFA, CAPTCHA, downtime, expired credentials, or unsupported municipal portals.
