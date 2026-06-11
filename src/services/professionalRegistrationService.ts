import type { UserRole } from '@/types';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ProfessionalBody = 'SACAP' | 'ECSA' | 'SACQSP' | 'SACLAP' | 'SACPCMP';

export type ProfessionalRegistrationStatus =
  | 'active'
  | 'suspended'
  | 'expired'
  | 'candidate'
  | 'pending'
  | 'lapsed';

export type ProfessionalCategory =
  | 'Professional Architect'
  | 'Professional Senior Architectural Technologist'
  | 'Professional Architectural Technologist'
  | 'Professional Architectural Draughtsperson'
  | 'Candidate Architect'
  | 'Candidate Senior Architectural Technologist'
  | 'Candidate Architectural Technologist'
  | 'Candidate Architectural Draughtsperson'
  | 'Professional Engineer'
  | 'Professional Engineering Technologist'
  | 'Professional Engineering Technician'
  | 'Candidate Engineer'
  | 'Candidate Engineering Technologist'
  | 'Candidate Engineering Technician'
  | 'Professional Quantity Surveyor'
  | 'Candidate Quantity Surveyor'
  | 'Professional Land Surveyor'
  | 'Candidate Land Surveyor'
  | 'Professional Construction Project Manager'
  | 'Candidate Construction Project Manager'
  | 'Professional Construction Manager'
  | 'Candidate Construction Manager';

export interface ProfessionalRegistrationInput {
  userId: string;
  professionalBody: ProfessionalBody;
  registrationNumber: string;
  category: ProfessionalCategory;
  status?: ProfessionalRegistrationStatus;
  expiryDate: string;
  lastVerifiedAt?: string;
  verifiedBy?: string;
  verificationSource?: string;
  evidenceDocumentIds?: string[];
  evidenceUrls?: string[];
  metadata?: Record<string, unknown>;
}

