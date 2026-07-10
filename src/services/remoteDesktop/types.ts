/**
 * Remote Desktop V1 Architecture — Shared Types & Constants
 *
 * This module defines all TypeScript interfaces, enums, and constants
 * for the remote desktop service layer. It aligns with the existing
 * resource booking infrastructure (ResourceBookingStatus, ResourceBookingWindow)
 * from resourceBookingService.ts.
 */

import type {
  ResourceBookingStatus,
  ResourceBookingWindow,
  ResourceUsageLedgerEntry,
} from '@/services/resourceBookingService';

// ─── Re-exports for convenience ───────────────────────────────────────────────

export type { ResourceBookingStatus, ResourceBookingWindow, ResourceUsageLedgerEntry };

// ─── Firestore Timestamp ──────────────────────────────────────────────────────

export interface FirestoreTimestamp {
  seconds: number;
  nanoseconds: number;
}

// ─── Host Status ──────────────────────────────────────────────────────────────

export const HOST_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  IN_SESSION: 'in_session',
  MAINTENANCE: 'maintenance',
} as const;

export type HostStatus = 'online' | 'offline' | 'in_session' | 'maintenance';

// ─── Session Status ───────────────────────────────────────────────────────────

export const SESSION_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  TERMINATED: 'terminated',
  FAILED: 'failed',
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

// ─── Connection Type ──────────────────────────────────────────────────────────

export const CONNECTION_TYPE = {
  PEER_TO_PEER: 'peer_to_peer',
  TURN_RELAY: 'turn_relay',
} as const;

export type ConnectionType = (typeof CONNECTION_TYPE)[keyof typeof CONNECTION_TYPE];

// ─── App Validation Status ────────────────────────────────────────────────────

export const APP_VALIDATION_STATUS = {
  VALID: 'valid',
  UNAVAILABLE: 'unavailable',
  PENDING: 'pending',
} as const;

export type AppValidationStatus = 'valid' | 'unavailable' | 'pending';

// ─── File Transfer Status ─────────────────────────────────────────────────────
// Note: matches the existing schemas.ts FileTransferStatusEnum values

export const FILE_TRANSFER_STATUS = {
  PENDING: 'pending',
  TRANSFERRING: 'transferring',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REJECTED: 'rejected',
} as const;

export type FileTransferStatus = 'pending' | 'transferring' | 'completed' | 'failed' | 'rejected';

// ─── File Manifest Approval Status ────────────────────────────────────────────

export const MANIFEST_APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
} as const;

export type ManifestApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

// ─── Incident Category ────────────────────────────────────────────────────────

export const INCIDENT_CATEGORY = {
  CONNECTION_QUALITY: 'connection_quality',
  APP_NOT_WORKING: 'app_not_working',
  SECURITY_CONCERN: 'security_concern',
  BILLING_DISPUTE: 'billing_dispute',
  OTHER: 'other',
} as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORY)[keyof typeof INCIDENT_CATEGORY];

// ─── Incident Status ──────────────────────────────────────────────────────────

export const INCIDENT_STATUS = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  RESOLVED: 'resolved',
  ESCALATED: 'escalated',
  CLOSED: 'closed',
} as const;

export type IncidentStatus = (typeof INCIDENT_STATUS)[keyof typeof INCIDENT_STATUS];

// ─── Actor Role ───────────────────────────────────────────────────────────────
// Note: sessionAuditService.ts also exports an ActorRole type for Firestore
// role labels. This type is the canonical domain-level actor role.

export type ActorRole = 'consumer' | 'owner' | 'system' | 'admin';

// ─── Reporter Role (subset of ActorRole for incidents) ────────────────────────

export type ReporterRole = 'consumer' | 'owner';

// ─── Clipboard Policy ─────────────────────────────────────────────────────────

export const CLIPBOARD_POLICY = {
  ENABLED: 'enabled',
  DISABLED: 'disabled',
} as const;

export type ClipboardPolicy = 'enabled' | 'disabled';

