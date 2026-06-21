import type { Profession, ProfessionProfile, StageDefinition } from './types';

const architecturalStages: StageDefinition[] = [
  { id: 's1', name: 'Stage 1 - Inception', defaultWeight: 0.02, deliverables: ['client brief', 'site information', 'appointment basis'] },
  { id: 's2', name: 'Stage 2 - Concept and Viability', defaultWeight: 0.15, deliverables: ['concept design', 'design report', 'budget alignment'] },
  { id: 's3', name: 'Stage 3 - Design Development', defaultWeight: 0.20, deliverables: ['developed drawings', 'consultant coordination', 'updated estimate'] },
  { id: 's41', name: 'Stage 4.1 - Local Authority Documentation', defaultWeight: 0.20, deliverables: ['submission drawings', 'forms/checklists', 'municipal response tracking'] },
  { id: 's42', name: 'Stage 4.2 - Technical Documentation and Tender', defaultWeight: 0.20, deliverables: ['technical drawings', 'schedules', 'tender documentation'] },
  { id: 's5', name: 'Stage 5 - Construction', defaultWeight: 0.20, deliverables: ['site inspections', 'contract administration', 'payment certificates'] },
  { id: 's6', name: 'Stage 6 - Close Out', defaultWeight: 0.03, deliverables: ['completion records', 'as-built/handover coordination'] },
];

const engineeringStages: StageDefinition[] = [
  { id: 'eng1', name: 'Investigation and report', defaultWeight: 0.10, deliverables: ['brief review', 'site/data review', 'engineering report'] },
  { id: 'eng2', name: 'Preliminary design', defaultWeight: 0.20, deliverables: ['options', 'design criteria', 'preliminary estimate'] },
  { id: 'eng3', name: 'Detailed design', defaultWeight: 0.30, deliverables: ['calculations', 'drawings', 'specification'] },
  { id: 'eng4', name: 'Tender documentation/procurement', defaultWeight: 0.15, deliverables: ['tender docs', 'queries', 'adjudication input'] },
  { id: 'eng5', name: 'Construction monitoring', defaultWeight: 0.20, deliverables: ['inspections', 'responses', 'certification input'] },
  { id: 'eng6', name: 'Closeout', defaultWeight: 0.05, deliverables: ['as-built review', 'completion report'] },
];

const qsStages: StageDefinition[] = [
  { id: 'qs1', name: 'Cost advice and feasibility', defaultWeight: 0.15, deliverables: ['order-of-cost estimate', 'cost plan basis'] },
  { id: 'qs2', name: 'Cost planning', defaultWeight: 0.20, deliverables: ['elemental cost plan', 'value engineering input'] },
  { id: 'qs3', name: 'Procurement documentation', defaultWeight: 0.25, deliverables: ['BoQ', 'tender pricing docs'] },
  { id: 'qs4', name: 'Tender evaluation', defaultWeight: 0.10, deliverables: ['tender report', 'clarifications'] },
  { id: 'qs5', name: 'Construction cost control', defaultWeight: 0.25, deliverables: ['valuations', 'variation assessment', 'cost reports'] },
  { id: 'qs6', name: 'Final account', defaultWeight: 0.05, deliverables: ['final account statement'] },
];

const genericStages: StageDefinition[] = [
  { id: 'brief', name: 'Brief and investigation', defaultWeight: 0.20, deliverables: ['brief', 'research', 'constraints'] },
  { id: 'design', name: 'Design / technical work', defaultWeight: 0.40, deliverables: ['technical production', 'coordination'] },
  { id: 'approval', name: 'Submission / approval / procurement', defaultWeight: 0.20, deliverables: ['submission pack', 'responses'] },
  { id: 'implementation', name: 'Implementation support', defaultWeight: 0.15, deliverables: ['site/implementation support'] },
  { id: 'closeout', name: 'Closeout', defaultWeight: 0.05, deliverables: ['records', 'handover'] },
];

const complexities = [
  { id: 'low' as const, label: 'Low', factor: 0.85, description: 'simple, low-risk, repeatable scope' },
  { id: 'medium' as const, label: 'Medium', factor: 1.0, description: 'normal professional complexity' },
  { id: 'high' as const, label: 'High', factor: 1.25, description: 'complex coordination, specialist input or risk' },
  { id: 'specialist' as const, label: 'Specialist', factor: 1.45, description: 'specialist/heritage/high-performance/abnormal risk' },
];

