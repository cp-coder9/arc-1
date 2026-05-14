import type { UserVerification, VerificationSource, VerificationStatus, VerificationSubjectType } from '../types';

export type VerificationProvider = 'sacap' | 'cidb' | 'nhbrc' | 'cipc' | 'manual';

export interface VerificationSubmissionInput {
  userId: string;
  submittedBy: string;
  subjectType: VerificationSubjectType;
  registrationNumber?: string;
  statutoryBody?: string;
  source?: VerificationSource;
  evidenceUrls?: string[];
  evidenceDocumentIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface VerificationReviewInput {
  status: Extract<VerificationStatus, 'verified' | 'rejected' | 'expired'>;
  reviewedBy: string;
  rejectionReason?: string;
  expiresAt?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderVerificationResult {
  provider: VerificationProvider;
  status: VerificationStatus;
  source: VerificationSource;
  details?: Record<string, unknown>;
  error?: string;
}

const SUBJECT_TYPES: VerificationSubjectType[] = ['bep', 'contractor', 'subcontractor', 'supplier', 'freelancer', 'admin'];
const REVIEW_STATUSES: VerificationReviewInput['status'][] = ['verified', 'rejected', 'expired'];

export function assertVerificationSubjectType(value: unknown): asserts value is VerificationSubjectType {
  if (!SUBJECT_TYPES.includes(value as VerificationSubjectType)) {
    throw Object.assign(new Error('Unsupported verification subject type'), { status: 400 });
  }
}

export function assertReviewStatus(value: unknown): asserts value is VerificationReviewInput['status'] {
  if (!REVIEW_STATUSES.includes(value as VerificationReviewInput['status'])) {
    throw Object.assign(new Error('Unsupported verification review status'), { status: 400 });
  }
}

export function normalizeRegistrationNumber(value?: string): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
}

export function normalizeStatutoryBody(value?: string): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

export function inferVerificationProvider(input: Pick<VerificationSubmissionInput, 'subjectType' | 'statutoryBody'>): VerificationProvider {
  const body = normalizeStatutoryBody(input.statutoryBody);
  if (body === 'SACAP') return 'sacap';
  if (body === 'CIDB') return 'cidb';
  if (body === 'NHBRC') return 'nhbrc';
  if (body === 'CIPC') return 'cipc';
  if (input.subjectType === 'bep') return 'sacap';
  if (input.subjectType === 'contractor' || input.subjectType === 'subcontractor') return 'cidb';
  if (input.subjectType === 'supplier') return 'cipc';
  return 'manual';
}

export function buildUserVerification(input: VerificationSubmissionInput, providerResult?: ProviderVerificationResult): Omit<UserVerification, 'id'> {
  assertVerificationSubjectType(input.subjectType);
  const now = new Date().toISOString();
  const registrationNumber = normalizeRegistrationNumber(input.registrationNumber);
  const statutoryBody = normalizeStatutoryBody(input.statutoryBody);
  const metadata = {
    ...(input.metadata || {}),
    ...(providerResult ? { providerResult } : {}),
  };

  return {
    userId: input.userId,
    subjectType: input.subjectType,
    status: providerResult?.status || 'pending',
    source: providerResult?.source || input.source || 'document_upload',
    registrationNumber,
    statutoryBody,
    evidenceDocumentIds: input.evidenceDocumentIds || [],
    evidenceUrls: input.evidenceUrls || [],
    submittedAt: now,
    submittedBy: input.submittedBy,
    lastVerifiedAt: providerResult?.status === 'verified' ? now : undefined,
    metadata,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyVerificationReview<T extends UserVerification | Record<string, any>>(verification: T, input: VerificationReviewInput): T {
  assertReviewStatus(input.status);
  if (input.status === 'rejected' && !input.rejectionReason?.trim()) {
    throw Object.assign(new Error('A rejection reason is required'), { status: 400 });
  }
  const now = new Date().toISOString();
  return {
    ...verification,
    status: input.status,
    reviewedAt: now,
    reviewedBy: input.reviewedBy,
    rejectionReason: input.status === 'rejected' ? input.rejectionReason?.trim() : undefined,
    expiresAt: input.expiresAt,
    lastVerifiedAt: input.status === 'verified' ? now : (verification as any).lastVerifiedAt,
    metadata: {
      ...((verification as any).metadata || {}),
      ...(input.metadata || {}),
    },
    updatedAt: now,
  };
}
