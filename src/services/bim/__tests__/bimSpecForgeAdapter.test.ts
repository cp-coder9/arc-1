/**
 * Unit tests for BIM SpecForge Adapter
 *
 * Tests createSpecForgeItems and compareExtractions including
 * user-overridden discrepancy handling.
 *
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
 */

import type {
  BoqDocument,
  BoqSection,
  BoqLineItem,
  BoqSpecForgeLink,
  AsaqsTradeSection,
  MeasurementUnit,
} from '../types';
import {
  createSpecForgeItems,
  compareExtractions,
} from '../bimSpecForgeAdapter';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeLineItem(overrides: Partial<BoqLineItem> = {}): BoqLineItem {
  return {
    itemNumber: '3.01',
    description: 'Reinforced concrete in columns, 30 MPa',
    unit: 'm³' as MeasurementUnit,
    quantity: 12.5,
    sourceElementCount: 4,
    sourceElementGlobalIds: ['gid-001', 'gid-002', 'gid-003', 'gid-004'],
    elementType: 'IfcColumn',
    material: 'Concrete 30MPa',
    ...overrides,
  };
}

function makeSection(overrides: Partial<BoqSection> = {}): BoqSection {
  return {
    sectionNumber: '3',
    tradeSection: 'Concrete' as AsaqsTradeSection,
    title: 'Concrete',
    lineItems: [makeLineItem()],
    ...overrides,
  };
}

function makeBoqDocument(overrides: Partial<BoqDocument> = {}): BoqDocument {
  return {
    boqId: 'boq-001',
    projectId: 'proj-001',
    extractionId: 'ext-001',
    title: 'Test BoQ',
    status: 'draft',
    revision: 'A',
    generatedAt: '2026-07-01T10:00:00Z',
    generatedBy: 'user-001',
    currency: 'ZAR',
    sections: [makeSection()],
    flaggedElementsSummary: [],
    totals: { totalLineItems: 1, totalSections: 1, totalElements: 4 },
    ...overrides,
  };
}

function makeLink(overrides: Partial<BoqSpecForgeLink> = {}): BoqSpecForgeLink {
  return {
    specForgeItemId: 'sf-item-001',
    boqLineItemId: '3.01',
    boqId: 'boq-001',
    extractionId: 'ext-prev-001',
    linkedAt: '2026-06-01T10:00:00Z',
    quantityAtLink: 12.5,
    userOverridden: false,
    ...overrides,
  };
}

// ─── createSpecForgeItems Tests ─────────────────────────────────────────────

