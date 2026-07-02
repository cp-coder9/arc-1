/**
 * Unit Tests for Document Checklist (added to applicationEngine)
 *
 * Tests checklist generation per application type, status transitions,
 * completeness indicator, and submission readiness validation.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  generateDocumentChecklist,
  updateDocumentChecklistItem,
  getCompletenessIndicator,
  validateSubmissionReadiness,
  DOCUMENT_CHECKLIST_TRANSITIONS,
  type ActorContext,
} from '../services/applicationEngine';
import type { FirestoreDB } from '../services/municipalityConfig';

// ─── Mock Helpers ────────────────────────────────────────────────────────────

function createMockDb(overrides?: {
  applicationType?: string;
  municipalityId?: string;
  municipalityDocs?: string[];
  checklistItems?: Record<string, unknown>[];
  checklistItemData?: Record<string, unknown>;
}): FirestoreDB {
  const appData = {
    applicationType: overrides?.applicationType ?? 'rezoning',
    municipalityId: overrides?.municipalityId ?? 'muni-1',
    projectId: 'proj-1',
    stage: 'preparation',
    referenceNumber: 'TP-PROJ-001',
    applicantName: 'Test',
    applicantContact: 'test@test.com',
    description: 'Test',
    createdBy: 'u',
    createdAt: '2025-01-01',
    updatedAt: '2025-01-01',
  };

  const muniData = {
    requiredDocuments: overrides?.municipalityDocs ?? [],
    additionalSDPComponents: [],
  };

  const checklistDocs = (overrides?.checklistItems ?? []).map((d, i) => ({
    exists: true,
    id: `item-${i}`,
    data: () => d,
  }));

  const checklistItemDoc = overrides?.checklistItemData
    ? { exists: true, id: 'item-1', data: () => overrides.checklistItemData }
    : { exists: false, id: 'item-1', data: () => undefined };

  return {
    collection: vi.fn().mockImplementation((path: string) => {
      if (path.includes('/applications') && !path.includes('/checklist')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: true, id: 'app-1', data: () => appData }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-app' }),
          get: vi.fn().mockResolvedValue({
            docs: [{ exists: true, id: 'app-1', data: () => appData }],
            empty: false,
          }),
        };
      }
      if (path.includes('/checklist')) {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue(checklistItemDoc),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-item' }),
          get: vi.fn().mockResolvedValue({ docs: checklistDocs, empty: checklistDocs.length === 0 }),
        };
      }
      if (path === 'municipalityProfiles') {
        return {
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: true, id: 'muni-1', data: () => muniData }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new-muni' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        };
      }
      return {
        doc: vi.fn().mockReturnValue({
          get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
          set: vi.fn().mockResolvedValue(undefined),
          update: vi.fn().mockResolvedValue(undefined),
        }),
        add: vi.fn().mockResolvedValue({ id: 'new-doc' }),
        get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
      };
    }),
  };
}

const actor: ActorContext = { id: 'user-1', role: 'town_planner' };

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Document Checklist', () => {
  describe('generateDocumentChecklist', () => {
    it('includes 6 standard documents for all types', async () => {
      const db = createMockDb({ applicationType: 'consent_use' });

      const result = await generateDocumentChecklist('app-1', 'proj-1', db);

      expect(result.success).toBe(true);
      if (result.success) {
        const stdItems = result.data.filter(i => !i.isTypeSpecific && !i.id.startsWith('muni-'));
        expect(stdItems.length).toBe(6);
        expect(stdItems.map(i => i.name)).toContain('Application Form');
        expect(stdItems.map(i => i.name)).toContain('Title Deed');
        expect(stdItems.map(i => i.name)).toContain('SG Diagram');
        expect(stdItems.map(i => i.name)).toContain('Power of Attorney');
        expect(stdItems.map(i => i.name)).toContain('Proof of Payment');
        expect(stdItems.map(i => i.name)).toContain('Memorandum');
      }
    });

    it('includes type-specific documents for rezoning', async () => {
      const db = createMockDb({ applicationType: 'rezoning' });

      const result = await generateDocumentChecklist('app-1', 'proj-1', db);

      expect(result.success).toBe(true);
      if (result.success) {
        const typeItems = result.data.filter(i => i.isTypeSpecific);
        expect(typeItems.length).toBe(2);
        expect(typeItems.map(i => i.name)).toContain('Site Development Plan');
        expect(typeItems.map(i => i.name)).toContain('Impact Assessments');
      }
    });

    it('includes type-specific documents for subdivision', async () => {
      const db = createMockDb({ applicationType: 'subdivision' });

      const result = await generateDocumentChecklist('app-1', 'proj-1', db);

      expect(result.success).toBe(true);
      if (result.success) {
        const typeItems = result.data.filter(i => i.isTypeSpecific);
        expect(typeItems.length).toBe(2);
        expect(typeItems.map(i => i.name)).toContain('Layout Plan');
        expect(typeItems.map(i => i.name)).toContain('Surveyor Report');
      }
    });

    it('includes municipality-specific extras', async () => {
      const db = createMockDb({ municipalityDocs: ['Heritage Certificate', 'Rates Clearance'] });

      const result = await generateDocumentChecklist('app-1', 'proj-1', db);

      expect(result.success).toBe(true);
      if (result.success) {
        const muniItems = result.data.filter(i => i.id.startsWith('muni-'));
        expect(muniItems.length).toBe(2);
        expect(muniItems.map(i => i.name)).toContain('Heritage Certificate');
        expect(muniItems.map(i => i.name)).toContain('Rates Clearance');
      }
    });

    it('all items start with required status', async () => {
      const db = createMockDb();

      const result = await generateDocumentChecklist('app-1', 'proj-1', db);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.every(i => i.status === 'required')).toBe(true);
      }
    });

    it('fails for non-existent application', async () => {
      const db: FirestoreDB = {
        collection: vi.fn().mockImplementation(() => ({
          doc: vi.fn().mockReturnValue({
            get: vi.fn().mockResolvedValue({ exists: false, id: 'x', data: () => null }),
            set: vi.fn().mockResolvedValue(undefined),
            update: vi.fn().mockResolvedValue(undefined),
          }),
          add: vi.fn().mockResolvedValue({ id: 'new' }),
          get: vi.fn().mockResolvedValue({ docs: [], empty: true }),
        })),
      };

      const result = await generateDocumentChecklist('nonexistent', 'proj-1', db);
      expect(result.success).toBe(false);
    });
  });

  describe('updateDocumentChecklistItem', () => {
    it('transitions required → uploaded with documentId', async () => {
      const db = createMockDb({
        checklistItemData: { id: 'item-1', name: 'Title Deed', status: 'required', isTypeSpecific: false },
      });

      const result = await updateDocumentChecklistItem(
        'app-1', 'item-1', { status: 'uploaded', documentId: 'doc-123' }, 'proj-1', actor,
        { db, auditFn: vi.fn().mockResolvedValue(undefined) }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('uploaded');
        expect(result.data.documentId).toBe('doc-123');
      }
    });

    it('transitions required → not_applicable with reason', async () => {
      const db = createMockDb({
        checklistItemData: { id: 'item-1', name: 'POA', status: 'required', isTypeSpecific: false },
      });

      const result = await updateDocumentChecklistItem(
        'app-1', 'item-1', { status: 'not_applicable', notApplicableReason: 'Owner is applicant' }, 'proj-1', actor,
        { db, auditFn: vi.fn().mockResolvedValue(undefined) }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('not_applicable');
      }
    });

    it('transitions uploaded → required (replacement)', async () => {
      const db = createMockDb({
        checklistItemData: { id: 'item-1', name: 'Title Deed', status: 'uploaded', documentId: 'old-doc', isTypeSpecific: false },
      });

      const result = await updateDocumentChecklistItem(
        'app-1', 'item-1', { status: 'required' }, 'proj-1', actor,
        { db, auditFn: vi.fn().mockResolvedValue(undefined) }
      );

      expect(result.success).toBe(true);
    });

    it('rejects uploaded without documentId', async () => {
      const db = createMockDb({
        checklistItemData: { id: 'item-1', name: 'Title Deed', status: 'required', isTypeSpecific: false },
      });

      const result = await updateDocumentChecklistItem(
        'app-1', 'item-1', { status: 'uploaded' }, 'proj-1', actor,
        { db, auditFn: vi.fn().mockResolvedValue(undefined) }
      );

      expect(result.success).toBe(false);
    });

    it('rejects not_applicable without reason', async () => {
      const db = createMockDb({
        checklistItemData: { id: 'item-1', name: 'Title Deed', status: 'required', isTypeSpecific: false },
      });

      const result = await updateDocumentChecklistItem(
        'app-1', 'item-1', { status: 'not_applicable' }, 'proj-1', actor,
        { db, auditFn: vi.fn().mockResolvedValue(undefined) }
      );

      expect(result.success).toBe(false);
    });
  });

  describe('getCompletenessIndicator', () => {
    it('counts items by status correctly', async () => {
      const db = createMockDb({
        checklistItems: [
          { status: 'required', name: 'A' },
          { status: 'uploaded', name: 'B' },
          { status: 'uploaded', name: 'C' },
          { status: 'not_applicable', name: 'D' },
        ],
      });

      const result = await getCompletenessIndicator('app-1', 'proj-1', db);

      expect(result.total).toBe(4);
      expect(result.outstanding).toBe(1);
      expect(result.uploaded).toBe(2);
      expect(result.notApplicable).toBe(1);
    });

    it('returns zeros when no checklist items', async () => {
      const db = createMockDb({ checklistItems: [] });

      const result = await getCompletenessIndicator('app-1', 'proj-1', db);

      expect(result.total).toBe(0);
      expect(result.outstanding).toBe(0);
      expect(result.uploaded).toBe(0);
      expect(result.notApplicable).toBe(0);
    });
  });

  describe('validateSubmissionReadiness', () => {
    it('returns ready=true when all items uploaded or not_applicable', async () => {
      const db = createMockDb({
        checklistItems: [
          { status: 'uploaded', name: 'A' },
          { status: 'not_applicable', name: 'B' },
          { status: 'uploaded', name: 'C' },
        ],
      });

      const result = await validateSubmissionReadiness('app-1', 'proj-1', db);

      expect(result.ready).toBe(true);
      expect(result.outstanding).toHaveLength(0);
    });

    it('returns ready=false with outstanding item names', async () => {
      const db = createMockDb({
        checklistItems: [
          { status: 'uploaded', name: 'Title Deed' },
          { status: 'required', name: 'SG Diagram' },
          { status: 'required', name: 'Proof of Payment' },
        ],
      });

      const result = await validateSubmissionReadiness('app-1', 'proj-1', db);

      expect(result.ready).toBe(false);
      expect(result.outstanding).toContain('SG Diagram');
      expect(result.outstanding).toContain('Proof of Payment');
    });

    it('returns ready=true when checklist is empty', async () => {
      const db = createMockDb({ checklistItems: [] });

      const result = await validateSubmissionReadiness('app-1', 'proj-1', db);

      expect(result.ready).toBe(true);
    });
  });
});
