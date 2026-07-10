# Requirements Document

## Introduction

Remote Desktop V1 Architecture defines the production system architecture for Architex's in-house remote desktop capability — Sprint 4 of the production-depth review. This spec addresses the architectural integration, privacy/consent, incident handling, and deployment concerns that complement the existing `architex-remote-desktop-core` session-layer specification.

The system enables South African built-environment professionals to share licensed specialist software (AutoCAD, Revit, SketchUp, ArchiCAD, Lumion) on powerful workstations with renters who need temporary access. It builds on the existing resource booking layer (`resource_listings`, `resource_bookings`, `resource_usage_logs`) and enforces app-level isolation — never generic RDP/VNC full-desktop access.

Key architectural constraints from the Sprint 4 review:
- No full-desktop streaming by default — app/window isolation is mandatory
- POPIA-compliant recording and screenshot consent
- Incident and support escalation flow
- Session events fully auditable
- File handoff through Architex FileManager only
- Payment and payout remain human/provider-gated (existing governance preserved)

## Glossary

- **Host_Agent**: Windows-first native agent installed on resource owner workstations that registers availability, publishes allowed apps, enforces app/window/process binding, and writes outputs to the Session_Workspace.
- **Session_Broker**: Server-side Express 5 API that validates booking/owner approval/time window, checks host online/readiness, mints short-lived renter tokens, coordinates WebRTC signalling/TURN, never exposes host credentials, and logs audit events.
- **Browser_Viewer**: React component rendered within the Architex OS shell that receives the approved app/window stream, sends keyboard/mouse events, displays session time/allowed apps/blocked actions, and provides end-session and file handoff status.
- **FileManager_Handoff**: Process by which the Host_Agent uploads allowed session outputs to the Architex FileManager, where the renter accesses files after session completion without host filesystem access.
- **Resource_Owner**: Platform user (BEP, architect, firm) who installs the Host_Agent and publishes workstation resources.
- **Resource_Consumer**: Platform user (freelancer, small practice, subcontractor) who books and connects to a shared workstation.
- **Session_Token**: Short-lived, single-use cryptographic token authorising exactly one Resource_Consumer to connect to exactly one Host_Agent for the duration of a confirmed Booking_Window.
- **Booking_Window**: Confirmed time range from the existing `resource_bookings` collection during which a session may be active.
- **App_Allowlist**: Per-host list of approved application executables that the Host_Agent may launch and stream.
- **Session_Workspace**: Controlled directory on the host where session output files are saved before handoff.
- **Activity_Log**: Append-only Firestore collection (`remote_desktop_session_events`) recording all auditable session events.
- **POPIA**: Protection of Personal Information Act (South African data privacy law).
- **Incident_Report**: A structured record raised by either party or the platform capturing session issues for support resolution.
- **Platform_Admin**: Architex platform operator with oversight, dispute resolution, and session monitoring capabilities.
- **TURN_Server**: Relay server for WebRTC connectivity when direct peer-to-peer connections cannot be established.
- **Grace_Period**: Configurable buffer (default 5 minutes) after Booking_Window end before enforced disconnection.

## Requirements

### Requirement 1: Architecture Constraint — App-Level Isolation Only

**User Story:** As a platform architect, I want the system to enforce app-level window streaming as the only supported access model, so that no generic RDP/VNC full-desktop session can ever be initiated through Architex.

#### Acceptance Criteria

1. THE Session_Broker SHALL reject any session initiation request where the associated booking does not reference at least one entry in the App_Allowlist for the target host, returning a "no_apps_configured" error.
2. THE Host_Agent SHALL refuse to start a session if the session configuration received from the Session_Broker contains zero approved applications, writing a "session_rejected_no_apps" event to the Activity_Log.
3. THE Session_Broker SHALL NOT expose any configuration option, API parameter, or feature flag that enables full-desktop streaming to any user role including Platform_Admin.
4. IF a Host_Agent reports a stream type of "full_desktop" in any heartbeat or session event, THEN THE Session_Broker SHALL immediately terminate the session within 5 seconds, write a "policy_violation_full_desktop" event to the Activity_Log, and notify Platform_Admin via the Action Centre.
5. THE system SHALL validate during Host_Agent registration that the agent version supports app-level window capture; IF the Host_Agent version does not support app-level capture, THEN THE Session_Broker SHALL reject the registration with error "agent_version_unsupported".

