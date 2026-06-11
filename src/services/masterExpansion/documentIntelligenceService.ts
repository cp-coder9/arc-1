import { ProjectRecord } from '@/types/architexMasterTypes';

export interface DrawingIntelligencePayload {
  fileName: string;
  drawingNumber?: string;
  revision?: string;
  titleBlockConfidence: 'low' | 'medium' | 'high';
  extractedFacts: string[];
  complianceFlags: string[];
}

export function createDrawingRevisionRecord(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  fileName: string;
  drawingNumber: string;
  revision: string;
}): ProjectRecord<DrawingIntelligencePayload> {
  return {
    id: `drawing_${input.drawingNumber}_${input.revision}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    phase: 'design_coordination',
    moduleKey: 'documents',
    recordType: 'drawing_revision',
    title: `${input.drawingNumber} revision ${input.revision}`,
    status: 'current',
    payload: {
      fileName: input.fileName,
      drawingNumber: input.drawingNumber,
      revision: input.revision,
      titleBlockConfidence: 'medium',
      extractedFacts: ['title block read', 'revision captured', 'manual review required before issue'],
      complianceFlags: ['Confirm SANS/NBR and municipality-specific requirements before submission.'],
    },
    approval: { status: 'pending_review', requiredApproverRoles: ['architect'] },
    audit: { createdByUserId: input.userId, createdAt: new Date().toISOString(), source: 'agent', revision: 1 },
    linkedRecordIds: [],
  };
}
