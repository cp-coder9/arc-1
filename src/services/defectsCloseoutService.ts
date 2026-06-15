import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
export type DefectCategory = 'patent' | 'latent';
export type DefectStatus = 'open' | 'in_progress' | 'ready_for_inspection' | 'verified' | 'closed' | 'disputed' | 'transferred_to_liability';
export type DefectSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface DefectItem {
  id: string;
  projectId: string;
  jobId?: string;
  title: string;
  description?: string;
  category: DefectCategory;
  severity: DefectSeverity;
  status: DefectStatus;
  trade?: string;
  locationRef?: string;
  drawingRef?: string;
  snagOriginId?: string;
  reportedBy: string;
  reportedAt: string;
  assignedTo?: string;
  dueDate?: string;
  closedAt?: string;
  closedBy?: string;
  evidenceUrls: string[];
  inspectionNotes?: string;
  linkedToLiabilityPeriod?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface DefectCloseoutVerification {
  defectId: string;
  verifiedBy: string;
  verifiedAt: string;
  status: 'verified' | 'requires_rectification' | 'disputed';
  notes: string;
  evidenceReviewed: boolean;
  reinspectionRequired: boolean;
}

export interface DefectsRegisterSummary {
  total: number;
  patent: { total: number; open: number; closed: number };
  latent: { total: number; open: number; closed: number };
  bySeverity: Record<DefectSeverity, number>;
  openDefects: DefectItem[];
  closedDefects: number;
  requiresAttention: DefectItem[];
}

const CLOSED_DEFECT_STATUSES: DefectStatus[] = ['closed', 'verified'];
const OPEN_DEFECT_STATUSES: DefectStatus[] = ['open', 'in_progress', 'ready_for_inspection', 'disputed'];

export function isDefectClosed(status: DefectStatus): boolean {
  return CLOSED_DEFECT_STATUSES.includes(status);
}

export function categorizeDefect(input: {
  title: string;
  description?: string;
  discoveredDuringConstruction: boolean;
  visibleAtHandover: boolean;
}): DefectCategory {
  if (input.discoveredDuringConstruction && input.visibleAtHandover) {
    return 'patent';
  }
  if (!input.visibleAtHandover && !input.discoveredDuringConstruction) {
    return 'latent';
  }
  if (input.discoveredDuringConstruction && !input.visibleAtHandover) {
    return 'latent';
  }
  return 'patent';
}

export function evaluateDefectSeverity(input: {
  safetyRisk: boolean;
  functionalityImpact: boolean;
  aestheticOnly: boolean;
  regulatoryNonCompliance: boolean;
}): DefectSeverity {
  if (input.safetyRisk || input.regulatoryNonCompliance) return 'critical';
  if (input.functionalityImpact) return 'high';
  if (input.aestheticOnly) return 'low';
  return 'medium';
}

export function verifyDefectCloseout(
  defect: DefectItem,
  verification: { verifiedBy: string; evidenceReviewed: boolean; inspectionNotes?: string }
): DefectCloseoutVerification {
  const requiresRectification = !verification.evidenceReviewed || defect.evidenceUrls.length === 0;
  const isDisputed = defect.status === 'disputed';

  let status: DefectCloseoutVerification['status'] = 'verified';
  if (isDisputed) status = 'disputed';
  else if (requiresRectification) status = 'requires_rectification';

  return {
    defectId: defect.id,
    verifiedBy: verification.verifiedBy,
    verifiedAt: new Date().toISOString(),
    status,
    notes: verification.inspectionNotes ?? '',
    evidenceReviewed: verification.evidenceReviewed,
    reinspectionRequired: requiresRectification,
  };
}

export function buildDefectsRegisterSummary(defects: DefectItem[] = []): DefectsRegisterSummary {
  const patent = defects.filter((d) => d.category === 'patent');
  const latent = defects.filter((d) => d.category === 'latent');
  const openDefects = defects.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status));
  const closedDefects = defects.filter((d) => CLOSED_DEFECT_STATUSES.includes(d.status)).length;

  const bySeverity: Record<DefectSeverity, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  defects.forEach((d) => { bySeverity[d.severity] = (bySeverity[d.severity] ?? 0) + 1; });

  const requiresAttention = openDefects.filter(
    (d) => d.severity === 'critical' || d.severity === 'high' || (d.dueDate && d.dueDate < new Date().toISOString().slice(0, 10))
  );

  return {
    total: defects.length,
    patent: {
      total: patent.length,
      open: patent.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status)).length,
      closed: patent.filter((d) => CLOSED_DEFECT_STATUSES.includes(d.status)).length,
    },
    latent: {
      total: latent.length,
      open: latent.filter((d) => OPEN_DEFECT_STATUSES.includes(d.status)).length,
      closed: latent.filter((d) => CLOSED_DEFECT_STATUSES.includes(d.status)).length,
    },
    bySeverity,
    openDefects,
    closedDefects,
    requiresAttention,
  };
}

