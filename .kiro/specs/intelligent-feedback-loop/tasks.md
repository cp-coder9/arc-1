# Implementation Plan: Intelligent Feedback Loop

## Overview

This plan implements a cross-cutting feedback system with 6 subsystems: FeedbackWidget (shell-level overlay), useFrictionDetector (behavioural hook), FeedbackService (API + persistence), IntelligenceEngine (AI deduplication/clustering), LoopClosureService (status transitions + notifications), and FeedbackRoadmapDashboard (admin workspace page). Implementation proceeds from foundational types and services through to UI integration and wiring.

## Tasks

- [x] 1. Set up project structure, types, and core interfaces
  - [x] 1.1 Create feedback type definitions and interfaces
    - Create `src/services/feedbackTypes.ts` with all TypeScript interfaces: `FeedbackSubmission`, `FeedbackCluster`, `FeedbackStatus`, `ContextSnapshot`, `FeedbackFormData`, `FrictionSignal`, `ProcessingResult`, and related types
    - Define the `FeedbackStatus` union type: `'received' | 'reviewing' | 'planned' | 'shipped' | 'declined'`
    - Define category union: `'bug' | 'feature_request' | 'usability' | 'praise'`
    - Define sentiment union: `'positive' | 'neutral' | 'negative' | 'frustrated'`
    - Export status transition state machine as a constant map
    - _Requirements: 2.1, 2.2, 3.4, 4.6, 5.1_

  - [x] 1.2 Create feedback validation utilities
    - Create `src/services/feedbackValidation.ts` with validators: `validateDescription()` (10 non-whitespace min, 2000 total max), `validateAttachment()` (PNG/JPEG, ≤5MB, max 3), `validateStatusTransition()` (state machine), `validateActionDescription()` (≥10 chars), `validateDeclineReason()` (≥20 chars)
    - Use Zod schemas following project pattern in `src/lib/schemas.ts`
    - _Requirements: 2.3, 2.4, 2.6, 2.9, 4.6, 5.8, 8.6_

  - [x] 1.3 Write property tests for description validation
    - **Property 1: Description validation correctness**
    - **Validates: Requirements 2.3, 2.6**
    - Use fast-check to generate arbitrary strings, verify acceptance iff ≥10 non-whitespace AND ≤2000 total chars

  - [x] 1.4 Write property tests for attachment validation
    - **Property 2: Attachment validation correctness**
    - **Validates: Requirements 2.4, 2.9, 8.6**
    - Use fast-check to generate arbitrary MIME types, byte sizes, and attachment counts; verify acceptance iff type is `image/png` or `image/jpeg`, size ≤5,242,880, and count <3

  - [x] 1.5 Write property tests for status transition state machine
    - **Property 9: Status transition state machine**
    - **Validates: Requirements 4.6, 5.8**
    - Use fast-check to generate all (currentStatus, requestedStatus) pairs and verify only valid transitions are accepted, with action description and decline reason length requirements

