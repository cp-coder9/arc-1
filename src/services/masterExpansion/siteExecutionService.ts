import { ProjectRecord } from '@/types/architexMasterTypes';

export interface SiteDiaryPayload {
  diaryDate: string;
  weather?: string;
  labourCount: number;
  plantOnSite: string[];
  delays: string[];
  photosAttached: number;
}

export function createSiteDiaryRecord(input: {
  tenantId: string;
  projectId: string;
  userId: string;
  labourCount: number;
  delays?: string[];
}): ProjectRecord<SiteDiaryPayload> {
  return {
    id: `site_diary_${Date.now()}`,
    tenantId: input.tenantId,
    projectId: input.projectId,
    phase: 'construction_execution',
    moduleKey: 'site_execution',
    recordType: 'site_diary',
    title: `Site diary ${new Date().toISOString().slice(0, 10)}`,
    status: 'draft',
    payload: {
      diaryDate: new Date().toISOString().slice(0, 10),
      labourCount: input.labourCount,
      plantOnSite: [],
      delays: input.delays ?? [],
      photosAttached: 0,
    },
    approval: { status: 'draft', requiredApproverRoles: ['site_manager', 'contractor'] },
    audit: { createdByUserId: input.userId, createdAt: new Date().toISOString(), source: 'user', revision: 1 },
    linkedRecordIds: [],
  };
}
