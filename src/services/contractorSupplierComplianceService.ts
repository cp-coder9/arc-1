// ── Types ──────────────────────────────────────────────────────────────────────

export type ContractorComplianceCheckType =
  | 'health_safety_file'
  | 'coida_registration'
  | 'sars_tax_pin'
  | 'bbbee_verification'
  | 'cips_registration'
  | 'letter_of_good_standing'
  | 'other';

export type ComplianceCheckStatus =
  | 'compliant'
  | 'non_compliant'
  | 'expired'
  | 'pending'
  | 'not_applicable'
  | 'waived';

export interface ComplianceCheckItem {
  checkType: ContractorComplianceCheckType;
  status: ComplianceCheckStatus;
  evidenceReference?: string;
  referenceNumber?: string;
  issuedAt?: string;
  expiresAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

export interface ContractorComplianceInput {
  entityId: string;
  entityType: 'contractor' | 'subcontractor' | 'supplier';
  projectId?: string;
  checks: ComplianceCheckItem[];
  overallStatus?: ComplianceCheckStatus;
  metadata?: Record<string, unknown>;
}

export interface ContractorComplianceRecord {
  entityId: string;
  entityType: ContractorComplianceInput['entityType'];
  projectId?: string;
  checks: ComplianceCheckItem[];
  overallStatus: ComplianceCheckStatus;
  missingCriticalChecks: ContractorComplianceCheckType[];
  expiredChecks: ContractorComplianceCheckType[];
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export interface ComplianceCheckRequirement {
  checkType: ContractorComplianceCheckType;
  label: string;
  mandatory: boolean;
  description: string;
  appliesTo: Array<'contractor' | 'subcontractor' | 'supplier'>;
  typicalExpiryMonths: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const COMPLIANCE_CHECK_REQUIREMENTS: Record<ContractorComplianceCheckType, ComplianceCheckRequirement> = {
  health_safety_file: {
    checkType: 'health_safety_file',
    label: 'Health & Safety File',
    mandatory: true,
    description: 'Comprehensive Health & Safety file per OHS Act requirements including risk assessments, safe work procedures, and emergency plans',
    appliesTo: ['contractor', 'subcontractor'],
    typicalExpiryMonths: 12,
  },
  coida_registration: {
    checkType: 'coida_registration',
    label: 'COIDA Registration (Letter of Good Standing)',
    mandatory: true,
    description: 'Registration with the Compensation Fund and valid Letter of Good Standing per COIDA requirements',
    appliesTo: ['contractor', 'subcontractor', 'supplier'],
    typicalExpiryMonths: 12,
  },
  sars_tax_pin: {
    checkType: 'sars_tax_pin',
    label: 'SARS Tax Compliance (PIN)',
    mandatory: true,
    description: 'Valid SARS Tax Compliance Status PIN confirming tax affairs are in order',
    appliesTo: ['contractor', 'subcontractor', 'supplier'],
    typicalExpiryMonths: 12,
  },
  bbbee_verification: {
    checkType: 'bbbee_verification',
    label: 'B-BBEE Verification Certificate',
    mandatory: false,
    description: 'Valid B-BBEE certificate or sworn affidavit for EME/QSE entities — required for preferential procurement scoring',
    appliesTo: ['contractor', 'subcontractor', 'supplier'],
    typicalExpiryMonths: 12,
  },
  cips_registration: {
    checkType: 'cips_registration',
    label: 'CIPS Registration (Construction Industry)',
    mandatory: false,
    description: 'Registration with Construction Industry Procurement System where applicable for public sector projects',
    appliesTo: ['contractor', 'subcontractor'],
    typicalExpiryMonths: 12,
  },
  letter_of_good_standing: {
    checkType: 'letter_of_good_standing',
    label: 'Letter of Good Standing',
    mandatory: false,
    description: 'General letter of good standing from relevant industry body or previous client',
    appliesTo: ['contractor', 'subcontractor', 'supplier'],
    typicalExpiryMonths: 6,
  },
  other: {
    checkType: 'other',
    label: 'Other Compliance Check',
    mandatory: false,
    description: 'Additional compliance check as specified by the project requirements',
    appliesTo: ['contractor', 'subcontractor', 'supplier'],
    typicalExpiryMonths: 12,
  },
};

const VALID_ENTITY_TYPES = new Set<string>(['contractor', 'subcontractor', 'supplier']);
const VALID_CHECK_TYPES = new Set(Object.keys(COMPLIANCE_CHECK_REQUIREMENTS));
const VALID_CHECK_STATUSES = new Set<string>(['compliant', 'non_compliant', 'expired', 'pending', 'not_applicable', 'waived']);

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
}

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildContractorCompliance(
  input: ContractorComplianceInput,
): ContractorComplianceRecord {
  assertNonEmpty(input.entityId, 'entityId');

  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw Object.assign(
      new Error(`Invalid entity type: ${input.entityType}. Must be one of: contractor, subcontractor, supplier`),
      { status: 400 },
    );
  }

