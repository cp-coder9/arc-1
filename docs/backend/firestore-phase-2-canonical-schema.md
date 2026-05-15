# Firestore Phase 2 Canonical Schema

This note records the canonical Firestore collections used by the Phase 2 profile, brief, marketplace, proposal, and appointment service modules. Trusted API routes and Admin SDK jobs may perform writes that browser security rules intentionally deny.

## Collections

| Collection | Purpose | Browser access posture | Indexed query shape |
| --- | --- | --- | --- |
| `role_profiles/{userId}` | Role-specific private profile details used to project safe directory records. | Authenticated owner/admin read. Owner create/update only when identity and trust fields are not self-asserted. | `role`, `updatedAt desc` |
| `project_briefs/{briefId}` | Client-owned durable project brief produced by technical brief intake. | Client/admin read. Client create/update with immutable owner fields. Delete denied. | `clientId`, `status`, `updatedAt desc` |
| `project_attachments/{attachmentId}` | Evidence metadata for brief attachments stored outside Firestore. | Client/admin read. Client-owned create. Update/delete denied. | `briefId`, `createdAt desc` |
| `brief_interpretations/{interpretationId}` | Advisory AI/human brief interpretation outputs. | Client/admin read. Browser writes denied. | `briefId`, `status`, `updatedAt desc` |
| `marketplace_opportunities/{opportunityId}` | Published marketplace opportunity generated from a publishable brief. | Owner/admin read, published opportunities readable by architect/BEP roles. Browser writes denied. | `status`, `updatedAt desc` |
| `proposals/{proposalId}` | Human-reviewed BEP proposal records. | Client/professional/admin read. Architect/BEP can submit own proposal with `humanReviewRequired`. Delete denied. | `opportunityId`, `status`, `updatedAt desc`; `professionalId`, `updatedAt desc` |
| `proposal_comparisons/{comparisonId}` | Advisory-only proposal comparison artifacts. | Client/admin read. Browser writes denied to prevent automatic appointment. | `briefId`, `updatedAt desc` |
| `appointments/{appointmentId}` | Client-confirmed professional appointment records with legal/human acceptance gates. | Client/professional/admin read. Browser writes denied. | `clientId`, `status`, `updatedAt desc` |
| `project_stage_history/{historyId}` | Immutable project-stage audit history linked to appointment/project initiation. | Project participants read. Managed project actors may append immutable entries. Update/delete denied. | `projectId`, `createdAt desc` |

## Alignment notes

- `role_profiles` intentionally blocks client-side `verified`, `verificationStatus`, `trustScore`, and `rating` assertions. Directory/public trust projection must come from trusted server logic.
- `brief_interpretations`, `proposal_comparisons`, and `appointments` remain server-owned for writes because they represent AI advisory outputs, comparison artifacts, or legally sensitive appointment state.
- `marketplace_opportunities` are generated from validated/publishable `project_briefs`; browser clients do not create or mutate opportunities directly.
- `proposals` require human review metadata and do not grant automatic appointment. Appointment creation must recheck verification and legal acceptance preconditions in trusted service code.
