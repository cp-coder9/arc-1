/**
 * Tests for BIM SpecForge Integration Service
 *
 * Covers:
 * - SpecForge sync flow: create spec items from BoQ, store links, emit audit
 * - Comparison flow: detect added/removed/changed quantities, flag user overrides
 * - Model supersession detection for procurement packages
 * - Procurement issuance audit trail recording
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.5, 9.6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  syncSpecForge,
  compareSpecForge,
  recordProcurementIssuance,
  checkModelSupersession,
  storeBoq,
  getBoq,
  getSpecForgeLinks,
  storeSpecForgeLinks,
  markLinkAsUserOverridden,
  getProcurementIssuanceEvents,
  clearSpecForgeIntegrationState,
} from '../bimSpecForgeIntegration';
import { clearIntegrationState, registerBimDocument, supersedePreviousModels } from '../bimIntegrationService';
import type { BoqDocument, BoqSpecForgeLink, ProcurementPackage } from '../types';

// ── Test Helpers ────────────────────────────────────────────────────────────

function makeBoqDocument(overrides?: Partial<BoqDocument>): BoqDocument {
  return {
    boqId: 'boq_test_001',
    projectId: 'proj_test_001',
    extractionId: 'ext_test_001',
    title: 'Test BoQ',
    status: 'draft',
    revision: 'A',
    generatedAt: '2026-07-01T10:00:00Z',
    generatedBy: 'user_qs_001',
    currency: 'ZAR',
    sections: [
      {
        sectionNumber: '3',
        tradeSection: 'Concrete',
        title: 'Concrete Work',
        lineItems: [
          {
            itemNumber: '3.01',
            description: 'Reinforced concrete in columns, 30 MPa',
            unit: 'm³',
            quantity: 45.5,
            sourceElementCount: 12,
            sourceElementGlobalIds: ['gid-001', 'gid-002'],
            elementType: 'IfcColumn',
          },
          {
            itemNumber: '3.02',
            description: 'Reinforced concrete in slabs, 25 MPa',
            unit: 'm³',
            quantity: 120.75,
            sourceElementCount: 8,
            sourceElementGlobalIds: ['gid-003', 'gid-004'],
            elementType: 'IfcSlab',
          },
        ],
      },
      {
        sectionNumber: '6',
        tradeSection: 'Masonry',
        title: 'Masonry',
        lineItems: [
          {
            itemNumber: '6.01',
            description: 'Face brick walls, 230mm thick',
            unit: 'm²',
            quantity: 340.2,
            sourceElementCount: 20,
            sourceElementGlobalIds: ['gid-005', 'gid-006'],
            elementType: 'IfcWall',
          },
        ],
      },
    ],
    flaggedElementsSummary: [],
    totals: { totalLineItems: 3, totalSections: 2, totalElements: 40 },
    ...overrides,
  };
}

function makeProcurementPackage(overrides?: Partial<ProcurementPackage>): ProcurementPackage {
  return {
    packageId: 'pkg_test_001',
    projectId: 'proj_test_001',
    boqId: 'boq_test_001',
    title: 'Concrete',
    tradeSections: ['Concrete'],
    lineItems: [
      { itemNumber: '3.01', description: 'Columns 30 MPa', unit: 'm³', quantity: 45.5 },
    ],
    coverSheet: {
      projectName: 'Test Project',
      projectNumber: 'TP-001',
      packageTitle: 'Concrete Package',
      issueDate: '2026-07-15',
      revisionNumber: 'A',
      qsContactName: 'John QS',
      qsContactEmail: 'john@qs.co.za',
    },
    revision: 'A',
    modelSuperseded: false,
    ...overrides,
  };
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearSpecForgeIntegrationState();
  clearIntegrationState();
});

// ── syncSpecForge ───────────────────────────────────────────────────────────

describe('syncSpecForge', () => {
  it('creates SpecForge links for all BoQ line items (Req 8.1, 8.2)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const result = syncSpecForge('boq_test_001', 'workspace_001', 'user_qs_001');

    expect(result.linksCreated).toBe(3); // 2 Concrete + 1 Masonry
    expect(result.links).toHaveLength(3);
    expect(result.boqId).toBe('boq_test_001');
    expect(result.workspaceId).toBe('workspace_001');
  });

  it('stores links so they can be retrieved later (Req 8.4)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    syncSpecForge('boq_test_001', 'workspace_001', 'user_qs_001');

    const storedLinks = getSpecForgeLinks('boq_test_001');
    expect(storedLinks).toHaveLength(3);
    expect(storedLinks[0].boqLineItemId).toBe('3.01');
    expect(storedLinks[0].quantityAtLink).toBe(45.5);
    expect(storedLinks[0].userOverridden).toBe(false);
  });

  it('identifies unique trade sections for SpecForge section creation (Req 8.3)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const result = syncSpecForge('boq_test_001', 'workspace_001', 'user_qs_001');

    expect(result.sectionsCreated).toContain('Concrete');
    expect(result.sectionsCreated).toContain('Masonry');
    expect(result.sectionsCreated).toHaveLength(2);
  });

  it('throws error when BoQ not found', () => {
    expect(() => syncSpecForge('nonexistent', 'ws_001', 'user_001')).toThrow(
      'BoQ "nonexistent" not found.',
    );
  });

  it('each link has a unique specForgeItemId', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const result = syncSpecForge('boq_test_001', 'workspace_001', 'user_qs_001');

    const ids = new Set(result.links.map((l) => l.specForgeItemId));
    expect(ids.size).toBe(result.links.length);
  });

  it('links contain correct extractionId from the BoQ', () => {
    const boq = makeBoqDocument({ extractionId: 'ext_custom' });
    storeBoq(boq);

    const result = syncSpecForge('boq_test_001', 'workspace_001', 'user_qs_001');

    for (const link of result.links) {
      expect(link.extractionId).toBe('ext_custom');
    }
  });
});

// ── compareSpecForge ────────────────────────────────────────────────────────

describe('compareSpecForge', () => {
  it('returns empty comparison when no previous links exist (Req 8.5)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const result = compareSpecForge('boq_test_001');

    expect(result.hasPreviousLinks).toBe(false);
    expect(result.comparison.added).toHaveLength(0);
    expect(result.comparison.removed).toHaveLength(0);
    expect(result.comparison.changed).toHaveLength(0);
  });

  it('detects added items when current BoQ has new line items (Req 8.5)', () => {
    // First sync creates links for 3 items
    const originalBoq = makeBoqDocument({ boqId: 'boq_v1', extractionId: 'ext_v1' });
    storeBoq(originalBoq);
    syncSpecForge('boq_v1', 'ws_001', 'user_001');

    // Create a new BoQ with an additional item
    const updatedBoq = makeBoqDocument({
      boqId: 'boq_v2',
      extractionId: 'ext_v2',
      sections: [
        ...originalBoq.sections,
        {
          sectionNumber: '14',
          tradeSection: 'Plumbing and Drainage',
          title: 'Plumbing',
          lineItems: [{
            itemNumber: '14.01',
            description: 'PVC pipes 110mm diameter',
            unit: 'm',
            quantity: 85.0,
            sourceElementCount: 15,
            sourceElementGlobalIds: ['gid-010'],
            elementType: 'IfcPipeSegment',
          }],
        },
      ],
    });
    storeBoq(updatedBoq);

    // Store previous links under the new BoQ's ID for comparison
    const previousLinks = getSpecForgeLinks('boq_v1');
    storeSpecForgeLinks('boq_v2', previousLinks);

    const result = compareSpecForge('boq_v2');

    expect(result.hasPreviousLinks).toBe(true);
    expect(result.comparison.added).toHaveLength(1);
    expect(result.comparison.added[0].itemNumber).toBe('14.01');
  });

  it('detects removed items (Req 8.5)', () => {
    // Store links referencing an item that no longer exists
    const boq = makeBoqDocument();
    storeBoq(boq);

    const previousLinks: BoqSpecForgeLink[] = [
      {
        specForgeItemId: 'sf-001',
        boqLineItemId: '3.01',
        boqId: 'boq_test_001',
        extractionId: 'ext_old',
        linkedAt: '2026-06-01T00:00:00Z',
        quantityAtLink: 45.5,
        userOverridden: false,
      },
      {
        specForgeItemId: 'sf-removed',
        boqLineItemId: '99.01', // does not exist in current BoQ
        boqId: 'boq_test_001',
        extractionId: 'ext_old',
        linkedAt: '2026-06-01T00:00:00Z',
        quantityAtLink: 100.0,
        userOverridden: false,
      },
    ];
    storeSpecForgeLinks('boq_test_001', previousLinks);

    const result = compareSpecForge('boq_test_001');

    expect(result.hasPreviousLinks).toBe(true);
    expect(result.comparison.removed).toHaveLength(1);
    expect(result.comparison.removed[0].itemNumber).toBe('99.01');
  });

  it('detects changed quantities (Req 8.5)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const previousLinks: BoqSpecForgeLink[] = [
      {
        specForgeItemId: 'sf-001',
        boqLineItemId: '3.01',
        boqId: 'boq_test_001',
        extractionId: 'ext_old',
        linkedAt: '2026-06-01T00:00:00Z',
        quantityAtLink: 30.0, // was 30, now 45.5 → changed
        userOverridden: false,
      },
    ];
    storeSpecForgeLinks('boq_test_001', previousLinks);

    const result = compareSpecForge('boq_test_001');

    expect(result.comparison.changed.length).toBeGreaterThanOrEqual(1);
    const change = result.comparison.changed.find((c) => c.lineItemId === '3.01');
    expect(change).toBeDefined();
    expect(change!.previousQuantity).toBe(30.0);
    expect(change!.currentQuantity).toBe(45.5);
    expect(change!.delta).toBe(15.5);
  });

  it('flags user-overridden items without overwriting (Req 8.6)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const previousLinks: BoqSpecForgeLink[] = [
      {
        specForgeItemId: 'sf-override',
        boqLineItemId: '3.01',
        boqId: 'boq_test_001',
        extractionId: 'ext_old',
        linkedAt: '2026-06-01T00:00:00Z',
        quantityAtLink: 45.5, // same quantity but user-overridden
        userOverridden: true,
        currentModelQuantity: 50.0,
      },
    ];
    storeSpecForgeLinks('boq_test_001', previousLinks);

    const result = compareSpecForge('boq_test_001');

    expect(result.userOverriddenItems).toHaveLength(1);
    expect(result.userOverriddenItems[0].specForgeItemId).toBe('sf-override');
    // The user-overridden item is included in changed (due to userOverridden flag)
    expect(result.comparison.changed.length).toBeGreaterThanOrEqual(1);
  });

  it('throws error when BoQ not found', () => {
    expect(() => compareSpecForge('nonexistent')).toThrow('BoQ "nonexistent" not found.');
  });
});

// ── markLinkAsUserOverridden ────────────────────────────────────────────────

describe('markLinkAsUserOverridden', () => {
  it('marks an existing link as user-overridden (Req 8.6)', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);
    syncSpecForge('boq_test_001', 'ws_001', 'user_001');

    const success = markLinkAsUserOverridden('boq_test_001', '3.01', 50.0);

    expect(success).toBe(true);
    const links = getSpecForgeLinks('boq_test_001');
    const updated = links.find((l) => l.boqLineItemId === '3.01');
    expect(updated!.userOverridden).toBe(true);
    expect(updated!.currentModelQuantity).toBe(50.0);
  });

  it('returns false for non-existent BoQ', () => {
    const result = markLinkAsUserOverridden('nonexistent', '3.01');
    expect(result).toBe(false);
  });

  it('returns false for non-existent line item', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);
    syncSpecForge('boq_test_001', 'ws_001', 'user_001');

    const result = markLinkAsUserOverridden('boq_test_001', 'nonexistent');
    expect(result).toBe(false);
  });
});

// ── checkModelSupersession ──────────────────────────────────────────────────

describe('checkModelSupersession', () => {
  it('returns not superseded when no source document exists (Req 9.6)', () => {
    const pkg = makeProcurementPackage();
    storeBoq(makeBoqDocument());

    const result = checkModelSupersession(pkg);

    expect(result.isSuperseded).toBe(false);
  });

  it('returns not superseded when BoQ not found', () => {
    const pkg = makeProcurementPackage({ boqId: 'nonexistent' });

    const result = checkModelSupersession(pkg);

    expect(result.isSuperseded).toBe(false);
  });

  it('detects superseded model from Document Register (Req 9.6)', () => {
    // Register an old model and supersede it
    registerBimDocument({
      documentId: 'ext_test_001',
      projectId: 'proj_test_001',
      fileName: 'old-model.ifc',
      schemaVersion: 'IFC4',
      blobUrl: 'https://blob.example/old.ifc',
    });

    // Register a new model (this will supersede the old one)
    registerBimDocument({
      documentId: 'ext_new_001',
      projectId: 'proj_test_001',
      fileName: 'new-model.ifc',
      schemaVersion: 'IFC4',
      blobUrl: 'https://blob.example/new.ifc',
    });

    // Supersede the old model
    supersedePreviousModels('proj_test_001', 'ext_new_001', 'user_001');

    const boq = makeBoqDocument({ extractionId: 'ext_test_001' });
    storeBoq(boq);

    const pkg = makeProcurementPackage();
    const result = checkModelSupersession(pkg);

    expect(result.isSuperseded).toBe(true);
    expect(result.message).toContain('superseded');
    expect(result.supersededModelId).toBe('ext_test_001');
  });
});

// ── recordProcurementIssuance ───────────────────────────────────────────────

describe('recordProcurementIssuance', () => {
  it('records issuance event with packageId, recipientCount, timestamp (Req 9.5)', () => {
    const result = recordProcurementIssuance(
      'pkg_001', 'proj_001', 5, 'user_qs_001',
    );

    expect(result.packageId).toBe('pkg_001');
    expect(result.recipientCount).toBe(5);
    expect(result.auditRecorded).toBe(true);
    expect(result.issuedAt).toBeDefined();
    expect(new Date(result.issuedAt).toISOString()).toBe(result.issuedAt);
  });

  it('stores issuance events for later query', () => {
    recordProcurementIssuance('pkg_001', 'proj_001', 3, 'user_001');
    recordProcurementIssuance('pkg_002', 'proj_001', 7, 'user_002');

    const events = getProcurementIssuanceEvents();
    expect(events).toHaveLength(2);
    expect(events[0].packageId).toBe('pkg_001');
    expect(events[1].recipientCount).toBe(7);
  });

  it('includes model supersession warning when package references outdated model (Req 9.6)', () => {
    // Set up a superseded model scenario
    registerBimDocument({
      documentId: 'ext_test_001',
      projectId: 'proj_test_001',
      fileName: 'old-model.ifc',
      schemaVersion: 'IFC4',
      blobUrl: 'https://blob.example/old.ifc',
    });
    registerBimDocument({
      documentId: 'ext_new_001',
      projectId: 'proj_test_001',
      fileName: 'new-model.ifc',
      schemaVersion: 'IFC4',
      blobUrl: 'https://blob.example/new.ifc',
    });
    supersedePreviousModels('proj_test_001', 'ext_new_001', 'user_001');

    const boq = makeBoqDocument({ extractionId: 'ext_test_001' });
    storeBoq(boq);

    const pkg = makeProcurementPackage();

    const result = recordProcurementIssuance(
      'pkg_001', 'proj_test_001', 5, 'user_qs_001', pkg,
    );

    expect(result.supersessionWarning).toBeDefined();
    expect(result.supersessionWarning!.isSuperseded).toBe(true);
    expect(pkg.modelSuperseded).toBe(true); // mutated by the function
  });

  it('returns no warning when model is current', () => {
    registerBimDocument({
      documentId: 'ext_test_001',
      projectId: 'proj_test_001',
      fileName: 'current-model.ifc',
      schemaVersion: 'IFC4',
      blobUrl: 'https://blob.example/current.ifc',
    });

    const boq = makeBoqDocument({ extractionId: 'ext_test_001' });
    storeBoq(boq);

    const pkg = makeProcurementPackage();

    const result = recordProcurementIssuance(
      'pkg_001', 'proj_test_001', 3, 'user_qs_001', pkg,
    );

    expect(result.supersessionWarning).toBeUndefined();
    expect(pkg.modelSuperseded).toBe(false);
  });
});

// ── BoQ Store ───────────────────────────────────────────────────────────────

describe('BoQ store management', () => {
  it('stores and retrieves a BoQ', () => {
    const boq = makeBoqDocument();
    storeBoq(boq);

    const retrieved = getBoq('boq_test_001');
    expect(retrieved).toEqual(boq);
  });

  it('returns undefined for non-existent BoQ', () => {
    expect(getBoq('nonexistent')).toBeUndefined();
  });
});