  if (!input.checks.length) {
    throw Object.assign(
      new Error('At least one compliance check is required'),
      { status: 400 },
    );
  }

  const now = new Date();
  const validatedChecks: ComplianceCheckItem[] = input.checks.map((check) => {
    if (!VALID_CHECK_TYPES.has(check.checkType)) {
      throw Object.assign(
        new Error(`Invalid compliance check type: ${check.checkType}`),
        { status: 400 },
      );
    }

    if (!VALID_CHECK_STATUSES.has(check.status)) {
      throw Object.assign(
        new Error(`Invalid compliance check status: ${check.status}`),
        { status: 400 },
      );
    }

    if (check.expiresAt) {
      const expiryDate = new Date(check.expiresAt);
      if (isNaN(expiryDate.getTime())) {
        throw Object.assign(new Error(`expiresAt for ${check.checkType} must be a valid ISO date string`), { status: 400 });
      }
    }

    return { ...check };
  });

  // Compute missing critical checks for this entity type
  const mandatoryChecks = Object.values(COMPLIANCE_CHECK_REQUIREMENTS)
    .filter((req) => req.mandatory && req.appliesTo.includes(input.entityType))
    .map((req) => req.checkType);

  const presentCheckTypes = new Set(validatedChecks.map((c) => c.checkType));
  const missingCriticalChecks = mandatoryChecks.filter((t) => !presentCheckTypes.has(t));

  // Compute expired checks
  const expiredChecks = validatedChecks
    .filter((check) => {
      if (check.status === 'expired') return true;
      if (check.expiresAt) {
        return new Date(check.expiresAt).getTime() < now.getTime();
      }
      return false;
    })
    .map((check) => check.checkType);

  // Compute overall status
  const overallStatus = input.overallStatus || (() => {
    if (expiredChecks.length > 0) return 'expired';
    if (missingCriticalChecks.length > 0) return 'non_compliant';
    if (validatedChecks.some((c) => c.status === 'pending')) return 'pending';
    if (validatedChecks.some((c) => c.status === 'non_compliant')) return 'non_compliant';
    if (validatedChecks.every((c) => c.status === 'compliant' || c.status === 'not_applicable' || c.status === 'waived')) {
      return missingCriticalChecks.length === 0 ? 'compliant' : 'non_compliant';
    }
    return 'pending';
  })();

  const nowISO = now.toISOString();