function makeProfile(
  profession: Profession, displayName: string, councilOrBody: string,
  preferredFormula: any, uiStyle: any, stages: StageDefinition[],
  terms: string[], acts: string[], workFactor = 1,
): ProfessionProfile {
  return {
    profession, displayName, councilOrBody, preferredFormula, uiStyle, stages,
    complexity: complexities,
    source: {
      id: `${profession}-demo-source-v0-2`, profession, body: councilOrBody,
      title: `${displayName} demo source table - replace with verified tariff/guideline`,
      effectiveDate: '2026-06-20', status: 'demo-seed',
      note: 'Seed configuration only; production must use verified official/company source records.',
    },
    workCategories: [
      { id: 'new', label: 'New works / standard service', factor: 1 * workFactor, description: 'normal new work' },
      { id: 'alteration', label: 'Alterations / existing interface', factor: 1.3 * workFactor, description: 'existing fabric/interface complexity' },
      { id: 'specialist', label: 'Specialist / abnormal services', factor: 1.4 * workFactor, description: 'specialist or abnormal service component' },
    ],
    defaultTermsTemplateIds: terms,
    actReferences: acts,
  };
}

export class ProfessionProfileRegistry {
  private readonly profiles = new Map<Profession, ProfessionProfile>();

  constructor() {
    const ecsaActs = ['Engineering Profession Act 46 of 2000', 'ECSA code of conduct and applicable guideline scope'];
    const entries: [Profession, ProfessionProfile][] = [
      ['architect', makeProfile('architect', 'Architectural Professional', 'SACAP', 'slidingScale', 'architectural-fee-desk', architecturalStages, ['standard-sa-professional', 'architectural-services'], ['Architectural Profession Act 44 of 2000', 'SACAP IDoW / fee guideline source'], 1)],
      ['civilEngineer', makeProfile('civilEngineer', 'Civil Engineer', 'ECSA', 'percentageOfCost', 'engineering-discipline', engineeringStages, ['standard-sa-professional', 'engineering-services'], ecsaActs, 0.95)],
      ['structuralEngineer', makeProfile('structuralEngineer', 'Structural Engineer', 'ECSA', 'percentageOfCost', 'engineering-discipline', engineeringStages, ['standard-sa-professional', 'engineering-services'], ecsaActs, 1.05)],
      ['electricalEngineer', makeProfile('electricalEngineer', 'Electrical Engineer', 'ECSA', 'percentageOfCost', 'engineering-discipline', engineeringStages, ['standard-sa-professional', 'engineering-services'], ecsaActs, 0.9)],
      ['mechanicalEngineer', makeProfile('mechanicalEngineer', 'Mechanical Engineer', 'ECSA', 'percentageOfCost', 'engineering-discipline', engineeringStages, ['standard-sa-professional', 'engineering-services'], ecsaActs, 0.92)],
      ['fireEngineer', makeProfile('fireEngineer', 'Fire Engineer', 'ECSA / fire specialist', 'hybrid', 'engineering-discipline', engineeringStages, ['standard-sa-professional', 'engineering-services', 'specialist-fire'], ecsaActs, 1.15)],
      ['quantitySurveyor', makeProfile('quantitySurveyor', 'Quantity Surveyor', 'SACQSP', 'slidingScale', 'qs-cost-plan', qsStages, ['standard-sa-professional', 'quantity-surveying'], ['Quantity Surveying Profession Act 49 of 2000'], 0.75)],
      ['townPlanner', makeProfile('townPlanner', 'Town Planner', 'SACPLAN', 'hybrid', 'planning-application', genericStages, ['standard-sa-professional', 'town-planning'], ['Planning Profession Act 36 of 2002', 'Municipal planning by-laws and SPLUMA context'], 0.65)],
      ['landSurveyor', makeProfile('landSurveyor', 'Land Surveyor / Geomatics Professional', 'SAGC', 'areaUnit', 'survey-unit', genericStages, ['standard-sa-professional', 'surveying-geomatics'], ['Geomatics Profession Act 19 of 2013'], 0.7)],
      ['landscapeArchitect', makeProfile('landscapeArchitect', 'Landscape Architect', 'SACLAP', 'percentageOfCost', 'design-fitout', genericStages, ['standard-sa-professional', 'landscape-architecture'], ['Landscape Architectural Profession Act 45 of 2000'], 0.8)],
      ['interiorDesigner', makeProfile('interiorDesigner', 'Interior Designer', 'IID / industry practice', 'hybrid', 'design-fitout', genericStages, ['standard-sa-professional', 'interior-design'], ['Industry/professional association terms where applicable'], 0.7)],
      ['constructionProjectManager', makeProfile('constructionProjectManager', 'Construction Project Manager / Principal Agent', 'SACPCMP', 'percentageOfCost', 'project-management', genericStages, ['standard-sa-professional', 'project-management'], ['Project and Construction Management Professions Act 48 of 2000'], 0.85)],
    ];
    entries.forEach(([p, profile]) => this.profiles.set(p, profile));
  }

  get(profession: Profession): ProfessionProfile {
    const p = this.profiles.get(profession);
    if (!p) throw new Error(`Unknown profession ${profession}`);
    return p;
  }

  list(): ProfessionProfile[] {
    return [...this.profiles.values()];
  }
}
