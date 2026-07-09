/**
 * Mapping Engine Service — BIM/IFC Quantity Extraction Bridge
 *
 * Applies trade section mapping rules to extracted IFC elements, assigning each
 * element to an ASAQS trade section with a measurement unit. Supports configurable
 * precedence (specificity scoring) and custom rule overlays per project/firm.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import { randomUUID } from 'node:crypto';
import type {
  MappingRule,
  IfcElement,
  MappedElement,
  AsaqsTradeSection,
  MeasurementUnit,
  RuleSpecificity,
  IfcEntityType,
} from './types';

// ─── In-Memory Rule Store (Firestore later) ─────────────────────────────────

const customRulesStore: Map<string, MappingRule> = new Map();

// ─── Default ASAQS Mapping Rules ────────────────────────────────────────────

/**
 * Returns the default ASAQS mapping rules covering all 15 standard trade sections.
 * Each rule maps an IFC entity type to a trade section with the conventional
 * measurement unit per ASAQS Standard System of Measuring Building Work.
 */
export function getDefaultMappingRules(): MappingRule[] {
  return [
    // Masonry
    rule('default-wall', 'IfcWall', 'Masonry', '6', 'm²', 'Brick/block walls measured in m²'),
    rule('default-wall-std', 'IfcWallStandardCase', 'Masonry', '6', 'm²', 'Standard case walls measured in m²'),

    // Concrete
    rule('default-slab', 'IfcSlab', 'Concrete', '3', 'm³', 'Concrete slabs measured in m³'),
    rule('default-column', 'IfcColumn', 'Concrete', '3', 'm³', 'Concrete columns measured in m³'),
    rule('default-beam', 'IfcBeam', 'Concrete', '3', 'm³', 'Concrete beams measured in m³'),
    rule('default-stair', 'IfcStair', 'Concrete', '3', 'm³', 'Concrete stairs measured in m³'),
    rule('default-footing', 'IfcFooting', 'Concrete', '3', 'm³', 'Concrete footings measured in m³'),

    // Carpentry and Joinery
    rule('default-door', 'IfcDoor', 'Carpentry and Joinery', '9', 'nr', 'Doors enumerated'),

    // Glazing
    rule('default-window', 'IfcWindow', 'Glazing', '12', 'nr', 'Windows enumerated'),
    rule('default-curtain-wall', 'IfcCurtainWall', 'Glazing', '12', 'm²', 'Curtain walls measured in m²'),

    // Roofwork
    rule('default-roof', 'IfcRoof', 'Roofwork', '8', 'm²', 'Roofing measured in m²'),

    // Ironmongery
    rule('default-railing', 'IfcRailing', 'Ironmongery', '13', 'm', 'Railings measured in linear metres'),

    // Ceilings and Partitions
    rule('default-plate', 'IfcPlate', 'Ceilings and Partitions', '10', 'm²', 'Plates/cladding measured in m²'),

    // Reinforcement
    rule('default-member', 'IfcMember', 'Reinforcement', '5', 'kg', 'Structural members (reinforcement) measured in kg'),

    // Earthworks
    rule('default-pile', 'IfcPile', 'Earthworks', '2', 'm', 'Piles measured in linear metres'),

    // Floor Coverings
    rule('default-covering', 'IfcCovering', 'Floor Coverings', '11', 'm²', 'Floor coverings measured in m²'),

    // Plumbing and Drainage
    rule('default-pipe-segment', 'IfcPipeSegment', 'Plumbing and Drainage', '14', 'm', 'Pipe segments measured in linear metres'),
    rule('default-pipe-fitting', 'IfcPipeFitting', 'Plumbing and Drainage', '14', 'm', 'Pipe fittings measured in linear metres'),
    rule('default-duct-segment', 'IfcDuctSegment', 'Plumbing and Drainage', '14', 'm', 'Duct segments measured in linear metres'),
    rule('default-duct-fitting', 'IfcDuctFitting', 'Plumbing and Drainage', '14', 'm', 'Duct fittings measured in linear metres'),
    rule('default-flow-terminal', 'IfcFlowTerminal', 'Plumbing and Drainage', '14', 'nr', 'Flow terminals enumerated'),
    rule('default-flow-controller', 'IfcFlowController', 'Plumbing and Drainage', '14', 'nr', 'Flow controllers enumerated'),
    rule('default-flow-storage', 'IfcFlowStorageDevice', 'Plumbing and Drainage', '14', 'nr', 'Flow storage devices enumerated'),

    // Electrical
    rule('default-cable-segment', 'IfcCableSegment', 'Electrical', '15', 'm', 'Cable segments measured in linear metres'),
    rule('default-cable-fitting', 'IfcCableFitting', 'Electrical', '15', 'm', 'Cable fittings measured in linear metres'),
    rule('default-energy-conversion', 'IfcEnergyConversionDevice', 'Electrical', '15', 'nr', 'Energy conversion devices enumerated'),

    // IfcBuildingElementProxy — only maps if no classification exists
    // This is handled specially in findBestRule: proxy without classification → Unclassified
  ];
}

// ─── Specificity Calculation ────────────────────────────────────────────────

/**
 * Calculates the specificity score for a rule against an element.
 *
 * Specificity:
 * - type + predefinedType + classification = 3
 * - type + predefinedType = 2
 * - type + classification = 2
 * - type only = 1
 *
 * Returns the score only if the rule actually matches the element.
 * Returns 0 (cast to RuleSpecificity for internal use) if no match.
 */
