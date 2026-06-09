/**
 * ProjectRecord Adapter — Trust, Verification & Compliance
 *
 * Maps trust/verification/compliance records to ProjectRecord format
 * for the Project Passport lifecycle.
 *
 * Module Key: trust_verification_compliance
 */

import type { ProfessionalRegistrationRecord } from './professionalRegistrationService';
import type { CompanyDocumentRecord } from './companyDocumentService';
import type { InsuranceComplianceRecord } from './insuranceComplianceService';
import type { ContractorComplianceRecord } from './contractorSupplierComplianceService';
import type { ConsentRecord, DataSubjectRequest, BreachNotification } from './popiaGovernanceService';
import type { VerificationBadge } from './verificationBadgeService';
import type { ComplianceRiskScore } from './complianceRiskService';

// ── Types ──────────────────────────────────────────────────────────────────────

export const TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY = 'trust_verification_compliance';

export type ProjectRecordType =
  | 'professional_registration'
  | 'company_document'
  | 'insurance_compliance'
  | 'contractor_supplier_compliance'
  | 'data_processing_register'
  | 'consent_record'
  | 'data_subject_request'
  | 'breach_notification'
  | 'verification_badge'
  | 'compliance_risk'
  | 'governance_decision'
  | 'audit_entry';

export interface BaseProjectContext {
  tenantId: string;
  projectId: string;
  userId: string;
  actorRole?: string;
}

export interface ProjectRecord {
  recordId: string;
  tenantId: string;
  projectId: string;
  moduleKey: string;
  recordType: ProjectRecordType;
  title: string;
  status: string;
  payload: Record<string, unknown>;
  linkedRecordIds: string[];
  audit: {
    createdBy: string;
    createdAt: string;
  };
}

// ── Sequence counter ───────────────────────────────────────────────────────────

let recordSeq = 1;
const projectRecords: ProjectRecord[] = [];

function nextRecordId(): string {
  return `pr-trust-compliance-${String(recordSeq++).padStart(6, '0')}`;
}

// ── Core adapter ───────────────────────────────────────────────────────────────

export function toProjectRecord(
  ctx: BaseProjectContext,
  recordType: ProjectRecordType,
  title: string,
  status: string,
  payload: Record<string, unknown>,
  linkedRecordIds: string[] = [],
): ProjectRecord {
  const record: ProjectRecord = {
    recordId: nextRecordId(),
    tenantId: ctx.tenantId,
    projectId: ctx.projectId,
    moduleKey: TRUST_VERIFICATION_COMPLIANCE_MODULE_KEY,
    recordType,
    title,
    status,
    payload,
    linkedRecordIds,
    audit: {
      createdBy: ctx.userId,
      createdAt: new Date().toISOString(),
    },
  };
  projectRecords.push(record);
  return record;
}

// ── Record-type-specific adapters ──────────────────────────────────────────────

export function professionalRegistrationToProjectRecord(
  ctx: BaseProjectContext,
  registration: ProfessionalRegistrationRecord,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'professional_registration',
    `Professional Registration: ${registration.professionalBody} ${registration.registrationNumber}`,
    registration.status,
    registration as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function companyDocumentToProjectRecord(
  ctx: BaseProjectContext,
  document: CompanyDocumentRecord,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'company_document',
    `Company Document: ${document.title}`,
    document.status,
    document as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function insuranceComplianceToProjectRecord(
  ctx: BaseProjectContext,
  insurance: InsuranceComplianceRecord,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'insurance_compliance',
    `PI Insurance: ${insurance.provider} — ${insurance.policyNumber}`,
    insurance.status,
    insurance as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function contractorComplianceToProjectRecord(
  ctx: BaseProjectContext,
  compliance: ContractorComplianceRecord,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'contractor_supplier_compliance',
    `Contractor Compliance: ${compliance.entityId} (${compliance.entityType})`,
    compliance.overallStatus,
    compliance as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function complianceRiskToProjectRecord(
  ctx: BaseProjectContext,
  risk: ComplianceRiskScore,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'compliance_risk',
    `Compliance Risk: ${risk.entityType} ${risk.entityId} (${risk.riskLevel})`,
    risk.riskLevel,
    risk as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function verificationBadgeToProjectRecord(
  ctx: BaseProjectContext,
  badge: VerificationBadge,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'verification_badge',
    `Verification Badge: ${badge.badgeType} (${badge.provenance})`,
    'issued',
    badge as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function consentRecordToProjectRecord(
  ctx: BaseProjectContext,
  consent: ConsentRecord,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'consent_record',
    `POPIA Consent: ${consent.purpose} (${consent.status})`,
    consent.status,
    consent as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function dataSubjectRequestToProjectRecord(
  ctx: BaseProjectContext,
  request: DataSubjectRequest,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'data_subject_request',
    `Data Subject Request: ${request.requestType} (${request.status})`,
    request.status,
    request as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

export function breachNotificationToProjectRecord(
  ctx: BaseProjectContext,
  breach: BreachNotification,
  linkedRecordIds?: string[],
): ProjectRecord {
  return toProjectRecord(
    ctx, 'breach_notification',
    `Breach Notification: ${breach.breachType} (${breach.severity})`,
    breach.ibaNotified ? 'iba_notified' : 'pending_notification',
    breach as unknown as Record<string, unknown>,
    linkedRecordIds,
  );
}

// ── Queries ────────────────────────────────────────────────────────────────────

export function getProjectRecord(recordId: string): ProjectRecord | undefined {
  return projectRecords.find((r) => r.recordId === recordId);
}

export function getProjectRecords(projectId: string): ProjectRecord[] {
  return projectRecords.filter((r) => r.projectId === projectId);
}

// ── Reset (for testing) ────────────────────────────────────────────────────────

export function resetProjectRecordState(): void {
  projectRecords.length = 0;
  recordSeq = 1;
}