export interface ProfessionalRegistrationRecord {
  userId: string;
  professionalBody: ProfessionalBody;
  registrationNumber: string;
  category: ProfessionalCategory;
  status: ProfessionalRegistrationStatus;
  expiryDate: string;
  lastVerifiedAt?: string;
  verifiedBy?: string;
  verificationSource?: string;
  evidenceDocumentIds: string[];
  evidenceUrls: string[];
  createdAt: string;
  updatedAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export type RegistrationLifecycleStatus =
  | 'active'
  | 'expiring_soon'
  | 'due_for_renewal'
  | 'expired'
  | 'suspended'
  | 'pending'
  | 'candidate';

export interface RegistrationLifecycleState {
  status: RegistrationLifecycleStatus;
  daysUntilExpiry?: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isDueForRenewal: boolean;
  requiresAction: boolean;
  actionLabel?: string;
}

export interface RegistrationQueueItem {
  userId: string;
  professionalBody: ProfessionalBody;
  registrationNumber: string;
  status: ProfessionalRegistrationStatus;
  lifecycleStatus: RegistrationLifecycleStatus;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  action: string;
  requiresHumanReview: boolean;
  blocker?: string;
  daysUntilExpiry?: number;
  score: number;
}

export interface RegistrationQueueProjection {
  items: RegistrationQueueItem[];
  summary: {
    total: number;
    expired: number;
    expiringSoon: number;
    pending: number;
    suspended: number;
    candidate: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const PROFESSIONAL_BODIES: ProfessionalBody[] = [
  'SACAP',
  'ECSA',
  'SACQSP',
  'SACLAP',
  'SACPCMP',
];

export const PROFESSIONAL_BODY_LABELS: Record<ProfessionalBody, string> = {
  SACAP: 'SACAP — Architectural Professionals',
  ECSA: 'ECSA — Engineering Professionals',
  SACQSP: 'SACQSP — Quantity Surveying Professionals',
  SACLAP: 'SACLAP — Land Surveying Professionals',
  SACPCMP: 'SACPCMP — Construction & Project Management Professionals',
};

export const PROFESSIONAL_BODY_WEBSITES: Record<ProfessionalBody, string> = {
  SACAP: 'https://www.sacapsa.com/',
  ECSA: 'https://www.ecsa.co.za/',
  SACQSP: 'https://www.sacqsp.org.za/',
  SACLAP: 'https://www.saclap.org.za/',
  SACPCMP: 'https://www.sacpcmp.org.za/',
};

/** Minimum Professional Indemnity insurance cover (in ZAR) per professional body */
export const MINIMUM_PI_COVERAGE: Record<ProfessionalBody, number> = {
  SACAP: 2_000_000,
  ECSA: 3_000_000,
  SACQSP: 1_000_000,
  SACLAP: 1_000_000,
  SACPCMP: 2_000_000,
};

const VALID_BODIES = new Set<string>(PROFESSIONAL_BODIES);
const VALID_STATUSES = new Set<ProfessionalRegistrationStatus>([
  'active', 'suspended', 'expired', 'candidate', 'pending', 'lapsed',
]);

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
}

function copyStringArray(value?: string[]): string[] {
  return Array.isArray(value) ? [...value] : [];
}

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildProfessionalRegistration(
  input: ProfessionalRegistrationInput,
): ProfessionalRegistrationRecord {
  assertNonEmpty(input.userId, 'userId');
  assertNonEmpty(input.registrationNumber, 'registrationNumber');
  assertNonEmpty(input.category, 'category');

  const body = input.professionalBody?.toUpperCase() as ProfessionalBody;
  if (!VALID_BODIES.has(body)) {
    throw Object.assign(
      new Error(`Unsupported professional body: ${input.professionalBody}. Must be one of: ${PROFESSIONAL_BODIES.join(', ')}`),
      { status: 400 },
    );
  }

  const status = input.status || 'pending';
  if (!VALID_STATUSES.has(status)) {
    throw Object.assign(
      new Error(`Invalid registration status: ${status}`),
      { status: 400 },
    );
  }

  const expiryDate = new Date(input.expiryDate);
  if (isNaN(expiryDate.getTime())) {
    throw Object.assign(new Error('expiryDate must be a valid ISO date string'), { status: 400 });
  }

  const now = new Date().toISOString();

  return {
    userId: input.userId.trim(),
    professionalBody: body,
    registrationNumber: input.registrationNumber.trim().toUpperCase(),
    category: input.category.trim() as ProfessionalCategory,
    status,
    expiryDate: expiryDate.toISOString(),
    lastVerifiedAt: input.lastVerifiedAt,
    verifiedBy: input.verifiedBy,
    verificationSource: input.verificationSource,
    evidenceDocumentIds: copyStringArray(input.evidenceDocumentIds),
    evidenceUrls: copyStringArray(input.evidenceUrls),
    createdAt: now,
    updatedAt: now,
    immutable: true,
    metadata: input.metadata || {},
  };
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export function getRegistrationLifecycle(
  record: Pick<ProfessionalRegistrationRecord, 'status' | 'expiryDate'>,
  options: { now?: Date; expiringWithinDays?: number; renewalWithinDays?: number } = {},
): RegistrationLifecycleState {
  const now = options.now || new Date();
  const expiringWithinDays = options.expiringWithinDays ?? 30;
  const renewalWithinDays = options.renewalWithinDays ?? 90;

  if (record.status === 'suspended') {
    return {
      status: 'suspended',
      isExpired: false,
      isExpiringSoon: false,
      isDueForRenewal: true,
      requiresAction: true,
      actionLabel: 'Registration suspended — contact professional body for reinstatement',
    };
  }

  if (record.status === 'expired' || record.status === 'lapsed') {
    return {
      status: 'expired',
      isExpired: true,
      isExpiringSoon: false,
      isDueForRenewal: true,
      requiresAction: true,
      actionLabel: 'Registration expired — renewal required before any professional activity',
    };
  }

  if (record.status === 'pending') {
    return {
      status: 'pending',
      isExpired: false,
      isExpiringSoon: false,
      isDueForRenewal: false,
      requiresAction: true,
      actionLabel: 'Registration pending verification',
    };
  }

  if (record.status === 'candidate') {
    return {
      status: 'candidate',
      isExpired: false,
      isExpiringSoon: false,
      isDueForRenewal: false,
      requiresAction: false,
      actionLabel: 'Candidate registration — supervised practice required',
    };
  }

  // Active — check expiry
  const expiryTime = new Date(record.expiryDate).getTime();
  const msUntilExpiry = expiryTime - now.getTime();
  const daysUntilExpiry = Math.ceil(msUntilExpiry / 86_400_000);

  if (msUntilExpiry < 0) {
    return {
      status: 'expired',
      daysUntilExpiry,
      isExpired: true,
      isExpiringSoon: false,
      isDueForRenewal: true,
      requiresAction: true,
      actionLabel: 'Registration has passed expiry — immediate renewal required',
    };
  }

  if (daysUntilExpiry <= expiringWithinDays) {
    return {
      status: 'expiring_soon',
      daysUntilExpiry,
      isExpired: false,
      isExpiringSoon: true,
      isDueForRenewal: true,
      requiresAction: true,
      actionLabel: `Registration expires in ${daysUntilExpiry} days — renew now`,
    };
  }

  if (daysUntilExpiry <= renewalWithinDays) {
    return {
      status: 'due_for_renewal',
      daysUntilExpiry,
      isExpired: false,
      isExpiringSoon: false,
      isDueForRenewal: true,
      requiresAction: true,
      actionLabel: `Registration renewal window open (${daysUntilExpiry} days until expiry)`,
    };
  }

  return {
    status: 'active',
    daysUntilExpiry,
    isExpired: false,
    isExpiringSoon: false,
    isDueForRenewal: false,
    requiresAction: false,
  };
}

// ── Assertions ─────────────────────────────────────────────────────────────────

export function assertActiveRegistration(
  record: Pick<ProfessionalRegistrationRecord, 'status' | 'expiryDate'>,
  options: { now?: Date; allowCandidate?: boolean } = {},
): void {
  const lifecycle = getRegistrationLifecycle(record, options);

  if (lifecycle.status === 'active') return;

  if (record.status === 'candidate' && options.allowCandidate) return;

  if (lifecycle.status === 'suspended') {
    throw Object.assign(
      new Error(`Professional registration (${record.status}) is suspended — cannot perform statutory actions`),
      { status: 403, registrationLifecycle: lifecycle },
    );
  }

  if (lifecycle.status === 'expired') {
    throw Object.assign(
      new Error(`Professional registration has expired — renewal required`),
      { status: 403, registrationLifecycle: lifecycle },
    );
  }

  if (lifecycle.isExpiringSoon) {
    throw Object.assign(
      new Error(`Professional registration expires in ${lifecycle.daysUntilExpiry} days — renewal required before statutory actions`),
      { status: 409, registrationLifecycle: lifecycle },
    );
  }
}

// ── Queue Projection ───────────────────────────────────────────────────────────

function resolveRegistrationPriority(lifecycle: RegistrationLifecycleState): RegistrationQueueItem['priority'] {
  if (lifecycle.status === 'expired' || lifecycle.status === 'suspended') return 'urgent';
  if (lifecycle.status === 'expiring_soon') return 'high';
  if (lifecycle.status === 'pending') return 'medium';
  if (lifecycle.status === 'due_for_renewal') return 'medium';
  if (lifecycle.status === 'candidate') return 'low';
  return 'low';
}

function priorityScore(priority: RegistrationQueueItem['priority']): number {
  if (priority === 'urgent') return 400;
  if (priority === 'high') return 300;
  if (priority === 'medium') return 200;
  return 100;
}

function resolveRegistrationAction(
  record: ProfessionalRegistrationRecord,
  lifecycle: RegistrationLifecycleState,
): string {
  const bodyLabel = PROFESSIONAL_BODY_LABELS[record.professionalBody] || record.professionalBody;

  if (lifecycle.status === 'expired') {
    return `Renew expired ${record.professionalBody} registration ${record.registrationNumber} immediately — cannot participate in projects until reinstated`;
  }
  if (lifecycle.status === 'suspended') {
    return `Resolve ${record.professionalBody} suspension for registration ${record.registrationNumber} — contact ${bodyLabel}`;
  }
  if (lifecycle.status === 'expiring_soon') {
    return `Renew ${record.professionalBody} registration ${record.registrationNumber} before expiry (${lifecycle.daysUntilExpiry} days remaining)`;
  }
  if (lifecycle.status === 'pending') {
    return `Verify ${record.professionalBody} registration ${record.registrationNumber} — submit evidence or run public-register check`;
  }
  if (lifecycle.status === 'due_for_renewal') {
    return `Initiate ${record.professionalBody} renewal for registration ${record.registrationNumber} (${lifecycle.daysUntilExpiry} days until expiry)`;
  }
  if (lifecycle.status === 'candidate') {
    return `Monitor candidate registration ${record.registrationNumber} — supervised practice until professional registration`;
  }
  return `${record.professionalBody} registration ${record.registrationNumber} is active — no action required`;
}

export function buildRegistrationQueueProjection(
  registrations: ProfessionalRegistrationRecord[],
  options: { now?: Date; expiringWithinDays?: number; renewalWithinDays?: number } = {},
): RegistrationQueueProjection {
  const now = options.now || new Date();

  const items = registrations
    .map((record) => {
      const lifecycle = getRegistrationLifecycle(record, options);
      const priority = resolveRegistrationPriority(lifecycle);
      const action = resolveRegistrationAction(record, lifecycle);

      return {
        userId: record.userId,
        professionalBody: record.professionalBody,
        registrationNumber: record.registrationNumber,
        status: record.status,
        lifecycleStatus: lifecycle.status,
        priority,
        action,
        requiresHumanReview: lifecycle.requiresAction,
        blocker: lifecycle.requiresAction ? lifecycle.actionLabel : undefined,
        daysUntilExpiry: lifecycle.daysUntilExpiry,
        score: priorityScore(priority) + (lifecycle.daysUntilExpiry ? Math.max(0, 90 - lifecycle.daysUntilExpiry) : 0),
      };
    })
    .sort((a, b) => b.score - a.score);

  return {
    items,
    summary: {
      total: items.length,
      expired: items.filter((i) => i.lifecycleStatus === 'expired').length,
      expiringSoon: items.filter((i) => i.lifecycleStatus === 'expiring_soon').length,
      pending: items.filter((i) => i.lifecycleStatus === 'pending').length,
      suspended: items.filter((i) => i.lifecycleStatus === 'suspended').length,
      candidate: items.filter((i) => i.lifecycleStatus === 'candidate').length,
    },
  };
}

// ── Utility ────────────────────────────────────────────────────────────────────

export function normalizeProfessionalBody(value?: string): ProfessionalBody | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().toUpperCase();
  return VALID_BODIES.has(normalized) ? (normalized as ProfessionalBody) : undefined;
}

export function canActAsPrincipalAgent(
  registration: Pick<ProfessionalRegistrationRecord, 'professionalBody' | 'status' | 'expiryDate'>,
  now = new Date(),
): boolean {
  if (registration.status !== 'active') return false;
  const lifecycle = getRegistrationLifecycle(registration, { now });
  return lifecycle.status === 'active';
}
