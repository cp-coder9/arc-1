import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { HandoverPackDocumentCategory, HandoverPackDocumentInput, HandoverPackManifest, HandoverPackManifestItem, buildHandoverPackManifest } from './closeoutService';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
export type HandoverPackStatus = 'draft' | 'assembling' | 'ready_for_review' | 'approved' | 'issued' | 'superseded';
export type DocumentType = 'as_built_drawing' | 'warranty' | 'manual' | 'compliance_certificate' | 'key_register' | 'test_certificate' | 'maintenance_schedule' | 'guarantee' | 'other';

export interface HandoverDocument {
  id: string;
  projectId: string;
  jobId?: string;
  title: string;
  type: DocumentType;
  category: HandoverPackDocumentCategory;
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'issued';
  url?: string;
  version: number;
  versionNote?: string;
  uploadedBy?: string;
  uploadedAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  expiresAt?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AsBuiltDrawingRecord {
  id: string;
  projectId: string;
  title: string;
  drawingNumber: string;
  revision: string;
  discipline?: string;
  url?: string;
  status: 'draft' | 'submitted' | 'approved' | 'issued';
  preparedBy?: string;
  approvedBy?: string;
  approvedAt?: string;
  supersedesRevision?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WarrantyRecord {
  id: string;
  projectId: string;
  title: string;
  provider: string;
  warrantyType: string;
  startDate: string;
  expiryDate: string;
  coverageDescription?: string;
  documentUrl?: string;
  status: 'active' | 'expired' | 'void';
  createdAt: string;
  updatedAt: string;
}

export interface ManualRecord {
  id: string;
  projectId: string;
  title: string;
  equipmentOrSystem: string;
  manualType: 'operation' | 'maintenance' | 'installation' | 'safety' | 'other';
  documentUrl?: string;
  version: string;
  status: 'draft' | 'issued';
  issuedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KeyAccessRecord {
  id: string;
  projectId: string;
  areaOrAsset: string;
  keyType: string;
  quantity: number;
  keyCode?: string;
  receivedBy: string;
  receivedAt: string;
  witnessBy?: string;
  notes?: string;
  status: 'pending' | 'handed_over';
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceBundle {
  id: string;
  projectId: string;
  title: string;
  certificates: Array<{
    type: string;
    number?: string;
    issuedBy: string;
    issuedAt: string;
    url?: string;
    status: string;
  }>;
  status: 'incomplete' | 'complete';
  missingRequired: string[];
  createdAt: string;
  updatedAt: string;
}

export interface HandoverPackRecord {
  id: string;
  projectId: string;
  jobId?: string;
  status: HandoverPackStatus;
  documents: HandoverDocument[];
  asBuiltDrawings: AsBuiltDrawingRecord[];
  warranties: WarrantyRecord[];
  manuals: ManualRecord[];
  keyAccessRecords: KeyAccessRecord[];
  complianceBundle?: ComplianceBundle;
  manifest: HandoverPackManifest;
  approvedBy?: string;
  approvedAt?: string;
  issuedBy?: string;
  issuedAt?: string;
  blockers: string[];
  createdAt: string;
  updatedAt: string;
}

const REQUIRED_DOCUMENT_TYPES: DocumentType[] = ['as_built_drawing', 'compliance_certificate', 'warranty', 'manual'];
const TYPE_LABELS: Record<DocumentType, string> = {
  as_built_drawing: 'As-built drawing',
  warranty: 'Warranty / Guarantee',
  manual: 'O&M / Maintenance manual',
  compliance_certificate: 'Compliance certificate',
  key_register: 'Key / access register',
  test_certificate: 'Test certificate',
  maintenance_schedule: 'Maintenance schedule',
  guarantee: 'Guarantee',
  other: 'Other document',
};

export function getDocumentTypeLabel(type: DocumentType): string {
  return TYPE_LABELS[type] ?? type;
}

export function mapDocumentTypeToCategory(type: DocumentType): HandoverPackDocumentCategory {
  switch (type) {
    case 'as_built_drawing': return 'as_built';
    case 'warranty':
    case 'guarantee': return 'manufacturer_warranty';
    case 'manual':
    case 'maintenance_schedule': return 'manual';
    case 'compliance_certificate':
    case 'test_certificate': return 'compliance_certificate';
    default: return 'other';
  }
}

export function evaluateAsBuiltDrawings(drawings: AsBuiltDrawingRecord[] = []): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const approved = drawings.filter((d) => d.status === 'approved' || d.status === 'issued');

  if (drawings.length === 0) {
    blockers.push('No as-built drawings recorded.');
  } else if (approved.length < drawings.length) {
    blockers.push(`${drawings.length - approved.length} as-built drawing(s) not yet approved.`);
  }

  return { ready: blockers.length === 0, blockers };
}

export function evaluateWarranties(warranties: WarrantyRecord[] = []): { ready: boolean; blockers: string[]; expiringSoon: WarrantyRecord[] } {
  const blockers: string[] = [];
  const now = new Date();
  const warningDays = 90;

  const expiringSoon = warranties.filter((w) => {
    if (w.status !== 'active') return false;
    const expiry = new Date(w.expiryDate);
    const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= warningDays;
  });

  if (warranties.length === 0) {
    blockers.push('No warranties recorded in handover pack.');
  }

  const expired = warranties.filter((w) => w.status === 'expired' || (w.status === 'active' && new Date(w.expiryDate) < now));
  if (expired.length > 0) {
    blockers.push(`${expired.length} warranty/warranties have expired.`);
  }

  return { ready: blockers.length === 0, blockers, expiringSoon };
}

export function evaluateManuals(manuals: ManualRecord[] = []): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const issued = manuals.filter((m) => m.status === 'issued');

  if (manuals.length === 0) {
    blockers.push('No O&M manuals recorded.');
  } else if (issued.length < manuals.length) {
    blockers.push(`${manuals.length - issued.length} manual(s) not yet issued.`);
  }

  return { ready: blockers.length === 0, blockers };
}

export function evaluateKeyAccess(records: KeyAccessRecord[] = []): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const handedOver = records.filter((r) => r.status === 'handed_over');

  if (records.length === 0) {
    blockers.push('No key/access handover records created.');
  } else if (handedOver.length < records.length) {
    blockers.push(`${records.length - handedOver.length} key/access record(s) not yet handed over.`);
  }

  return { ready: blockers.length === 0, blockers };
}

export function evaluateComplianceBundle(bundle?: ComplianceBundle): { ready: boolean; blockers: string[] } {
  const blockers: string[] = [];

  if (!bundle) {
    blockers.push('Compliance certificate bundle not assembled.');
    return { ready: false, blockers };
  }

  if (bundle.missingRequired.length > 0) {
    blockers.push(`Missing required compliance certificates: ${bundle.missingRequired.join(', ')}.`);
  }

  const invalidCerts = bundle.certificates.filter((c) => !['approved', 'issued', 'accepted'].includes(String(c.status ?? '').toLowerCase()));
  if (invalidCerts.length > 0) {
    blockers.push(`${invalidCerts.length} certificate(s) not in approved/issued status.`);
  }

  return { ready: blockers.length === 0, blockers };
}

export function evaluateHandoverPackReadiness(input: {
  documents: HandoverDocument[];
  asBuiltDrawings: AsBuiltDrawingRecord[];
  warranties: WarrantyRecord[];
  manuals: ManualRecord[];
  keyAccessRecords: KeyAccessRecord[];
  complianceBundle?: ComplianceBundle;
}): { ready: boolean; status: HandoverPackStatus; blockers: string[] } {
  const blockers: string[] = [];

  const asBuiltEval = evaluateAsBuiltDrawings(input.asBuiltDrawings);
  blockers.push(...asBuiltEval.blockers);

  const warrantyEval = evaluateWarranties(input.warranties);
  blockers.push(...warrantyEval.blockers);

  const manualEval = evaluateManuals(input.manuals);
  blockers.push(...manualEval.blockers);

  const keyEval = evaluateKeyAccess(input.keyAccessRecords);
  blockers.push(...keyEval.blockers);

  const complianceEval = evaluateComplianceBundle(input.complianceBundle);
  blockers.push(...complianceEval.blockers);

  const manifestDocs: HandoverPackDocumentInput[] = input.documents.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    type: d.type,
    status: d.status,
    url: d.url,
  }));
  const manifest = buildHandoverPackManifest(manifestDocs);
  blockers.push(...manifest.blockers);

  const ready = blockers.length === 0;
  const status: HandoverPackStatus = ready ? 'ready_for_review' : 'assembling';

  return { ready, status, blockers };
}