- [x] 2. Implement FeedbackService (API layer and Firestore persistence)
  - [x] 2.1 Create FeedbackService core with Firestore persistence
    - Create `src/services/feedbackService.ts`
    - Implement `submitFeedback()` — persist to `feedback_submissions` collection with Context_Snapshot, UTC ISO-8601 timestamp, user UID, initial status `received`
    - Implement `getUserSubmissions()` — list user's submissions (max 20, sorted by date desc)
    - Implement `getClusterList()` — paginated (25/page), sorted by severity desc, with category/date/status filters
    - Implement `getClusterDetail()` — cluster with its submissions (50/page, sorted by timestamp desc)
    - Implement `checkRateLimit()` — count explicit submissions in rolling 24h window
    - Implement `softDeleteUserData()` — clear descriptions, delete Blob attachments, preserve cluster counts
    - Use existing Firebase Admin SDK pattern from `src/lib/firebase-admin.ts`
    - _Requirements: 2.5, 2.7, 4.2, 4.3, 4.4, 5.6, 8.1, 8.5, 8.7_

  - [x] 2.2 Create feedback API endpoints in api-router
    - Add routes to `src/lib/api-router.ts`:
      - `POST /api/feedback/submit` — any authenticated user
      - `GET /api/feedback/submissions` — self or platform_admin
      - `GET /api/feedback/clusters` — platform_admin only
      - `GET /api/feedback/clusters/:id` — platform_admin only
      - `PATCH /api/feedback/clusters/:id/status` — platform_admin only
      - `POST /api/feedback/clusters/:id/brief` — platform_admin only
      - `GET /api/feedback/rate-limit` — any authenticated
      - `DELETE /api/feedback/submissions/my-data` — self only
    - Validate auth via existing Firebase Auth session middleware
    - Apply rate limit check on submit endpoint
    - _Requirements: 2.5, 4.1, 4.6, 5.6, 8.1, 8.3, 8.4_

  - [x] 2.3 Implement attachment upload via Vercel Blob
    - Add attachment upload logic within the submit endpoint
    - Use existing `@vercel/blob` pattern: path format `feedback/{submissionId}/{filename}`
    - Validate file type (PNG/JPEG) and size (≤5MB) before upload
    - Return attachment URLs for persistence in `feedback_submissions.attachmentUrls[]`
    - Implement blob deletion in soft-delete flow
    - _Requirements: 2.4, 2.9, 8.6, 8.7_

  - [x] 2.4 Write property tests for submission persistence round-trip
    - **Property 3: Submission persistence round-trip**
    - **Validates: Requirements 2.1, 2.5**
    - Use fast-check to generate valid submissions, verify persisted record contains exact context snapshot, ISO-8601 UTC timestamp, submitter UID, status `received`, and all attachment URLs

  - [x] 2.5 Write property tests for rate limit enforcement
    - **Property 19: Rate limit enforcement**
    - **Validates: Requirements 8.1**
    - Use fast-check to generate submission counts (0–15) within 24h window; verify N+1 accepted if N<10, rejected if N≥10; implicit submissions exempt

  - [x] 2.6 Write property tests for soft-delete data removal
    - **Property 20: Soft-delete data removal**
    - **Validates: Requirements 8.5, 8.7**
    - Use fast-check to generate user submissions with attachments; verify after soft-delete: descriptions are empty strings, blob URLs deleted, no user-identifiable fields, cluster occurrence counts unchanged

  - [x] 2.7 Write property tests for My Feedback display constraints
    - **Property 13: My Feedback display constraints**
    - **Validates: Requirements 5.6**
    - Use fast-check to generate N submissions (0–50); verify display returns exactly min(N, 20) items sorted by date descending

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement IntelligenceEngine (AI processing, clustering, severity)
  - [x] 4.1 Create IntelligenceEngine with Gemini AI integration
    - Create `src/services/feedbackIntelligenceEngine.ts`
    - Implement `processSubmission()` — compute similarity against open clusters via Gemini, merge (>0.75) or create new cluster
    - Implement `computeSeverityScore()` — integer 1–10 based on occurrence count, negative/frustrated sentiment ratio, distinct user count
    - Implement `generateFeatureBrief()` — AI-generated problem statement, affected roles, scope, impact
    - Use existing `callGeminiProxy` with `withRetry` pattern from `src/services/geminiService.ts`
    - Build system instruction and deduplication prompts
    - Implement 30s timeout with fallback: create new cluster, assign `neutral`, queue for reprocessing
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 4.5_

  - [x] 4.2 Implement cluster management logic
    - Implement cluster merge logic: increment `occurrenceCount`, add to `submissionIds[]`, update `distinctUserIds[]` and `distinctUserCount`
    - Implement new cluster creation: seed with submission, generate AI title
    - Implement category mismatch flagging when AI category differs from user-selected
    - Implement staleness check: mark clusters `open: false` after 30 days no new submissions
    - Implement sentiment breakdown tracking and average sentiment computation
    - _Requirements: 3.2, 3.3, 3.7, 3.10_

  - [x] 4.3 Write property tests for clustering threshold logic
    - **Property 4: Clustering threshold logic**
    - **Validates: Requirements 3.2, 3.3**
    - Use fast-check to generate similarity scores (0–1) for existing clusters; verify merge into highest if >0.75, new cluster if all ≤0.75

  - [x] 4.4 Write property tests for sentiment assignment validity
    - **Property 5: Sentiment assignment validity**
    - **Validates: Requirements 3.4, 3.5**
    - Use fast-check to generate descriptions of varying length; verify exactly one sentiment label assigned, and `neutral` when description <10 chars

  - [x] 4.5 Write property tests for severity score bounds
    - **Property 6: Severity score bounds**
    - **Validates: Requirements 3.6**
    - Use fast-check to generate clusters with arbitrary occurrence count (≥1), sentiment distributions, and distinct user counts (≥1); verify severity is integer 1–10

  - [x] 4.6 Write property tests for category mismatch detection
    - **Property 7: Category mismatch detection**
    - **Validates: Requirements 3.7**
    - Use fast-check to generate user-selected and AI-assigned category pairs; verify `categoryMismatch` flag is true iff categories differ

  - [x] 4.7 Write property tests for cluster staleness rule
    - **Property 8: Cluster staleness rule**
    - **Validates: Requirements 3.10**
    - Use fast-check to generate clusters with arbitrary `lastSubmissionAt` timestamps; verify `open: true` iff within 30 days of current time

