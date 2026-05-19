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
  'address',
  'taxNumber',
  'vatNumber',
  'bankingDetails',
  'bankVerificationStatus',
  'digitalSignatureStatus',
  'signatureProviderId',
] as const;

const CLIENT_PROFILE_FIELDS = [
  'idNumber',
  'companyRegistrationNumber',
  'billingAddress',
  'billingContactName',
  'billingEmail',
  'ownerName',
  'ownerAddress',
  'projectOwnerDetails',
  'projectTypes',
  'budgetRange',
  'preferredContactMethod',
] as const;

const PROFESSIONAL_PROFILE_FIELDS = [
  'disciplines',
  'statutoryBody',
  'registrationNumber',
  'council',
  'yearsExperience',
  'portfolioUrls',
  'services',
  'professionalIndemnity',
  'practiceDetails',
  'practiceRegistrationNumber',
  'piInsurancePolicyNumber',
  'piInsuranceExpiryDate',
] as const;

const CONTRACTOR_PROFILE_FIELDS = [
  'tradeCategories',
  'cidbGrade',
  'cidbNumber',
  'nhbrcNumber',
  'companyRegistrationNumber',
  'healthSafetyFiles',
  'serviceAreas',
  'insurance',
  'capacity',
  'plantCapacity',
  'labourCapacity',
] as const;

const PACKAGE_PARTICIPANT_PROFILE_FIELDS = [
  'packageTypes',
] as const;

const SUBCONTRACTOR_PROFILE_FIELDS = [
  ...PACKAGE_PARTICIPANT_PROFILE_FIELDS,
  'tradeCategories',
  'serviceAreas',
  'capacity',
  'insurance',
  'healthSafetyFiles',
  'assignedPackageScopes',
  'shopDrawingCapabilities',
  'sampleSubmissionCapabilities',
  'rfiContactEmail',
  'closeOutEvidenceTypes',
] as const;

const SUPPLIER_PROFILE_FIELDS = [
  ...PACKAGE_PARTICIPANT_PROFILE_FIELDS,
  'tradeCategories',
  'productCategories',
  'deliveryRegions',
  'catalogueUrls',
  'catalogueApiEndpoint',
  'standardLeadTimeDays',
  'deliveryNoteContact',
  'warrantySupport',
  'warrantyTermsUrl',
  'productSupportContact',
] as const;

const FREELANCER_PROFILE_FIELDS = [
  'disciplines',
  'skills',
  'software',
  'hourlyRate',
  'portfolioUrls',
  'availability',
  'payoutDetails',
] as const;

const ADMIN_PROFILE_FIELDS = [
  'permissionLevel',
  'department',
  'twoFactorEnabled',
  'auditIdentity',
] as const;

export const ROLE_FIELD_ALLOWLIST: Record<string, readonly string[]> = {
  client: [...COMMON_PROFILE_FIELDS, ...CLIENT_PROFILE_FIELDS],
  bep: [...COMMON_PROFILE_FIELDS, ...PROFESSIONAL_PROFILE_FIELDS],
  architect: [...COMMON_PROFILE_FIELDS, ...PROFESSIONAL_PROFILE_FIELDS, 'sacapNumber', 'linkedIn', 'specializations'],
  contractor: [...COMMON_PROFILE_FIELDS, ...CONTRACTOR_PROFILE_FIELDS],
  freelancer: [...COMMON_PROFILE_FIELDS, ...FREELANCER_PROFILE_FIELDS],
  subcontractor: [...COMMON_PROFILE_FIELDS, ...SUBCONTRACTOR_PROFILE_FIELDS],
  supplier: [...COMMON_PROFILE_FIELDS, ...SUPPLIER_PROFILE_FIELDS],
  admin: [...COMMON_PROFILE_FIELDS, ...ADMIN_PROFILE_FIELDS],
};

export const REQUIRED_ROLE_PROFILE_FIELDS: Record<string, readonly string[]> = {
  client: ['displayName', 'billingAddress', 'ownerAddress', 'digitalSignatureStatus'],
  bep: ['displayName', 'disciplines', 'statutoryBody', 'registrationNumber', 'professionalIndemnity', 'practiceDetails', 'taxNumber', 'digitalSignatureStatus'],
  architect: ['displayName', 'disciplines', 'statutoryBody', 'registrationNumber', 'professionalIndemnity', 'practiceDetails', 'taxNumber', 'digitalSignatureStatus'],
  contractor: ['displayName', 'cidbNumber', 'nhbrcNumber', 'companyRegistrationNumber', 'healthSafetyFiles', 'bankingDetails'],
  subcontractor: ['displayName', 'tradeCategories', 'packageTypes', 'bankingDetails', 'serviceAreas', 'assignedPackageScopes'],
  supplier: ['displayName', 'productCategories', 'deliveryRegions', 'warrantySupport', 'bankingDetails', 'standardLeadTimeDays'],
  freelancer: ['displayName', 'skills', 'software', 'availability', 'payoutDetails'],
  admin: ['displayName', 'permissionLevel', 'department', 'twoFactorEnabled', 'auditIdentity'],
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


function hasProfileValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (value && typeof value === 'object') return Object.keys(value).length > 0;
  return value !== null && value !== undefined;
}

export interface RoleProfileCompletion {
  role: UserRole;
  requiredFields: string[];
  missingFields: string[];
  completedFields: string[];
  completionRatio: number;
  isComplete: boolean;
  blockers: string[];
}

export function getRoleProfileCompletion(role: UserRole | string | undefined, profile: RoleProfileInput): RoleProfileCompletion {
  const normalizedRole = normalizeUserRole(role);
  if (!normalizedRole) throw new Error('Unsupported role for profile completion');

  const requiredFields = [...(REQUIRED_ROLE_PROFILE_FIELDS[normalizedRole] || [])];
  const completedFields = requiredFields.filter((field) => hasProfileValue(profile?.[field]));
  const missingFields = requiredFields.filter((field) => !hasProfileValue(profile?.[field]));
  const completionRatio = requiredFields.length === 0 ? 1 : completedFields.length / requiredFields.length;
  const blockers = missingFields.length > 0 ? [`Profile incomplete: ${missingFields.join(', ')}`] : [];

  if (['client', 'bep', 'architect'].includes(normalizedRole) && profile?.digitalSignatureStatus !== 'active') {
    blockers.push('Digital signature setup is not active');
  }

  return {
    role: normalizedRole,
    requiredFields,
    missingFields,
    completedFields,
    completionRatio,
    isComplete: missingFields.length === 0 && blockers.length === 0,
    blockers,
  };
}
