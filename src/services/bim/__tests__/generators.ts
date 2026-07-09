/**
 * Shared fast-check arbitraries for BIM/IFC Quantity Extraction Bridge tests.
 * Generates realistic test data matching the types defined in ../types.ts.
 *
 * Validates: Requirements 1.2, 2.1, 3.1
 */
import fc from 'fast-check';
import type {
  IfcEntityType,
  IfcSchemaVersion,
  QuantityType,
  ValidationSeverity,
  ValidationFindingType,
  IfcClassification,
  MaterialLayer,
  ElementQuantitySet,
  ExtractedQuantity,
  PropertySet,
  PropertyValue,
  IfcElement,
  MappingRule,
  MeasurementUnit,
  AsaqsTradeSection,
  BoqDocument,
  BoqSection,
  BoqLineItem,
  FlaggedElementSummary,
  BoqTotals,
  MappedElement,
  SpatialNode,
  ParsedIfcModel,
  ValidationReport,
  ValidationFinding,
  ModelStatistics,
} from '../types';

// ─── Constants ──────────────────────────────────────────────────────────────

export const ALL_IFC_ENTITY_TYPES: IfcEntityType[] = [
  // Structural
  'IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcColumn', 'IfcBeam',
  'IfcDoor', 'IfcWindow', 'IfcRoof', 'IfcStair', 'IfcRailing',
  'IfcCurtainWall', 'IfcPlate', 'IfcMember', 'IfcPile', 'IfcFooting',
  'IfcCovering', 'IfcBuildingElementProxy',
  // MEP
  'IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting',
  'IfcCableSegment', 'IfcCableFitting', 'IfcFlowTerminal',
  'IfcEnergyConversionDevice', 'IfcFlowController', 'IfcFlowStorageDevice',
];

export const ALL_QUANTITY_TYPES: QuantityType[] = [
  'area', 'volume', 'length', 'count', 'weight',
];

export const ALL_SCHEMA_VERSIONS: IfcSchemaVersion[] = [
  'IFC2X3', 'IFC4', 'IFC4X3',
];

export const ALL_MEASUREMENT_UNITS: MeasurementUnit[] = [
  'm²', 'm³', 'm', 'nr', 'kg', 'item',
];

export const ALL_TRADE_SECTIONS: AsaqsTradeSection[] = [
  'Preliminaries', 'Earthworks', 'Concrete', 'Formwork',
  'Reinforcement', 'Masonry', 'Waterproofing', 'Roofwork',
  'Carpentry and Joinery', 'Ceilings and Partitions',
  'Floor Coverings', 'Glazing', 'Ironmongery',
  'Plumbing and Drainage', 'Electrical', 'Painting',
  'Unclassified',
];

export const ALL_VALIDATION_SEVERITIES: ValidationSeverity[] = [
  'error', 'warning', 'info',
];

export const ALL_FINDING_TYPES: ValidationFindingType[] = [
  'missing_quantities', 'unclassified_element', 'missing_material',
  'duplicate_globalid', 'out_of_bounds_quantity',
  'no_extractable_quantities', 'parse_warning',
];

const PREDEFINED_TYPES = [
  'PARTITIONING', 'SHEAR', 'STANDARD', 'POLYGONAL',
  'BASESLAB', 'FLOOR', 'ROOF', 'LANDING',
  'USERDEFINED', 'NOTDEFINED',
];

const MATERIAL_NAMES = [
  'Concrete 30MPa', 'Face Brick', 'Clay Brick', 'Steel',
  'Timber', 'Glass', 'Aluminium', 'Plasterboard',
  'Insulation', 'Waterproofing Membrane', 'Copper Pipe',
  'PVC', 'Granite', 'Sandstone', 'Cement Plaster',
];

const CLASSIFICATION_SYSTEMS = ['Uniclass', 'OmniClass', 'MasterFormat', 'CI/SfB'];

const QUANTITY_NAMES: Record<QuantityType, string[]> = {
  area: ['NetSideArea', 'GrossSideArea', 'NetFloorArea', 'GrossFloorArea', 'NetCeilingArea'],
  volume: ['GrossVolume', 'NetVolume', 'GrossVolumeWithOpenings'],
  length: ['Length', 'Width', 'Height', 'Perimeter', 'NominalLength'],
  count: ['Count', 'NumberOfRisers', 'NumberOfTreads'],
  weight: ['GrossWeight', 'NetWeight'],
};

