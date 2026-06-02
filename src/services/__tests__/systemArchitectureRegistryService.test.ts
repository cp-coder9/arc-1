import {
  ARCHITEX_OS_REGISTRY_CATEGORIES,
  SYSTEM_ARCHITECTURE_REGISTRY,
  evaluateSystemArchitectureRegistryReadiness,
  getArchitectureCategoryForSection,
  summarizeSystemArchitectureRegistry,
} from '../systemArchitectureRegistryService';

describe('systemArchitectureRegistryService', () => {
  it('maps PRD Section 56 into the unified operating-system category spine', () => {
    expect(ARCHITEX_OS_REGISTRY_CATEGORIES).toHaveLength(8);
    expect(getArchitectureCategoryForSection(3)?.name).toBe('Core Architecture & Stakeholder Framework');
    expect(getArchitectureCategoryForSection(49)?.name).toBe('Statutory Compliance, Environmental, & Heritage Governance');
    expect(getArchitectureCategoryForSection(52)?.name).toBe('Close-Out, Asset Handover, & Operational Intelligence');
  });

  it('summarizes registry coverage without mutating the canonical section map', () => {
    const summary = summarizeSystemArchitectureRegistry(SYSTEM_ARCHITECTURE_REGISTRY);

    expect(summary.totalIndexedModules).toBe(54);
    expect(summary.byCategory['statutory_compliance_environmental_heritage']).toEqual({
      categoryName: 'Statutory Compliance, Environmental, & Heritage Governance',
      sections: [9, 11, 25, 28, 34, 39, 41, 45, 49, 53, 54],
      moduleCount: 11,
    });
    expect(() => { summary.sections[0] = 999; }).toThrow();
  });

  it('flags gaps between the Section 56 index claim and the canonical 1-56 PRD module range', () => {
    const readiness = evaluateSystemArchitectureRegistryReadiness(SYSTEM_ARCHITECTURE_REGISTRY);

    expect(readiness.status).toBe('blocked');
    expect(readiness.indexedSections).toContain(56);
    expect(readiness.missingSections).toEqual([24, 51]);
    expect(readiness.blockers).toEqual([
      'Section 24 is not mapped in the unified operating-system registry.',
      'Section 51 is not mapped in the unified operating-system registry.',
    ]);
    expect(readiness.nextAction).toBe('Reconcile the PRD Section 56 index so every canonical Section 1-56 module has exactly one operating-system category.');
    expect(readiness.governance.humanReviewRequired).toBe(true);
    expect(readiness.governance.aiMayNotRewritePrd).toBe(true);
  });
});
