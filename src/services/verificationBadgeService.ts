// ── Types ──────────────────────────────────────────────────────────────────────

export type VerificationBadgeType =
  | 'identity_verified'
  | 'professional_registration_verified'
  | 'insurance_verified'
  | 'compliance_verified';

export type BadgeProvenance =
  | 'self_declared'
  | 'document_uploaded'
  | 'manually_reviewed'
  | 'externally_verified';

export interface VerificationBadgeInput {
  badgeType: VerificationBadgeType;
  entityId: string;
  entityType: 'professional' | 'company' | 'contractor' | 'supplier';
  provenance: BadgeProvenance;
  evidenceReference?: string;
  evidenceType?: string;
  expiresAt?: string;
  issuedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface VerificationBadge {
  id?: string;
  badgeType: VerificationBadgeType;
  entityId: string;
  entityType: VerificationBadgeInput['entityType'];
  provenance: BadgeProvenance;
  evidenceReference?: string;
  evidenceType?: string;
  issuedAt: string;
  expiresAt?: string;
  issuedBy?: string;
  createdAt: string;
  immutable: true;
  metadata: Record<string, unknown>;
}

export interface BadgeDisplayConfig {
  icon: string;
  label: string;
  color: string;
  description: string;
}

export interface DisplayBadge {
  badgeType: VerificationBadgeType;
  provenance: BadgeProvenance;
  icon: string;
  label: string;
  color: string;
  issuedAt: string;
  expiresAt?: string;
  isExpired: boolean;
}

// ── Provenance Levels ──────────────────────────────────────────────────────────

export const PROVENANCE_LEVELS: Record<BadgeProvenance, number> = {
  self_declared: 0,
  document_uploaded: 1,
  manually_reviewed: 2,
  externally_verified: 3,
};

export const PROVENANCE_LABELS: Record<BadgeProvenance, string> = {
  self_declared: 'Self Declared',
  document_uploaded: 'Document Uploaded',
  manually_reviewed: 'Manually Reviewed',
  externally_verified: 'Externally Verified',
};

// ── Badge Display Config ───────────────────────────────────────────────────────

/**
 * Display configuration per badge type + provenance level.
 * The color scheme uses:
 * - Gray: self_declared (unverified)
 * - Amber: document_uploaded (evidence provided)
 * - Blue: manually_reviewed (admin verified)
 * - Green: externally_verified (professional body / public register verified)
 */
export const BADGE_DISPLAY_CONFIG: Record<VerificationBadgeType, Record<BadgeProvenance, BadgeDisplayConfig>> = {
  identity_verified: {
    self_declared: {
      icon: '🆔',
      label: 'Identity — Self Declared',
      color: 'gray',
      description: 'User has self-declared their identity without providing verification evidence',
    },
    document_uploaded: {
      icon: '🆔',
      label: 'Identity — Documents Uploaded',
      color: 'amber',
      description: 'Identity document evidence has been uploaded and is pending review',
    },
    manually_reviewed: {
      icon: '✅',
      label: 'Identity Verified',
      color: 'blue',
      description: 'Identity has been manually reviewed and verified by platform admin',
    },
    externally_verified: {
      icon: '✅',
      label: 'Identity Verified (External)',
      color: 'green',
      description: 'Identity verified via external provider (e.g., bank verification, PrivySeal)',
    },
  },
  professional_registration_verified: {
    self_declared: {
      icon: '📋',
      label: 'Registration — Self Declared',
      color: 'gray',
      description: 'Professional registration self-declared without verification',
    },
    document_uploaded: {
      icon: '📋',
      label: 'Registration — Certificate Uploaded',
      color: 'amber',
      description: 'Registration certificate uploaded and pending review',
    },
    manually_reviewed: {
      icon: '🏛️',
      label: 'Registration Verified',
      color: 'blue',
      description: 'Professional registration reviewed by platform admin against uploaded evidence',
    },
    externally_verified: {
      icon: '🏛️',
      label: 'Registration Verified (Public Register)',
      color: 'green',
      description: 'Professional registration confirmed against official statutory body public register',
    },
  },
  insurance_verified: {
    self_declared: {
      icon: '🛡️',
      label: 'Insurance — Self Declared',
      color: 'gray',
      description: 'PI insurance self-declared without certificate evidence',
    },
    document_uploaded: {
      icon: '🛡️',
      label: 'Insurance — Certificate Uploaded',
      color: 'amber',
      description: 'PI insurance certificate uploaded and pending review',
    },
    manually_reviewed: {
      icon: '🛡️',
      label: 'Insurance Verified',
      color: 'blue',
      description: 'PI insurance verified by platform admin against uploaded certificate',
    },
    externally_verified: {
      icon: '🛡️',
      label: 'Insurance Verified (Provider)',
      color: 'green',
      description: 'PI insurance confirmed directly with insurance provider',
    },
  },
  compliance_verified: {
    self_declared: {
      icon: '📄',
      label: 'Compliance — Self Declared',
      color: 'gray',
      description: 'Compliance status self-declared without evidence',
    },
    document_uploaded: {
      icon: '📄',
      label: 'Compliance — Documents Uploaded',
      color: 'amber',
      description: 'Compliance documents uploaded and pending review',
    },
    manually_reviewed: {
      icon: '✔️',
      label: 'Compliance Verified',
      color: 'blue',
      description: 'Compliance status verified by platform admin',
    },
    externally_verified: {
      icon: '✔️',
      label: 'Compliance Verified (External)',
      color: 'green',
      description: 'Compliance status verified via external source (CIPC, SARS, etc.)',
    },
  },
};

const VALID_BADGE_TYPES = new Set(['identity_verified', 'professional_registration_verified', 'insurance_verified', 'compliance_verified']);
const VALID_PROVENANCES = new Set(['self_declared', 'document_uploaded', 'manually_reviewed', 'externally_verified']);
const VALID_ENTITY_TYPES = new Set(['professional', 'company', 'contractor', 'supplier']);

// ── Helpers ────────────────────────────────────────────────────────────────────

function assertNonEmpty(value: string | undefined, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw Object.assign(new Error(`${field} is required`), { status: 400 });
  }
}