const SI_UNITS: Record<QuantityType, string> = {
  area: 'm²',
  volume: 'm³',
  length: 'm',
  count: 'nr',
  weight: 'kg',
};

// ─── Primitive Arbitraries ──────────────────────────────────────────────────

/**
 * Generates a valid IFC GlobalId (22-character base64-encoded GUID).
 */
export const arbGlobalId: fc.Arbitrary<string> = fc.string({
  minLength: 22,
  maxLength: 22,
  unit: fc.constantFrom(
    ...'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'.split('')
  ),
});

/**
 * Generates a supported IFC entity type.
 */
export const arbIfcEntityType: fc.Arbitrary<IfcEntityType> =
  fc.constantFrom(...ALL_IFC_ENTITY_TYPES);

/**
 * Generates a quantity type (area, volume, length, count, weight).
 */
export const arbQuantityType: fc.Arbitrary<QuantityType> =
  fc.constantFrom(...ALL_QUANTITY_TYPES);

/**
 * Generates a valid IFC schema version.
 */
export const arbSchemaVersion: fc.Arbitrary<IfcSchemaVersion> =
  fc.constantFrom(...ALL_SCHEMA_VERSIONS);

/**
 * Generates a measurement unit.
 */
export const arbMeasurementUnit: fc.Arbitrary<MeasurementUnit> =
  fc.constantFrom(...ALL_MEASUREMENT_UNITS);

/**
 * Generates a trade section.
 */
export const arbTradeSection: fc.Arbitrary<AsaqsTradeSection> =
  fc.constantFrom(...ALL_TRADE_SECTIONS);

/**
 * Generates a positive quantity value in realistic range.
 */
export const arbQuantityValue: fc.Arbitrary<number> =
  fc.double({ min: 0.001, max: 99999, noNaN: true, noDefaultInfinity: true });

/**
 * Generates an out-of-bounds quantity value that should trigger flagging.
 */
export const arbOutOfBoundsQuantityValue = (type: QuantityType): fc.Arbitrary<number> => {
  const bounds: Record<QuantityType, number> = {
    area: 100_000,
    volume: 1_000_000,
    length: 10_000,
    weight: 10_000_000,
    count: Number.MAX_SAFE_INTEGER,
  };
  return fc.oneof(
    fc.double({ min: -99999, max: -0.001, noNaN: true, noDefaultInfinity: true }),
    fc.double({ min: bounds[type] + 1, max: bounds[type] * 10, noNaN: true, noDefaultInfinity: true })
  );
};

// ─── Composite Arbitraries ──────────────────────────────────────────────────

/**
 * Generates an IFC classification reference.
 */
export const arbIfcClassification: fc.Arbitrary<IfcClassification> = fc.record({
  systemName: fc.constantFrom(...CLASSIFICATION_SYSTEMS),
  code: fc.string({
    minLength: 3,
    maxLength: 12,
    unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.'.split('')),
  }),
  description: fc.lorem({ maxCount: 4, mode: 'sentences' }),
});

/**
 * Generates a material layer with realistic properties.
 */
export const arbMaterialLayer: fc.Arbitrary<MaterialLayer> = fc.record({
  materialName: fc.constantFrom(...MATERIAL_NAMES),
  thicknessMm: fc.double({ min: 0.5, max: 500, noNaN: true, noDefaultInfinity: true }),
  category: fc.option(fc.constantFrom(
    'Concrete', 'Masonry', 'Metal', 'Wood', 'Glass', 'Insulation', 'Membrane'
  ), { nil: undefined }),
});

/**
 * Generates a single extracted quantity value.
 */
export const arbExtractedQuantity: fc.Arbitrary<ExtractedQuantity> =
  arbQuantityType.chain((type) =>
    fc.record({
      name: fc.constantFrom(...QUANTITY_NAMES[type]),
      type: fc.constant(type),
      value: arbQuantityValue,
      unit: fc.constant(SI_UNITS[type]),
      sourceElementGlobalId: arbGlobalId,
      sourceSetName: fc.constantFrom(
        'BaseQuantities', 'Qto_WallBaseQuantities',
        'Qto_SlabBaseQuantities', 'Qto_ColumnBaseQuantities',
        'CustomQuantities'
      ),
    })
  );

