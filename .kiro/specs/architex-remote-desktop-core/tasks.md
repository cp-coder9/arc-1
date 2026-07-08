# Implementation Plan: Architex Remote Desktop Core

## Overview

This plan implements the three-component Remote Desktop Core system: Host Agent (Electron + Node.js), Session Broker (Express 5 backend module), and Browser Viewer (React component). Implementation proceeds from data layer and shared interfaces through core backend services, then Host Agent modules, and finally the Browser Viewer UI — wiring everything together at the end.

## Tasks

- [x] 1. Set up project structure, data models, and shared interfaces
  - [x] 1.1 Create Firestore data model interfaces and Zod schemas
    - Create `src/services/remoteDesktop/types.ts` with all TypeScript interfaces: RemoteDesktopHost, RemoteDesktopApp, RemoteDesktopSession, RemoteDesktopSessionEvent, RemoteDesktopFileManifest, RemoteDesktopRecording, SessionTokenPayload, RemoteDesktopError, RemoteDesktopErrorCode
    - Create `src/services/remoteDesktop/schemas.ts` with Zod validation schemas for all collection writes enforcing field constraints (max lengths, numeric ranges, enums)
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

  - [x] 1.2 Create remote desktop service directory structure and core service file
    - Create `src/services/remoteDesktop/` directory with barrel index
    - Create `remoteDesktopService.ts` as orchestration entry point with placeholder exports
    - Create `src/services/remoteDesktop/__tests__/` directory for test files
    - _Requirements: 15.1, 15.6_

  - [ ]* 1.3 Write property tests for schema validation
    - **Property 24: Schema validation rejects incomplete documents**
    - **Validates: Requirements 15.6**

  - [ ]* 1.4 Write property tests for session query filtering and ordering
    - **Property 25: Session query filtering and ordering**
    - **Validates: Requirements 15.7, 15.8**

- [x] 2. Implement Token Engine and session token lifecycle
  - [x] 2.1 Implement Token Engine (generation, validation, revocation)
    - Create `src/services/remoteDesktop/tokenEngine.ts` implementing SessionToken generation with HMAC-SHA256 signing, payload encoding (base64url), validation (signature check, expiry check, scope check), and revocation list management
    - Token must be bound to booking window start/end, consumer UID, host ID, and grace period
    - Implement structured error codes: session_not_started, token_scope_violation, invalid_token, token_generation_failed
    - Ensure token generation completes within 5 seconds of booking confirmation
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [ ]* 2.2 Write property test for token generation completeness
    - **Property 1: Token generation produces valid, complete tokens**
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [ ]* 2.3 Write property test for token tamper/scope rejection
    - **Property 2: Token validation rejects tampered or mis-scoped tokens**
    - **Validates: Requirements 3.6, 3.8**

  - [ ]* 2.4 Write property test for token time-window enforcement
    - **Property 3: Token time-window enforcement**
    - **Validates: Requirements 3.4, 3.7**

