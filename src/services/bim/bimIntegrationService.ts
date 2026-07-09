/**
 * BIM Integration Service — Orchestrates Document Register, Project Passport,
 * and Audit Trail integration calls for BIM write operations.
 *
 * This service wires the adapter functions (bimPassportAdapter, bimAuditAdapter)
 * into a coherent integration layer called by the BIM API router on every
 * write operation.
 *
 * Requirements: 1.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */

import { buildExtractionPassportEvent, buildBoqPassportEvent, buildQualityRiskIndicator } from './bimPassportAdapter';
import { buildBimAuditEvent } from './bimAuditAdapter';
import type { AuditEventInput } from './bimAuditAdapter';
import { createAuditEntry } from '@/services/auditTrailService';
import type {
  ExtractionResult,
  BoqDocument,
  ValidationReport,
  IfcSchemaVersion,
  BimExtractionEvent,
  BimBoqEvent,
  BimQualityRiskIndicator,
  BimAuditAction,
} from './types';

// ─── Document Register Types ──────────────────────────────────────────────

/**
 * Minimal document register record for BIM model registration.
 * Follows the platform DocumentRecord pattern from documentRegisterService.
 */
export interface BimDocumentRecord {
  documentId: string;
  projectId: string;
  fileName: string;
  documentType: 'BIM Model';
  schemaVersion: IfcSchemaVersion;
  blobUrl: string;
  status: 'active' | 'superseded';
  createdAt: string;
  supersededAt?: string;
  supersededBy?: string;
}

// In-memory store for document records (mirrors platform pattern).
// In production, this persists to Firestore at projects/{projectId}/bimDocuments/{documentId}
const documentRegister = new Map<string, BimDocumentRecord>();

// In-memory store for passport events (mirrors platform pattern).
// In production, these are written to Firestore at projects/{projectId}/passportEvents/{eventId}
const passportEvents: Array<BimExtractionEvent | BimBoqEvent> = [];
const riskIndicators: BimQualityRiskIndicator[] = [];

// ─── Document Register Integration ───────────────────────────────────────

/**
 * Creates a Document Register record for a successfully parsed BIM model.
 *
 * Requirement 1.6: Record the file reference in the Document Register with
 * document type "BIM Model", detected schema version, and link to stored file.
 */