- [x] 5. Implement LoopClosureService (status transitions and notifications)
  - [x] 5.1 Create LoopClosureService with notification dispatch
    - Create `src/services/feedbackLoopClosureService.ts`
    - Implement `notifyStatusTransition()` — send notification to all distinct submitters in cluster
    - Add notification types to existing `NotificationType` union: `feedback_status_changed`, `feedback_shipped`, `feedback_declined`
    - Use existing `NotificationService.sendNotification()` with channels `['in_app', 'email']`
    - Include cluster title, new status, and operator-provided action description in all notifications
    - Include release note link for `shipped` transitions
    - Include decline reason for `declined` transitions
    - Handle merged cluster submitters (continue notifying submitters from merged submissions)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.7_

  - [x] 5.2 Implement audit trail and Action Centre integration
    - Write audit trail events for: submission created, cluster merged, status changed, notification sent, implicit friction detected
    - Use existing `AuditTrailService` pattern from `src/services/auditTrailService.ts`
    - Implement Project Passport linkage: write reference for submissions with non-null projectId
    - Create Action Centre inbox items for severity ≥8 clusters (within 30s)
    - Create "pending review" inbox items for clusters with status `received` unchanged for 7+ days
    - Use existing `InboxEventAdapter` from `src/services/inboxEventAdapter.ts`
    - Fire-and-forget with 3-retry queue for audit/inbox writes
    - _Requirements: 7.1, 7.2, 7.3, 7.7, 7.8, 7.9_

  - [x] 5.3 Write property tests for loop closure notification targeting
    - **Property 12: Loop closure notification targeting**
    - **Validates: Requirements 5.1, 5.3, 5.7**
    - Use fast-check to generate clusters with N distinct submitters and merged submissions; verify exactly N notifications generated with correct content

  - [x] 5.4 Write property tests for audit trail completeness
    - **Property 16: Audit trail completeness**
    - **Validates: Requirements 7.1, 2.7**
    - Use fast-check to generate lifecycle actions; verify audit event recorded with actor ID, action type, source object ID, and timestamp

  - [x] 5.5 Write property tests for Project Passport linkage
    - **Property 17: Project Passport linkage**
    - **Validates: Requirements 7.2**
    - Use fast-check to generate submissions with nullable projectId; verify reference exists in Passport when projectId is non-null

  - [x] 5.6 Write property tests for high-severity Action Centre escalation
    - **Property 18: High-severity Action Centre escalation**
    - **Validates: Requirements 7.3, 7.8**
    - Use fast-check to generate clusters with severity 1–10; verify inbox item created iff severity ≥8; also verify stale cluster (received >7 days) triggers pending review item

