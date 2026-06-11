import { ProjectRecord } from '@/types/architexMasterTypes';

export interface QuoteComparisonPayload {
  packageName: string;
  quoteCount: number;
  normalised: boolean;
  warnings: string[];
}

export function createQuoteComparisonRecord(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  packageName: string;
  quoteCount: number;
}): ProjectRecord<QuoteComparisonPayload> {
  return {
    id: `quote_comparison_${Date.now()}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    phase: 'tender_procurement',
    moduleKey: 'procurement',
    recordType: 'quote_comparison',
    title: `${input.packageName} quote comparison`,
    status: 'draft_comparison',
    payload: {
      packageName: input.packageName,
      quoteCount: input.quoteCount,
      normalised: false,
      warnings: ['Check exclusions, lead times, VAT, delivery, substitutions and scope gaps.'],
    },
    approval: { status: 'pending_review', requiredApproverRoles: ['quantity_surveyor', 'contractor'] },
    audit: { createdByUserId: input.userId, createdAt: new Date().toISOString(), source: 'agent', revision: 1 },
    linkedRecordIds: [],
  };
}
