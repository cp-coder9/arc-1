# Guided brief to appointment workflow

Status: implemented backend workflow notes aligned to the current API router, phase reports, and `backend.html` dashboard intent. This document describes the durable production path from a client-friendly brief wizard through BEP technical refinement, appointment generation, and project initiation.

## Purpose and dashboard alignment

The `backend.html` reference separates the layperson-facing **Guided Brief Wizard** from the professional **BEP Technical Brief Editor** and the later appointment/project workflow. The current backend implements that split through `/api/client-briefs` routes and server-owned durable records.

The workflow intentionally keeps AI outputs advisory. A verified human professional must refine and finalize the technical brief before appointment, and the client or admin must explicitly generate the appointment package.

## Actor and verification gates

| Step | Actor | Gate |
| --- | --- | --- |
| Create guided brief | Client, or admin operationally | Authenticated user with normalized role `client`, unless admin |
| Read guided brief | Owner client, assigned BEP, or admin | `canReadClientBrief` authorization |
| Update guided brief | Owner client or admin | Blocked after technical finalization |
| Assign BEP | Owner client or admin | Target must be a `bep` user with active persisted SACAP/BEP verification |
| Draft/finalize technical brief | Assigned BEP or admin | Non-admin BEP verification is rechecked at edit time |
| Appoint BEP | Owner client or admin | Technical brief must be finalized; BEP must still be assigned and actively verified |

## API sequence

1. `POST /api/client-briefs`
   - Creates the guided intake record.
   - Requires a meaningful `projectGoal`.
   - Sanitizes and bounds text/list fields.
   - Accepts evidence uploads only when URLs use the platform-allowed Vercel Blob host.
   - Builds and persists an advisory interpretation.

2. `GET /api/client-briefs/:briefId`
   - Returns the client brief and linked technical brief when the caller is authorized.

3. `PUT /api/client-briefs/:briefId`
   - Lets the owner/admin update wizard answers before technical finalization.
   - Rebuilds the advisory interpretation.
   - Moves status back to `ai_interpreted` or `ready_for_bep` depending on assignment state.

4. `POST /api/client-briefs/:briefId/assign-bep`
   - Assigns a verified BEP to refine the brief.
   - Sends a notification to the assigned BEP.

5. `PUT /api/client-briefs/:briefId/technical-brief`
   - Lets the assigned verified BEP/admin create or update `technical_briefs/{briefId}`.
   - `finalize=true` or `status=finalized` requires required professionals and deliverables.
   - Finalized technical briefs are immutable in this slice until a future explicit revision workflow exists.

6. `POST /api/client-briefs/:briefId/appoint-bep`
   - Generates the appointment/project initiation package from the finalized technical brief.
   - Requires `professionalFee` in cents.
   - Blocks duplicate appointments for the same brief.

## Durable collections and records

| Collection / path | Purpose |
| --- | --- |
| `client_briefs/{briefId}` | Client-friendly intake, evidence upload metadata, advisory interpretation, assignment status, project/appointment back-links |
| `technical_briefs/{briefId}` | Professional scope, deliverables, exclusions, assumptions, missing information tasks, risks, downstream feed flags, finalization state |
| `user_verifications` | Active BEP verification lookup for assignment, technical editing, and appointment |
| `users/{bepId}` | BEP profile existence and role check |
| `notifications` | Brief assignment notification for the assigned BEP |
| `appointment_contracts/{projectId}` | Generated pending-acceptance appointment contract with scope, fees, milestones, verification evidence |
| `projects/{projectId}` | Project shell, project code, appointment stage, team members, initial milestones |
| `escrow/{projectId}` | Pending escrow account and milestone release schedule |
| `payments/{paymentId}` | Pending escrow deposit payment record |
| `invoices/{projectId_milestoneId}` | Draft milestone invoices generated at appointment |
| `audit_logs` | Immutable audit trail for brief and appointment actions |

## Audit actions

| Action | Trigger |
| --- | --- |
| `brief.client_created` | Guided brief created |
| `brief.client_updated` | Guided brief updated before finalization |
| `brief.bep_assigned` | Verified BEP assigned to the brief |
| `brief.technical_updated` | Technical brief saved as draft |
| `brief.technical_finalized` | Technical brief finalized |
| `contract.appointment_generated` | Appointment contract, project, escrow, payment, and invoices generated |

## Human blockers and non-automation rules

- AI interpretation is advisory only and must not certify compliance, quote professional fees, appoint a BEP, or replace professional judgement.
- A verified BEP must be explicitly assigned before technical refinement.
- BEP verification is checked at assignment, technical edit, and appointment time.
- A client/admin appointment action is required after technical finalization. The workflow does not auto-appoint from AI matching or BEP assignment.
- Generated appointment contracts remain `generated_pending_acceptance`; signature/acceptance workflow is still a separate future contract-builder/signature slice.
- Escrow payment redirect and capture remain in existing payment routes. This workflow creates the pending payment/escrow records needed for that step.

## Known alignment gaps and follow-ups

- Canonical plan names such as `project_briefs`, `project_attachments`, `brief_interpretations`, `appointments`, and `project_stage_history` are not the current durable collection names. Current implemented stores are `client_briefs`, `technical_briefs`, `appointment_contracts`, and `projects.stageHistory`.
- Direct Firestore browser rules for `client_briefs` and `technical_briefs` are intentionally narrow/unexpanded because access is through authenticated API routes in this slice.
- If finalized briefs need later changes, add an explicit technical brief revision workflow rather than mutating finalized records.
- Add contract acceptance/signature and idempotency-key hardening before relying on generated contracts as fully executed appointments.
