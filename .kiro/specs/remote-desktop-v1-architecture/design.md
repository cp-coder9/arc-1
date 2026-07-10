# Design Document

## Overview

This design implements the Remote Desktop V1 Architecture for Architex — the production system that transforms confirmed resource bookings into live, governed remote access sessions with app-level isolation. The architecture comprises four primary subsystems: Session Broker API, Host Agent service layer, Browser Viewer component, and FileManager Handoff pipeline, all integrated with the existing resource booking infrastructure.

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Architex Platform                             │
│                                                                   │
│  ┌─────────────┐    ┌──────────────────┐    ┌────────────────┐  │
│  │  Browser     │◄──►│  Session Broker   │◄──►│  Host Agent    │  │
│  │  Viewer      │    │  API (Express 5)  │    │  (Windows)     │  │
│  │  (React)     │    └──────────────────┘    └────────────────┘  │
│  └─────────────┘              │                       │          │
│         │                     │                       │          │
│         │              ┌──────┴──────┐         ┌──────┴──────┐   │
│         │              │  Firestore   │         │  Session     │   │
│         │              │  Collections │         │  Workspace   │   │
│         │              └─────────────┘         └─────────────┘   │
│         │                     │                       │          │
│  ┌──────┴──────────────────────┴───────────────────────┘         │
│  │                                                                │
│  │  Existing Platform Services                                    │
│  │  ├── resource_listings / resource_bookings / resource_usage    │
│  │  ├── Project Passport / Action Centre                          │
│  │  ├── FileManager / Document Registry                           │
│  │  └── Analytics & Reporting Engine                              │
│  └────────────────────────────────────────────────────────────────│
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Resource_Owner installs Host_Agent → registers in remote_desktop_hosts
2. Resource_Owner configures App_Allowlist → writes to remote_desktop_apps
3. Resource_Consumer books via existing resource_bookings flow
4. Owner confirms booking (human gate) → booking status = "confirmed"
5. Consumer requests session start → Session_Broker gate check:
   a. Booking confirmed? (reads resource_bookings)
   b. Owner approved? (reads booking governance)
   c. Time window active? (compares current time)
   d. Host online? (reads remote_desktop_hosts heartbeat)
6. All gates pass → Session_Token minted (HMAC-SHA256, server-memory only)
7. POPIA consent (if recording enabled) → consent event logged
8. WebRTC signalling → peer connection established
9. Host_Agent streams app windows → Browser_Viewer displays
10. Session ends → file manifest → owner approves → FileManager upload
11. Usage record via buildResourceUsageLedgerEntry → billing pipeline
```

## Components and Interfaces

### 1. Session Broker Service (`src/services/remoteDesktop/sessionBrokerService.ts`)

The server-side orchestrator responsible for session lifecycle management.

**Responsibilities:**
- Session gate validation (4-condition check)
- Token generation and verification (HMAC-SHA256)
- Token store with TTL-based expiry
- WebRTC signalling coordination
- Incident handling and security pause
- Auto-disconnect enforcement
- Audit event writing with chain hashing
- Usage reporting to existing billing pipeline

**Key interfaces:**

```typescript
interface SessionGateResult {
  canStart: boolean;
  conditions: {
    bookingConfirmed: boolean;
    ownerApproved: boolean;
    withinTimeWindow: boolean;
    hostOnline: boolean;
  };
  errors: SessionGateError[];
}

interface SessionToken {
  tokenId: string;
  bookingId: string;
  consumerUid: string;
  hostId: string;
  windowStart: string;
  windowEnd: string;
  gracePeriodSeconds: number;
  recordingRequired: boolean;
  signature: string;
  expiresAt: string;
  consumed: boolean;
}

