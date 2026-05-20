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

export type AdminGovernanceQueueType =
  | 'human_approval'
  | 'dispute'
  | 'payment'
  | 'ai_review'
  | 'statutory_sync'
  | 'audit_exception';

export type AdminGovernanceQueueSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface AdminGovernanceQueueSource {
  id: string;
  type: AdminGovernanceQueueType;
  status: string;
  projectId?: string;
  ownerRole?: UserRole | string;
  assignedRole?: UserRole | string;
  dueAt?: string;
  createdAt?: string;
  severity?: AdminGovernanceQueueSeverity;
  blockedReason?: string;
  humanGateRequired?: boolean;
  aiGenerated?: boolean;
  personalDataPresent?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AdminGovernanceQueueItem {
  id: string;
  type: AdminGovernanceQueueType;
  status: string;
  projectId?: string;
  ownerRole?: UserRole | string;
  assignedRole?: UserRole | string;
  dueAt?: string;
  createdAt?: string;
  severity: AdminGovernanceQueueSeverity;
  priority: number;
  blocked: boolean;
  blockedReason?: string;
  requiresHumanGate: boolean;
  aiMayNotResolve: boolean;
  redactedForAdminSummary: boolean;
  metadata: Record<string, unknown>;
}

export interface AdminGovernanceQueueSummary {
  generatedAt: string;
  totalOpen: number;
  countsByType: Record<AdminGovernanceQueueType, number>;
  blockedCount: number;
  overdueCount: number;
  criticalCount: number;
  humanGateRequiredCount: number;
  aiMayNotResolve: true;
  items: AdminGovernanceQueueItem[];
}

const ADMIN_QUEUE_TYPES: AdminGovernanceQueueType[] = [
  'human_approval',
  'dispute',
  'payment',
  'ai_review',
  'statutory_sync',
  'audit_exception',
];

const CLOSED_ADMIN_QUEUE_STATUSES = new Set(['closed', 'resolved', 'dismissed', 'cancelled', 'approved', 'rejected']);

const SEVERITY_PRIORITY: Record<AdminGovernanceQueueSeverity, number> = {
  critical: 400,
  high: 300,
  medium: 200,
  low: 100,
};

function isAdminQueueOpen(status: string): boolean {
  return !CLOSED_ADMIN_QUEUE_STATUSES.has(status.trim().toLowerCase());
}

function normalizeAdminQueueSeverity(
  source: AdminGovernanceQueueSource,
  now: Date,
): AdminGovernanceQueueSeverity {
  if (source.severity) return source.severity;
  if (source.blockedReason) return 'high';
  if (source.dueAt && new Date(source.dueAt).getTime() < now.getTime()) return 'high';
  if (source.type === 'dispute' || source.type === 'payment' || source.type === 'audit_exception') return 'high';
  if (source.type === 'ai_review' || source.type === 'statutory_sync') return 'medium';
  return 'low';
}

function buildAdminQueuePriority(
  item: Pick<AdminGovernanceQueueItem, 'severity' | 'blocked' | 'dueAt' | 'createdAt'>,
  now: Date,
): number {
  const dueAt = item.dueAt ? new Date(item.dueAt).getTime() : undefined;
  const createdAt = item.createdAt ? new Date(item.createdAt).getTime() : undefined;
  const overdueBoost = dueAt && dueAt < now.getTime() ? 80 : 0;
  const blockedBoost = item.blocked ? 60 : 0;
  const ageBoost = createdAt ? Math.min(50, Math.max(0, Math.floor((now.getTime() - createdAt) / 86_400_000))) : 0;
  return SEVERITY_PRIORITY[item.severity] + overdueBoost + blockedBoost + ageBoost;
}

export function buildAdminGovernanceQueueSummary(
  sources: AdminGovernanceQueueSource[],
  now = new Date(),
): AdminGovernanceQueueSummary {
  const countsByType = Object.fromEntries(ADMIN_QUEUE_TYPES.map(type => [type, 0])) as Record<AdminGovernanceQueueType, number>;

  const items = sources
    .filter(source => isAdminQueueOpen(source.status))
    .map((source): AdminGovernanceQueueItem => {
      if (!source.id?.trim()) throw new Error('Admin governance queue source id is required');
      const severity = normalizeAdminQueueSeverity(source, now);
      const blocked = Boolean(source.blockedReason);
      const requiresHumanGate = source.humanGateRequired !== false || source.type === 'ai_review' || source.type === 'statutory_sync';
      const item: AdminGovernanceQueueItem = {
        id: source.id,
        type: source.type,
        status: source.status,
        projectId: source.projectId,
        ownerRole: source.ownerRole,
        assignedRole: source.assignedRole,
        dueAt: source.dueAt,
        createdAt: source.createdAt,
        severity,
        priority: 0,
        blocked,
        blockedReason: source.blockedReason,
        requiresHumanGate,
        aiMayNotResolve: source.aiGenerated === true || requiresHumanGate,
        redactedForAdminSummary: source.personalDataPresent !== false,
        metadata: source.metadata || {},
      };
      return { ...item, priority: buildAdminQueuePriority(item, now) };
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  for (const item of items) countsByType[item.type] += 1;

  return {
    generatedAt: now.toISOString(),
    totalOpen: items.length,
    countsByType,
    blockedCount: items.filter(item => item.blocked).length,
    overdueCount: items.filter(item => item.dueAt && new Date(item.dueAt).getTime() < now.getTime()).length,
    criticalCount: items.filter(item => item.severity === 'critical').length,
    humanGateRequiredCount: items.filter(item => item.requiresHumanGate).length,
    aiMayNotResolve: true,
    items,
  };
}
