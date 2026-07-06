# Requirements Document

## Introduction

The Remote Desktop Secure Platform transforms the existing resource booking and governance layer into a first-class Architex OS module with secure remote session technology. It enables resource owners (firms with expensive software licenses such as Revit, ArchiCAD, SketchUp) to securely share workstation access with resource consumers (freelancers, small practices, subcontractors) through time-bounded, sandboxed, and fully auditable remote desktop sessions.

The module elevates from its current position buried under the Governance group into its own highly visible navigation group with a dedicated route, integrating Apache Guacamole (or equivalent self-hosted gateway) for secure session delivery. All existing governance guarantees (human approval required, auto-confirm prohibited, auto-payout prohibited) are preserved and extended with session-level enforcement.

## Glossary

- **Session_Gateway**: The server-side component (Apache Guacamole or equivalent) that brokers secure remote desktop connections between the Resource_Consumer's browser and the Resource_Owner's host machine.
- **Resource_Owner**: A platform user (BEP, architect, firm) who publishes a workstation or software seat for governed remote access.
- **Resource_Consumer**: A platform user (freelancer, small practice, subcontractor) who books and connects to a shared workstation resource.
- **Platform_Admin**: An Architex platform operator with oversight, dispute resolution, and activity monitoring capabilities.
- **Session_Credential**: A temporary access token generated for a specific booking window that grants connection rights to the Session_Gateway.
- **Booking_Window**: A confirmed time range during which a Resource_Consumer has permission to connect to a resource.
- **Session_Sandbox**: The isolated execution environment restricting the Resource_Consumer to specific applications and file paths on the host machine.
- **Activity_Log**: A structured record of actions performed during a remote session, including connection events, application launches, and file operations.
- **Session_Recording**: An optional screen capture or event replay of a remote session stored for audit and dispute resolution.
- **Auto_Disconnect**: The automatic termination of a remote session when the Booking_Window expires.
- **Grace_Period**: A configurable buffer (default 5 minutes) after the Booking_Window end during which the Session_Gateway warns the Resource_Consumer before enforcing Auto_Disconnect.
- **Connection_Profile**: A Guacamole connection configuration defining the protocol (RDP/VNC), host address, port, application restrictions, and display settings for a specific resource listing.
- **Module_Shell**: The dedicated navigation group, route, and UI workspace within the Architex OS shell where the Remote Desktop module renders.
- **Bandwidth_Adaptation**: Dynamic adjustment of session quality (colour depth, frame rate, compression) based on detected network conditions.
- **File_Boundary**: A defined set of directories or paths that the Resource_Consumer may access on the host machine during a session.

## Requirements

### Requirement 1: Module Independence and Navigation

**User Story:** As a platform user, I want the Remote Desktop module to have its own dedicated navigation group and route, so that I can discover and access it without navigating through unrelated governance tools.

#### Acceptance Criteria

1. THE Module_Shell SHALL render as a dedicated top-level navigation group in the Architex OS sidebar with its own icon and label ("Remote Desktop"), positioned as a sibling to existing top-level groups (e.g., "Projects", "Toolboxes").
2. THE Module_Shell SHALL be accessible at a dedicated route (`/remote-desktop`) within the Architex OS shell.
3. WHEN a user with an authorised role navigates to the Remote Desktop module, THE Module_Shell SHALL render inside the authenticated content area of the Architex OS layout, inheriting the OS header (with breadcrumb trail displaying "Remote Desktop" as the module segment), and sidebar context.
4. THE Module_Shell SHALL be visible in the sidebar to users with roles: bep, architect, freelancer, contractor, subcontractor, firm_admin, and platform_admin.
5. IF a user without an authorised role attempts to access the `/remote-desktop` route, THEN THE Module_Shell SHALL redirect the user to the Command Centre within 1 second without displaying an error message or notification.
6. IF an unauthenticated user attempts to access the `/remote-desktop` route, THEN THE Module_Shell SHALL redirect the user to the platform login screen without rendering any module content.

### Requirement 2: Session Gateway Integration

**User Story:** As a platform operator, I want a self-hosted session gateway integrated into the platform, so that remote desktop connections remain within Architex infrastructure without redirecting users to third-party applications.

#### Acceptance Criteria

