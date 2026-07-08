/**
 * Provenance Service — AI Output Provenance Tracking
 *
 * Manages immutable provenance records for all AI-generated content
 * (both internal Copilot outputs and BYOAI imports). Provides creation,
 * attachment, override/attestation, and paginated query operations.
 *
 * Firestore paths:
 * - Provenance records: `projects/{projectId}/ai_provenance/{recordId}`
 * - Override records: `projects/{projectId}/ai_provenance/{recordId}/overrides/{overrideId}`
 *
 * @module provenanceService
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.7, 5.8
 */

import { adminDb } from '@/lib/firebase-admin';
import type {
  ProvenanceRecord,
  ProvenanceOverride,
  CopilotCapability,
  CopilotSource,
} from '@/services/copilotTypes';
import type { UserRole } from '@/types';

// ─── Input Types ───────────────────────────────────────────────────────────

export interface CreateProvenanceParams {
  projectId: string;
  threadId: string;
  messageId: string;
  modelId: string;
  generatedAt: string;
  acceptedBy: string;
  acceptedAt: string;
  source: CopilotSource;
  capability: CopilotCapability | null;
  confidence: number | null;
}

export interface PaginatedResult<T> {
  records: T[];
  hasMore: boolean;
}

export interface PaginationOptions {
  limit?: number;
  startAfter?: string;
}

// ─── Validation Helpers ────────────────────────────────────────────────────

function validateModelId(modelId: string): void {
  if (!modelId || modelId.length > 128) {
    throw new Error('modelId is required and must be at most 128 characters.');
  }
}

function validateConfidence(confidence: number | null): void {
  if (confidence !== null) {
    if (typeof confidence !== 'number' || confidence < 0 || confidence > 1) {
      throw new Error('confidence must be a number between 0.00 and 1.00 inclusive, or null.');
    }
  }
}

function validateSource(source: CopilotSource): void {
  if (source !== 'internal' && source !== 'external') {
    throw new Error("source must be 'internal' or 'external'.");
  }
}

