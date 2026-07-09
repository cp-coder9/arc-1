/**
 * Unit tests for Mapping Engine Service
 *
 * Tests rule application, specificity scoring, precedence logic,
 * default rules coverage, CRUD operations, and unclassified handling.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import type {
  IfcElement,
  MappingRule,
  AsaqsTradeSection,
  MeasurementUnit,
  IfcEntityType,
  RuleSpecificity,
} from '../types';
import {
  getDefaultMappingRules,
  calculateSpecificity,
  findBestRule,
  applyMappingRules,
  createMappingRule,
  updateMappingRule,
  deleteMappingRule,
  clearCustomRules,
  getCustomRules,
} from '../mappingEngineService';

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

function makeRule(overrides: Partial<MappingRule> = {}): MappingRule {
  return {
    ruleId: 'test-rule-001',
    ifcEntityType: 'IfcWall',
    tradeSection: 'Masonry',
    tradeSectionCode: '6',
    measurementUnit: 'm²',
    scope: 'default',
    ...overrides,
  };
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  clearCustomRules();
});


// ─── getDefaultMappingRules ─────────────────────────────────────────────────

describe('getDefaultMappingRules', () => {
  it('returns rules covering all 15 standard ASAQS trade sections', () => {
    const rules = getDefaultMappingRules();
    const sections = new Set(rules.map((r) => r.tradeSection));

    const expectedSections: AsaqsTradeSection[] = [
      'Earthworks', 'Concrete', 'Reinforcement', 'Masonry',
      'Roofwork', 'Carpentry and Joinery', 'Ceilings and Partitions',
      'Floor Coverings', 'Glazing', 'Ironmongery',
      'Plumbing and Drainage', 'Electrical',
    ];

    for (const section of expectedSections) {
      expect(sections.has(section)).toBe(true);
    }
  });

  it('all rules have scope "default"', () => {
    const rules = getDefaultMappingRules();
    for (const rule of rules) {
      expect(rule.scope).toBe('default');
    }
  });

  it('each rule has a valid measurement unit', () => {
    const validUnits: MeasurementUnit[] = ['m²', 'm³', 'm', 'nr', 'kg', 'item'];
    const rules = getDefaultMappingRules();
    for (const rule of rules) {
      expect(validUnits).toContain(rule.measurementUnit);
    }
  });

  it('maps concrete elements (slab, column, beam, stair, footing) to m³', () => {
    const rules = getDefaultMappingRules();
    const concreteTypes: IfcEntityType[] = ['IfcSlab', 'IfcColumn', 'IfcBeam', 'IfcStair', 'IfcFooting'];
    for (const type of concreteTypes) {
      const match = rules.find((r) => r.ifcEntityType === type);
      expect(match).toBeDefined();
      expect(match!.tradeSection).toBe('Concrete');
      expect(match!.measurementUnit).toBe('m³');
    }
  });


  it('maps walls to Masonry m²', () => {
    const rules = getDefaultMappingRules();
    const wallRule = rules.find((r) => r.ifcEntityType === 'IfcWall');
    expect(wallRule).toBeDefined();
    expect(wallRule!.tradeSection).toBe('Masonry');
    expect(wallRule!.measurementUnit).toBe('m²');
  });

  it('maps doors to Carpentry and Joinery nr', () => {
    const rules = getDefaultMappingRules();
    const doorRule = rules.find((r) => r.ifcEntityType === 'IfcDoor');
    expect(doorRule).toBeDefined();
    expect(doorRule!.tradeSection).toBe('Carpentry and Joinery');
    expect(doorRule!.measurementUnit).toBe('nr');
  });

  it('maps windows to Glazing nr', () => {
    const rules = getDefaultMappingRules();
    const windowRule = rules.find((r) => r.ifcEntityType === 'IfcWindow');
    expect(windowRule).toBeDefined();
    expect(windowRule!.tradeSection).toBe('Glazing');
    expect(windowRule!.measurementUnit).toBe('nr');
  });

  it('maps pipe/duct segments to Plumbing and Drainage m', () => {
    const rules = getDefaultMappingRules();
    const pipeTypes: IfcEntityType[] = ['IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting'];
    for (const type of pipeTypes) {
      const match = rules.find((r) => r.ifcEntityType === type);
      expect(match).toBeDefined();
      expect(match!.tradeSection).toBe('Plumbing and Drainage');
      expect(match!.measurementUnit).toBe('m');
    }
  });

  it('maps cable segments to Electrical m', () => {
    const rules = getDefaultMappingRules();
    const cableTypes: IfcEntityType[] = ['IfcCableSegment', 'IfcCableFitting'];
    for (const type of cableTypes) {
      const match = rules.find((r) => r.ifcEntityType === type);
      expect(match).toBeDefined();
      expect(match!.tradeSection).toBe('Electrical');
      expect(match!.measurementUnit).toBe('m');
    }
  });

  it('maps IfcRailing to Ironmongery m', () => {
    const rules = getDefaultMappingRules();
    const match = rules.find((r) => r.ifcEntityType === 'IfcRailing');
    expect(match).toBeDefined();
    expect(match!.tradeSection).toBe('Ironmongery');
    expect(match!.measurementUnit).toBe('m');
  });

  it('maps IfcMember to Reinforcement kg', () => {
    const rules = getDefaultMappingRules();
    const match = rules.find((r) => r.ifcEntityType === 'IfcMember');
    expect(match).toBeDefined();
    expect(match!.tradeSection).toBe('Reinforcement');
    expect(match!.measurementUnit).toBe('kg');
  });
});


// ─── calculateSpecificity ───────────────────────────────────────────────────

describe('calculateSpecificity', () => {
  it('returns 1 for type-only match', () => {
    const element = makeElement({ entityType: 'IfcWall' });
    const rule = makeRule({ ifcEntityType: 'IfcWall' });
    expect(calculateSpecificity(rule, element)).toBe(1);
  });

  it('returns 2 for type + predefinedType match', () => {
    const element = makeElement({ entityType: 'IfcWall', predefinedType: 'PARTITIONING' });
    const rule = makeRule({ ifcEntityType: 'IfcWall', predefinedType: 'PARTITIONING' });
    expect(calculateSpecificity(rule, element)).toBe(2);
  });

  it('returns 2 for type + classification match', () => {
    const element = makeElement({
      entityType: 'IfcWall',
      classification: { systemName: 'Uniclass', code: 'Ss_25', description: 'Wall systems' },
    });
    const rule = makeRule({ ifcEntityType: 'IfcWall', classificationCode: 'Ss_25' });
    expect(calculateSpecificity(rule, element)).toBe(2);
  });

  it('returns 3 for type + predefinedType + classification match', () => {
    const element = makeElement({
      entityType: 'IfcWall',
      predefinedType: 'SHEAR',
      classification: { systemName: 'Uniclass', code: 'Ss_25_10', description: 'Shear walls' },
    });
    const rule = makeRule({
      ifcEntityType: 'IfcWall',
      predefinedType: 'SHEAR',
      classificationCode: 'Ss_25_10',
    });
    expect(calculateSpecificity(rule, element)).toBe(3);
  });

  it('returns 0 when entity type does not match', () => {
    const element = makeElement({ entityType: 'IfcSlab' });
    const rule = makeRule({ ifcEntityType: 'IfcWall' });
    expect(calculateSpecificity(rule, element)).toBe(0);
  });

  it('returns 0 when predefinedType does not match', () => {
    const element = makeElement({ entityType: 'IfcWall', predefinedType: 'PARTITIONING' });
    const rule = makeRule({ ifcEntityType: 'IfcWall', predefinedType: 'SHEAR' });
    expect(calculateSpecificity(rule, element)).toBe(0);
  });

  it('returns 0 when classification does not match', () => {
    const element = makeElement({
      entityType: 'IfcWall',
      classification: { systemName: 'Uniclass', code: 'Ss_25', description: 'Walls' },
    });
    const rule = makeRule({ ifcEntityType: 'IfcWall', classificationCode: 'Ss_30' });
    expect(calculateSpecificity(rule, element)).toBe(0);
  });
});


// ─── findBestRule ───────────────────────────────────────────────────────────

describe('findBestRule', () => {
  it('returns null when no rules match', () => {
    const element = makeElement({ entityType: 'IfcBuildingElementProxy' });
    const rules = [makeRule({ ifcEntityType: 'IfcWall' })];
    expect(findBestRule(element, rules)).toBeNull();
  });

  it('selects the most specific rule (specificity 3 > 2 > 1)', () => {
    const element = makeElement({
      entityType: 'IfcWall',
      predefinedType: 'SHEAR',
      classification: { systemName: 'Uniclass', code: 'Ss_25_10', description: 'Shear walls' },
    });

    const typeOnly = makeRule({ ruleId: 'r1', ifcEntityType: 'IfcWall', tradeSection: 'Masonry' });
    const typePredefined = makeRule({
      ruleId: 'r2',
      ifcEntityType: 'IfcWall',
      predefinedType: 'SHEAR',
      tradeSection: 'Concrete',
    });
    const typeAll = makeRule({
      ruleId: 'r3',
      ifcEntityType: 'IfcWall',
      predefinedType: 'SHEAR',
      classificationCode: 'Ss_25_10',
      tradeSection: 'Reinforcement',
    });

    const best = findBestRule(element, [typeOnly, typePredefined, typeAll]);
    expect(best).not.toBeNull();
    expect(best!.ruleId).toBe('r3');
    expect(best!.tradeSection).toBe('Reinforcement');
  });

  it('at equal specificity, custom (project) wins over default', () => {
    const element = makeElement({ entityType: 'IfcWall' });

    const defaultRule = makeRule({ ruleId: 'r-default', scope: 'default', tradeSection: 'Masonry' });
    const projectRule = makeRule({ ruleId: 'r-project', scope: 'project', tradeSection: 'Concrete' });

    const best = findBestRule(element, [defaultRule, projectRule]);
    expect(best!.ruleId).toBe('r-project');
    expect(best!.tradeSection).toBe('Concrete');
  });

  it('at equal specificity, firm scope wins over default', () => {
    const element = makeElement({ entityType: 'IfcSlab' });

    const defaultRule = makeRule({ ruleId: 'r-default', ifcEntityType: 'IfcSlab', scope: 'default' });
    const firmRule = makeRule({ ruleId: 'r-firm', ifcEntityType: 'IfcSlab', scope: 'firm', tradeSection: 'Formwork' });

    const best = findBestRule(element, [defaultRule, firmRule]);
    expect(best!.ruleId).toBe('r-firm');
  });

  it('at equal specificity, project scope wins over firm', () => {
    const element = makeElement({ entityType: 'IfcColumn' });

    const firmRule = makeRule({ ruleId: 'r-firm', ifcEntityType: 'IfcColumn', scope: 'firm' });
    const projectRule = makeRule({ ruleId: 'r-project', ifcEntityType: 'IfcColumn', scope: 'project' });

    const best = findBestRule(element, [firmRule, projectRule]);
    expect(best!.ruleId).toBe('r-project');
  });

  it('higher specificity wins regardless of scope', () => {
    const element = makeElement({
      entityType: 'IfcWall',
      predefinedType: 'PARTITIONING',
    });

    const projectTypeOnly = makeRule({ ruleId: 'r-project', scope: 'project', tradeSection: 'Masonry' });
    const defaultSpecific = makeRule({
      ruleId: 'r-default-specific',
      scope: 'default',
      predefinedType: 'PARTITIONING',
      tradeSection: 'Ceilings and Partitions',
    });

    const best = findBestRule(element, [projectTypeOnly, defaultSpecific]);
    expect(best!.ruleId).toBe('r-default-specific');
  });
});


// ─── applyMappingRules ──────────────────────────────────────────────────────

describe('applyMappingRules', () => {
  it('returns one MappedElement per input element', () => {
    const elements: IfcElement[] = [
      makeElement({ globalId: 'e1', entityType: 'IfcWall' }),
      makeElement({ globalId: 'e2', entityType: 'IfcSlab' }),
      makeElement({ globalId: 'e3', entityType: 'IfcDoor' }),
    ];
    const rules = getDefaultMappingRules();
    const result = applyMappingRules(elements, rules);
    expect(result).toHaveLength(3);
  });

  it('assigns matched elements to their trade section', () => {
    const elements = [makeElement({ entityType: 'IfcSlab' })];
    const rules = getDefaultMappingRules();
    const result = applyMappingRules(elements, rules);
    expect(result[0].tradeSection).toBe('Concrete');
    expect(result[0].measurementUnit).toBe('m³');
    expect(result[0].isUnclassified).toBe(false);
  });

  it('assigns unmatched elements to "Unclassified" with isUnclassified=true', () => {
    const elements = [makeElement({ entityType: 'IfcBuildingElementProxy' })];
    const rules = getDefaultMappingRules();
    const result = applyMappingRules(elements, rules);
    expect(result[0].tradeSection).toBe('Unclassified');
    expect(result[0].isUnclassified).toBe(true);
  });

  it('handles empty elements array', () => {
    const result = applyMappingRules([], getDefaultMappingRules());
    expect(result).toHaveLength(0);
  });

  it('handles empty rules array — all elements become unclassified', () => {
    const elements = [
      makeElement({ entityType: 'IfcWall' }),
      makeElement({ entityType: 'IfcSlab' }),
    ];
    const result = applyMappingRules(elements, []);
    expect(result.every((r) => r.isUnclassified)).toBe(true);
    expect(result.every((r) => r.tradeSection === 'Unclassified')).toBe(true);
  });

  it('correctly maps a mixed set of elements', () => {
    const elements: IfcElement[] = [
      makeElement({ globalId: 'w1', entityType: 'IfcWall' }),
      makeElement({ globalId: 's1', entityType: 'IfcSlab' }),
      makeElement({ globalId: 'd1', entityType: 'IfcDoor' }),
      makeElement({ globalId: 'p1', entityType: 'IfcPipeSegment' }),
      makeElement({ globalId: 'c1', entityType: 'IfcCableSegment' }),
      makeElement({ globalId: 'x1', entityType: 'IfcBuildingElementProxy' }),
    ];
    const rules = getDefaultMappingRules();
    const result = applyMappingRules(elements, rules);

    expect(result[0].tradeSection).toBe('Masonry');
    expect(result[1].tradeSection).toBe('Concrete');
    expect(result[2].tradeSection).toBe('Carpentry and Joinery');
    expect(result[3].tradeSection).toBe('Plumbing and Drainage');
    expect(result[4].tradeSection).toBe('Electrical');
    expect(result[5].tradeSection).toBe('Unclassified');
  });

  it('preserves the element reference in MappedElement', () => {
    const element = makeElement({ globalId: 'my-element', entityType: 'IfcWindow' });
    const result = applyMappingRules([element], getDefaultMappingRules());
    expect(result[0].element).toBe(element);
    expect(result[0].element.globalId).toBe('my-element');
  });
});


// ─── CRUD Operations ────────────────────────────────────────────────────────

describe('createMappingRule', () => {
  it('creates a rule with a generated UUID ruleId', () => {
    const result = createMappingRule({
      ifcEntityType: 'IfcWall',
      predefinedType: 'PARTITIONING',
      tradeSection: 'Ceilings and Partitions',
      tradeSectionCode: '10',
      measurementUnit: 'm²',
      scope: 'project',
      scopeId: 'proj-123',
    });

    expect(result.ruleId).toBeDefined();
    expect(result.ruleId.length).toBeGreaterThan(0);
    expect(result.ifcEntityType).toBe('IfcWall');
    expect(result.predefinedType).toBe('PARTITIONING');
    expect(result.tradeSection).toBe('Ceilings and Partitions');
    expect(result.scope).toBe('project');
  });

  it('sets createdAt and updatedAt as ISO timestamps', () => {
    const before = new Date().toISOString();
    const result = createMappingRule({
      ifcEntityType: 'IfcSlab',
      tradeSection: 'Concrete',
      tradeSectionCode: '3',
      measurementUnit: 'm³',
      scope: 'firm',
    });
    const after = new Date().toISOString();

    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
    expect(result.createdAt! >= before).toBe(true);
    expect(result.createdAt! <= after).toBe(true);
  });

  it('stores the rule in the in-memory store', () => {
    const result = createMappingRule({
      ifcEntityType: 'IfcColumn',
      tradeSection: 'Concrete',
      tradeSectionCode: '3',
      measurementUnit: 'm³',
      scope: 'default',
    });

    const stored = getCustomRules();
    expect(stored).toHaveLength(1);
    expect(stored[0].ruleId).toBe(result.ruleId);
  });
});

describe('updateMappingRule', () => {
  it('updates specified fields and sets updatedAt', () => {
    const created = createMappingRule({
      ifcEntityType: 'IfcWall',
      tradeSection: 'Masonry',
      tradeSectionCode: '6',
      measurementUnit: 'm²',
      scope: 'project',
    });

    const updated = updateMappingRule(created.ruleId, {
      tradeSection: 'Concrete',
      tradeSectionCode: '3',
      measurementUnit: 'm³',
    });

    expect(updated.ruleId).toBe(created.ruleId);
    expect(updated.tradeSection).toBe('Concrete');
    expect(updated.measurementUnit).toBe('m³');
    expect(updated.updatedAt).toBeDefined();
    expect(updated.updatedAt! >= created.createdAt!).toBe(true);
  });

  it('throws when rule not found', () => {
    expect(() => updateMappingRule('non-existent', { tradeSection: 'Concrete' }))
      .toThrow('Mapping rule not found: non-existent');
  });
});

describe('deleteMappingRule', () => {
  it('removes the rule from the store', () => {
    const created = createMappingRule({
      ifcEntityType: 'IfcBeam',
      tradeSection: 'Concrete',
      tradeSectionCode: '3',
      measurementUnit: 'm³',
      scope: 'firm',
    });

    expect(getCustomRules()).toHaveLength(1);
    deleteMappingRule(created.ruleId);
    expect(getCustomRules()).toHaveLength(0);
  });

  it('throws when rule not found', () => {
    expect(() => deleteMappingRule('non-existent'))
      .toThrow('Mapping rule not found: non-existent');
  });
});
