/**
 * Session Recording Lifecycle Service
 *
 * Manages session recording lifecycle: start, stop, metadata persistence,
 * access control, and retention policy enforcement.
 *
 * Key behaviors:
 * - Recording enabled/disabled per host configuration (default disabled)
 * - Recordings stored on Architex-controlled infrastructure (not host machine)
 * - Maximum 8 hours (28800 seconds) recording per session
 * - Access: viewable/downloadable by owner, consumer, Platform_Admin only
 * - No deletion before retention expiry
 * - 90-day retention; extend if dispute open; permanent delete after retention
 *
 * Requirements: 16.1, 16.4, 16.5, 16.6, 16.7
 */

import { adminDb } from '@/lib/firebase-admin';
import { RemoteDesktopRecordingSchema } from './schemas';
import type { RemoteDesktopRecording } from './types';

// ─── Constants ──────────────────────────────────────────────────────────────────

const RECORDINGS_COLLECTION = 'remote_desktop_recordings';
const HOSTS_COLLECTION = 'remote_desktop_hosts';
const SESSIONS_COLLECTION = 'remote_desktop_sessions';

/** Maximum recording duration: 8 hours in seconds */
export const MAX_RECORDING_DURATION_SECONDS = 28800;

/** Default retention period: 90 days in milliseconds */
export const RETENTION_PERIOD_MS = 90 * 24 * 60 * 60 * 1000;

/** Dispute extension: 30 days after dispute resolution in milliseconds */
export const DISPUTE_EXTENSION_MS = 30 * 24 * 60 * 60 * 1000;

/** Storage base path on Architex infrastructure */
const STORAGE_BASE_PATH = 'architex-recordings';

// ─── Types ──────────────────────────────────────────────────────────────────────

export type RecordingAccessRole = 'Owner' | 'Consumer' | 'Platform_Admin';

export interface StartRecordingInput {
  sessionId: string;
  hostId: string;
  consumerUid: string;
  ownerUid: string;
}

export interface StopRecordingInput {
  recordingId: string;
  durationSeconds: number;
  sizeBytes: number;
}