/**
 * Generates an element quantity set (group of quantities from the same source set).
 */
export const arbElementQuantitySet: fc.Arbitrary<ElementQuantitySet> = fc.record({
  setName: fc.constantFrom(
    'BaseQuantities', 'Qto_WallBaseQuantities',
    'Qto_SlabBaseQuantities', 'Qto_ColumnBaseQuantities',
    'Qto_BeamBaseQuantities', 'CustomQuantities'
  ),
  quantities: fc.array(arbExtractedQuantity, { minLength: 1, maxLength: 5 }),
});

/**
 * Generates a property value (typed or raw).
 */
export const arbPropertyValue: fc.Arbitrary<PropertyValue> = fc.oneof(
  fc.record({
    name: fc.constantFrom(
      'FireRating', 'AcousticRating', 'ThermalTransmittance',
      'IsExternal', 'LoadBearing', 'Reference', 'Status'
    ),
    value: fc.oneof(
      fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom('REI 60', 'REI 90', 'REI 120', '45 dB', '50 dB'),
      fc.boolean()
    ) as fc.Arbitrary<string | number | boolean>,
    unit: fc.option(fc.constantFrom('W/(m²·K)', 'dB', 'min', 'mm'), { nil: undefined }),
    parseWarning: fc.constant(undefined) as fc.Arbitrary<boolean | undefined>,
  }),
  // Property with parse warning (raw value preserved)
  fc.record({
    name: fc.constantFrom('FireRating', 'ThermalTransmittance', 'AcousticRating'),
    value: fc.constant('N/A') as fc.Arbitrary<string | number | boolean>,
    rawValue: fc.constantFrom('N/A', 'unknown', '#ERR', '---'),
    unit: fc.constant(undefined) as fc.Arbitrary<string | undefined>,
    parseWarning: fc.constant(true) as fc.Arbitrary<boolean | undefined>,
  }),
);

/**
 * Generates a property set (recognised or custom).
 */
export const arbPropertySet: fc.Arbitrary<PropertySet> = fc.oneof(
  // Recognised property set
  fc.record({
    setName: fc.constantFrom(
      'Pset_WallCommon', 'Pset_SlabCommon', 'Pset_ColumnCommon',
      'Pset_DoorCommon', 'Pset_WindowCommon', 'Pset_BeamCommon',
      'Pset_RoofCommon', 'Pset_CoveringCommon'
    ),
    isRecognised: fc.constant(true),
    properties: fc.array(arbPropertyValue, { minLength: 1, maxLength: 6 }),
  }),
  // Custom property set
  fc.record({
    setName: fc.string({ minLength: 5, maxLength: 30 }).map((s) => `Custom_${s}`),
    isRecognised: fc.constant(false),
    properties: fc.array(arbPropertyValue, { minLength: 1, maxLength: 4 }),
  }),
);

/**
 * Generates a full IFC element with all properties.
 */
export const arbIfcElement: fc.Arbitrary<IfcElement> = fc.record({
  globalId: arbGlobalId,
  entityType: arbIfcEntityType,
  name: fc.lorem({ maxCount: 3, mode: 'words' }),
  predefinedType: fc.option(fc.constantFrom(...PREDEFINED_TYPES), { nil: undefined }),
  spatialContainment: arbGlobalId,
  classification: fc.option(arbIfcClassification, { nil: undefined }),
  materials: fc.array(arbMaterialLayer, { minLength: 0, maxLength: 4 }),
  quantitySets: fc.array(arbElementQuantitySet, { minLength: 0, maxLength: 3 }),
  propertySets: fc.array(arbPropertySet, { minLength: 0, maxLength: 4 }),
  hasGeometry: fc.boolean(),
  taggedMetadata: fc.constant({} as Record<string, string | number>),
});

/**
 * Generates an IFC element that definitely has quantity sets (for extraction tests).
 */
export const arbIfcElementWithQuantities: fc.Arbitrary<IfcElement> =
  arbIfcElement.map((el) => ({
    ...el,
    quantitySets: el.quantitySets.length > 0
      ? el.quantitySets
      : [{ setName: 'BaseQuantities', quantities: [{ name: 'GrossVolume', type: 'volume' as QuantityType, value: 1.5, unit: 'm³', sourceElementGlobalId: el.globalId, sourceSetName: 'BaseQuantities' }] }],
    hasGeometry: true,
  }));

