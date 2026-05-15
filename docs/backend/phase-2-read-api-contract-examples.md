# Phase 2 Read API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for safe Phase 2 read endpoints. These examples use the `/api` mount, illustrative bearer tokens, and fixed IDs. They do not create appointments, contracts, signatures, escrow releases, payments, municipal submissions, purchases, or external provider actions.

## Shared response posture

- All routes require an authenticated Firebase bearer token or equivalent trusted test auth context.
- Client owners can read their own briefs, opportunities, and proposals.
- Admins can read operational views, subject to the route-specific behavior below.
- Assigned BEP/architect users must have active `bep` / `SACAP` verification before reading assigned briefs or their submitted proposals.
- Marketplace matching remains advisory only. Read responses expose `advisoryOnly`, `advisoryMatchingOnly`, `readOnly`, or `autoAppointment: false` where applicable.

## `GET /api/project-briefs`

Lists read-only project briefs with server-side access filtering.

### Client owner list

```http
GET /api/project-briefs?mine=true&limit=10
Authorization: Bearer <client-id-token>
```

```json
{
  "briefs": [
    {
      "id": "brief-1",
      "clientId": "client-1",
      "createdBy": "client-1",
      "title": "Residential alteration",
      "description": "Add a home office and covered patio.",
      "category": "Residential",
      "location": "Cape Town",
      "status": "published",
      "marketplaceOpportunityId": "brief-1",
      "assignedBepIds": ["architect-1"],
      "createdAt": "2026-05-01T12:00:00.000Z",
      "updatedAt": "2026-05-02T12:00:00.000Z"
    }
  ],
  "mine": true,
  "readOnly": true
}
```

### Assigned verified BEP list

```http
GET /api/project-briefs?limit=10
Authorization: Bearer <verified-bep-id-token>
```

```json
{
  "briefs": [
    {
      "id": "brief-1",
      "clientId": "client-1",
      "title": "Residential alteration",
      "status": "published",
      "assignedBepIds": ["architect-1"]
    }
  ],
  "mine": false,
  "readOnly": true
}
```

### Unverified BEP block

```json
{
  "error": "Verified participant is required for marketplace opportunity access",
  "verificationRequired": {
    "subjectType": "bep",
    "statutoryBody": "SACAP"
  }
}
```

## `GET /api/project-briefs/:briefId`

Returns a single brief plus bounded attachment and interpretation subcollections.

```http
GET /api/project-briefs/brief-1
Authorization: Bearer <client-id-token>
```

```json
{
  "brief": {
    "id": "brief-1",
    "clientId": "client-1",
    "createdBy": "client-1",
    "title": "Residential alteration",
    "description": "Add a home office and covered patio.",
    "category": "Residential",
    "location": "Cape Town",
    "status": "published",
    "assignedBepIds": ["architect-1"],
    "marketplaceOpportunityId": "brief-1"
  },
  "attachments": [
    {
      "id": "attachment-1",
      "briefId": "brief-1",
      "clientId": "client-1",
      "uploadedBy": "client-1",
      "fileName": "survey.pdf",
      "fileUrl": "https://files.public.blob.vercel-storage.com/survey.pdf",
      "evidenceType": "survey",
      "storageProvider": "vercel_blob"
    }
  ],
  "interpretations": [
    {
      "id": "interpretation-1",
      "briefId": "brief-1",
      "clientId": "client-1",
      "summary": "Likely needs an architect and municipal submission.",
      "confidence": 0.75,
      "advisoryOnly": true,
      "status": "ready_for_review"
    }
  ],
  "readOnly": true
}
```

Forbidden non-owner/non-assignee response:

```json
{
  "error": "Only the brief owner, assigned verified BEP, or admin can read this project brief"
}
```

## `GET /api/marketplace/opportunities/:id`

Reads one marketplace opportunity. The owning client and admins can read directly. A BEP/architect can read only if the opportunity is published and the caller has active `bep` / `SACAP` verification.

