import { ProjectLifecycleState, ProjectPhase, ProjectRecord, ProjectRecordType } from '@/types/architexMasterTypes';

const requiredByPhase: Record<ProjectPhase, ProjectRecordType[]> = {
  lead_enquiry: [],
  brief_feasibility: ['knowledge_source'],
  proposal_appointment: ['verification_record'],
  design_coordination: ['drawing_revision', 'document'],
  municipal_submission: ['municipal_submission_item', 'drawing_revision'],
  tender_procurement: ['rfq', 'quote_comparison'],
  construction_execution: ['site_diary', 'snag'],
  payments_commercial_control: ['payment_certificate', 'escrow_milestone'],
  closeout: ['closeout_item', 'drawing_revision'],
  defects_liability: ['snag'],
  operations_post_occupancy: ['closeout_item'],
};

export function buildLifecycleState(input: {
  tenantId: string;
  projectId: string;
  currentPhase: ProjectPhase;
  records: ProjectRecord<unknown>[];
}): ProjectLifecycleState {
  const requiredRecordTypes = requiredByPhase[input.currentPhase];
  const completedRecordTypes = unique(input.records.map((record) => record.recordType));
  const missing = requiredRecordTypes.filter((type) => !completedRecordTypes.includes(type));

  return {
    tenantId: input.tenantId,
    projectId: input.projectId,
    currentPhase: input.currentPhase,
    phaseStartedAt: new Date().toISOString(),
    requiredRecordTypes,
    completedRecordTypes,
    blockers: missing.map((type) => `Missing required ${type} record for ${input.currentPhase}`),
  };
}

export function recommendLifecycleActions(state: ProjectLifecycleState): string[] {
  if (state.blockers.length > 0) {
    return state.blockers.map((blocker) => `Resolve blocker: ${blocker}`);
  }

  if (state.currentPhase === 'municipal_submission') {
    return ['Confirm submission checklist, drawing revisions and municipality-specific forms before issue.'];
  }

  if (state.currentPhase === 'payments_commercial_control') {
    return ['Match payment certificates to approved deliverables, site evidence, retention and escrow milestones.'];
  }

  return ['Confirm phase gate and prepare next project action.'];
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
