import type { BaseContext, WorkflowRecord } from '../types/agentOrchestration';
import type { ProjectRecord, ProjectPhase, ProductModuleKey, ProjectRecordType, ApprovalMetadata, AuditMetadata } from '../types/architexMasterTypes';
import type { SiteProjectRecord } from '../types';
import { ORCHESTRATION_MODULE_KEY } from '../types/agentOrchestration';

export const TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY = 'trust_verification_compliance';

let seq = 1;
const projectRecordStore: ProjectRecord[] = [];

export function toProjectRecord(
  ctx: BaseContext,
  recordTypeOrRecord: string | WorkflowRecord,
  title?: string,
  status?: string,
  payload?: Record<string, unknown>,
  linkedRecordIds?: string[],
): ProjectRecord {
  const approval: ApprovalMetadata = {
    status: 'approved',
    requiredApproverRoles: [],
  };

  const audit: AuditMetadata & { createdBy: string } = {
    createdByUserId: ctx.userId,
    createdAt: ctx.now ?? new Date().toISOString(),
    source: 'agent',
    revision: 1,
    createdBy: ctx.userId,
  };

  const id = `pr-trust-compliance-${seq++}`;
  const record: ProjectRecord & { recordId: string; audit: AuditMetadata & { createdBy: string } } = {
    id,
    recordId: id,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    phase: guessPhase(ctx.now),
    moduleKey: TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY as unknown as ProductModuleKey,
    recordType: recordTypeOrRecord as ProjectRecordType,
    title: title ?? '',
    status: status ?? 'active',
    payload: payload ?? {},
    approval,
    audit,
    linkedRecordIds: linkedRecordIds ?? [],
  };
  projectRecordStore.push(record);
  return record;
}

export function getProjectRecord(recordId: string): ProjectRecord | undefined {
  return projectRecordStore.find((r) => r.id === recordId);
}

export function getProjectRecords(projectId: string): ProjectRecord[] {
  return projectRecordStore.filter((r) => r.projectId === projectId);
}

export function resetProjectRecordState(): void {
  projectRecordStore.length = 0;
}

export async function createProjectRecord(params: {
  projectId: string;
  tenantId: string;
  phase: string;
  recordType: string;
  title: string;
  status: string;
  payload: unknown;
  linkedRecordIds: string[];
  createdBy: string;
}): Promise<string> {
  return `record-${seq++}-${params.recordType}`;
}

export function projectRecordsFromDocuments(
  _docs: unknown[],
  _dwgs: unknown[],
): Array<{ recordType: string; title: string; status: string }> {
  return [
    { recordType: 'document', title: 'Document Register', status: 'active' },
    { recordType: 'drawing_revision', title: 'Drawing Register', status: 'active' },
  ];
}

export function subscribeToProjectRecords(
  projectId: string,
  callback: (records: SiteProjectRecord[]) => void,
): () => void {
  callback([]);
  return () => {};
}

// ── Trust/Verification Compliance Mappers ────────────────────────────────────────

interface ProfessionalRegistration {
  userId: string;
  professionalBody: string;
  registrationNumber: string;
  category: string;
  expiryDate: string;
}

interface CompanyDocument {
  entityId: string;
  entityType: string;
  documentType: string;
  title: string;
  documentUrl: string;
}

interface InsuranceCompliance {
  entityId: string;
  entityType: string;
  professionalBody: string;
  provider: string;
  policyNumber: string;
  coverageAmountCents: number;
  issuedAt: string;
  expiresAt: string;
  certificateUrl: string;
}

interface ContractorCompliance {
  entityId: string;
  entityType: string;
  checks: Array<{ checkType: string; status: string }>;
}

interface ComplianceRisk {
  entityId: string;
  entityType: string;
  riskLevel: string;
  triggers: Array<{ triggerType: string; severity: string; description: string }>;
}

interface VerificationBadge {
  badgeType: string;
  entityId: string;
  entityType: string;
  provenance: string;
}

function makeProjectRecord(ctx: BaseContext, recordType: string, title: string, status: string, payload: Record<string, unknown>, linkedRecordIds?: string[]): ProjectRecord {
  const record: ProjectRecord = {
    id: `pr-trust-compliance-${seq++}`,
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    phase: 'design_coordination' as ProjectPhase,
    moduleKey: TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY as unknown as ProductModuleKey,
    recordType: recordType as ProjectRecordType,
    title,
    status,
    payload,
    approval: { status: 'draft', requiredApproverRoles: [] },
    audit: { createdByUserId: ctx.userId, createdAt: ctx.now ?? new Date().toISOString(), source: 'agent', revision: 1 },
    linkedRecordIds: linkedRecordIds ?? [],
  };
  projectRecordStore.push(record);
  return record;
}

export function professionalRegistrationToProjectRecord(ctx: BaseContext, registration: ProfessionalRegistration): ProjectRecord {
  return makeProjectRecord(ctx, 'professional_registration', `${registration.professionalBody} - ${registration.registrationNumber}`, 'pending', registration as unknown as Record<string, unknown>);
}

export function companyDocumentToProjectRecord(ctx: BaseContext, doc: CompanyDocument): ProjectRecord {
  return makeProjectRecord(ctx, 'company_document', doc.title, 'active', doc as unknown as Record<string, unknown>);
}

export function insuranceComplianceToProjectRecord(ctx: BaseContext, insurance: InsuranceCompliance): ProjectRecord {
  return makeProjectRecord(ctx, 'insurance_compliance', `${insurance.provider} - ${insurance.policyNumber}`, 'active', insurance as unknown as Record<string, unknown>);
}

export function contractorComplianceToProjectRecord(ctx: BaseContext, compliance: ContractorCompliance): ProjectRecord {
  const overallStatus = compliance.checks.every((c) => c.status === 'compliant') ? 'compliant' : 'non_compliant';
  return makeProjectRecord(ctx, 'contractor_supplier_compliance', 'Contractor Compliance Check', overallStatus, compliance as unknown as Record<string, unknown>);
}

export function complianceRiskToProjectRecord(ctx: BaseContext, risk: ComplianceRisk): ProjectRecord {
  return makeProjectRecord(ctx, 'compliance_risk', `Compliance Risk: ${risk.riskLevel}`, risk.riskLevel, risk as unknown as Record<string, unknown>);
}

export function verificationBadgeToProjectRecord(ctx: BaseContext, badge: VerificationBadge): ProjectRecord {
  return makeProjectRecord(ctx, 'verification_badge', `Badge: ${badge.badgeType}`, 'issued', badge as unknown as Record<string, unknown>);
}

function guessPhase(_now: string): ProjectPhase {
  return 'design_coordination';
}
