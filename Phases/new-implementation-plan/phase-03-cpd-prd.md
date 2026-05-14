# Phase 3 PRD — CPD Learning, Certificates, Knowledge Integration

## Goal

Create the Continuing Professional Development module described in [Phases/new_implementation.md](Phases/new_implementation.md:86), leveraging existing Blob upload, PDF generation patterns, notification delivery, and AI knowledge management.

## Current codebase grounding

- PDF generation and Blob upload patterns exist in [src/services/pdfGenerationService.ts](src/services/pdfGenerationService.ts:707), [src/services/closeoutService.ts](src/services/closeoutService.ts:64), and [src/lib/uploadService.ts](src/lib/uploadService.ts).
- Knowledge base persistence exists in [src/services/knowledgeService.ts](src/services/knowledgeService.ts:89) with active and pending review states.
- Admin knowledge upload UI exists in [src/components/AdminKnowledgeUploader.tsx](src/components/AdminKnowledgeUploader.tsx), and admin knowledge management appears in [src/components/AdminDashboard.tsx](src/components/AdminDashboard.tsx:1090).
- Notification configuration exists in [src/services/notificationService.ts](src/services/notificationService.ts:25), but CPD notification types are absent.
- [`UploadedFile.context`](src/types.ts:658) includes certificate and knowledge_base, but not CPD video or transcript contexts.

## Scope

In scope:

- CPD course, lesson, quiz, enrollment, attempt, certificate, and CPD record models.
- Professional-facing CPD hub and dashboard points tracker.
- Admin course management for video URL, transcript, quiz questions, SACAP points, publish status.
- Certificate PDF generation and Blob persistence after passing a quiz.
- Sanitized CPD transcript promotion to [`agent_knowledge`](firestore.rules:592) through review-aware workflow.

Out of scope:

- Real SACAP accreditation API integration unless credentials and API terms are available.
- Live webinar streaming platform implementation.
- Payment gating beyond integration points for credits/subscriptions.

## Requirements

1. CPD records must be tamper-resistant; users cannot award themselves points.
2. Published courses must be readable by authenticated professionals and admins.
3. Course creation and certificate issuance must be admin/server-controlled.
4. Quiz attempts must preserve audit data and scoring criteria.
5. Transcripts must be sanitized and saved as pending knowledge unless admins explicitly auto-approve.

## Acceptance criteria

- CPD data model is added to [src/types.ts](src/types.ts:658) with certificate file context updates.
- New CPD rules in [firestore.rules](firestore.rules:606) prevent user-spoofed points.
- CPD certificates use existing PDF and Blob patterns from [src/services/closeoutService.ts](src/services/closeoutService.ts:64).
- Architect dashboard can display annual points summary without duplicating user profile metrics.
- Admin dashboard can create, publish, archive, and inspect CPD courses.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Users spoof CPD records | High | Make records server/admin-created only and keep quiz scoring server-side |
| CPD transcripts pollute active agent knowledge | Medium | Default transcript entries to pending review in [src/services/knowledgeService.ts](src/services/knowledgeService.ts:89) |
| Video files exceed Blob/storage limits | Medium | Support external video URLs first and store metadata, transcript, and certificates in Blob |

## Dependencies

- Phase 1 professional role model.
- Phase 2 credits/subscription if CPD is monetized.
- Existing knowledge service and admin knowledge UI.