### Requirement 2: POPIA Recording and Screenshot Consent Controls

**User Story:** As a resource consumer in South Africa, I want explicit consent controls for any session recording or screenshot capture, so that my privacy rights under POPIA are respected and I can make an informed decision before sharing begins.

#### Acceptance Criteria

1. WHEN a Resource_Consumer connects to a host where the Resource_Owner has enabled session recording, THE Browser_Viewer SHALL display a POPIA consent prompt before any media stream is established, stating: the purpose of recording, the retention period (90 days or until dispute resolution), who has access (Resource_Owner, Resource_Consumer, Platform_Admin), and the Resource_Consumer's right to decline.
2. IF the Resource_Consumer declines the recording consent prompt or does not respond within 60 seconds, THEN THE Session_Broker SHALL cancel the session initiation, write a "consent_declined" event to the Activity_Log, and display a message indicating the session cannot proceed without recording consent.
3. WHEN a Resource_Owner enables session recording on a host, THE system SHALL store the recording consent configuration in the `remote_desktop_hosts` collection including: recording enabled flag, consent text version identifier, and last-updated timestamp.
4. THE system SHALL NOT permit screenshots or screen capture of the Browser_Viewer session viewport by any Architex platform feature (including AI compliance agents) without a separate "screenshot_consent" flag being set to true for the active session by the Resource_Consumer.
5. IF the Resource_Owner changes the recording policy for a host while a session is active, THEN THE system SHALL NOT apply the new policy to the current session; the new policy SHALL take effect only for sessions initiated after the policy change.
6. THE system SHALL store POPIA consent records in the `remote_desktop_session_events` collection as a "popia_consent_granted" event containing: consent type (recording or screenshot), consent text version, Resource_Consumer UID, timestamp, and IP address hash (SHA-256 of the consumer's IP, not the raw IP).
7. WHEN the Session_Broker generates a Session_Token for a host with recording enabled, THE Session_Token SHALL include a "recording_required" flag so that the Browser_Viewer knows to prompt consent before establishing the media stream.

### Requirement 3: Incident and Support Escalation Flow

**User Story:** As a resource consumer or resource owner, I want to raise incidents during or after a session, so that technical issues, policy violations, or disputes are captured and routed to the correct support channel.

#### Acceptance Criteria

1. WHILE a session is active, THE Browser_Viewer SHALL provide a "Report Issue" action that opens a structured incident form with fields: category (one of: connection_quality, app_not_working, security_concern, billing_dispute, other), description (10–1000 characters), and optional screenshot attachment (captured from the current viewport with explicit user action, maximum 5 MB).
2. WHEN a Resource_Consumer or Resource_Owner submits an Incident_Report, THE system SHALL write the report to a `remote_desktop_incidents` collection containing: incident ID, session ID, booking ID, reporter UID, reporter role, category, description, screenshot reference (if attached), creation timestamp, and status (open).
3. WHEN an Incident_Report is created, THE system SHALL emit a WorkflowEvent to the Action Centre targeting Platform_Admin and the opposing party (Resource_Owner if raised by Resource_Consumer, and vice versa) within 60 seconds.
4. WHEN an Incident_Report has category "security_concern", THE Session_Broker SHALL immediately pause input forwarding to the Host_Agent (blocking all keyboard and mouse events from the Resource_Consumer) within 5 seconds of report submission, pending Platform_Admin review.
5. THE Platform_Admin SHALL be able to update incident status to one of: investigating, resolved, escalated, or closed, with a resolution note (10–2000 characters) that is visible to both the Resource_Owner and Resource_Consumer.
6. IF an incident with category "security_concern" is not reviewed by Platform_Admin within 15 minutes, THEN THE system SHALL terminate the associated session if still active, write a "session_terminated_security_timeout" event to the Activity_Log, and notify both parties.
7. WHEN a Resource_Owner activates "Terminate Session" due to a suspected policy violation, THE system SHALL auto-create an Incident_Report with category "security_concern", pre-populated with the session details and termination timestamp, requiring only a description from the Resource_Owner.
8. THE Resource_Consumer SHALL be able to raise an Incident_Report for up to 72 hours after session completion, referencing the session ID and booking ID from the session history.

### Requirement 4: Session Start Gate — Booking Validation and Host Readiness

**User Story:** As a platform operator, I want session start to be gated by a multi-condition check (booking confirmed, owner approved, time window active, host online), so that no session can begin unless all preconditions are satisfied simultaneously.

#### Acceptance Criteria

1. WHEN a Resource_Consumer requests to start a session, THE Session_Broker SHALL validate all of the following conditions before generating a Session_Token: (a) the referenced booking exists in `resource_bookings` with status "confirmed", (b) the booking has been approved by the Resource_Owner (owner confirmation recorded), (c) the current UTC time is within the Booking_Window start time minus 15 minutes and the Booking_Window end time, and (d) the target host has a heartbeat timestamp less than 90 seconds old with status "idle" or "online".
2. IF any of the four preconditions in criterion 1 are not satisfied, THEN THE Session_Broker SHALL reject the session start request and return a structured error indicating which specific conditions failed (one or more of: "booking_not_confirmed", "owner_not_approved", "outside_time_window", "host_offline").
3. WHEN the Session_Broker validates the booking reference, THE Session_Broker SHALL read from the existing `resource_bookings` collection and SHALL NOT maintain a separate copy of booking state, ensuring the booking governance layer remains the single source of truth.
4. IF the host transitions from "idle" to "offline" between session start validation and WebRTC connection establishment, THEN THE Session_Broker SHALL abort the session within 10 seconds, revoke the issued Session_Token, and return a "host_went_offline" error to the Browser_Viewer.
5. THE Session_Broker SHALL log a "session_gate_check" event to the Activity_Log for every session start attempt (successful or rejected) containing: booking ID, consumer UID, host ID, each condition result (pass or fail), and timestamp.

### Requirement 5: Data Model Integration with Existing Resource Layer

**User Story:** As a platform developer, I want the remote desktop data model to reference and extend the existing resource booking collections, so that session data is traceable back to listings, bookings, and usage logs without duplication.

#### Acceptance Criteria

1. THE `remote_desktop_hosts` collection SHALL contain a `resourceListingId` field referencing the corresponding document in `resource_listings`, establishing a one-to-one relationship between a host registration and its marketplace listing.
2. THE `remote_desktop_sessions` collection SHALL contain a `bookingId` field referencing the corresponding document in `resource_bookings`, and the Session_Broker SHALL validate that the referenced booking document exists before creating a session record.
3. WHEN a session completes, THE system SHALL write a usage record to the existing `resource_usage_logs` collection using the `buildResourceUsageLedgerEntry` function from `resourceBookingService`, passing the actual connected duration and session billing data, so that remote desktop usage flows through the same billing pipeline as other resource types.
4. THE `remote_desktop_apps` collection SHALL contain a `hostId` field referencing the corresponding document in `remote_desktop_hosts`, and the system SHALL enforce referential integrity by rejecting app entries that reference a non-existent host.
5. THE `remote_desktop_file_manifests` collection SHALL contain both `sessionId` (referencing `remote_desktop_sessions`) and `bookingId` (referencing `resource_bookings`) fields, allowing file handoff queries from either the session or booking perspective.
6. WHEN a host registration is deleted or deactivated, THE system SHALL cascade the status change to all associated `remote_desktop_apps` entries (marking them "unavailable") and SHALL prevent new sessions from being created for that host, while retaining all historical session and event records.
7. THE system SHALL expose a compound query on `remote_desktop_sessions` joining session data with booking data from `resource_bookings` to support the Analytics Engine KPI calculations (utilisation rate, revenue per host) without requiring data duplication.

### Requirement 6: Input Blocking When Focus Leaves Allowed App

**User Story:** As a resource owner, I want all renter input to be blocked the instant focus moves away from an allowed application window, so that my workstation is protected from any unauthorised interaction.

#### Acceptance Criteria

1. WHILE a session is active, WHEN the operating system focus moves to a window belonging to a process not in the App_Allowlist, THE Host_Agent SHALL block all keyboard and mouse input from the Resource_Consumer within 100 milliseconds of the focus change.
2. WHEN input is blocked due to focus leaving an allowed app, THE Host_Agent SHALL display a static overlay frame to the Browser_Viewer with a message indicating "Input paused — focus returned to host" and write a "focus_violation_blocked" event to the Activity_Log.
3. WHEN the operating system focus returns to a window belonging to a process in the App_Allowlist, THE Host_Agent SHALL resume forwarding keyboard and mouse input from the Resource_Consumer within 100 milliseconds.
4. IF focus remains outside allowed applications for more than 30 seconds continuously, THEN THE Host_Agent SHALL write a "prolonged_focus_violation" event to the Activity_Log and notify the Resource_Owner via the system tray notification.
5. THE Host_Agent SHALL prevent the Resource_Consumer from programmatically setting focus to windows outside the App_Allowlist via simulated input events, API calls, or accessibility automation interfaces.
6. WHILE input is blocked, THE Browser_Viewer SHALL display a visual indicator to the Resource_Consumer showing that input forwarding is suspended and the reason (focus moved outside allowed application).

### Requirement 7: Short-Lived Session Token Security

**User Story:** As a security engineer, I want session tokens to have strict short-lived scoping with no reuse or extension capability, so that credential compromise has minimal blast radius.

#### Acceptance Criteria

1. THE Session_Token SHALL have a maximum validity duration equal to the Booking_Window duration plus the configured Grace_Period, and SHALL NOT exceed 24 hours under any circumstance regardless of Booking_Window length.
2. THE Session_Broker SHALL store issued Session_Tokens in a server-side token store with automatic expiry (TTL) matching the token validity duration; expired tokens SHALL be purged from the store within 60 seconds of expiry.
3. IF a Session_Token is presented after its expiry timestamp, THEN THE Session_Broker SHALL reject the connection attempt with an "expired_token" reason code regardless of whether the token was previously valid.
4. THE Session_Token SHALL be single-use for initial connection establishment; after the first successful WebRTC connection, the token SHALL be marked as "consumed" and cannot be used to establish a new connection (reconnections within the Booking_Window use a separate reconnection token derived from the original).
5. IF the Session_Broker detects two simultaneous connection attempts using the same Session_Token, THEN THE Session_Broker SHALL reject the second attempt, write a "duplicate_token_use" event to the Activity_Log, and alert Platform_Admin.
6. THE Session_Token payload SHALL be signed using HMAC-SHA256 with a server-side secret rotated every 24 hours; the Session_Broker SHALL validate the signature on every token presentation.
7. THE system SHALL NOT persist Session_Token values in Firestore, browser localStorage, or any client-side storage beyond the active browser session memory; tokens SHALL be held only in the Session_Broker server memory and the Browser_Viewer JavaScript runtime.

### Requirement 8: Session Event Auditability

**User Story:** As a platform admin, I want every meaningful session event to be captured in a queryable, tamper-evident audit log, so that disputes can be resolved with complete evidence.

#### Acceptance Criteria

1. THE `remote_desktop_session_events` collection SHALL record events with the following mandatory fields for every entry: event ID (unique), session ID, booking ID, event type, actor UID, actor role (consumer, owner, system, admin), host ID, UTC timestamp with millisecond precision, and a metadata object (maximum 8 KB serialized).
2. THE system SHALL emit audit events for at minimum: session_gate_check, session_started, session_ended, app_launched, app_closed, file_created, file_modified, focus_violation_blocked, prolonged_focus_violation, child_process_blocked, clipboard_transfer, input_blocked, input_resumed, quality_profile_changed, auto_disconnect, reconnection_attempted, popia_consent_granted, consent_declined, incident_raised, token_revoked, and policy_violation_full_desktop.
3. THE Activity_Log records SHALL be append-only; no user role including Platform_Admin SHALL be able to modify or delete records during the 12-month retention period.
4. THE system SHALL support querying session events by: session ID (returning all events for a session ordered by timestamp ascending), host ID with date range filter, consumer UID with date range filter, and event type with date range filter, each returning paginated results of maximum 200 records per page.
5. WHEN a session event is written, THE system SHALL include a SHA-256 hash of the previous event in the same session (chain hash), creating a tamper-evident linked chain within each session's event sequence.
6. IF an event write fails, THEN THE system SHALL retry up to 3 times with exponential backoff (1s, 2s, 4s) without terminating the session; if all retries fail, THE Host_Agent SHALL buffer the event locally (maximum 10,000 events) and flush upon connectivity restoration.

### Requirement 9: FileManager Handoff with Approval Gate

**User Story:** As a resource consumer, I want my session output files delivered through the Architex FileManager after owner approval, so that I receive my work without ever having direct access to the host filesystem.

#### Acceptance Criteria

1. WHEN a session ends, THE Host_Agent SHALL compile a final file manifest from the Session_Workspace and write it to the `remote_desktop_file_manifests` collection containing: manifest ID, session ID, booking ID, consumer UID, owner UID, file entries (name, size bytes, extension, SHA-256 hash, transfer status "pending_approval"), manifest timestamp, and owner approval status "pending".
2. THE Resource_Owner SHALL receive a notification in the Action Centre prompting file handoff approval within 5 minutes of the manifest being written, showing: file count, total size, individual file names and extensions.
3. WHEN the Resource_Owner approves the file handoff, THE system SHALL upload each approved file from the Session_Workspace to the Architex FileManager and update each file's transfer status from "pending_approval" through "uploading" to "completed" upon successful upload.
4. IF the Resource_Owner rejects specific files from the manifest, THEN THE system SHALL mark those files as "rejected" in the manifest, notify the Resource_Consumer of which files were rejected, and proceed with uploading only the approved files.
5. THE system SHALL block any file in the Session_Workspace that matches a configurable deny-list of file extensions (default: .exe, .dll, .sys, .bat, .cmd, .ps1, .vbs, .reg) from appearing in the handoff manifest, writing a "file_blocked_extension" event to the Activity_Log for each blocked file.
6. IF the Resource_Owner does not approve or reject the file handoff within 72 hours, THEN THE Host_Agent SHALL delete the Session_Workspace contents, mark the manifest as "expired", and notify the Resource_Consumer that files are no longer available.
7. THE Resource_Consumer SHALL NOT have any mechanism to access the host filesystem directly, download files from the host outside the FileManager handoff process, or initiate file transfers without Resource_Owner approval.
8. WHEN files are successfully uploaded to the FileManager, THE system SHALL associate them with the booking's project reference (if one exists) and tag them with session ID, upload timestamp, and original file hashes for traceability.

### Requirement 10: Renter Browser Viewer — Session Awareness

**User Story:** As a resource consumer, I want the browser viewer to clearly display my session boundaries, allowed actions, and time remaining, so that I always know what I can and cannot do during a session.

#### Acceptance Criteria

1. WHILE a session is active, THE Browser_Viewer SHALL display a persistent session control bar showing: session elapsed time (HH:MM:SS, updated every 1 second), remaining time in the Booking_Window (HH:MM:SS, updated every 1 second), list of allowed applications (names from App_Allowlist, maximum 10), connection quality indicator, and file handoff status.
2. WHILE a session is active, THE Browser_Viewer SHALL display a list of blocked actions visible to the Resource_Consumer including: "Full desktop access", "File system browsing", "Installing software", "Accessing other applications", "Clipboard transfer" (when disabled), ensuring the renter has clear expectations.
3. WHEN the remaining Booking_Window time reaches 5 minutes, THE Browser_Viewer SHALL display a prominent countdown warning that does not obstruct the session viewport, changing color from amber to red when 1 minute remains.
4. THE Browser_Viewer SHALL provide an "End Session" button that gracefully terminates the connection, triggers file manifest compilation on the Host_Agent, and displays a session summary (duration, apps used, files produced).
5. IF the Resource_Consumer clicks "End Session", THE Browser_Viewer SHALL display a confirmation dialog before disconnecting, stating: "This will end your remote session. Any unsaved work in remote applications may be lost."
6. WHEN a session ends (by any mechanism), THE Browser_Viewer SHALL display a session summary panel showing: total connected time, applications used, files produced (count and total size), disconnection reason, and file handoff status with a link to the booking detail view.

### Requirement 11: Host Agent Distribution and Update Strategy

**User Story:** As a resource owner, I want to download, install, and update the Host Agent through the Architex platform, so that I always have the latest security patches and features without manual intervention.

#### Acceptance Criteria

1. THE Architex web interface SHALL provide a download page for the Host_Agent installer accessible only to authenticated users with roles that can own resources (BEP, architect, firm_admin, freelancer, contractor), showing: current version number, minimum OS requirements (Windows 10 build 1903+), installer size, and SHA-256 checksum.
2. WHEN the Host_Agent starts, THE Host_Agent SHALL check for available updates by querying the Session_Broker version endpoint; IF a newer version is available, THE Host_Agent SHALL notify the Resource_Owner and offer an "Update Now" action.
3. IF the Host_Agent version is more than 2 major versions behind the current release, THEN THE Session_Broker SHALL refuse to generate Session_Tokens for that host, returning "agent_update_required" error, and display the requirement in the Action Centre.
4. THE Host_Agent installer SHALL be code-signed with an Architex certificate; IF Windows SmartScreen or the user's antivirus blocks the installer, the download page SHALL display troubleshooting guidance.
5. WHEN the Host_Agent updates, THE Host_Agent SHALL complete the update within 5 minutes, preserve all host configuration (App_Allowlist, Session_Workspace path, recording policy), and resume heartbeat reporting without requiring re-authentication.
6. THE Host_Agent SHALL support silent update mode (no user interaction required) when no session is active; IF a session is active during an available update, THE Host_Agent SHALL defer the update until the session completes.

### Requirement 12: Existing Governance Preservation

**User Story:** As a platform operator, I want all existing booking governance guarantees (human approval, no auto-confirm, no auto-payout) preserved and extended to remote desktop sessions, so that the trust model remains intact.

#### Acceptance Criteria

1. THE Session_Broker SHALL generate Session_Tokens only for bookings that have passed through the existing `evaluateResourceBookingGovernance` function with status "approved", satisfying both `humanApprovalRequired` and `autoConfirmProhibited` invariants.
2. THE system SHALL NOT auto-confirm bookings, auto-generate tokens without owner confirmation, or auto-finalise billing records under any circumstance, regardless of session outcome or duration.
3. WHEN a session completes, THE system SHALL create a usage record through the existing `buildResourceUsageLedgerEntry` pipeline, preserving the `autoPayoutProhibited` invariant by requiring explicit Resource_Owner approval before the billing record is finalised.
4. IF the Resource_Owner does not finalise the usage log within 14 calendar days of session completion, THEN THE system SHALL flag the record for Platform_Admin review and SHALL NOT auto-finalise the billing, preserving the human-gated payment model.
5. THE system SHALL preserve the existing booking lifecycle (pending → confirmed → completed) by extending it with session-aware transitions: confirmed → session_active → session_completed, where each transition is recorded in the existing `resource_bookings` collection.
6. WHEN the existing `canConfirmResourceBooking` function reports a conflict for a booking, THE Session_Broker SHALL refuse to generate a Session_Token for that booking regardless of host readiness.

### Requirement 13: Data Model — Remote Desktop Collections

**User Story:** As a platform developer, I want clearly defined Firestore collections for remote desktop state, so that all session data is persistable, queryable, and consistent with the existing data architecture.

#### Acceptance Criteria

1. THE system SHALL persist host registrations in the `remote_desktop_hosts` collection with fields: host ID, owner UID, resourceListingId (referencing `resource_listings`), machine name (max 64 characters), OS version (max 64 characters), hardware specs object (CPU model max 128 chars, RAM MB integer, GPU model max 128 chars, storage GB integer), status (online, offline, in_session, maintenance), last heartbeat timestamp (UTC ms), registration timestamp (UTC ms), agent version (semver string max 20 chars), configuration object (grace period seconds 0–900, clipboard policy enabled/disabled, recording enabled/disabled, session workspace path max 512 chars, consent text version max 32 chars).
2. THE system SHALL persist allowed applications in the `remote_desktop_apps` collection with fields: app ID, hostId (referencing `remote_desktop_hosts`), display name (max 128 chars), executable path (max 512 chars), software category (max 64 chars), validation status (valid, unavailable, pending), last validated timestamp (UTC ms).
3. THE system SHALL persist session records in the `remote_desktop_sessions` collection with fields: session ID, bookingId (referencing `resource_bookings`), hostId (referencing `remote_desktop_hosts`), consumer UID, owner UID, project reference (optional max 128 chars), status (pending, active, completed, terminated, failed), connection type (peer_to_peer, turn_relay), start timestamp (UTC ms), end timestamp (UTC ms), total connected seconds (integer 0–86400), total disconnection gap seconds (integer 0–86400), applications used (array of app IDs max 50), files produced count (integer 0–10000), disconnection reason (max 256 chars), billed duration minutes (integer 0–1440), owner approved flag (boolean), recording consent granted (boolean).
4. THE system SHALL persist audit events in the `remote_desktop_session_events` collection with fields: event ID, sessionId (referencing `remote_desktop_sessions`), booking ID, event type (max 64 chars), actor UID, actor role (max 64 chars), host ID, timestamp (UTC ms), previous event hash (SHA-256 hex 64 chars, nullable for first event), metadata object (max 8 KB serialized).
5. THE system SHALL persist file manifests in the `remote_desktop_file_manifests` collection with fields: manifest ID, sessionId (referencing `remote_desktop_sessions`), booking ID, consumer UID, owner UID, files array (max 200 entries, each: name max 256 chars, size bytes integer, extension max 16 chars, SHA-256 hash 64-char hex, transfer status one of pending_approval/uploading/completed/failed/rejected), manifest timestamp (UTC ms), owner approval status (pending/approved/rejected/expired), approval timestamp (UTC ms nullable), expiry timestamp (UTC ms).
6. THE system SHALL persist incident reports in the `remote_desktop_incidents` collection with fields: incident ID, session ID, booking ID, reporter UID, reporter role, category (connection_quality, app_not_working, security_concern, billing_dispute, other), description (max 1000 chars), screenshot reference (optional, max 512 chars), status (open, investigating, resolved, escalated, closed), resolution note (max 2000 chars nullable), created timestamp (UTC ms), updated timestamp (UTC ms), resolved timestamp (UTC ms nullable).

### Requirement 14: Platform Integration — Action Centre, Project Passport, and Analytics

**User Story:** As a platform architect, I want remote desktop sessions to emit events to the Action Centre, write records to the Project Passport, and feed the Analytics Engine, so that remote access is a first-class citizen in the Architex workflow lifecycle.

#### Acceptance Criteria

1. WHEN a booking requires session-start confirmation (host ready, time window approaching), THE system SHALL surface an actionable item in the Resource_Consumer's Action Centre showing: host name, booked time window, and a "Connect Now" action that initiates the session start flow.
2. WHEN a session completes with a project reference, THE system SHALL write a ProjectRecord to the Project Passport containing: session ID, booking reference, consumer UID, connected duration minutes, applications used (names), files produced count, and disconnection reason.
3. THE system SHALL emit WorkflowEvents to the Action Centre for: session_started (informational to owner), session_ended (informational to both parties), focus_violation_blocked (alert to owner), incident_raised (actionable to target party), file_handoff_pending (actionable to owner), and billing_pending (actionable to owner).
4. THE system SHALL expose session metrics to the Analytics & Reporting Engine for the following KPIs: host utilisation rate (connected hours / available hours per host per month), revenue per host (billed ZAR per host per month), session reliability (successful connections / total attempts per month), average session duration (minutes), and incident rate (incidents / total sessions per month).
5. WHEN a file handoff is completed, THE system SHALL register the uploaded files in the project's document registry (via the existing Documents & Drawing Intelligence layer) tagged with: session ID, upload timestamp, source host name, and original file hashes.
6. IF the system fails to write a ProjectRecord or emit a WorkflowEvent (network error, permission denied), THEN THE system SHALL queue the write for retry up to 3 attempts at 30-second intervals and log the failure to the Activity_Log.
