# Phase 6 Report: Appointment Contract, Project Code, Milestones, Invoices, and Escrow

Date: 2026-05-15
Branch: `phase-2-verification-workflows`
Scope source: `Full_scope.md` section 12

## Implemented

### Appointment flow from finalized technical brief
- Added `POST /api/client-briefs/:briefId/appoint-bep`.
- The route creates the downstream project initiation package from an existing finalized technical brief.
- Only the client owner or an admin can appoint a BEP from the brief.
- The BEP must already be assigned to the brief.
- The BEP must still have active persisted BEP verification at appointment time.
- Duplicate appointments for the same brief are blocked.

### Project code and project record
- Generates a persistent project code in the format `ARC-YYYYMMDD-XXXXXX`.
- Creates a `projects/{projectId}` record with:
  - `projectCode`
  - `clientBriefId`
  - `technicalBriefId`
  - `clientId`
  - `leadArchitectId`
  - appointment stage history
  - active client and BEP team members
  - appointment milestones

### Appointment contract
- Creates an `appointment_contracts/{projectId}` record with:
  - linked project, client brief, and technical brief IDs
  - client and BEP IDs
  - generated pending-acceptance status
  - professional fee, platform fee, and total escrow amount
  - technical scope, deliverables, exclusions, and assumptions
  - milestone schedule and release conditions
  - downstream feed flags from the technical brief
  - active BEP verification ID

### Milestones, invoices, and escrow/payment setup
- Creates five appointment milestones:
  - Appointment and brief confirmation
  - Concept and design development
  - Municipal approval package
  - Procurement and construction pricing support
  - Close-out and handover support
- Creates draft `invoices/{projectId_milestoneId}` records for each milestone.
- Creates `escrow/{projectId}` with pending escrow amount, platform fee, payee/payer, payment ID, and milestone release schedule.
- Creates a pending `payments/{paymentId}` escrow deposit record.
- Updates the source `client_briefs/{briefId}` and `technical_briefs/{briefId}` with project and appointment contract links.

### Audit
- Writes immutable `contract.appointment_generated` audit events containing project code, BEP, fee, platform fee, invoice count, escrow ID, and source brief ID.

### Dev/browser testing support
- Keeps the Phase 5 tunnel host support change in `server.ts` so public tunnel domains can be used during browser workflow testing.

## Tests added/updated

- Added API test coverage for:
  - non-owner appointment blocking
  - successful appointment creation from finalized technical brief
  - project code generation
  - appointment contract persistence
  - milestone and invoice creation
  - escrow and pending payment creation
  - source brief/technical brief back-links
  - audit event persistence
  - duplicate appointment blocking

## Validation completed so far

- `npx vitest run src/lib/__tests__/api-router.security.test.ts`
  - 30 tests passed.
- `npm run lint`
  - TypeScript validation passed.

## Notes

- The route accepts `professionalFee` in cents to match existing payment amount conventions.
- This slice creates generated pending-acceptance contracts. Contract acceptance/signature workflow is left for a future Full_scope contract-builder/signature slice.
- PayFast redirect URL generation remains in the existing escrow payment route; this slice establishes the persistent escrow/payment route and records needed for that payment step.