1. THE Session_Gateway SHALL support RDP and VNC protocols for connecting to Resource_Owner host machines.
2. THE Session_Gateway SHALL deliver remote sessions to the Resource_Consumer's browser using HTML5 over encrypted WebSocket transport (WSS) without requiring client-side plugin installation.
3. THE Session_Gateway SHALL be self-hosted on Architex-controlled infrastructure and present connections within the Architex OS shell via an embedded viewer component.
4. WHEN a Resource_Consumer initiates a session, THE Session_Gateway SHALL establish the connection using the Connection_Profile associated with the booked resource listing.
5. IF the Session_Gateway fails to establish a connection within 30 seconds, THEN THE Session_Gateway SHALL return a structured error to the Module_Shell with a reason code (host_unreachable, authentication_failed, gateway_unavailable).
6. IF the Connection_Profile associated with the booked resource listing is missing or contains invalid configuration (unresolvable host, port outside 1–65535, or unsupported protocol), THEN THE Session_Gateway SHALL reject the session initiation and return a structured error to the Module_Shell with a reason code of "invalid_connection_profile".
7. THE Session_Gateway SHALL support a minimum of 20 concurrent sessions across different resources, where each session operates with independent connection state, independent lifecycle (connect/disconnect of one session does not affect others), and no cross-session data leakage.

### Requirement 3: Credential Lifecycle Management

**User Story:** As a resource owner, I want temporary access credentials generated only for confirmed booking windows, so that consumers cannot access my machine outside their booked time.

#### Acceptance Criteria

1. WHEN a booking reaches "confirmed" status, THE Session_Gateway SHALL generate a Session_Credential bound to the specific Booking_Window start and end times within 5 seconds of the status transition.
2. THE Session_Credential SHALL expire automatically at the Booking_Window end time plus a Grace_Period of 5 minutes.
3. WHILE a Booking_Window has not started, THE Session_Credential SHALL reject connection attempts with a "session_not_started" reason code. WHILE the Booking_Window end time plus Grace_Period has elapsed, THE Session_Credential SHALL reject connection attempts with a "session_expired" reason code.
4. IF a booking is cancelled after credential generation, THEN THE Session_Gateway SHALL revoke the associated Session_Credential within 60 seconds.
5. THE Session_Credential SHALL be scoped to a single Resource_Consumer and a single resource; reuse across different bookings or users SHALL be rejected by the Session_Gateway.
6. THE Session_Gateway SHALL store credential metadata (creation time, expiry time, booking reference, revocation status) in the platform audit trail.
7. WHEN the Booking_Window end time plus Grace_Period elapses while a session is active, THE Session_Gateway SHALL terminate the active connection within 30 seconds and return a "session_expired" reason code to the Resource_Consumer.

### Requirement 4: Time-Bounded Sessions and Auto-Disconnect

**User Story:** As a resource owner, I want sessions to terminate automatically when booking time expires, so that consumers cannot overstay their allocated window.

#### Acceptance Criteria

1. WHEN a session is active and the Booking_Window end time minus the configured Grace_Period is reached, THE Session_Gateway SHALL display a countdown warning overlay to the Resource_Consumer showing remaining time in minutes and seconds, updated every 1 second until disconnection or voluntary departure.
2. WHEN the Booking_Window end time plus the configured Grace_Period is reached, THE Session_Gateway SHALL terminate the active session, close the connection, and invalidate the Session_Credential so that no further reconnection is permitted for that booking.
3. WHEN Auto_Disconnect is triggered, THE Session_Gateway SHALL log the disconnection event with timestamp, booking reference, and reason "booking_window_expired" to the Activity_Log.
4. IF a Resource_Consumer disconnects voluntarily before the Booking_Window end time, THEN THE Session_Gateway SHALL log the early disconnection and keep the Session_Credential valid for reconnection until the Booking_Window end time plus Grace_Period is reached.
5. THE Resource_Owner SHALL be able to configure the Grace_Period per resource listing between 0 and 15 minutes in 1-minute increments (default 5 minutes).
6. IF a Resource_Consumer disconnects after the Booking_Window end time but before the Grace_Period expires, THEN THE Session_Gateway SHALL allow reconnection using the existing Session_Credential until the Booking_Window end time plus Grace_Period is reached, without resetting the countdown timer.

### Requirement 5: Application Sandboxing

**User Story:** As a resource owner, I want to restrict remote sessions to specific software applications, so that consumers can only access the tools they booked and nothing else on my machine.

#### Acceptance Criteria

