export type CdeDocumentStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'superseded' | 'archived';
export type CdeApprovalDecision = 'approved' | 'rejected' | 'changes_requested';

export interface CdeDocumentInput {
  projectId: string;
  uploadedBy: string;
  name: string;
  fileName: string;
  url: string;
  discipline?: string;
  documentType?: string;
  revision?: string;
  purposeOfIssue?: string;
  metadata?: Record<string, unknown>;
}

export interface CdeDocumentRecord extends CdeDocumentInput {
  status: CdeDocumentStatus;
  version: number;
  currentVersionId: string;
  immutable: true;
  createdAt: string;
  updatedAt: string;
}

export interface CdeDocumentVersionInput extends CdeDocumentInput {
  previousDocumentId: string;
  previousVersion: number;
  supersededBy?: string;
}

export interface CdeDocumentApprovalInput {
  documentId: string;
  projectId: string;
  reviewerId: string;
  decision: CdeApprovalDecision;
  comments?: string;
  requiredChanges?: string[];
}

export interface CdeDocumentApprovalRecord extends CdeDocumentApprovalInput {
  statusAfterDecision: CdeDocumentStatus;
  humanReviewRequired: true;
  autoApprovalProhibited: true;
  createdAt: string;
  updatedAt: string;
}

export interface CdeExportReadinessInput {
  projectId: string;
  documents: Array<Pick<CdeDocumentRecord, 'name' | 'status' | 'documentType' | 'revision'>>;
  requiredDocumentTypes?: string[];
}

export interface CdeExportReadiness {
  ready: boolean;
  missingDocumentTypes: string[];
  blockedDocuments: string[];
  approvedDocumentCount: number;
  warnings: string[];
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim();
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim()) : [];
}

function documentVersionId(projectId: string, name: string, version: number): string {
  return [projectId, name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), `v${version}`].join(':');
}

export function buildCdeDocumentRecord(input: CdeDocumentInput): CdeDocumentRecord {
  const projectId = requireString(input.projectId, 'projectId');
  const name = requireString(input.name, 'name');
  const now = new Date().toISOString();
  const version = 1;
  return {
    ...input,
    projectId,
    uploadedBy: requireString(input.uploadedBy, 'uploadedBy'),
    name,
    fileName: requireString(input.fileName, 'fileName'),
    url: requireString(input.url, 'url'),
    discipline: input.discipline?.trim(),
    documentType: input.documentType?.trim(),
    revision: input.revision?.trim() || 'P01',
    purposeOfIssue: input.purposeOfIssue?.trim() || 'information',
    metadata: { ...(input.metadata || {}) },
    status: 'submitted',
    version,
    currentVersionId: documentVersionId(projectId, name, version),
    immutable: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCdeDocumentVersion(input: CdeDocumentVersionInput): CdeDocumentRecord {
  const projectId = requireString(input.projectId, 'projectId');
  const name = requireString(input.name, 'name');
  const version = input.previousVersion + 1;
  if (!Number.isInteger(version) || version < 2) throw Object.assign(new Error('previousVersion must be a positive integer'), { status: 400 });
  const now = new Date().toISOString();
  return {
    ...input,
    projectId,
    uploadedBy: requireString(input.uploadedBy, 'uploadedBy'),
    name,
    fileName: requireString(input.fileName, 'fileName'),
    url: requireString(input.url, 'url'),
    discipline: input.discipline?.trim(),
    documentType: input.documentType?.trim(),
    revision: input.revision?.trim() || `P${String(version).padStart(2, '0')}`,
    purposeOfIssue: input.purposeOfIssue?.trim() || 'information',
    metadata: {
      ...(input.metadata || {}),
      previousDocumentId: requireString(input.previousDocumentId, 'previousDocumentId'),
    },
    status: 'submitted',
    version,
    currentVersionId: documentVersionId(projectId, name, version),
    immutable: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildCdeApprovalRecord(input: CdeDocumentApprovalInput): CdeDocumentApprovalRecord {
  const statusAfterDecision: CdeDocumentStatus = input.decision === 'approved' ? 'approved' : input.decision === 'rejected' ? 'rejected' : 'submitted';
  if (input.decision !== 'approved' && !input.comments?.trim() && cleanStringArray(input.requiredChanges).length === 0) {
    throw Object.assign(new Error('comments or requiredChanges are required when a document is not approved'), { status: 400 });
  }
  const now = new Date().toISOString();
  return {
    documentId: requireString(input.documentId, 'documentId'),
    projectId: requireString(input.projectId, 'projectId'),
    reviewerId: requireString(input.reviewerId, 'reviewerId'),
    decision: input.decision,
    comments: input.comments?.trim(),
    requiredChanges: cleanStringArray(input.requiredChanges),
    statusAfterDecision,
    humanReviewRequired: true,
    autoApprovalProhibited: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function evaluateCdeExportReadiness(input: CdeExportReadinessInput): CdeExportReadiness {
  requireString(input.projectId, 'projectId');
  const approvedDocuments = input.documents.filter(document => document.status === 'approved');
  const approvedTypes = new Set(approvedDocuments.map(document => document.documentType).filter((type): type is string => Boolean(type)));
  const missingDocumentTypes = cleanStringArray(input.requiredDocumentTypes).filter(type => !approvedTypes.has(type));
  const blockedDocuments = input.documents.filter(document => !['approved', 'archived'].includes(document.status)).map(document => `${document.name} (${document.status})`);
  return {
    ready: missingDocumentTypes.length === 0 && blockedDocuments.length === 0 && approvedDocuments.length > 0,
    missingDocumentTypes,
    blockedDocuments,
    approvedDocumentCount: approvedDocuments.length,
    warnings: approvedDocuments.some(document => !document.revision) ? ['One or more approved documents has no revision metadata.'] : [],
  };
}

export function buildCdeAuditInput(input: { actorId: string; action: string; document: Pick<CdeDocumentRecord, 'projectId' | 'name' | 'currentVersionId' | 'status' | 'version'> }) {
  return {
    actorId: requireString(input.actorId, 'actorId'),
    action: requireString(input.action, 'action'),
    resourceType: 'cde_document',
    resourceId: requireString(input.document.currentVersionId, 'currentVersionId'),
    projectId: requireString(input.document.projectId, 'projectId'),
    metadata: {
      name: input.document.name,
      status: input.document.status,
      version: input.document.version,
      immutable: true,
    },
  };
}