- [x] 6. Checkpoint - Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement FeedbackWidget (client-side overlay component)
  - [x] 7.1 Create FeedbackWidget overlay component
    - Create `src/components/feedback/FeedbackWidget.tsx`
    - Render persistent 44×44px trigger button (bottom-right, `z-50`)
    - Implement overlay panel with focus trap (Tab cycling within panel)
    - Implement Escape key and close button to dismiss (return focus to trigger)
    - Toggle on trigger click (close if already open)
    - Capture `ContextSnapshot` on open: pagePath, activeModule, projectId, userRole, viewport dimensions
    - Render above page content but below system-level modals
    - Accept `user: UserProfile` prop
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

  - [x] 7.2 Implement feedback submission form
    - Render 4 category radio buttons: bug, feature_request, usability, praise
    - Render description textarea with live character count (remaining chars)
    - Validate: category required, 10–2000 chars (non-whitespace min 10)
    - Display inline validation errors adjacent to invalid fields
    - Implement file attachment area: max 3 screenshots (PNG/JPEG, ≤5MB each)
    - Reject invalid files with specific error (format or size), retain valid attachments
    - On submit: upload attachments → submit feedback → show success → reset → auto-close (3s or dismiss)
    - On network error: show error, retain form content, allow retry
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 2.9, 2.10_

  - [x] 7.3 Implement "My Feedback" section in widget
    - Display user's 20 most recent submissions sorted by date descending
    - Show submission category, description snippet, and current `FeedbackStatus`
    - Show rate limit status with countdown when limit reached
    - Query via `GET /api/feedback/submissions` endpoint
    - _Requirements: 5.6, 8.2_

  - [x] 7.4 Mount FeedbackWidget in App shell
    - Add `<FeedbackWidget user={user} />` at App shell level in `App.tsx` (same tier as `DemoBanner`, `Toaster`)
    - Ensure rendered only for authenticated users (all 18 roles)
    - Wrap in ErrorBoundary for graceful failure (fail silently, log to console)
    - _Requirements: 1.2, 1.4, 7.5_

  - [x] 7.5 Write unit tests for FeedbackWidget
    - Test render, focus trap, keyboard navigation (Tab cycling, Escape close)
    - Test form validation display (missing category, short description, oversized file)
    - Test success/error states
    - _Requirements: 1.5, 1.6, 1.7, 2.6, 2.9_

- [x] 8. Implement useFrictionDetector (behavioural monitoring hook)
  - [x] 8.1 Create useFrictionDetector hook
    - Create `src/hooks/useFrictionDetector.ts`
    - Implement detection rules:
      - **Repeated errors**: ≥3 errors on same (page, target) within 60s
      - **Workflow abandonment**: navigation away from multi-step process after reaching step ≥2
      - **Rage clicks**: ≥5 rapid clicks on same element (no state change) within 3s, each within 500ms
    - On signal detection: create implicit submission via `POST /api/feedback/submit` with `implicit: true`
    - Enforce dedup: max 1 implicit submission per (type, page, target) per user per 24h
    - Never capture form values, document content, or chat messages — only structural metadata
    - Fail silently on any error — log to console, never disrupt user session
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 8.2 Mount useFrictionDetector in App shell
    - Add `useFrictionDetector(user)` call at App shell level for authenticated users
    - Ensure hook runs passively without user-facing indication
    - _Requirements: 6.1_

  - [x] 8.3 Write property tests for friction detection thresholds
    - **Property 14: Friction detection and deduplication**
    - **Validates: Requirements 6.1, 6.2, 6.4**
    - Use fast-check to generate sequences of interaction events; verify signal detected iff thresholds met; verify max 1 implicit submission per pattern per 24h

  - [x] 8.4 Write property tests for implicit submission privacy
    - **Property 15: Implicit submission privacy constraint**
    - **Validates: Requirements 6.5**
    - Use fast-check to generate implicit submissions; verify description/metadata contains only structural data (page path, action type, error codes, element identifiers, click coordinates) and never form values, document content, or chat messages

