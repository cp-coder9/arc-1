import type { UserRole } from '@/types';
import { normalizeUserRole } from './permissionService';

export type RoleProfileInput = Record<string, unknown>;

export interface VerificationLike {
  status?: string;
  verified?: boolean;
  verificationStatus?: string;
  checkedAt?: string;
}

export interface DirectoryUserLike {
  uid: string;
  displayName?: string;
  email?: string;
  role?: UserRole | string;
}

const COMMON_PROFILE_FIELDS = [
  'displayName',
  'phone',
  'region',
  'city',
  'bio',
  'website',
  'avatarUrl',
] as const;

const ROLE_FIELD_ALLOWLIST: Record<string, readonly string[]> = {
  client: [...COMMON_PROFILE_FIELDS, 'projectTypes', 'budgetRange', 'preferredContactMethod'],
  bep: [...COMMON_PROFILE_FIELDS, 'disciplines', 'registrationNumber', 'council', 'yearsExperience', 'portfolioUrls', 'services', 'professionalIndemnity'],
  contractor: [...COMMON_PROFILE_FIELDS, 'tradeCategories', 'cidbGrade', 'serviceAreas', 'insurance', 'capacity'],
  freelancer: [...COMMON_PROFILE_FIELDS, 'disciplines', 'skills', 'hourlyRate', 'portfolioUrls', 'availability'],
  subcontractor: [...COMMON_PROFILE_FIELDS, 'tradeCategories', 'serviceAreas', 'capacity', 'insurance'],
  supplier: [...COMMON_PROFILE_FIELDS, 'productCategories', 'serviceAreas', 'deliveryRegions', 'catalogueUrls'],
  admin: COMMON_PROFILE_FIELDS,
};

const BLOCKED_PROFILE_FIELDS = new Set([
  'uid',
  'id',
  'role',
  'normalizedRole',
  'admin',
  'isAdmin',
  'claims',
  'customClaims',
  'verified',
  'verificationStatus',
  'verification',
  'trustScore',
  'rating',
  'createdAt',
  'updatedAt',
  'createdBy',
  'updatedBy',
]);

function copyAllowedFields(input: RoleProfileInput, allowlist: readonly string[]): RoleProfileInput {
  const sanitized: RoleProfileInput = {};
  for (const field of allowlist) {
    if (!BLOCKED_PROFILE_FIELDS.has(field) && input[field] !== undefined) sanitized[field] = input[field];
  }
  return sanitized;
}

export function sanitizeRoleProfileUpdate(role: UserRole | string | undefined, input: RoleProfileInput): RoleProfileInput {
  const normalizedRole = normalizeUserRole(role);
  if (!normalizedRole) throw new Error('Unsupported role for profile update');
  return copyAllowedFields(input || {}, ROLE_FIELD_ALLOWLIST[normalizedRole] || COMMON_PROFILE_FIELDS);
}

export function buildDirectoryProfile(user: DirectoryUserLike, roleProfile: RoleProfileInput, verification?: VerificationLike | null): RoleProfileInput {
  const normalizedRole = normalizeUserRole(user.role);
  if (!normalizedRole) throw new Error('Unsupported role for directory profile');

  const safeProfile = sanitizeRoleProfileUpdate(normalizedRole, roleProfile || {});
  const verificationStatus = verification?.verificationStatus || verification?.status || 'unverified';

  return {
    userId: user.uid,
    displayName: safeProfile.displayName || user.displayName || '',
    role: normalizedRole,
    region: safeProfile.region || '',
    city: safeProfile.city || '',
    disciplines: safeProfile.disciplines || safeProfile.tradeCategories || safeProfile.productCategories || [],
    services: safeProfile.services || safeProfile.skills || [],
    bio: safeProfile.bio || '',
    verified: verification?.verified === true || verificationStatus === 'verified',
    verificationStatus,
    verificationCheckedAt: verification?.checkedAt || null,
    visibility: 'directory',
  };
}
