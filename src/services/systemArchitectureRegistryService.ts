export type SystemArchitectureCategoryId =
  | 'core_architecture_stakeholders'
  | 'technical_design_coordination'
  | 'statutory_compliance_environmental_heritage'
  | 'financial_escrow_contracts'
  | 'estimation_procurement_supply_chain'
  | 'construction_operations_site_safety'
  | 'closeout_asset_handover_intelligence'
  | 'platform_infrastructure_privacy_communication';

export type SystemArchitectureReadinessStatus = 'ready' | 'blocked';

export interface SystemArchitectureCategory {
  id: SystemArchitectureCategoryId;
  name: string;
  description: string;
}

export interface SystemArchitectureRegistryEntry {
  section: number;
  title: string;
  categoryId: SystemArchitectureCategoryId;
}

export interface SystemArchitectureCategorySummary {
  categoryName: string;
  sections: number[];
  moduleCount: number;
}

export interface SystemArchitectureRegistrySummary {
  totalIndexedModules: number;
  sections: number[];
  byCategory: Record<SystemArchitectureCategoryId, SystemArchitectureCategorySummary>;
}

export interface SystemArchitectureRegistryReadiness {
  status: SystemArchitectureReadinessStatus;
  expectedRange: { first: number; last: number };
  indexedSections: number[];
  missingSections: number[];
  duplicateSections: number[];
  blockers: string[];
  nextAction: string;
  governance: {
    source: 'PRD Section 56';
    humanReviewRequired: true;
    aiMayNotRewritePrd: true;
    noAutomaticSectionRenumbering: true;
  };
}

const EXPECTED_FIRST_SECTION = 1;
const EXPECTED_LAST_SECTION = 56;

export const ARCHITEX_OS_REGISTRY_CATEGORIES: readonly SystemArchitectureCategory[] = Object.freeze([
  Object.freeze({
    id: 'core_architecture_stakeholders',
    name: 'Core Architecture & Stakeholder Framework',
    description: 'Concept, roles, lifecycle, integration highlights, responsive UI mechanics, state binding, and production data foundations.',
  }),
  Object.freeze({
    id: 'technical_design_coordination',
    name: 'Technical Design & Multi-Disciplinary Coordination',
    description: 'Codebase execution, drawing/transmittal control, freelancer QA, CDE/ISO 19650, and structural timber certification.',
  }),
  Object.freeze({
    id: 'statutory_compliance_environmental_heritage',
    name: 'Statutory Compliance, Environmental, & Heritage Governance',
    description: 'Municipal, regulatory, environmental, heritage, fire, demolition, and boundary-audit governance modules.',
  }),
  Object.freeze({
    id: 'financial_escrow_contracts',
    name: 'Financial Engineering, Escrow, & Contractual Frameworks',
    description: 'Contract digitalization, escrow retention, cashflow, rollback, and KYC/FICA foundations.',
  }),
  Object.freeze({
    id: 'estimation_procurement_supply_chain',
    name: 'Estimation, Procurement, & Supply Chain Management',
    description: 'BoQ, estimating, subcontractor tendering, ESG/carbon, local sourcing, and B-BBEE procurement auditing.',
  }),
  Object.freeze({
    id: 'construction_operations_site_safety',
    name: 'Construction Operations, Site Controls, & Safety',
    description: 'OHS, labour/CLO/EPWP, SSEG, WULA, and laboratory test controls for site delivery.',
  }),
  Object.freeze({
    id: 'closeout_asset_handover_intelligence',
    name: 'Close-Out, Asset Handover, & Operational Intelligence',
    description: 'Snags, handover packs, facility-management transition, COBie, and project analytics.',
  }),
  Object.freeze({
    id: 'platform_infrastructure_privacy_communication',
    name: 'Platform Infrastructure, Privacy, & Communication',
    description: 'Platform modules, AI orchestration, runtime integration, POPIA, notifications, messaging, deployment, and the architecture index.',
  }),
]);

