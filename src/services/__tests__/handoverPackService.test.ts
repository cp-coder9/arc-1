import { describe, expect, it } from 'vitest';
import {
  evaluateAsBuiltDrawings,
  evaluateWarranties,
  evaluateManuals,
  evaluateKeyAccess,
  evaluateComplianceBundle,
  evaluateHandoverPackReadiness,
  assembleHandoverPack,
  mapDocumentTypeToCategory,
  getDocumentTypeLabel,
} from '../handoverPackService';
import type { AsBuiltDrawingRecord, WarrantyRecord, ManualRecord, KeyAccessRecord, ComplianceBundle, HandoverDocument } from '../handoverPackService';

describe('handoverPackService', () => {
  describe('mapDocumentTypeToCategory', () => {
    it('maps as_built_drawing to as_built', () => {
      expect(mapDocumentTypeToCategory('as_built_drawing')).toBe('as_built');
    });
    it('maps warranty/guarantee to manufacturer_warranty', () => {
      expect(mapDocumentTypeToCategory('warranty')).toBe('manufacturer_warranty');
      expect(mapDocumentTypeToCategory('guarantee')).toBe('manufacturer_warranty');
    });
    it('maps manual/maintenance_schedule to manual', () => {
      expect(mapDocumentTypeToCategory('manual')).toBe('manual');
      expect(mapDocumentTypeToCategory('maintenance_schedule')).toBe('manual');
    });
    it('maps certificates to compliance_certificate', () => {
      expect(mapDocumentTypeToCategory('compliance_certificate')).toBe('compliance_certificate');
      expect(mapDocumentTypeToCategory('test_certificate')).toBe('compliance_certificate');
    });
  });

  describe('getDocumentTypeLabel', () => {
    it('returns human-readable label', () => {
      expect(getDocumentTypeLabel('as_built_drawing')).toBe('As-built drawing');
      expect(getDocumentTypeLabel('other')).toBe('Other document');
    });
  });

  describe('evaluateAsBuiltDrawings', () => {
    it('passes when drawings are approved', () => {
      const result = evaluateAsBuiltDrawings([
        { id: '1', projectId: 'p1', title: 'Floor Plan', drawingNumber: 'A-101', revision: 'C', status: 'approved', createdAt: '', updatedAt: '' },
      ]);
      expect(result.ready).toBe(true);
    });

    it('blocks when no drawings', () => {
      const result = evaluateAsBuiltDrawings([]);
      expect(result.ready).toBe(false);
    });

    it('blocks when drawings not approved', () => {
      const result = evaluateAsBuiltDrawings([
        { id: '1', projectId: 'p1', title: 'Floor Plan', drawingNumber: 'A-101', revision: 'C', status: 'draft', createdAt: '', updatedAt: '' },
      ]);
      expect(result.ready).toBe(false);
    });
  });

  describe('evaluateWarranties', () => {
    it('passes when warranties are active', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 5);
      const result = evaluateWarranties([
        { id: 'w1', projectId: 'p1', title: 'Roof warranty', provider: 'Roof Co', warrantyType: 'workmanship', startDate: '2026-01-01', expiryDate: futureDate.toISOString(), status: 'active', createdAt: '', updatedAt: '' },
      ]);
      expect(result.ready).toBe(true);
    });

    it('flags expiring soon warranties', () => {
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 30);
      const result = evaluateWarranties([
        { id: 'w1', projectId: 'p1', title: 'Paint warranty', provider: 'Paint Co', warrantyType: 'materials', startDate: '2025-01-01', expiryDate: soonDate.toISOString(), status: 'active', createdAt: '', updatedAt: '' },
      ]);
      expect(result.expiringSoon).toHaveLength(1);
    });

    it('blocks when warranties have expired', () => {
      const pastDate = new Date();
      pastDate.setFullYear(pastDate.getFullYear() - 1);
      const result = evaluateWarranties([
        { id: 'w1', projectId: 'p1', title: 'Old warranty', provider: 'Old Co', warrantyType: 'workmanship', startDate: '2020-01-01', expiryDate: pastDate.toISOString(), status: 'expired', createdAt: '', updatedAt: '' },
      ]);
      expect(result.ready).toBe(false);
    });
  });

  describe('evaluateManuals', () => {
    it('passes when manuals are issued', () => {
      const result = evaluateManuals([
        { id: 'm1', projectId: 'p1', title: 'HVAC Manual', equipmentOrSystem: 'HVAC', manualType: 'operation', version: '1.0', status: 'issued', createdAt: '', updatedAt: '' },
      ]);
      expect(result.ready).toBe(true);
    });

    it('blocks when no manuals', () => {
      const result = evaluateManuals([]);
      expect(result.ready).toBe(false);
    });
  });

  describe('evaluateKeyAccess', () => {
    it('passes when keys are handed over', () => {
      const result = evaluateKeyAccess([
        { id: 'k1', projectId: 'p1', areaOrAsset: 'Main entrance', keyType: 'electronic', quantity: 2, receivedBy: 'client-1', receivedAt: '2026-06-09T00:00:00.000Z', status: 'handed_over', createdAt: '', updatedAt: '' },
      ]);
      expect(result.ready).toBe(true);
    });

    it('blocks when no records', () => {
      const result = evaluateKeyAccess([]);
      expect(result.ready).toBe(false);
    });
  });

  describe('evaluateComplianceBundle', () => {
    it('passes when bundle is complete', () => {
      const bundle: ComplianceBundle = {
        id: 'cb-1', projectId: 'p1', title: 'Compliance Pack',
        certificates: [{ type: 'electrical_coc', number: 'COC-001', issuedBy: 'Electrician', issuedAt: '2026-06-01', status: 'approved' }],
        status: 'complete', missingRequired: [], createdAt: '', updatedAt: '',
      };
      const result = evaluateComplianceBundle(bundle);
      expect(result.ready).toBe(true);
    });

    it('blocks when missing required certificates', () => {
      const bundle: ComplianceBundle = {
        id: 'cb-1', projectId: 'p1', title: 'Compliance Pack',
        certificates: [],
        status: 'incomplete', missingRequired: ['electrical_coc', 'plumbing_coc'], createdAt: '', updatedAt: '',
      };
      const result = evaluateComplianceBundle(bundle);
      expect(result.ready).toBe(false);
      expect(result.blockers[0]).toContain('electrical_coc');
    });

    it('blocks when no bundle', () => {
      const result = evaluateComplianceBundle(undefined);
      expect(result.ready).toBe(false);
    });
  });

  describe('evaluateHandoverPackReadiness', () => {
    it('returns ready when everything is in order', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 5);
      const result = evaluateHandoverPackReadiness({
        documents: [
          { id: 'd1', projectId: 'p1', title: 'Final Account', type: 'compliance_certificate' as any, category: 'final_account', status: 'approved', url: 'https://files/fa.pdf', version: 1, createdAt: '', updatedAt: '' },
          { id: 'd2', projectId: 'p1', title: 'Electrical COC', type: 'compliance_certificate' as any, category: 'compliance_certificate', status: 'issued', url: 'https://files/coc.pdf', version: 1, createdAt: '', updatedAt: '' },
          { id: 'd3', projectId: 'p1', title: 'Waterproofing warranty', type: 'warranty' as any, category: 'manufacturer_warranty', status: 'approved', url: 'https://files/warranty.pdf', version: 1, createdAt: '', updatedAt: '' },
        ],
        asBuiltDrawings: [
          { id: 'ab1', projectId: 'p1', title: 'As-built plan', drawingNumber: 'A-101', revision: 'C', status: 'approved', createdAt: '', updatedAt: '' },
        ],
        warranties: [
          { id: 'w1', projectId: 'p1', title: 'Roof warranty', provider: 'Roof Co', warrantyType: 'workmanship', startDate: '2026-01-01', expiryDate: futureDate.toISOString(), status: 'active', createdAt: '', updatedAt: '' },
        ],
        manuals: [
          { id: 'm1', projectId: 'p1', title: 'Pump manual', equipmentOrSystem: 'Water pump', manualType: 'operation', version: '1.0', status: 'issued', createdAt: '', updatedAt: '' },
        ],
        keyAccessRecords: [
          { id: 'k1', projectId: 'p1', areaOrAsset: 'Main door', keyType: 'physical', quantity: 3, receivedBy: 'client-1', receivedAt: '2026-06-09T00:00:00.000Z', status: 'handed_over', createdAt: '', updatedAt: '' },
        ],
        complianceBundle: {
          id: 'cb-1', projectId: 'p1', title: 'Compliance',
          certificates: [{ type: 'electrical_coc', number: 'C-001', issuedBy: 'Elec', issuedAt: '2026-06-01', status: 'approved' }],
          status: 'complete', missingRequired: [], createdAt: '', updatedAt: '',
        },
      });
      expect(result.ready).toBe(true);
      expect(result.status).toBe('ready_for_review');
    });
  });

  describe('assembleHandoverPack', () => {
    it('creates a handover pack record with all sections', () => {
      const pack = assembleHandoverPack({
        projectId: 'project-1',
        documents: [
          { id: 'd1', projectId: 'project-1', title: 'Final Account', type: 'other', category: 'final_account', status: 'approved', url: 'https://files/fa.pdf', version: 1, createdAt: '', updatedAt: '' },
        ],
        asBuiltDrawings: [
          { id: 'ab1', projectId: 'project-1', title: 'Plan', drawingNumber: 'A-101', revision: 'B', status: 'approved', createdAt: '', updatedAt: '' },
        ],
      });
      expect(pack.projectId).toBe('project-1');
      expect(pack.manifest).toBeDefined();
      expect(pack.documents).toHaveLength(1);
    });
  });
});
