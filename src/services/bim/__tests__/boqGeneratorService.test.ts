/**
 * Unit tests for BoQ Generator Service
 *
 * Tests aggregation, ASAQS description generation, section numbering,
 * flagged element summaries, and full BoQ document generation.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.8, 12.1, 12.2, 12.3, 12.4, 12.6
 */

import type {
  MappedElement,
  IfcElement,
  AsaqsTradeSection,
  MeasurementUnit,
  ValidationReport,
  ValidationFinding,
  BoqSection,
  BoqLineItem,
} from '../types';
import {
  generateBoq,
  aggregateLineItems,
  buildAsaqsDescription,
  assignSectionNumbers,
} from '../boqGeneratorService';

// ─── Test Helpers ───────────────────────────────────────────────────────────

function makeElement(overrides: Partial<IfcElement> = {}): IfcElement {
  return {
    globalId: 'test-element-001',
    entityType: 'IfcWall',
    name: 'Test Wall',
    spatialContainment: 'storey-001',
    materials: [],
    quantitySets: [],
    propertySets: [],
    hasGeometry: true,
    taggedMetadata: {},
    ...overrides,
  };
}

function makeMappedElement(overrides: Partial<MappedElement> & { element?: Partial<IfcElement> } = {}): MappedElement {
  const { element: elementOverrides, ...mappedOverrides } = overrides;
  return {
    element: makeElement(elementOverrides),
    tradeSection: 'Concrete' as AsaqsTradeSection,
    tradeSectionCode: '3',
    measurementUnit: 'm³' as MeasurementUnit,
    matchedRuleId: 'rule-001',
    isUnclassified: false,
    ...mappedOverrides,
  };
}

function makeValidationReport(findings: ValidationFinding[] = []): ValidationReport {
  return {
    modelId: 'model-001',
    findings,
    statistics: {
      totalElements: 10,
      elementsByType: { IfcWall: 5, IfcSlab: 3, IfcColumn: 2 },
      elementsWithQuantities: 8,
      elementsWithoutQuantities: 2,
      unclassifiedElements: 1,
      elementsByTradeSection: { Concrete: 5, Masonry: 3, Unclassified: 2 },
      quantityCoveragePercent: 80,
    },
    boqBlocked: findings.some((f) => f.severity === 'error'),
    generatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// ─── buildAsaqsDescription ──────────────────────────────────────────────────

describe('buildAsaqsDescription', () => {
  it('formats description as "{element type}, {material}, {measurement qualification}"', () => {
    const mapped = makeMappedElement({
      element: {
        entityType: 'IfcColumn',
        materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 300 }],
      },
      measurementUnit: 'm³',
    });
    const desc = buildAsaqsDescription(mapped);
    expect(desc).toBe('Columns, Concrete 30MPa, measured in cubic metres');
  });

  it('uses "general" when no material is assigned', () => {
    const mapped = makeMappedElement({
      element: { entityType: 'IfcSlab', materials: [] },
      measurementUnit: 'm³',
    });
    const desc = buildAsaqsDescription(mapped);
    expect(desc).toBe('Slabs, general, measured in cubic metres');
  });

  it('handles doors with nr unit', () => {
    const mapped = makeMappedElement({
      element: {
        entityType: 'IfcDoor',
        materials: [{ materialName: 'Timber', thicknessMm: 40 }],
      },
      tradeSection: 'Carpentry and Joinery',
      measurementUnit: 'nr',
    });
    const desc = buildAsaqsDescription(mapped);
    expect(desc).toBe('Doors, Timber, enumerated');
  });

  it('handles walls measured in m²', () => {
    const mapped = makeMappedElement({
      element: {
        entityType: 'IfcWall',
        materials: [{ materialName: 'Face Brick', thicknessMm: 220 }],
      },
      tradeSection: 'Masonry',
      measurementUnit: 'm²',
    });
    const desc = buildAsaqsDescription(mapped);
    expect(desc).toBe('Walls, Face Brick, measured in square metres');
  });

  it('handles reinforcement measured in kg', () => {
    const mapped = makeMappedElement({
      element: {
        entityType: 'IfcMember',
        materials: [{ materialName: 'Steel', thicknessMm: 12 }],
      },
      tradeSection: 'Reinforcement',
      measurementUnit: 'kg',
    });
    const desc = buildAsaqsDescription(mapped);
    expect(desc).toBe('Structural members, Steel, measured in kilograms');
  });

  it('handles pipes measured in linear metres', () => {
    const mapped = makeMappedElement({
      element: {
        entityType: 'IfcPipeSegment',
        materials: [{ materialName: 'Copper Pipe', thicknessMm: 15 }],
      },
      tradeSection: 'Plumbing and Drainage',
      measurementUnit: 'm',
    });
    const desc = buildAsaqsDescription(mapped);
    expect(desc).toBe('Pipe segments, Copper Pipe, measured in linear metres');
  });
});