/**
 * Generates an IFC element without quantity sets (for validation tests).
 */
export const arbIfcElementWithoutQuantities: fc.Arbitrary<IfcElement> =
  arbIfcElement.map((el) => ({
    ...el,
    quantitySets: [],
    hasGeometry: true,
  }));

/**
 * Generates an unclassified IfcBuildingElementProxy (for validation tests).
 */
export const arbUnclassifiedProxy: fc.Arbitrary<IfcElement> =
  arbIfcElement.map((el) => ({
    ...el,
    entityType: 'IfcBuildingElementProxy' as IfcEntityType,
    classification: undefined,
  }));

// ─── Mapping Rule Arbitrary ─────────────────────────────────────────────────

/**
 * Generates a mapping rule with configurable scope and specificity.
 */
export const arbMappingRule: fc.Arbitrary<MappingRule> = fc.record({
  ruleId: fc.uuid(),
  ifcEntityType: arbIfcEntityType,
  predefinedType: fc.option(fc.constantFrom(...PREDEFINED_TYPES), { nil: undefined }),
  classificationCode: fc.option(
    fc.string({
      minLength: 3,
      maxLength: 12,
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.'.split('')),
    }),
    { nil: undefined }
  ),
  tradeSection: fc.constantFrom(
    ...ALL_TRADE_SECTIONS.filter((s) => s !== 'Unclassified')
  ) as fc.Arbitrary<AsaqsTradeSection>,
  tradeSectionCode: fc.constantFrom(
    '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'
  ),
  measurementUnit: arbMeasurementUnit,
  description: fc.option(fc.lorem({ maxCount: 5, mode: 'sentences' }), { nil: undefined }),
  scope: fc.constantFrom('default', 'firm', 'project') as fc.Arbitrary<'default' | 'firm' | 'project'>,
  scopeId: fc.option(fc.uuid(), { nil: undefined }),
  createdBy: fc.option(fc.uuid(), { nil: undefined }),
  createdAt: fc.option(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString()),
    { nil: undefined }
  ),
  updatedAt: fc.option(
    fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') }).map((d) => d.toISOString()),
    { nil: undefined }
  ),
});

/**
 * Generates a mapping rule that exactly matches a given element (guaranteed match).
 */
export const arbMatchingRule = (element: IfcElement): fc.Arbitrary<MappingRule> =>
  fc.record({
    ruleId: fc.uuid(),
    ifcEntityType: fc.constant(element.entityType),
    predefinedType: fc.constant(element.predefinedType),
    classificationCode: fc.constant(element.classification?.code),
    tradeSection: fc.constantFrom(
      ...ALL_TRADE_SECTIONS.filter((s) => s !== 'Unclassified')
    ) as fc.Arbitrary<AsaqsTradeSection>,
    tradeSectionCode: fc.constantFrom(
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'
    ),
    measurementUnit: arbMeasurementUnit,
    description: fc.option(fc.lorem({ maxCount: 3, mode: 'sentences' }), { nil: undefined }),
    scope: fc.constantFrom('default', 'firm', 'project') as fc.Arbitrary<'default' | 'firm' | 'project'>,
    scopeId: fc.option(fc.uuid(), { nil: undefined }),
    createdBy: fc.option(fc.uuid(), { nil: undefined }),
    createdAt: fc.constant(undefined) as fc.Arbitrary<string | undefined>,
    updatedAt: fc.constant(undefined) as fc.Arbitrary<string | undefined>,
  });

// ─── BoQ Document Arbitrary ─────────────────────────────────────────────────

/**
 * Generates a BoQ line item.
 */