// ── Builder ────────────────────────────────────────────────────────────────────

export function buildVerificationBadge(
  input: VerificationBadgeInput,
): VerificationBadge {
  assertNonEmpty(input.entityId, 'entityId');

  if (!VALID_BADGE_TYPES.has(input.badgeType)) {
    throw Object.assign(
      new Error(`Invalid badge type: ${input.badgeType}. Must be one of: identity_verified, professional_registration_verified, insurance_verified, compliance_verified`),
      { status: 400 },
    );
  }

  if (!VALID_PROVENANCES.has(input.provenance)) {
    throw Object.assign(
      new Error(`Invalid badge provenance: ${input.provenance}. Must be one of: self_declared, document_uploaded, manually_reviewed, externally_verified`),
      { status: 400 },
    );
  }

  if (!VALID_ENTITY_TYPES.has(input.entityType)) {
    throw Object.assign(
      new Error(`Invalid entity type: ${input.entityType}`),
      { status: 400 },
    );
  }

  // Self-declared badges without evidence should be flagged
  if (input.provenance === 'self_declared' && input.evidenceReference) {
    // A self-declared badge should not typically have evidence references
    // but we allow it for the case where evidence is being gathered
  }

  if (input.expiresAt) {
    const expiryDate = new Date(input.expiresAt);
    if (isNaN(expiryDate.getTime())) {
      throw Object.assign(new Error('expiresAt must be a valid ISO date string'), { status: 400 });
    }
  }

  const now = new Date().toISOString();

  return {
    badgeType: input.badgeType,
    entityId: input.entityId.trim(),
    entityType: input.entityType,
    provenance: input.provenance,
    evidenceReference: input.evidenceReference?.trim(),
    evidenceType: input.evidenceType?.trim(),
    issuedAt: now,
    expiresAt: input.expiresAt,
    issuedBy: input.issuedBy?.trim(),
    createdAt: now,
    immutable: true,
    metadata: input.metadata || {},
  };
}

