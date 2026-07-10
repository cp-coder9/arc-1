/**
 * BYOAI Bridge Service — External AI Content Import
 *
 * Handles structured import of externally-generated AI content with
 * provenance tagging. Supports two integration paths:
 * 1. API-first (POST /api/projects/{projectId}/ai-imports)
 * 2. UI paste-and-tag (Import Panel)
 *
 * All external AI content is tracked identically to internal Copilot outputs —
 * same provenance metadata, same audit trail, same visibility in compliance reviews.
 *
 * @module byoaiBridgeService
 * @requirements 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9
 */

import { adminDb } from '@/lib/firebase-admin';
import { BYOAIImportRequestSchema } from '@/lib/copilotSchemas';
import { createProvenanceRecord } from '@/services/provenanceService';
import type { BYOAIImportRequest, BYOAIImportResponse } from '@/services/copilotTypes';

// ─── Dependency Injection Interface ────────────────────────────────────────

export interface AuditEntry {
  userId: string;
  projectId: string;
  action: string;
  timestamp: string;
  contentType: string;
  modelName: string;
  status: 'success' | 'failure';
  failureReason?: string;
  documentId?: string;
  provenanceRecordId?: string;
}

export interface BYOAIServiceDeps {
  checkWritePermission(userId: string, projectId: string): Promise<boolean>;
  logAuditEvent(entry: AuditEntry): Promise<void>;
}

// ─── Error Types ───────────────────────────────────────────────────────────

export class BYOAIValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'BYOAIValidationError';
  }
}

export class BYOAIAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BYOAIAuthorizationError';
  }
}

export class BYOAIProvenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BYOAIProvenanceError';
  }
}

// ─── Main Import Function ──────────────────────────────────────────────────

/**
 * Import externally-generated AI content into a project with provenance tagging.
 *
 * Flow:
 * 1. Validate input payload using Zod schema
 * 2. Check user write access on target project
 * 3. Create provenance record (source: 'external', capability: null)
 * 4. Store content as draft document in project document register
 * 5. Log success to audit trail
 * 6. Return documentId and provenanceRecordId
 *
 * On any failure, the attempt is logged to the audit trail before throwing.
 *
 * @requirements 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9
 */
export async function importContent(
  projectId: string,
  userId: string,
  request: BYOAIImportRequest,
  deps: BYOAIServiceDeps
): Promise<BYOAIImportResponse> {
  const now = new Date().toISOString();

  // ── Step 1: Validate payload ─────────────────────────────────────────────
  const parseResult = BYOAIImportRequestSchema.safeParse(request);

  if (!parseResult.success) {
    const firstIssue = parseResult.error.issues[0];
    const field = firstIssue.path.join('.') || undefined;
    const message = firstIssue.message;

    await deps.logAuditEvent({
      userId,
      projectId,
      action: 'byoai_import_attempt',
      timestamp: now,
      contentType: request.contentType || 'unknown',
      modelName: request.externalModelName || 'unknown',
      status: 'failure',
      failureReason: `Validation failed: ${message}`,
    });

    throw new BYOAIValidationError(
      `Validation failed${field ? ` on field '${field}'` : ''}: ${message}`,
      field
    );
  }

  const validated = parseResult.data;

  // ── Step 2: Check user write access ──────────────────────────────────────
  const hasAccess = await deps.checkWritePermission(userId, projectId);

  if (!hasAccess) {
    await deps.logAuditEvent({
      userId,
      projectId,
      action: 'byoai_import_attempt',
      timestamp: now,
      contentType: validated.contentType,
      modelName: validated.externalModelName,
      status: 'failure',
      failureReason: 'Insufficient project permissions',
    });

    throw new BYOAIAuthorizationError(
      'Insufficient project permissions. Write access to the target project is required.'
    );
  }

  // ── Step 3: Create provenance record ─────────────────────────────────────
  const generationTimestamp = validated.generationTimestamp || now;

  let provenanceRecord;
  try {
    provenanceRecord = await createProvenanceRecord({
      projectId,
      threadId: 'byoai_import',
      messageId: `import_${Date.now()}`,
      modelId: validated.externalModelName,
      generatedAt: generationTimestamp,
      acceptedBy: userId,
      acceptedAt: now,
      source: 'external',
      capability: null,
      confidence: null,
    });
  } catch (error) {
    await deps.logAuditEvent({
      userId,
      projectId,
      action: 'byoai_import_attempt',
      timestamp: now,
      contentType: validated.contentType,
      modelName: validated.externalModelName,
      status: 'failure',
      failureReason: `Provenance creation failed: ${error instanceof Error ? error.message : String(error)}`,
    });

    throw new BYOAIProvenanceError(
      'Failed to create provenance record. Import cannot proceed without provenance tracking.'
    );
  }

  // ── Step 4: Store as draft document in project document register ─────────
  const documentsRef = adminDb.collection(`projects/${projectId}/documents`);
  const docRef = documentsRef.doc();
  const documentId = docRef.id;

  try {
    await docRef.set({
      id: documentId,
      projectId,
      title: `AI Import — ${validated.contentType}`,
      content: validated.content,
      contentType: validated.contentType,
      status: 'draft',
      ai_imported: true,
      provenanceId: provenanceRecord.id,
      importedBy: userId,
      externalModelName: validated.externalModelName,
      generationTimestamp,
      metadata: validated.metadata || null,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    // Provenance was already created but document storage failed.
    // Log the failure — provenance exists but document doesn't (acceptable per design).
    await deps.logAuditEvent({
      userId,
      projectId,
      action: 'byoai_import_attempt',
      timestamp: now,
      contentType: validated.contentType,
      modelName: validated.externalModelName,
      status: 'failure',
      failureReason: `Document storage failed: ${error instanceof Error ? error.message : String(error)}`,
      provenanceRecordId: provenanceRecord.id,
    });

    throw new Error(
      'Failed to store imported document. Provenance record was created but content was not persisted.'
    );
  }

  // ── Step 5: Log success to audit trail ───────────────────────────────────
  await deps.logAuditEvent({
    userId,
    projectId,
    action: 'byoai_import_attempt',
    timestamp: now,
    contentType: validated.contentType,
    modelName: validated.externalModelName,
    status: 'success',
    documentId,
    provenanceRecordId: provenanceRecord.id,
  });

  // ── Step 6: Return response ──────────────────────────────────────────────
  return {
    documentId,
    provenanceRecordId: provenanceRecord.id,
    status: 'imported',
  };
}
