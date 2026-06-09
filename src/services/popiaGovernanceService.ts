// ── Types ──────────────────────────────────────────────────────────────────────

export type DataProcessingPurpose =
  | 'platform_operation'
  | 'professional_verification'
  | 'project_management'
  | 'payment_processing'
  | 'marketplace_matching'
  | 'compliance_verification'
  | 'audit_logging'
  | 'communication'
  | 'ai_advisory';

export type DataCategory =
  | 'personal_identifying'
  | 'contact_details'
  | 'professional_credentials'
  | 'financial_information'
  | 'project_data'
  | 'compliance_documents'
  | 'biometric_data'
  | 'special_personal_information';

export type LegalBasis =
  | 'consent'
  | 'contract_necessity'
  | 'legal_obligation'
  | 'legitimate_interest'
  | 'public_interest'
  | 'vital_interest';

export type ConsentStatus =
  | 'granted'
  | 'withdrawn'
  | 'expired'
  | 'never_granted';

export type DataSubjectRequestType =
  | 'access'
  | 'rectify'
  | 'erase'
  | 'restrict'
  | 'port'
  | 'object';

export type DataSubjectRequestStatus =
  | 'received'
  | 'verifying_identity'
  | 'in_progress'
  | 'completed'
  | 'refused'
  | 'extended';

export type BreachSeverity =
  | 'low'
  | 'medium'
  | 'high'
  | 'critical';

export interface DataProcessingRegisterEntry {
  id?: string;
  purpose: DataProcessingPurpose;
  description: string;
  dataCategories: DataCategory[];
  dataSubjectCategories: string[];
  legalBasis: LegalBasis;
  retentionPeriodDays: number;
  recipientCategories: string[];
  crossBorderTransfer: boolean;
  crossBorderSafeguards?: string;
  reviewDate: string;
  dpoApproved: boolean;
  createdAt: string;
  updatedAt: string;
  immutable: true;
}

