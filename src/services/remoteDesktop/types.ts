/**
 * Remote Desktop Core — TypeScript Interfaces
 *
 * Data models for the Architex Remote Desktop session layer.
 * Maps to Firestore collections: remote_desktop_hosts, remote_desktop_apps,
 * remote_desktop_sessions, remote_desktop_session_events,
 * remote_desktop_file_manifests, remote_desktop_recordings.
 */

// Use the Firebase Timestamp type for Firestore fields.
// A local structural alias keeps this file portable across test environments.
export type { Timestamp } from 'firebase/firestore';

// ─── Host Registration ─────────────────────────────────────────────────────────

export interface RemoteDesktopHost {
  hostId: string;
  ownerUid: string;
  machineName: string; // Max 64 chars
  osVersion: string;
  hardwareSpecs: {
    cpuModel: string; // Max 128 chars
    ramMb: number;
    gpuModel: string; // Max 128 chars
    storageGb: number;
  };
  status: 'online' | 'offline' | 'in_session';
  lastHeartbeat: Timestamp;
  registrationTimestamp: Timestamp;
  configuration: {
    gracePeriodSeconds: number; // 0–3600
    clipboardPolicy: 'enabled' | 'disabled';
    sessionWorkspacePath: string; // Max 512 chars
    recordingEnabled: boolean;
  };
}

// ─── Application Allowlist ──────────────────────────────────────────────────────

export interface RemoteDesktopApp {
  appId: string;
  hostId: string;
  displayName: string; // Max 128 chars
  executablePath: string; // Max 512 chars
  softwareCategory: string; // Max 64 chars
  validationStatus: 'valid' | 'unavailable';
  lastValidatedTimestamp: Timestamp;
}

// ─── Sessions ───────────────────────────────────────────────────────────────────

export interface RemoteDesktopSession {
  sessionId: string;
  bookingId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  projectReference?: string; // Max 128 chars
  status: 'pending' | 'active' | 'completed' | 'terminated' | 'failed';
  connectionType: string; // Max 64 chars
  startTimestamp: Timestamp;
  endTimestamp?: Timestamp;
  totalConnectedSeconds: number; // 0–86400
  totalDisconnectionGapSeconds: number; // 0–86400
  applicationsUsed: string[]; // Max 50
  filesProducedCount: number; // 0–10000
  disconnectionReason: string; // Max 256 chars
  billedDurationMinutes?: number; // 0–1440
  ownerApproved: boolean;
  reconnectionAttempts: number; // 0–5
  tokenId: string;
}

// ─── Session Events (Audit Log) ─────────────────────────────────────────────────

export type SessionEventType =
  | 'session_started'
  | 'session_ended'
  | 'app_launched'
  | 'app_closed'
  | 'file_created'
  | 'file_modified'
  | 'focus_violation_attempted'
  | 'child_process_blocked'
  | 'clipboard_used'
  | 'auto_disconnect_triggered'
  | 'reconnection_attempted'
  | 'quality_profile_changed'
  | 'session_terminated_uac'
  | 'token_revoked'
  | 'token_integrity_failure'
  | 'owner_revoked'
  | 'broker_connectivity_lost'
  | 'buffer_overflow'
  | 'workspace_expired'
  | 'no_active_windows';

export interface RemoteDesktopSessionEvent {
  eventId: string;
  sessionId: string;
  bookingId: string;
  eventType: SessionEventType;
  actorUid: string;
  actorRole: string; // Max 64 chars
  hostId: string;
  timestamp: Timestamp;
  metadata: Record<string, unknown>; // Max 8KB serialized
}

// ─── File Manifests ─────────────────────────────────────────────────────────────

export interface FileManifestEntry {
  name: string; // Max 256 chars
  sizeBytes: number; // 0–10737418240 (10GB)
  extension: string; // Max 16 chars
  sha256Hash: string; // 64-char hex string
  transferStatus: 'pending' | 'transferring' | 'completed' | 'failed';
}

export interface RemoteDesktopFileManifest {
  manifestId: string;
  sessionId: string;
  bookingId: string;
  consumerUid: string;
  ownerUid: string;
  files: FileManifestEntry[]; // Max 200 entries
  manifestTimestamp: Timestamp;
  ownerApprovalStatus: 'pending' | 'approved' | 'rejected';
  approvalTimestamp?: Timestamp;
  expiryTimestamp: Timestamp; // 72 hours after session end
}

// ─── Recordings ─────────────────────────────────────────────────────────────────

export interface RemoteDesktopRecording {
  recordingId: string;
  sessionId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
  storagePath: string;
  durationSeconds: number; // Max 28800 (8 hours)
  sizeBytes: number;
  status: 'recording' | 'completed' | 'expired' | 'retained_dispute';
  retentionExpiryTimestamp: Timestamp; // 90 days after session
  disputeId?: string;
  createdAt: Timestamp;
}

// ─── Session Token ──────────────────────────────────────────────────────────────

export interface SessionTokenPayload {
  tid: string; // Token ID (UUIDv4)
  bid: string; // Booking ID
  cid: string; // Consumer UID
  hid: string; // Host ID
  ws: number; // Window start (Unix ms)
  we: number; // Window end (Unix ms)
  gp: number; // Grace period (seconds)
  iat: number; // Issued at (Unix ms)
}

// ─── Error Types ────────────────────────────────────────────────────────────────

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

export interface RemoteDesktopError {
  code: RemoteDesktopErrorCode;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  sessionId?: string;
}
