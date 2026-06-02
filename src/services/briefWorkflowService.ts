import type { UserRole } from '../types';

export type ProjectBriefStatus = 'draft' | 'submitted' | 'published' | 'appointed' | 'cancelled';
export type BriefInterpretationStatus = 'draft' | 'ready_for_review' | 'accepted' | 'superseded';

export interface ProjectBriefInput {
  clientId: string;
  title: string;
  description: string;
  category?: string;
  location?: string;
  budgetRange?: { min?: number; max?: number; currency?: string };
  targetStartDate?: string;
  requirements?: string[];
  propertyDetails?: Record<string, unknown>;
  createdBy: string;
}

export interface ProjectBriefRecord {
  clientId: string;
  title: string;
  description: string;
  category?: string;
  location?: string;
  budgetRange?: { min?: number; max?: number; currency: string };
  targetStartDate?: string;
  requirements: string[];
  propertyDetails: Record<string, unknown>;
  status: ProjectBriefStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAttachmentInput {
  briefId: string;
  clientId: string;
  uploadedBy: string;
  fileName: string;
  fileUrl: string;
  contentType?: string;
  sizeBytes?: number;
  evidenceType?: string;
  storageProvider?: 'vercel_blob' | 'firebase_storage';
  metadata?: Record<string, unknown>;
}

export interface ProjectAttachmentRecord extends ProjectAttachmentInput {
  storageProvider: 'vercel_blob' | 'firebase_storage';
  createdAt: string;
  updatedAt: string;
}

export interface BriefInterpretationInput {
  briefId: string;
  clientId: string;
  createdBy: string;
  createdByRole: UserRole | string;
  summary: string;
  inferredProjectRoute?: string;
  likelyRequiredProfessionals?: string[];
  risks?: string[];
  assumptions?: string[];
  sourceAttachmentIds?: string[];
  confidence?: number;
  model?: string;
}

export interface BriefInterpretationRecord {
  briefId: string;
  clientId: string;
  summary: string;
  inferredProjectRoute?: string;
  likelyRequiredProfessionals: string[];
  risks: string[];
  assumptions: string[];
  sourceAttachmentIds: string[];
  confidence: number;
  advisoryOnly: true;
  limitations: string[];
  status: BriefInterpretationStatus;
  createdBy: string;
  createdByRole: UserRole | string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

function nonEmptyString(value: unknown, field: string, maxLength = 5000): string {
  if (typeof value !== 'string' || !value.trim()) throw Object.assign(new Error(`${field} is required`), { status: 400 });
  return value.trim().slice(0, maxLength);
}

function cleanOptionalString(value: unknown, maxLength = 500): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;
}

function cleanStringArray(value: unknown, maxItems = 50, maxLength = 500): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string' && item.trim())
    .map(item => item.trim().slice(0, maxLength))
    .slice(0, maxItems);
}

function cleanRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry)));
}

function cleanBudgetRange(value: ProjectBriefInput['budgetRange']): ProjectBriefRecord['budgetRange'] {
  if (!value) return undefined;
  const min = typeof value.min === 'number' && value.min >= 0 ? value.min : undefined;
  const max = typeof value.max === 'number' && value.max >= 0 ? value.max : undefined;
  if (min !== undefined && max !== undefined && min > max) throw Object.assign(new Error('Budget minimum cannot exceed maximum'), { status: 400 });
  return { min, max, currency: value.currency || 'ZAR' };
}

export function buildProjectBrief(input: ProjectBriefInput): ProjectBriefRecord {
  if (input.clientId !== input.createdBy) throw Object.assign(new Error('Project brief must be created by the client owner'), { status: 403 });
  const now = new Date().toISOString();
  return {
    clientId: nonEmptyString(input.clientId, 'clientId'),
    title: nonEmptyString(input.title, 'title', 200),
    description: nonEmptyString(input.description, 'description', 10_000),
    category: cleanOptionalString(input.category),
    location: cleanOptionalString(input.location),
    budgetRange: cleanBudgetRange(input.budgetRange),
    targetStartDate: cleanOptionalString(input.targetStartDate),
    requirements: cleanStringArray(input.requirements),
    propertyDetails: cleanRecord(input.propertyDetails),
    status: 'submitted',
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
  };
}

export function buildProjectAttachmentMetadata(input: ProjectAttachmentInput): ProjectAttachmentRecord {
  if (input.clientId !== input.uploadedBy) throw Object.assign(new Error('Only the brief owner can attach client evidence'), { status: 403 });
  if (!/^https:\/\//.test(input.fileUrl)) throw Object.assign(new Error('Attachment fileUrl must be an HTTPS storage URL'), { status: 400 });
  const now = new Date().toISOString();
  return {
    ...input,
    briefId: nonEmptyString(input.briefId, 'briefId'),
    clientId: nonEmptyString(input.clientId, 'clientId'),
    uploadedBy: nonEmptyString(input.uploadedBy, 'uploadedBy'),
    fileName: nonEmptyString(input.fileName, 'fileName', 300),
    fileUrl: input.fileUrl.trim(),
    contentType: cleanOptionalString(input.contentType, 120),
    evidenceType: cleanOptionalString(input.evidenceType, 120),
    sizeBytes: typeof input.sizeBytes === 'number' && input.sizeBytes >= 0 ? input.sizeBytes : undefined,
    storageProvider: input.storageProvider || 'vercel_blob',
    metadata: cleanRecord(input.metadata),
    createdAt: now,
    updatedAt: now,
  };
}

export function buildBriefInterpretation(input: BriefInterpretationInput): BriefInterpretationRecord {
  const now = new Date().toISOString();
  const confidence = typeof input.confidence === 'number' ? Math.max(0, Math.min(1, input.confidence)) : 0;
  return {
    briefId: nonEmptyString(input.briefId, 'briefId'),
    clientId: nonEmptyString(input.clientId, 'clientId'),
    summary: nonEmptyString(input.summary, 'summary', 10_000),
    inferredProjectRoute: cleanOptionalString(input.inferredProjectRoute, 1000),
    likelyRequiredProfessionals: cleanStringArray(input.likelyRequiredProfessionals, 20, 120),
    risks: cleanStringArray(input.risks, 30, 300),
    assumptions: cleanStringArray(input.assumptions, 30, 300),
    sourceAttachmentIds: cleanStringArray(input.sourceAttachmentIds, 100, 120),
    confidence,
    advisoryOnly: true,
    limitations: [
      'AI interpretation is advisory and must be reviewed by a qualified human professional.',
      'It does not certify compliance, appoint a professional, approve municipal submissions, or create a binding contract.',
    ],
    status: 'ready_for_review',
    createdBy: nonEmptyString(input.createdBy, 'createdBy'),
    createdByRole: input.createdByRole,
    model: cleanOptionalString(input.model, 120),
    createdAt: now,
    updatedAt: now,
  };
}

export function assertBriefPublishable(brief: Pick<ProjectBriefRecord, 'clientId' | 'title' | 'description' | 'status'>): void {
  nonEmptyString(brief.clientId, 'clientId');
  nonEmptyString(brief.title, 'title');
  nonEmptyString(brief.description, 'description');
  if (!['submitted', 'draft'].includes(brief.status)) {
    throw Object.assign(new Error('Only draft or submitted briefs can be published'), { status: 400 });
  }
}