export function assembleHandoverPack(input: {
  projectId: string;
  jobId?: string;
  documents?: HandoverDocument[];
  asBuiltDrawings?: AsBuiltDrawingRecord[];
  warranties?: WarrantyRecord[];
  manuals?: ManualRecord[];
  keyAccessRecords?: KeyAccessRecord[];
  complianceBundle?: ComplianceBundle;
}): HandoverPackRecord {
  const documents = input.documents ?? [];
  const asBuiltDrawings = input.asBuiltDrawings ?? [];
  const warranties = input.warranties ?? [];
  const manuals = input.manuals ?? [];
  const keyAccessRecords = input.keyAccessRecords ?? [];

  const evaluation = evaluateHandoverPackReadiness({
    documents,
    asBuiltDrawings,
    warranties,
    manuals,
    keyAccessRecords,
    complianceBundle: input.complianceBundle,
  });

  const manifestDocs: HandoverPackDocumentInput[] = documents.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    type: d.type,
    status: d.status,
    url: d.url,
  }));
  const manifest = buildHandoverPackManifest(manifestDocs);

  const now = new Date().toISOString();

  return {
    id: `handover-pack-${input.projectId}`,
    projectId: input.projectId,
    jobId: input.jobId,
    status: evaluation.status,
    documents,
    asBuiltDrawings,
    warranties,
    manuals,
    keyAccessRecords,
    complianceBundle: input.complianceBundle,
    manifest,
    blockers: evaluation.blockers,
    createdAt: now,
    updatedAt: now,
  };
}