interface SessionEvent {
  eventId: string;
  sessionId: string;
  bookingId: string;
  eventType: string;
  actorUid: string;
  actorRole: 'consumer' | 'owner' | 'system' | 'admin';
  hostId: string;
  timestamp: string;
  previousEventHash: string | null;
  metadata: Record<string, unknown>;
}
```

### 2. Session Gate Service (`src/services/remoteDesktop/sessionGateService.ts`)

Pure function service implementing the multi-condition session start gate.

**Responsibilities:**
- Validate booking status from `resource_bookings`
- Validate owner approval
- Validate time window (current time within start-15min to end)
- Validate host heartbeat freshness (< 90 seconds)
- Return structured pass/fail for each condition

```typescript
interface SessionGateInput {
  bookingId: string;
  consumerUid: string;
  hostId: string;
  currentTime: string;
  booking: {
    status: ResourceBookingStatus;
    approvedBy?: string;
    startsAt: string;
    endsAt: string;
    resourceId: string;
  };
  host: {
    status: 'online' | 'offline' | 'in_session' | 'maintenance';
    lastHeartbeat: string;
    resourceListingId: string;
    agentVersion: string;
  };
  appCount: number;
}
```

### 3. Token Service (`src/services/remoteDesktop/tokenService.ts`)

Manages session token lifecycle with cryptographic integrity.

**Responsibilities:**
- Token generation with HMAC-SHA256 signing
- Token verification and signature validation
- Token consumption (single-use enforcement)
- Token revocation
- Reconnection token derivation
- Server-side TTL store (in-memory Map with cleanup interval)
- Secret rotation (24-hour cycle)

### 4. Audit Event Service (`src/services/remoteDesktop/auditEventService.ts`)

Manages the append-only chain-hashed audit log.

**Responsibilities:**
- Event creation with chain hash computation
- Retry logic (3 attempts, exponential backoff)
- Local buffer management (10,000 event cap, FIFO eviction)
- Paginated query support
- Integration with Action Centre WorkflowEvents

### 5. File Handoff Service (`src/services/remoteDesktop/fileHandoffService.ts`)

Manages the file manifest lifecycle and FileManager integration.

**Responsibilities:**
- Manifest creation from session workspace contents
- Extension deny-list filtering
- Owner approval/rejection flow
- Upload orchestration to FileManager
- 72-hour expiry enforcement
- Project document registry association

```typescript
interface FileManifestEntry {
  name: string;
  sizeBytes: number;
  extension: string;
  sha256Hash: string;
  transferStatus: 'pending_approval' | 'uploading' | 'completed' | 'failed' | 'rejected';
}

interface FileManifest {
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: FileManifestEntry[];
  manifestTimestamp: string;
  ownerApprovalStatus: 'pending' | 'approved' | 'rejected' | 'expired';
  approvalTimestamp: string | null;
  expiryTimestamp: string;
}
```

### 6. Incident Service (`src/services/remoteDesktop/incidentService.ts`)

Manages the incident/support escalation flow.

**Responsibilities:**
- Incident creation with category-based routing
- Security concern → immediate input pause signal
- 15-minute auto-termination timeout for unreviewed security incidents
- WorkflowEvent emission to Action Centre
- Platform_Admin status management
- 72-hour post-session reporting window enforcement

```typescript
interface IncidentReport {
  incidentId: string;
  sessionId: string;
  bookingId: string;
  reporterUid: string;
  reporterRole: 'consumer' | 'owner';
  category: 'connection_quality' | 'app_not_working' | 'security_concern' | 'billing_dispute' | 'other';
  description: string;
  screenshotRef?: string;
  status: 'open' | 'investigating' | 'resolved' | 'escalated' | 'closed';
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}
```

### 7. POPIA Consent Service (`src/services/remoteDesktop/popiaConsentService.ts`)

Manages POPIA-compliant consent for recording and screenshots.

**Responsibilities:**
- Consent prompt content generation (purpose, retention, access, rights)
- Consent record creation with IP hash
- Consent validation before media stream establishment
- Screenshot consent flag management
- Policy immutability during active sessions

### 8. Host Registry Service (`src/services/remoteDesktop/hostRegistryService.ts`)

Manages host lifecycle and the link to resource_listings.

**Responsibilities:**
- Host registration with resourceListingId reference
- Agent version validation
- Heartbeat processing and status updates
- Offline detection (90-second timeout)
- Host deactivation with cascade to apps
- App_Allowlist CRUD with validation

### 9. Governance Bridge (`src/services/remoteDesktop/governanceBridgeService.ts`)

Bridges the remote desktop layer with existing booking governance.

**Responsibilities:**
- Reads booking state from existing `resource_bookings`
- Validates via `evaluateResourceBookingGovernance`
- Checks conflicts via `canConfirmResourceBooking`
- Writes usage via `buildResourceUsageLedgerEntry`
- Extends booking lifecycle with session-aware transitions
- Preserves `humanApprovalRequired` and `autoPayoutProhibited`

### 10. Browser Viewer Component (`src/components/RemoteDesktopViewer.tsx`)

React component rendered within the Architex OS content area.

**Responsibilities:**
- WebRTC media stream display with aspect-ratio preservation
- Session control bar (timers, apps, quality, file status)
- Blocked actions display
- POPIA consent prompt UI
- Incident report form
- End-session confirmation dialog
- Reconnection overlay
- Session summary panel
- Keyboard shortcut interception (Ctrl+W, Ctrl+T, etc.)

### 11. Integration Adapters

**Action Centre Adapter** (`src/services/remoteDesktop/actionCentreAdapter.ts`):
- Emits WorkflowEvents for session lifecycle and incidents
- Surfaces actionable items (connect now, approve files, finalise billing)

**Project Passport Adapter** (`src/services/remoteDesktop/projectPassportAdapter.ts`):
- Writes session ProjectRecords on completion
- Links session data to project lifecycle

**Analytics Adapter** (`src/services/remoteDesktop/analyticsAdapter.ts`):
- Exposes KPI data: utilisation, revenue, reliability, duration, incident rate

## Data Models

### Firestore Collections

```
remote_desktop_hosts
├── hostId (doc ID)
├── ownerUid: string
├── resourceListingId: string → resource_listings
├── machineName: string (max 64)
├── osVersion: string (max 64)
├── hardwareSpecs: { cpu: string, ramMb: number, gpu: string, storageGb: number }
├── status: 'online' | 'offline' | 'in_session' | 'maintenance'
├── lastHeartbeat: Timestamp
├── registeredAt: Timestamp
├── agentVersion: string (semver, max 20)
└── config: { gracePeriodSeconds, clipboardPolicy, recordingEnabled, sessionWorkspacePath, consentTextVersion }