- [x] 3. Implement Session Broker API routes and session lifecycle
  - [x] 3.1 Create Session Broker REST API router
    - Create `src/lib/remote-desktop-api-router.ts` with Express 5 routes: POST /hosts/register, POST /hosts/:hostId/heartbeat, GET /hosts/:hostId/config, PUT /hosts/:hostId/apps, POST /sessions/token, GET /sessions/:sessionId, POST /sessions/:sessionId/end, GET /sessions/:sessionId/manifest, POST /sessions/:sessionId/approve-files, POST /sessions/:sessionId/billing, GET /audit/:sessionId/events
    - Mount at `/api/remote-desktop/` in the main api-router or as a separate lazy-loaded router
    - Add authentication middleware (Firebase Auth token validation)
    - _Requirements: 3.1, 4.1, 1.1, 2.4, 8.3, 11.3, 12.1_

  - [x] 3.2 Implement session lifecycle service (create, active, terminate)
    - Create `src/services/remoteDesktop/sessionBrokerService.ts` with session state management
    - Implement state transitions: pending → active → completed/terminated/failed
    - Implement reconnection tracking (max 5 attempts within booking window + grace period)
    - Implement token validity for reconnection after voluntary disconnect
    - _Requirements: 9.4, 9.5, 14.4_

  - [ ]* 3.3 Write property test for booking lifecycle state machine
    - **Property 21: Booking lifecycle state machine validity**
    - **Validates: Requirements 14.4, 14.6**

  - [ ]* 3.4 Write property test for reconnection within grace period
    - **Property 15: Reconnection within grace period**
    - **Validates: Requirements 9.4, 9.5**

  - [ ]* 3.5 Write property test for governance invariant
    - **Property 20: Governance invariant — no automatic finalisation**
    - **Validates: Requirements 14.2, 14.5**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement WebRTC signalling relay and TURN provisioning
  - [x] 5.1 Implement WebSocket signalling relay
    - Create `src/services/remoteDesktop/signallingService.ts` implementing WebSocket upgrade at `/api/remote-desktop/signal`
    - Maintain session-paired connections Map<sessionId, { hostWs, viewerWs }>
    - Validate token on WS connect, relay SDP offer/answer and ICE candidates between paired peers
    - Ensure broker acts as signalling-only relay (never relays media)
    - Implement 30-second connection timeout with appropriate error codes (host_unreachable, turn_unavailable, signalling_timeout)
    - Support minimum 50 concurrent signalling sessions with ≤2s round-trip latency
    - _Requirements: 4.1, 4.2, 4.5, 4.7, 4.8_

  - [x] 5.2 Implement TURN credential provisioning
    - Add TURN server credential request logic (coturn or Twilio NTS)
    - Provide TURN credentials to both peers when P2P fails within 10 seconds
    - TURN credentials must have validity ≥5 minutes
    - Write "session_started" event on successful connection with connection type (peer-to-peer or TURN relay)
    - _Requirements: 4.3, 4.4, 4.6_

  - [ ]* 5.3 Write property test for signalling message credential safety
    - **Property 5: Signalling messages never contain host credentials**
    - **Validates: Requirements 4.4**

  - [ ]* 5.4 Write property test for connection failure reason codes
    - **Property 6: Connection failure returns correct reason code**
    - **Validates: Requirements 4.5**

- [x] 6. Implement Session Audit Logger
  - [x] 6.1 Create audit logging service
    - Create `src/services/remoteDesktop/sessionAuditService.ts` writing events to `remote_desktop_session_events` Firestore collection
    - Implement all event types: session_started, session_ended, app_launched, app_closed, file_created, file_modified, focus_violation_attempted, child_process_blocked, clipboard_used, auto_disconnect_triggered, reconnection_attempted, quality_profile_changed, session_terminated_uac, token_revoked, token_integrity_failure, owner_revoked, broker_connectivity_lost, buffer_overflow, workspace_expired, no_active_windows
    - Implement retry logic (3 attempts with exponential backoff: 1s, 2s, 4s)
    - Implement role-scoped query functions (Platform_Admin: all, Owner: own hosts, Consumer: own sessions)
    - Implement pagination (max 200 records per response)
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 6.2 Write property test for audit record completeness
    - **Property 16: Audit record completeness**
    - **Validates: Requirements 11.1, 11.2**

  - [ ]* 6.3 Write property test for audit log immutability and access control
    - **Property 17: Audit log immutability and role-scoped access**
    - **Validates: Requirements 11.3, 11.4**

  - [ ]* 6.4 Write property test for event buffer FIFO eviction
    - **Property 18: Event buffer FIFO eviction**
    - **Validates: Requirements 11.5, 11.8**

