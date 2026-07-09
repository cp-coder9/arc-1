/**
 * Remote Desktop Core — Zod validation schemas for all Firestore collection writes.
 *
 * Enforces field constraints: max lengths, numeric ranges, enums, and required fields.
 * Follows the same pattern as src/lib/schemas.ts.
 */

import { z } from 'zod';

// ─── Shared Sub-schemas ───────────────────────────────────────────────────────

/** Firestore Timestamp — accepts { seconds, nanoseconds } objects */
const TimestampSchema = z.object({
  seconds: z.number(),
  nanoseconds: z.number(),
});

// ─── Enums ────────────────────────────────────────────────────────────────────

export const HostStatusEnum = z.enum(['online', 'offline', 'in_session']);

export const AppValidationStatusEnum = z.enum(['valid', 'unavailable']);

export const SessionStatusEnum = z.enum([
  'pending',
  'active',
  'completed',
  'terminated',
  'failed',
]);

export const SessionEventTypeEnum = z.enum([
  'session_started',
  'session_ended',
  'app_launched',
  'app_closed',
  'file_created',
  'file_modified',
  'focus_violation_attempted',
  'child_process_blocked',
  'clipboard_used',
  'auto_disconnect_triggered',
  'reconnection_attempted',
  'quality_profile_changed',
  'session_terminated_uac',
  'token_revoked',
  'token_integrity_failure',
  'owner_revoked',
  'broker_connectivity_lost',
  'buffer_overflow',
  'workspace_expired',
  'no_active_windows',
]);

export const FileTransferStatusEnum = z.enum([
  'pending',
  'transferring',
  'completed',
  'failed',
]);

export const OwnerApprovalStatusEnum = z.enum(['pending', 'approved', 'rejected']);

export const RecordingStatusEnum = z.enum([
  'recording',
  'completed',
  'expired',
  'retained_dispute',
]);

export const ClipboardPolicyEnum = z.enum(['enabled', 'disabled']);

export const RemoteDesktopErrorCodeEnum = z.enum([
  'session_not_started',
  'token_scope_violation',
  'invalid_token',
  'token_generation_failed',
  'connection_failed',
  'host_unreachable',
  'turn_unavailable',
  'signalling_timeout',
  'booking_window_expired',
  'awaiting_owner_confirmation',
  'booking_conflict',
  'booking_cancelled',
  'booking_expired',
  'billing_pending',
  'file_size_exceeded',
  'upload_failed',
  'workspace_inaccessible',
  'allowlist_empty',
]);

// ─── remote_desktop_hosts ─────────────────────────────────────────────────────

export const HardwareSpecsSchema = z.object({
  cpuModel: z.string().min(1).max(128, 'CPU model must be at most 128 characters'),
  ramMb: z.number().int('RAM must be an integer').min(0),
  gpuModel: z.string().min(1).max(128, 'GPU model must be at most 128 characters'),
  storageGb: z.number().int('Storage must be an integer').min(0),
});

export const HostConfigurationSchema = z.object({
  gracePeriodSeconds: z.number().int().min(0).max(3600, 'Grace period must be at most 3600 seconds'),
  clipboardPolicy: ClipboardPolicyEnum,
  sessionWorkspacePath: z.string().min(1).max(512, 'Session workspace path must be at most 512 characters'),
  recordingEnabled: z.boolean(),
});

export const RemoteDesktopHostSchema = z.object({
  hostId: z.string().min(1, 'Host ID is required'),
  ownerUid: z.string().min(1, 'Owner UID is required'),
  machineName: z.string().min(1).max(64, 'Machine name must be at most 64 characters'),
  osVersion: z.string().min(1, 'OS version is required'),
  hardwareSpecs: HardwareSpecsSchema,
  status: HostStatusEnum,
  lastHeartbeat: TimestampSchema,
  registrationTimestamp: TimestampSchema,
  configuration: HostConfigurationSchema,
});

// ─── remote_desktop_apps ──────────────────────────────────────────────────────

export const RemoteDesktopAppSchema = z.object({
  appId: z.string().min(1, 'App ID is required'),
  hostId: z.string().min(1, 'Host ID is required'),
  displayName: z.string().min(1).max(128, 'Display name must be at most 128 characters'),
  executablePath: z.string().min(1).max(512, 'Executable path must be at most 512 characters'),
  softwareCategory: z.string().min(1).max(64, 'Software category must be at most 64 characters'),
  validationStatus: AppValidationStatusEnum,
  lastValidatedTimestamp: TimestampSchema,
});

// ─── remote_desktop_sessions ──────────────────────────────────────────────────

