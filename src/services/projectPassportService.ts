import { evaluateLifecycle } from '@/services/lifecycleEngine';
import { evaluateRisks } from '@/services/riskEngine';
import {
  buildSpecForgePassportData,
  specForgeRiskFindings,
} from '@/services/specforge/specforgePassportAdapter';
import { getSpecForgeRepository } from '@/services/specforge/specforgeRepository';
import { createWorkflowEvent } from '@/services/inboxEventAdapter';
import type { SpecForgeWorkspace } from '@/types/specforgeTypes';
import type {
  ArchitexRole,
  Priority,
  ProjectMetadata,
  ProjectPassport,
  ProjectRecord,
  TeamAppointmentSummary,
  WorkflowEvent,
} from '@/services/lifecycleTypes';

/**
 * Build a comprehensive Project Passport from project metadata and records.
 * The passport includes lifecycle evaluation, risk findings, team appointments,
 * status summaries for approvals, documents, finances, and SpecForge spec data.
 */
export function buildProjectPassport(
  metadata: ProjectMetadata,
  records: ProjectRecord[],
  specForgeWorkspace?: SpecForgeWorkspace | null,
): ProjectPassport {
  const lifecycle = evaluateLifecycle(metadata, records);
  const riskFindings = evaluateRisks(metadata, records, lifecycle);

  // SpecForge passport data (Req 7.1, 7.2, 7.3, 7.6)
  const specForgeData = buildSpecForgePassportData(specForgeWorkspace ?? null);
  const specForgeRisks = specForgeRiskFindings(specForgeData);

  // Determine risk level — escalate to high if SpecForge budget risk detected (Req 7.5)
  let riskLevel: Priority = riskFindings[0]?.priority ?? (lifecycle.mayAdvance ? 'low' : 'medium');
  if (specForgeRisks.length > 0) {
    const specRiskPriority = specForgeRisks[0].priority;
    const priorityRank: Record<Priority, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    if (priorityRank[specRiskPriority] > priorityRank[riskLevel]) {
      riskLevel = specRiskPriority;
    }
  }

  return {
    ...metadata,
    appointments: appointmentSummaries(records),
    approvalStatus: approvalStatus(records),
    documentStatus: documentStatus(records),
    financialStatus: financialStatus(records),
    lifecycle,
    riskLevel,
    specForge: {
      budgetSummary: specForgeData.budgetSummary
        ? { ...specForgeData.budgetSummary, deltaPct: specForgeData.budgetSummary.deltaPct ?? 0 }
        : null,
      readiness: specForgeData.readiness,
      issueStatus: specForgeData.issueStatus,
      latestRevision: specForgeData.latestRevision,
    },
  };
}

/**
 * Create a WorkflowEvent of type `project_phase_changed` when a specification is issued.
 * Should be called after issueSpecification completes successfully (Req 7.4).
 */
export function createSpecIssuedWorkflowEvent(params: {
  projectId: string;
  snapshotId: string;
  issuedAt: string;
  revision: string;
}): WorkflowEvent {
  return createWorkflowEvent({
    type: 'project_phase_changed',
    projectId: params.projectId,
    title: `Specification issued — Revision ${params.revision}`,
    detail: `Specification snapshot ${params.snapshotId} issued at ${params.issuedAt} (Revision ${params.revision}).`,
    priority: 'medium',
    assignedRoles: ['architect', 'client_developer', 'quantity_surveyor'],
    sourceModule: 'projects',
    createdAt: params.issuedAt,
  });
}

/**
 * Build a passport with SpecForge data fetched from the repository.
 * Convenience wrapper that loads the workspace for the given project.
 */
export async function buildProjectPassportWithSpecForge(
  metadata: ProjectMetadata,
  records: ProjectRecord[],
): Promise<ProjectPassport> {
  let workspace: SpecForgeWorkspace | null = null;
  try {
    const repo = getSpecForgeRepository();
    workspace = await repo.getWorkspace(metadata.projectId);
  } catch {
    // If SpecForge repository is unavailable, proceed without spec data (Req 7.6)
    workspace = null;
  }
  return buildProjectPassport(metadata, records, workspace);
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