describe('createSpecForgeItems', () => {
  it('creates one link per BoQ line item', () => {
    const lineItem1 = makeLineItem({ itemNumber: '3.01' });
    const lineItem2 = makeLineItem({ itemNumber: '3.02', quantity: 8.0 });
    const boq = makeBoqDocument({
      sections: [makeSection({ lineItems: [lineItem1, lineItem2] })],
    });

    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links).toHaveLength(2);
  });

  it('assigns generated specForgeItemId (UUID format) to each link', () => {
    const boq = makeBoqDocument();
    const links = createSpecForgeItems(boq, 'workspace-001');

    for (const link of links) {
      // UUID format: 8-4-4-4-12 hex chars
      expect(link.specForgeItemId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    }
  });

  it('sets boqLineItemId to the line item itemNumber', () => {
    const boq = makeBoqDocument({
      sections: [makeSection({ lineItems: [makeLineItem({ itemNumber: '5.03' })] })],
    });

    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links[0].boqLineItemId).toBe('5.03');
  });

  it('sets boqId from the BoQ document', () => {
    const boq = makeBoqDocument({ boqId: 'boq-xyz-123' });
    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links[0].boqId).toBe('boq-xyz-123');
  });

  it('sets extractionId from the BoQ document', () => {
    const boq = makeBoqDocument({ extractionId: 'ext-abc-456' });
    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links[0].extractionId).toBe('ext-abc-456');
  });

  it('sets linkedAt to a valid ISO timestamp', () => {
    const boq = makeBoqDocument();
    const links = createSpecForgeItems(boq, 'workspace-001');

    const parsed = new Date(links[0].linkedAt);
    expect(parsed.toISOString()).toBe(links[0].linkedAt);
  });

  it('sets quantityAtLink to the line item quantity', () => {
    const boq = makeBoqDocument({
      sections: [makeSection({ lineItems: [makeLineItem({ quantity: 42.75 })] })],
    });

    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links[0].quantityAtLink).toBe(42.75);
  });

  it('sets userOverridden to false for newly created links', () => {
    const boq = makeBoqDocument();
    const links = createSpecForgeItems(boq, 'workspace-001');

    for (const link of links) {
      expect(link.userOverridden).toBe(false);
    }
  });

  it('handles multiple sections with multiple line items', () => {
    const section1 = makeSection({
      sectionNumber: '3',
      tradeSection: 'Concrete',
      lineItems: [
        makeLineItem({ itemNumber: '3.01' }),
        makeLineItem({ itemNumber: '3.02' }),
      ],
    });
    const section2 = makeSection({
      sectionNumber: '6',
      tradeSection: 'Masonry',
      lineItems: [
        makeLineItem({ itemNumber: '6.01' }),
      ],
    });
    const boq = makeBoqDocument({ sections: [section1, section2] });

    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links).toHaveLength(3);
    expect(links.map((l) => l.boqLineItemId)).toEqual(['3.01', '3.02', '6.01']);
  });

  it('returns empty array for BoQ with no line items', () => {
    const boq = makeBoqDocument({ sections: [] });
    const links = createSpecForgeItems(boq, 'workspace-001');

    expect(links).toHaveLength(0);
  });

  it('generates unique specForgeItemIds for each link', () => {
    const boq = makeBoqDocument({
      sections: [
        makeSection({
          lineItems: [
            makeLineItem({ itemNumber: '1.01' }),
            makeLineItem({ itemNumber: '1.02' }),
            makeLineItem({ itemNumber: '1.03' }),
          ],
        }),
      ],
    });

    const links = createSpecForgeItems(boq, 'workspace-001');
    const ids = links.map((l) => l.specForgeItemId);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ─── compareExtractions Tests ───────────────────────────────────────────────

describe('compareExtractions', () => {
  it('identifies added items (in current but not in previous)', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [
            makeLineItem({ itemNumber: '3.01' }),
            makeLineItem({ itemNumber: '3.02' }),
          ],
        }),
      ],
    });
    const previousLinks = [makeLink({ boqLineItemId: '3.01' })];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.added).toHaveLength(1);
    expect(comparison.added[0].itemNumber).toBe('3.02');
  });

  it('identifies removed items (in previous but not in current)', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [makeSection({ lineItems: [makeLineItem({ itemNumber: '3.01' })] })],
    });
    const previousLinks = [
      makeLink({ boqLineItemId: '3.01' }),
      makeLink({ boqLineItemId: '3.02', specForgeItemId: 'sf-item-002' }),
    ];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.removed).toHaveLength(1);
    expect(comparison.removed[0].itemNumber).toBe('3.02');
  });

  it('identifies changed quantities (delta and deltaPercent)', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [makeLineItem({ itemNumber: '3.01', quantity: 15.0 })],
        }),
      ],
    });
    const previousLinks = [makeLink({ boqLineItemId: '3.01', quantityAtLink: 12.5 })];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.changed).toHaveLength(1);
    expect(comparison.changed[0].lineItemId).toBe('3.01');
    expect(comparison.changed[0].previousQuantity).toBe(12.5);
    expect(comparison.changed[0].currentQuantity).toBe(15.0);
    expect(comparison.changed[0].delta).toBe(2.5);
    expect(comparison.changed[0].deltaPercent).toBe(20);
  });

  it('does not flag unchanged items', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [makeLineItem({ itemNumber: '3.01', quantity: 12.5 })],
        }),
      ],
    });
    const previousLinks = [makeLink({ boqLineItemId: '3.01', quantityAtLink: 12.5 })];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.added).toHaveLength(0);
    expect(comparison.removed).toHaveLength(0);
    expect(comparison.changed).toHaveLength(0);
  });

  it('flags user-overridden items even when quantity matches', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [makeLineItem({ itemNumber: '3.01', quantity: 12.5 })],
        }),
      ],
    });
    const previousLinks = [
      makeLink({ boqLineItemId: '3.01', quantityAtLink: 12.5, userOverridden: true }),
    ];

    const comparison = compareExtractions(currentBoq, previousLinks);

    // User-overridden items are included in changed with delta 0
    expect(comparison.changed).toHaveLength(1);
    expect(comparison.changed[0].delta).toBe(0);
    expect(comparison.changed[0].deltaPercent).toBe(0);
  });

  it('flags user-overridden items with quantity change', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [makeLineItem({ itemNumber: '3.01', quantity: 20.0 })],
        }),
      ],
    });
    const previousLinks = [
      makeLink({ boqLineItemId: '3.01', quantityAtLink: 10.0, userOverridden: true }),
    ];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.changed).toHaveLength(1);
    expect(comparison.changed[0].previousQuantity).toBe(10.0);
    expect(comparison.changed[0].currentQuantity).toBe(20.0);
    expect(comparison.changed[0].delta).toBe(10.0);
    expect(comparison.changed[0].deltaPercent).toBe(100);
  });

  it('sets previousExtractionId from the first previousLink', () => {
    const currentBoq = makeBoqDocument({ extractionId: 'ext-002' });
    const previousLinks = [makeLink({ extractionId: 'ext-prev-001' })];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.previousExtractionId).toBe('ext-prev-001');
  });

  it('sets currentExtractionId from the current BoQ', () => {
    const currentBoq = makeBoqDocument({ extractionId: 'ext-002' });
    const previousLinks = [makeLink()];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.currentExtractionId).toBe('ext-002');
  });

  it('handles empty previousLinks (all items are added)', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [
            makeLineItem({ itemNumber: '3.01' }),
            makeLineItem({ itemNumber: '3.02' }),
          ],
        }),
      ],
    });

    const comparison = compareExtractions(currentBoq, []);

    expect(comparison.added).toHaveLength(2);
    expect(comparison.removed).toHaveLength(0);
    expect(comparison.changed).toHaveLength(0);
    expect(comparison.previousExtractionId).toBe('');
  });

  it('handles empty current BoQ (all items are removed)', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [],
    });
    const previousLinks = [
      makeLink({ boqLineItemId: '3.01' }),
      makeLink({ boqLineItemId: '3.02', specForgeItemId: 'sf-item-002' }),
    ];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.added).toHaveLength(0);
    expect(comparison.removed).toHaveLength(2);
    expect(comparison.changed).toHaveLength(0);
  });

  it('correctly computes negative deltas', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [makeLineItem({ itemNumber: '3.01', quantity: 8.0 })],
        }),
      ],
    });
    const previousLinks = [makeLink({ boqLineItemId: '3.01', quantityAtLink: 10.0 })];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.changed[0].delta).toBe(-2.0);
    expect(comparison.changed[0].deltaPercent).toBe(-20);
  });

  it('handles deltaPercent correctly when previousQuantity is zero', () => {
    const currentBoq = makeBoqDocument({
      extractionId: 'ext-002',
      sections: [
        makeSection({
          lineItems: [makeLineItem({ itemNumber: '3.01', quantity: 5.0 })],
        }),
      ],
    });
    const previousLinks = [makeLink({ boqLineItemId: '3.01', quantityAtLink: 0 })];

    const comparison = compareExtractions(currentBoq, previousLinks);

    expect(comparison.changed[0].deltaPercent).toBe(100);
  });
});
