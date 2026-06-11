/**
 * POPIA/PAIA Data Compliance Service
 *
 * South Africa's Protection of Personal Information Act (POPIA) and
 * Promotion of Access to Information Act (PAIA) compliance layer.
 *
 * Features:
 * - Data classification (personal, special_personal, professional, public)
 * - Consent records (opt_in, opt_out, withdrawal)
 * - Data retention schedules per data class
 * - Breach notification workflow (detect, assess, notify, remediate)
 */

import { adminDb } from '../lib/firebase-admin';
import { buildAuditEvent } from './auditService';
import crypto from 'crypto';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DataClassification = 'personal' | 'special_personal' | 'professional' | 'public';

export type ConsentStatus = 'opt_in' | 'opt_out' | 'withdrawn' | 'expired';

export type ConsentPurpose =
  | 'account_management'
  | 'marketing'
  | 'ai_processing'
  | 'verification'
  | 'directory_listing'
  | 'payment_processing'
  | 'compliance';

export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';

export type BreachStatus = 'detected' | 'assessing' | 'notified_regulator' | 'notified_subjects' | 'remediated' | 'closed';

export interface ConsentRecord {
  id: string;
  userId: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  classification: DataClassification[];
  grantedAt: string;
  expiresAt?: string;
  withdrawnAt?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DataRetentionSchedule {
  id: string;
  dataClass: DataClassification;
  collectionName: string;
  fieldPattern?: string;
  retentionPeriodDays: number;
  justification: string;
  destructionMethod: 'hard_delete' | 'anonymize' | 'archive';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BreachNotification {
  id: string;
  breachId: string;
  title: string;
  description: string;
  severity: BreachSeverity;
  status: BreachStatus;
  dataClasses: DataClassification[];
  estimatedRecordsAffected: number;
  detectedAt: string;
  assessedAt?: string;
  regulatorNotifiedAt?: string;
  subjectsNotifiedAt?: string;
  remediatedAt?: string;
  closedAt?: string;
  reportedBy: string;
  assessmentNotes?: string;
  remediationSteps?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DataClassificationResult {
  field: string;
  classification: DataClassification;
  rationale: string;
}

// ── Default retention schedules ───────────────────────────────────────────────

const DEFAULT_RETENTION_SCHEDULES: Omit<DataRetentionSchedule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    dataClass: 'personal',
    collectionName: 'users',
    retentionPeriodDays: 365 * 3, // 3 years after account closure
    justification: 'POPIA s14 — retain while account active + 3 years for legal claims',
    destructionMethod: 'anonymize',
    isActive: true,
  },
  {
    dataClass: 'special_personal',
    collectionName: 'user_verifications',
    retentionPeriodDays: 365 * 5, // 5 years
    justification: 'POPIA s26 — special personal information, professional registration records',
    destructionMethod: 'archive',
    isActive: true,
  },
  {
    dataClass: 'professional',
    collectionName: 'jobs',
    retentionPeriodDays: 365 * 7, // 7 years
    justification: 'Professional services records — architectural practice act requirements',
    destructionMethod: 'archive',
    isActive: true,
  },
  {
    dataClass: 'professional',
    collectionName: 'payments',
    retentionPeriodDays: 365 * 7, // 7 years
    justification: 'Financial records — tax and audit requirements',
    destructionMethod: 'archive',
    isActive: true,
  },
  {
    dataClass: 'professional',
    collectionName: 'submissions',
    retentionPeriodDays: 365 * 5,
    justification: 'Building plan submissions — professional practice records',
    destructionMethod: 'archive',
    isActive: true,
  },
  {
    dataClass: 'public',
    collectionName: 'directory_entries',
    retentionPeriodDays: 365 * 1, // 1 year stale
    justification: 'Public directory — refresh annually',
    destructionMethod: 'hard_delete',
    isActive: true,
  },
];

// ── Data classification lookup ────────────────────────────────────────────────

const FIELD_CLASSIFICATION_RULES: Record<string, DataClassification> = {
  // Special personal information (POPIA s26)
  nhbrcNumber: 'special_personal',
  cidbGrading: 'special_personal',
  sacapNumber: 'special_personal',
  registrationNumber: 'special_personal',
  tradeLicense: 'special_personal',
  idNumber: 'special_personal',
  passportNumber: 'special_personal',

  // Personal information (POPIA s1 definition)
  email: 'personal',
  displayName: 'personal',
  phoneNumber: 'personal',
  phone: 'personal',
  address: 'personal',
  region: 'personal',
  bio: 'personal',
  profileImageUrl: 'personal',
  dateOfBirth: 'personal',

  // Professional
  professionalLabels: 'professional',
  professionalLabel: 'professional',
  verificationStatus: 'professional',
  completedJobs: 'professional',
  averageRating: 'professional',
  totalReviews: 'professional',
  hasPIInsurance: 'professional',
  verificationId: 'professional',

  // Public
  role: 'public',
  firmName: 'public',
  directoryVisibility: 'public',
};

/**
 * Classify a single field.
 */
export function classifyField(fieldName: string): DataClassification {
  return FIELD_CLASSIFICATION_RULES[fieldName] || 'personal';
}

/**
 * Classify an entire data object, returning results per field.
 */
export function classifyDataObject(data: Record<string, unknown>): DataClassificationResult[] {
  return Object.keys(data).map((field) => ({
    field,
    classification: classifyField(field),
    rationale: `Classified as ${classifyField(field)} based on POPIA field mapping`,
  }));
}

/**
 * Get the highest classification from a set of fields.
 */
export function getHighestClassification(classifications: DataClassification[]): DataClassification {
  const order: DataClassification[] = ['public', 'professional', 'personal', 'special_personal'];
  let highest: DataClassification = 'public';
  for (const c of classifications) {
    if (order.indexOf(c) > order.indexOf(highest)) {
      highest = c;
    }
  }
  return highest;
}

// ── Consent management ────────────────────────────────────────────────────────

/**
 * Record user consent for a specific purpose.
 */
export async function recordConsent(input: {
  userId: string;
  purpose: ConsentPurpose;
  status: ConsentStatus;
  classification: DataClassification[];
  ipAddress?: string;
  userAgent?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}): Promise<ConsentRecord> {
  const now = new Date().toISOString();
  const ref = adminDb.collection('popia_consent_records').doc();
  const record: ConsentRecord = {
    id: ref.id,
    userId: input.userId,
    purpose: input.purpose,
    status: input.status,
    classification: input.classification,
    grantedAt: now,
    expiresAt: input.expiresAt,
    withdrawnAt: input.status === 'withdrawn' ? now : undefined,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(record);
  return record;
}

/**
 * Check if a user has active consent for a given purpose.
 */
export async function hasActiveConsent(userId: string, purpose: ConsentPurpose): Promise<boolean> {
  const now = new Date().toISOString();
  const snapshot = await adminDb
    .collection('popia_consent_records')
    .where('userId', '==', userId)
    .where('purpose', '==', purpose)
    .where('status', '==', 'opt_in')
    .orderBy('grantedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return false;

  const record = snapshot.docs[0].data() as ConsentRecord;
  if (record.expiresAt && record.expiresAt < now) {
    // Auto-expire
    await snapshot.docs[0].ref.set({ status: 'expired', updatedAt: now }, { merge: true });
    return false;
  }

  return true;
}

/**
 * Withdraw consent for a specific purpose.
 */
export async function withdrawConsent(
  userId: string,
  purpose: ConsentPurpose,
): Promise<ConsentRecord | null> {
  const snapshot = await adminDb
    .collection('popia_consent_records')
    .where('userId', '==', userId)
    .where('purpose', '==', purpose)
    .where('status', '==', 'opt_in')
    .orderBy('grantedAt', 'desc')
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const now = new Date().toISOString();
  const ref = snapshot.docs[0].ref;
  await ref.set({ status: 'withdrawn', withdrawnAt: now, updatedAt: now }, { merge: true });

  return { id: ref.id, ...snapshot.docs[0].data(), status: 'withdrawn', withdrawnAt: now } as ConsentRecord;
}

/**
 * Get all consent records for a user.
 */
export async function getUserConsents(userId: string): Promise<ConsentRecord[]> {
  const snapshot = await adminDb
    .collection('popia_consent_records')
    .where('userId', '==', userId)
    .orderBy('grantedAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as ConsentRecord));
}

// ── Data retention ────────────────────────────────────────────────────────────

/**
 * Seed default retention schedules if they don't exist.
 */
export async function seedRetentionSchedules(): Promise<void> {
  const existing = await adminDb.collection('popia_data_retention').limit(1).get();
  if (!existing.empty) return;

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  for (const schedule of DEFAULT_RETENTION_SCHEDULES) {
    const ref = adminDb.collection('popia_data_retention').doc();
    batch.set(ref, {
      ...schedule,
      id: ref.id,
      createdAt: now,
      updatedAt: now,
    });
  }
  await batch.commit();
}

/**
 * Get all retention schedules.
 */
export async function getRetentionSchedules(): Promise<DataRetentionSchedule[]> {
  const snapshot = await adminDb.collection('popia_data_retention').get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as DataRetentionSchedule));
}

/**
 * Get retention schedule for a specific data class and collection.
 */
export async function getRetentionForCollection(
  dataClass: DataClassification,
  collectionName: string,
): Promise<DataRetentionSchedule | null> {
  const snapshot = await adminDb
    .collection('popia_data_retention')
    .where('dataClass', '==', dataClass)
    .where('collectionName', '==', collectionName)
    .where('isActive', '==', true)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as DataRetentionSchedule;
}

/**
 * Add or update a retention schedule.
 */
export async function upsertRetentionSchedule(
  input: Omit<DataRetentionSchedule, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<DataRetentionSchedule> {
  const now = new Date().toISOString();
  if (input.id) {
    const ref = adminDb.collection('popia_data_retention').doc(input.id);
    const doc = await ref.get();
    const schedule: DataRetentionSchedule = {
      ...input,
      id: input.id,
      createdAt: doc.exists ? doc.data()!.createdAt : now,
      updatedAt: now,
    };
    await ref.set(schedule, { merge: true });
    return schedule;
  }

  const ref = adminDb.collection('popia_data_retention').doc();
  const schedule: DataRetentionSchedule = {
    ...input,
    id: ref.id,
    createdAt: now,
    updatedAt: now,
  };
  await ref.set(schedule);
  return schedule;
}

// ── Breach notification workflow ──────────────────────────────────────────────

/**
 * Step 1: Detect and report a potential breach.
 */
export async function reportBreach(input: {
  title: string;
  description: string;
  severity: BreachSeverity;
  dataClasses: DataClassification[];
  estimatedRecordsAffected: number;
  reportedBy: string;
  metadata?: Record<string, unknown>;
}): Promise<BreachNotification> {
  const now = new Date().toISOString();
  const breachId = `BR-${now.slice(0, 10)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const ref = adminDb.collection('popia_breach_notifications').doc(breachId);

  const notification: BreachNotification = {
    id: breachId,
    breachId,
    title: input.title,
    description: input.description,
    severity: input.severity,
    status: 'detected',
    dataClasses: input.dataClasses,
    estimatedRecordsAffected: input.estimatedRecordsAffected,
    detectedAt: now,
    reportedBy: input.reportedBy,
    metadata: input.metadata,
    createdAt: now,
    updatedAt: now,
  };

  await ref.set(notification);

  // Audit trail
  const auditEvent = buildAuditEvent({
    category: 'compliance',
    action: 'popia.breach_reported',
    actor: { uid: input.reportedBy, role: 'system', authorizationType: 'popia_breach' },
    target: { type: 'popia_breach', id: breachId },
    metadata: { severity: input.severity, dataClasses: input.dataClasses, estimatedRecordsAffected: input.estimatedRecordsAffected },
  });
  await adminDb.collection('audit_logs').add(auditEvent);

  // Auto-escalate critical breaches
  if (input.severity === 'critical') {
    console.error(`[POPIA] CRITICAL BREACH DETECTED: ${input.title} (${breachId})`);
    console.error(`[POPIA] Affected records: ${input.estimatedRecordsAffected}, Classes: ${input.dataClasses.join(', ')}`);
  }

  return notification;
}

/**
 * Step 2: Assess the breach.
 */
export async function assessBreach(
  breachId: string,
  assessment: { assessmentNotes: string; updatedSeverity?: BreachSeverity },
): Promise<BreachNotification | null> {
  const ref = adminDb.collection('popia_breach_notifications').doc(breachId);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const now = new Date().toISOString();
  const existing = doc.data() as BreachNotification;

  if (existing.status !== 'detected') {
    throw new Error(`Breach ${breachId} is already in '${existing.status}' status, cannot assess`);
  }

  await ref.set(
    {
      status: 'assessing',
      assessmentNotes: assessment.assessmentNotes,
      severity: assessment.updatedSeverity || existing.severity,
      assessedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Audit trail
  const auditEvent = buildAuditEvent({
    category: 'compliance',
    action: 'popia.breach_assessed',
    actor: { uid: existing.reportedBy, role: 'system', authorizationType: 'popia_breach' },
    target: { type: 'popia_breach', id: breachId },
    metadata: { severity: assessment.updatedSeverity || existing.severity, status: 'assessing' },
  });
  await adminDb.collection('audit_logs').add(auditEvent);

  return { ...existing, status: 'assessing', assessmentNotes: assessment.assessmentNotes, assessedAt: now };
}

/**
 * Step 3: Notify the regulator (Information Regulator SA).
 */
export async function notifyRegulator(breachId: string): Promise<BreachNotification | null> {
  const ref = adminDb.collection('popia_breach_notifications').doc(breachId);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const now = new Date().toISOString();
  const existing = doc.data() as BreachNotification;

  if (!['detected', 'assessing'].includes(existing.status)) {
    throw new Error(`Breach ${breachId} is in '${existing.status}' status, cannot notify regulator`);
  }

  // In production, this would send to informationregulator.org.za
  console.warn(`[POPIA] NOTIFY REGULATOR: Breach ${breachId} — ${existing.title}`);
  console.warn(`[POPIA] Severity: ${existing.severity}, Records: ${existing.estimatedRecordsAffected}`);

  await ref.set(
    {
      status: 'notified_regulator',
      regulatorNotifiedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Audit trail
  const auditEvent = buildAuditEvent({
    category: 'compliance',
    action: 'popia.breach_regulator_notified',
    actor: { uid: existing.reportedBy, role: 'system', authorizationType: 'popia_breach' },
    target: { type: 'popia_breach', id: breachId },
    metadata: { severity: existing.severity, status: 'notified_regulator' },
  });
  await adminDb.collection('audit_logs').add(auditEvent);

  return { ...existing, status: 'notified_regulator', regulatorNotifiedAt: now };
}

/**
 * Step 4: Notify affected data subjects.
 */
export async function notifySubjects(
  breachId: string,
  subjectIds?: string[],
): Promise<BreachNotification | null> {
  const ref = adminDb.collection('popia_breach_notifications').doc(breachId);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const now = new Date().toISOString();
  const existing = doc.data() as BreachNotification;

  if (!['notified_regulator'].includes(existing.status)) {
    throw new Error(`Breach ${breachId} must have regulator notified before notifying subjects`);
  }

  // In production, send notifications to subjects
  if (subjectIds && subjectIds.length > 0) {
    const batch = adminDb.batch();
    for (const userId of subjectIds) {
      const notifRef = adminDb.collection('notifications').doc();
      batch.set(notifRef, {
        userId,
        type: 'data_breach',
        title: 'Important: Data Breach Notification',
        body: `We are writing to inform you about a data incident: ${existing.title}. We have notified the Information Regulator.`,
        data: { breachId, severity: existing.severity },
        isRead: false,
        channels: ['in_app', 'email'],
        createdAt: now,
      });
    }
    await batch.commit();
  }

  await ref.set(
    {
      status: 'notified_subjects',
      subjectsNotifiedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Audit trail
  const auditEvent = buildAuditEvent({
    category: 'compliance',
    action: 'popia.breach_subjects_notified',
    actor: { uid: existing.reportedBy, role: 'system', authorizationType: 'popia_breach' },
    target: { type: 'popia_breach', id: breachId },
    metadata: { severity: existing.severity, status: 'notified_subjects', subjectCount: subjectIds?.length || 0 },
  });
  await adminDb.collection('audit_logs').add(auditEvent);

  return { ...existing, status: 'notified_subjects', subjectsNotifiedAt: now };
}

/**
 * Step 5: Record remediation steps and close.
 */
export async function remediateBreach(
  breachId: string,
  remediation: { remediationSteps: string[] },
): Promise<BreachNotification | null> {
  const ref = adminDb.collection('popia_breach_notifications').doc(breachId);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const now = new Date().toISOString();
  const existing = doc.data() as BreachNotification;

  if (!['notified_subjects'].includes(existing.status)) {
    throw new Error(`Breach ${breachId} must have subjects notified before remediation`);
  }

  await ref.set(
    {
      status: 'remediated',
      remediationSteps: remediation.remediationSteps,
      remediatedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Audit trail
  const auditEvent = buildAuditEvent({
    category: 'compliance',
    action: 'popia.breach_remediated',
    actor: { uid: existing.reportedBy, role: 'system', authorizationType: 'popia_breach' },
    target: { type: 'popia_breach', id: breachId },
    metadata: { severity: existing.severity, status: 'remediated', remediationStepCount: remediation.remediationSteps.length },
  });
  await adminDb.collection('audit_logs').add(auditEvent);

  return { ...existing, status: 'remediated', remediationSteps: remediation.remediationSteps, remediatedAt: now };
}

/**
 * Close a breach after full remediation.
 */
export async function closeBreach(breachId: string): Promise<BreachNotification | null> {
  const ref = adminDb.collection('popia_breach_notifications').doc(breachId);
  const doc = await ref.get();
  if (!doc.exists) return null;

  const now = new Date().toISOString();
  const existing = doc.data() as BreachNotification;

  if (!['remediated'].includes(existing.status)) {
    throw new Error(`Breach ${breachId} must be remediated before closing`);
  }

  await ref.set(
    {
      status: 'closed',
      closedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  // Audit trail
  const auditEvent = buildAuditEvent({
    category: 'compliance',
    action: 'popia.breach_closed',
    actor: { uid: existing.reportedBy, role: 'system', authorizationType: 'popia_breach' },
    target: { type: 'popia_breach', id: breachId },
    metadata: { severity: existing.severity, status: 'closed' },
  });
  await adminDb.collection('audit_logs').add(auditEvent);

  return { ...existing, status: 'closed', closedAt: now };
}

/**
 * Get all breach notifications.
 */
export async function getBreaches(status?: BreachStatus): Promise<BreachNotification[]> {
  let query = adminDb.collection('popia_breach_notifications').orderBy('detectedAt', 'desc');

  if (status) {
    query = query.where('status', '==', status);
  }

  const snapshot = await query.limit(100).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as BreachNotification));
}

// ── Data classification for user profiles ─────────────────────────────────────

/**
 * Add data classification metadata to a user profile object.
 */
export function addDataClassificationToProfile(
  profile: Record<string, unknown>,
): Record<string, unknown> & { dataClassification: DataClassificationResult[] } {
  const classification = classifyDataObject(profile);
  return {
    ...profile,
    dataClassification: classification,
  };
}

/**
 * Get the required consent purposes for a user role.
 */
export function getRequiredConsentPurposes(role: string): ConsentPurpose[] {
  const basePurposes: ConsentPurpose[] = ['account_management', 'compliance'];

  switch (role) {
    case 'architect':
    case 'bep':
      return [...basePurposes, 'verification', 'directory_listing', 'ai_processing'];
    case 'contractor':
    case 'subcontractor':
    case 'supplier':
      return [...basePurposes, 'verification', 'directory_listing'];
    case 'freelancer':
      return [...basePurposes, 'directory_listing'];
    case 'client':
      return [...basePurposes, 'payment_processing'];
    case 'admin':
      return [...basePurposes, 'verification', 'ai_processing'];
    default:
      return basePurposes;
  }
}
