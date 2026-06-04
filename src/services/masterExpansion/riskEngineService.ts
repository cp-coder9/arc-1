import { ProjectRecord } from '@/types/architexMasterTypes';

export interface RiskFinding {
  code: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}

export function detectProjectRisks(records: ProjectRecord<unknown>[]): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const hasAppointment = records.some((record) => record.recordType === 'practice_record' && record.title.toLowerCase().includes('appointment'));
  const hasDrawingRevision = records.some((record) => record.recordType === 'drawing_revision');
  const unpaidPayments = records.filter((record) => record.recordType === 'payment_certificate' && record.status !== 'paid');
  const pendingFormalApprovals = records.filter((record) => record.approval.status === 'pending_review' && record.approval.requiredApproverRoles.length > 0);
  const unverifiedListings = records.filter((record) => record.recordType === 'marketplace_listing' && record.status.includes('pending'));

  if (!hasAppointment) findings.push({ code: 'NO_APPOINTMENT_RECORD', severity: 'high', message: 'No appointment record found. Confirm professional appointment before formal work proceeds.' });
  if (!hasDrawingRevision) findings.push({ code: 'NO_DRAWING_REVISION', severity: 'medium', message: 'No current drawing revision is recorded for the project.' });
  if (unpaidPayments.length > 0) findings.push({ code: 'OUTSTANDING_PAYMENT', severity: 'medium', message: `${unpaidPayments.length} payment record(s) appear outstanding.` });
  if (pendingFormalApprovals.length > 0) findings.push({ code: 'PENDING_APPROVALS', severity: 'high', message: `${pendingFormalApprovals.length} record(s) require professional/admin review.` });
  if (unverifiedListings.length > 0) findings.push({ code: 'MARKETPLACE_VERIFICATION_PENDING', severity: 'medium', message: 'Marketplace/candidate-professional listing requires verification before use.' });

  return findings;
}