export async function persistHandoverPack(pack: HandoverPackRecord): Promise<void> {
  await setDoc(getDemoDoc( 'handover_packs', pack.id), pack);
}

export async function getHandoverPack(projectId: string): Promise<HandoverPackRecord | null> {
  const snap = await getDoc(getDemoDoc( 'handover_packs', `handover-pack-${projectId}`));
  if (!snap.exists()) return null;
  return snap.data() as HandoverPackRecord;
}

export async function approveHandoverPack(projectId: string, approvedBy: string): Promise<HandoverPackRecord> {
  const snap = await getDoc(getDemoDoc( 'handover_packs', `handover-pack-${projectId}`));
  if (!snap.exists()) throw new Error(`Handover pack for project ${projectId} not found`);

  const pack = snap.data() as HandoverPackRecord;
  if (pack.status !== 'ready_for_review') {
    throw new Error(`Handover pack must be in "ready_for_review" status to approve. Current: ${pack.status}`);
  }

  const now = new Date().toISOString();
  const updated: HandoverPackRecord = {
    ...pack,
    status: 'approved',
    approvedBy,
    approvedAt: now,
    updatedAt: now,
  };

  await updateDoc(getDemoDoc( 'handover_packs', pack.id), {
    status: 'approved',
    approvedBy,
    approvedAt: now,
    updatedAt: now,
  });

  await updateDoc(getDemoDoc( 'projects', projectId), {
    handoverPack: {
      status: 'approved',
      approvedBy,
      approvedAt: now,
      documentCount: pack.documents.length,
    },
    updatedAt: now,
  });

  return updated;
}

export async function issueHandoverPack(projectId: string, issuedBy: string): Promise<HandoverPackRecord> {
  const snap = await getDoc(getDemoDoc( 'handover_packs', `handover-pack-${projectId}`));
  if (!snap.exists()) throw new Error(`Handover pack for project ${projectId} not found`);

  const pack = snap.data() as HandoverPackRecord;
  if (pack.status !== 'approved') {
    throw new Error(`Handover pack must be approved before issue. Current: ${pack.status}`);
  }

  const now = new Date().toISOString();
  await updateDoc(getDemoDoc( 'handover_packs', pack.id), {
    status: 'issued',
    issuedBy,
    issuedAt: now,
    updatedAt: now,
  });

  return { ...pack, status: 'issued', issuedBy, issuedAt: now, updatedAt: now };
}

export async function addDocumentToHandoverPack(projectId: string, document: HandoverDocument): Promise<void> {
  const existing = await getHandoverPack(projectId);
  if (existing) {
    const documents = [...existing.documents.filter((d) => d.id !== document.id), document];
    const evaluation = evaluateHandoverPackReadiness({
      documents,
      asBuiltDrawings: existing.asBuiltDrawings,
      warranties: existing.warranties,
      manuals: existing.manuals,
      keyAccessRecords: existing.keyAccessRecords,
      complianceBundle: existing.complianceBundle,
    });

    await updateDoc(getDemoDoc( 'handover_packs', existing.id), {
      documents,
      status: evaluation.status,
      blockers: evaluation.blockers,
      updatedAt: new Date().toISOString(),
    });
    return;
  }

  const pack = assembleHandoverPack({ projectId, documents: [document] });
  await persistHandoverPack(pack);
}

export const handoverPackService = {
  getDocumentTypeLabel,
  mapDocumentTypeToCategory,
  evaluateAsBuiltDrawings,
  evaluateWarranties,
  evaluateManuals,
  evaluateKeyAccess,
  evaluateComplianceBundle,
  evaluateHandoverPackReadiness,
  assembleHandoverPack,
  persistHandoverPack,
  getHandoverPack,
  approveHandoverPack,
  issueHandoverPack,
  addDocumentToHandoverPack,
};

export default handoverPackService;