export const arbBoqLineItem: fc.Arbitrary<BoqLineItem> = fc.record({
  itemNumber: fc.string({
    minLength: 3,
    maxLength: 6,
    unit: fc.constantFrom(...'0123456789.'.split('')),
  }),
  description: fc.lorem({ maxCount: 8, mode: 'sentences' }),
  unit: arbMeasurementUnit,
  quantity: fc.double({ min: 0.01, max: 99999, noNaN: true, noDefaultInfinity: true })
    .map((v) => Math.round(v * 100) / 100),
  rate: fc.constant(undefined) as fc.Arbitrary<number | undefined>,
  amount: fc.constant(undefined) as fc.Arbitrary<number | undefined>,
  sourceElementCount: fc.nat({ max: 200 }),
  sourceElementGlobalIds: fc.array(arbGlobalId, { minLength: 1, maxLength: 10 }),
  elementType: arbIfcEntityType,
  material: fc.option(fc.constantFrom(...MATERIAL_NAMES), { nil: undefined }),
  specForgeItemId: fc.option(fc.uuid(), { nil: undefined }),
});

/**
 * Generates a BoQ section with trade section and line items.
 */
export const arbBoqSection: fc.Arbitrary<BoqSection> = fc.record({
  sectionNumber: fc.constantFrom('1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'),
  tradeSection: fc.constantFrom(
    ...ALL_TRADE_SECTIONS.filter((s) => s !== 'Unclassified')
  ) as fc.Arbitrary<AsaqsTradeSection>,
  title: fc.lorem({ maxCount: 3, mode: 'words' }),
  lineItems: fc.array(arbBoqLineItem, { minLength: 1, maxLength: 8 }),
  subtotal: fc.option(
    fc.double({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
    { nil: undefined }
  ),
});

/**
 * Generates a flagged element summary entry.
 */
export const arbFlaggedElementSummary: fc.Arbitrary<FlaggedElementSummary> = fc.record({
  globalId: arbGlobalId,
  elementType: arbIfcEntityType,
  findingType: fc.constantFrom(
    'missing_quantities', 'unclassified_element'
  ) as fc.Arbitrary<ValidationFindingType>,
  message: fc.lorem({ maxCount: 5, mode: 'sentences' }),
});

/**
 * Generates a complete BoQ document.
 */
export const arbBoqDocument: fc.Arbitrary<BoqDocument> = fc.record({
  boqId: fc.uuid(),
  projectId: fc.uuid(),
  extractionId: fc.uuid(),
  title: fc.lorem({ maxCount: 4, mode: 'words' }),
  status: fc.constantFrom('draft', 'issued', 'superseded') as fc.Arbitrary<'draft' | 'issued' | 'superseded'>,
  revision: fc.constantFrom('A', 'B', 'C', '1', '2', '3'),
  generatedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })
    .map((d) => d.toISOString()),
  generatedBy: fc.uuid(),
  currency: fc.constant('ZAR'),
  sections: fc.array(arbBoqSection, { minLength: 1, maxLength: 6 }),
  flaggedElementsSummary: fc.array(arbFlaggedElementSummary, { minLength: 0, maxLength: 5 }),
  totals: fc.record({
    totalLineItems: fc.nat({ max: 500 }),
    totalSections: fc.nat({ max: 15 }),
    totalElements: fc.nat({ max: 10000 }),
  }) as fc.Arbitrary<BoqTotals>,
});

// ─── Mapped Element Arbitrary ───────────────────────────────────────────────

/**
 * Generates a mapped element (element + trade section assignment).
 */
export const arbMappedElement: fc.Arbitrary<MappedElement> =
  arbIfcElement.chain((element) =>
    fc.record({
      element: fc.constant(element),
      tradeSection: arbTradeSection,
      tradeSectionCode: fc.constantFrom(
        '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '99'
      ),
      measurementUnit: arbMeasurementUnit,
      matchedRuleId: fc.uuid(),
      isUnclassified: fc.constant(false),
    })
  );

// ─── Spatial & Model Arbitraries ────────────────────────────────────────────

/**
 * Generates a spatial node (one level deep for simplicity).
 */
export const arbSpatialNode: fc.Arbitrary<SpatialNode> = fc.record({
  globalId: arbGlobalId,
  name: fc.lorem({ maxCount: 2, mode: 'words' }),
  type: fc.constantFrom(
    'IfcProject', 'IfcSite', 'IfcBuilding', 'IfcBuildingStorey'
  ) as fc.Arbitrary<SpatialNode['type']>,
  children: fc.constant([] as SpatialNode[]),
  elementIds: fc.array(arbGlobalId, { minLength: 0, maxLength: 10 }),
});

/**
 * Generates a parsed IFC model with configurable elements.
 */
