import { ProjectRecord } from '@/types/architexMasterTypes';

export interface EscrowMilestonePayload {
  amountZar: number;
  milestoneLabel: string;
  releaseCondition: string;
  platformFeePercent: number;
  vatApplies: boolean;
}

export function createEscrowMilestone(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  amountZar: number;
  label: string;
}): ProjectRecord<EscrowMilestonePayload> {
  return {
    id: `escrow_${Date.now()}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    phase: 'payments_commercial_control',
    moduleKey: 'finance',
    recordType: 'escrow_milestone',
    title: input.label,
    status: 'awaiting_funding',
    payload: {
      amountZar: input.amountZar,
      milestoneLabel: input.label,
      releaseCondition: 'Release only after deliverable approval/payment certificate approval.',
      platformFeePercent: 1,
      vatApplies: true,
    },
    approval: { status: 'pending_review', requiredApproverRoles: ['client', 'quantity_surveyor', 'platform_admin'] },
    audit: { createdByUserId: input.userId, createdAt: new Date().toISOString(), source: 'user', revision: 1, lockedAfterIssue: true },
    linkedRecordIds: [],
  };
}
