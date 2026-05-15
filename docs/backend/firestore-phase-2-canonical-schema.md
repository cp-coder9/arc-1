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

## Alignment notes

- `role_profiles` intentionally blocks client-side `verified`, `verificationStatus`, `trustScore`, and `rating` assertions. Directory/public trust projection must come from trusted server logic.
- `project_briefs/{briefId}/interpretations`, `proposal_comparisons`, and `appointments` remain server-owned for writes because they represent AI advisory outputs, comparison artifacts, or legally sensitive appointment state.
- `client_briefs` and nested `project_briefs` read/list routes must apply owner, assigned BEP, or admin gates before exposing evidence uploads or advisory interpretation details.
- `marketplace_opportunities` are generated from validated/publishable `project_briefs`; browser clients do not create or mutate opportunities directly.
- `proposals` require human review metadata and do not grant automatic appointment. Appointment creation must recheck verification and legal acceptance preconditions in trusted service code.