remote_desktop_apps
├── appId (doc ID)
├── hostId: string → remote_desktop_hosts
├── displayName: string (max 128)
├── executablePath: string (max 512)
├── softwareCategory: string (max 64)
├── validationStatus: 'valid' | 'unavailable' | 'pending'
└── lastValidated: Timestamp

remote_desktop_sessions
├── sessionId (doc ID)
├── bookingId: string → resource_bookings
├── hostId: string → remote_desktop_hosts
├── consumerUid: string
├── ownerUid: string
├── projectRef: string | null (max 128)
├── status: 'pending' | 'active' | 'completed' | 'terminated' | 'failed'
├── connectionType: 'peer_to_peer' | 'turn_relay'
├── startedAt: Timestamp
├── endedAt: Timestamp
├── totalConnectedSeconds: number (0–86400)
├── totalDisconnectionGapSeconds: number (0–86400)
├── applicationsUsed: string[] (max 50)
├── filesProducedCount: number (0–10000)
├── disconnectionReason: string (max 256)
├── billedDurationMinutes: number (0–1440)
├── ownerApproved: boolean
└── recordingConsentGranted: boolean

remote_desktop_session_events
├── eventId (doc ID)
├── sessionId: string → remote_desktop_sessions
├── bookingId: string
├── eventType: string (max 64)
├── actorUid: string
├── actorRole: 'consumer' | 'owner' | 'system' | 'admin'
├── hostId: string
├── timestamp: Timestamp (ms precision)
├── previousEventHash: string | null (SHA-256 hex, 64 chars)
└── metadata: object (max 8KB)

remote_desktop_file_manifests
├── manifestId (doc ID)
├── sessionId: string → remote_desktop_sessions
├── bookingId: string
├── consumerUid: string
├── ownerUid: string
├── files: [{ name, sizeBytes, extension, sha256Hash, transferStatus }] (max 200)
├── manifestTimestamp: Timestamp
├── ownerApprovalStatus: 'pending' | 'approved' | 'rejected' | 'expired'
├── approvalTimestamp: Timestamp | null
└── expiryTimestamp: Timestamp

remote_desktop_incidents
├── incidentId (doc ID)
├── sessionId: string
├── bookingId: string
├── reporterUid: string
├── reporterRole: 'consumer' | 'owner'
├── category: 'connection_quality' | 'app_not_working' | 'security_concern' | 'billing_dispute' | 'other'
├── description: string (max 1000)
├── screenshotRef: string | null (max 512)
├── status: 'open' | 'investigating' | 'resolved' | 'escalated' | 'closed'
├── resolutionNote: string | null (max 2000)
├── createdAt: Timestamp
├── updatedAt: Timestamp
└── resolvedAt: Timestamp | null
```

## Correctness Properties

### Property 1: Session Gate Completeness (Req 4, Req 12)

**Validates: Requirements 4.1, 4.2, 12.1, 12.6**

For all session start requests, a session token is generated if and only if ALL four gate conditions pass simultaneously: booking status is "confirmed", owner has approved, current time is within window, and host is online with fresh heartbeat.

```
∀ request: SessionGateInput,
  evaluateSessionGate(request).canStart === true
  ⟺
  request.booking.status === 'confirmed'
  ∧ request.booking.approvedBy !== undefined
  ∧ request.currentTime >= (request.booking.startsAt - 15min)
  ∧ request.currentTime <= request.booking.endsAt
  ∧ request.host.status ∈ {'online', 'idle'}
  ∧ (request.currentTime - request.host.lastHeartbeat) < 90s
  ∧ request.appCount > 0