// ─── assignSectionNumbers ───────────────────────────────────────────────────

describe('assignSectionNumbers', () => {
  it('assigns correct ASAQS section numbers', () => {
    const sections: BoqSection[] = [
      { sectionNumber: '', tradeSection: 'Masonry', title: 'Masonry', lineItems: [] },
      { sectionNumber: '', tradeSection: 'Concrete', title: 'Concrete', lineItems: [] },
      { sectionNumber: '', tradeSection: 'Earthworks', title: 'Earthworks', lineItems: [] },
    ];
    const result = assignSectionNumbers(sections);
    expect(result[0].sectionNumber).toBe('2'); // Earthworks
    expect(result[1].sectionNumber).toBe('3'); // Concrete
    expect(result[2].sectionNumber).toBe('6'); // Masonry
  });

  it('sorts sections in standard ASAQS order', () => {
    const sections: BoqSection[] = [
      { sectionNumber: '', tradeSection: 'Electrical', title: 'Electrical', lineItems: [] },
      { sectionNumber: '', tradeSection: 'Preliminaries', title: 'Preliminaries', lineItems: [] },
      { sectionNumber: '', tradeSection: 'Masonry', title: 'Masonry', lineItems: [] },
    ];
    const result = assignSectionNumbers(sections);
    expect(result[0].tradeSection).toBe('Preliminaries');
    expect(result[1].tradeSection).toBe('Masonry');
    expect(result[2].tradeSection).toBe('Electrical');
  });

  it('assigns Unclassified to section 99', () => {
    const sections: BoqSection[] = [
      { sectionNumber: '', tradeSection: 'Unclassified', title: 'Unclassified', lineItems: [] },
    ];
    const result = assignSectionNumbers(sections);
    expect(result[0].sectionNumber).toBe('99');
  });

  it('re-numbers line items within each section sequentially', () => {
    const lineItems: BoqLineItem[] = [
      {
        itemNumber: '', description: 'Item A', unit: 'm³',
        quantity: 10, sourceElementCount: 1,
        sourceElementGlobalIds: ['a'], elementType: 'IfcColumn',
      },
      {
        itemNumber: '', description: 'Item B', unit: 'm³',
        quantity: 20, sourceElementCount: 2,
        sourceElementGlobalIds: ['b', 'c'], elementType: 'IfcBeam',
      },
    ];
    const sections: BoqSection[] = [
      { sectionNumber: '', tradeSection: 'Concrete', title: 'Concrete', lineItems },
    ];
    const result = assignSectionNumbers(sections);
    expect(result[0].lineItems[0].itemNumber).toBe('3.01');
    expect(result[0].lineItems[1].itemNumber).toBe('3.02');
  });

  it('handles all 17 standard sections', () => {
    const allSections: BoqSection[] = [
      'Preliminaries', 'Earthworks', 'Concrete', 'Formwork',
      'Reinforcement', 'Masonry', 'Waterproofing', 'Roofwork',
      'Carpentry and Joinery', 'Ceilings and Partitions',
      'Floor Coverings', 'Glazing', 'Ironmongery',
      'Plumbing and Drainage', 'Electrical', 'Painting', 'Unclassified',
    ].map((ts) => ({
      sectionNumber: '',
      tradeSection: ts as AsaqsTradeSection,
      title: ts,
      lineItems: [],
    }));
    const result = assignSectionNumbers(allSections);
    expect(result).toHaveLength(17);
    expect(result[0].sectionNumber).toBe('1');
    expect(result[16].sectionNumber).toBe('99');
  });
});

// ─── aggregateLineItems ─────────────────────────────────────────────────────