1. WHEN publishing a resource listing, THE Resource_Owner SHALL specify between 1 and 20 permitted application paths (each path a maximum of 260 characters) that define the Session_Sandbox; THE system SHALL validate that each path references a recognized executable format before accepting the listing.
2. WHILE a session is active, THE Session_Sandbox SHALL restrict the Resource_Consumer's view to only windows belonging to processes launched from permitted application paths, hiding all other desktop windows, taskbar entries, and system shell access from the Resource_Consumer.
3. IF the Session_Gateway does not support application-level isolation for the configured protocol, THEN THE Session_Gateway SHALL fall back to full desktop mode, record a "sandbox_fallback" warning in the Activity_Log, and notify the Resource_Owner that the session is running without application isolation.
4. WHEN the Resource_Owner updates the permitted application list for a resource listing, THE system SHALL apply changes to future bookings only and SHALL NOT modify the sandbox configuration of any active session.
5. WHEN a session starts in sandboxed mode, THE Module_Shell SHALL display a badge indicating "App-Only Access" to the Resource_Consumer.
6. IF one or more permitted application paths cannot be resolved to a launchable executable at session start, THEN THE Session_Sandbox SHALL exclude the unresolvable paths from the session, notify the Resource_Consumer which applications are unavailable, and proceed with the remaining valid paths.
7. IF none of the permitted application paths can be resolved to a launchable executable at session start, THEN THE Session_Gateway SHALL prevent the session from starting in sandboxed mode and notify both the Resource_Owner and Resource_Consumer that the sandbox configuration is invalid.

### Requirement 6: File Isolation

**User Story:** As a resource owner, I want to restrict which files and directories remote users can access, so that my confidential project data remains protected during shared sessions.

#### Acceptance Criteria

