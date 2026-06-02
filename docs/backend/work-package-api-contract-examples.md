# Work Package API Contract Examples

Date: 2026-05-15  
Scope: deterministic, non-production request/response examples for project work package routes. These examples document local/dev contract shape only. They do not execute freelancer agreements, create payment obligations, send live email, or replace human project lead review.

## `POST /api/projects/:projectId/work-packages`

Creates an open freelancer work package. Invited freelancer IDs are stored, but only verified freelancers receive pending notification records.

```http
POST /api/projects/project-1/work-packages
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "title": "Council drawing clean-up",
  "description": "Prepare drawing annotations for municipal submission pack.",
  "requirements": [
    { "label": "Update title block", "required": true },
    { "label": "Check SANS references", "required": true }
  ],
  "budget": 12500,
  "deadline": "2026-05-30",
  "invitedFreelancerIds": ["freelancer-1", "freelancer-unverified"]
}
```

```json
{
  "workPackage": {
    "id": "pkg-1",
    "projectId": "project-1",
    "jobId": "job-1",
    "title": "Council drawing clean-up",
    "description": "Prepare drawing annotations for municipal submission pack.",
    "requirements": [
      { "label": "Update title block", "required": true },
      { "label": "Check SANS references", "required": true }
    ],
    "budget": 12500,
    "deadline": "2026-05-30",
    "status": "open",
    "postedBy": "architect-1",
    "invitedFreelancerIds": ["freelancer-1", "freelancer-unverified"],
    "assignedFreelancerId": null,
    "createdAt": "2026-05-15T12:00:00.000Z",
    "updatedAt": "2026-05-15T12:00:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/work-packages/:packageId/applications`

Allows a verified freelancer to apply to an open package.

```http
POST /api/projects/project-1/work-packages/pkg-1/applications
Authorization: Bearer <verified-freelancer-id-token>
Content-Type: application/json

{
  "proposal": "I can complete the annotation and SANS reference clean-up by Friday.",
  "proposedFee": 12000
}
```

```json
{
  "application": {
    "id": "freelancer-1",
    "projectId": "project-1",
    "workPackageId": "pkg-1",
    "freelancerId": "freelancer-1",
    "freelancerName": "Freelancer One",
    "proposal": "I can complete the annotation and SANS reference clean-up by Friday.",
    "proposedFee": 12000,
    "status": "submitted",
    "verificationId": "verification-1",
    "createdAt": "2026-05-15T12:10:00.000Z",
    "updatedAt": "2026-05-15T12:10:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/work-packages/:packageId/applications/:applicationId/assign`

Assigns an application and sets the package agreement status to `pending_signature`. This is not a signed contract.

```http
POST /api/projects/project-1/work-packages/pkg-1/applications/freelancer-1/assign
Authorization: Bearer <project-lead-bep-id-token>
```

```json
{
  "id": "pkg-1",
  "status": "assigned",
  "assignedFreelancerId": "freelancer-1",
  "agreementStatus": "pending_signature"
}
```

Persisted package/application side effects:

```json
{
  "workPackagePatch": {
    "status": "assigned",
    "assignedFreelancerId": "freelancer-1",
    "assignedApplicationId": "freelancer-1",
    "agreementStatus": "pending_signature",
    "assignedAt": "2026-05-15T12:20:00.000Z",
    "updatedAt": "2026-05-15T12:20:00.000Z"
  },
  "applicationPatch": {
    "status": "accepted",
    "acceptedAt": "2026-05-15T12:20:00.000Z",
    "updatedAt": "2026-05-15T12:20:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/work-packages/:packageId/submissions`

Allows the assigned verified freelancer to submit deliverables.

```http
POST /api/projects/project-1/work-packages/pkg-1/submissions
Authorization: Bearer <assigned-verified-freelancer-id-token>
Content-Type: application/json

{
  "deliverableUrls": [
    "https://example.test/deliverables/pkg-1/drawing-cleanup.pdf"
  ],
  "notes": "Updated title blocks and checked SANS references."
}
```

```json
{
  "submission": {
    "id": "submission-1",
    "projectId": "project-1",
    "workPackageId": "pkg-1",
    "freelancerId": "freelancer-1",
    "deliverableUrls": [
      "https://example.test/deliverables/pkg-1/drawing-cleanup.pdf"
    ],
    "notes": "Updated title blocks and checked SANS references.",
    "status": "submitted",
    "createdAt": "2026-05-15T13:00:00.000Z",
    "updatedAt": "2026-05-15T13:00:00.000Z"
  }
}
```

## `POST /api/projects/:projectId/work-packages/:packageId/submissions/:submissionId/review`

Project lead/admin reviews submitted deliverables. Approval/rejection is a human project workflow decision and does not release money by itself.

```http
POST /api/projects/project-1/work-packages/pkg-1/submissions/submission-1/review
Authorization: Bearer <project-lead-bep-id-token>
Content-Type: application/json

{
  "decision": "approved",
  "reviewNotes": "Deliverables reviewed and accepted for coordination use."
}
```

```json
{
  "id": "submission-1",
  "status": "approved",
  "reviewedBy": "architect-1",
  "reviewedAt": "2026-05-15T13:30:00.000Z",
  "reviewNotes": "Deliverables reviewed and accepted for coordination use.",
  "updatedAt": "2026-05-15T13:30:00.000Z"
}
```

Rejected review:

```json
{
  "id": "submission-1",
  "status": "rejected",
  "reviewedBy": "architect-1",
  "reviewedAt": "2026-05-15T13:45:00.000Z",
  "reviewNotes": "Please add drawing revision cloud and resubmit.",
  "updatedAt": "2026-05-15T13:45:00.000Z"
}
```

## Gate examples

```json
[
  { "error": "title is required" },
  { "error": "Work package not found" },
  { "error": "This work package is not open for applications" },
  { "error": "proposal is required" },
  { "error": "Application not found" },
  { "error": "Only open work packages can be assigned" },
  { "error": "Only the assigned freelancer can submit deliverables" },
  { "error": "This work package is not awaiting freelancer submission" },
  { "error": "At least one deliverable URL is required" },
  { "error": "decision must be approved or rejected" },
  { "error": "Submission not found" }
]
```

## Audit events

```json
[
  { "category": "project", "action": "freelancer.work_package_created" },
  { "category": "project", "action": "freelancer.work_package_application_submitted" },
  { "category": "approval", "action": "freelancer.work_package_assigned" },
  { "category": "project", "action": "freelancer.work_package_submitted" },
  { "category": "approval", "action": "freelancer.work_package_submission_approved" },
  { "category": "approval", "action": "freelancer.work_package_submission_rejected" }
]
```

## Human confirmations still required

- Whether assignment creates a binding service agreement or only a pending signature workflow.
- Contract template, IP ownership, payment milestone, tax/VAT, and dispute terms.
- Whether work-package approval should trigger payment/escrow release or require a separate confirmation.
- Notification channel policy for freelancer invitations and assignment messages.
- Evidence retention requirements for deliverable URLs and review notes.