export function calculateSpecificity(rule: MappingRule, element: IfcElement): RuleSpecificity {
  // Base check: entity type must match
  if (rule.ifcEntityType !== element.entityType) {
    return 0 as unknown as RuleSpecificity;
  }

  const hasPredefinedType = !!rule.predefinedType;
  const hasClassification = !!rule.classificationCode;

  // Check predefinedType match
  const predefinedTypeMatches = hasPredefinedType && rule.predefinedType === element.predefinedType;
  // Check classification code match
  const classificationMatches = hasClassification && rule.classificationCode === element.classification?.code;

  // If a rule specifies predefinedType but element doesn't match, rule doesn't apply
  if (hasPredefinedType && !predefinedTypeMatches) {
    return 0 as unknown as RuleSpecificity;
  }

  // If a rule specifies classification but element doesn't match, rule doesn't apply
  if (hasClassification && !classificationMatches) {
    return 0 as unknown as RuleSpecificity;
  }

  // Score based on matching criteria
  if (predefinedTypeMatches && classificationMatches) {
    return 3;
  }
  if (predefinedTypeMatches || classificationMatches) {
    return 2;
  }

  // Type only match
  return 1;
}

// ─── Find Best Rule ─────────────────────────────────────────────────────────

/**
 * Finds the best matching rule for an element using specificity precedence.
 *
 * Precedence:
 * 1. Highest specificity wins (3 > 2 > 1)
 * 2. At equal specificity, custom scope (project/firm) > default scope
 *
 * Returns null if no rule matches.
 */
export function findBestRule(element: IfcElement, rules: MappingRule[]): MappingRule | null {
  let bestRule: MappingRule | null = null;
  let bestSpecificity = 0;

  for (const rule of rules) {
    const specificity = calculateSpecificity(rule, element) as unknown as number;

    if (specificity === 0) continue;

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      bestRule = rule;
    } else if (specificity === bestSpecificity && bestRule) {
      // At equal specificity, custom (project/firm) wins over default
      if (getScopePriority(rule.scope) > getScopePriority(bestRule.scope)) {
        bestRule = rule;
      }
    }
  }

  return bestRule;
}

// ─── Apply Mapping Rules ────────────────────────────────────────────────────

/**
 * Applies mapping rules to all elements, assigning each to a trade section.
 * Elements that don't match any rule are assigned to "Unclassified".
 *
 * Returns one MappedElement per input element.
 */
export function applyMappingRules(
  elements: IfcElement[],
  rules: MappingRule[],
): MappedElement[] {
  return elements.map((element) => {
    const matchedRule = findBestRule(element, rules);

    if (matchedRule) {
      return {
        element,
        tradeSection: matchedRule.tradeSection,
        tradeSectionCode: matchedRule.tradeSectionCode,
        measurementUnit: matchedRule.measurementUnit,
        matchedRuleId: matchedRule.ruleId,
        isUnclassified: false,
      };
    }

    // No matching rule — assign to Unclassified
    return {
      element,
      tradeSection: 'Unclassified' as AsaqsTradeSection,
      tradeSectionCode: '99',
      measurementUnit: 'item' as MeasurementUnit,
      matchedRuleId: 'none',
      isUnclassified: true,
    };
  });
}

// ─── CRUD Operations (In-Memory) ────────────────────────────────────────────

/**
 * Creates a new custom mapping rule.
 * Uses crypto.randomUUID() for the rule ID and ISO timestamp for createdAt/updatedAt.
 */
export function createMappingRule(
  rule: Omit<MappingRule, 'ruleId' | 'createdAt'>,
): MappingRule {
  const now = new Date().toISOString();
  const newRule: MappingRule = {
    ...rule,
    ruleId: randomUUID(),
    createdAt: now,
    updatedAt: rule.updatedAt ?? now,
  };

  customRulesStore.set(newRule.ruleId, newRule);
  return newRule;
}

/**
 * Updates an existing custom mapping rule by ID.
 * Updates the updatedAt timestamp. Throws if rule not found.
 */
export function updateMappingRule(
  ruleId: string,
  updates: Partial<MappingRule>,
): MappingRule {
  const existing = customRulesStore.get(ruleId);
  if (!existing) {
    throw new Error(`Mapping rule not found: ${ruleId}`);
  }

  const updatedRule: MappingRule = {
    ...existing,
    ...updates,
    ruleId, // prevent overwriting the ID
    updatedAt: new Date().toISOString(),
  };

  customRulesStore.set(ruleId, updatedRule);
  return updatedRule;
}

/**
 * Deletes a custom mapping rule by ID. Throws if rule not found.
 */
export function deleteMappingRule(ruleId: string): void {
  if (!customRulesStore.has(ruleId)) {
    throw new Error(`Mapping rule not found: ${ruleId}`);
  }
  customRulesStore.delete(ruleId);
}

/**
 * Returns all custom rules from the in-memory store.
 * (Utility for testing and inspection.)
 */
export function getCustomRules(): MappingRule[] {
  return Array.from(customRulesStore.values());
}

/**
 * Clears all custom rules from the in-memory store.
 * (Utility for testing.)
 */
export function clearCustomRules(): void {
  customRulesStore.clear();
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Returns scope priority for tie-breaking: project > firm > default.
 */
function getScopePriority(scope: MappingRule['scope']): number {
  switch (scope) {
    case 'project': return 3;
    case 'firm': return 2;
    case 'default': return 1;
    default: return 0;
  }
}

/**
 * Factory for building default rules with consistent structure.
 */
function rule(
  ruleId: string,
  ifcEntityType: IfcEntityType,
  tradeSection: AsaqsTradeSection,
  tradeSectionCode: string,
  measurementUnit: MeasurementUnit,
  description: string,
): MappingRule {
  return {
    ruleId,
    ifcEntityType,
    tradeSection,
    tradeSectionCode,
    measurementUnit,
    description,
    scope: 'default',
  };
}