export const SYSTEM_ARCHITECTURE_REGISTRY: readonly SystemArchitectureRegistryEntry[] = Object.freeze([
  entry(1, 'Architectural Concept & Platform Architecture', 'core_architecture_stakeholders'),
  entry(2, 'Comprehensive User Role Breakdown', 'core_architecture_stakeholders'),
  entry(3, 'End-to-End Project Workflow (The 8-Stage Lifecycle)', 'core_architecture_stakeholders'),
  entry(4, 'Key Platform Integration Highlights', 'core_architecture_stakeholders'),
  entry(21, 'Responsive Layout Mechanics & Fluid Design System', 'core_architecture_stakeholders'),
  entry(22, 'UI State Management & JavaScript Event Delegation', 'core_architecture_stakeholders'),
  entry(23, 'Production PostgreSQL Database Schema', 'core_architecture_stakeholders'),

  entry(6, 'Codebase Architecture & Technical Execution', 'technical_design_coordination'),
  entry(17, 'Drawing Register & Transmittal Workflows', 'technical_design_coordination'),
  entry(38, 'Freelancer Work Package QA & BIM Model Auditing', 'technical_design_coordination'),
  entry(42, 'Common Data Environment (CDE) & ISO 19650 Architecture', 'technical_design_coordination'),
  entry(50, 'Structural Timber & Truss Certification (SANS 10082 & ITC-SA A19)', 'technical_design_coordination'),

  entry(9, 'The Municipal Tracker Hybrid Layer', 'statutory_compliance_environmental_heritage'),
  entry(11, 'South African Regulatory Compliance Layer (SANS 10400 & SACAP/ECSA Validation)', 'statutory_compliance_environmental_heritage'),
  entry(25, 'Automated Compliance Auditing (The AI Drawing Parser Engine Pipeline)', 'statutory_compliance_environmental_heritage'),
  entry(28, 'API Specifications for South African Municipal Portals', 'statutory_compliance_environmental_heritage'),
  entry(34, 'Geotechnical & GIS Integrations (SANS 10160 & SANS 10400-H)', 'statutory_compliance_environmental_heritage'),
  entry(39, 'Zoning Schemes & SPLUMA Compliance (SPLUMA, Act 16 of 2013)', 'statutory_compliance_environmental_heritage'),
  entry(41, 'Heritage Permits & Environmental Authorisations (NHRA & NEMA)', 'statutory_compliance_environmental_heritage'),
  entry(45, 'Surveyor-General (SG) Diagrams & Boundary Auditing', 'statutory_compliance_environmental_heritage'),
  entry(49, 'Fire Protection & Municipal Fire Department Clearances (SANS 10400-T)', 'statutory_compliance_environmental_heritage'),
  entry(53, 'Demolition Permits, Waste Management Plans, & Asbestos Abatement', 'statutory_compliance_environmental_heritage'),
  entry(54, 'Heritage Impact Assessments (NHRA Section 38 Triggers)', 'statutory_compliance_environmental_heritage'),

  entry(12, 'JBCC & PROCSA Standard-Form Contract Digitalization', 'financial_escrow_contracts'),
  entry(14, 'Defect Liability & Escrow Retention Management', 'financial_escrow_contracts'),
  entry(15, 'Financial Cashflow & Scraping Simulation', 'financial_escrow_contracts'),
  entry(27, 'Fail-Safe Protocols & Escrow Rollback Mechanics', 'financial_escrow_contracts'),
  entry(33, 'Onboarding & KYC / FICA Verification Pipelines', 'financial_escrow_contracts'),

  entry(13, 'South African Bill of Quantities (BoQ) Standards', 'estimation_procurement_supply_chain'),
  entry(29, 'Quantity Surveying & Cost Estimation Module (ASAQS Pricing System)', 'estimation_procurement_supply_chain'),
  entry(37, 'Subcontractor Tendering & Procurement (JBCC NSSA / DSA Mapping)', 'estimation_procurement_supply_chain'),
  entry(40, 'ESG & Embodied Carbon Estimation Layer (GBCSA Guidelines)', 'estimation_procurement_supply_chain'),
  entry(48, 'Local Sourcing & B-BBEE Procurement Auditing', 'estimation_procurement_supply_chain'),

  entry(30, 'Health, Safety, & OHS Agent Workflows (Construction Regulations, 2014)', 'construction_operations_site_safety'),
  entry(43, 'Local Labour, CLO, & EPWP Reporting (Construction Regulations, 2014)', 'construction_operations_site_safety'),
  entry(46, 'Solar PV & Small-Scale Embedded Generation (SSEG) Compliance', 'construction_operations_site_safety'),
  entry(47, 'Water Infrastructure & Water Use License Applications (WULA)', 'construction_operations_site_safety'),
  entry(55, 'Soil & Concrete Laboratory Testing (SANS 3001 & Compressive Strength Cube Tests)', 'construction_operations_site_safety'),

  entry(35, 'Snag Classification & Latent Defects Liability', 'closeout_asset_handover_intelligence'),
  entry(36, 'Handover Packs & Municipal Occupancy Certificates', 'closeout_asset_handover_intelligence'),
  entry(44, 'Facility Management Transition & COBie Asset Handover', 'closeout_asset_handover_intelligence'),
  entry(52, 'Closed-Loop Machine Learning & Project Analytics', 'closeout_asset_handover_intelligence'),

  entry(5, 'Specialized Platform Modules & Operational Logic', 'platform_infrastructure_privacy_communication'),
  entry(7, 'AI Workflow Co-Pilot Orchestration (The Multi-Agent Architecture)', 'platform_infrastructure_privacy_communication'),
  entry(8, 'Static Data Mapping & Dynamic Binding', 'platform_infrastructure_privacy_communication'),
  entry(10, 'Production-Grade Production Path', 'platform_infrastructure_privacy_communication'),
  entry(16, 'Legal Auditing, Communication, & Hashed Logging', 'platform_infrastructure_privacy_communication'),
  entry(18, 'Continuing Professional Development (CPD) Engine', 'platform_infrastructure_privacy_communication'),
  entry(19, 'Security, Privacy, & POPIA Compliance', 'platform_infrastructure_privacy_communication'),
  entry(20, 'System Interoperability Map (Unified Runtime Orchestration)', 'platform_infrastructure_privacy_communication'),
  entry(26, 'Event-Driven Real-Time Notification Schema', 'platform_infrastructure_privacy_communication'),
  entry(31, 'Advanced Project Messenger Encryption & Attachment Pipelines', 'platform_infrastructure_privacy_communication'),
  entry(32, 'Deployment Architecture & POPIA Compliance', 'platform_infrastructure_privacy_communication'),
  entry(56, 'System Architecture Index (Unified Operating System Registry)', 'platform_infrastructure_privacy_communication'),
]);