export const RemoteDesktopSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  bookingId: z.string().min(1, 'Booking ID is required'),
  hostId: z.string().min(1, 'Host ID is required'),
  consumerUid: z.string().min(1, 'Consumer UID is required'),
  ownerUid: z.string().min(1, 'Owner UID is required'),
  projectReference: z.string().max(128, 'Project reference must be at most 128 characters').optional(),
  status: SessionStatusEnum,
  connectionType: z.string().min(1).max(64, 'Connection type must be at most 64 characters'),
  startTimestamp: TimestampSchema,
  endTimestamp: TimestampSchema.optional(),
  totalConnectedSeconds: z.number().int().min(0).max(86400, 'Cannot exceed 86400 seconds'),
  totalDisconnectionGapSeconds: z.number().int().min(0).max(86400, 'Cannot exceed 86400 seconds'),
  applicationsUsed: z.array(z.string().min(1)).max(50, 'Cannot exceed 50 entries'),
  filesProducedCount: z.number().int().min(0).max(10000, 'Cannot exceed 10000'),
  disconnectionReason: z.string().max(256, 'Disconnection reason must be at most 256 characters'),
  billedDurationMinutes: z.number().int().min(0).max(1440, 'Cannot exceed 1440 minutes').optional(),
  ownerApproved: z.boolean(),
  reconnectionAttempts: z.number().int().min(0).max(5, 'Cannot exceed 5 reconnection attempts'),
  tokenId: z.string().min(1, 'Token ID is required'),
});

// ─── remote_desktop_session_events ────────────────────────────────────────────

export const RemoteDesktopSessionEventSchema = z.object({
  eventId: z.string().min(1, 'Event ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  bookingId: z.string().min(1, 'Booking ID is required'),
  eventType: SessionEventTypeEnum,
  actorUid: z.string().min(1, 'Actor UID is required'),
  actorRole: z.string().min(1).max(64, 'Actor role must be at most 64 characters'),
  hostId: z.string().min(1, 'Host ID is required'),
  timestamp: TimestampSchema,
  metadata: z.record(z.unknown()).refine(
    (val) => JSON.stringify(val).length <= 8192,
    { message: 'Metadata must be at most 8KB when serialized' }
  ),
});

// ─── remote_desktop_file_manifests ────────────────────────────────────────────

export const FileManifestEntrySchema = z.object({
  name: z.string().min(1).max(256, 'File name must be at most 256 characters'),
  sizeBytes: z.number().int().min(0).max(10737418240, 'File size cannot exceed 10GB'),
  extension: z.string().max(16, 'Extension must be at most 16 characters'),
  sha256Hash: z.string().length(64, 'SHA-256 hash must be exactly 64 characters')
    .regex(/^[0-9a-f]{64}$/i, 'SHA-256 hash must be a valid hex string'),
  transferStatus: FileTransferStatusEnum,
});

export const RemoteDesktopFileManifestSchema = z.object({
  manifestId: z.string().min(1, 'Manifest ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  bookingId: z.string().min(1, 'Booking ID is required'),
  consumerUid: z.string().min(1, 'Consumer UID is required'),
  ownerUid: z.string().min(1, 'Owner UID is required'),
  files: z.array(FileManifestEntrySchema).max(200, 'File manifest cannot exceed 200 entries'),
  manifestTimestamp: TimestampSchema,
  ownerApprovalStatus: OwnerApprovalStatusEnum,
  approvalTimestamp: TimestampSchema.optional(),
  expiryTimestamp: TimestampSchema,
});

// ─── remote_desktop_recordings ────────────────────────────────────────────────

export const RemoteDesktopRecordingSchema = z.object({
  recordingId: z.string().min(1, 'Recording ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  hostId: z.string().min(1, 'Host ID is required'),
  consumerUid: z.string().min(1, 'Consumer UID is required'),
  ownerUid: z.string().min(1, 'Owner UID is required'),
  storagePath: z.string().min(1, 'Storage path is required'),
  durationSeconds: z.number().int().min(0).max(28800, 'Duration cannot exceed 28800 seconds (8 hours)'),
  sizeBytes: z.number().int().min(0),
  status: RecordingStatusEnum,
  retentionExpiryTimestamp: TimestampSchema,
  disputeId: z.string().optional(),
  createdAt: TimestampSchema,
});

// ─── Session Token Payload ────────────────────────────────────────────────────

export const SessionTokenPayloadSchema = z.object({
  tid: z.string().min(1, 'Token ID is required'),
  bid: z.string().min(1, 'Booking ID is required'),
  cid: z.string().min(1, 'Consumer UID is required'),
  hid: z.string().min(1, 'Host ID is required'),
  ws: z.number().int('Window start must be an integer (Unix ms)'),
  we: z.number().int('Window end must be an integer (Unix ms)'),
  gp: z.number().int().min(0, 'Grace period cannot be negative'),
  iat: z.number().int('Issued at must be an integer (Unix ms)'),
}).refine(
  (data) => data.we > data.ws,
  { message: 'Window end must be after window start', path: ['we'] }
);

// ─── Error ────────────────────────────────────────────────────────────────────

export const RemoteDesktopErrorSchema = z.object({
  code: RemoteDesktopErrorCodeEnum,
  message: z.string().min(1, 'Error message is required'),
  details: z.record(z.unknown()).optional(),
  retryable: z.boolean(),
  sessionId: z.string().optional(),
});