export function linkDefectToLiability(defect: DefectItem, liabilityPeriodId: string): DefectItem {
  return {
    ...defect,
    status: 'transferred_to_liability',
    linkedToLiabilityPeriod: liabilityPeriodId,
    updatedAt: new Date().toISOString(),
  };
}

export async function createDefect(input: Omit<DefectItem, 'id' | 'createdAt' | 'updatedAt' | 'evidenceUrls' | 'status'> & { status?: DefectStatus; evidenceUrls?: string[] }): Promise<DefectItem> {
  const now = new Date().toISOString();
  const defect: DefectItem = {
    ...input,
    id: `defect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: input.status ?? 'open',
    evidenceUrls: input.evidenceUrls ?? [],
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(getDemoDoc( 'defects', defect.id), defect);
  return defect;
}

export async function updateDefectStatus(defectId: string, status: DefectStatus, updatedBy: string, notes?: string): Promise<void> {
  const updates: Record<string, unknown> = { status, updatedAt: new Date().toISOString() };
  if (CLOSED_DEFECT_STATUSES.includes(status)) {
    updates.closedAt = new Date().toISOString();
    updates.closedBy = updatedBy;
  }
  if (notes) {
    updates.inspectionNotes = notes;
  }
  await updateDoc(getDemoDoc( 'defects', defectId), updates);
}

export async function verifyDefect(defectId: string, verification: { verifiedBy: string; evidenceReviewed: boolean; inspectionNotes?: string }): Promise<DefectCloseoutVerification> {
  const snap = await getDoc(getDemoDoc( 'defects', defectId));
  if (!snap.exists()) throw new Error(`Defect ${defectId} not found`);

  const defect = snap.data() as DefectItem;
  const result = verifyDefectCloseout(defect, verification);

  const newStatus: DefectStatus = result.status === 'verified' ? 'verified' : result.status === 'disputed' ? 'disputed' : 'open';
  await updateDoc(getDemoDoc( 'defects', defectId), {
    status: newStatus,
    inspectionNotes: result.notes,
    updatedAt: new Date().toISOString(),
    ...(newStatus === 'verified' ? { closedAt: new Date().toISOString(), closedBy: verification.verifiedBy } : {}),
  });

  return result;
}

export async function getDefectsForProject(projectId: string): Promise<DefectItem[]> {
  const q = query(getDemoCol( 'defects'), where('projectId', '==', projectId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DefectItem);
}

export async function getDefectsRegisterSummaryForProject(projectId: string): Promise<DefectsRegisterSummary> {
  const defects = await getDefectsForProject(projectId);
  return buildDefectsRegisterSummary(defects);
}

export async function closeAllPatentDefects(projectId: string, closedBy: string): Promise<number> {
  const defects = await getDefectsForProject(projectId);
  const patentOpen = defects.filter((d) => d.category === 'patent' && OPEN_DEFECT_STATUSES.includes(d.status));

  if (patentOpen.length === 0) return 0;

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  for (const defect of patentOpen) {
    batch.update(getDemoDoc( 'defects', defect.id), { status: 'closed', closedAt: now, closedBy, updatedAt: now });
  }
  await batch.commit();
  return patentOpen.length;
}

export const defectsCloseoutService = {
  categorizeDefect,
  evaluateDefectSeverity,
  verifyDefectCloseout,
  buildDefectsRegisterSummary,
  linkDefectToLiability,
  createDefect,
  updateDefectStatus,
  verifyDefect,
  getDefectsForProject,
  getDefectsRegisterSummaryForProject,
  closeAllPatentDefects,
  isDefectClosed,
};

export default defectsCloseoutService;