- [x] 7. Implement Host Agent Registration and Heartbeat module
  - [x] 7.1 Create Host Agent registration module
    - Create `host-agent/src/modules/registration/registrationService.ts` handling first-launch auth via Architex platform credentials
    - Write host record to `remote_desktop_hosts` collection with: host ID, owner UID, machine name (max 64 chars), OS version, hardware specs (CPU, RAM MB, GPU, storage GB), registration timestamp
    - Implement 3-attempt auth failure limit with termination on failure
    - Support Windows 10 (build 1903+) and Windows 11
    - _Requirements: 1.1, 1.5, 1.7_

  - [x] 7.2 Create Host Agent heartbeat module
    - Create `host-agent/src/modules/heartbeat/heartbeatService.ts` sending heartbeat every 30 seconds
    - Heartbeat payload: host ID, status (idle/in_session/unavailable), CPU utilisation %, available RAM MB
    - Implement 90-second offline detection on Session Broker side (mark host "offline")
    - Implement 3-consecutive-failure local "connection_lost" status with retry and owner notification
    - Sync App_Allowlist and session policy on heartbeat acknowledgement
    - _Requirements: 1.2, 1.3, 1.4, 1.8_

  - [x] 7.3 Implement admin privilege detection and degraded mode
    - Detect if Host Agent runs without administrator privileges
    - Display warning about disabled app isolation features
    - Continue operating with registration, heartbeat, and session brokering active
    - _Requirements: 1.6_

  - [ ]* 7.4 Write property test for heartbeat payload completeness
    - **Property 31: Host heartbeat payload completeness**
    - **Validates: Requirements 1.2**

- [x] 8. Implement Application Allowlist Management
  - [x] 8.1 Create allowlist validation and management service
    - Create `src/services/remoteDesktop/allowlistService.ts` with CRUD for App_Allowlist entries
    - Validate entries: display name ≤100 chars, executable path ≤260 chars referencing valid .exe, software category from platform list
    - Enforce maximum 20 entries per host
    - Write entries to `remote_desktop_apps` collection with: app ID, host ID, display name, executable path, category, last-validated timestamp
    - Implement Host Agent local .exe path validation before accepting entries
    - Changes apply to future sessions only (not active sessions)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [ ]* 8.2 Write property test for allowlist entry validation
    - **Property 4: Allowlist entry validation**
    - **Validates: Requirements 2.1, 2.5, 2.7**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Host Agent App Capture and Streaming
  - [x] 10.1 Implement window capture module
    - Create `host-agent/src/modules/capture/captureService.ts` using Windows Graphics Capture API (via native addon)
    - Implement window-level capture (not full desktop) using OS-level window capture APIs
    - Launch only App_Allowlist applications (max 10) on session start, complete within 30 seconds
    - Hide taskbar, desktop icons, system tray, Start menu from captured stream
    - Handle app launch failure (write "app_unavailable" event, continue with remaining apps)
    - Display static placeholder frame when no active windows exist
    - _Requirements: 5.1, 5.2, 5.3, 5.7, 5.8_

  - [x] 10.2 Implement WebRTC encoding and streaming module
    - Create `host-agent/src/modules/encoder/encoderService.ts` with H.264/VP9 encoding
    - Target: 1080p, 30fps, adaptive bitrate 1–8 Mbps (starting at 4 Mbps)
    - Glass-to-glass latency ≤150ms under stable conditions
    - Implement WebRTC peer connection management for media sending
    - _Requirements: 5.5_

  - [x] 10.3 Implement UAC/system dialog handling
    - Detect UAC prompts, system dialogs, admin elevation requests
    - Pause input forwarding, hide dialog from stream
    - Notify Browser Viewer with "system_dialog_detected" reason
    - Terminate session if pause exceeds 60 seconds
    - _Requirements: 5.6_

