import type { PhaseDefinition, ProjectPhase } from '@/services/lifecycleTypes';

/**
 * Full lifecycle phase definitions for the Architex 9-phase project lifecycle.
 * Each phase declares required record types, optional record types, and a handoff rule.
 */
export const LIFE_CYCLE_DEFINITIONS: PhaseDefinition[] = [
  {
    phase: 'onboarding',
    label: 'Onboarding',
    requiredRecordTypes: ['project_brief', 'property_profile'],
    optionalRecordTypes: ['professional_appointment'],
    handoffRule: 'Project needs a brief and property profile before feasibility can start.',
  },
  {
    phase: 'feasibility',
    label: 'Feasibility',
    requiredRecordTypes: ['project_brief', 'property_profile'],
    optionalRecordTypes: ['professional_appointment', 'scope_baseline'],
    handoffRule: 'Feasibility should identify property constraints and likely professional appointments.',
  },
  {
    phase: 'appointment',
    label: 'Appointment',
    requiredRecordTypes: ['professional_appointment', 'scope_baseline'],
    optionalRecordTypes: ['candidate_supervision_record'],
    handoffRule: 'Signed appointment and scope baseline required before formal design work.',
  },
  {
    phase: 'concept_design',
    label: 'Concept Design',
    requiredRecordTypes: ['professional_appointment', 'scope_baseline', 'concept_drawings'],
    optionalRecordTypes: ['property_profile'],
    handoffRule: 'Concept drawings and appointment baseline required before design development.',
  },
  {
    phase: 'design_development',
    label: 'Design Development',
    requiredRecordTypes: ['professional_appointment', 'technical_drawings'],
    optionalRecordTypes: ['concept_drawings'],
    handoffRule: 'Technical drawings must be ready before municipal submission.',
  },
  {
    phase: 'municipal_submission',
    label: 'Municipal Submission',
    requiredRecordTypes: ['municipal_submission_pack', 'technical_drawings'],
    optionalRecordTypes: ['municipal_approval_letter'],
    handoffRule: 'Submission pack must be issued; approval evidence required before construction.',
  },
  {
    phase: 'tender_procurement',
    label: 'Tender / Procurement',
    requiredRecordTypes: ['tender_pack', 'scope_baseline'],
    optionalRecordTypes: ['quote_comparison', 'professional_appointment'],
    handoffRule: 'Tender pack and scope baseline required before awards and construction mobilization.',
  },
  {
    phase: 'construction_execution',
    label: 'Construction Execution',
    requiredRecordTypes: ['municipal_approval_letter', 'professional_appointment', 'construction_programme'],
    optionalRecordTypes: ['payment_certificate', 'site_diary', 'rfi', 'site_instruction', 'quote_comparison'],
    handoffRule: 'Construction should not proceed without approval evidence, appointments and programme.',
  },
  {
    phase: 'closeout',
    label: 'Closeout',
    requiredRecordTypes: ['snag_register', 'closeout_pack'],
    optionalRecordTypes: ['payment_certificate', 'site_diary'],
    handoffRule: 'Snag register and closeout pack required before handover.',
  },
];

/**
 * Look up the phase definition for a given phase.
 * Throws if no definition exists for the specified phase.
 */
export function definitionForPhase(phase: ProjectPhase): PhaseDefinition {
  const definition = LIFE_CYCLE_DEFINITIONS.find((item) => item.phase === phase);
  if (!definition) throw new Error(`No lifecycle definition for phase: ${phase}`);
  return definition;
}
