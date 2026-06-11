import type { ProfessionalBody } from './professionalRegistrationService';
import { MINIMUM_PI_COVERAGE, PROFESSIONAL_BODIES } from './professionalRegistrationService';

// ── Types ──────────────────────────────────────────────────────────────────────

export type InsuranceEntityType = 'professional' | 'company' | 'contractor';

export type InsuranceComplianceStatus =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'lapsed'
  | 'gap_detected'
  | 'pending_review'
  | 'not_insured';

export interface InsuranceComplianceInput {
  entityId: string;
  entityType: InsuranceEntityType;
  professionalBody?: ProfessionalBody;
  provider: string;
  policyNumber: string;
  coverageAmountCents: number;
  minimumRequiredCoverageCents?: number;
  issuedAt: string;
  expiresAt: string;
  certificateUrl?: string;
  evidenceHash?: string;
  status?: InsuranceComplianceStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface InsuranceComplianceRecord {
  entityId: string;
  entityType: InsuranceEntityType;
  professionalBody?: ProfessionalBody;
  provider: string;
  policyNumber: string;
  coverageAmountCents: number;
  minimumRequiredCoverageCents: number;
  coverageSufficient: boolean;
  coverageGapCents: number;
  issuedAt: string;
  expiresAt: string;
  certificateUrl?: string;
  evidenceHash?: string;
  status: InsuranceComplianceStatus;
  verifiedAt?: string;
  verifiedBy?: string;
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export interface CoverageGapAnalysis {
  hasGap: boolean;
  gapCents: number;
  coverageAmountCents: number;
  requiredCoverageCents: number;
  percentageOfRequirement: number;
  recommendation: string;
}

export interface InsuranceLifecycleState {
  status: InsuranceComplianceStatus;
  daysUntilExpiry?: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  hasCoverageGap: boolean;
  requiresAction: boolean;
  actionLabel?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Default minimum PI cover when no professional body is specified */
export const DEFAULT_MINIMUM_PI_COVERAGE_CENTS = 1_000_000_00; // R1M

export const INSURANCE_EXPIRY_WARNING_DAYS = 60;

const VALID_ENTITY_TYPES = new Set<string>(['professional', 'company', 'contractor']);
const VALID_STATUSES = new Set<string>([
  'active', 'expiring_soon', 'expired', 'lapsed', 'gap_detected', 'pending_review', 'not_insured',
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
}

// ── Coverage ───────────────────────────────────────────────────────────────────

export function getMinimumCoverageForEntity(
  entityType: InsuranceEntityType,
  professionalBody?: ProfessionalBody,
): number {
  if (entityType === 'professional' && professionalBody) {
    return (MINIMUM_PI_COVERAGE[professionalBody] || 1_000_000) * 100; // Convert Rands to cents
  }
  return DEFAULT_MINIMUM_PI_COVERAGE_CENTS;
}

export function analyzeCoverageGap(
  coverageAmountCents: number,
  minimumRequiredCents: number,
): CoverageGapAnalysis {
  const gapCents = Math.max(0, minimumRequiredCents - coverageAmountCents);

  let recommendation: string;
  if (gapCents === 0) {
    recommendation = 'Coverage meets or exceeds minimum requirements';
  } else if (gapCents < minimumRequiredCents * 0.25) {
    recommendation = `Coverage gap of R${(gapCents / 100).toLocaleString()} — consider increasing cover to meet minimum requirement`;
  } else {
    recommendation = `Significant coverage gap of R${(gapCents / 100).toLocaleString()} — increase PI insurance to meet R${(minimumRequiredCents / 100).toLocaleString()} minimum`;
  }

  return {
    hasGap: gapCents > 0,
    gapCents,
    coverageAmountCents,
    requiredCoverageCents: minimumRequiredCents,
    percentageOfRequirement: minimumRequiredCents > 0
      ? Math.round((coverageAmountCents / minimumRequiredCents) * 100)
      : 100,
    recommendation,
  };
}

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildInsuranceCompliance(
  input: InsuranceComplianceInput,
): InsuranceComplianceRecord {
  assertNonEmpty(input.entityId, 'entityId');
  assertNonEmpty(input.provider, 'provider');
  assertNonEmpty(input.policyNumber, 'policyNumber');

  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw Object.assign(
      new Error(`Invalid entity type: ${input.entityType}. Must be one of: professional, company, contractor`),
      { status: 400 },
    );
  }

  if (!Number.isFinite(input.coverageAmountCents) || input.coverageAmountCents < 0) {
    throw Object.assign(
      new Error('coverageAmountCents must be a positive number (in cents)'),
      { status: 400 },
    );
  }

  const issuedDate = new Date(input.issuedAt);
  if (isNaN(issuedDate.getTime())) {
    throw Object.assign(new Error('issuedAt must be a valid ISO date string'), { status: 400 });
  }

  const expiryDate = new Date(input.expiresAt);
  if (isNaN(expiryDate.getTime())) {
    throw Object.assign(new Error('expiresAt must be a valid ISO date string'), { status: 400 });
  }

  if (expiryDate <= issuedDate) {
    throw Object.assign(new Error('expiresAt must be after issuedAt'), { status: 400 });
  }

  if (!input.certificateUrl && !input.evidenceHash) {
    throw Object.assign(
      new Error('Insurance compliance requires either a certificateUrl or evidenceHash'),
      { status: 400 },
    );
  }

  const professionalBody = input.professionalBody?.toUpperCase() as ProfessionalBody | undefined;
  const minimumRequiredCoverageCents = input.minimumRequiredCoverageCents
    || getMinimumCoverageForEntity(input.entityType, professionalBody);

  const coverageAnalysis = analyzeCoverageGap(input.coverageAmountCents, minimumRequiredCoverageCents);

  const now = new Date();
  const msUntilExpiry = expiryDate.getTime() - now.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / 86_400_000);

  let computedStatus: InsuranceComplianceStatus;
  if (msUntilExpiry < 0) {
    computedStatus = 'expired';
  } else if (coverageAnalysis.hasGap) {
    computedStatus = 'gap_detected';
  } else if (daysUntilExpiry <= INSURANCE_EXPIRY_WARNING_DAYS) {
    computedStatus = 'expiring_soon';
  } else {
    computedStatus = 'active';
  }

  const status = input.status || computedStatus;
  if (!VALID_STATUSES.has(status)) {
    throw Object.assign(new Error(`Invalid insurance compliance status: ${status}`), { status: 400 });
  }

  const nowISO = now.toISOString();

  return {
    entityId: input.entityId.trim(),
    entityType: input.entityType,
    professionalBody,
    provider: input.provider.trim(),
    policyNumber: input.policyNumber.trim().toUpperCase(),
    coverageAmountCents: input.coverageAmountCents,
    minimumRequiredCoverageCents,
    coverageSufficient: !coverageAnalysis.hasGap,
    coverageGapCents: coverageAnalysis.gapCents,
    issuedAt: issuedDate.toISOString(),
    expiresAt: expiryDate.toISOString(),
    certificateUrl: input.certificateUrl?.trim(),
    evidenceHash: input.evidenceHash?.trim(),
    status,
    verifiedAt: input.verifiedAt,
    verifiedBy: input.verifiedBy,
    createdAt: nowISO,
    updatedAt: nowISO,
    immutable: true,
    metadata: input.metadata || {},
  };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export function getInsuranceLifecycle(
  record: Pick<InsuranceComplianceRecord, 'status' | 'expiresAt' | 'coverageSufficient'>,
  options: { now?: Date } = {},
): InsuranceLifecycleState {
  const now = options.now || new Date();

  if (record.status === 'not_insured') {
    return {
      status: 'not_insured',
      isExpired: false,
      isExpiringSoon: false,
      hasCoverageGap: true,
      requiresAction: true,
      actionLabel: 'No PI insurance on record — insurance required for professional practice',
    };
  }

  if (record.status === 'pending_review') {
    return {
      status: 'pending_review',
      isExpired: false,
      isExpiringSoon: false,
      hasCoverageGap: !record.coverageSufficient,
      requiresAction: true,
      actionLabel: 'Insurance certificate pending admin review',
    };
  }

  if (record.status === 'lapsed') {
    return {
      status: 'lapsed',
      isExpired: true,
      isExpiringSoon: false,
      hasCoverageGap: true,
      requiresAction: true,
      actionLabel: 'PI insurance has lapsed — reinstate coverage immediately',
    };
  }

  if (record.status === 'expired') {
    return {
      status: 'expired',
      isExpired: true,
      isExpiringSoon: false,
      hasCoverageGap: true,
      requiresAction: true,
      actionLabel: 'PI insurance has expired — renew immediately',
    };
  }

  if (record.status === 'gap_detected') {
    const expiryTime = new Date(record.expiresAt).getTime();
    const msUntilExpiry = expiryTime - now.getTime();
    const daysUntilExpiry = Math.ceil(msUntilExpiry / 86_400_000);
    const isExpired = msUntilExpiry < 0;

    return {
      status: 'gap_detected',
      daysUntilExpiry: isExpired ? daysUntilExpiry : daysUntilExpiry,
      isExpired,
      isExpiringSoon: !isExpired && daysUntilExpiry <= INSURANCE_EXPIRY_WARNING_DAYS,
      hasCoverageGap: true,
      requiresAction: true,
      actionLabel: 'Coverage gap detected — increase PI cover to meet minimum requirements',
    };
  }

  const expiryTime = new Date(record.expiresAt).getTime();
  const msUntilExpiry = expiryTime - now.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / 86_400_000);

  if (msUntilExpiry < 0) {
    return {
      status: 'expired',
      daysUntilExpiry,
      isExpired: true,
      isExpiringSoon: false,
      hasCoverageGap: !record.coverageSufficient,
      requiresAction: true,
      actionLabel: 'PI insurance has expired — renew immediately',
    };
  }

  if (daysUntilExpiry <= INSURANCE_EXPIRY_WARNING_DAYS) {
    return {
      status: 'expiring_soon',
      daysUntilExpiry,
      isExpired: false,
      isExpiringSoon: true,
      hasCoverageGap: !record.coverageSufficient,
      requiresAction: true,
      actionLabel: `PI insurance expires in ${daysUntilExpiry} days — renew before expiry to avoid coverage gap`,
    };
  }

  return {
    status: record.status === 'expiring_soon' ? 'active' : record.status,
    daysUntilExpiry,
    isExpired: false,
    isExpiringSoon: false,
    hasCoverageGap: !record.coverageSufficient,
    requiresAction: false,
  };
}

// ── Assertions ─────────────────────────────────────────────────────────────────

export function assertInsuranceCompliant(
  record: Pick<InsuranceComplianceRecord, 'status' | 'expiresAt' | 'coverageSufficient' | 'coverageGapCents' | 'minimumRequiredCoverageCents' | 'entityType'>,
  options: { now?: Date } = {},
): void {
  const lifecycle = getInsuranceLifecycle(record, options);

  if (lifecycle.status === 'not_insured') {
    throw Object.assign(
      new Error('PI insurance is required but not on record'),
      { status: 403, insuranceLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'expired' || lifecycle.status === 'lapsed') {
    throw Object.assign(
      new Error(`PI insurance has ${lifecycle.status} — active insurance required for professional practice`),
      { status: 403, insuranceLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'gap_detected') {
    const gap = (record.coverageGapCents / 100).toLocaleString();
    const required = (record.minimumRequiredCoverageCents / 100).toLocaleString();
    throw Object.assign(
      new Error(`PI insurance coverage gap of R${gap} — minimum R${required} required`),
      { status: 409, insuranceLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'expiring_soon') {
    // Expiring soon is a warning, not a block — but marketplace actions may be restricted
    const days = lifecycle.daysUntilExpiry;
    throw Object.assign(
      new Error(`PI insurance expires in ${days} days — renewal required before ${record.entityType === 'professional' ? 'statutory' : 'project'} actions`),
      { status: 409, insuranceLifecycle: lifecycle, isWarning: true },
    );
  }
}