```

### Property 2: Token Validity Bound (Req 7)

**Validates: Requirements 7.1**

For all generated session tokens, the token validity duration never exceeds 24 hours regardless of booking window length or grace period configuration.

```
∀ token: SessionToken,
  (token.expiresAt - token.issuedAt) <= 24 * 60 * 60 * 1000
```

### Property 3: Token Signature Round-Trip (Req 7)

**Validates: Requirements 7.6**

For all valid token payloads, signing and then verifying produces true. For any tampered payload, verification produces false.

```
∀ payload: TokenPayload, secret: string,
  verifyToken(signToken(payload, secret), secret) === true

∀ payload: TokenPayload, secret: string, tampered: TokenPayload where tampered ≠ payload,
  verifyToken({ ...signToken(payload, secret), payload: tampered }, secret) === false
```

### Property 4: Audit Chain Integrity (Req 8)

**Validates: Requirements 8.5**

For all session event sequences, event N contains the SHA-256 hash of event N-1, creating a verifiable chain. The first event in a session has previousEventHash = null.

```
∀ events: SessionEvent[] ordered by timestamp,
  events[0].previousEventHash === null
  ∧ ∀ i > 0: events[i].previousEventHash === sha256(serialize(events[i-1]))
```

### Property 5: App Isolation Invariant (Req 1, Req 6)

**Validates: Requirements 1.1, 1.2, 6.1**

For all session configurations, if appCount is 0, the session cannot start. During active sessions, input is forwarded if and only if the focused window belongs to an allowlisted process.

```
∀ gateInput where gateInput.appCount === 0,
  evaluateSessionGate(gateInput).canStart === false

∀ focusEvent: { processId: string, allowlist: string[] },
  inputForwarded(focusEvent) === allowlist.includes(focusEvent.processId)
```

### Property 6: File Extension Deny-List (Req 9)

**Validates: Requirements 9.5**

For all file manifests, no file whose extension matches the deny-list ever appears in the manifest's files array.

```
∀ manifest: FileManifest, denyList: string[],
  manifest.files.every(f => !denyList.includes(f.extension.toLowerCase()))
```

### Property 7: Governance Preservation (Req 12)

**Validates: Requirements 12.1, 12.2, 12.3**

For all completed sessions, a usage ledger entry is created through the existing buildResourceUsageLedgerEntry function, and auto-finalisation never occurs.

```
∀ session where session.status === 'completed',
  ∃ ledgerEntry: ResourceUsageLedgerEntry
    where ledgerEntry.bookingId === session.bookingId
  ∧ session.ownerApproved === false → billingNotFinalised(session)
```

### Property 8: Incident Security Pause (Req 3)

**Validates: Requirements 3.4, 3.6**

For all incidents with category "security_concern", input forwarding is paused within 5 seconds. If unreviewed for 15 minutes, the session is terminated.

```
∀ incident where incident.category === 'security_concern',
  ∃ inputPauseEvent within 5s of incident.createdAt
  ∧ (¬reviewed(incident, incident.createdAt + 15min) → sessionTerminated(incident.sessionId))
```

### Property 9: POPIA Consent Gate (Req 2)

**Validates: Requirements 2.1, 2.2**

For all sessions on recording-enabled hosts, a media stream is established if and only if a popia_consent_granted event exists for that session.

```
∀ session on recording-enabled host,
  mediaStreamEstablished(session)
  ⟺
  ∃ event in session.events where event.eventType === 'popia_consent_granted'
```

### Property 10: Host Deactivation Cascade (Req 5)

**Validates: Requirements 5.6**

When a host is deactivated, all its apps become unavailable and no new sessions can be created.

```
∀ host where host.status === 'maintenance' ∨ host.deleted,
  ∀ app where app.hostId === host.hostId: app.validationStatus === 'unavailable'
  ∧ evaluateSessionGate({ hostId: host.hostId, ... }).canStart === false