// ── Provenance Helpers ─────────────────────────────────────────────────────────

export function getBadgeProvenanceLevel(provenance: BadgeProvenance): number {
  return PROVENANCE_LEVELS[provenance];
}

export function compareProvenance(a: BadgeProvenance, b: BadgeProvenance): number {
  return getBadgeProvenanceLevel(a) - getBadgeProvenanceLevel(b);
}

export function getHighestProvenance(provenances: BadgeProvenance[]): BadgeProvenance {
  return provenances.reduce((highest, current) =>
    compareProvenance(highest, current) >= 0 ? highest : current
  );
}

// ── Badge Display ──────────────────────────────────────────────────────────────

export function isBadgeExpired(badge: VerificationBadge, now = new Date()): boolean {
  if (!badge.expiresAt) return false;
  return new Date(badge.expiresAt).getTime() < now.getTime();
}

export function getBadgeDisplayConfig(
  badgeType: VerificationBadgeType,
  provenance: BadgeProvenance,
): BadgeDisplayConfig {
  return BADGE_DISPLAY_CONFIG[badgeType][provenance];
}

export function toDisplayBadge(badge: VerificationBadge, now = new Date()): DisplayBadge {
  const config = getBadgeDisplayConfig(badge.badgeType, badge.provenance);
  return {
    badgeType: badge.badgeType,
    provenance: badge.provenance,
    icon: config.icon,
    label: config.label,
    color: config.color,
    issuedAt: badge.issuedAt,
    expiresAt: badge.expiresAt,
    isExpired: isBadgeExpired(badge, now),
  };
}

/**
 * Returns the best (highest-provenance) non-expired badge per type for public display.
 * For each badge type, only the highest-provenance active badge is shown.
 */
export function getDisplayBadgesForEntity(
  badges: VerificationBadge[],
  now = new Date(),
): DisplayBadge[] {
  const activeBadges = badges.filter((b) => !isBadgeExpired(b, now));

  // Group by badge type and pick highest provenance per type
  const bestPerType = new Map<VerificationBadgeType, VerificationBadge>();
  for (const badge of activeBadges) {
    const existing = bestPerType.get(badge.badgeType);
    if (!existing || compareProvenance(badge.provenance, existing.provenance) > 0) {
      bestPerType.set(badge.badgeType, badge);
    }
  }

  return Array.from(bestPerType.values()).map((b) => toDisplayBadge(b, now));
}

/**
 * Returns all badge types that exist for an entity, with their current provenance level.
 */
export function getEntityVerificationSummary(
  badges: VerificationBadge[],
  now = new Date(),
): Record<VerificationBadgeType, { hasBadge: boolean; provenance: BadgeProvenance | null; isExpired: boolean }> {
  const badgeTypes: VerificationBadgeType[] = [
    'identity_verified',
    'professional_registration_verified',
    'insurance_verified',
    'compliance_verified',
  ];

  const summary = {} as Record<VerificationBadgeType, any>;

  for (const badgeType of badgeTypes) {
    const typeBadges = badges.filter((b) => b.badgeType === badgeType);
    if (typeBadges.length === 0) {
      summary[badgeType] = { hasBadge: false, provenance: null, isExpired: false };
    } else {
      const best = typeBadges.reduce((a, b) =>
        compareProvenance(a.provenance, b.provenance) >= 0 ? a : b
      );
      summary[badgeType] = {
        hasBadge: true,
        provenance: best.provenance,
        isExpired: isBadgeExpired(best, now),
      };
    }
  }

  return summary;
}
