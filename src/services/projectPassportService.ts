import { evaluateLifecycle } from '@/services/lifecycleEngine';
import { evaluateRisks } from '@/services/riskEngine';
import type {
  ArchitexRole,
  Priority,
  ProjectMetadata,
  ProjectPassport,
  ProjectRecord,
  RecordStatus,
  TeamAppointmentSummary,
} from '@/services/lifecycleTypes';

/**
 * Build a comprehensive Project Passport from project metadata and records.
 * The passport includes lifecycle evaluation, risk findings, team appointments,
 * and status summaries for approvals, documents, and finances.
 */
export function buildProjectPassport(
  metadata: ProjectMetadata,
  records: ProjectRecord[],
): ProjectPassport {
  const lifecycle = evaluateLifecycle(metadata, records);
  const riskFindings = evaluateRisks(metadata, records, lifecycle);

  return {
    ...metadata,
    appointments: appointmentSummaries(records),
    approvalStatus: approvalStatus(records),
    documentStatus: documentStatus(records),
    financialStatus: financialStatus(records),
    lifecycle,
    riskLevel: riskFindings[0]?.priority ?? (lifecycle.mayAdvance ? 'low' as Priority : 'medium' as Priority),
  };
}

function appointmentSummaries(records: ProjectRecord[]): TeamAppointmentSummary[] {
  return records
    .filter((record) => record.recordType === 'professional_appointment')
    .map((record) => ({
      role: (record.payload.role as ArchitexRole) ?? ('architect' as ArchitexRole),
      appointedParty: String(record.payload.appointedParty ?? 'Unknown'),
      status: record.status,
      recordId: record.id,
    }));
}

function approvalStatus(records: ProjectRecord[]): ProjectPassport['approvalStatus'] {
  const approval = records.find(
    (record) => record.recordType === 'municipal_approval_letter',
  );
  if (!approval) return 'missing';
  return approval.status === 'approved' || approval.status === 'issued'
    ? 'approved'
    : 'pending';
}

function documentStatus(records: ProjectRecord[]): ProjectPassport['documentStatus'] {
  const issued = records.some(
    (record) =>
      ['technical_drawings', 'municipal_submission_pack', 'tender_pack'].includes(
        record.recordType,
      ) && record.status === 'issued',
  );
  const ready = records.some(
    (record) =>
      ['concept_drawings', 'technical_drawings'].includes(record.recordType) &&
      ['approved', 'issued'].includes(record.status),
  );
  return issued ? 'issued' : ready ? 'ready' : 'incomplete';
}

function financialStatus(records: ProjectRecord[]): ProjectPassport['financialStatus'] {
  const payment = records.find(
    (record) => record.recordType === 'payment_certificate',
  );
  if (!payment) return 'not_started';
  return payment.status === 'pending_review' ? 'pending_review' : 'current';
}
