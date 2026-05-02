import { Discipline, ExecutionMode, Finding, Submission } from '../types';

// Runtime-only orchestration stages (regulatory_scope, coordination_clash,
// professional_signoff, orchestrator) are invoked explicitly by reviewDrawing.
// This map contains specialist review agents only.
const MODE_AGENT_MAP: Record<ExecutionMode, string[]> = {
  basic_ai_screen: [
    'architectural_completeness',
    'sans_10400_general',
    'envelope_materials'
  ],
  council_readiness: [
    'architectural_completeness',
    'council_submission',
    'planning_zoning',
    'drainage_stormwater'
  ],
  fire_plan_review: [
    'fire_safety',
    'accessibility',
    'electrical_services'
  ],
  engineering_coordination: [
    'structural_trigger',
    'foundation_geotech',
    'drainage_stormwater',
    'electrical_services'
  ],
  full_professional_review: [
    'architectural_completeness',
    'council_submission',
    'sans_10400_general',
    'planning_zoning',
    'structural_trigger',
    'foundation_geotech',
    'fire_safety',
    'accessibility',
    'energy_sustainability',
    'drainage_stormwater',
    'electrical_services',
    'envelope_materials',
    'site_safety_operations',
    'nhbrc_residential'
  ],
  resubmission_delta_review: [
    'architectural_completeness'
  ],
  specialist_pack_review: [
    'sans_10400_general'
  ]
};

const DISCIPLINE_AGENT_MAP: Partial<Record<Discipline, string[]>> = {
  architecture: ['architectural_completeness', 'envelope_materials'],
  structure: ['structural_trigger', 'foundation_geotech'],
  fire: ['fire_safety'],
  accessibility: ['accessibility'],
  energy: ['energy_sustainability'],
  drainage: ['drainage_stormwater'],
  electrical: ['electrical_services'],
  mechanical: ['electrical_services'],
  planning: ['planning_zoning', 'council_submission'],
  documentation: ['architectural_completeness', 'council_submission'],
  environmental: ['energy_sustainability', 'planning_zoning'],
  nhbrc: ['nhbrc_residential'],
  coordination: []
};

export function resolveAgentsForMode(mode: ExecutionMode, scope?: { disciplines?: Discipline[] }): string[] {
  const roles = new Set(MODE_AGENT_MAP[mode] || MODE_AGENT_MAP.basic_ai_screen);

  scope?.disciplines?.forEach((discipline) => {
    DISCIPLINE_AGENT_MAP[discipline]?.forEach((role) => roles.add(role));
  });
  return Array.from(roles);
}

export function inferDefaultMode(submission?: Partial<Submission> & { files?: unknown[]; previousFindings?: Finding[] }): ExecutionMode {
  if (submission?.previousFindings?.length || submission?.findings?.length) return 'resubmission_delta_review';
  if (submission?.files && submission.files.length > 1) return 'full_professional_review';
  return 'basic_ai_screen';
}

export const AGENT_SELECTION = {
  MODE_AGENT_MAP,
  DISCIPLINE_AGENT_MAP
};