- [x] 11. Implement Secure App Isolation and Input Control
  - [x] 11.1 Implement input sandbox and system shortcut blocking
    - Create `host-agent/src/modules/sandbox/inputFilterService.ts` using native low-level keyboard/mouse hooks
    - Block: Alt+Tab, Win key, Ctrl+Esc, Alt+F4 (non-allowlist windows), Ctrl+Alt+Del, Ctrl+Shift+Esc
    - Block launching: cmd.exe, powershell.exe, wt.exe, bash.exe, wsl.exe, explorer.exe
    - Block via all methods: keyboard shortcuts, application menus, file dialogs, drag-and-drop
    - _Requirements: 7.1, 7.2_

  - [x] 11.2 Implement process monitor and child process prevention
    - Create `host-agent/src/modules/sandbox/processMonitorService.ts` watching for new process creation
    - Terminate child processes not in App_Allowlist within 2 seconds
    - Write "child_process_blocked" event with blocked process name and parent PID
    - Handle UAC/privilege escalation: terminate session within 3 seconds, write "session_terminated_uac" event
    - _Requirements: 7.5, 7.6_

  - [x] 11.3 Implement clipboard policy enforcement
    - Create `host-agent/src/modules/sandbox/clipboardService.ts`
    - Default: disable all clipboard transfer
    - When text-only enabled by owner: permit text ≤4096 chars, block file/image/rich-text
    - _Requirements: 7.3_

  - [x] 11.4 Implement file dialog path restriction
    - Create `host-agent/src/modules/sandbox/fileDialogService.ts`
    - Hook Open/Save dialogs in App_Allowlist processes
    - Restrict navigation to Session_Workspace directory only
    - Block traversal to parent or paths outside Session_Workspace boundary
    - _Requirements: 7.4_

  - [x] 11.5 Implement pre-session verification gate
    - Verify App_Allowlist has ≥1 entry and Session_Workspace path exists before granting input control
    - _Requirements: 7.7_

  - [ ]* 11.6 Write property test for system escape shortcut blocking
    - **Property 7: Input sandbox blocks system escape shortcuts**
    - **Validates: Requirements 7.1**

  - [ ]* 11.7 Write property test for process launch prevention
    - **Property 8: Process launch prevention**
    - **Validates: Requirements 7.2, 7.5**

  - [ ]* 11.8 Write property test for clipboard policy enforcement
    - **Property 9: Clipboard policy enforcement**
    - **Validates: Requirements 7.3**

  - [ ]* 11.9 Write property test for file dialog path restriction
    - **Property 10: File dialog path restriction**
    - **Validates: Requirements 7.4**

  - [ ]* 11.10 Write property test for pre-session verification gate
    - **Property 11: Pre-session verification gate**
    - **Validates: Requirements 7.7**

- [x] 12. Implement Bandwidth Adaptation Service
  - [x] 12.1 Create bandwidth measurement and profile selection logic
    - Create `src/services/remoteDesktop/bandwidthAdaptationService.ts` implementing profile selection algorithm
    - Profiles: High (1080p, 30fps, ≥4Mbps), Balanced (720p, 24fps, 1.5–4Mbps), Low (480p, 15fps, 500Kbps–1.5Mbps), Critical (360p, 10fps, <500Kbps sustained 10s)
    - Default to Balanced until initial measurement completes (within 5 seconds)
    - Exit Critical mode when bandwidth ≥1.0 Mbps sustained 15 seconds
    - Implement 5-second sustained threshold crossing before switching profiles (hysteresis)
    - Support manual override: suspend automatic switching when consumer selects a profile
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.7, 10.8_

  - [ ]* 12.2 Write property test for bandwidth profile selection
    - **Property 12: Bandwidth profile selection**
    - **Validates: Requirements 10.1, 10.5, 10.7**

  - [ ]* 12.3 Write property test for profile switching policy
    - **Property 13: Profile switching policy (hysteresis and manual override)**
    - **Validates: Requirements 10.2, 10.4**

- [x] 13. Implement Time-Bounded Sessions and Auto-Disconnect
  - [x] 13.1 Create session time boundary enforcement service
    - Create `src/services/remoteDesktop/sessionTimerService.ts` managing booking window enforcement
    - Trigger countdown warning at (window end - grace period)
    - Auto-disconnect at (window end + grace period)
    - Grace period configurable 0–15 minutes in 1-minute increments (default 5 minutes)
    - On auto-disconnect: signal both peers, invalidate token, write "auto_disconnect" event
    - Handle host cleanup within 30 seconds; force-terminate and flag for admin review if timeout
    - Handle unreachable host: invalidate token, disconnect viewer, queue health check within 60s
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 9.7_

  - [ ]* 13.2 Write property test for session time boundary enforcement
    - **Property 14: Session time boundary enforcement**
    - **Validates: Requirements 9.1, 9.2, 9.3**