```http
GET /api/marketplace/opportunities/brief-1
Authorization: Bearer <verified-bep-id-token>
```

```json
{
  "opportunity": {
    "id": "brief-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "title": "Residential alteration",
    "description": "Add a home office and covered patio.",
    "category": "Residential",
    "location": "Cape Town",
    "status": "published",
    "advisoryMatchingOnly": true,
    "createdAt": "2026-05-02T12:00:00.000Z",
    "updatedAt": "2026-05-02T12:00:00.000Z"
  },
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "advisoryOnly": true,
  "readOnly": true
}
```

Unpublished or unauthorized response:

```json
{
  "error": "Only the owning client, admin, or verified BEPs can read this marketplace opportunity"
}
```

## `GET /api/proposals/:proposalId`

Reads one proposal. Allowed readers are the client owner, the submitting verified BEP/architect, or an admin. The response is read-only and cannot auto-appoint.

```http
GET /api/proposals/proposal-1
Authorization: Bearer <verified-bep-id-token>
```

```json
{
  "proposal": {
    "id": "proposal-1",
    "opportunityId": "brief-1",
    "briefId": "brief-1",
    "clientId": "client-1",
    "professionalId": "architect-1",
    "feeAmount": 125000,
    "scopeSummary": "Stages 1 to 4 municipal submission package.",
    "exclusions": ["Council fees"],
    "status": "submitted",
    "humanReviewRequired": true,
    "verificationId": "architect-1_bep_SACAP_SACAP-123",
    "advisoryOnly": true,
    "autoAppointment": false
  },
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "readOnly": true
}
```

Client-owner reads omit the top-level `verificationId` unless it is already stored on the proposal:

```json
{
  "proposal": {
    "id": "proposal-1",
    "clientId": "client-1",
    "professionalId": "architect-1",
    "status": "submitted",
    "advisoryOnly": true,
    "autoAppointment": false
  },
  "readOnly": true
}
```

Forbidden response:

```json
{
  "error": "Only the client owner, submitting verified BEP, or admin can read this proposal"
}
```

## `GET /api/proposals/:proposalId/appointment-readiness`

Checks appointment preconditions for a submitted proposal without creating an appointment, contract, signature, payment, audit event, or legal state transition. Only the proposal client owner or an admin can run the preflight.

### Ready preflight

```http
GET /api/proposals/proposal-1/appointment-readiness
Authorization: Bearer <client-id-token>
```

```json
{
  "ready": true,
  "proposalId": "proposal-1",
  "briefId": "brief-1",
  "professionalId": "architect-1",
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "requiredHumanActions": [
    "client_contract_acceptance",
    "professional_contract_acceptance"
  ],
  "createsAppointment": false,
  "createsContract": false,
  "createsSignature": false,
  "createsPayment": false
}
```

### Blocked preflight

```json
{
  "ready": false,
  "proposalId": "proposal-1",
  "briefId": "brief-1",
  "professionalId": "architect-1",
  "verificationId": "architect-1_bep_SACAP_SACAP-123",
  "blocker": "A professional has already been appointed for this brief",
  "blockerStatus": 409,
  "createsAppointment": false,
  "createsContract": false,
  "createsSignature": false,
  "createsPayment": false
}
```

Forbidden reader response:

```json
{
  "error": "Only the client owner can check appointment readiness"
}
```

## Human confirmations still required

These examples are contract documentation for local/dev integration only. Production behavior still requires the consolidated confirmations in `docs/phase-reports/human-confirmations-required.md`, especially:

1. canonical Phase 2 collection migration versus compatibility stores or dual-write;
2. proposal schema and top-level `proposals` adoption;
3. appointment legal gate and e-signature/binding acceptance model;
4. verification provider evidence, expiry, override, and SLA policy;
5. AI/proposal comparison human-in-the-loop operating rules.