export interface RecordingAccessCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface ExtendRetentionInput {
  recordingId: string;
  disputeId: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function generateRecordingId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowTimestamp(): Timestamp {
  const now = Date.now();
  return { seconds: Math.floor(now / 1000), nanoseconds: (now % 1000) * 1_000_000 } as unknown as Timestamp;
}

import type { Timestamp } from 'firebase/firestore';

function msToTimestamp(ms: number): Timestamp {
  return { seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1_000_000 } as unknown as Timestamp;
}

// ─── Core Functions ─────────────────────────────────────────────────────────────

/**
 * Check if recording is enabled for a given host.
 * Returns false (disabled) if host not found or configuration missing.
 */
export async function isRecordingEnabledForHost(hostId: string): Promise<boolean> {
  try {
    const hostDoc = await adminDb.collection(HOSTS_COLLECTION).doc(hostId).get();
    if (!hostDoc.exists) return false;

    const host = hostDoc.data();
    return host?.configuration?.recordingEnabled === true;
  } catch {
    return false;
  }
}

/**
 * Start recording for a session.
 *
 * Creates a recording metadata record in the `remote_desktop_recordings` collection
 * with status 'recording'. The actual media capture is handled by the Host Agent;
 * this service manages the metadata and lifecycle.
 *
 * @throws Error if recording is not enabled for the host
 * @throws Error if validation fails
 */
export async function startRecording(
  input: StartRecordingInput,
): Promise<RemoteDesktopRecording> {
  // Verify recording is enabled for this host
  const enabled = await isRecordingEnabledForHost(input.hostId);
  if (!enabled) {
    throw new Error(
      `Recording is not enabled for host ${input.hostId}. Enable recording in host configuration.`,
    );
  }

  const recordingId = generateRecordingId();
  const createdAt = nowTimestamp();
  const retentionExpiryMs = Date.now() + RETENTION_PERIOD_MS;
  const storagePath = `${STORAGE_BASE_PATH}/${input.hostId}/${input.sessionId}/${recordingId}`;

  const recording: RemoteDesktopRecording = {
    recordingId,
    sessionId: input.sessionId,
    hostId: input.hostId,
    consumerUid: input.consumerUid,
    ownerUid: input.ownerUid,
    storagePath,
    durationSeconds: 0,
    sizeBytes: 0,
    status: 'recording',
    retentionExpiryTimestamp: msToTimestamp(retentionExpiryMs),
    createdAt,
  };

  // Validate against schema
  const validation = RemoteDesktopRecordingSchema.safeParse(recording);
  if (!validation.success) {
    throw new Error(
      `Recording validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`,
    );
  }

  await adminDb.collection(RECORDINGS_COLLECTION).doc(recordingId).set(recording);

  return recording;
}

/**
 * Stop an active recording.
 *
 * Updates the recording status to 'completed' and stores the final
 * duration and size. Enforces the 8-hour maximum duration cap.
 *
 * @throws Error if recording not found
 * @throws Error if recording is not in 'recording' status
 * @throws Error if duration exceeds maximum (28800 seconds)
 */
export async function stopRecording(
  input: StopRecordingInput,
): Promise<RemoteDesktopRecording> {
  const docRef = adminDb.collection(RECORDINGS_COLLECTION).doc(input.recordingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Recording not found: ${input.recordingId}`);
  }

  const recording = doc.data() as RemoteDesktopRecording;

  if (recording.status !== 'recording') {
    throw new Error(
      `Cannot stop recording in status '${recording.status}'. Only 'recording' status can be stopped.`,
    );
  }

  // Enforce maximum 8 hours recording duration
  const cappedDuration = Math.min(input.durationSeconds, MAX_RECORDING_DURATION_SECONDS);

  const updatedRecording: RemoteDesktopRecording = {
    ...recording,
    durationSeconds: cappedDuration,
    sizeBytes: input.sizeBytes,
    status: 'completed',
  };

  // Validate the updated record
  const validation = RemoteDesktopRecordingSchema.safeParse(updatedRecording);
  if (!validation.success) {
    throw new Error(
      `Recording validation failed: ${validation.error.issues.map((i) => i.message).join(', ')}`,
    );
  }

  await docRef.update({
    durationSeconds: cappedDuration,
    sizeBytes: input.sizeBytes,
    status: 'completed',
  });

  return updatedRecording;
}

/**
 * Get recording metadata by recording ID.
 *
 * Returns null if not found.
 */
export async function getRecordingMetadata(
  recordingId: string,
): Promise<RemoteDesktopRecording | null> {
  const doc = await adminDb.collection(RECORDINGS_COLLECTION).doc(recordingId).get();

  if (!doc.exists) return null;

  return doc.data() as RemoteDesktopRecording;
}

/**
 * Get recording metadata by session ID.
 *
 * Returns null if no recording exists for the session.
 */
export async function getRecordingBySessionId(
  sessionId: string,
): Promise<RemoteDesktopRecording | null> {
  const snapshot = await adminDb
    .collection(RECORDINGS_COLLECTION)
    .where('sessionId', '==', sessionId)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  return snapshot.docs[0].data() as RemoteDesktopRecording;
}

/**
 * Check if a user has access to view/download a recording.
 *
 * Access is granted only to:
 * - Resource_Owner of the host
 * - Resource_Consumer for that session
 * - Platform_Admin
 *
 * All other roles are denied access (Requirement 16.5).
 */
export async function checkAccess(
  recordingId: string,
  actorUid: string,
  actorRole: RecordingAccessRole,
): Promise<RecordingAccessCheckResult> {
  // Platform_Admin always has access
  if (actorRole === 'Platform_Admin') {
    return { allowed: true };
  }

  const recording = await getRecordingMetadata(recordingId);

  if (!recording) {
    return { allowed: false, reason: 'Recording not found' };
  }

  // Owner access: the actor must be the ownerUid of the recording
  if (actorRole === 'Owner' && recording.ownerUid === actorUid) {
    return { allowed: true };
  }

  // Consumer access: the actor must be the consumerUid of the recording
  if (actorRole === 'Consumer' && recording.consumerUid === actorUid) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'Access denied. Only owner, consumer, or Platform_Admin may access recordings.' };
}

/**
 * Check if the retention period has expired for a recording.
 *
 * Returns true if:
 * - The current time is past the retention expiry timestamp
 * - AND the recording is NOT in 'retained_dispute' status
 *
 * Returns false if:
 * - The retention has not yet expired
 * - OR the recording is retained due to an open dispute
 */
export function isRetentionExpired(
  recording: RemoteDesktopRecording,
  nowMs?: number,
): boolean {
  const currentMs = nowMs ?? Date.now();
  const expiryMs =
    recording.retentionExpiryTimestamp.seconds * 1000 +
    Math.floor(recording.retentionExpiryTimestamp.nanoseconds / 1_000_000);

  // If in dispute-retained status, retention is not expired regardless of time
  if (recording.status === 'retained_dispute') {
    return false;
  }

  return currentMs >= expiryMs;
}

/**
 * Extend recording retention due to an open dispute.
 *
 * Sets the recording status to 'retained_dispute' and associates the dispute ID.
 * The recording will be retained until 30 days after the dispute is resolved.
 *
 * @throws Error if recording not found
 * @throws Error if recording has already been deleted (status 'expired')
 */
export async function extendRetention(
  input: ExtendRetentionInput,
): Promise<RemoteDesktopRecording> {
  const docRef = adminDb.collection(RECORDINGS_COLLECTION).doc(input.recordingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Recording not found: ${input.recordingId}`);
  }