  return {
    entityId: input.entityId.trim(),
    entityType: input.entityType,
    projectId: input.projectId?.trim(),
    checks: validatedChecks,
    overallStatus,
    missingCriticalChecks,
    expiredChecks,
    createdAt: nowISO,
    updatedAt: nowISO,
    immutable: true,
    metadata: input.metadata || {},
  };
}

// ── Analysis ───────────────────────────────────────────────────────────────────

export function getMissingComplianceChecks(
  record: ContractorComplianceRecord,
): { checkType: ContractorComplianceCheckType; label: string; reason: string }[] {
  const missing: { checkType: ContractorComplianceCheckType; label: string; reason: string }[] = [];

  // Missing mandatory checks
  for (const checkType of record.missingCriticalChecks) {
    const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
    missing.push({
      checkType,
      label: req.label,
      reason: `Mandatory ${req.label} not provided`,
    });
  }

  // Expired checks
  for (const checkType of record.expiredChecks) {
    const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
    missing.push({
      checkType,
      label: req.label,
      reason: `${req.label} has expired — renewal required`,
    });
  }

  // Non-compliant checks
  for (const check of record.checks) {
    if (check.status === 'non_compliant') {
      const req = COMPLIANCE_CHECK_REQUIREMENTS[check.checkType];
      missing.push({
        checkType: check.checkType,
        label: req.label,
        reason: `${req.label} is marked non-compliant — resolution required`,
      });
    }
  }

  return missing;
}

export function getExpiredChecks(
  record: ContractorComplianceRecord,
  now = new Date(),
): ComplianceCheckItem[] {
  return record.checks.filter((check) => {
    if (!check.expiresAt) return false;
    return new Date(check.expiresAt).getTime() < now.getTime();
  });
}

// ── Assertions ─────────────────────────────────────────────────────────────────

export function assertContractorCompliant(
  record: ContractorComplianceRecord,
): void {
  const missing = getMissingComplianceChecks(record);

  if (missing.length > 0) {
    const list = missing.map((m) => m.reason).join('; ');
    throw Object.assign(
      new Error(`Contractor/supplier compliance not met: ${list}`),
      {
        status: 409,
        missingComplianceChecks: missing,
        overallStatus: record.overallStatus,
      },
    );
  }
}

export function assertMinimumComplianceForProject(
  record: ContractorComplianceRecord,
): void {
  if (record.overallStatus === 'expired') {
    throw Object.assign(
      new Error('Contractor compliance has expired checks — cannot participate in projects until resolved'),
      { status: 409, overallStatus: record.overallStatus },
    );
  }

  // Health & Safety and COIDA are non-negotiable for site work
  const siteCriticalChecks: ContractorComplianceCheckType[] = ['health_safety_file', 'coida_registration'];
  for (const checkType of siteCriticalChecks) {
    if (record.missingCriticalChecks.includes(checkType)) {
      const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
      throw Object.assign(
        new Error(`${req.label} is required before participating in any project`),
        { status: 409, missingCheck: checkType },
      );
    }
    if (record.expiredChecks.includes(checkType)) {
      const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
      throw Object.assign(
        new Error(`${req.label} has expired — renewal required before project participation`),
        { status: 409, expiredCheck: checkType },
      );
    }
    const check = record.checks.find((c) => c.checkType === checkType);
    if (check && check.status === 'non_compliant') {
      const req = COMPLIANCE_CHECK_REQUIREMENTS[checkType];
      throw Object.assign(
        new Error(`${req.label} is non-compliant — resolution required before project participation`),
        { status: 409, checkType },
      );
    }
  }
}

export function getComplianceCheckSummary(record: ContractorComplianceRecord) {
  const total = record.checks.length;
  const compliant = record.checks.filter((c) => c.status === 'compliant').length;
  const nonCompliant = record.checks.filter((c) => c.status === 'non_compliant').length;
  const expired = record.expiredChecks.length;
  const pending = record.checks.filter((c) => c.status === 'pending').length;

  return {
    total,
    compliant,
    nonCompliant,
    expired,
    pending,
    missing: record.missingCriticalChecks.length,
    percentageCompliant: total > 0 ? Math.round((compliant / total) * 100) : 0,
    overallStatus: record.overallStatus,
    readyForProject: record.overallStatus === 'compliant' && expired === 0 && record.missingCriticalChecks.length === 0,
  };
}
