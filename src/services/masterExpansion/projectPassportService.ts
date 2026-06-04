import { ProjectPassportSummary, ProjectRecord, ProjectLifecycleState } from '@/types/architexMasterTypes';
import { recommendLifecycleActions } from '@/services/masterExpansion/projectLifecycleEngine';

export function buildProjectPassportSummary(state: ProjectLifecycleState, records: ProjectRecord<unknown>[]): ProjectPassportSummary {
  return {
    tenantId: state.tenantId,
    projectId: state.projectId,
    currentPhase: state.currentPhase,
    totalRecords: records.length,
    currentDrawingRevisions: records.filter((record) => record.recordType === 'drawing_revision' && record.approval.status !== 'superseded').length,
    openRisks: records.filter((record) => record.recordType === 'risk_alert' && record.status !== 'closed').length,
    pendingApprovals: records.filter((record) => record.approval.status === 'pending_review').length,
    outstandingPayments: records.filter((record) => record.recordType === 'payment_certificate' && record.status !== 'paid').length,
    missingRequiredRecords: state.requiredRecordTypes.filter((type) => !state.completedRecordTypes.includes(type)),
    nextBestActions: recommendLifecycleActions(state),
  };
}
