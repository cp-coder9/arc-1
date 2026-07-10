# Implementation Plan: Remote Desktop V1 Architecture

## Overview

This plan implements the Remote Desktop V1 Architecture for Architex — 14 tasks covering the service layer, browser viewer component, API routes, and platform integration. Tasks are ordered by dependency: types first, then pure-logic services, then orchestration, then UI and API.

## Tasks

- [x] 1. Define core types and data model interfaces
  - Create `src/services/remoteDesktop/types.ts` with all shared interfaces (SessionGateInput, SessionGateResult, SessionToken, SessionEvent, FileManifest, FileManifestEntry, IncidentReport, HostRecord, AppRecord, SessionRecord)
  - Define constants for event types, status enums, deny-list extensions, and gate error codes
  - Align with existing ResourceBookingWindow and ResourceBookingStatus from resourceBookingService

- [x] 2. Implement session gate service
  - Create `src/services/remoteDesktop/sessionGateService.ts`
  - Create `src/services/remoteDesktop/__tests__/sessionGateService.test.ts`
  - Implement `evaluateSessionGate` validating: booking confirmed, owner approved, time window (start-15min to end), host online (heartbeat < 90s), appCount > 0
  - Return structured SessionGateResult with per-condition pass/fail and error codes
  - Pure function (no side effects, data passed as input)

- [x] 3. Implement token service with HMAC-SHA256
  - Create `src/services/remoteDesktop/tokenService.ts`
  - Create `src/services/remoteDesktop/__tests__/tokenService.test.ts`
  - Token generation with HMAC-SHA256 signature, max 24hr validity cap
  - Single-use enforcement (consumed flag), duplicate detection
  - Reconnection token derivation, expired token rejection
  - Server-side TTL store (in-memory Map with cleanup interval)
  - Secret rotation support, recording_required flag inclusion

- [x] 4. Implement audit event service with chain hashing
  - Create `src/services/remoteDesktop/auditEventService.ts`
  - Create `src/services/remoteDesktop/__tests__/auditEventService.test.ts`
  - SHA-256 chain hash (each event hashes previous event, first event has null)
  - Retry logic: 3 attempts with exponential backoff (1s, 2s, 4s)
  - Local buffer management: 10,000 event cap with FIFO eviction
  - Paginated query helpers (max 200 records per page)
  - All required event types exported as constants

- [x] 5. Implement POPIA consent service
  - Create `src/services/remoteDesktop/popiaConsentService.ts`
  - Create `src/services/remoteDesktop/__tests__/popiaConsentService.test.ts`
  - Consent record creation: type (recording/screenshot), version, IP hash (SHA-256), timestamp
  - Validation that consent exists before media stream proceeds
  - Policy immutability during active sessions
  - 60-second timeout → cancellation with consent_declined event
  - Integration with audit event service

- [x] 6. Implement file handoff service
  - Create `src/services/remoteDesktop/fileHandoffService.ts`
  - Create `src/services/remoteDesktop/__tests__/fileHandoffService.test.ts`
  - Manifest creation with SHA-256 file hashes and extension deny-list filtering
  - Owner approval: approve all/selected, reject selected, partial rejection
  - Transfer status transitions: pending_approval → uploading → completed/failed/rejected
  - 72-hour expiry detection and manifest expiration
  - File size validation (max 500 MB), manifest size limit (max 200 files)
  - Project reference association on upload completion

- [x] 7. Implement incident service
  - Create `src/services/remoteDesktop/incidentService.ts`
  - Create `src/services/remoteDesktop/__tests__/incidentService.test.ts`
  - Incident creation with validation (description 10-1000 chars, valid category)
  - Security concern → input pause signal within 5 seconds
  - 15-minute unreviewed security timeout → session termination signal
  - Status management: open → investigating/resolved/escalated/closed
  - Auto-creation on owner-initiated termination
  - 72-hour post-session reporting window enforcement
  - WorkflowEvent emission to Action Centre

- [x] 8. Implement host registry service
  - Create `src/services/remoteDesktop/hostRegistryService.ts`
  - Create `src/services/remoteDesktop/__tests__/hostRegistryService.test.ts`
  - Host registration with resourceListingId reference to resource_listings
  - Agent version validation (reject unsupported, flag outdated)
  - Heartbeat processing: update timestamp, status (online/idle/in_session)
  - Offline detection: 90-second timeout → mark offline, update listing readiness
  - Host deactivation cascade: all associated apps marked unavailable
  - App_Allowlist CRUD: max 20 entries, executable path format validation
  - Referential integrity: reject app entries for non-existent hosts

- [x] 9. Implement governance bridge service
  - Create `src/services/remoteDesktop/governanceBridgeService.ts`
  - Create `src/services/remoteDesktop/__tests__/governanceBridgeService.test.ts`
  - Integrate with `evaluateResourceBookingGovernance` from resourceBookingService
  - Integrate with `canConfirmResourceBooking` for conflict checking (conflict blocks token)
  - Usage record creation via `buildResourceUsageLedgerEntry` on session completion
  - Booking lifecycle extension: confirmed → session_active → session_completed
  - Preserve humanApprovalRequired and autoPayoutProhibited invariants
  - 14-day unfinalised billing detection and flagging

