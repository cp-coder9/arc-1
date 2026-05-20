import type { UserRole } from '@/types';
import { buildAuditEvent, type AuditEventInput } from './auditService';

export type GovernanceRecordType = 'terms_acceptance' | 'privacy_consent' | 'ai_acknowledgement' | 'kyc_evidence';

export type GovernanceRecordStatus = 'active' | 'withdrawn' | 'expired' | 'rejected' | 'superseded';

export interface GovernanceActor {
  uid: string;
  role?: UserRole | string;
  email?: string;
  displayName?: string;
}

export interface GovernanceRecordInput {
  type: GovernanceRecordType;
  subjectUserId: string;
  actor: GovernanceActor;
  version: string;
  status?: GovernanceRecordStatus;
  projectId?: string;
  purpose?: string;
  evidenceUri?: string;
  evidenceHash?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface GovernanceRecord extends GovernanceRecordInput {
  status: GovernanceRecordStatus;
  createdAt: string;
  immutable: true;
}

const REQUIRED_PURPOSES: Record<GovernanceRecordType, string> = {
  terms_acceptance: 'platform_terms',
  privacy_consent: 'popia_processing',
  ai_acknowledgement: 'ai_advisory_limitations',
  kyc_evidence: 'payment_kyc',
};

export function buildGovernanceRecord(input: GovernanceRecordInput): GovernanceRecord {
  if (!input.subjectUserId?.trim()) throw new Error('Governance subjectUserId is required');
  if (!input.actor?.uid?.trim()) throw new Error('Governance actor uid is required');
  if (!input.version?.trim()) throw new Error('Governance record version is required');

  const purpose = input.purpose?.trim() || REQUIRED_PURPOSES[input.type];

  if (input.type === 'kyc_evidence' && !input.evidenceUri && !input.evidenceHash) {
    throw new Error('KYC evidence requires an evidenceUri or evidenceHash');
  }

  return {
    ...input,
    purpose,
    version: input.version.trim(),
    status: input.status || 'active',
    metadata: input.metadata || {},
    createdAt: input.createdAt || new Date().toISOString(),
    immutable: true,
  };
}

export function buildGovernanceAuditInput(record: GovernanceRecord): AuditEventInput {
  return buildAuditEvent({
    category: record.type === 'kyc_evidence' ? 'verification' : record.type === 'ai_acknowledgement' ? 'ai' : 'profile',
    action: `governance.${record.type}.${record.status}`,
    actor: record.actor,
    target: {
      type: record.type,
      id: record.subjectUserId,
      projectId: record.projectId,
    },
    metadata: {
      version: record.version,
      purpose: record.purpose,
      evidenceUri: record.evidenceUri,
      evidenceHash: record.evidenceHash,
      expiresAt: record.expiresAt,
      ...record.metadata,
    },
    createdAt: record.createdAt,
  });
}

export function hasActiveGovernanceRecord(
  records: GovernanceRecord[],
  type: GovernanceRecordType,
  now = new Date(),
): boolean {
  return records.some(record => {
    if (record.type !== type || record.status !== 'active') return false;
    if (!record.expiresAt) return true;
    return new Date(record.expiresAt).getTime() > now.getTime();
  });
}

export function getMissingGovernancePrerequisites(
  records: GovernanceRecord[],
  requiredTypes: GovernanceRecordType[],
  now = new Date(),
): GovernanceRecordType[] {
  return requiredTypes.filter(type => !hasActiveGovernanceRecord(records, type, now));
}

export function assertGovernancePrerequisites(
  records: GovernanceRecord[],
  requiredTypes: GovernanceRecordType[],
  now = new Date(),
): void {
  const missing = getMissingGovernancePrerequisites(records, requiredTypes, now);
  if (missing.length > 0) {
    const error = new Error(`Missing governance prerequisites: ${missing.join(', ')}`);
    (error as Error & { status?: number; missingPrerequisites?: GovernanceRecordType[] }).status = 409;
    (error as Error & { status?: number; missingPrerequisites?: GovernanceRecordType[] }).missingPrerequisites = missing;
    throw error;
  }
}
