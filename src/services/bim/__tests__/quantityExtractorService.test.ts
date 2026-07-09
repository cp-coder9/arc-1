/**
 * Unit tests for Quantity Extractor Service
 *
 * Tests quantity extraction, unit normalisation, bounds checking,
 * tagged metadata extraction, and property parse failure handling.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import {
  extractQuantities,
  normaliseToSI,
  checkQuantityBounds,
  extractTaggedMetadata,
} from '../quantityExtractorService';
import type {
  ParsedIfcModel,
  IfcElement,
  PropertySet,
  QuantityType,
  ElementQuantitySet,
} from '../types';

// ─── Test Helpers ─────────────────────────────────────────────────────────

function makeElement(overrides: Partial<IfcElement> = {}): IfcElement {
  return {
    globalId: 'test_element_001',
    entityType: 'IfcWall',
    name: 'Test Wall',
    spatialContainment: 'storey_001',
    materials: [],
    quantitySets: [],
    propertySets: [],
    hasGeometry: true,
    taggedMetadata: {},
    ...overrides,
  };
}

function makeModel(elements: IfcElement[]): ParsedIfcModel {
  return {
    fileId: 'test_file_001',
    fileName: 'test-model.ifc',
    schemaVersion: 'IFC4',
    parsedAt: '2026-01-01T00:00:00.000Z',
    spatialHierarchy: {
      globalId: 'project_001',
      name: 'Test Project',
      type: 'IfcProject',
      children: [],
      elementIds: [],
    },
    elements,
    elementCount: elements.length,
  };
}

function makeQuantitySet(overrides: Partial<ElementQuantitySet> = {}): ElementQuantitySet {
  return {
    setName: 'BaseQuantities',
    quantities: [
      {
        name: 'NetSideArea',
        type: 'area',
        value: 25.5,
        unit: 'm²',
        sourceElementGlobalId: 'test_element_001',
        sourceSetName: 'BaseQuantities',
      },
    ],
    ...overrides,
  };
}

// ─── normaliseToSI Tests ──────────────────────────────────────────────────

describe('normaliseToSI', () => {
  describe('area conversions', () => {
    it('converts ft² to m²', () => {
      const result = normaliseToSI(100, 'ft²', 'area');
      expect(result).toBeCloseTo(9.2903, 4);
    });

    it('converts mm² to m²', () => {
      const result = normaliseToSI(1_000_000, 'mm²', 'area');
      expect(result).toBeCloseTo(1, 4);
    });

    it('converts cm² to m²', () => {
      const result = normaliseToSI(10_000, 'cm²', 'area');
      expect(result).toBeCloseTo(1, 4);
    });

    it('returns same value for m²', () => {
      const result = normaliseToSI(50, 'm²', 'area');
      expect(result).toBe(50);
    });
  });

  describe('volume conversions', () => {
    it('converts ft³ to m³', () => {
      const result = normaliseToSI(100, 'ft³', 'volume');
      expect(result).toBeCloseTo(2.83168, 4);
    });

    it('converts mm³ to m³', () => {
      const result = normaliseToSI(1_000_000_000, 'mm³', 'volume');
      expect(result).toBeCloseTo(1, 4);
    });

    it('returns same value for m³', () => {
      const result = normaliseToSI(5, 'm³', 'volume');
      expect(result).toBe(5);
    });
  });

  describe('length conversions', () => {
    it('converts ft to m', () => {
      const result = normaliseToSI(10, 'ft', 'length');
      expect(result).toBeCloseTo(3.048, 4);
    });

    it('converts in to m', () => {
      const result = normaliseToSI(100, 'in', 'length');
      expect(result).toBeCloseTo(2.54, 4);
    });

    it('converts mm to m', () => {
      const result = normaliseToSI(1000, 'mm', 'length');
      expect(result).toBeCloseTo(1, 4);
    });

    it('converts cm to m', () => {
      const result = normaliseToSI(100, 'cm', 'length');
      expect(result).toBeCloseTo(1, 4);
    });

    it('returns same value for m', () => {
      const result = normaliseToSI(3.5, 'm', 'length');
      expect(result).toBe(3.5);
    });
  });

  describe('weight conversions', () => {
    it('converts lb to kg', () => {
      const result = normaliseToSI(100, 'lb', 'length');
      // lb is not a length unit, so it returns as-is
      expect(result).toBe(100);
    });

    it('converts lb to kg for weight type', () => {
      const result = normaliseToSI(100, 'lb', 'weight');
      expect(result).toBeCloseTo(45.3592, 4);
    });

    it('converts g to kg', () => {
      const result = normaliseToSI(1000, 'g', 'weight');
      expect(result).toBeCloseTo(1, 4);
    });

    it('converts tonne to kg', () => {
      const result = normaliseToSI(1, 'tonne', 'weight');
      expect(result).toBe(1000);
    });

    it('returns same value for kg', () => {
      const result = normaliseToSI(50, 'kg', 'weight');
      expect(result).toBe(50);
    });
  });

  describe('edge cases', () => {
    it('returns value as-is for empty source unit', () => {
      const result = normaliseToSI(10, '', 'area');
      expect(result).toBe(10);
    });

    it('returns value as-is for unknown unit', () => {
      const result = normaliseToSI(10, 'unknown_unit', 'area');
      expect(result).toBe(10);
    });

    it('handles case-insensitive unit matching', () => {
      const result = normaliseToSI(100, 'FT', 'length');
      expect(result).toBeCloseTo(30.48, 4);
    });

    it('handles whitespace in unit string', () => {
      const result = normaliseToSI(100, ' ft ', 'length');
      expect(result).toBeCloseTo(30.48, 4);
    });
  });
});

// ─── checkQuantityBounds Tests ────────────────────────────────────────────

describe('checkQuantityBounds', () => {
  it('returns true for normal area values', () => {
    expect(checkQuantityBounds(50, 'area')).toBe(true);
    expect(checkQuantityBounds(99_999, 'area')).toBe(true);
  });

  it('returns false for area exceeding 100,000 m²', () => {
    expect(checkQuantityBounds(100_001, 'area')).toBe(false);
    expect(checkQuantityBounds(500_000, 'area')).toBe(false);
  });

  it('returns true for normal volume values', () => {
    expect(checkQuantityBounds(500, 'volume')).toBe(true);
    expect(checkQuantityBounds(999_999, 'volume')).toBe(true);
  });

  it('returns false for volume exceeding 1,000,000 m³', () => {
    expect(checkQuantityBounds(1_000_001, 'volume')).toBe(false);
  });

  it('returns true for normal length values', () => {
    expect(checkQuantityBounds(100, 'length')).toBe(true);
    expect(checkQuantityBounds(9_999, 'length')).toBe(true);
  });

  it('returns false for length exceeding 10,000 m', () => {
    expect(checkQuantityBounds(10_001, 'length')).toBe(false);
  });

  it('returns true for normal weight values', () => {
    expect(checkQuantityBounds(1000, 'weight')).toBe(true);
    expect(checkQuantityBounds(9_999_999, 'weight')).toBe(true);
  });

  it('returns false for weight exceeding 10,000,000 kg', () => {
    expect(checkQuantityBounds(10_000_001, 'weight')).toBe(false);
  });

  it('returns false for negative values of any type', () => {
    expect(checkQuantityBounds(-1, 'area')).toBe(false);
    expect(checkQuantityBounds(-0.001, 'volume')).toBe(false);
    expect(checkQuantityBounds(-100, 'length')).toBe(false);
    expect(checkQuantityBounds(-50, 'weight')).toBe(false);
  });

  it('returns true for zero values', () => {
    expect(checkQuantityBounds(0, 'area')).toBe(true);
    expect(checkQuantityBounds(0, 'volume')).toBe(true);
  });

  it('returns true for count values within safe integer range', () => {
    expect(checkQuantityBounds(999, 'count')).toBe(true);
  });
});

// ─── extractTaggedMetadata Tests ──────────────────────────────────────────

describe('extractTaggedMetadata', () => {
  it('extracts fireRating from recognised Pset_WallCommon', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_WallCommon',
        isRecognised: true,
        properties: [
          { name: 'FireRating', value: 'REI 60' },
          { name: 'IsExternal', value: true },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({ fireRating: 'REI 60' });
  });

  it('extracts acousticRating from recognised property set', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_SlabCommon',
        isRecognised: true,
        properties: [
          { name: 'AcousticRating', value: '45 dB' },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({ acousticRating: '45 dB' });
  });

  it('extracts thermalTransmittance from recognised property set', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_WindowCommon',
        isRecognised: true,
        properties: [
          { name: 'ThermalTransmittance', value: 1.8 },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({ thermalTransmittance: 1.8 });
  });

  it('extracts multiple metadata keys from same set', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_DoorCommon',
        isRecognised: true,
        properties: [
          { name: 'FireRating', value: 'REI 90' },
          { name: 'AcousticRating', value: '35 dB' },
          { name: 'ThermalTransmittance', value: 2.5 },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({
      fireRating: 'REI 90',
      acousticRating: '35 dB',
      thermalTransmittance: 2.5,
    });
  });

  it('ignores non-recognised property sets', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Custom_Properties',
        isRecognised: false,
        properties: [
          { name: 'FireRating', value: 'REI 120' },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({});
  });

  it('ignores properties with parseWarning flag', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_WallCommon',
        isRecognised: true,
        properties: [
          { name: 'FireRating', value: 'N/A', rawValue: 'N/A', parseWarning: true },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({});
  });

  it('ignores non-tagged property names', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_WallCommon',
        isRecognised: true,
        properties: [
          { name: 'IsExternal', value: true },
          { name: 'LoadBearing', value: false },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({});
  });

  it('returns empty record for empty property sets', () => {
    const result = extractTaggedMetadata([]);
    expect(result).toEqual({});
  });

  it('ignores set with isRecognised true but name not in RECOGNISED_PSETS', () => {
    const propertySets: PropertySet[] = [
      {
        setName: 'Pset_SomethingElse',
        isRecognised: true,
        properties: [
          { name: 'FireRating', value: 'REI 60' },
        ],
      },
    ];

    const result = extractTaggedMetadata(propertySets);
    expect(result).toEqual({});
  });
});

// ─── extractQuantities Tests ──────────────────────────────────────────────

describe('extractQuantities', () => {
  it('extracts quantities from all element quantity sets', () => {
    const element = makeElement({
      globalId: 'wall_001',
      quantitySets: [
        {
          setName: 'BaseQuantities',
          quantities: [
            { name: 'NetSideArea', type: 'area', value: 25.5, unit: 'm²', sourceElementGlobalId: 'wall_001', sourceSetName: 'BaseQuantities' },
            { name: 'GrossVolume', type: 'volume', value: 3.2, unit: 'm³', sourceElementGlobalId: 'wall_001', sourceSetName: 'BaseQuantities' },
          ],
        },
        {
          setName: 'CustomQuantities',
          quantities: [
            { name: 'Length', type: 'length', value: 12.0, unit: 'm', sourceElementGlobalId: 'wall_001', sourceSetName: 'CustomQuantities' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model, 'proj_001', 'user_001');

    expect(result.quantities).toHaveLength(3);
    expect(result.quantities[0].name).toBe('NetSideArea');
    expect(result.quantities[0].value).toBe(25.5);
    expect(result.quantities[0].unit).toBe('m²');
    expect(result.quantities[0].sourceElementGlobalId).toBe('wall_001');
    expect(result.quantities[0].sourceSetName).toBe('BaseQuantities');
    expect(result.quantities[1].name).toBe('GrossVolume');
    expect(result.quantities[2].name).toBe('Length');
    expect(result.quantities[2].sourceSetName).toBe('CustomQuantities');
  });

  it('preserves quantity name, type, value, unit, source GlobalId, and source set name', () => {
    const element = makeElement({
      globalId: 'slab_001',
      entityType: 'IfcSlab',
      quantitySets: [
        {
          setName: 'Qto_SlabBaseQuantities',
          quantities: [
            { name: 'GrossArea', type: 'area', value: 120.0, unit: 'm²', sourceElementGlobalId: 'slab_001', sourceSetName: 'Qto_SlabBaseQuantities' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    const qty = result.quantities[0];
    expect(qty.name).toBe('GrossArea');
    expect(qty.type).toBe('area');
    expect(qty.value).toBe(120.0);
    expect(qty.unit).toBe('m²');
    expect(qty.sourceElementGlobalId).toBe('slab_001');
    expect(qty.sourceSetName).toBe('Qto_SlabBaseQuantities');
  });

  it('flags elements with geometry but no quantity sets as missing_quantities', () => {
    const element = makeElement({
      globalId: 'wall_no_qty',
      hasGeometry: true,
      quantitySets: [],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    const missingFindings = result.validationReport.findings.filter(
      (f) => f.type === 'missing_quantities'
    );
    expect(missingFindings).toHaveLength(1);
    expect(missingFindings[0].severity).toBe('warning');
    expect(missingFindings[0].elementGlobalId).toBe('wall_no_qty');
  });

  it('does not flag elements without geometry', () => {
    const element = makeElement({
      globalId: 'wall_no_geom',
      hasGeometry: false,
      quantitySets: [],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    const missingFindings = result.validationReport.findings.filter(
      (f) => f.type === 'missing_quantities'
    );
    expect(missingFindings).toHaveLength(0);
  });

  it('flags out-of-bounds quantity values without discarding them', () => {
    const element = makeElement({
      globalId: 'big_wall',
      quantitySets: [
        {
          setName: 'BaseQuantities',
          quantities: [
            { name: 'NetSideArea', type: 'area', value: 200_000, unit: 'm²', sourceElementGlobalId: 'big_wall', sourceSetName: 'BaseQuantities' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    // Value should be preserved
    expect(result.quantities[0].value).toBe(200_000);

    // Should have an out_of_bounds finding
    const boundsFindings = result.validationReport.findings.filter(
      (f) => f.type === 'out_of_bounds_quantity'
    );
    expect(boundsFindings).toHaveLength(1);
    expect(boundsFindings[0].severity).toBe('warning');
  });

  it('flags negative quantity values without discarding them', () => {
    const element = makeElement({
      globalId: 'neg_wall',
      quantitySets: [
        {
          setName: 'BaseQuantities',
          quantities: [
            { name: 'NetSideArea', type: 'area', value: -5, unit: 'm²', sourceElementGlobalId: 'neg_wall', sourceSetName: 'BaseQuantities' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    // Value should be preserved (not discarded)
    expect(result.quantities[0].value).toBe(-5);

    // Should have an out_of_bounds finding
    const boundsFindings = result.validationReport.findings.filter(
      (f) => f.type === 'out_of_bounds_quantity'
    );
    expect(boundsFindings).toHaveLength(1);
  });

  it('handles property parse warnings — preserves raw value and continues', () => {
    const element = makeElement({
      globalId: 'warn_element',
      propertySets: [
        {
          setName: 'Pset_WallCommon',
          isRecognised: true,
          properties: [
            { name: 'ThermalTransmittance', value: 'N/A', rawValue: 'N/A', parseWarning: true },
            { name: 'FireRating', value: 'REI 60' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    // Should generate a parse_warning finding
    const parseWarnings = result.validationReport.findings.filter(
      (f) => f.type === 'parse_warning'
    );
    expect(parseWarnings).toHaveLength(1);
    expect(parseWarnings[0].elementGlobalId).toBe('warn_element');
    expect(parseWarnings[0].severity).toBe('warning');

    // Should still extract tagged metadata for non-warning properties
    const el = result.elements.find((e) => e.globalId === 'warn_element');
    expect(el?.taggedMetadata.fireRating).toBe('REI 60');
  });

  it('extracts tagged metadata during quantity extraction', () => {
    const element = makeElement({
      globalId: 'meta_wall',
      propertySets: [
        {
          setName: 'Pset_WallCommon',
          isRecognised: true,
          properties: [
            { name: 'FireRating', value: 'REI 120' },
            { name: 'AcousticRating', value: '50 dB' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    const el = result.elements.find((e) => e.globalId === 'meta_wall');
    expect(el?.taggedMetadata.fireRating).toBe('REI 120');
    expect(el?.taggedMetadata.acousticRating).toBe('50 dB');
  });

  it('processes elements in batches (handles > 500 elements)', () => {
    // Create 600 elements to test batching
    const elements: IfcElement[] = [];
    for (let i = 0; i < 600; i++) {
      elements.push(
        makeElement({
          globalId: `element_${i.toString().padStart(4, '0')}`,
          quantitySets: [
            {
              setName: 'BaseQuantities',
              quantities: [
                {
                  name: 'NetSideArea',
                  type: 'area',
                  value: 10 + i * 0.1,
                  unit: 'm²',
                  sourceElementGlobalId: `element_${i.toString().padStart(4, '0')}`,
                  sourceSetName: 'BaseQuantities',
                },
              ],
            },
          ],
        })
      );
    }

    const model = makeModel(elements);
    const result = extractQuantities(model);

    // All 600 elements should have their quantities extracted
    expect(result.quantities).toHaveLength(600);
  });

  it('returns correct ExtractionResult structure', () => {
    const element = makeElement({
      globalId: 'struct_test',
      quantitySets: [makeQuantitySet()],
    });
    const model = makeModel([element]);
    const result = extractQuantities(model, 'proj_123', 'user_456');

    expect(result.projectId).toBe('proj_123');
    expect(result.fileId).toBe('test_file_001');
    expect(result.fileName).toBe('test-model.ifc');
    expect(result.schemaVersion).toBe('IFC4');
    expect(result.extractedBy).toBe('user_456');
    expect(result.status).toBe('draft');
    expect(result.extractionId).toMatch(/^ext_/);
    expect(result.extractedAt).toBeTruthy();
    expect(result.validationReport).toBeDefined();
    expect(result.validationReport.modelId).toBe('test_file_001');
  });

  it('computes statistics correctly', () => {
    const elements = [
      makeElement({ globalId: 'e1', entityType: 'IfcWall', quantitySets: [makeQuantitySet()] }),
      makeElement({ globalId: 'e2', entityType: 'IfcWall', quantitySets: [] }),
      makeElement({ globalId: 'e3', entityType: 'IfcSlab', quantitySets: [makeQuantitySet()] }),
      makeElement({ globalId: 'e4', entityType: 'IfcBuildingElementProxy', quantitySets: [] }),
    ];

    const model = makeModel(elements);
    const result = extractQuantities(model);

    const stats = result.validationReport.statistics;
    expect(stats.totalElements).toBe(4);
    expect(stats.elementsWithQuantities).toBe(2);
    expect(stats.elementsWithoutQuantities).toBe(2);
    expect(stats.unclassifiedElements).toBe(1); // proxy without classification
    expect(stats.quantityCoveragePercent).toBe(50);
    expect(stats.elementsByType['IfcWall']).toBe(2);
    expect(stats.elementsByType['IfcSlab']).toBe(1);
  });

  it('normalises quantities to SI during extraction', () => {
    const element = makeElement({
      globalId: 'imperial_wall',
      quantitySets: [
        {
          setName: 'BaseQuantities',
          quantities: [
            { name: 'Length', type: 'length', value: 10, unit: 'ft', sourceElementGlobalId: 'imperial_wall', sourceSetName: 'BaseQuantities' },
          ],
        },
      ],
    });

    const model = makeModel([element]);
    const result = extractQuantities(model);

    expect(result.quantities[0].value).toBeCloseTo(3.048, 4);
    expect(result.quantities[0].unit).toBe('m');
  });
});
