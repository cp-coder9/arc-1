# Requirements Document

## Introduction

Architex currently has no structured mechanism for users to communicate feedback to platform operators from within the application. Users cannot report bugs, request features, flag usability issues, or provide positive feedback without leaving the platform. This spec defines an Intelligent Feedback Loop — a cross-cutting feedback system accessible from every page, backed by AI-powered deduplication and categorisation, connected to a roadmap pipeline for platform operators, and closed-loop notifications so users know their feedback was heard and acted upon. The system also includes implicit friction detection to identify struggling users through behavioural signals.

## Glossary

- **Feedback_Widget**: The persistent UI component rendered on every authenticated page that allows users to submit structured feedback without leaving their current context.
- **Feedback_Service**: The backend service responsible for persisting, retrieving, and managing feedback submissions in Firestore.
- **Intelligence_Engine**: The AI-powered processing layer that deduplicates, categorises, scores priority, analyses sentiment, and clusters feedback submissions using the existing Gemini infrastructure.
- **Roadmap_Dashboard**: The admin-facing dashboard that surfaces trending requests, severity scores, pattern clusters, and AI-generated feature brief drafts for platform operators.
- **Loop_Closure_Service**: The service responsible for tracking feedback status transitions and notifying users when their feedback progresses through the pipeline.
- **Friction_Detector**: The background service that monitors user interaction patterns to identify implicit feedback signals such as repeated errors, abandoned workflows, and rage-click patterns.
- **Feedback_Submission**: A single feedback record containing category, description, context metadata, user identity, and processing state.
- **Platform_Operator**: A user holding the `platform_admin` role responsible for reviewing feedback and making roadmap decisions.
- **Submitter**: Any authenticated user across all 18 UserRole types who submits feedback through the Feedback_Widget.
- **Feedback_Status**: The lifecycle state of a feedback submission: `received`, `reviewing`, `planned`, `shipped`, `declined`.
- **Context_Snapshot**: Metadata automatically captured at submission time including current page path, active module, active project ID (if applicable), browser viewport dimensions, and user role.
- **Similarity_Score**: A numeric value between 0 and 1 produced by the Intelligence_Engine indicating how closely a new submission matches an existing feedback cluster.
- **Severity_Score**: A numeric priority value between 1 and 10 assigned by the Intelligence_Engine based on frequency, user impact, and sentiment intensity.

## Requirements

### Requirement 1: Feedback Widget Rendering and Accessibility

**User Story:** As any authenticated user, I want a persistent feedback button available on every page, so that I can submit feedback at any moment without navigating away from my current work.

#### Acceptance Criteria

1. THE Feedback_Widget SHALL render a persistent trigger button on every authenticated page within the Architex OS shell, positioned at the bottom-right corner of the viewport with a minimum touch-target size of 44×44 pixels.
2. THE Feedback_Widget SHALL remain visible and interactive across all 8 workflow modules and the command centre, inbox, and admin pages, rendered above page content but below system-level modal dialogs.
3. WHEN the Submitter clicks the trigger button, THE Feedback_Widget SHALL open an overlay panel without triggering page navigation, form resets, or loss of in-memory application state on the underlying page.
4. THE Feedback_Widget SHALL be accessible to all 18 UserRole types (client, architect, admin, freelancer, bep, contractor, subcontractor, supplier, engineer, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, developer, firm_admin, platform_admin, land_surveyor).
5. THE Feedback_Widget SHALL meet WCAG 2.1 AA accessibility requirements including keyboard navigation, focus trapping within the overlay, screen reader announcements of panel open and close state changes, and minimum colour contrast ratios of 4.5:1 for normal text and 3:1 for UI components and large text.
6. WHEN the overlay panel is open, THE Feedback_Widget SHALL capture a focus trap so that Tab navigation cycles within the panel until the Submitter closes it.
7. WHEN the overlay panel is open, THE Feedback_Widget SHALL allow the Submitter to close the panel by activating a visible close button within the panel or by pressing the Escape key, returning keyboard focus to the trigger button upon closure.
8. IF the Submitter activates the trigger button while the overlay panel is already open, THEN THE Feedback_Widget SHALL close the overlay panel and return focus to the trigger button.

### Requirement 2: Context-Aware Feedback Submission

**User Story:** As a user experiencing an issue on a specific page, I want the feedback form to automatically know where I am, so that I do not have to manually describe which tool or module I was using.

#### Acceptance Criteria