describe('aggregateLineItems', () => {
  it('groups elements by trade section + element type + material + unit', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'col-1',
          entityType: 'IfcColumn',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 300 }],
          quantitySets: [{
            setName: 'BaseQuantities',
            quantities: [{ name: 'GrossVolume', type: 'volume', value: 2.5, unit: 'm³', sourceElementGlobalId: 'col-1', sourceSetName: 'BaseQuantities' }],
          }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
      makeMappedElement({
        element: {
          globalId: 'col-2',
          entityType: 'IfcColumn',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 300 }],
          quantitySets: [{
            setName: 'BaseQuantities',
            quantities: [{ name: 'GrossVolume', type: 'volume', value: 3.0, unit: 'm³', sourceElementGlobalId: 'col-2', sourceSetName: 'BaseQuantities' }],
          }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
    ];
    const result = aggregateLineItems(elements);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(5.5);
    expect(result[0].sourceElementCount).toBe(2);
    expect(result[0].sourceElementGlobalIds).toContain('col-1');
    expect(result[0].sourceElementGlobalIds).toContain('col-2');
  });

  it('separates elements with different materials into separate line items', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'w-1',
          entityType: 'IfcWall',
          materials: [{ materialName: 'Face Brick', thicknessMm: 220 }],
          quantitySets: [{
            setName: 'BaseQuantities',
            quantities: [{ name: 'NetSideArea', type: 'area', value: 15.0, unit: 'm²', sourceElementGlobalId: 'w-1', sourceSetName: 'BaseQuantities' }],
          }],
        },
        tradeSection: 'Masonry',
        measurementUnit: 'm²',
      }),
      makeMappedElement({
        element: {
          globalId: 'w-2',
          entityType: 'IfcWall',
          materials: [{ materialName: 'Clay Brick', thicknessMm: 110 }],
          quantitySets: [{
            setName: 'BaseQuantities',
            quantities: [{ name: 'NetSideArea', type: 'area', value: 20.0, unit: 'm²', sourceElementGlobalId: 'w-2', sourceSetName: 'BaseQuantities' }],
          }],
        },
        tradeSection: 'Masonry',
        measurementUnit: 'm²',
      }),
    ];
    const result = aggregateLineItems(elements);
    expect(result).toHaveLength(2);
  });

  it('rounds quantities to 2 decimal places by default', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'slab-1',
          entityType: 'IfcSlab',
          quantitySets: [{
            setName: 'BaseQuantities',
            quantities: [{ name: 'GrossVolume', type: 'volume', value: 1.23456, unit: 'm³', sourceElementGlobalId: 'slab-1', sourceSetName: 'BaseQuantities' }],
          }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
    ];
    const result = aggregateLineItems(elements);
    expect(result[0].quantity).toBe(1.23);
  });

  it('uses count of 1 for nr unit elements without quantity sets', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'door-1',
          entityType: 'IfcDoor',
          materials: [{ materialName: 'Timber', thicknessMm: 40 }],
          quantitySets: [],
        },
        tradeSection: 'Carpentry and Joinery',
        measurementUnit: 'nr',
      }),
      makeMappedElement({
        element: {
          globalId: 'door-2',
          entityType: 'IfcDoor',
          materials: [{ materialName: 'Timber', thicknessMm: 40 }],
          quantitySets: [],
        },
        tradeSection: 'Carpentry and Joinery',
        measurementUnit: 'nr',
      }),
    ];
    const result = aggregateLineItems(elements);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(2);
    expect(result[0].sourceElementCount).toBe(2);
  });

  it('handles empty input', () => {
    const result = aggregateLineItems([]);
    expect(result).toHaveLength(0);
  });

  it('assigns item numbers in format "{sectionNumber}.{sequential}"', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'col-1', entityType: 'IfcColumn',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 300 }],
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 5, unit: 'm³', sourceElementGlobalId: 'col-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
      makeMappedElement({
        element: {
          globalId: 'beam-1', entityType: 'IfcBeam',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 400 }],
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 3, unit: 'm³', sourceElementGlobalId: 'beam-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
    ];
    const result = aggregateLineItems(elements);
    // Two different element types in same trade section = two line items
    expect(result).toHaveLength(2);
    expect(result[0].itemNumber).toBe('3.01');
    expect(result[1].itemNumber).toBe('3.02');
  });
});