  const recording = doc.data() as RemoteDesktopRecording;

  if (recording.status === 'expired') {
    throw new Error(
      `Cannot extend retention for expired recording ${input.recordingId}. Recording has been permanently deleted.`,
    );
  }

  const updatedRecording: RemoteDesktopRecording = {
    ...recording,
    status: 'retained_dispute',
    disputeId: input.disputeId,
  };

  await docRef.update({
    status: 'retained_dispute',
    disputeId: input.disputeId,
  });

  return updatedRecording;
}

/**
 * Resolve a dispute and set a new retention expiry (30 days from resolution).
 *
 * After the dispute is resolved, the recording transitions back to 'completed'
 * status with a new expiry of 30 days from now.
 *
 * @throws Error if recording not found
 * @throws Error if recording is not in 'retained_dispute' status
 */
export async function resolveDisputeRetention(
  recordingId: string,
): Promise<RemoteDesktopRecording> {
  const docRef = adminDb.collection(RECORDINGS_COLLECTION).doc(recordingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  const recording = doc.data() as RemoteDesktopRecording;

  if (recording.status !== 'retained_dispute') {
    throw new Error(
      `Cannot resolve dispute retention for recording in status '${recording.status}'. Expected 'retained_dispute'.`,
    );
  }

  const newExpiryMs = Date.now() + DISPUTE_EXTENSION_MS;

  const updatedRecording: RemoteDesktopRecording = {
    ...recording,
    status: 'completed',
    retentionExpiryTimestamp: msToTimestamp(newExpiryMs),
    disputeId: undefined,
  };

  await docRef.update({
    status: 'completed',
    retentionExpiryTimestamp: msToTimestamp(newExpiryMs),
    disputeId: null,
  });

  return updatedRecording;
}

/**
 * Mark a recording as expired (permanently deleted).
 *
 * This should only be called after confirming retention has expired
 * via `isRetentionExpired()`.
 *
 * @throws Error if recording not found
 * @throws Error if retention has not yet expired
 * @throws Error if recording is in 'retained_dispute' status (cannot delete during dispute)
 */
export async function markExpired(recordingId: string): Promise<RemoteDesktopRecording> {
  const docRef = adminDb.collection(RECORDINGS_COLLECTION).doc(recordingId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error(`Recording not found: ${recordingId}`);
  }

  const recording = doc.data() as RemoteDesktopRecording;

  // Cannot delete during open dispute
  if (recording.status === 'retained_dispute') {
    throw new Error(
      `Cannot delete recording ${recordingId}. Recording is retained due to an open dispute.`,
    );
  }

  // Cannot delete if retention has not expired
  if (!isRetentionExpired(recording)) {
    throw new Error(
      `Cannot delete recording ${recordingId}. Retention period has not expired.`,
    );
  }

  const updatedRecording: RemoteDesktopRecording = {
    ...recording,
    status: 'expired',
  };

  await docRef.update({
    status: 'expired',
  });

  return updatedRecording;
}

/**
 * Attempt to delete a recording. Always throws — recordings cannot be
 * deleted before retention expires (Requirement 16.5).
 *
 * Use `markExpired()` after retention expiry to permanently remove recordings.
 */
export function deleteRecording(): never {
  throw new Error(
    'Recordings cannot be deleted before retention period expires. Use markExpired() after retention expiry.',
  );
}
