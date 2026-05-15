# Profile, Directory, and Verification API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for profile projection, directory search, and admin verification review routes. These examples use the `/api` mount where available, illustrative bearer tokens, and fixed IDs. They do not submit live provider checks, send outbound emails, bind appointments, release payments, or perform statutory actions.

## `PUT /api/users/:userId/profile`

Updates supported profile fields for the authenticated user, or for another user only when the caller is an admin. Unsupported trust and verification fields are ignored by server-side sanitization.

```http
PUT /api/users/architect-1/profile
Authorization: Bearer <architect-id-token>
Content-Type: application/json

{
  "profileData": {
    "displayName": "Architect User",
    "professionalDiscipline": "Architecture",
    "region": "Cape Town",
    "directoryVisibility": true,
    "verified": true,
    "trustScore": 100
  }
}
```

```json
{
  "profile": {
    "uid": "architect-1",
    "role": "architect",
    "displayName": "Architect User",
    "professionalDiscipline": "Architecture",
    "region": "Cape Town",
    "directoryVisibility": true,
    "updatedAt": "2026-05-15T12:00:00.000Z"
  },
  "directoryProfile": {
    "userId": "architect-1",
    "name": "Architect User",
    "displayName": "Architect User",
    "role": "architect",
    "normalizedRole": "bep",
    "professionalDiscipline": "Architecture",
    "region": "Cape Town",
    "verificationStatus": "verified",
    "verificationId": "architect-1_bep_SACAP_SACAP-123",
    "directoryVisibility": true
  }
}
```

Cross-user non-admin block:

```json
{
  "error": "Admin access required to update another user profile"
}
```

## `GET /api/directory/search`

Searches projected directory profiles using the same handler as `GET /directory/search`. Role access is derived from the caller; clients cannot request arbitrary unsupported roles. Unverified profiles may be visible when requested, but they are not invitable.

```http
GET /api/directory/search?role=bep&q=architect&region=cape&verificationStatus=verified&limit=10
Authorization: Bearer <client-id-token>
```

```json
{
  "results": [
    {
      "userId": "architect-1",
      "name": "Architect User",
      "company": "Arch Studio",
      "role": "architect",
      "normalizedRole": "bep",
      "discipline": "Architecture",
      "trade": null,
      "region": "Cape Town",
      "verificationStatus": "verified",
      "verificationLabel": "verified",
      "verificationId": "architect-1_bep_SACAP_SACAP-123",
      "registrationNumber": "SACAP-123",
      "ratings": { "average": 4.8, "count": 12 },
      "availability": "available",
      "canInvite": true
    }
  ],
  "count": 1,
  "allowedRoles": ["bep"]
}
```

Unverified result posture:

```json
{
  "results": [
    {
      "userId": "architect-2",
      "name": "Pending Architect",
      "role": "architect",
      "normalizedRole": "bep",
      "verificationStatus": "unverified",
      "verificationLabel": "unverified",
      "verificationId": null,
      "registrationNumber": null,
      "ratings": { "average": 0, "count": 0 },
      "availability": null,
      "canInvite": false
    }
  ],
  "count": 1,
  "allowedRoles": ["bep"]
}
```

Unsupported requested role response:

```json
{
  "error": "Requested directory role is not available to this user"
}
```

## `GET /api/admin/verifications`

Lists verification records for admin review. Optional `status` filters the server-side Firestore query. Non-admin callers are denied.

```http
GET /api/admin/verifications?status=pending
Authorization: Bearer <admin-id-token>
```

```json
[
  {
    "id": "architect-1_bep_SACAP_SACAP-123",
    "userId": "architect-1",
    "submittedBy": "architect-1",
    "subjectType": "bep",
    "statutoryBody": "SACAP",
    "registrationNumber": "SACAP-123",
    "status": "pending",
    "source": "automated_browser_agent",
    "metadata": {
      "verificationAgentStatus": "queued"
    },
    "submittedAt": "2026-05-15T12:00:00.000Z"
  }
]
```

Non-admin block:

```json
{
  "error": "Admin access required"
}
```

## `POST /api/admin/verifications/:verificationId/recheck`

Queues an official register recheck for an existing verification. The HTTP response reflects the queued record immediately; the browser verification agent runs asynchronously and must still leave inconclusive results for human review.

```http
POST /api/admin/verifications/architect-1_bep_SACAP_SACAP-123/recheck
Authorization: Bearer <admin-id-token>
Content-Type: application/json

{
  "reason": "Admin queued official register recheck after expiry warning"
}
```

```json
{
  "id": "architect-1_bep_SACAP_SACAP-123",
  "userId": "architect-1",
  "subjectType": "bep",
  "statutoryBody": "SACAP",
  "registrationNumber": "SACAP-123",
  "status": "pending",
  "recheckQueuedBy": "admin-1",
  "metadata": {
    "verificationAgentStatus": "queued"
  }
}
```

## `POST /api/admin/verifications/:verificationId/review`

Records a human admin review decision. Approval/rejection is auditable and may mirror legacy SACAP records, but it should still follow provider evidence, expiry, override, and dual-approval policies once humans confirm them.

```http
POST /api/admin/verifications/architect-1_bep_SACAP_SACAP-123/review
Authorization: Bearer <admin-id-token>
Content-Type: application/json

{
  "status": "verified",
  "expiresAt": "2027-05-15T00:00:00.000Z",
  "adminReviewNote": "Admin confirmed official SACAP evidence."
}
```

```json
{
  "id": "architect-1_bep_SACAP_SACAP-123",
  "userId": "architect-1",
  "submittedBy": "architect-1",
  "subjectType": "bep",
  "statutoryBody": "SACAP",
  "registrationNumber": "SACAP-123",
  "status": "verified",
  "reviewedBy": "admin-1",
  "expiresAt": "2027-05-15T00:00:00.000Z",
  "metadata": {
    "adminReviewNote": "Admin confirmed official SACAP evidence."
  }
}
```

Rejected response shape:

```json
{
  "id": "architect-1_bep_SACAP_SACAP-123",
  "userId": "architect-1",
  "subjectType": "bep",
  "statutoryBody": "SACAP",
  "registrationNumber": "SACAP-123",
  "status": "rejected",
  "reviewedBy": "admin-1",
  "rejectionReason": "Registration could not be matched to accepted evidence.",
  "metadata": {
    "adminReviewNote": "Manual review found mismatched details."
  }
}
```

## Human confirmations still required

1. Verification evidence standards, expiry windows, accepted providers, override policy, and review SLA.
2. Whether any high-risk verification approval/rejection requires second-admin review.
3. Whether directory search exposes unverified profiles by default or only when explicitly requested with warning copy.
4. POPIA retention for profile projections, directory search audit metadata, and verification evidence.
5. Whether transactional email may be enabled for invitations and reminders after provider/legal confirmation.