// ─── Recording Status ─────────────────────────────────────────────────────────

export type RecordingStatus = 'recording' | 'completed' | 'expired' | 'retained_dispute';

// ─── Session Event Types ──────────────────────────────────────────────────────
// Comprehensive list combining the design spec events and existing codebase events

export const SESSION_EVENT_TYPES = {
  // Core session lifecycle
  SESSION_GATE_CHECK: 'session_gate_check',
  SESSION_STARTED: 'session_started',
  SESSION_ENDED: 'session_ended',

  // Application events
  APP_LAUNCHED: 'app_launched',
  APP_CLOSED: 'app_closed',

  // File events
  FILE_CREATED: 'file_created',
  FILE_MODIFIED: 'file_modified',
  FILE_BLOCKED_EXTENSION: 'file_blocked_extension',

  // Focus and input events
  FOCUS_VIOLATION_BLOCKED: 'focus_violation_blocked',
  FOCUS_VIOLATION_ATTEMPTED: 'focus_violation_attempted',
  PROLONGED_FOCUS_VIOLATION: 'prolonged_focus_violation',
  CHILD_PROCESS_BLOCKED: 'child_process_blocked',
  INPUT_BLOCKED: 'input_blocked',
  INPUT_RESUMED: 'input_resumed',
  NO_ACTIVE_WINDOWS: 'no_active_windows',

  // Clipboard
  CLIPBOARD_TRANSFER: 'clipboard_transfer',
  CLIPBOARD_USED: 'clipboard_used',

  // Connection and quality
  QUALITY_PROFILE_CHANGED: 'quality_profile_changed',
  AUTO_DISCONNECT: 'auto_disconnect',
  AUTO_DISCONNECT_TRIGGERED: 'auto_disconnect_triggered',
  RECONNECTION_ATTEMPTED: 'reconnection_attempted',
  BROKER_CONNECTIVITY_LOST: 'broker_connectivity_lost',

  // Consent and compliance
  POPIA_CONSENT_GRANTED: 'popia_consent_granted',
  CONSENT_DECLINED: 'consent_declined',

  // Incidents
  INCIDENT_RAISED: 'incident_raised',

  // Token events
  TOKEN_REVOKED: 'token_revoked',
  TOKEN_INTEGRITY_FAILURE: 'token_integrity_failure',
  DUPLICATE_TOKEN_USE: 'duplicate_token_use',

  // Policy violations
  POLICY_VIOLATION_FULL_DESKTOP: 'policy_violation_full_desktop',
  SESSION_REJECTED_NO_APPS: 'session_rejected_no_apps',
  SESSION_TERMINATED_SECURITY_TIMEOUT: 'session_terminated_security_timeout',
  SESSION_TERMINATED_UAC: 'session_terminated_uac',

  // Owner actions
  OWNER_REVOKED: 'owner_revoked',

  // Buffer and workspace events
  BUFFER_OVERFLOW: 'buffer_overflow',
  WORKSPACE_EXPIRED: 'workspace_expired',
} as const;

export type SessionEventType = (typeof SESSION_EVENT_TYPES)[keyof typeof SESSION_EVENT_TYPES];

// ─── Remote Desktop Error Codes ───────────────────────────────────────────────
// Matches RemoteDesktopErrorCodeEnum in schemas.ts

export type RemoteDesktopErrorCode =
  | 'session_not_started'
  | 'token_scope_violation'
  | 'invalid_token'
  | 'token_generation_failed'
  | 'connection_failed'
  | 'host_unreachable'
  | 'turn_unavailable'
  | 'signalling_timeout'
  | 'booking_window_expired'
  | 'awaiting_owner_confirmation'
  | 'booking_conflict'
  | 'booking_cancelled'
  | 'booking_expired'
  | 'billing_pending'
  | 'file_size_exceeded'
  | 'upload_failed'
  | 'workspace_inaccessible'
  | 'allowlist_empty';

// ─── Remote Desktop Error ─────────────────────────────────────────────────────