1. WHEN the Submitter opens the Feedback_Widget, THE Feedback_Widget SHALL automatically capture a Context_Snapshot containing the current page path, active module name, active project ID (if the user is within a project context), user role, and browser viewport dimensions.
2. THE Feedback_Widget SHALL present four category options for the Submitter to select: `bug`, `feature_request`, `usability`, and `praise`.
3. WHEN the Submitter selects a category, THE Feedback_Widget SHALL display a text area for a description requiring a minimum of 10 non-whitespace characters and a maximum of 2000 total characters, and SHALL display a live character count indicating remaining characters.
4. THE Feedback_Widget SHALL allow the Submitter to optionally attach up to 3 screenshots (PNG or JPEG, each no larger than 5MB) to the submission.
5. WHEN the Submitter submits the form with a valid category and description meeting the character requirements, THE Feedback_Service SHALL persist the Feedback_Submission to Firestore including the Context_Snapshot, a UTC ISO-8601 timestamp, user UID, and an initial Feedback_Status of `received`.
6. IF the Submitter submits the form without selecting a category, with a description containing fewer than 10 non-whitespace characters, or with a description exceeding 2000 total characters, THEN THE Feedback_Widget SHALL display an error message adjacent to each invalid field indicating the specific validation failure, and SHALL NOT persist the submission.
7. WHEN the Feedback_Submission is persisted, THE Feedback_Service SHALL write an audit trail event recording the submission action, user UID, submission ID, category, and timestamp.
8. WHEN the Feedback_Submission is successfully persisted, THE Feedback_Widget SHALL display a success confirmation message within 1 second, reset the form fields, and close the widget within 3 seconds or upon Submitter dismissal, whichever occurs first.
9. IF the Submitter attaches a file that is not PNG or JPEG format or exceeds 5MB in size, THEN THE Feedback_Widget SHALL reject the file, display an error message adjacent to the attachment area indicating the violated constraint (format or size), and SHALL retain any previously valid attachments and form content.
10. IF the Feedback_Service fails to persist the Feedback_Submission due to a network or service error, THEN THE Feedback_Widget SHALL display an error message indicating the submission was not saved, SHALL retain all form content and attachments, and SHALL allow the Submitter to retry submission.

### Requirement 3: AI-Powered Deduplication and Categorisation

**User Story:** As a platform operator, I want incoming feedback automatically deduplicated and categorised by AI, so that I see consolidated insights rather than hundreds of individual unstructured messages.

#### Acceptance Criteria

1. WHEN a new Feedback_Submission is persisted, THE Intelligence_Engine SHALL compute a Similarity_Score against all existing open feedback clusters using the Gemini AI infrastructure.
2. WHEN the Similarity_Score between a new submission and one or more existing clusters exceeds 0.75, THE Intelligence_Engine SHALL merge the submission into the cluster with the highest Similarity_Score and increment that cluster's occurrence count.
3. WHEN the Similarity_Score between a new submission and all existing clusters is 0.75 or below, THE Intelligence_Engine SHALL create a new cluster seeded by the submission.
4. THE Intelligence_Engine SHALL assign exactly one sentiment label from the set (`positive`, `neutral`, `negative`, `frustrated`) to each Feedback_Submission based on natural language analysis of the description text.
5. IF a Feedback_Submission's description text contains fewer than 10 characters, THEN THE Intelligence_Engine SHALL assign the `neutral` sentiment label without invoking AI analysis.
6. THE Intelligence_Engine SHALL assign a Severity_Score between 1 and 10 (inclusive, integer) to each feedback cluster based on the cluster's occurrence count, the ratio of negative and frustrated sentiment labels within the cluster, and the number of distinct users reporting.
7. WHEN the Intelligence_Engine processes a submission, THE Intelligence_Engine SHALL compare the AI-assigned category against the Submitter-selected category and flag the submission for Platform_Operator review on the Roadmap_Dashboard when the two categories differ.
8. THE Intelligence_Engine SHALL process each new submission within 60 seconds of persistence.
9. IF the Gemini AI infrastructure is unavailable or does not respond within 30 seconds during submission processing, THEN THE Intelligence_Engine SHALL create a new cluster for the submission, assign it a `neutral` sentiment label, and queue the submission for reprocessing on the next available cycle within 10 minutes.
10. A feedback cluster SHALL be considered open while it has received at least one new submission within the preceding 30 days; WHEN a cluster has received no new submissions for 30 consecutive days, THE Intelligence_Engine SHALL mark it as closed and exclude it from future Similarity_Score comparisons.

### Requirement 4: Feedback Roadmap Dashboard

**User Story:** As a platform operator, I want a dashboard showing trending feedback clusters with severity scores and AI-generated briefs, so that I can make informed roadmap decisions based on real user pain points.

#### Acceptance Criteria