const CATEGORY_BY_ID = new Map(ARCHITEX_OS_REGISTRY_CATEGORIES.map((category) => [category.id, category]));

function entry(section: number, title: string, categoryId: SystemArchitectureCategoryId): Readonly<SystemArchitectureRegistryEntry> {
  return Object.freeze({ section, title, categoryId });
}

function canonicalSectionRange(first = EXPECTED_FIRST_SECTION, last = EXPECTED_LAST_SECTION): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function sortedUniqueSections(registry: readonly SystemArchitectureRegistryEntry[]): number[] {
  return [...new Set(registry.map((entry) => entry.section))].sort((a, b) => a - b);
}

function duplicateSections(registry: readonly SystemArchitectureRegistryEntry[]): number[] {
  const counts = new Map<number, number>();
  registry.forEach((entry) => counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1));
  return [...counts.entries()].filter(([, count]) => count > 1).map(([section]) => section).sort((a, b) => a - b);
}

export function getArchitectureCategoryForSection(section: number): SystemArchitectureCategory | undefined {
  const registryEntry = SYSTEM_ARCHITECTURE_REGISTRY.find((entry) => entry.section === section);
  return registryEntry ? CATEGORY_BY_ID.get(registryEntry.categoryId) : undefined;
}

export function summarizeSystemArchitectureRegistry(
  registry: readonly SystemArchitectureRegistryEntry[] = SYSTEM_ARCHITECTURE_REGISTRY,
): SystemArchitectureRegistrySummary {
  const byCategory = Object.fromEntries(
    ARCHITEX_OS_REGISTRY_CATEGORIES.map((category) => [
      category.id,
      {
        categoryName: category.name,
        sections: Object.freeze(
          registry
            .filter((entry) => entry.categoryId === category.id)
            .map((entry) => entry.section)
            .sort((a, b) => a - b),
        ) as unknown as number[],
        moduleCount: registry.filter((entry) => entry.categoryId === category.id).length,
      },
    ]),
  ) as Record<SystemArchitectureCategoryId, SystemArchitectureCategorySummary>;

  Object.values(byCategory).forEach(Object.freeze);

  return Object.freeze({
    totalIndexedModules: registry.length,
    sections: Object.freeze(sortedUniqueSections(registry)) as unknown as number[],
    byCategory: Object.freeze(byCategory) as Record<SystemArchitectureCategoryId, SystemArchitectureCategorySummary>,
  });
}

export function evaluateSystemArchitectureRegistryReadiness(
  registry: readonly SystemArchitectureRegistryEntry[] = SYSTEM_ARCHITECTURE_REGISTRY,
): SystemArchitectureRegistryReadiness {
  const expectedSections = canonicalSectionRange();
  const indexedSections = sortedUniqueSections(registry);
  const indexed = new Set(indexedSections);
  const missingSections = expectedSections.filter((section) => !indexed.has(section));
  const duplicate = duplicateSections(registry);
  const unknownCategorySections = registry
    .filter((entry) => !CATEGORY_BY_ID.has(entry.categoryId))
    .map((entry) => entry.section)
    .sort((a, b) => a - b);

  const blockers = [
    ...missingSections.map((section) => `Section ${section} is not mapped in the unified operating-system registry.`),
    ...duplicate.map((section) => `Section ${section} is mapped more than once in the unified operating-system registry.`),
    ...unknownCategorySections.map((section) => `Section ${section} references an unknown operating-system category.`),
  ];

  return Object.freeze({
    status: blockers.length === 0 ? 'ready' : 'blocked',
    expectedRange: Object.freeze({ first: EXPECTED_FIRST_SECTION, last: EXPECTED_LAST_SECTION }),
    indexedSections: Object.freeze(indexedSections) as unknown as number[],
    missingSections: Object.freeze(missingSections) as unknown as number[],
    duplicateSections: Object.freeze(duplicate) as unknown as number[],
    blockers: Object.freeze(blockers) as unknown as string[],
    nextAction: blockers.length === 0
      ? 'Use the unified operating-system registry as the canonical section-category spine for dashboards and readiness reporting.'
      : 'Reconcile the PRD Section 56 index so every canonical Section 1-56 module has exactly one operating-system category.',
    governance: Object.freeze({
      source: 'PRD Section 56' as const,
      humanReviewRequired: true as const,
      aiMayNotRewritePrd: true as const,
      noAutomaticSectionRenumbering: true as const,
    }),
  });
}