// ─── generateBoq ────────────────────────────────────────────────────────────

describe('generateBoq', () => {
  it('produces a BoqDocument with all required fields', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'slab-1', entityType: 'IfcSlab',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 200 }],
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 10, unit: 'm³', sourceElementGlobalId: 'slab-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
    ];
    const report = makeValidationReport();
    const boq = generateBoq(elements, 'proj-123', 'ext-456', report);

    expect(boq.boqId).toBeDefined();
    expect(boq.projectId).toBe('proj-123');
    expect(boq.extractionId).toBe('ext-456');
    expect(boq.status).toBe('draft');
    expect(boq.revision).toBe('A');
    expect(boq.currency).toBe('ZAR');
    expect(boq.generatedAt).toBeDefined();
    expect(boq.sections.length).toBeGreaterThan(0);
    expect(boq.totals).toBeDefined();
  });

  it('defaults currency to ZAR', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'w-1', entityType: 'IfcWall',
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'NetSideArea', type: 'area', value: 25, unit: 'm²', sourceElementGlobalId: 'w-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Masonry',
        measurementUnit: 'm²',
      }),
    ];
    const boq = generateBoq(elements, 'p1', 'e1', makeValidationReport());
    expect(boq.currency).toBe('ZAR');
  });

  it('respects custom currency option', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'w-1', entityType: 'IfcWall',
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'NetSideArea', type: 'area', value: 25, unit: 'm²', sourceElementGlobalId: 'w-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Masonry',
        measurementUnit: 'm²',
      }),
    ];
    const boq = generateBoq(elements, 'p1', 'e1', makeValidationReport(), { currency: 'USD' });
    expect(boq.currency).toBe('USD');
  });

  it('includes flaggedElementsSummary from validation report', () => {
    const findings: ValidationFinding[] = [
      {
        id: 'f1', type: 'unclassified_element', severity: 'warning',
        message: 'Element not classified', elementGlobalId: 'proxy-1',
        elementType: 'IfcBuildingElementProxy',
      },
      {
        id: 'f2', type: 'missing_quantities', severity: 'warning',
        message: 'No quantity set', elementGlobalId: 'wall-99',
        elementType: 'IfcWall',
      },
      {
        id: 'f3', type: 'missing_material', severity: 'info',
        message: 'No material assigned', elementGlobalId: 'slab-5',
        elementType: 'IfcSlab',
      },
    ];
    const report = makeValidationReport(findings);
    const boq = generateBoq([], 'p1', 'e1', report);

    // Only unclassified_element and missing_quantities are included
    expect(boq.flaggedElementsSummary).toHaveLength(2);
    expect(boq.flaggedElementsSummary[0].globalId).toBe('proxy-1');
    expect(boq.flaggedElementsSummary[0].findingType).toBe('unclassified_element');
    expect(boq.flaggedElementsSummary[1].globalId).toBe('wall-99');
    expect(boq.flaggedElementsSummary[1].findingType).toBe('missing_quantities');
  });

  it('sections are sorted in ASAQS order', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'cable-1', entityType: 'IfcCableSegment',
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'Length', type: 'length', value: 50, unit: 'm', sourceElementGlobalId: 'cable-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Electrical',
        tradeSectionCode: '15',
        measurementUnit: 'm',
      }),
      makeMappedElement({
        element: {
          globalId: 'col-1', entityType: 'IfcColumn',
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 5, unit: 'm³', sourceElementGlobalId: 'col-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        tradeSectionCode: '3',
        measurementUnit: 'm³',
      }),
    ];
    const boq = generateBoq(elements, 'p1', 'e1', makeValidationReport());
    expect(boq.sections[0].tradeSection).toBe('Concrete');
    expect(boq.sections[1].tradeSection).toBe('Electrical');
  });

  it('totals reflect correct counts', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'col-1', entityType: 'IfcColumn',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 300 }],
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 5, unit: 'm³', sourceElementGlobalId: 'col-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
      makeMappedElement({
        element: {
          globalId: 'col-2', entityType: 'IfcColumn',
          materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 300 }],
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 3, unit: 'm³', sourceElementGlobalId: 'col-2', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
      makeMappedElement({
        element: {
          globalId: 'door-1', entityType: 'IfcDoor',
          materials: [{ materialName: 'Timber', thicknessMm: 40 }],
          quantitySets: [],
        },
        tradeSection: 'Carpentry and Joinery',
        tradeSectionCode: '9',
        measurementUnit: 'nr',
      }),
    ];
    const boq = generateBoq(elements, 'p1', 'e1', makeValidationReport());
    expect(boq.totals.totalElements).toBe(3);
    expect(boq.totals.totalSections).toBe(2);
    // col-1 and col-2 aggregate into 1 line item; door-1 is another
    expect(boq.totals.totalLineItems).toBe(2);
  });

  it('handles empty mapped elements', () => {
    const boq = generateBoq([], 'p1', 'e1', makeValidationReport());
    expect(boq.sections).toHaveLength(0);
    expect(boq.totals.totalElements).toBe(0);
    expect(boq.totals.totalLineItems).toBe(0);
    expect(boq.totals.totalSections).toBe(0);
  });

  it('includes JBCC appendix structure flag in options', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'w-1', entityType: 'IfcWall',
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'NetSideArea', type: 'area', value: 25, unit: 'm²', sourceElementGlobalId: 'w-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Masonry',
        measurementUnit: 'm²',
      }),
    ];
    // includeJbccPreambles default is true
    const boq = generateBoq(elements, 'p1', 'e1', makeValidationReport());
    // The BoQ is generated successfully with default options
    expect(boq.status).toBe('draft');
    expect(boq.sections.length).toBe(1);
  });

  it('rounds all quantities to specified precision', () => {
    const elements: MappedElement[] = [
      makeMappedElement({
        element: {
          globalId: 'slab-1', entityType: 'IfcSlab',
          quantitySets: [{ setName: 'BQ', quantities: [{ name: 'GrossVolume', type: 'volume', value: 3.14159, unit: 'm³', sourceElementGlobalId: 'slab-1', sourceSetName: 'BQ' }] }],
        },
        tradeSection: 'Concrete',
        measurementUnit: 'm³',
      }),
    ];
    const boq = generateBoq(elements, 'p1', 'e1', makeValidationReport(), { roundingPrecision: 2 });
    const lineItem = boq.sections[0].lineItems[0];
    expect(lineItem.quantity).toBe(3.14);
  });
});