1. THE Roadmap_Dashboard SHALL be accessible exclusively to users holding the `platform_admin` role.
2. THE Roadmap_Dashboard SHALL display feedback clusters sorted by Severity_Score in descending order, showing cluster title, occurrence count, distinct user count, average sentiment, and Severity_Score, paginated in pages of 25 clusters.
3. THE Roadmap_Dashboard SHALL provide filtering by category (`bug`, `feature_request`, `usability`, `praise`), date range (start date and end date within the previous 365 days, defaulting to the previous 30 days), and Feedback_Status (`received`, `reviewing`, `planned`, `shipped`, `declined`).
4. WHEN a Platform_Operator selects a feedback cluster, THE Roadmap_Dashboard SHALL display all individual submissions within that cluster including their Context_Snapshots, timestamps, and user roles, paginated in pages of 50 submissions sorted by timestamp descending.
5. THE Roadmap_Dashboard SHALL display an AI-generated feature brief draft for each `feature_request` cluster containing a problem statement, affected user roles, suggested scope, and estimated impact based on cluster data.
6. WHEN a Platform_Operator changes the Feedback_Status of a cluster, THE Roadmap_Dashboard SHALL only permit forward transitions following the sequence `received` → `reviewing` → `planned` → `shipped`, or a transition from `received` or `reviewing` to `declined`, persist the status change, record an audit trail event containing the operator UID, cluster ID, previous status, new status, and timestamp, and trigger the Loop_Closure_Service to notify affected Submitters.
7. THE Roadmap_Dashboard SHALL surface actions to the Action Centre inbox for `platform_admin` users when a new cluster reaches a Severity_Score of 7 or higher, or when a cluster's Feedback_Status has remained at `received` for more than 7 days without review.
8. THE Roadmap_Dashboard SHALL display a trend chart showing feedback volume by category over the previous 30 days, grouped by day.
9. IF the Roadmap_Dashboard has no feedback clusters matching the active filters, THEN THE Roadmap_Dashboard SHALL display an empty state message indicating no clusters match the current filter criteria.

### Requirement 5: Feedback Loop Closure and User Notification

**User Story:** As a user who submitted feedback, I want to be notified when my issue progresses from received to shipped, so that I know the platform team heard me and took action.

#### Acceptance Criteria

1. WHEN a Platform_Operator transitions a feedback cluster's Feedback_Status following the valid transition sequence (`received` → `reviewing` → `planned` → `shipped`, or `received`/`reviewing` → `declined`), THE Loop_Closure_Service SHALL send a notification to every Submitter who contributed a submission to that cluster within 60 seconds of the status transition.
2. THE Loop_Closure_Service SHALL deliver notifications through the existing Architex notification system (in-app notification bell and optional email for users with email notifications enabled).
3. THE Loop_Closure_Service SHALL include in each notification the cluster title, the new status, and a description of the action taken (between 10 and 500 characters, provided by the Platform_Operator at status transition time).
4. WHEN a cluster transitions to `shipped`, THE Loop_Closure_Service SHALL include a link to the relevant release note or changelog entry if one is provided by the Platform_Operator.
5. WHEN a cluster transitions to `declined`, THE Loop_Closure_Service SHALL include the Platform_Operator's reason for declining (between 20 and 1000 characters) so the Submitter understands why.
6. THE Feedback_Widget SHALL display a "My Feedback" section accessible from the widget overlay showing the Submitter's own submissions and their current Feedback_Status values, sorted by submission date descending, limited to the 20 most recent submissions.
7. IF a Submitter's submission belongs to a cluster that has been merged into another cluster, THEN THE Loop_Closure_Service SHALL continue to notify that Submitter about the merged cluster's status transitions.
8. IF the Platform_Operator attempts a status transition without providing the required action description or decline reason meeting the minimum character requirements, THEN THE Roadmap_Dashboard SHALL display a validation error and SHALL NOT persist the transition.

### Requirement 6: Implicit Friction Detection

**User Story:** As a platform operator, I want the system to automatically detect users who are struggling with workflows, so that I can identify usability issues even when users do not explicitly submit feedback.

#### Acceptance Criteria

