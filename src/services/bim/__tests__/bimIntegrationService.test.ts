/**
 * Unit tests for bimIntegrationService — verifies integration wiring between
 * Document Register, Project Passport, and Audit Trail for BIM operations.
 *
 * Requirements: 1.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerBimDocument,
  supersedePreviousModels,
  getActiveDocuments,
  getDocumentRecord,
  onBimUploadSuccess,
  onExtractionSuccess,
  onBoqGenerationSuccess,
  onProcurementPackageIssued,
  emitAuditEvent,
  emitExtractionPassportEvent,
  emitBoqPassportEvent,
  emitQualityRiskIndicator,
  getPassportEvents,
  getRiskIndicators,
  clearIntegrationState,
} from '../bimIntegrationService';
import type { ExtractionResult, BoqDocument, ValidationReport } from '../types';

describe('bimIntegrationService', () => {
  beforeEach(() => {
    clearIntegrationState();
  });

  // ── Document Register ─────────────────────────────────────────────────────

  describe('registerBimDocument', () => {
    it('creates a document record with type "BIM Model"', () => {
      const record = registerBimDocument({
        documentId: 'doc-1',
        projectId: 'proj-1',
        fileName: 'office.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob.vercel/bim/doc-1/office.ifc',
      });

      expect(record.documentType).toBe('BIM Model');
      expect(record.status).toBe('active');
      expect(record.schemaVersion).toBe('IFC4');
      expect(record.blobUrl).toContain('blob.vercel');
    });

    it('stores the record retrievable by ID', () => {
      registerBimDocument({
        documentId: 'doc-2',
        projectId: 'proj-1',
        fileName: 'house.ifc',
        schemaVersion: 'IFC2X3',
        blobUrl: 'https://blob.vercel/bim/doc-2/house.ifc',
      });

      const retrieved = getDocumentRecord('doc-2');
      expect(retrieved).toBeDefined();
      expect(retrieved!.fileName).toBe('house.ifc');
    });
  });

  describe('supersedePreviousModels', () => {
    it('marks previous active models as superseded on re-upload', () => {
      registerBimDocument({
        documentId: 'old-model',
        projectId: 'proj-1',
        fileName: 'v1.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/old',
      });

      const superseded = supersedePreviousModels('proj-1', 'new-model', 'user-1');

      expect(superseded).toHaveLength(1);
      expect(superseded[0].documentId).toBe('old-model');
      expect(superseded[0].status).toBe('superseded');
      expect(superseded[0].supersededBy).toBe('new-model');
    });

    it('does not supersede models from other projects', () => {
      registerBimDocument({
        documentId: 'other-project-model',
        projectId: 'proj-2',
        fileName: 'other.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/other',
      });

      const superseded = supersedePreviousModels('proj-1', 'new-model', 'user-1');
      expect(superseded).toHaveLength(0);

      // Other project model should remain active
      const record = getDocumentRecord('other-project-model');
      expect(record!.status).toBe('active');
    });

    it('does not supersede already-superseded models', () => {
      registerBimDocument({
        documentId: 'old-1',
        projectId: 'proj-1',
        fileName: 'v1.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/1',
      });

      // First re-upload
      supersedePreviousModels('proj-1', 'old-2', 'user-1');

      registerBimDocument({
        documentId: 'old-2',
        projectId: 'proj-1',
        fileName: 'v2.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/2',
      });

      // Second re-upload — only old-2 is active
      const superseded = supersedePreviousModels('proj-1', 'new-3', 'user-1');
      expect(superseded).toHaveLength(1);
      expect(superseded[0].documentId).toBe('old-2');
    });
  });

  describe('getActiveDocuments', () => {
    it('returns only active (non-superseded) documents for a project', () => {
      registerBimDocument({
        documentId: 'a',
        projectId: 'proj-1',
        fileName: 'a.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/a',
      });
      registerBimDocument({
        documentId: 'b',
        projectId: 'proj-1',
        fileName: 'b.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/b',
      });

      supersedePreviousModels('proj-1', 'b', 'user-1');

      const active = getActiveDocuments('proj-1');
      expect(active).toHaveLength(1);
      expect(active[0].documentId).toBe('b');
    });
  });

  // ── Project Passport ──────────────────────────────────────────────────────

  describe('emitExtractionPassportEvent', () => {
    it('emits BimExtractionEvent with filename, schema, count, coverage', () => {
      const result: ExtractionResult = {
        extractionId: 'ext-1',
        projectId: 'proj-1',
        fileId: 'file-1',
        fileName: 'building.ifc',
        schemaVersion: 'IFC4',
        extractedAt: '2026-07-01T10:00:00Z',
        extractedBy: 'user-1',
        elements: [],
        quantities: [],
        validationReport: {
          modelId: 'file-1',
          findings: [],
          statistics: {
            totalElements: 0,
            elementsByType: {},
            elementsWithQuantities: 0,
            elementsWithoutQuantities: 0,
            unclassifiedElements: 0,
            elementsByTradeSection: {},
            quantityCoveragePercent: 0,
          },
          boqBlocked: false,
          generatedAt: '2026-07-01T10:00:00Z',
        },
        status: 'draft',
      };

      const event = emitExtractionPassportEvent(result);

      expect(event.type).toBe('bim_extraction');
      expect(event.projectId).toBe('proj-1');
      expect(event.fileName).toBe('building.ifc');
      expect(event.schemaVersion).toBe('IFC4');
      expect(event.elementCount).toBe(0);
      expect(event.quantityCoveragePercent).toBe(0);
    });

    it('stores the event in the passport events log', () => {
      const result: ExtractionResult = {
        extractionId: 'ext-2',
        projectId: 'proj-1',
        fileId: 'file-2',
        fileName: 'house.ifc',
        schemaVersion: 'IFC2X3',
        extractedAt: '2026-07-01T11:00:00Z',
        extractedBy: 'user-1',
        elements: [],
        quantities: [],
        validationReport: {
          modelId: 'file-2',
          findings: [],
          statistics: {
            totalElements: 0,
            elementsByType: {},
            elementsWithQuantities: 0,
            elementsWithoutQuantities: 0,
            unclassifiedElements: 0,
            elementsByTradeSection: {},
            quantityCoveragePercent: 0,
          },
          boqBlocked: false,
          generatedAt: '2026-07-01T11:00:00Z',
        },
        status: 'draft',
      };

      emitExtractionPassportEvent(result);
      const events = getPassportEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('bim_extraction');
    });
  });

  describe('emitBoqPassportEvent', () => {
    it('emits BimBoqEvent with status, section count, line item count', () => {
      const boq: BoqDocument = {
        boqId: 'boq-1',
        projectId: 'proj-1',
        extractionId: 'ext-1',
        title: 'Test BoQ',
        status: 'draft',
        revision: '1',
        generatedAt: '2026-07-01T12:00:00Z',
        generatedBy: 'user-1',
        currency: 'ZAR',
        sections: [
          {
            sectionNumber: '3',
            tradeSection: 'Concrete',
            title: 'Concrete',
            lineItems: [
              {
                itemNumber: '3.01',
                description: 'Concrete in columns',
                unit: 'm³',
                quantity: 24.5,
                sourceElementCount: 10,
                sourceElementGlobalIds: [],
                elementType: 'IfcColumn',
              },
            ],
          },
        ],
        flaggedElementsSummary: [],
        totals: { totalLineItems: 1, totalSections: 1, totalElements: 10 },
      };

      const event = emitBoqPassportEvent(boq);

      expect(event.type).toBe('bim_boq_generated');
      expect(event.status).toBe('draft');
      expect(event.tradeSectionCount).toBe(1);
      expect(event.lineItemCount).toBe(1);
    });
  });

  describe('emitQualityRiskIndicator', () => {
    it('returns null when no error-severity findings', () => {
      const report: ValidationReport = {
        modelId: 'file-1',
        findings: [{ id: '1', type: 'missing_quantities', severity: 'warning', message: 'test' }],
        statistics: {
          totalElements: 10,
          elementsByType: {},
          elementsWithQuantities: 5,
          elementsWithoutQuantities: 5,
          unclassifiedElements: 0,
          elementsByTradeSection: {},
          quantityCoveragePercent: 50,
        },
        boqBlocked: false,
        generatedAt: '2026-07-01T10:00:00Z',
      };

      const indicator = emitQualityRiskIndicator(report);
      expect(indicator).toBeNull();
    });

    it('returns medium severity for 1–3 errors', () => {
      const report: ValidationReport = {
        modelId: 'file-1',
        findings: [
          { id: '1', type: 'duplicate_globalid', severity: 'error', message: 'dup' },
          { id: '2', type: 'duplicate_globalid', severity: 'error', message: 'dup 2' },
        ],
        statistics: {
          totalElements: 10,
          elementsByType: {},
          elementsWithQuantities: 5,
          elementsWithoutQuantities: 5,
          unclassifiedElements: 0,
          elementsByTradeSection: {},
          quantityCoveragePercent: 50,
        },
        boqBlocked: true,
        generatedAt: '2026-07-01T10:00:00Z',
      };

      const indicator = emitQualityRiskIndicator(report);
      expect(indicator).not.toBeNull();
      expect(indicator!.severity).toBe('medium');
      expect(indicator!.category).toBe('model_quality');
    });

    it('returns high severity for 4+ errors', () => {
      const report: ValidationReport = {
        modelId: 'file-1',
        findings: Array.from({ length: 5 }, (_, i) => ({
          id: `${i}`,
          type: 'duplicate_globalid' as const,
          severity: 'error' as const,
          message: `error ${i}`,
        })),
        statistics: {
          totalElements: 10,
          elementsByType: {},
          elementsWithQuantities: 5,
          elementsWithoutQuantities: 5,
          unclassifiedElements: 0,
          elementsByTradeSection: {},
          quantityCoveragePercent: 50,
        },
        boqBlocked: true,
        generatedAt: '2026-07-01T10:00:00Z',
      };

      const indicator = emitQualityRiskIndicator(report);
      expect(indicator!.severity).toBe('high');
    });
  });

  // ── Audit Trail ───────────────────────────────────────────────────────────

  describe('emitAuditEvent', () => {
    it('builds and persists an audit event with correct fields', () => {
      const event = emitAuditEvent('bim_upload', 'user-1', 'file-abc', 'proj-1', {
        fileName: 'model.ifc',
      });

      expect(event.action).toBe('bim_upload');
      expect(event.actorUid).toBe('user-1');
      expect(event.targetId).toBe('file-abc');
      expect(event.projectId).toBe('proj-1');
      expect(event.timestamp).toBeDefined();
      expect(event.metadata?.fileName).toBe('model.ifc');
    });

    it('creates audit event without metadata when none provided', () => {
      const event = emitAuditEvent('bim_extraction', 'user-2', 'ext-1', 'proj-2');

      expect(event.action).toBe('bim_extraction');
      expect(event.metadata).toBeUndefined();
    });
  });

  // ── Convenience orchestrators ─────────────────────────────────────────────

  describe('onBimUploadSuccess', () => {
    it('registers document, supersedes old models, and emits audit event', () => {
      // Pre-existing model
      registerBimDocument({
        documentId: 'old-model',
        projectId: 'proj-1',
        fileName: 'v1.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/old',
      });

      const { documentRecord, superseded, auditEvent } = onBimUploadSuccess({
        fileId: 'new-model',
        projectId: 'proj-1',
        fileName: 'v2.ifc',
        schemaVersion: 'IFC4',
        blobUrl: 'https://blob/new',
        actorUid: 'user-1',
      });

      expect(documentRecord.documentId).toBe('new-model');
      expect(documentRecord.status).toBe('active');
      expect(superseded).toHaveLength(1);
      expect(superseded[0].documentId).toBe('old-model');
      expect(superseded[0].status).toBe('superseded');
      expect(auditEvent.action).toBe('bim_upload');
    });
  });

  describe('onExtractionSuccess', () => {
    it('emits passport event, risk indicator, and audit event', () => {
      const result: ExtractionResult = {
        extractionId: 'ext-1',
        projectId: 'proj-1',
        fileId: 'file-1',
        fileName: 'building.ifc',
        schemaVersion: 'IFC4',
        extractedAt: '2026-07-01T10:00:00Z',
        extractedBy: 'user-1',
        elements: [],
        quantities: [],
        validationReport: {
          modelId: 'file-1',
          findings: [
            { id: '1', type: 'duplicate_globalid', severity: 'error', message: 'dup' },
          ],
          statistics: {
            totalElements: 0,
            elementsByType: {},
            elementsWithQuantities: 0,
            elementsWithoutQuantities: 0,
            unclassifiedElements: 0,
            elementsByTradeSection: {},
            quantityCoveragePercent: 0,
          },
          boqBlocked: true,
          generatedAt: '2026-07-01T10:00:00Z',
        },
        status: 'draft',
      };

      const { passportEvent, riskIndicator, auditEvent } = onExtractionSuccess({
        result,
        actorUid: 'user-1',
      });

      expect(passportEvent.type).toBe('bim_extraction');
      expect(passportEvent.fileName).toBe('building.ifc');
      expect(riskIndicator).not.toBeNull();
      expect(riskIndicator!.severity).toBe('medium');
      expect(auditEvent.action).toBe('bim_extraction');
    });
  });

  describe('onBoqGenerationSuccess', () => {
    it('emits passport event and audit event', () => {
      const boq: BoqDocument = {
        boqId: 'boq-1',
        projectId: 'proj-1',
        extractionId: 'ext-1',
        title: 'Test',
        status: 'draft',
        revision: '1',
        generatedAt: '2026-07-01T12:00:00Z',
        generatedBy: 'user-1',
        currency: 'ZAR',
        sections: [],
        flaggedElementsSummary: [],
        totals: { totalLineItems: 0, totalSections: 0, totalElements: 0 },
      };

      const { passportEvent, auditEvent } = onBoqGenerationSuccess({
        boq,
        actorUid: 'user-1',
      });

      expect(passportEvent.type).toBe('bim_boq_generated');
      expect(passportEvent.boqId).toBe('boq-1');
      expect(auditEvent.action).toBe('bim_boq_generated');
    });
  });

  describe('onProcurementPackageIssued', () => {
    it('emits passport event and audit event with recipient count', () => {
      const { passportEvent, auditEvent } = onProcurementPackageIssued({
        packageId: 'pkg-1',
        projectId: 'proj-1',
        tradeSectionName: 'Concrete',
        recipientCount: 3,
        actorUid: 'user-1',
      });

      expect(passportEvent).toHaveProperty('type', 'bim_procurement_issued');
      expect(passportEvent).toHaveProperty('recipientCount', 3);
      expect(passportEvent).toHaveProperty('tradeSectionName', 'Concrete');
      expect(auditEvent.action).toBe('bim_procurement_package_issued');
      expect(auditEvent.metadata?.recipientCount).toBe(3);
    });
  });
});