// ─── createProcurementPackage ───────────────────────────────────────────────

import type {
  BoqDocument,
  PackageCoverSheet,
  ProcurementPackage,
} from '../types';
import {
  createProcurementPackage,
  stripInternalReferences,
} from '../boqGeneratorService';

function makeBoqDocument(overrides: Partial<BoqDocument> = {}): BoqDocument {
  return {
    boqId: 'boq-001',
    projectId: 'proj-123',
    extractionId: 'ext-456',
    title: 'Bill of Quantities — proj-123',
    status: 'draft',
    revision: 'B',
    generatedAt: '2026-07-01T10:00:00.000Z',
    generatedBy: 'system',
    currency: 'ZAR',
    sections: [
      {
        sectionNumber: '3',
        tradeSection: 'Concrete',
        title: 'Concrete',
        lineItems: [
          {
            itemNumber: '3.01',
            description: 'Columns, Concrete 30MPa, measured in cubic metres',
            unit: 'm³',
            quantity: 12.5,
            rate: undefined,
            amount: undefined,
            sourceElementCount: 3,
            sourceElementGlobalIds: ['2T$hG8xM9EwBX9K0nZ1Rvz', '0vN3x7R8P4AQ2qWn1KjAbc'],
            elementType: 'IfcColumn',
            material: 'Concrete 30MPa',
          },
          {
            itemNumber: '3.02',
            description: 'Slabs, Concrete 30MPa, measured in cubic metres',
            unit: 'm³',
            quantity: 45.8,
            rate: undefined,
            amount: undefined,
            sourceElementCount: 5,
            sourceElementGlobalIds: ['3Ax7B2y1zQwRtPmOk5LnVg'],
            elementType: 'IfcSlab',
            material: 'Concrete 30MPa',
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
            description: 'Walls, Face Brick, measured in square metres',
            unit: 'm²',
            quantity: 120.0,
            rate: undefined,
            amount: undefined,
            sourceElementCount: 8,
            sourceElementGlobalIds: ['4Bx8C3y2zRwStQnPl6MoWh'],
            elementType: 'IfcWall',
            material: 'Face Brick',
          },
        ],
      },
      {
        sectionNumber: '15',
        tradeSection: 'Electrical',
        title: 'Electrical',
        lineItems: [
          {
            itemNumber: '15.01',
            description: 'Cable segments, general, measured in linear metres',
            unit: 'm',
            quantity: 200.0,
            rate: undefined,
            amount: undefined,
            sourceElementCount: 10,
            sourceElementGlobalIds: ['5Cy9D4z3aSxTuRoPm7NpXi'],
            elementType: 'IfcCableSegment',
          },
        ],
      },
    ],
    flaggedElementsSummary: [],
    totals: {
      totalLineItems: 4,
      totalSections: 3,
      totalElements: 26,
    },
    ...overrides,
  };
}