```

## Error Handling

### Session Gate Errors
- `booking_not_confirmed`: Booking exists but status is not "confirmed"
- `owner_not_approved`: No approval record from Resource_Owner
- `outside_time_window`: Current time not within start-15min to end
- `host_offline`: Host heartbeat older than 90 seconds or status not idle/online
- `no_apps_configured`: No App_Allowlist entries for the target host
- `agent_version_unsupported`: Host agent version does not support app-level capture
- `agent_update_required`: Host agent more than 2 major versions behind

### Token Errors
- `expired_token`: Token validity has elapsed
- `consumed_token`: Token already used for initial connection
- `invalid_token`: HMAC signature verification failed
- `token_scope_violation`: Token presented for wrong booking/user/host
- `duplicate_token_use`: Simultaneous use of same token detected
- `token_generation_failed`: System error during token creation

### Session Errors
- `host_went_offline`: Host lost connectivity during connection setup
- `connection_failed`: WebRTC could not be established (host_unreachable, turn_unavailable, signalling_timeout)
- `policy_violation_full_desktop`: Full-desktop stream detected → immediate termination
- `session_terminated_security_timeout`: Security incident unreviewed for 15 minutes
- `consent_declined`: Resource_Consumer declined POPIA consent

### Retry Strategy
All write operations (audit events, usage records, WorkflowEvents) use exponential backoff:
- Attempt 1: immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 second delay
- Attempt 4: 4 second delay (final)
- On exhaustion: buffer locally (Host_Agent) or flag for manual review (Session_Broker)

## File Structure

```
src/services/remoteDesktop/
├── types.ts                      # Shared TypeScript interfaces and types
├── sessionGateService.ts         # Multi-condition session start validation
├── tokenService.ts               # Token generation, verification, TTL store
├── auditEventService.ts          # Chain-hashed audit event management
├── fileHandoffService.ts         # File manifest and handoff logic
├── incidentService.ts            # Incident creation and escalation
├── popiaConsentService.ts        # POPIA consent management
├── hostRegistryService.ts        # Host lifecycle and app allowlist
├── governanceBridgeService.ts    # Bridge to existing booking governance
├── sessionBrokerService.ts       # Top-level orchestrator
├── actionCentreAdapter.ts        # WorkflowEvent emission
├── projectPassportAdapter.ts     # ProjectRecord writes
├── analyticsAdapter.ts           # KPI data exposure
└── __tests__/
    ├── sessionGateService.test.ts
    ├── tokenService.test.ts
    ├── auditEventService.test.ts
    ├── fileHandoffService.test.ts
    ├── incidentService.test.ts
    ├── popiaConsentService.test.ts
    ├── hostRegistryService.test.ts
    ├── governanceBridgeService.test.ts
    └── sessionBrokerService.test.ts

src/components/
├── RemoteDesktopViewer.tsx       # Browser Viewer main component
├── RemoteDesktopSessionBar.tsx   # Session control bar
├── RemoteDesktopConsent.tsx      # POPIA consent prompt
├── RemoteDesktopIncidentForm.tsx # Incident report form
└── RemoteDesktopSummary.tsx      # Session summary panel
```

## API Endpoints

Added to `src/lib/api-router.ts`:

```
POST   /api/remote-desktop/sessions/start     # Session gate check + token mint
POST   /api/remote-desktop/sessions/end       # Graceful session termination
GET    /api/remote-desktop/sessions/:id       # Session details
GET    /api/remote-desktop/sessions/:id/events # Paginated session events

POST   /api/remote-desktop/hosts/register     # Host registration
PUT    /api/remote-desktop/hosts/:id/heartbeat # Heartbeat update
GET    /api/remote-desktop/hosts/:id/apps     # App allowlist for host

POST   /api/remote-desktop/incidents          # Create incident report
PUT    /api/remote-desktop/incidents/:id      # Update incident (admin)

POST   /api/remote-desktop/file-manifests/:id/approve  # Owner approves handoff
POST   /api/remote-desktop/file-manifests/:id/reject   # Owner rejects files

GET    /api/remote-desktop/agent/version      # Latest agent version info
GET    /api/remote-desktop/agent/download     # Agent installer download
```

## Testing Strategy

- **Unit tests (Vitest):** Pure function services (sessionGateService, tokenService, auditEventService, fileHandoffService, incidentService, popiaConsentService, hostRegistryService, governanceBridgeService)
- **Property-based tests:** Session gate completeness, token validity bounds, token signature round-trip, audit chain integrity, file extension deny-list, governance preservation
- **Integration tests:** API endpoint validation, Firestore read/write, existing service integration
- **Component tests:** Browser Viewer rendering, consent prompt, session bar, incident form