export interface RemoteDesktopError {
  code: RemoteDesktopErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  sessionId?: string;
}

// ─── Gate Error Codes ─────────────────────────────────────────────────────────

export const GATE_ERROR_CODES = {
  BOOKING_NOT_CONFIRMED: 'booking_not_confirmed',
  OWNER_NOT_APPROVED: 'owner_not_approved',
  OUTSIDE_TIME_WINDOW: 'outside_time_window',
  HOST_OFFLINE: 'host_offline',
  NO_APPS_CONFIGURED: 'no_apps_configured',
  AGENT_VERSION_UNSUPPORTED: 'agent_version_unsupported',
  AGENT_UPDATE_REQUIRED: 'agent_update_required',
} as const;

export type GateErrorCode = (typeof GATE_ERROR_CODES)[keyof typeof GATE_ERROR_CODES];

// ─── Token Error Codes ────────────────────────────────────────────────────────

export const TOKEN_ERROR_CODES = {
  EXPIRED_TOKEN: 'expired_token',
  CONSUMED_TOKEN: 'consumed_token',
  INVALID_TOKEN: 'invalid_token',
  TOKEN_SCOPE_VIOLATION: 'token_scope_violation',
  DUPLICATE_TOKEN_USE: 'duplicate_token_use',
  TOKEN_GENERATION_FAILED: 'token_generation_failed',
} as const;

export type TokenErrorCode = (typeof TOKEN_ERROR_CODES)[keyof typeof TOKEN_ERROR_CODES];

// ─── Session Error Codes ──────────────────────────────────────────────────────

export const SESSION_ERROR_CODES = {
  HOST_WENT_OFFLINE: 'host_went_offline',
  CONNECTION_FAILED: 'connection_failed',
  POLICY_VIOLATION_FULL_DESKTOP: 'policy_violation_full_desktop',
  SESSION_TERMINATED_SECURITY_TIMEOUT: 'session_terminated_security_timeout',
  CONSENT_DECLINED: 'consent_declined',
} as const;

export type SessionErrorCode = (typeof SESSION_ERROR_CODES)[keyof typeof SESSION_ERROR_CODES];

// ─── Default Deny-List Extensions (Req 9.5) ──────────────────────────────────

export const DEFAULT_DENY_LIST_EXTENSIONS: readonly string[] = [
  '.exe',
  '.dll',
  '.sys',
  '.bat',
  '.cmd',
  '.ps1',
  '.vbs',
  '.reg',
] as const;

// ─── Consent Type ─────────────────────────────────────────────────────────────

export type ConsentType = 'recording' | 'screenshot';

// ─── Configuration Defaults ───────────────────────────────────────────────────

export const REMOTE_DESKTOP_DEFAULTS = {
  /** Grace period in seconds (0–900) before enforced disconnect after booking end */
  GRACE_PERIOD_SECONDS: 300,
  /** Maximum token validity in milliseconds (24 hours) */
  MAX_TOKEN_VALIDITY_MS: 24 * 60 * 60 * 1000,
  /** Host heartbeat timeout in milliseconds (90 seconds) */
  HEARTBEAT_TIMEOUT_MS: 90_000,
  /** Time window early-join buffer in milliseconds (15 minutes before start) */
  EARLY_JOIN_BUFFER_MS: 15 * 60 * 1000,
  /** Maximum session duration in seconds (24 hours) */
  MAX_SESSION_DURATION_SECONDS: 86_400,
  /** Maximum files in a manifest */
  MAX_MANIFEST_FILES: 200,
  /** Maximum metadata object size in bytes */
  MAX_METADATA_BYTES: 8 * 1024,
  /** File handoff expiry in hours */
  FILE_HANDOFF_EXPIRY_HOURS: 72,
  /** Incident post-session reporting window in hours */
  INCIDENT_REPORTING_WINDOW_HOURS: 72,
  /** Security incident review timeout in minutes */
  SECURITY_REVIEW_TIMEOUT_MINUTES: 15,
  /** Maximum apps per allowlist */
  MAX_APPS_PER_HOST: 20,
  /** Paginated query default page size */
  DEFAULT_PAGE_SIZE: 200,
  /** Unfinalised billing flagging threshold in days */
  BILLING_FINALISE_THRESHOLD_DAYS: 14,
} as const;