function makeCoverSheet(overrides: Partial<PackageCoverSheet> = {}): PackageCoverSheet {
  return {
    projectName: 'Office Block Phase 2',
    projectNumber: 'PRJ-2026-042',
    packageTitle: 'Concrete Works',
    issueDate: '2026-07-15',
    revisionNumber: 'B',
    qsContactName: 'John Smith',
    qsContactEmail: 'john@qs-firm.co.za',
    ...overrides,
  };
}

describe('createProcurementPackage', () => {
  it('creates a package with correct structure and metadata', () => {
    const boq = makeBoqDocument();
    const coverSheet = makeCoverSheet();
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, coverSheet);

    expect(pkg.packageId).toBeDefined();
    expect(pkg.packageId.length).toBeGreaterThan(0);
    expect(pkg.projectId).toBe('proj-123');
    expect(pkg.boqId).toBe('boq-001');
    expect(pkg.title).toBe('Concrete');
    expect(pkg.tradeSections).toEqual(['Concrete']);
    expect(pkg.coverSheet).toEqual(coverSheet);
    expect(pkg.revision).toBe('B');
    expect(pkg.modelSuperseded).toBe(false);
  });

  it('includes line items from selected trade sections only', () => {
    const boq = makeBoqDocument();
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());

    expect(pkg.lineItems).toHaveLength(2);
    expect(pkg.lineItems[0].itemNumber).toBe('3.01');
    expect(pkg.lineItems[1].itemNumber).toBe('3.02');
  });

  it('supports multiple trade section selection', () => {
    const boq = makeBoqDocument();
    const pkg = createProcurementPackage(
      boq,
      ['Concrete', 'Masonry'],
      undefined,
      makeCoverSheet(),
    );

    expect(pkg.tradeSections).toEqual(['Concrete', 'Masonry']);
    expect(pkg.lineItems).toHaveLength(3);
    expect(pkg.title).toBe('Concrete, Masonry');
  });

  it('filters by selectedLineItems when provided', () => {
    const boq = makeBoqDocument();
    const pkg = createProcurementPackage(
      boq,
      ['Concrete'],
      ['3.02'], // only the slab line item
      makeCoverSheet(),
    );

    expect(pkg.lineItems).toHaveLength(1);
    expect(pkg.lineItems[0].itemNumber).toBe('3.02');
    expect(pkg.lineItems[0].quantity).toBe(45.8);
  });

  it('strips GlobalIds from line item descriptions', () => {
    const boq = makeBoqDocument({
      sections: [{
        sectionNumber: '3',
        tradeSection: 'Concrete',
        title: 'Concrete',
        lineItems: [{
          itemNumber: '3.01',
          description: 'Columns 2T$hG8xM9EwBX9K0nZ1Rvz, Concrete 30MPa, measured in cubic metres',
          unit: 'm³',
          quantity: 12.5,
          rate: undefined,
          amount: undefined,
          sourceElementCount: 1,
          sourceElementGlobalIds: ['2T$hG8xM9EwBX9K0nZ1Rvz'],
          elementType: 'IfcColumn',
          material: 'Concrete 30MPa',
        }],
      }],
    });
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());
    expect(pkg.lineItems[0].description).not.toContain('2T$hG8xM9EwBX9K0nZ1Rvz');
  });

  it('strips IFC entity type names from line item descriptions', () => {
    const boq = makeBoqDocument({
      sections: [{
        sectionNumber: '3',
        tradeSection: 'Concrete',
        title: 'Concrete',
        lineItems: [{
          itemNumber: '3.01',
          description: 'IfcColumn, Concrete 30MPa, measured in cubic metres',
          unit: 'm³',
          quantity: 12.5,
          rate: undefined,
          amount: undefined,
          sourceElementCount: 1,
          sourceElementGlobalIds: ['col-1'],
          elementType: 'IfcColumn',
          material: 'Concrete 30MPa',
        }],
      }],
    });
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());
    expect(pkg.lineItems[0].description).not.toContain('IfcColumn');
    expect(pkg.lineItems[0].description).toContain('Columns');
  });

  it('ProcurementLineItem has no GlobalIds or elementType fields', () => {
    const boq = makeBoqDocument();
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());

    for (const item of pkg.lineItems) {
      expect(item).toHaveProperty('itemNumber');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('unit');
      expect(item).toHaveProperty('quantity');
      // Should NOT have internal BoQ fields
      expect(item).not.toHaveProperty('sourceElementGlobalIds');
      expect(item).not.toHaveProperty('sourceElementCount');
      expect(item).not.toHaveProperty('elementType');
      expect(item).not.toHaveProperty('material');
    }
  });

  it('includes cover sheet with all required fields', () => {
    const boq = makeBoqDocument();
    const coverSheet = makeCoverSheet();
    const pkg = createProcurementPackage(boq, ['Masonry'], undefined, coverSheet);

    expect(pkg.coverSheet.projectName).toBe('Office Block Phase 2');
    expect(pkg.coverSheet.projectNumber).toBe('PRJ-2026-042');
    expect(pkg.coverSheet.packageTitle).toBe('Concrete Works');
    expect(pkg.coverSheet.issueDate).toBe('2026-07-15');
    expect(pkg.coverSheet.revisionNumber).toBe('B');
    expect(pkg.coverSheet.qsContactName).toBe('John Smith');
    expect(pkg.coverSheet.qsContactEmail).toBe('john@qs-firm.co.za');
  });

  it('modelSuperseded defaults to false', () => {
    const boq = makeBoqDocument();
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());
    expect(pkg.modelSuperseded).toBe(false);
  });

  it('returns empty line items when no sections match', () => {
    const boq = makeBoqDocument();
    const pkg = createProcurementPackage(boq, ['Preliminaries'], undefined, makeCoverSheet());
    expect(pkg.lineItems).toHaveLength(0);
  });

  it('generates a unique packageId', () => {
    const boq = makeBoqDocument();
    const pkg1 = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());
    const pkg2 = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());
    expect(pkg1.packageId).not.toBe(pkg2.packageId);
  });

  it('uses boq revision in the package', () => {
    const boq = makeBoqDocument({ revision: 'C' });
    const pkg = createProcurementPackage(boq, ['Concrete'], undefined, makeCoverSheet());
    expect(pkg.revision).toBe('C');
  });
});

