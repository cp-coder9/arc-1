/**
 * Model Validator Service — Unit Tests
 *
 * Comprehensive tests for validation, finding detection, statistics,
 * and BoQ blocking logic.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import {
  validateModel,
  findDuplicateGlobalIds,
  findMissingQuantities,
  findUnclassifiedElements,
  findMissingMaterials,
  computeStatistics,
  isBoqBlocked,
} from '../modelValidatorService';
import type {
  ParsedIfcModel,
  IfcElement,
  ExtractedQuantity,
  ValidationFinding,
  MappedElement,
  SpatialNode,
} from '../types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeElement(overrides: Partial<IfcElement> = {}): IfcElement {
  return {
    globalId: `GID_${Math.random().toString(36).slice(2, 24)}`,
    entityType: 'IfcWall',
    name: 'Test Wall',
    spatialContainment: 'storey-001',
    materials: [{ materialName: 'Concrete 30MPa', thicknessMm: 200 }],
    quantitySets: [
      {
        setName: 'BaseQuantities',
        quantities: [
          {
            name: 'NetSideArea',
            type: 'area',
            value: 25.5,
            unit: 'm²',
            sourceElementGlobalId: 'GID_src',
            sourceSetName: 'BaseQuantities',
          },
        ],
      },
    ],
    propertySets: [],
    hasGeometry: true,
    taggedMetadata: {},
    ...overrides,
  };
}

function makeModel(elements: IfcElement[]): ParsedIfcModel {
  const spatialHierarchy: SpatialNode = {
    globalId: 'project-001',
    name: 'Test Project',
    type: 'IfcProject',
    children: [],
    elementIds: elements.map((el) => el.globalId),
  };
  return {
    fileId: 'file-001',
    fileName: 'test-model.ifc',
    schemaVersion: 'IFC4',
    parsedAt: new Date().toISOString(),
    spatialHierarchy,
    elements,
    elementCount: elements.length,
  };
}

// ─── findDuplicateGlobalIds ─────────────────────────────────────────────────

describe('findDuplicateGlobalIds', () => {
  it('returns empty array when all GlobalIds are unique', () => {
    const elements = [
      makeElement({ globalId: 'unique-001' }),
      makeElement({ globalId: 'unique-002' }),
      makeElement({ globalId: 'unique-003' }),
    ];
    const findings = findDuplicateGlobalIds(elements);
    expect(findings).toHaveLength(0);
  });

  it('detects duplicate GlobalIds with severity "error"', () => {
    const elements = [
      makeElement({ globalId: 'dup-001', name: 'Wall A', entityType: 'IfcWall' }),
      makeElement({ globalId: 'dup-001', name: 'Wall B', entityType: 'IfcSlab' }),
    ];
    const findings = findDuplicateGlobalIds(elements);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('duplicate_globalid');
    expect(findings[0].severity).toBe('error');
    expect(findings[0].elementGlobalId).toBe('dup-001');
  });

  it('reports multiple duplicates when the same GlobalId appears 3+ times', () => {
    const elements = [
      makeElement({ globalId: 'dup-abc', name: 'First' }),
      makeElement({ globalId: 'dup-abc', name: 'Second' }),
      makeElement({ globalId: 'dup-abc', name: 'Third' }),
    ];
    const findings = findDuplicateGlobalIds(elements);
    // Second and Third should be flagged as duplicates of First
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === 'error')).toBe(true);
  });

  it('returns empty array for empty elements list', () => {
    const findings = findDuplicateGlobalIds([]);
    expect(findings).toHaveLength(0);
  });
});

// ─── findMissingQuantities ──────────────────────────────────────────────────

describe('findMissingQuantities', () => {
  it('returns empty array when all elements with geometry have quantity sets', () => {
    const elements = [
      makeElement({ hasGeometry: true, quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ hasGeometry: false, quantitySets: [] }), // no geometry, no qty — OK
    ];
    const findings = findMissingQuantities(elements);
    expect(findings).toHaveLength(0);
  });

  it('flags elements with geometry but no quantity sets as severity "warning"', () => {
    const elements = [
      makeElement({ globalId: 'geo-no-qty', hasGeometry: true, quantitySets: [] }),
    ];
    const findings = findMissingQuantities(elements);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('missing_quantities');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].elementGlobalId).toBe('geo-no-qty');
  });

  it('does not flag elements without geometry even if no quantity sets', () => {
    const elements = [
      makeElement({ hasGeometry: false, quantitySets: [] }),
    ];
    const findings = findMissingQuantities(elements);
    expect(findings).toHaveLength(0);
  });

  it('flags multiple elements correctly', () => {
    const elements = [
      makeElement({ globalId: 'a', hasGeometry: true, quantitySets: [] }),
      makeElement({ globalId: 'b', hasGeometry: true, quantitySets: [] }),
      makeElement({ globalId: 'c', hasGeometry: true, quantitySets: [{ setName: 'X', quantities: [] }] }),
    ];
    const findings = findMissingQuantities(elements);
    expect(findings).toHaveLength(2);
  });
});

// ─── findUnclassifiedElements ───────────────────────────────────────────────

describe('findUnclassifiedElements', () => {
  it('returns empty array when no IfcBuildingElementProxy elements exist', () => {
    const elements = [
      makeElement({ entityType: 'IfcWall' }),
      makeElement({ entityType: 'IfcSlab' }),
    ];
    const findings = findUnclassifiedElements(elements);
    expect(findings).toHaveLength(0);
  });

  it('flags IfcBuildingElementProxy without classification as severity "warning"', () => {
    const elements = [
      makeElement({
        globalId: 'proxy-001',
        entityType: 'IfcBuildingElementProxy',
        classification: undefined,
      }),
    ];
    const findings = findUnclassifiedElements(elements);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('unclassified_element');
    expect(findings[0].severity).toBe('warning');
    expect(findings[0].elementGlobalId).toBe('proxy-001');
    expect(findings[0].elementType).toBe('IfcBuildingElementProxy');
  });

  it('does not flag IfcBuildingElementProxy with classification', () => {
    const elements = [
      makeElement({
        entityType: 'IfcBuildingElementProxy',
        classification: { systemName: 'Uniclass', code: 'Ss_25_10', description: 'Wall systems' },
      }),
    ];
    const findings = findUnclassifiedElements(elements);
    expect(findings).toHaveLength(0);
  });

  it('does not flag non-proxy elements without classification', () => {
    const elements = [
      makeElement({ entityType: 'IfcWall', classification: undefined }),
    ];
    const findings = findUnclassifiedElements(elements);
    expect(findings).toHaveLength(0);
  });
});

// ─── findMissingMaterials ───────────────────────────────────────────────────

describe('findMissingMaterials', () => {
  it('returns empty array when all elements have materials', () => {
    const elements = [
      makeElement({ materials: [{ materialName: 'Concrete', thicknessMm: 200 }] }),
    ];
    const findings = findMissingMaterials(elements);
    expect(findings).toHaveLength(0);
  });

  it('flags elements with no materials as severity "info"', () => {
    const elements = [
      makeElement({ globalId: 'no-mat-001', materials: [], entityType: 'IfcColumn' }),
    ];
    const findings = findMissingMaterials(elements);
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('missing_material');
    expect(findings[0].severity).toBe('info');
    expect(findings[0].elementGlobalId).toBe('no-mat-001');
    expect(findings[0].elementType).toBe('IfcColumn');
  });

  it('flags multiple elements with missing materials', () => {
    const elements = [
      makeElement({ globalId: 'a', materials: [] }),
      makeElement({ globalId: 'b', materials: [] }),
      makeElement({ globalId: 'c', materials: [{ materialName: 'Steel', thicknessMm: 10 }] }),
    ];
    const findings = findMissingMaterials(elements);
    expect(findings).toHaveLength(2);
    expect(findings.every((f) => f.severity === 'info')).toBe(true);
  });
});

// ─── computeStatistics ──────────────────────────────────────────────────────

describe('computeStatistics', () => {
  it('computes correct totalElements', () => {
    const elements = [makeElement(), makeElement(), makeElement()];
    const stats = computeStatistics(elements);
    expect(stats.totalElements).toBe(3);
  });

  it('computes elementsByType correctly', () => {
    const elements = [
      makeElement({ entityType: 'IfcWall' }),
      makeElement({ entityType: 'IfcWall' }),
      makeElement({ entityType: 'IfcSlab' }),
      makeElement({ entityType: 'IfcColumn' }),
    ];
    const stats = computeStatistics(elements);
    expect(stats.elementsByType).toEqual({
      IfcWall: 2,
      IfcSlab: 1,
      IfcColumn: 1,
    });
  });

  it('computes elementsWithQuantities and elementsWithoutQuantities', () => {
    const elements = [
      makeElement({ quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ quantitySets: [] }),
    ];
    const stats = computeStatistics(elements);
    expect(stats.elementsWithQuantities).toBe(2);
    expect(stats.elementsWithoutQuantities).toBe(1);
  });

  it('computes unclassifiedElements correctly', () => {
    const elements = [
      makeElement({ entityType: 'IfcBuildingElementProxy', classification: undefined }),
      makeElement({ entityType: 'IfcBuildingElementProxy', classification: { systemName: 'Uniclass', code: 'X', description: 'Test' } }),
      makeElement({ entityType: 'IfcWall', classification: undefined }),
    ];
    const stats = computeStatistics(elements);
    expect(stats.unclassifiedElements).toBe(1);
  });

  it('computes quantityCoveragePercent correctly', () => {
    const elements = [
      makeElement({ quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ quantitySets: [] }),
      makeElement({ quantitySets: [] }),
      makeElement({ quantitySets: [{ setName: 'Base', quantities: [] }] }),
    ];
    const stats = computeStatistics(elements);
    expect(stats.quantityCoveragePercent).toBe(50);
  });

  it('returns 0% coverage for empty elements array', () => {
    const stats = computeStatistics([]);
    expect(stats.totalElements).toBe(0);
    expect(stats.quantityCoveragePercent).toBe(0);
  });

  it('populates elementsByTradeSection when mappedElements provided', () => {
    const elements = [makeElement(), makeElement()];
    const mappedElements: MappedElement[] = [
      {
        element: elements[0],
        tradeSection: 'Concrete',
        tradeSectionCode: '3',
        measurementUnit: 'm³',
        matchedRuleId: 'rule-1',
        isUnclassified: false,
      },
      {
        element: elements[1],
        tradeSection: 'Masonry',
        tradeSectionCode: '6',
        measurementUnit: 'm²',
        matchedRuleId: 'rule-2',
        isUnclassified: false,
      },
    ];
    const stats = computeStatistics(elements, mappedElements);
    expect(stats.elementsByTradeSection).toEqual({
      Concrete: 1,
      Masonry: 1,
    });
  });

  it('returns empty elementsByTradeSection when mappedElements not provided', () => {
    const elements = [makeElement()];
    const stats = computeStatistics(elements);
    expect(stats.elementsByTradeSection).toEqual({});
  });

  it('with + without quantities equals total', () => {
    const elements = [
      makeElement({ quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ quantitySets: [] }),
      makeElement({ quantitySets: [{ setName: 'Custom', quantities: [] }] }),
    ];
    const stats = computeStatistics(elements);
    expect(stats.elementsWithQuantities + stats.elementsWithoutQuantities).toBe(stats.totalElements);
  });
});

// ─── isBoqBlocked ───────────────────────────────────────────────────────────

describe('isBoqBlocked', () => {
  it('returns false when no findings exist', () => {
    expect(isBoqBlocked([])).toBe(false);
  });

  it('returns false when only warning and info findings exist', () => {
    const findings: ValidationFinding[] = [
      { id: '1', type: 'missing_quantities', severity: 'warning', message: 'test' },
      { id: '2', type: 'missing_material', severity: 'info', message: 'test' },
    ];
    expect(isBoqBlocked(findings)).toBe(false);
  });

  it('returns true when any error-severity finding exists', () => {
    const findings: ValidationFinding[] = [
      { id: '1', type: 'missing_quantities', severity: 'warning', message: 'test' },
      { id: '2', type: 'duplicate_globalid', severity: 'error', message: 'test' },
    ];
    expect(isBoqBlocked(findings)).toBe(true);
  });

  it('returns true when only error findings exist', () => {
    const findings: ValidationFinding[] = [
      { id: '1', type: 'duplicate_globalid', severity: 'error', message: 'test' },
    ];
    expect(isBoqBlocked(findings)).toBe(true);
  });
});

// ─── validateModel (integration) ────────────────────────────────────────────

describe('validateModel', () => {
  it('produces a complete validation report', () => {
    const elements = [
      makeElement({ globalId: 'el-001' }),
      makeElement({ globalId: 'el-002', hasGeometry: true, quantitySets: [] }),
    ];
    const model = makeModel(elements);
    const quantities: ExtractedQuantity[] = [
      {
        name: 'NetSideArea',
        type: 'area',
        value: 25.5,
        unit: 'm²',
        sourceElementGlobalId: 'el-001',
        sourceSetName: 'BaseQuantities',
      },
    ];

    const report = validateModel(model, quantities);

    expect(report.modelId).toBe('file-001');
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.statistics.totalElements).toBe(2);
    expect(report.generatedAt).toBeDefined();
    expect(typeof report.boqBlocked).toBe('boolean');
  });

  it('calls all find functions and aggregates findings', () => {
    const elements = [
      // Duplicate GlobalIds → error
      makeElement({ globalId: 'dup-x', entityType: 'IfcWall' }),
      makeElement({ globalId: 'dup-x', entityType: 'IfcSlab' }),
      // Missing quantities → warning
      makeElement({ globalId: 'no-qty', hasGeometry: true, quantitySets: [] }),
      // Unclassified proxy → warning
      makeElement({
        globalId: 'proxy-unc',
        entityType: 'IfcBuildingElementProxy',
        classification: undefined,
      }),
      // Missing material → info
      makeElement({ globalId: 'no-mat', materials: [] }),
    ];
    const model = makeModel(elements);
    const quantities: ExtractedQuantity[] = [
      {
        name: 'GrossVolume',
        type: 'volume',
        value: 5.0,
        unit: 'm³',
        sourceElementGlobalId: 'dup-x',
        sourceSetName: 'BaseQuantities',
      },
    ];

    const report = validateModel(model, quantities);

    const errorFindings = report.findings.filter((f) => f.severity === 'error');
    const warningFindings = report.findings.filter((f) => f.severity === 'warning');
    const infoFindings = report.findings.filter((f) => f.severity === 'info');

    expect(errorFindings.length).toBeGreaterThanOrEqual(1); // duplicate
    expect(warningFindings.length).toBeGreaterThanOrEqual(2); // missing qty + unclassified
    expect(infoFindings.length).toBeGreaterThanOrEqual(1); // missing material
    expect(report.boqBlocked).toBe(true);
  });

  it('edge case: zero extractable quantities produces error finding', () => {
    const elements = [
      makeElement({ globalId: 'a', hasGeometry: true, quantitySets: [] }),
      makeElement({ globalId: 'b', hasGeometry: true, quantitySets: [] }),
      makeElement({ globalId: 'c', hasGeometry: false, quantitySets: [] }),
    ];
    const model = makeModel(elements);
    const quantities: ExtractedQuantity[] = [];

    const report = validateModel(model, quantities);

    const noExtractable = report.findings.find(
      (f) => f.type === 'no_extractable_quantities'
    );
    expect(noExtractable).toBeDefined();
    expect(noExtractable!.severity).toBe('error');
    expect(report.boqBlocked).toBe(true);
  });

  it('does not produce no_extractable_quantities when some elements have quantity sets', () => {
    const elements = [
      makeElement({ globalId: 'a', quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ globalId: 'b', hasGeometry: true, quantitySets: [] }),
    ];
    const model = makeModel(elements);
    const quantities: ExtractedQuantity[] = [
      {
        name: 'Length',
        type: 'length',
        value: 3.0,
        unit: 'm',
        sourceElementGlobalId: 'a',
        sourceSetName: 'Base',
      },
    ];

    const report = validateModel(model, quantities);

    const noExtractable = report.findings.find(
      (f) => f.type === 'no_extractable_quantities'
    );
    expect(noExtractable).toBeUndefined();
  });

  it('reports boqBlocked = false when only warnings and info exist', () => {
    const elements = [
      makeElement({ globalId: 'a', hasGeometry: true, quantitySets: [] }),
      makeElement({
        globalId: 'b',
        entityType: 'IfcBuildingElementProxy',
        classification: undefined,
        quantitySets: [{ setName: 'Base', quantities: [] }],
      }),
    ];
    const model = makeModel(elements);
    // One element has a quantity set, so no "no_extractable_quantities" error
    const quantities: ExtractedQuantity[] = [
      {
        name: 'Count',
        type: 'count',
        value: 1,
        unit: 'nr',
        sourceElementGlobalId: 'b',
        sourceSetName: 'Base',
      },
    ];

    const report = validateModel(model, quantities);
    expect(report.boqBlocked).toBe(false);
  });

  it('handles empty model with no elements', () => {
    const model = makeModel([]);
    const quantities: ExtractedQuantity[] = [];

    const report = validateModel(model, quantities);

    expect(report.findings).toHaveLength(0);
    expect(report.statistics.totalElements).toBe(0);
    expect(report.boqBlocked).toBe(false);
  });

  it('includes correct statistics in the report', () => {
    const elements = [
      makeElement({ globalId: 'a', entityType: 'IfcWall', quantitySets: [{ setName: 'Base', quantities: [] }] }),
      makeElement({ globalId: 'b', entityType: 'IfcWall', quantitySets: [] }),
      makeElement({ globalId: 'c', entityType: 'IfcSlab', quantitySets: [{ setName: 'Base', quantities: [] }] }),
    ];
    const model = makeModel(elements);
    const quantities: ExtractedQuantity[] = [];

    const report = validateModel(model, quantities);

    expect(report.statistics.totalElements).toBe(3);
    expect(report.statistics.elementsByType).toEqual({ IfcWall: 2, IfcSlab: 1 });
    expect(report.statistics.elementsWithQuantities).toBe(2);
    expect(report.statistics.elementsWithoutQuantities).toBe(1);
  });
});
