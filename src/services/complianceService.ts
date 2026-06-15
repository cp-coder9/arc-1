// ─── Pack 11: Compliance Service ───────────────────────────────────────────
// Compliance check workflows, SANS verification, document expiry tracking.
// Integrates with Firestore for persistent compliance records.

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { ArchitexRole, Priority } from '@/services/lifecycleTypes';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Types ─────────────────────────────────────────────────────────────────

export type ComplianceCheckType =
  | 'sans_10400_xa'       // Energy compliance
  | 'sans_10400_ff'       // Fire compliance
  | 'sans_10400_ww'       // Water efficiency
  | 'sans_10400_ra'       // Roof drainage
  | 'sans_10160'          // Structural loading
  | 'sans_10142'          // Electrical installations
  | 'sans_10252'          // Water supply & drainage
  | 'nbr_building'        // National Building Regulations
  | 'municipal_bylaw'     // Local municipal by-laws
  | 'nhbrc_enrolment'     // NHBRC enrolment
  | 'popia'               // POPIA data protection
  | 'ohsa';               // Occupational Health & Safety

export type ComplianceCheckStatus = 'passed' | 'failed' | 'pending_review' | 'not_applicable' | 'waived';

export type ComplianceSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ComplianceCheck {
  checkId: string;
  projectId: string;
  checkType: ComplianceCheckType;
  title: string;
  description: string;
  status: ComplianceCheckStatus;
  severity: ComplianceSeverity;
  assignedRoles: ArchitexRole[];
  standardReference: string;
  findings: ComplianceFinding[];
  dueDate?: string;
  completedAt?: string;
  completedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceFinding {
  code: string;
  message: string;
  severity: ComplianceSeverity;
  actionItem: string;
  responsibleParty: ArchitexRole;
  evidenceUrl?: string;
  resolvedAt?: string;
}

export interface DocumentExpiryRecord {
  expiryId: string;
  projectId: string;
  documentType: string;
  documentName: string;
  issuedDate: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: 'valid' | 'expiring_soon' | 'expired';
  ownerId: string;
  notifiedAt?: string;
  createdAt: string;
}

export interface ComplianceSummary {
  projectId: string;
  totalChecks: number;
  passed: number;
  failed: number;
  pendingReview: number;
  notApplicable: number;
  waived: number;
  criticalFindings: number;
  expiryAlerts: number;
  overallStatus: 'compliant' | 'partially_compliant' | 'non_compliant' | 'not_assessed';
  lastAssessedAt: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const SANS_REFERENCE_MAP: Record<ComplianceCheckType, string> = {
  sans_10400_xa: 'SANS 10400-XA (Energy Usage in Buildings)',
  sans_10400_ff: 'SANS 10400-FF (Fire Protection)',
  sans_10400_ww: 'SANS 10400-WW (Water Efficiency)',
  sans_10400_ra: 'SANS 10400-RA (Roof Drainage)',
  sans_10160: 'SANS 10160 (Structural Loading)',
  sans_10142: 'SANS 10142 (Electrical Installations)',
  sans_10252: 'SANS 10252 (Water Supply & Drainage)',
  nbr_building: 'National Building Regulations',
  municipal_bylaw: 'Municipal By-Laws',
  nhbrc_enrolment: 'NHBRC Enrolment',
  popia: 'POPIA (Protection of Personal Information Act)',
  ohsa: 'OHSA (Occupational Health & Safety Act)',
};

const DEFAULT_COMPLIANCE_CHECKS: Array<Omit<ComplianceCheck, 'checkId' | 'createdAt' | 'updatedAt'>> = [
  { projectId: '', checkType: 'sans_10400_xa', title: 'SANS 10400-XA Energy Compliance', description: 'Verify energy usage compliance including glazing, insulation, and orientation.', status: 'pending_review', severity: 'high', assignedRoles: ['architect', 'engineer'], standardReference: 'SANS 10400-XA', findings: [], dueDate: undefined },
  { projectId: '', checkType: 'sans_10400_ff', title: 'SANS 10400-FF Fire Protection', description: 'Verify fire protection measures including compartmentation, escape routes, and fire detection.', status: 'pending_review', severity: 'critical', assignedRoles: ['architect', 'engineer'], standardReference: 'SANS 10400-FF', findings: [], dueDate: undefined },
  { projectId: '', checkType: 'municipal_bylaw', title: 'Municipal By-Law Compliance', description: 'Verify compliance with local municipal planning and building by-laws.', status: 'pending_review', severity: 'high', assignedRoles: ['architect'], standardReference: 'Municipal By-Laws', findings: [], dueDate: undefined },
  { projectId: '', checkType: 'nhbrc_enrolment', title: 'NHBRC Enrolment', description: 'Verify NHBRC enrolment for residential projects.', status: 'pending_review', severity: 'high', assignedRoles: ['contractor', 'architect'], standardReference: 'NHBRC Enrolment', findings: [], dueDate: undefined },
  { projectId: '', checkType: 'popia', title: 'POPIA Data Protection Compliance', description: 'Verify data protection measures for personal information handling.', status: 'pending_review', severity: 'medium', assignedRoles: ['admin', 'architect'], standardReference: 'POPIA', findings: [], dueDate: undefined },
  { projectId: '', checkType: 'ohsa', title: 'OHSA Compliance', description: 'Verify occupational health and safety compliance on site.', status: 'pending_review', severity: 'critical', assignedRoles: ['contractor', 'site_manager', 'admin'], standardReference: 'OHSA', findings: [], dueDate: undefined },
];

const EXPIRY_WARNING_DAYS = 30;

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Initialize default compliance checks for a new project.
 */
export async function initializeComplianceChecks(projectId: string): Promise<string[]> {
  const checksRef = getDemoCol( 'compliance_checks');
  const now = new Date().toISOString();
  const ids: string[] = [];

  for (const check of DEFAULT_COMPLIANCE_CHECKS) {
    const docRef = await addDoc(checksRef, {
      ...check,
      projectId,
      createdAt: now,
      updatedAt: now,
    });
    ids.push(docRef.id);
  }

  return ids;
}

/**
 * Run a specific compliance check and update status.
 */
export async function runComplianceCheck(
  checkId: string,
  findings: ComplianceFinding[],
  status: ComplianceCheckStatus,
  completedBy: string,
): Promise<ComplianceCheck> {
  const checkRef = getDemoDoc( 'compliance_checks', checkId);
  const snapshot = await getDoc(checkRef);
  if (!snapshot.exists()) throw new Error(`Compliance check ${checkId} not found`);

  const updates: Partial<ComplianceCheck> = {
    findings,
    status,
    completedBy,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await updateDoc(checkRef, updates);
  return { ...snapshot.data(), ...updates } as ComplianceCheck;
}

/**
 * Get all compliance checks for a project.
 */
export async function getComplianceChecks(projectId: string): Promise<ComplianceCheck[]> {
  const checksRef = getDemoCol( 'compliance_checks');
  const q = query(checksRef, where('projectId', '==', projectId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ ...doc.data(), checkId: doc.id } as ComplianceCheck));
}

/**
 * Get compliance summary for a project.
 */
export async function getComplianceSummary(projectId: string): Promise<ComplianceSummary> {
  const checks = await getComplianceChecks(projectId);
  const passed = checks.filter((c) => c.status === 'passed').length;
  const failed = checks.filter((c) => c.status === 'failed').length;
  const pendingReview = checks.filter((c) => c.status === 'pending_review').length;
  const notApplicable = checks.filter((c) => c.status === 'not_applicable').length;
  const waived = checks.filter((c) => c.status === 'waived').length;
  const criticalFindings = checks.reduce((count, c) =>
    count + c.findings.filter((f) => f.severity === 'critical').length, 0);

  const expiredDocs = await getExpiringDocuments(projectId);
  const expiryAlerts = expiredDocs.filter((d) => d.status === 'expired' || d.status === 'expiring_soon').length;

  let overallStatus: ComplianceSummary['overallStatus'] = 'not_assessed';
  if (checks.length > 0 && passed + notApplicable + waived === checks.length) {
    overallStatus = 'compliant';
  } else if (failed > 0) {
    overallStatus = 'non_compliant';
  } else if (pendingReview > 0 || failed > 0) {
    overallStatus = 'partially_compliant';
  }

  return {
    projectId,
    totalChecks: checks.length,
    passed,
    failed,
    pendingReview,
    notApplicable,
    waived,
    criticalFindings,
    expiryAlerts,
    overallStatus,
    lastAssessedAt: new Date().toISOString(),
  };
}

// ─── Document Expiry Tracking ──────────────────────────────────────────────

/**
 * Register a document with an expiry date for tracking.
 */
export async function registerDocumentExpiry(input: {
  projectId: string;
  documentType: string;
  documentName: string;
  issuedDate: string;
  expiryDate: string;
  ownerId: string;
}): Promise<DocumentExpiryRecord> {
  const now = new Date().toISOString();
  const expiryDate = new Date(input.expiryDate);
  const daysUntilExpiry = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / 86_400_000));

  const record: Omit<DocumentExpiryRecord, 'expiryId'> = {
    projectId: input.projectId,
    documentType: input.documentType,
    documentName: input.documentName,
    issuedDate: input.issuedDate,
    expiryDate: input.expiryDate,
    daysUntilExpiry,
    status: daysUntilExpiry <= 0 ? 'expired' : daysUntilExpiry <= EXPIRY_WARNING_DAYS ? 'expiring_soon' : 'valid',
    ownerId: input.ownerId,
    createdAt: now,
  };

  const docRef = await addDoc(getDemoCol( 'document_expiry'), record);
  return { ...record, expiryId: docRef.id };
}