- [x] 9. Checkpoint - Ensure widget and hook tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement FeedbackRoadmapDashboard (admin workspace page)
  - [x] 10.1 Create FeedbackRoadmapDashboard workspace page
    - Create `src/components/feedback/FeedbackRoadmapDashboard.tsx`
    - Follow Architex workspace pattern: Hero → Stat Row → Tab Navigation → Content Panels
    - Implement tabs: Overview | Clusters | Trend Chart | Settings
    - Header card with severity summary stats (total clusters, high-severity count, pending review)
    - Accept `user: UserProfile` prop, enforce `platform_admin` role check
    - Use CSS token classes (`.panel`, `.pill`, `.btn`, `.table`, `.hero`, `.stat-card`)
    - _Requirements: 4.1, 4.2, 4.8_

  - [x] 10.2 Implement cluster list view with filtering and pagination
    - Display clusters sorted by severity desc: title, occurrence count, distinct user count, average sentiment, severity score
    - Paginate at 25 clusters per page
    - Implement filters: category (bug/feature_request/usability/praise), date range (default 30 days, max 365), status (received/reviewing/planned/shipped/declined)
    - Show empty state when no clusters match active filters
    - _Requirements: 4.2, 4.3, 4.9_

  - [x] 10.3 Implement cluster detail view and status transitions
    - Display all submissions within selected cluster: Context_Snapshots, timestamps, user roles (paginated 50/page, sorted by timestamp desc)
    - Implement status transition controls with required action description input (≥10 chars)
    - Require decline reason (≥20 chars) for decline transitions
    - Validate transitions follow state machine before persisting
    - Display validation errors for invalid transitions or missing descriptions
    - Trigger Loop_Closure_Service on valid transitions
    - _Requirements: 4.4, 4.6, 5.8_

  - [x] 10.4 Implement AI feature brief panel and trend chart
    - Display AI-generated feature brief for `feature_request` clusters: problem statement, affected roles, suggested scope, estimated impact
    - Implement "Generate Brief" button calling `POST /api/feedback/clusters/:id/brief`
    - Implement trend chart: feedback volume by category over previous 30 days, grouped by day
    - _Requirements: 4.5, 4.8_

  - [x] 10.5 Register FeedbackRoadmapDashboard in App shell and navigation
    - Lazy-load in `App.tsx` via `lazyWithChunkRetry`: `activeTab === 'feedback-roadmap'`
    - Register Tool Nav config in `src/navigation/toolNavRegistry.ts` with sections (Overview, Clusters, Trends, Settings)
    - Add nav entry in `src/navigation/architexNavigationConfig.ts` under Admin/Governance module
    - Restrict to `platform_admin` role
    - _Requirements: 4.1, 7.5_

  - [x] 10.6 Write property tests for cluster display ordering
    - **Property 10: Cluster display ordering**
    - **Validates: Requirements 4.2**
    - Use fast-check to generate lists of clusters with arbitrary severity scores; verify displayed list is sorted by severity descending

  - [x] 10.7 Write property tests for filter correctness
    - **Property 11: Filter correctness**
    - **Validates: Requirements 4.3**
    - Use fast-check to generate clusters and filter combinations; verify result set contains only clusters satisfying ALL active filter predicates

- [x] 11. Implement Firestore security rules and final wiring
  - [x] 11.1 Add Firestore security rules for feedback collections
    - Add rules for `feedback_submissions`: user can read/write own only, `platform_admin` can read all, no cross-user access
    - Add rules for `feedback_clusters`: read/write restricted to `platform_admin` only
    - Follow existing Firestore rules pattern in `firebase.json` / `firestore.rules`
    - _Requirements: 8.4_

  - [x] 11.2 Wire Intelligence Engine trigger on submission persistence
    - After successful `submitFeedback()` persistence, trigger `processSubmission()` synchronously
    - Implement 30s timeout with fallback (new cluster, `neutral` sentiment, queue reprocessing)
    - Ensure submission is persisted even if Intelligence Engine fails (graceful degradation)
    - _Requirements: 3.1, 3.8, 3.9_

  - [x] 11.3 Wire Action Centre integration for high-severity and stale clusters
    - Create inbox items for all `platform_admin` users when cluster severity reaches ≥8 (within 30s)
    - Create "pending review" inbox items for clusters at `received` status for 7+ days
    - Surface operator actions (status change, brief generation) in Action Centre activity log
    - _Requirements: 7.3, 7.7, 7.8_

- [x] 12. Final checkpoint - Full integration verification
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (20 properties total)
- Unit tests validate specific examples and edge cases
- All UI follows Architex workspace pattern (Hero → Stat Row → Panels) with CSS token classes
- Services go in `src/services/`, components in `src/components/feedback/`, hooks in `src/hooks/`
- API endpoints added to `src/lib/api-router.ts` following existing Express 5 pattern
- Uses existing infrastructure: Firestore, Vercel Blob, Gemini proxy (`callGeminiProxy` + `withRetry`), NotificationService, AuditTrailService, InboxEventAdapter

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 4, "tasks": ["4.1", "4.2", "5.1", "5.2"] },
    { "id": 5, "tasks": ["4.3", "4.4", "4.5", "4.6", "4.7", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 6, "tasks": ["7.1", "8.1"] },
    { "id": 7, "tasks": ["7.2", "7.3", "8.2", "8.3", "8.4"] },
    { "id": 8, "tasks": ["7.4", "7.5"] },
    { "id": 9, "tasks": ["10.1", "10.2"] },
    { "id": 10, "tasks": ["10.3", "10.4"] },
    { "id": 11, "tasks": ["10.5", "10.6", "10.7"] },
    { "id": 12, "tasks": ["11.1", "11.2", "11.3"] }
  ]
}
```