export interface ConsentRecord {
  id?: string;
  userId: string;
  purpose: DataProcessingPurpose;
  status: ConsentStatus;
  grantedAt?: string;
  withdrawnAt?: string;
  expiresAt?: string;
  consentVersion: string;
  consentText?: string;
  popiaNoticeProvided: boolean;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export interface DataSubjectRequest {
  id?: string;
  userId: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  description: string;
  receivedAt: string;
  identityVerified: boolean;
  dueAt: string; // POPIA: 30 days from receipt
  extendedDueAt?: string; // If extension invoked
  completedAt?: string;
  refusalReason?: string;
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export interface BreachNotification {
  id?: string;
  breachType: string;
  description: string;
  severity: BreachSeverity;
  dataCategories: DataCategory[];
  affectedDataSubjects: number;
  discoveredAt: string;
  notifiedAt?: string;
  ibaNotified: boolean; // Information Regulator
  ibaNotifiedAt?: string;
  dataSubjectsNotified: boolean;
  dataSubjectsNotifiedAt?: string;
  mitigationSteps: string[];
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const POPIA_RESPONSE_DAYS = 30;
export const POPIA_EXTENSION_DAYS = 30;
export const BREACH_NOTIFICATION_HOURS = 72; // IBA notification within 72 hours
export const DEFAULT_RETENTION_PERIOD_DAYS = 5 * 365; // 5 years default

export const DATA_RETENTION_PERIODS: Record<DataProcessingPurpose, number> = {
  platform_operation: 7 * 365, // 7 years — tax & legal
  professional_verification: 5 * 365, // 5 years
  project_management: 15 * 365, // 15 years — construction liability
  payment_processing: 7 * 365, // 7 years — financial records
  marketplace_matching: 3 * 365, // 3 years
  compliance_verification: 10 * 365, // 10 years — statutory
  audit_logging: 10 * 365, // 10 years
  communication: 3 * 365, // 3 years
  ai_advisory: 5 * 365, // 5 years
};

const VALID_PURPOSES = new Set([
  'platform_operation', 'professional_verification', 'project_management',
  'payment_processing', 'marketplace_matching', 'compliance_verification',
  'audit_logging', 'communication', 'ai_advisory',
]);

const VALID_CONSENT_STATUSES = new Set(['granted', 'withdrawn', 'expired', 'never_granted']);

const VALID_REQUEST_TYPES = new Set(['access', 'rectify', 'erase', 'restrict', 'port', 'object']);

const VALID_REQUEST_STATUSES = new Set([
  'received', 'verifying_identity', 'in_progress', 'completed', 'refused', 'extended',
]);

const VALID_BREACH_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
}

// ── Data Processing Register ───────────────────────────────────────────────────

export function buildDataProcessingRegisterEntry(input: {
  purpose: DataProcessingPurpose;
  description: string;
  dataCategories: DataCategory[];
  dataSubjectCategories: string[];
  legalBasis: LegalBasis;
  retentionPeriodDays?: number;
  recipientCategories?: string[];
  crossBorderTransfer?: boolean;
  crossBorderSafeguards?: string;
  dpoApproved?: boolean;
}): DataProcessingRegisterEntry {
  assertNonEmpty(input.purpose, 'purpose');
  assertNonEmpty(input.description, 'description');

  if (!VALID_PURPOSES.has(input.purpose)) {
    throw Object.assign(new Error(`Invalid data processing purpose: ${input.purpose}`), { status: 400 });
  }

  if (!input.dataCategories?.length) {
    throw Object.assign(new Error('At least one data category is required'), { status: 400 });
  }

  if (!input.dataSubjectCategories?.length) {
    throw Object.assign(new Error('At least one data subject category is required'), { status: 400 });
  }

  const retentionPeriodDays = input.retentionPeriodDays || DATA_RETENTION_PERIODS[input.purpose] || DEFAULT_RETENTION_PERIOD_DAYS;
  const now = new Date().toISOString();
  const reviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(); // Annual review

  return {
    purpose: input.purpose,
    description: input.description.trim(),
    dataCategories: [...input.dataCategories],
    dataSubjectCategories: [...input.dataSubjectCategories],
    legalBasis: input.legalBasis,
    retentionPeriodDays,
    recipientCategories: input.recipientCategories || [],
    crossBorderTransfer: input.crossBorderTransfer || false,
    crossBorderSafeguards: input.crossBorderSafeguards?.trim(),
    reviewDate,
    dpoApproved: input.dpoApproved || false,
    createdAt: now,
    updatedAt: now,
    immutable: true,
  };
}

// ── Consent Management ─────────────────────────────────────────────────────────

export function buildConsentRecord(input: {
  userId: string;
  purpose: DataProcessingPurpose;
  consentVersion: string;
  consentText?: string;
  retentionDays?: number;
}): ConsentRecord {
  assertNonEmpty(input.userId, 'userId');
  assertNonEmpty(input.consentVersion, 'consentVersion');

  if (!VALID_PURPOSES.has(input.purpose)) {
    throw Object.assign(new Error(`Invalid consent purpose: ${input.purpose}`), { status: 400 });
  }

  const retentionDays = input.retentionDays || DATA_RETENTION_PERIODS[input.purpose] || DEFAULT_RETENTION_PERIOD_DAYS;
  const now = new Date().toISOString();

  return {
    userId: input.userId.trim(),
    purpose: input.purpose,
    status: 'granted',
    grantedAt: now,
    consentVersion: input.consentVersion.trim(),
    consentText: input.consentText?.trim(),
    popiaNoticeProvided: true,
    retentionDays,
    createdAt: now,
    updatedAt: now,
    immutable: true,
    metadata: {
      popiaSection: 'Section 11 (Consent)',
      rightsInfo: 'Data subject may withdraw consent at any time per POPIA Section 11(2)(a)',
    },
  };
}

export function assertValidConsent(
  record: Pick<ConsentRecord, 'status' | 'expiresAt' | 'purpose'>,
  options: { now?: Date } = {},
): void {
  const now = options.now || new Date();

  if (record.status === 'never_granted') {
    throw Object.assign(
      new Error(`Consent for "${record.purpose}" has never been granted — explicit consent required`),
      { status: 403 },
    );
  }

  if (record.status === 'withdrawn') {
    throw Object.assign(
      new Error(`Consent for "${record.purpose}" has been withdrawn — processing not permitted`),
      { status: 403 },
    );
  }

  if (record.status === 'expired') {
    throw Object.assign(
      new Error(`Consent for "${record.purpose}" has expired — renewal required`),
      { status: 403 },
    );
  }

  if (record.expiresAt) {
    const expiryTime = new Date(record.expiresAt).getTime();
    if (expiryTime < now.getTime()) {
      throw Object.assign(
        new Error(`Consent for "${record.purpose}" expired on ${new Date(record.expiresAt).toISOString()}`),
        { status: 403 },
      );
    }
  }
}

export function getMissingConsents(
  records: ConsentRecord[],
  requiredPurposes: DataProcessingPurpose[],
  now = new Date(),
): DataProcessingPurpose[] {
  return requiredPurposes.filter((purpose) => {
    const record = records.find((r) => r.purpose === purpose);
    if (!record) return true;
    try {
      assertValidConsent(record, { now });
      return false;
    } catch {
      return true;
    }
  });
}

// ── Data Subject Request ───────────────────────────────────────────────────────

export function buildDataSubjectRequest(input: {
  userId: string;
  requestType: DataSubjectRequestType;
  description: string;
}): DataSubjectRequest {
  assertNonEmpty(input.userId, 'userId');
  assertNonEmpty(input.description, 'description');

  if (!VALID_REQUEST_TYPES.has(input.requestType)) {
    throw Object.assign(
      new Error(`Invalid data subject request type: ${input.requestType}`),
      { status: 400 },
    );
  }

  const now = new Date();
  const dueAt = new Date(now.getTime() + POPIA_RESPONSE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const nowISO = now.toISOString();

  return {
    userId: input.userId.trim(),
    requestType: input.requestType,
    status: 'received',
    description: input.description.trim(),
    receivedAt: nowISO,
    identityVerified: false,
    dueAt,
    createdAt: nowISO,
    updatedAt: nowISO,
    immutable: true,
    metadata: {
      popiaSection: 'Section 23 (Access to Personal Information)',
      sla: `${POPIA_RESPONSE_DAYS} days from receipt`,
    },
  };
}

export function getDataSubjectRequestSla(
  request: DataSubjectRequest,
  now = new Date(),
): { daysRemaining: number; isOverdue: boolean; isCritical: boolean } {
  const dueTime = new Date(request.dueAt).getTime();
  const msRemaining = dueTime - now.getTime();
  const daysRemaining = Math.ceil(msRemaining / 86_400_000);

  return {
    daysRemaining: Math.max(0, daysRemaining),
    isOverdue: daysRemaining < 0,
    isCritical: daysRemaining <= 5 && daysRemaining >= 0,
  };
}

// ── Breach Notification ────────────────────────────────────────────────────────

export function buildBreachNotification(input: {
  breachType: string;
  description: string;
  severity: BreachSeverity;
  dataCategories: DataCategory[];
  affectedDataSubjects: number;
  mitigationSteps?: string[];
}): BreachNotification {
  assertNonEmpty(input.breachType, 'breachType');
  assertNonEmpty(input.description, 'description');

  if (!VALID_BREACH_SEVERITIES.has(input.severity)) {
    throw Object.assign(new Error(`Invalid breach severity: ${input.severity}`), { status: 400 });
  }

  if (!input.dataCategories?.length) {
    throw Object.assign(new Error('At least one affected data category is required'), { status: 400 });
  }

  if (!Number.isInteger(input.affectedDataSubjects) || input.affectedDataSubjects < 1) {
    throw Object.assign(new Error('affectedDataSubjects must be a positive integer'), { status: 400 });
  }

  const now = new Date().toISOString();
  const mustNotifyIbaBy = input.severity === 'critical' || input.severity === 'high';

  return {
    breachType: input.breachType.trim(),
    description: input.description.trim(),
    severity: input.severity,
    dataCategories: [...input.dataCategories],
    affectedDataSubjects: input.affectedDataSubjects,
    discoveredAt: now,
    ibaNotified: false,
    dataSubjectsNotified: false,
    mitigationSteps: input.mitigationSteps || [],
    createdAt: now,
    updatedAt: now,
    immutable: true,
    metadata: {
      popiaSection: 'Section 22 (Notification of Security Compromises)',
      ibaNotificationDeadline: mustNotifyIbaBy
        ? `${BREACH_NOTIFICATION_HOURS} hours from discovery`
        : 'As soon as reasonably possible',
      mustNotifyIba: mustNotifyIbaBy,
    },
  };
}

export function isBreachNotificationOverdue(
  notification: BreachNotification,
  now = new Date(),
): { ibaOverdue: boolean; subjectsOverdue: boolean; hoursSinceDiscovery: number } {
  const discoveredTime = new Date(notification.discoveredAt).getTime();
  const hoursSinceDiscovery = (now.getTime() - discoveredTime) / 3_600_000;

  return {
    ibaOverdue: !notification.ibaNotified && hoursSinceDiscovery > BREACH_NOTIFICATION_HOURS,
    subjectsOverdue: !notification.dataSubjectsNotified && hoursSinceDiscovery > 72,
    hoursSinceDiscovery: Math.round(hoursSinceDiscovery * 10) / 10,
  };
}