/**
 * Get all expiring/expired documents for a project.
 */
export async function getExpiringDocuments(
  projectId: string,
  filter?: 'valid' | 'expiring_soon' | 'expired',
): Promise<DocumentExpiryRecord[]> {
  const q = query(getDemoCol( 'document_expiry'), where('projectId', '==', projectId));
  const snapshot = await getDocs(q);
  let records = snapshot.docs.map((doc) => ({ ...doc.data(), expiryId: doc.id } as DocumentExpiryRecord));

  // Recalculate status for real-time accuracy
  records = records.map((r) => {
    const daysLeft = Math.max(0, Math.ceil((new Date(r.expiryDate).getTime() - Date.now()) / 86_400_000));
    return {
      ...r,
      daysUntilExpiry: daysLeft,
      status: daysLeft <= 0 ? 'expired' as const : daysLeft <= EXPIRY_WARNING_DAYS ? 'expiring_soon' as const : 'valid' as const,
    };
  });

  if (filter) records = records.filter((r) => r.status === filter);
  return records.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
}

/**
 * Refresh document expiry statuses and return alerts for documents needing attention.
 */
export async function checkExpiryAlerts(projectId: string): Promise<DocumentExpiryRecord[]> {
  const expiring = await getExpiringDocuments(projectId, 'expiring_soon');
  const expired = await getExpiringDocuments(projectId, 'expired');

  // Mark as notified
  const alerts = [...expiring, ...expired];
  const now = new Date().toISOString();
  await Promise.all(
    alerts.map((record) =>
      updateDoc(getDemoDoc( 'document_expiry', record.expiryId), { notifiedAt: now }),
    ),
  );

  return alerts;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

export function getStandardReference(checkType: ComplianceCheckType): string {
  return SANS_REFERENCE_MAP[checkType] ?? checkType;
}

export function rankSeverity(severity: ComplianceSeverity): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