- [x] 10. Implement session broker orchestrator
  - Create `src/services/remoteDesktop/sessionBrokerService.ts`
  - Create `src/services/remoteDesktop/__tests__/sessionBrokerService.test.ts`
  - Orchestrate session start: gate check → POPIA consent → token mint → signalling
  - Enforce app-level isolation (reject full_desktop, validate appCount > 0)
  - Policy violation detection: full_desktop stream type → immediate termination within 5s
  - Auto-disconnect enforcement at booking window end plus grace period
  - Input pause on security incident, session termination on 15-min timeout
  - All session lifecycle transitions produce audit events
  - Usage reporting to governance bridge on session completion

- [x] 11. Implement platform integration adapters
  - Create `src/services/remoteDesktop/actionCentreAdapter.ts`
  - Create `src/services/remoteDesktop/projectPassportAdapter.ts`
  - Create `src/services/remoteDesktop/analyticsAdapter.ts`
  - Action Centre: emit WorkflowEvents for session_started, session_ended, focus_violation, incident_raised, file_handoff_pending, billing_pending
  - Action Centre: surface connect-now, approve-files, finalise-billing actionable items
  - Project Passport: write ProjectRecord on session completion with project reference
  - Analytics: expose KPIs (utilisation rate, revenue, reliability, duration, incident rate)
  - Retry: 3 attempts at 30-second intervals for failed writes

- [x] 12. Implement Browser Viewer React component
  - Create `src/components/RemoteDesktopViewer.tsx`
  - Create `src/components/RemoteDesktopSessionBar.tsx`
  - Create `src/components/RemoteDesktopConsent.tsx`
  - Create `src/components/RemoteDesktopIncidentForm.tsx`
  - Create `src/components/RemoteDesktopSummary.tsx`
  - Main viewer: WebRTC video element, aspect-ratio preservation, letterbox, min 800×600
  - Session bar: elapsed/remaining time (1s update), app list, quality indicator, file status
  - Blocked actions display: full desktop, file system browsing, installing software, etc.
  - POPIA consent: purpose, retention, access rights, accept/decline with 60s timeout
  - Incident form: category, description, screenshot attachment
  - End session: confirmation dialog, graceful disconnect
  - Session summary: time, apps, files, reason, handoff status
  - Countdown warnings: amber at 5min, red at 1min
  - Reconnection overlay: auto-retry every 5s for 60s (max 12 attempts)
  - Leave-page confirmation, keyboard shortcut interception
  - Renders within OS shell (no custom chrome), uses platform CSS tokens

- [x] 13. Add remote desktop API routes
  - Modify `src/lib/api-router.ts` to add remote desktop route group
  - POST /api/remote-desktop/sessions/start — gate check and token mint
  - POST /api/remote-desktop/sessions/end — graceful session termination
  - GET /api/remote-desktop/sessions/:id — session details (role-scoped)
  - GET /api/remote-desktop/sessions/:id/events — paginated events (role-scoped)
  - POST /api/remote-desktop/hosts/register — host registration
  - PUT /api/remote-desktop/hosts/:id/heartbeat — heartbeat update
  - GET /api/remote-desktop/hosts/:id/apps — app allowlist
  - POST /api/remote-desktop/incidents — create incident
  - PUT /api/remote-desktop/incidents/:id — update incident status (admin only)
  - POST /api/remote-desktop/file-manifests/:id/approve — approve handoff
  - POST /api/remote-desktop/file-manifests/:id/reject — reject files
  - GET /api/remote-desktop/agent/version — latest agent version info
  - Firebase Auth middleware on all routes, role-based access control

- [x] 14. Create Host Agent download page
  - Create `src/components/RemoteDesktopAgentDownload.tsx`
  - Accessible only to resource-owning roles (BEP, architect, firm_admin, freelancer, contractor)
  - Displays: version number, OS requirements (Windows 10 build 1903+), installer size, SHA-256 checksum
  - Download button, SmartScreen/antivirus troubleshooting guidance
  - Renders within Architex OS shell using platform CSS tokens

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1. Define core types and data model interfaces"] },
    { "wave": 2, "tasks": ["2. Implement session gate service", "3. Implement token service with HMAC-SHA256", "4. Implement audit event service with chain hashing", "8. Implement host registry service"] },
    { "wave": 3, "tasks": ["5. Implement POPIA consent service", "6. Implement file handoff service", "7. Implement incident service", "9. Implement governance bridge service"] },
    { "wave": 4, "tasks": ["10. Implement session broker orchestrator"] },
    { "wave": 5, "tasks": ["11. Implement platform integration adapters", "12. Implement Browser Viewer React component"] },
    { "wave": 6, "tasks": ["13. Add remote desktop API routes", "14. Create Host Agent download page"] }
  ]
}
```

## Notes

- All service tests use Vitest
- Property-based tests cover: session gate completeness, token validity bounds, token signature round-trip, audit chain integrity, file extension deny-list, governance preservation
- The Host_Agent binary itself (Windows native) is out of scope for this React/TypeScript spec — the platform services and Browser_Viewer are in scope
- The Session_Token is never persisted to Firestore; it lives only in server memory and browser runtime
- All new components render within the existing Architex OS shell — no standalone pages or custom chrome