export const arbParsedIfcModel: fc.Arbitrary<ParsedIfcModel> =
  fc.array(arbIfcElement, { minLength: 1, maxLength: 20 }).chain((elements) =>
    fc.record({
      fileId: fc.uuid(),
      fileName: fc.lorem({ maxCount: 2, mode: 'words' }).map((s) => `${s.replace(/\s/g, '-')}.ifc`),
      schemaVersion: arbSchemaVersion,
      parsedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })
        .map((d) => d.toISOString()),
      spatialHierarchy: arbSpatialNode,
      elements: fc.constant(elements),
      elementCount: fc.constant(elements.length),
    })
  );

// ─── Validation Arbitraries ─────────────────────────────────────────────────

/**
 * Generates a validation finding.
 */
export const arbValidationFinding: fc.Arbitrary<ValidationFinding> = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom(...ALL_FINDING_TYPES),
  severity: fc.constantFrom(...ALL_VALIDATION_SEVERITIES),
  message: fc.lorem({ maxCount: 6, mode: 'sentences' }),
  elementGlobalId: fc.option(arbGlobalId, { nil: undefined }),
  elementType: fc.option(arbIfcEntityType, { nil: undefined }),
  details: fc.constant(undefined) as fc.Arbitrary<Record<string, unknown> | undefined>,
});

/**
 * Generates model statistics.
 */
export const arbModelStatistics: fc.Arbitrary<ModelStatistics> =
  fc.nat({ max: 10000 }).chain((total) => {
    const withQty = Math.floor(total * 0.7);
    return fc.record({
      totalElements: fc.constant(total),
      elementsByType: fc.constant({ IfcWall: Math.floor(total * 0.3), IfcSlab: Math.floor(total * 0.2) } as Record<string, number>),
      elementsWithQuantities: fc.constant(withQty),
      elementsWithoutQuantities: fc.constant(total - withQty),
      unclassifiedElements: fc.nat({ max: Math.max(1, Math.floor(total * 0.1)) }),
      elementsByTradeSection: fc.constant({ Concrete: Math.floor(total * 0.25), Masonry: Math.floor(total * 0.2) } as Record<string, number>),
      quantityCoveragePercent: fc.constant(total > 0 ? (withQty / total) * 100 : 0),
    });
  });

/**
 * Generates a validation report.
 */
export const arbValidationReport: fc.Arbitrary<ValidationReport> =
  fc.array(arbValidationFinding, { minLength: 0, maxLength: 10 }).chain((findings) =>
    fc.record({
      modelId: fc.uuid(),
      findings: fc.constant(findings),
      statistics: arbModelStatistics,
      boqBlocked: fc.constant(findings.some((f) => f.severity === 'error')),
      generatedAt: fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })
        .map((d) => d.toISOString()),
    })
  );

// ─── IFC File Buffer Generators (for parser tests) ──────────────────────────

/**
 * Generates a valid IFC FILE_SCHEMA header string for a given schema version.
 */
export const arbValidFileSchemaHeader = (version?: IfcSchemaVersion): fc.Arbitrary<string> => {
  const versionArb = version
    ? fc.constant(version)
    : arbSchemaVersion;

  return versionArb.map((v) => {
    const schemaId = v === 'IFC2X3' ? 'IFC2X3'
      : v === 'IFC4' ? 'IFC4'
      : 'IFC4X3';
    return [
      'ISO-10303-21;',
      'HEADER;',
      `FILE_SCHEMA(('${schemaId}'));`,
      'ENDSEC;',
      'DATA;',
    ].join('\n');
  });
};

/**
 * Generates an invalid/malformed file buffer (for rejection tests).
 */
export const arbMalformedIfcBuffer: fc.Arbitrary<Uint8Array> = fc.oneof(
  // Random bytes (not STEP)
  fc.uint8Array({ minLength: 10, maxLength: 100 }),
  // Valid-looking STEP with unsupported schema
  fc.constantFrom(
    'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'IFC1\'));\nENDSEC;\nDATA;\n',
    'ISO-10303-21;\nHEADER;\nFILE_SCHEMA((\'UNSUPPORTED\'));\nENDSEC;\n',
    'NOT A STEP FILE AT ALL',
    '',
  ).map((s) => new TextEncoder().encode(s)),
);