function validateISOTimestamp(value: string, fieldName: string): void {
  if (!value || isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be a valid ISO 8601 timestamp.`);
  }
}

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Create a provenance record for an AI output.
 *
 * Validates input fields, generates a unique ID, writes to Firestore, and
 * returns the created record.
 *
 * @requirements 5.1, 5.4
 */
export async function createProvenanceRecord(
  params: CreateProvenanceParams
): Promise<ProvenanceRecord> {
  // Validate required fields
  if (!params.projectId) throw new Error('projectId is required.');
  if (!params.threadId) throw new Error('threadId is required.');
  if (!params.messageId) throw new Error('messageId is required.');
  if (!params.acceptedBy) throw new Error('acceptedBy is required.');

  validateModelId(params.modelId);
  validateConfidence(params.confidence);
  validateSource(params.source);
  validateISOTimestamp(params.generatedAt, 'generatedAt');
  validateISOTimestamp(params.acceptedAt, 'acceptedAt');

  // Generate unique ID
  const collectionRef = adminDb.collection(`projects/${params.projectId}/ai_provenance`);
  const docRef = collectionRef.doc();
  const recordId = docRef.id;

  const record: ProvenanceRecord = {
    id: recordId,
    projectId: params.projectId,
    threadId: params.threadId,
    messageId: params.messageId,
    modelId: params.modelId,
    generatedAt: params.generatedAt,
    acceptedBy: params.acceptedBy,
    acceptedAt: params.acceptedAt,
    source: params.source,
    capability: params.capability,
    confidence: params.confidence,
    targetRecordId: null,
    targetRecordType: null,
  };

  await docRef.set(record);

  return record;
}

/**
 * Attach a provenance record to a target project record.
 *
 * This is the only permitted "update" — a one-time attachment of target fields.
 * If the provenance record does not exist, the operation throws, which blocks
 * the caller from inserting AI content without provenance tracking.
 *
 * @requirements 5.2, 5.3
 */
export async function attachProvenanceToRecord(
  provenanceId: string,
  projectId: string,
  targetRecordId: string,
  targetRecordType: string
): Promise<void> {
  if (!provenanceId) throw new Error('provenanceId is required.');
  if (!projectId) throw new Error('projectId is required.');
  if (!targetRecordId) throw new Error('targetRecordId is required.');
  if (!targetRecordType) throw new Error('targetRecordType is required.');

  const docRef = adminDb.doc(`projects/${projectId}/ai_provenance/${provenanceId}`);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new Error(
      `Provenance record '${provenanceId}' does not exist. ` +
      'Cannot attach AI content to a project record without valid provenance tracking.'
    );
  }

  const existing = snapshot.data() as ProvenanceRecord;

  // Only allow attachment if not already attached
  if (existing.targetRecordId !== null) {
    throw new Error(
      `Provenance record '${provenanceId}' is already attached to record '${existing.targetRecordId}'. ` +
      'Provenance attachment is a one-time operation.'
    );
  }

  // This is the only permitted field update — one-time target attachment
  await docRef.update({
    targetRecordId,
    targetRecordType,
  });
}

/**
 * Create a professional override/attestation record linked to a provenance record.
 *
 * Validates that the declaration is at least 20 characters, verifies the parent
 * provenance record exists, and writes the override to the subcollection.
 *
 * @requirements 5.8
 */
export async function createOverride(
  projectId: string,
  provenanceRecordId: string,
  attestation: {
    attestedBy: string;
    attestedRole: UserRole;
    declaration: string;
  }
): Promise<ProvenanceOverride> {
  if (!projectId) throw new Error('projectId is required.');
  if (!provenanceRecordId) throw new Error('provenanceRecordId is required.');
  if (!attestation.attestedBy) throw new Error('attestedBy is required.');
  if (!attestation.attestedRole) throw new Error('attestedRole is required.');

  // Validate declaration minimum length
  if (!attestation.declaration || attestation.declaration.length < 20) {
    throw new Error('declaration must be at least 20 characters describing the review performed.');
  }

  // Verify the provenance record exists
  const provenanceDocRef = adminDb.doc(
    `projects/${projectId}/ai_provenance/${provenanceRecordId}`
  );
  const provenanceSnapshot = await provenanceDocRef.get();

  if (!provenanceSnapshot.exists) {
    throw new Error(
      `Provenance record '${provenanceRecordId}' does not exist. Cannot create override.`
    );
  }

  // Write override to subcollection
  const overridesRef = provenanceDocRef.collection('overrides');
  const overrideDocRef = overridesRef.doc();
  const overrideId = overrideDocRef.id;

  const override: ProvenanceOverride = {
    id: overrideId,
    provenanceRecordId,
    attestedBy: attestation.attestedBy,
    attestedRole: attestation.attestedRole,
    declaration: attestation.declaration,
    attestedAt: new Date().toISOString(),
  };

  await overrideDocRef.set(override);

  return override;
}

/**
 * Query all provenance records for a project, paginated and sorted by generatedAt descending.
 *
 * Supports cursor-based pagination via `startAfter` (a generatedAt timestamp value).
 * Default limit is 50, maximum is 200.
 *
 * @requirements 5.6
 */
export async function queryByProject(
  projectId: string,
  pagination: PaginationOptions = {}
): Promise<PaginatedResult<ProvenanceRecord>> {
  if (!projectId) throw new Error('projectId is required.');

  const limit = Math.min(Math.max(pagination.limit || 50, 1), 200);

  const collectionRef = adminDb.collection(`projects/${projectId}/ai_provenance`);
  let query = collectionRef.orderBy('generatedAt', 'desc');

  if (pagination.startAfter) {
    query = query.startAfter(pagination.startAfter);
  }

  // Fetch one extra to determine if there are more results
  const snapshot = await query.limit(limit + 1).get();

  const records: ProvenanceRecord[] = [];
  const docs = snapshot.docs.slice(0, limit);

  for (const doc of docs) {
    records.push(doc.data() as ProvenanceRecord);
  }

  return {
    records,
    hasMore: snapshot.docs.length > limit,
  };
}

/**
 * Update a provenance record — ALWAYS throws.
 *
 * Provenance records are immutable. This function exists to enforce the
 * immutability contract explicitly.
 *
 * @requirements 5.7
 */
export function updateProvenanceRecord(): never {
  throw new Error('Provenance records are immutable and cannot be modified or deleted.');
}

/**
 * Delete a provenance record — ALWAYS throws.
 *
 * Provenance records are immutable. This function exists to enforce the
 * immutability contract explicitly.
 *
 * @requirements 5.7
 */
export function deleteProvenanceRecord(): never {
  throw new Error('Provenance records are immutable and cannot be modified or deleted.');
}