// ─── stripInternalReferences ────────────────────────────────────────────────

describe('stripInternalReferences', () => {
  it('removes IFC entity type names and replaces with human-readable names', () => {
    const result = stripInternalReferences('IfcWall, Face Brick, measured in square metres');
    expect(result).not.toContain('IfcWall');
    expect(result).toContain('Walls');
  });

  it('removes GlobalId patterns from descriptions', () => {
    const result = stripInternalReferences('Columns 2T$hG8xM9EwBX9K0nZ1Rvz, concrete, cubic metres');
    expect(result).not.toContain('2T$hG8xM9EwBX9K0nZ1Rvz');
    expect(result).toContain('Columns');
  });

  it('handles descriptions with no internal references', () => {
    const input = 'Columns, Concrete 30MPa, measured in cubic metres';
    const result = stripInternalReferences(input);
    expect(result).toBe(input);
  });

  it('cleans up whitespace artifacts from stripping', () => {
    const result = stripInternalReferences('IfcColumn  with extra   spaces');
    expect(result).not.toContain('  ');
  });

  it('handles multiple IFC type names in one string', () => {
    const result = stripInternalReferences('IfcWall and IfcSlab together');
    expect(result).not.toContain('IfcWall');
    expect(result).not.toContain('IfcSlab');
    expect(result).toContain('Walls');
    expect(result).toContain('Slabs');
  });
});