// ─── Interfaces ───────────────────────────────────────────────────────────────

// ── Session Token Payload ─────────────────────────────────────────────────────
// Compact token payload used in the HMAC-signed token wire format

export interface SessionTokenPayload {
  tid: string;     // Token ID
  bid: string;     // Booking ID
  cid: string;     // Consumer UID
  hid: string;     // Host ID
  ws: number;      // Window start (Unix ms)
  we: number;      // Window end (Unix ms)
  gp: number;      // Grace period (seconds)
  iat: number;     // Issued at (Unix ms)
}

// ── Host Record ───────────────────────────────────────────────────────────────

export interface HostHardwareSpecs {
  cpu: string;
  ramMb: number;
  gpu: string;
  storageGb: number;
}

export interface HostConfig {
  gracePeriodSeconds: number;
  clipboardPolicy: ClipboardPolicy;
  recordingEnabled: boolean;
  sessionWorkspacePath: string;
  consentTextVersion: string;
}

export interface HostRecord {
  hostId: string;
  ownerUid: string;
  resourceListingId: string;
  machineName: string;
  osVersion: string;
  hardwareSpecs: HostHardwareSpecs;
  status: HostStatus;
  lastHeartbeat: string;
  registeredAt: string;
  agentVersion: string;
  config: HostConfig;
}

// ── Remote Desktop App (Firestore: remote_desktop_apps) ───────────────────────

export interface RemoteDesktopApp {
  appId: string;
  hostId: string;
  displayName: string;
  executablePath: string;
  softwareCategory: string;
  validationStatus: AppValidationStatus;
  lastValidatedTimestamp: FirestoreTimestamp;
}

// ── App Record (design-doc shape using ISO strings) ───────────────────────────

export interface AppRecord {
  appId: string;
  hostId: string;
  displayName: string;
  executablePath: string;
  softwareCategory: string;
  validationStatus: AppValidationStatus;
  lastValidated: string;
}

// ── Remote Desktop Session (Firestore: remote_desktop_sessions) ───────────────

export interface RemoteDesktopSession {
  sessionId: string;
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  projectReference?: string;
  status: SessionStatus;
  connectionType: string;
  startTimestamp: FirestoreTimestamp | null;
  endTimestamp?: FirestoreTimestamp | null;
  totalConnectedSeconds: number;
  totalDisconnectionGapSeconds: number;
  applicationsUsed: string[];
  filesProducedCount: number;
  disconnectionReason: string;
  billedDurationMinutes?: number;
  ownerApproved: boolean;
  reconnectionAttempts: number;
  tokenId: string;
}

// ── Session Record (design-doc shape using ISO strings) ───────────────────────

export interface SessionRecord {
  sessionId: string;
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  projectRef: string | null;
  status: SessionStatus;
  connectionType: ConnectionType;
  startedAt: string;
  endedAt: string;
  totalConnectedSeconds: number;
  totalDisconnectionGapSeconds: number;
  applicationsUsed: string[];
  filesProducedCount: number;
  disconnectionReason: string;
  billedDurationMinutes: number;
  ownerApproved: boolean;
  recordingConsentGranted: boolean;
}

// ── Remote Desktop Session Event (Firestore: remote_desktop_session_events) ───

export interface RemoteDesktopSessionEvent {
  eventId: string;
  sessionId: string;
  bookingId: string;
  eventType: SessionEventType;
  actorUid: string;
  actorRole: string;
  hostId: string;
  timestamp: FirestoreTimestamp;
  metadata: Record<string, unknown>;
}

// ── Session Event (design-doc shape using ISO strings with chain hash) ────────

