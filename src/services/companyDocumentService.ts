// ── Types ──────────────────────────────────────────────────────────────────────

export type CompanyDocumentType =
  | 'cipc_registration'
  | 'tax_clearance'
  | 'bbbee_certificate'
  | 'pi_insurance'
  | 'coida_registration'
  | 'sars_pin'
  | 'health_safety_file'
  | 'other';

export type CompanyDocumentStatus =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'pending_review'
  | 'rejected'
  | 'superseded';

export type CompanyDocumentVerificationSource =
  | 'document_upload'
  | 'manual_admin_review'
  | 'public_register'
  | 'automated_browser_agent'
  | 'provider_reference'
  | 'self_declared';

export interface CompanyDocumentInput {
  entityId: string;
  entityType: 'professional' | 'company' | 'contractor' | 'supplier';
  documentType: CompanyDocumentType;
  title: string;
  documentUrl?: string;
  evidenceHash?: string;
  issuer?: string;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  status?: CompanyDocumentStatus;
  verificationSource?: CompanyDocumentVerificationSource;
  verifiedAt?: string;
  verifiedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface CompanyDocumentRecord {
  id?: string;
  entityId: string;
  entityType: CompanyDocumentInput['entityType'];
  documentType: CompanyDocumentType;
  title: string;
  documentUrl?: string;
  evidenceHash?: string;
  issuer?: string;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  status: CompanyDocumentStatus;
  verificationSource: CompanyDocumentVerificationSource;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export interface PublicVerificationStatus {
  documentType: CompanyDocumentType;
  hasDocument: boolean;
  isVerified: boolean;
  doesNotExpire: boolean;
  expiresAt?: string;
}

export interface DocumentLifecycleState {
  status: CompanyDocumentStatus;
  daysUntilExpiry?: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isDueForReview: boolean;
  requiresAction: boolean;
  actionLabel?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const COMPANY_DOCUMENT_TYPE_LABELS: Record<CompanyDocumentType, string> = {
  cipc_registration: 'CIPC Company Registration',
  tax_clearance: 'SARS Tax Clearance Certificate',
  bbbee_certificate: 'B-BBEE Verification Certificate',
  pi_insurance: 'Professional Indemnity Insurance',
  coida_registration: 'COIDA Registration',
  sars_pin: 'SARS Tax Reference (PIN)',
  health_safety_file: 'Health & Safety File',
  other: 'Other Compliance Document',
};

export const DOCUMENT_EXPIRY_WARNING_DAYS: Record<CompanyDocumentType, number> = {
  cipc_registration: 30,
  tax_clearance: 30, // Tax clearance typically valid for 1 year
  bbbee_certificate: 60, // B-BBEE certs valid for 1-2 years
  pi_insurance: 60, // PI insurance annually
  coida_registration: 30,
  sars_pin: 30,
  health_safety_file: 30,
  other: 30,
};

const VALID_DOCUMENT_TYPES = new Set<string>([
  'cipc_registration', 'tax_clearance', 'bbbee_certificate', 'pi_insurance',
  'coida_registration', 'sars_pin', 'health_safety_file', 'other',
]);

const VALID_DOCUMENT_STATUSES = new Set<string>([
  'active', 'expiring_soon', 'expired', 'pending_review', 'rejected', 'superseded',
]);

const VALID_ENTITY_TYPES = new Set<string>(['professional', 'company', 'contractor', 'supplier']);

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
}

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildCompanyDocument(
  input: CompanyDocumentInput,
): CompanyDocumentRecord {
  assertNonEmpty(input.entityId, 'entityId');
  assertNonEmpty(input.title, 'title');

  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw Object.assign(
      new Error(`Invalid entity type: ${input.entityType}. Must be one of: professional, company, contractor, supplier`),
      { status: 400 },
    );
  }

  if (!VALID_DOCUMENT_TYPES.has(input.documentType)) {
    throw Object.assign(
      new Error(`Invalid document type: ${input.documentType}`),
      { status: 400 },
    );
  }

  if (!input.documentUrl && !input.evidenceHash) {
    throw Object.assign(
      new Error('Company document requires either a documentUrl or evidenceHash'),
      { status: 400 },
    );
  }

  const status = input.status || 'pending_review';
  if (!VALID_DOCUMENT_STATUSES.has(status)) {
    throw Object.assign(
      new Error(`Invalid document status: ${status}`),
      { status: 400 },
    );
  }

  if (input.expiresAt) {
    const expiryDate = new Date(input.expiresAt);
    if (isNaN(expiryDate.getTime())) {
      throw Object.assign(new Error('expiresAt must be a valid ISO date string'), { status: 400 });
    }
  }

  const now = new Date().toISOString();

  return {
    entityId: input.entityId.trim(),
    entityType: input.entityType,
    documentType: input.documentType,
    title: input.title.trim(),
    documentUrl: input.documentUrl?.trim(),
    evidenceHash: input.evidenceHash?.trim(),
    issuer: input.issuer?.trim(),
    referenceNumber: input.referenceNumber?.trim(),
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    status,
    verificationSource: input.verificationSource || 'document_upload',
    verifiedAt: input.verifiedAt,
    verifiedBy: input.verifiedBy,
    createdAt: now,
    updatedAt: now,
    immutable: true,
    metadata: input.metadata || {},
  };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export function getDocumentLifecycle(
  record: Pick<CompanyDocumentRecord, 'documentType' | 'status' | 'expiresAt'>,
  options: { now?: Date } = {},
): DocumentLifecycleState {
  const now = options.now || new Date();

  if (record.status === 'rejected') {
    return {
      status: 'rejected',
      isExpired: false,
      isExpiringSoon: false,
      isDueForReview: true,
      requiresAction: true,
      actionLabel: 'Document was rejected — upload updated evidence',
    };
  }

  if (record.status === 'superseded') {
    return {
      status: 'superseded',
      isExpired: false,
      isExpiringSoon: false,
      isDueForReview: false,
      requiresAction: true,
      actionLabel: 'Document has been superseded — new version required',
    };
  }

  if (record.status === 'pending_review') {
    return {
      status: 'pending_review',
      isExpired: false,
      isExpiringSoon: false,
      isDueForReview: true,
      requiresAction: true,
      actionLabel: 'Document pending review by admin',
    };
  }

  if (!record.expiresAt) {
    return {
      status: record.status === 'expiring_soon' ? 'active' : record.status,
      isExpired: false,
      isExpiringSoon: false,
      isDueForReview: false,
      requiresAction: false,
    };
  }

  const expiryTime = new Date(record.expiresAt).getTime();
  const msUntilExpiry = expiryTime - now.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / 86_400_000);
  const warningDays = DOCUMENT_EXPIRY_WARNING_DAYS[record.documentType] || 30;

  if (msUntilExpiry < 0) {
    return {
      status: 'expired',
      daysUntilExpiry,
      isExpired: true,
      isExpiringSoon: false,
      isDueForReview: true,
      requiresAction: true,
      actionLabel: `Document expired ${Math.abs(daysUntilExpiry)} days ago — upload renewed document immediately`,
    };
  }

  if (daysUntilExpiry <= warningDays) {
    return {
      status: 'expiring_soon',
      daysUntilExpiry,
      isExpired: false,
      isExpiringSoon: true,
      isDueForReview: true,
      requiresAction: true,
      actionLabel: `Document expires in ${daysUntilExpiry} days — renew before expiry`,
    };
  }

  return {
    status: 'active',
    daysUntilExpiry,
    isExpired: false,
    isExpiringSoon: false,
    isDueForReview: false,
    requiresAction: false,
  };
}

// ── Public Verification Status ─────────────────────────────────────────────────

/**
 * Returns a redacted public-facing verification status.
 * Does NOT expose document URLs, hashes, or private metadata.
 */
export function getPublicVerificationStatus(
  record: Pick<CompanyDocumentRecord, 'documentType' | 'status' | 'expiresAt' | 'verificationSource'>,
  options: { now?: Date } = {},
): PublicVerificationStatus {
  const lifecycle = getDocumentLifecycle(record, options);
  const isVerified = (
    record.verificationSource === 'manual_admin_review' ||
    record.verificationSource === 'public_register' ||
    record.verificationSource === 'automated_browser_agent'
  ) && record.status === 'active';

  return {
    documentType: record.documentType,
    hasDocument: record.status !== 'pending_review' && record.status !== 'rejected',
    isVerified,
    doesNotExpire: !record.expiresAt,
    expiresAt: lifecycle.isExpired ? undefined : record.expiresAt,
  };
}

export function getEntityPublicVerificationSummary(
  documents: Array<Pick<CompanyDocumentRecord, 'documentType' | 'status' | 'expiresAt' | 'verificationSource'>>,
  options: { now?: Date } = {},
): { checks: PublicVerificationStatus[]; overall: 'verified' | 'partial' | 'unverified' | 'expired' } {
  const checks = documents.map((doc) => getPublicVerificationStatus(doc, options));
  const allVerified = checks.every((c) => c.isVerified || c.doesNotExpire);
  const anyExpired = checks.some((c) => c.expiresAt === undefined && c.hasDocument === false);

  let overall: 'verified' | 'partial' | 'unverified' | 'expired';
  if (anyExpired) {
    overall = 'expired';
  } else if (allVerified && checks.length > 0) {
    overall = 'verified';
  } else if (checks.some((c) => c.isVerified)) {
    overall = 'partial';
  } else {
    overall = 'unverified';
  }

  return { checks, overall };
}

// ── Assertions ─────────────────────────────────────────────────────────────────

export function assertDocumentValid(
  record: Pick<CompanyDocumentRecord, 'documentType' | 'status' | 'expiresAt' | 'title'>,
  options: { now?: Date } = {},
): void {
  const lifecycle = getDocumentLifecycle(record, options);

  if (lifecycle.status === 'expired') {
    throw Object.assign(
      new Error(`Document "${record.title}" has expired — valid document required`),
      { status: 409, documentLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'rejected') {
    throw Object.assign(
      new Error(`Document "${record.title}" was rejected — valid document required`),
      { status: 409, documentLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'pending_review') {
    throw Object.assign(
      new Error(`Document "${record.title}" is pending review — verified document required`),
      { status: 409, documentLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'superseded') {
    throw Object.assign(
      new Error(`Document "${record.title}" has been superseded — current version required`),
      { status: 409, documentLifecycle: lifecycle },
    );
  }
}