1. WHEN publishing a resource listing, THE Resource_Owner SHALL define a File_Boundary specifying between 1 and 10 allowed directory paths (each path a maximum of 260 characters) accessible during sessions.
2. WHILE a session is active, THE Session_Sandbox SHALL enforce the File_Boundary so that the Resource_Consumer cannot navigate outside permitted directories using file dialogs, command prompts, or application browse interfaces.
3. IF no File_Boundary is configured for a resource listing, THEN THE Session_Gateway SHALL apply a default boundary restricting access to a dedicated shared workspace directory only (e.g., `C:\ArchitexShared\{bookingId}\`).
4. THE Resource_Owner SHALL be able to modify File_Boundary settings per listing; modifications SHALL apply to future sessions only and SHALL NOT alter the boundaries of any active session.
5. WHEN a Resource_Consumer attempts to access a path outside the File_Boundary, THE Activity_Log SHALL record the attempt with timestamp, attempted path, session reference, and actor UID.

### Requirement 7: Activity Auditing

**User Story:** As a platform admin, I want comprehensive activity logs for every remote session, so that disputes can be resolved with evidence and accountability is maintained.

#### Acceptance Criteria

1. THE Activity_Log SHALL record the following events for every session: connection_started, connection_ended, application_launched, file_accessed, clipboard_used, sandbox_violation_attempted, and auto_disconnect_triggered. Each event record SHALL contain: event type, session ID, actor UID, actor role, resource ID, project ID (if session is project-scoped), and a UTC timestamp with at least second precision.
2. WHEN a session ends normally or is terminated, THE Session_Gateway SHALL write a session summary to the Activity_Log containing: total connected duration in whole seconds, list of applications used, list of file paths accessed, and disconnection reason (one of: user_initiated, booking_window_expired, idle_timeout, sandbox_violation, owner_revoked, system_error).
3. THE Activity_Log SHALL be queryable by Platform_Admin (all sessions), the Resource_Owner (sessions on their own resources only), and the Resource_Consumer (their own sessions only). Queries SHALL support filtering by date range, session ID, actor UID, and event type, and SHALL return results within 5 seconds for up to 10,000 matching records.
4. THE Activity_Log SHALL retain records for a minimum of 12 months from the event timestamp. Activity_Log records SHALL be append-only and SHALL NOT be modifiable or deletable by any user role, including Platform_Admin, during the retention period.
5. THE Activity_Log SHALL integrate with the Architex platform audit trail, writing session events as auditable WorkflowEvents linked to the project context when the session's resource is associated with a project ID in the platform.
6. IF the Activity_Log fails to persist an event during an active session, THEN THE Session_Gateway SHALL retry the write up to 3 times with a 1-second interval, and if all retries fail, SHALL buffer the event locally and flush it to the Activity_Log when connectivity is restored, without terminating the active session.

### Requirement 8: Session Recording

**User Story:** As a resource owner, I want the option to enable session recording, so that I have evidence of what happened during a session in case of disputes.

#### Acceptance Criteria

1. WHEN publishing a resource listing, THE Resource_Owner SHALL be able to enable or disable Session_Recording for that resource, with Session_Recording defaulting to disabled for new listings.
2. WHILE Session_Recording is enabled and a session is active, THE Session_Gateway SHALL capture a screen recording of the session.
3. WHEN a Resource_Consumer connects to a resource with Session_Recording enabled, THE Module_Shell SHALL display a "Recording Active" indicator that remains visible throughout the entire session duration without requiring user action to reveal it.
4. THE Session_Recording SHALL be accessible only to the Resource_Owner, the Resource_Consumer for that session, and Platform_Admin, with no other users able to view or download the recording.
5. IF Session_Recording is enabled, THEN THE Module_Shell SHALL inform the Resource_Consumer that the session will be recorded before the session starts and require the Resource_Consumer to confirm acceptance before the connection proceeds.
6. IF the Resource_Consumer declines the recording acknowledgement, THEN THE Module_Shell SHALL cancel the connection attempt, not start the session, and display a message indicating that the session cannot proceed without recording consent.
7. IF the Session_Gateway detects a recording failure during an active session, THEN THE Session_Gateway SHALL notify both the Resource_Owner and Resource_Consumer that recording has been interrupted and SHALL log the failure event against the session record.
8. THE Session_Recording SHALL be retained for 90 days after session completion, after which the platform SHALL automatically delete the recording.
9. IF a dispute referencing a Session_Recording is open at the time the 90-day retention period expires, THEN THE platform SHALL retain the recording until 30 days after the dispute is resolved, then delete it.

### Requirement 9: Bandwidth Adaptation for SA Network Conditions

**User Story:** As a resource consumer on a limited South African internet connection, I want the session to adapt to my available bandwidth, so that I can work productively even on constrained networks.

#### Acceptance Criteria

1. WHEN a session is established, THE Session_Gateway SHALL measure connection latency and available bandwidth within 5 seconds and select a quality profile based on the following thresholds: "High Quality" when bandwidth exceeds 5 Mbps and latency is below 100ms, "Balanced" when bandwidth is between 1 Mbps and 5 Mbps or latency is between 100ms and 250ms, and "Low Bandwidth" when bandwidth is below 1 Mbps or latency exceeds 250ms.
2. WHILE a session is active, THE Session_Gateway SHALL re-measure available bandwidth and latency at intervals no longer than 5 seconds and adjust the quality profile according to the thresholds defined in criterion 1, completing the profile switch within 3 seconds of detection.
3. WHILE a session is active, THE Resource_Consumer SHALL be able to manually override the automatic quality profile by selecting from predefined profiles: "High Quality" (uncompressed, 30fps, 24-bit colour), "Balanced" (moderate compression, 24fps, 16-bit colour), and "Low Bandwidth" (high compression, 15fps, 8-bit colour).
4. IF the Resource_Consumer has manually selected a quality profile, THEN THE Session_Gateway SHALL suspend automatic profile switching and maintain the manually selected profile until the Resource_Consumer explicitly re-enables automatic adaptation or the session ends.
5. IF the detected bandwidth drops below 1 Mbps sustained for 10 seconds and automatic adaptation is active, THEN THE Session_Gateway SHALL switch to the "Low Bandwidth" profile and THE Module_Shell SHALL display an in-session notification indicating the profile change and the detected bandwidth.
6. IF the detected bandwidth exceeds the threshold for a higher quality profile (as defined in criterion 1) sustained for 15 seconds and automatic adaptation is active, THEN THE Session_Gateway SHALL upgrade to the corresponding higher profile.
7. WHILE a session is active, THE Module_Shell SHALL display a connection quality indicator showing current latency in milliseconds and estimated bandwidth in Mbps, updated at intervals no longer than 5 seconds.

### Requirement 10: Existing Governance Preservation

**User Story:** As a platform operator, I want all existing booking governance guarantees preserved and extended to session-level enforcement, so that the trust model remains intact as the module gains remote access capabilities.

#### Acceptance Criteria

1. THE Session_Gateway SHALL generate Session_Credentials only for bookings where the `evaluateResourceBookingGovernance` decision status is "approved" (booking status is "confirmed" by the Resource_Owner, satisfying both `humanApprovalRequired` and `autoConfirmProhibited` invariants).
2. IF a Resource_Consumer requests a Session_Credential for a booking whose governance decision status is not "approved", THEN THE Session_Gateway SHALL reject the request and return a structured error indicating the denial reason (one of: "awaiting_owner_confirmation", "booking_conflict", or "booking_cancelled").
3. IF usage logs for a completed session have not been explicitly marked as reviewed by the Resource_Owner (via a dedicated "approve usage" action that transitions the usage record from "pending_review" to "owner_approved"), THEN THE Session_Gateway SHALL prevent the associated billing record from being finalized, preserving the `autoPayoutProhibited` invariant.
4. WHEN a booking conflict is detected by the existing `findResourceBookingConflicts` function in resourceBookingService, THE Session_Gateway SHALL refuse to generate Session_Credentials for the conflicting booking.
5. THE Module_Shell SHALL continue to expose the following resourceBookingService workflows as user-facing operations: booking request creation with time window selection, real-time conflict checking before confirmation, Resource_Owner confirmation with auditable approval decision, usage log recording against confirmed bookings, and billing calculation with owner payout readiness evaluation.
6. IF a credential generation request is denied for any governance reason, THEN THE Module_Shell SHALL display the denial reason to the Resource_Consumer and provide guidance on the required next step (e.g., "Awaiting owner confirmation — contact the resource owner").

### Requirement 11: Platform Integration

**User Story:** As a platform architect, I want the Remote Desktop module to integrate with Project Passport, SpecForge, and the platform audit trail, so that remote access activity is traceable within the project lifecycle.

#### Acceptance Criteria

1. WHEN a session completes, IF the booking is associated with a project context, THEN THE Module_Shell SHALL write a session ProjectRecord to the Project Passport containing: session ID, booking reference, Resource_Consumer UID, connected duration, applications used, and disconnection reason.
2. WHEN any of the following Activity_Log events occur — connection_failed, sandbox_violation_attempted, auto_disconnect_triggered, or usage_disputed — THE Activity_Log SHALL emit a WorkflowEvent to the platform Action Centre within 60 seconds, including the session reference, event type, affected project ID (if applicable), and assigned roles (Resource_Owner and Platform_Admin).
3. THE Module_Shell SHALL display pending booking requests as actionable items in the Action Centre for Resource_Owners (requiring confirmation) and active sessions as informational items for Resource_Consumers (showing remaining time and resource name).
4. WHEN a session completes for a booking associated with a project, THE Module_Shell SHALL write a usage reference (session ID, connected duration, applications used) to the associated SpecForge workspace as a linked record queryable from the workspace's activity view.
5. THE Module_Shell SHALL expose session and booking data to the Analytics & Reporting Engine for the following KPIs: utilisation rate (connected hours / available hours per resource), revenue per resource (billing total per resource per period), and session reliability (successful connections / total connection attempts).
6. IF the Module_Shell fails to write a session record to the Project Passport or SpecForge workspace (network error, permission denied, or target not found), THEN THE Module_Shell SHALL queue the write for retry up to 3 attempts at 30-second intervals, log the failure to the Activity_Log, and notify the Platform_Admin via a WorkflowEvent if all retries are exhausted.

### Requirement 12: Resource Listing Enhancement

**User Story:** As a resource owner, I want to configure session-specific settings when publishing a resource, so that each listing has appropriate security, sandboxing, and connection parameters.

#### Acceptance Criteria

1. WHEN publishing a resource listing, THE Module_Shell SHALL collect the following fields: Connection_Profile protocol (RDP or VNC), host address (maximum 253 characters), port number, permitted applications (1 to 20 entries), File_Boundary paths (1 to 10 directory paths), Session_Recording preference (enabled or disabled), Grace_Period (0 to 15 minutes), and Bandwidth_Adaptation default profile (one of "High Quality", "Balanced", or "Low Bandwidth").
2. WHEN a Resource_Owner saves a resource listing with connection details, THE Module_Shell SHALL validate that the host address is a syntactically valid hostname per RFC 1123 or a valid IPv4/IPv6 address, and that the port is an integer in the range 1–65535, rejecting the save and displaying field-level errors if validation fails.
3. WHEN a Resource_Owner initiates a connection test from the listing editor, THE Module_Shell SHALL attempt to reach the configured host and port within 30 seconds and report a result of "reachable" (TCP connection established) or "unreachable" (timeout or connection refused) with the timestamp of the test.
4. WHILE a resource listing has status "active", THE Module_Shell SHALL display a session-readiness indicator with one of three states: "ready" (last connection test passed within the previous 24 hours), "stale" (last test passed more than 24 hours ago), or "unreachable" (last test failed or no test has been performed).
5. IF a Resource_Owner does not provide connection details, THEN THE Module_Shell SHALL save the listing in "booking_only" mode (existing behaviour without remote session capability).

### Requirement 13: Session UI and Viewer

**User Story:** As a resource consumer, I want a seamless in-browser remote desktop experience rendered within the Architex OS shell, so that I can work without leaving the platform or installing additional software.

#### Acceptance Criteria

1. WHEN a Resource_Consumer launches a confirmed booking, THE Module_Shell SHALL render an embedded session viewer within the Architex OS content area using the Session_Gateway's HTML5 client.
2. THE session viewer SHALL support keyboard and mouse input pass-through and display scaling that maintains the remote desktop aspect ratio within the available browser viewport, adding letterbox bars when the aspect ratios differ.
3. IF the Resource_Owner has enabled clipboard sharing for the resource listing, THEN THE session viewer SHALL allow bidirectional clipboard transfer between the Resource_Consumer's local system and the remote session.
4. WHILE the session viewer has focus, THE Module_Shell SHALL intercept browser keyboard shortcuts (Ctrl+W, Ctrl+T, Ctrl+N, F5) and forward them to the remote session instead of the local browser; THE Module_Shell SHALL provide a dedicated escape key combination (Ctrl+Alt+Shift) to release focus back to the local browser.
5. THE Module_Shell SHALL provide session controls: disconnect, toggle fullscreen, quality profile selector, and a session timer that updates every 1 second showing elapsed time and remaining time within the Booking_Window.
6. WHILE a session is active, THE Module_Shell SHALL display a confirmation dialog with the text "Leaving this page will disconnect your session" when the user attempts to navigate away, close the tab, or refresh the page.
7. IF the Session_Gateway WebSocket connection closes without a client-initiated disconnect, THEN THE Module_Shell SHALL display a reconnection overlay and attempt automatic reconnection every 5 seconds for up to 60 seconds (maximum 12 attempts).
8. IF automatic reconnection fails after 60 seconds, THEN THE Module_Shell SHALL mark the session as disconnected, display a message indicating the connection could not be re-established, and provide a "Return to Bookings" action that navigates to the Resource_Consumer's booking list.
9. WHILE the user has not toggled fullscreen mode, THE session viewer SHALL render within the Architex OS shell layout with the header and breadcrumb trail visible; WHEN the user toggles fullscreen mode, THE session viewer SHALL expand to fill the entire browser viewport and hide the OS shell chrome.

### Requirement 14: Billing Integration with Session Data

**User Story:** As a resource owner, I want session duration to be captured automatically from actual connection time, so that billing is based on real usage rather than manual logging.

#### Acceptance Criteria

1. WHEN a session ends (voluntarily or via Auto_Disconnect), THE Session_Gateway SHALL report the actual connected duration in whole minutes (rounded up to the nearest minute), calculated as total time connected minus any disconnection gaps of 60 seconds or longer, to the existing resourceBookingService billing pipeline.
2. WHEN a session ends and usage data is available, THE Module_Shell SHALL present the Resource_Owner with a usage summary showing booked window duration and actual connected duration (both in minutes) before usage billing is confirmed.
3. THE Resource_Owner SHALL retain the ability to adjust billed duration to any value between the minimumBillableMinutes defined in the ResourceUsageBillingPolicy and the total Booking_Window duration before finalising the usage log, preserving the humanApprovalRequired governance gate.
4. IF actual connected duration is less than the configured minimumBillableMinutes, THEN THE billing pipeline SHALL apply the minimum billable time as defined in the existing ResourceUsageBillingPolicy.
5. THE billing pipeline SHALL record both the booked window duration and the actual session duration (in whole minutes) in the usage ledger entry for audit transparency.
6. IF the Session_Gateway fails to report session duration within 120 seconds of session end, THEN THE Module_Shell SHALL flag the usage log as "duration_unconfirmed", notify the Resource_Owner that manual duration entry is required, and block billing finalisation until the Resource_Owner provides or confirms the billed duration.