export function registerBimDocument(params: {
  documentId: string;
  projectId: string;
  fileName: string;
  schemaVersion: IfcSchemaVersion;
  blobUrl: string;
}): BimDocumentRecord {
  const record: BimDocumentRecord = {
    documentId: params.documentId,
    projectId: params.projectId,
    fileName: params.fileName,
    documentType: 'BIM Model',
    schemaVersion: params.schemaVersion,
    blobUrl: params.blobUrl,
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  documentRegister.set(params.documentId, record);
  return record;
}

/**
 * Marks previous BIM models as "superseded" when a new model is uploaded
 * for the same project.
 *
 * Requirement 11.6: Mark the previous model as "superseded" in the Document
 * Register and record the supersession event in the audit trail.
 */
export function supersedePreviousModels(
  projectId: string,
  newDocumentId: string,
  actorUid: string,
): BimDocumentRecord[] {
  const superseded: BimDocumentRecord[] = [];

  for (const [, record] of documentRegister) {
    if (
      record.projectId === projectId &&
      record.status === 'active' &&
      record.documentId !== newDocumentId
    ) {
      record.status = 'superseded';
      record.supersededAt = new Date().toISOString();
      record.supersededBy = newDocumentId;
      superseded.push(record);

      // Record supersession audit event
      emitAuditEvent('bim_upload', actorUid, record.documentId, projectId, {
        subAction: 'model_superseded',
        supersededBy: newDocumentId,
      });
    }
  }

  return superseded;
}

/**
 * Returns all active (non-superseded) BIM document records for a project.
 */
export function getActiveDocuments(projectId: string): BimDocumentRecord[] {
  const results: BimDocumentRecord[] = [];
  for (const [, record] of documentRegister) {
    if (record.projectId === projectId && record.status === 'active') {
      results.push(record);
    }
  }
  return results;
}

/**
 * Returns a specific document register record by ID.
 */
export function getDocumentRecord(documentId: string): BimDocumentRecord | undefined {
  return documentRegister.get(documentId);
}

// ─── Project Passport Integration ────────────────────────────────────────

/**
 * Emits a BimExtractionEvent to Project Passport after successful extraction.
 *
 * Requirement 11.1: Record the extraction event containing model filename,
 * schema version, element count, quantity coverage %, and timestamp.
 */
export function emitExtractionPassportEvent(result: ExtractionResult): BimExtractionEvent {
  const event = buildExtractionPassportEvent(result);
  passportEvents.push(event);
  return event;
}

/**
 * Emits a BimBoqEvent to Project Passport after BoQ generation.
 *
 * Requirement 11.2: Update project record with BoQ status, trade section count,
 * total line item count, and generation timestamp.
 */
export function emitBoqPassportEvent(boq: BoqDocument): BimBoqEvent {
  const event = buildBoqPassportEvent(boq);
  passportEvents.push(event);
  return event;
}

/**
 * Evaluates and emits a quality risk indicator to Project Passport
 * when validation errors are detected.
 *
 * Requirement 11.3: Set risk indicator for BIM quality with severity proportional
 * to error count (1–3: medium, 4+: high).
 */
export function emitQualityRiskIndicator(report: ValidationReport): BimQualityRiskIndicator | null {
  const indicator = buildQualityRiskIndicator(report);
  if (indicator) {
    riskIndicators.push(indicator);
  }
  return indicator;
}

/**
 * Records procurement package issuance in Project Passport under
 * the procurement phase.
 *
 * Requirement 11.5: Record the package issuance under the procurement phase
 * with package ID, trade section name, and recipient count.
 */
export function emitProcurementPassportEvent(params: {
  projectId: string;
  packageId: string;
  tradeSectionName: string;
  recipientCount: number;
  issuedAt: string;
}): Record<string, unknown> {
  const event = {
    type: 'bim_procurement_issued' as const,
    projectId: params.projectId,
    packageId: params.packageId,
    tradeSectionName: params.tradeSectionName,
    recipientCount: params.recipientCount,
    issuedAt: params.issuedAt,
  };
  // In production, persisted to Firestore at projects/{projectId}/passportEvents
  passportEvents.push(event as unknown as BimExtractionEvent);
  return event;
}

// ─── Audit Trail Integration ─────────────────────────────────────────────

/**
 * Emits an audit event for any BIM write operation. Builds the event via
 * bimAuditAdapter and persists it through the platform audit trail service.
 *
 * Requirement 11.4: Record an audit event containing action type, performer
 * identity, target resource ID, and ISO 8601 UTC timestamp.
 */
export function emitAuditEvent(
  action: BimAuditAction,
  actorUid: string,
  targetId: string,
  projectId: string,
  metadata?: Record<string, unknown>,
): AuditEventInput {
  const event = buildBimAuditEvent(action, actorUid, targetId, projectId, metadata);

  // Persist via platform audit trail service
  createAuditEntry({
    actorId: event.actorUid,
    action: event.action,
    sourceObjectId: event.targetId,
  });

  return event;
}

// ─── Convenience: Full upload integration ─────────────────────────────────

/**
 * Performs all integration steps for a successful BIM upload:
 * 1. Supersedes previous models in Document Register
 * 2. Registers new document in Document Register
 * 3. Emits audit event for the upload
 *
 * Requirements: 1.6, 11.4, 11.6
 */
export function onBimUploadSuccess(params: {
  fileId: string;
  projectId: string;
  fileName: string;
  schemaVersion: IfcSchemaVersion;
  blobUrl: string;
  actorUid: string;
}): { documentRecord: BimDocumentRecord; superseded: BimDocumentRecord[]; auditEvent: AuditEventInput } {
  // 1. Supersede previous models
  const superseded = supersedePreviousModels(params.projectId, params.fileId, params.actorUid);

  // 2. Register in Document Register
  const documentRecord = registerBimDocument({
    documentId: params.fileId,
    projectId: params.projectId,
    fileName: params.fileName,
    schemaVersion: params.schemaVersion,
    blobUrl: params.blobUrl,
  });

  // 3. Emit audit event for upload
  const auditEvent = emitAuditEvent(
    'bim_upload',
    params.actorUid,
    params.fileId,
    params.projectId,
    { fileName: params.fileName, schemaVersion: params.schemaVersion },
  );

  return { documentRecord, superseded, auditEvent };
}

/**
 * Performs all integration steps for a successful extraction:
 * 1. Emits extraction passport event
 * 2. Evaluates and emits quality risk indicator
 * 3. Emits audit event
 *
 * Requirements: 11.1, 11.3, 11.4
 */
export function onExtractionSuccess(params: {
  result: ExtractionResult;
  actorUid: string;
}): { passportEvent: BimExtractionEvent; riskIndicator: BimQualityRiskIndicator | null; auditEvent: AuditEventInput } {
  const { result, actorUid } = params;

  // 1. Emit passport event
  const passportEvent = emitExtractionPassportEvent(result);

  // 2. Evaluate quality risk from validation
  const riskIndicator = emitQualityRiskIndicator(result.validationReport);

  // 3. Emit audit event
  const auditEvent = emitAuditEvent(
    'bim_extraction',
    actorUid,
    result.extractionId,
    result.projectId,
    {
      fileName: result.fileName,
      schemaVersion: result.schemaVersion,
      elementCount: result.elements.length,
    },
  );

  return { passportEvent, riskIndicator, auditEvent };
}

/**
 * Performs all integration steps for a successful BoQ generation:
 * 1. Emits BoQ passport event
 * 2. Emits audit event
 *
 * Requirements: 11.2, 11.4
 */
export function onBoqGenerationSuccess(params: {
  boq: BoqDocument;
  actorUid: string;
}): { passportEvent: BimBoqEvent; auditEvent: AuditEventInput } {
  const { boq, actorUid } = params;

  // 1. Emit passport event
  const passportEvent = emitBoqPassportEvent(boq);

  // 2. Emit audit event
  const auditEvent = emitAuditEvent(
    'bim_boq_generated',
    actorUid,
    boq.boqId,
    boq.projectId,
    { status: boq.status, sectionCount: boq.sections.length },
  );

  return { passportEvent, auditEvent };
}

/**
 * Performs all integration steps for procurement package issuance:
 * 1. Records in Project Passport under procurement phase
 * 2. Emits audit event
 *
 * Requirements: 11.4, 11.5
 */
export function onProcurementPackageIssued(params: {
  packageId: string;
  projectId: string;
  tradeSectionName: string;
  recipientCount: number;
  actorUid: string;
}): { passportEvent: Record<string, unknown>; auditEvent: AuditEventInput } {
  const issuedAt = new Date().toISOString();

  // 1. Record in passport under procurement phase
  const passportEvent = emitProcurementPassportEvent({
    projectId: params.projectId,
    packageId: params.packageId,
    tradeSectionName: params.tradeSectionName,
    recipientCount: params.recipientCount,
    issuedAt,
  });

  // 2. Emit audit event
  const auditEvent = emitAuditEvent(
    'bim_procurement_package_issued',
    params.actorUid,
    params.packageId,
    params.projectId,
    { recipientCount: params.recipientCount, tradeSectionName: params.tradeSectionName },
  );

  return { passportEvent, auditEvent };
}

// ─── Query helpers (for testing/introspection) ────────────────────────────

/** Returns all stored passport events (for testing). */
export function getPassportEvents(): Array<BimExtractionEvent | BimBoqEvent> {
  return [...passportEvents];
}

/** Returns all stored risk indicators (for testing). */
export function getRiskIndicators(): BimQualityRiskIndicator[] {
  return [...riskIndicators];
}

/** Clears all in-memory stores (for testing). */
export function clearIntegrationState(): void {
  documentRegister.clear();
  passportEvents.length = 0;
  riskIndicators.length = 0;
}
