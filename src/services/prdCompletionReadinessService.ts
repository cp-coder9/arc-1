export type ReadinessStatus = 'ready' | 'blocked';

export interface ReadinessProjection {
  status: ReadinessStatus;
  covered: string[];
  blockers: string[];
  nextActions: string[];
}

export const PRD_ROLE_PATH_REQUIREMENTS = Object.freeze({
  client: ['guided_brief', 'proposal_comparison', 'contract_signing', 'escrow_payment', 'progress_reports', 'approval_gates'],
  bep: ['technical_brief', 'fee_proposal', 'design_team_matrix', 'ai_drawing_checker', 'sans_form_autofill', 'freelancer_jobs', 'municipal_tracker'],
  contractor: ['construction_os', 'staff_wages_plant', 'site_logs', 'gantt_programme', 'rfi_site_instructions', 'procurement_delivery_claims'],
  supplier: ['assigned_package', 'delivery_docs', 'shop_drawings', 'claims', 'warranty_certificates'],
  freelancer: ['assigned_work', 'output_submission', 'feedback_revision', 'invoicing', 'resource_booking'],
  admin: ['verification_queue', 'disputes', 'escrow_oversight', 'ai_governance', 'payment_rate_settings', 'system_audit_logs'],
} as const);

export const STATUTORY_PROVIDER_REQUIREMENTS = Object.freeze([
  'sg_boundary_api_adapter',
  'sseg_pack_templates',
  'wula_dws_workflow_adapter',
  'bbbee_certificate_parser',
  'fire_submission_package',
  'truss_itc_pack_evidence',
  'development_charge_tracking',
  'cpd_statutory_sync',
  'supplier_pricing_lead_time_adapter',
]);

export const NEXT_BEST_ACTION_SIGNALS = Object.freeze([
  'overdue_approval',
  'payment_due',
  'missing_compliance_evidence',
  'blocked_stage_gate',
  'unresolved_ai_issue',
]);

export const LIFECYCLE_STAGE_GATES = Object.freeze([
  'brief',
  'appoint',
  'design',
  'comply',
  'procure',
  'build',
  'pay',
  'closeout',
]);

export const AI_HUMAN_SIGNOFF_REQUIREMENTS = Object.freeze([
  'source_evidence',
  'confidence_score',
  'required_human_reviewer',
  'immutable_audit_log',
  'regulated_action_no_auto_approval',
  'feedback_loop',
]);

export const CLOSEOUT_HANDOVER_REQUIREMENTS = Object.freeze([
  'snag_evidence',
  'trade_drawing_links',
  'photo_rectification_evidence',
  'retention_release_gate',
  'final_accounts',
  'msds',
  'compliance_certificates',
  'warranties',
  'as_built_drawings',
  'occupancy_fire_utility_clearances',
  'archive_escrow_closure',
]);

export function projectRolePathUatReadiness(implemented: Record<string, string[]>): ReadinessProjection {
  const missing = Object.entries(PRD_ROLE_PATH_REQUIREMENTS).flatMap(([role, requirements]) =>
    requirements.filter((requirement) => !(implemented[role] ?? []).includes(requirement)).map((requirement) => `${role}:${requirement}`),
  );
  return projection(Object.values(implemented).flat(), missing, 'Complete role-path UAT coverage');
}

export function projectStatutoryProviderReadiness(implemented: string[], credentialed: string[]): ReadinessProjection {
  const missing = STATUTORY_PROVIDER_REQUIREMENTS.filter((requirement) => !implemented.includes(requirement));
  const providerBlocked = STATUTORY_PROVIDER_REQUIREMENTS
    .filter((requirement) => implemented.includes(requirement) && !credentialed.includes(requirement))
    .map((requirement) => `${requirement}: provider credentials/terms required for live execution`);
  return projection(implemented, [...missing, ...providerBlocked], 'Provide live statutory/supplier credentials and terms');
}

export function rankNextBestActions(signals: string[]): string[] {
  const priority = ['blocked_stage_gate', 'overdue_approval', 'payment_due', 'missing_compliance_evidence', 'unresolved_ai_issue'];
  return [...signals].sort((a, b) => priority.indexOf(a) - priority.indexOf(b));
}

export function projectNextBestActionReadiness(implementedSignals: string[]): ReadinessProjection {
  const missing = NEXT_BEST_ACTION_SIGNALS.filter((signal) => !implementedSignals.includes(signal));
  return projection(implementedSignals, missing, 'Implement remaining next-best-action signals');
}

export function projectLifecycleGateReadiness(implementedStages: string[]): ReadinessProjection {
  const missing = LIFECYCLE_STAGE_GATES.filter((stage) => !implementedStages.includes(stage));
  return projection(implementedStages, missing, 'Add entry/exit criteria and audit override for each lifecycle stage');
}

export function projectAiHumanSignoffReadiness(implemented: string[]): ReadinessProjection {
  const missing = AI_HUMAN_SIGNOFF_REQUIREMENTS.filter((requirement) => !implemented.includes(requirement));
  return projection(implemented, missing, 'Add human signoff evidence for every regulated AI recommendation');
}

export function projectCloseoutHandoverReadiness(implemented: string[]): ReadinessProjection {
  const missing = CLOSEOUT_HANDOVER_REQUIREMENTS.filter((requirement) => !implemented.includes(requirement));
  return projection(implemented, missing, 'Complete closeout and asset handover requirements');
}

function projection(covered: string[], missing: string[], action: string): ReadinessProjection {
  return Object.freeze({
    status: missing.length === 0 ? 'ready' : 'blocked',
    covered: Object.freeze([...covered]) as unknown as string[],
    blockers: Object.freeze(missing) as unknown as string[],
    nextActions: Object.freeze(missing.length === 0 ? [] : [action]) as unknown as string[],
  });
}