1. THE Friction_Detector SHALL monitor authenticated user sessions for friction signals: three or more repeated errors on the same action (identified by the combination of page path and interaction target identifier) within 60 seconds, workflow abandonment (navigating away from a multi-step process before completion after reaching step 2 or beyond), and five or more rapid clicks on the same element that produces no state change, navigation, or visible response within 500 milliseconds of each click, all occurring within a 3-second window.
2. WHEN the Friction_Detector identifies a friction signal, THE Friction_Detector SHALL create an implicit Feedback_Submission with category `usability`, a system-generated description of no more than 500 characters containing the friction pattern type, the page path, the interaction target identifier, and the quantified signal (error count, abandonment step number, or click count), and a Context_Snapshot of the page and action where friction occurred.
3. THE Friction_Detector SHALL label implicit submissions distinctly from explicit user submissions using an `implicit: true` flag so Platform_Operators can distinguish between user-reported and system-detected issues.
4. THE Friction_Detector SHALL aggregate implicit signals per user per session and create at most one implicit Feedback_Submission per distinct friction pattern (defined as the unique combination of friction signal type, page path, and interaction target identifier) per user per 24-hour rolling period, preventing duplicate noise.
5. THE Friction_Detector SHALL NOT record or persist any personally identifiable interaction content (form field values, document contents, chat messages) — only structural interaction metadata (page path, action type, error codes, click coordinates relative to element bounds).
6. WHEN an implicit Feedback_Submission is created, THE Friction_Detector SHALL write an audit trail event recording the detection, the friction pattern type, and the affected page path.
7. IF the Friction_Detector encounters a monitoring error (event listener failure or storage write failure), THEN THE Friction_Detector SHALL log the error to the application log with the affected user session identifier and SHALL NOT disrupt the user's active session or surface any error indication to the user.

### Requirement 7: Integration with Platform Spine

**User Story:** As a platform architect, I want the feedback system to integrate with Project Passport, audit trail, and Action Centre, so that feedback is a first-class citizen in the Architex OS rather than a siloed module.

#### Acceptance Criteria

1. THE Feedback_Service SHALL write an audit trail event for every feedback lifecycle action: submission created, cluster merged, status changed, notification sent, implicit friction detected.
2. WHEN a feedback submission is associated with a specific project (Context_Snapshot contains a non-null project ID), THE Feedback_Service SHALL write a reference into that project's Project Passport record linking the feedback to the project context.
3. WHEN a feedback cluster's Severity_Score (on a 1–10 integer scale) reaches 8 or above, THE Roadmap_Dashboard SHALL create an Action Centre inbox item for all users with the `platform_admin` role within 30 seconds of the score computation completing.
4. THE Feedback_Service SHALL use the existing Gemini AI infrastructure (`src/services/geminiService.ts`) for all Intelligence_Engine processing rather than introducing a separate AI provider.
5. THE Feedback_Widget SHALL render within the existing Architex OS shell as a React component receiving the `user: UserProfile` prop, without creating a separate application instance or routing context.
6. THE Feedback_Service SHALL respect the existing Firebase Auth session for user identity and SHALL NOT require separate authentication for feedback operations.
7. WHEN a Platform_Operator takes an action on the Roadmap_Dashboard (status change, cluster merge, brief generation), THE Feedback_Service SHALL surface that action in the Platform_Operator's Action Centre activity log within 30 seconds of the action completing.
8. WHEN a feedback cluster's status has not been reviewed by a `platform_admin` user within 7 calendar days of the cluster being created or last modified, THE Roadmap_Dashboard SHALL create a "pending status review" Action Centre inbox item for all `platform_admin` users.
9. IF the Feedback_Service fails to write an audit trail event or Action Centre item after 3 retry attempts, THEN THE Feedback_Service SHALL log the failure and queue the write for deferred retry without blocking the originating user action.

### Requirement 8: Data Privacy and Rate Limiting

**User Story:** As a platform operator concerned with data quality and abuse prevention, I want feedback submissions rate-limited and privacy-compliant, so that the system remains useful and trustworthy.

#### Acceptance Criteria

1. THE Feedback_Service SHALL enforce a rate limit of 10 feedback submissions per authenticated user per 24-hour rolling window, where a feedback submission is defined as any user-initiated action that creates a new feedback record.
2. IF a Submitter exceeds the rate limit, THEN THE Feedback_Widget SHALL display a message indicating the limit has been reached and the time remaining before they can submit again.
3. IF a feedback submission request is received from an unauthenticated session, THEN THE Feedback_Service SHALL reject the submission and return an error indicating that authentication is required.
4. THE Feedback_Service SHALL apply Firestore security rules ensuring that a user can read only their own submissions, while `platform_admin` users can read all submissions — no other role shall have read access to another user's submission content.
5. WHEN a Submitter requests deletion of their feedback data via the account settings page, THE Feedback_Service SHALL soft-delete all submissions by that user within 72 hours by removing description text and deleting associated Vercel Blob attachments, while retaining only the anonymised submission count per cluster (no user-identifiable fields preserved).
6. THE Feedback_Service SHALL store screenshot attachments using the existing Vercel Blob storage infrastructure, enforcing a maximum file size of 5 MB and a maximum of 3 attachments per submission.
7. WHEN a feedback submission is soft-deleted, THE Feedback_Service SHALL delete all associated Vercel Blob attachments and replace the description field with an empty string, retaining only the submission timestamp and a non-reversible cluster contribution counter.
