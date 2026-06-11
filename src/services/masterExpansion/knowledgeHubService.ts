import { ProjectRecord } from '@/types/architexMasterTypes';

export interface KnowledgeSourcePayload {
  sourceTitle: string;
  sourceType: 'NBR_SANS' | 'municipal_guideline' | 'professional_body_rule' | 'template' | 'practice_note';
  jurisdiction: 'ZA';
  citationRequired: boolean;
  summary: string;
}

export function createKnowledgeSourceRecord(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  sourceTitle: string;
  sourceType: KnowledgeSourcePayload['sourceType'];
  summary: string;
}): ProjectRecord<KnowledgeSourcePayload> {
  return {
    id: `knowledge_${Date.now()}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    phase: 'brief_feasibility',
    moduleKey: 'knowledge',
    recordType: 'knowledge_source',
    title: input.sourceTitle,
    status: 'reviewed_source_pending_admin_approval',
    payload: {
      sourceTitle: input.sourceTitle,
      sourceType: input.sourceType,
      jurisdiction: 'ZA',
      citationRequired: true,
      summary: input.summary,
    },
    approval: { status: 'pending_review', requiredApproverRoles: ['platform_admin', 'architect'] },
    audit: { createdByUserId: input.userId, createdAt: new Date().toISOString(), source: 'user', revision: 1 },
    linkedRecordIds: [],
  };
}