- [x] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement File Handoff Service
  - [x] 15.1 Create Session Workspace and file monitoring
    - Create `src/services/remoteDesktop/fileHandoffService.ts` managing file handoff lifecycle
    - Create Session_Workspace directory at configured path (default: `C:\ArchitexSessions\{sessionId}\`)
    - Monitor workspace for new/modified files, report manifest every ≤10 seconds
    - On session end: compile final manifest and write to `remote_desktop_file_manifests` with session ID, booking ID, consumer UID, files (name, size, extension, SHA-256 hash), manifest timestamp
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 15.2 Implement file approval and upload to FileManager
    - Implement owner approval UI flow: present manifest with individual file selection (all selected by default)
    - Reject files >500 MB individually, proceed with remaining
    - Upload approved files to Architex FileManager (Vercel Blob), set status: pending → uploading → completed/failed
    - Retry failed uploads 3 times (60s timeout per attempt), mark as "failed" if exhausted
    - Associate uploaded files with project reference in FileManager document registry
    - _Requirements: 8.4, 8.5, 8.6, 8.8, 13.4_

  - [x] 15.3 Implement workspace retention and expiry
    - Retain files for 72 hours after session completion
    - Delete workspace contents after 72 hours without owner approval
    - Write "workspace_expired" event to Activity_Log on expiry
    - _Requirements: 8.7_

  - [ ]* 15.4 Write property test for file size validation in handoff
    - **Property 22: File size validation in handoff**
    - **Validates: Requirements 8.5**

  - [ ]* 15.5 Write property test for file manifest record completeness
    - **Property 23: File manifest record completeness**
    - **Validates: Requirements 8.3, 8.9**

- [x] 16. Implement Billing Integration Service
  - [x] 16.1 Create billing calculation and reporting service
    - Create `src/services/remoteDesktop/sessionBillingService.ts`
    - Calculate actual connected duration: total time connected minus disconnection gaps ≥60s each, rounded up to nearest minute
    - Report to billing pipeline within 30 seconds of session end
    - Retry 3 times at 10-second intervals on failure; flag as "billing-pending" if exhausted
    - Write usage record to `remote_desktop_sessions`: session ID, booking ID, booked duration, actual duration, billed duration, owner-approved, finalisation timestamp
    - Owner can adjust billed duration between 1 minute and total booking window
    - Handle zero-minute edge case: require owner to explicitly set ≥1 min or cancel
    - Send reminder at 48 hours if not finalised; never auto-finalise
    - Block finalisation and flag for review if not approved within 14 days
    - _Requirements: 12.1, 12.2, 12.4, 12.5, 12.6, 12.7, 14.2, 14.5_

  - [ ]* 16.2 Write property test for billing duration calculation
    - **Property 19: Billing duration calculation**
    - **Validates: Requirements 12.1, 12.4**

- [x] 17. Implement Session Recording Service
  - [x] 17.1 Create session recording lifecycle service
    - Create `src/services/remoteDesktop/sessionRecordingService.ts`
    - Enable/disable recording per host configuration (default disabled)
    - Store recordings on Architex-controlled infrastructure (not host machine)
    - Maximum 8 hours recording per session
    - Implement access control: viewable/downloadable by owner, consumer, Platform_Admin only
    - No deletion before retention expires
    - Retain 90 days; extend if dispute open; delete permanently after retention
    - Persist recording metadata to `remote_desktop_recordings` collection
    - _Requirements: 16.1, 16.4, 16.5, 16.6, 16.7_

  - [ ]* 17.2 Write property test for recording access control
    - **Property 26: Recording access control**
    - **Validates: Requirements 16.5**

- [x] 18. Implement Platform Integration Adapters
  - [x] 18.1 Create Project Passport integration adapter
    - Create `src/services/remoteDesktop/remoteDesktopPassportAdapter.ts`
    - On session completion with project reference: write ProjectRecord containing session ID, booking ref, consumer UID, connected duration (whole minutes), applications used, files produced, disconnection reason
    - Retry up to 3 attempts at 30-second intervals on failure; notify Platform_Admin if exhausted
    - _Requirements: 13.1, 13.6_

  - [x] 18.2 Create Action Centre integration adapter
    - Create `src/services/remoteDesktop/remoteDesktopInboxAdapter.ts`
    - Emit WorkflowEvents for critical events (connection_failed, focus_violation_attempted, session_terminated_uac, auto_disconnect_triggered) within 60 seconds
    - Display pending booking confirmations as actionable items for Resource_Owner
    - Display active session info for Resource_Consumer
    - Retry 3 times at 30-second intervals on failure; log to Activity_Log
    - _Requirements: 13.2, 13.3, 13.7_

  - [x] 18.3 Create Analytics Engine integration adapter
    - Create `src/services/remoteDesktop/remoteDesktopAnalyticsAdapter.ts`
    - Expose KPIs: utilisation rate, revenue per host, session reliability, average bandwidth utilisation
    - _Requirements: 13.5_

  - [ ]* 18.4 Write property test for ProjectRecord on session completion
    - **Property 33: Platform integration — ProjectRecord on session completion**
    - **Validates: Requirements 13.1**

  - [ ]* 18.5 Write property test for analytics KPI calculation
    - **Property 32: Analytics KPI calculation**
    - **Validates: Requirements 13.5**

- [x] 19. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Implement Browser Viewer - WebRTC Session and Signalling hooks
  - [x] 20.1 Create useWebRTCSession hook
    - Create `src/components/remote-desktop/hooks/useWebRTCSession.ts`
    - Manage RTCPeerConnection lifecycle (media receiver)
    - Handle SDP offer/answer exchange via signalling WebSocket
    - Implement ICE candidate exchange
    - Handle TURN fallback when P2P fails within 10 seconds
    - Implement 30-second connection timeout with error display
    - _Requirements: 4.1, 4.3, 6.1, 6.11_

  - [x] 20.2 Create useSignalling hook
    - Create `src/components/remote-desktop/hooks/useSignalling.ts`
    - Manage WebSocket connection to `/api/remote-desktop/signal`
    - Handle session token authentication on connect
    - Relay signalling messages (session_init, sdp_offer, sdp_answer, ice_candidate, session_end, session_pause, quality_change)
    - _Requirements: 4.1_

  - [x] 20.3 Create useInputCapture hook
    - Create `src/components/remote-desktop/hooks/useInputCapture.ts`
    - Capture keyboard and mouse events, forward via WebRTC data channel
    - Latency ≤ WebRTC RTT + 50ms processing overhead
    - Intercept browser shortcuts (Ctrl+W, Ctrl+T, Ctrl+N, F5) and forward to host
    - Implement Ctrl+Alt+Shift escape to release focus back to local browser
    - _Requirements: 6.2, 6.5_

  - [x] 20.4 Create useSessionTimer hook
    - Create `src/components/remote-desktop/hooks/useSessionTimer.ts`
    - Track elapsed time and remaining time within Booking_Window (update every 1 second)
    - Trigger countdown warning at (window end - grace period)
    - Display session-ending notification 60 seconds before expiry
    - _Requirements: 6.10, 9.1_

  - [x] 20.5 Create useBandwidthMonitor hook
    - Create `src/components/remote-desktop/hooks/useBandwidthMonitor.ts`
    - Display connection quality: latency in ms (nearest integer), bandwidth in Mbps (1 decimal place)
    - Update at intervals ≤5 seconds
    - _Requirements: 10.6_

- [x] 21. Implement Browser Viewer - UI Components
  - [x] 21.1 Create RemoteDesktopViewer top-level component
    - Create `src/components/remote-desktop/RemoteDesktopViewer.tsx`
    - Accept props: user, bookingId, sessionToken, onSessionEnd
    - Render within Architex OS shell content area
    - Integrate all hooks (WebRTC, signalling, input, timer, bandwidth)
    - Implement beforeunload confirmation: "Leaving this page will disconnect your remote session."
    - _Requirements: 6.1, 6.6_

  - [x] 21.2 Create SessionViewport component
    - Create `src/components/remote-desktop/SessionViewport.tsx`
    - Render WebRTC video stream scaled to fit viewport, maintain aspect ratio
    - Add letterbox bars when aspect ratios differ
    - Minimum supported viewport: 800×600 pixels
    - _Requirements: 6.3_

  - [x] 21.3 Create SessionControlBar component
    - Create `src/components/remote-desktop/SessionControlBar.tsx`
    - Display: elapsed time, remaining time (updated every 1s), connection quality (latency ms, bandwidth Mbps), active application name, file handoff status
    - Controls: disconnect button, toggle fullscreen, quality profile selector (High/Balanced/Low), "Report Issue" action
    - _Requirements: 6.4, 6.7_

  - [x] 21.4 Create QualitySelector component
    - Create `src/components/remote-desktop/QualitySelector.tsx`
    - Options: High (prioritize resolution), Balanced (720p cap), Low (480p cap)
    - On manual selection: communicate to Host Agent to suspend auto-adaptation
    - _Requirements: 6.7, 10.3_

  - [x] 21.5 Create ReconnectionOverlay component
    - Create `src/components/remote-desktop/ReconnectionOverlay.tsx`
    - On WebRTC drop: show reconnection overlay, attempt every 5 seconds for up to 60 seconds (12 attempts)
    - If all attempts fail: mark disconnected, show "Return to Bookings" action
    - _Requirements: 6.8, 6.9_

  - [x] 21.6 Create RecordingConsent component
    - Create `src/components/remote-desktop/RecordingConsent.tsx`
    - Display "Recording Active" indicator when recording enabled
    - Require consent acceptance before streaming starts
    - Cancel connection if declined or no response within 60 seconds
    - _Requirements: 16.2, 16.3_

  - [x] 21.7 Create FileManifestPanel component
    - Create `src/components/remote-desktop/FileManifestPanel.tsx`
    - Display file manifest: file names, sizes, transfer status (pending_approval, uploading, completed, failed)
    - Accessible in session summary and booking detail view after session ends
    - _Requirements: 8.9_

  - [x] 21.8 Create SessionEndSummary component
    - Create `src/components/remote-desktop/SessionEndSummary.tsx`
    - Show usage summary: booked window duration, actual connected duration, applications used, files produced
    - Display within 5 seconds of session end
    - Keep accessible from Action Centre until usage log finalised
    - _Requirements: 12.3_

  - [ ]* 21.9 Write property test for session control bar data completeness
    - **Property 28: Session control bar data completeness**
    - **Validates: Requirements 6.4**

  - [ ]* 21.10 Write property test for viewport aspect ratio preservation
    - **Property 29: Viewport aspect ratio preservation**
    - **Validates: Requirements 6.3**

  - [ ]* 21.11 Write property test for reconnection attempt pattern
    - **Property 30: Reconnection attempt pattern**
    - **Validates: Requirements 6.8, 6.9**

- [x] 22. Implement Owner Session Controls
  - [x] 22.1 Create owner session monitoring and termination
    - Implement Host Agent tray notification showing: session status, consumer name (truncated 64 chars), elapsed time (HH:MM:SS updated every 1s), "Terminate Session" action
    - On terminate: signal Session Broker within 2 seconds, close session-launched apps, write "owner_revoked" event
    - Implement web interface view: active sessions + last 30 days (max 200 entries) showing consumer name, start time, duration, apps in use, connection quality (good/fair/poor)
    - Handle broker connectivity loss: continue session 120 seconds, then terminate locally and buffer events
    - Handle failed termination signal: terminate locally within 5 seconds, buffer "broker_unreachable_on_revoke" event
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ]* 22.2 Write property test for owner session history scoping
    - **Property 27: Owner session history scoping**
    - **Validates: Requirements 17.3**

- [x] 23. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 24. Wire all components together and implement end-to-end flows
  - [x] 24.1 Wire Session Broker routes into main API router
    - Import and mount `remote-desktop-api-router.ts` in the existing `api-router.ts` or `server.ts`
    - Add WebSocket upgrade handling for `/api/remote-desktop/signal`
    - Wire authentication middleware for all routes
    - Register Tool Nav config for Remote Desktop module in `toolNavRegistry.ts`
    - _Requirements: 3.1, 4.1_

  - [x] 24.2 Wire Browser Viewer into Architex OS shell
    - Register RemoteDesktopViewer as a lazy-loaded route in App.tsx
    - Add navigation entry in `architexNavigationConfig.ts` under Design stage (Remote Desktop module)
    - Connect booking launch action to Browser Viewer session initialization
    - Wire onSessionEnd callback to navigate back to bookings
    - _Requirements: 6.1_

  - [x] 24.3 Wire governance checks into session flow
    - Verify booking status = "confirmed" before token generation
    - Enforce humanApprovalRequired and autoConfirmProhibited invariants
    - Wire booking cancellation → token revocation within 5 seconds
    - Wire booking conflict detection → token refusal
    - _Requirements: 14.1, 14.3, 14.5, 14.6_

  - [x] 24.4 Wire platform integration on session lifecycle events
    - On session complete → Project Passport write (if project reference exists)
    - On critical events → Action Centre WorkflowEvents
    - On file handoff complete → FileManager document registry association
    - On session end → Analytics Engine KPI data exposure
    - On session end → Billing pipeline reporting
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 12.1_

  - [ ]* 24.5 Write integration tests for full session lifecycle
    - Test token request → signalling → connection → active session → disconnect → billing
    - Test reconnection flow within grace period
    - Test owner termination flow
    - Test auto-disconnect on booking window expiry
    - _Requirements: 3.1, 4.1, 9.2, 17.2_

- [x] 25. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The Host Agent modules (tasks 7, 10, 11, 22) target Electron + Node.js with native C++ addons (node-gyp) for Windows-specific functionality
- The Session Broker (tasks 2, 3, 5, 6, 13, 16, 17, 18) integrates into the existing Express 5 backend
- The Browser Viewer (tasks 20, 21) renders as a React component within the Architex OS shell following workspace-template and UI-steering patterns
- All Firestore operations use the existing Firebase Admin SDK pattern from `src/lib/firebase-admin.ts`
- WebRTC signalling uses WebSocket upgrade from the Express server — no separate WS infrastructure
- fast-check library is used for property-based tests, compatible with existing Vitest setup

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "1.4", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1", "8.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "8.2", "7.1", "7.2"] },
    { "id": 4, "tasks": ["5.1", "5.2", "6.1", "7.3", "7.4"] },
    { "id": 5, "tasks": ["5.3", "5.4", "6.2", "6.3", "6.4", "12.1", "13.1"] },
    { "id": 6, "tasks": ["10.1", "10.2", "10.3", "12.2", "12.3", "13.2"] },
    { "id": 7, "tasks": ["11.1", "11.2", "11.3", "11.4", "11.5", "15.1"] },
    { "id": 8, "tasks": ["11.6", "11.7", "11.8", "11.9", "11.10", "15.2", "15.3"] },
    { "id": 9, "tasks": ["15.4", "15.5", "16.1", "17.1"] },
    { "id": 10, "tasks": ["16.2", "17.2", "18.1", "18.2", "18.3"] },
    { "id": 11, "tasks": ["18.4", "18.5", "20.1", "20.2"] },
    { "id": 12, "tasks": ["20.3", "20.4", "20.5", "21.1"] },
    { "id": 13, "tasks": ["21.2", "21.3", "21.4", "21.5", "21.6", "21.7", "21.8"] },
    { "id": 14, "tasks": ["21.9", "21.10", "21.11", "22.1"] },
    { "id": 15, "tasks": ["22.2", "24.1", "24.2"] },
    { "id": 16, "tasks": ["24.3", "24.4"] },
    { "id": 17, "tasks": ["24.5"] }
  ]
}
```
