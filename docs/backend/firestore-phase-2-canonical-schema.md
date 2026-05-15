# Firestore Phase 2 Canonical Schema

This note records the canonical Firestore collections used by the Phase 2 profile, brief, marketplace, proposal, and appointment service modules. Trusted API routes and Admin SDK jobs may perform writes that browser security rules intentionally deny.

## Collections

| Collection | Purpose | Browser access posture | Indexed query shape |
| --- | --- | --- | --- |
| `role_profiles/{userId}` | Role-specific private profile details used to project safe directory records. | Authenticated owner/admin read. Owner create/update only when identity and trust fields are not self-asserted. | `role`, `updatedAt desc` |
| `client_briefs/{briefId}` | Guided client-friendly intake record with advisory interpretation used before professional technical scope finalization. | Client/admin read. Client create through trusted API; assignment/finalization require verified BEP/admin server gates. Delete denied. | `clientId`, `status`, `updatedAt desc`; `assignedBepId`, `status` |
| `project_briefs/{briefId}` | Client-owned durable project brief produced by technical brief intake. | Client/admin read. Client create/update with immutable owner fields. Delete denied. | `clientId`, `status`, `updatedAt desc` |
| `project_briefs/{briefId}/attachments/{attachmentId}` | Evidence metadata for brief attachments stored outside Firestore and listed through brief owner/assignee gated reads. | Brief owner/admin read. Client-owned create through trusted API. Update/delete denied. | `createdAt desc`; parent `briefId` gate |
| `project_briefs/{briefId}/interpretations/{interpretationId}` | Advisory AI/human brief interpretation outputs listed through brief owner/assignee gated reads. | Brief owner/assigned BEP/admin read. Browser writes denied. | `status`, `updatedAt desc`; parent `briefId` gate |
| `marketplace_opportunities/{opportunityId}` | Published marketplace opportunity generated from a publishable brief. | Owner/admin read, published opportunities readable by architect/BEP roles. Browser writes denied. | `status`, `updatedAt desc` |
| `proposals/{proposalId}` | Human-reviewed BEP proposal records. | Client/professional/admin read. Architect/BEP can submit own proposal with `humanReviewRequired`. Delete denied. | `opportunityId`, `status`, `updatedAt desc`; `professionalId`, `updatedAt desc` |
| `proposal_comparisons/{comparisonId}` | Advisory-only proposal comparison artifacts. | Client/admin read. Browser writes denied to prevent automatic appointment. | `briefId`, `updatedAt desc` |
| `appointments/{appointmentId}` | Client-confirmed professional appointment records with legal/human acceptance gates. | Client/professional/admin read. Browser writes denied. | `clientId`, `status`, `updatedAt desc` |
| `project_stage_history/{historyId}` | Immutable project-stage audit history linked to appointment/project initiation. | Project participants read. Managed project actors may append immutable entries. Update/delete denied. | `projectId`, `createdAt desc` |

## Canonical read/list endpoint mapping

Trusted API routes use the Admin SDK but must still mirror the browser access posture before returning documents. The following Phase 2 read/list mappings are canonical for marketplace, proposal, and brief views.

| API route | Allowed readers | Firestore reads | Required index/query shape | Returned scope |
| --- | --- | --- | --- | --- |
| `GET /api/marketplace/opportunities` as client | authenticated client owner | `marketplace_opportunities` | `clientId == <callerUid>` with bounded limit 50 | caller-owned opportunities only |
| `GET /api/marketplace/opportunities` as BEP | authenticated BEP with active `bep`/`SACAP` verification | `user_verifications`, `marketplace_opportunities` | active verification by `userId`, `subjectType`, `statutoryBody`, `status`; opportunities by `status == published` with bounded limit 50 | published opportunities with `advisoryMatchingOnly: true` |
| `GET /api/marketplace/opportunities` as admin | admin | `marketplace_opportunities` | `status == published` with bounded limit 50 | published opportunities for operational review |
| `GET /api/proposals/{proposalId}/appointment-readiness` | proposal client owner or admin | `proposals/{proposalId}`, `project_briefs/{briefId}`, `user_verifications` | direct document reads; active professional verification by `userId`, `subjectType`, `statutoryBody`, `status` | readiness booleans and blockers only, with all legal side-effect flags false |
| client/project brief list views | brief owner, assigned verified BEP, or admin | `client_briefs`, `project_briefs`, `project_briefs/{briefId}/attachments`, `project_briefs/{briefId}/interpretations` | `clientId`, `status`, `updatedAt desc`; `assignedBepId`, `status`; nested `createdAt desc`/`updatedAt desc` after parent gate | brief, evidence metadata, and advisory interpretation details scoped to owner/assignee |