export interface SessionEvent {
  eventId: string;
  sessionId: string;
  bookingId: string;
  eventType: SessionEventType | string;
  actorUid: string;
  actorRole: ActorRole;
  hostId: string;
  timestamp: string;
  previousEventHash: string | null;
  metadata: Record<string, unknown>;
}

// ── File Manifest Entry ───────────────────────────────────────────────────────

export interface FileManifestEntry {
  name: string;
  sizeBytes: number;
  extension: string;
  sha256Hash: string;
  transferStatus: FileTransferStatus;
}

// ── Remote Desktop File Manifest (Firestore: remote_desktop_file_manifests) ───

export interface RemoteDesktopFileManifest {
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: FileManifestEntry[];
  manifestTimestamp: FirestoreTimestamp;
  ownerApprovalStatus: ManifestApprovalStatus;
  approvalTimestamp?: FirestoreTimestamp;
  expiryTimestamp: FirestoreTimestamp;
}

// ── File Manifest (design-doc shape using ISO strings) ────────────────────────

export interface FileManifest {
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: FileManifestEntry[];
  manifestTimestamp: string;
  ownerApprovalStatus: ManifestApprovalStatus;
  approvalTimestamp: string | null;
  expiryTimestamp: string;
}

// ── Incident Report ───────────────────────────────────────────────────────────

export interface IncidentReport {
  incidentId: string;
  sessionId: string;
  bookingId: string;
  reporterUid: string;
  reporterRole: ReporterRole;
  category: IncidentCategory;
  description: string;
  screenshotRef?: string;
  status: IncidentStatus;
  resolutionNote?: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

// ── Remote Desktop Recording (Firestore: remote_desktop_recordings) ───────────

export interface RemoteDesktopRecording {
  recordingId: string;
  sessionId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  storagePath: string;
  durationSeconds: number;
  sizeBytes: number;
  status: RecordingStatus;
  retentionExpiryTimestamp: FirestoreTimestamp;
  disputeId?: string;
  createdAt: FirestoreTimestamp;
}

// ── Session Token (design-doc expanded shape) ─────────────────────────────────

export interface SessionToken {
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

// ── Session Gate Input ────────────────────────────────────────────────────────

export interface SessionGateInput {
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
    status: HostStatus;
    lastHeartbeat: string;
    resourceListingId: string;
    agentVersion: string;
  };
  appCount: number;
}

// ── Session Gate Result ───────────────────────────────────────────────────────

export interface SessionGateError {
  code: GateErrorCode;
  message: string;
}

export interface SessionGateResult {
  canStart: boolean;
  conditions: {
    bookingConfirmed: boolean;
    ownerApproved: boolean;
    withinTimeWindow: boolean;
    hostOnline: boolean;
  };
  errors: SessionGateError[];
}

// ── POPIA Consent Record ──────────────────────────────────────────────────────

export interface PopiaConsentRecord {
  consentType: ConsentType;
  consentTextVersion: string;
  consumerUid: string;
  timestamp: string;
  ipAddressHash: string;
}

// ── Session Summary (Browser Viewer) ──────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  totalConnectedTime: string;
  applicationsUsed: string[];
  filesProducedCount: number;
  totalFileSizeBytes: number;
  disconnectionReason: string;
  fileHandoffStatus: ManifestApprovalStatus | 'none';
}

// ── Workflow Event Payloads (Action Centre integration) ───────────────────────

export interface RemoteDesktopWorkflowEvent {
  eventType: 'session_started' | 'session_ended' | 'focus_violation' | 'incident_raised' | 'file_handoff_pending' | 'billing_pending';
  sessionId: string;
  bookingId: string;
  targetUid: string;
  targetRole: ActorRole;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ── Analytics KPI Data ────────────────────────────────────────────────────────

export interface RemoteDesktopKPIs {
  hostUtilisationRate: number;
  revenuePerHostCents: number;
  sessionReliability: number;
  averageSessionDurationMinutes: number;
  incidentRate: number;
  periodStart: string;
  periodEnd: string;
}