## Read/list access gates

- **Owner gates:** client brief, project brief, and client-owned marketplace list reads must derive owner scope from the authenticated UID, never from a caller-supplied `clientId` query parameter.
- **Verified BEP gates:** BEP marketplace reads require active SACAP verification before published opportunities are returned. Failed verification should return a 403 verification error rather than a partial list.
- **Assigned BEP gates:** nested brief evidence and interpretation reads must first prove the caller is the owner, the assigned verified BEP, or an admin.
- **Admin gates:** admins may perform operational reads but the response should preserve advisory/legal flags so admin dashboards do not imply automatic appointment.
- **Safe-read contract:** read/list endpoints must not write appointments, contracts, signatures, payments, provider actions, or legal acceptance records.

## Canonical document examples

### `project_briefs/{briefId}`

```json
{
  "id": "brief-1",
  "clientId": "client-1",
  "createdBy": "client-1",
  "title": "Residential alteration",
  "description": "Need plans for additions",
  "category": "Residential",
  "location": "Cape Town",
  "requirements": ["survey", "concept design"],
  "status": "published",
  "marketplaceOpportunityId": "brief-1",
  "updatedAt": "2026-05-15T12:00:00.000Z"
}
```

### `marketplace_opportunities/{opportunityId}`

```json
{
  "id": "brief-1",
  "briefId": "brief-1",
  "clientId": "client-1",
  "title": "Residential alteration",
  "description": "Need plans for additions",
  "category": "Residential",
  "location": "Cape Town",
  "status": "published",
  "advisoryMatchingOnly": true,
  "createdAt": "2026-05-15T12:00:00.000Z",
  "updatedAt": "2026-05-15T12:00:00.000Z"
}
```

### `proposals/{proposalId}`

```json
{
  "id": "proposal-1",
  "opportunityId": "brief-1",
  "briefId": "brief-1",
  "clientId": "client-1",
  "professionalId": "architect-1",
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "feeAmount": 125000,
  "scopeSummary": "Stages 1 to 4",
  "status": "submitted",
  "humanReviewRequired": true,
  "advisoryOnly": true,
  "autoAppointment": false,
  "updatedAt": "2026-05-15T12:10:00.000Z"
}
```

### Readiness response projection

`GET /api/proposals/proposal-1/appointment-readiness` reads proposal, brief, and verification records, but returns a projection rather than a persisted document:

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

## Alignment notes

- `role_profiles` intentionally blocks client-side `verified`, `verificationStatus`, `trustScore`, and `rating` assertions. Directory/public trust projection must come from trusted server logic.
- `project_briefs/{briefId}/interpretations`, `proposal_comparisons`, and `appointments` remain server-owned for writes because they represent AI advisory outputs, comparison artifacts, or legally sensitive appointment state.
- `client_briefs` and nested `project_briefs` read/list routes must apply owner, assigned BEP, or admin gates before exposing evidence uploads or advisory interpretation details.
- `marketplace_opportunities` are generated from validated/publishable `project_briefs`; browser clients do not create or mutate opportunities directly.
- `proposals` require human review metadata and do not grant automatic appointment. Appointment creation must recheck verification and legal acceptance preconditions in trusted service code.
- `GET /api/marketplace/opportunities` and `GET /api/proposals/{proposalId}/appointment-readiness` are safe reads. They may expose advisory matching/readiness state but must leave legal and payment side effects to explicit human-confirmed workflows.
