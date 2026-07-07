/**
 * Municipality Profile Service — Business logic for municipality-specific
 * configurations including forms, fees, process variations, and timeframes.
 *
 * Pure functions for CRUD operations, profile resolution with SPLUMA default
 * fallback, and lookups for required documents, fees, and timeframes.
 *
 * Firestore collection: `planning_municipality_profiles` (scoped by tenantId)
 */

import type {
  MunicipalityProfile,
  FeeScheduleItem,
  RequiredForm,
  CustomTimeframe,
  PlanningApplicationType,
  ContactDetails,
} from '../types';

import { SPLUMA_DEFAULT_TIMEFRAMES } from '../constants';

// ── In-Memory Store ─────────────────────────────────────────────────────────

/** In-memory store for municipality profiles (MVP — replaces Firestore). */
let profiles: MunicipalityProfile[] = [];

/** Auto-incrementing counter for generating unique IDs. */
let idCounter = 0;

/**
 * Generate a unique profile ID.
 */
function generateId(): string {
  idCounter += 1;
  return `muni_profile_${Date.now()}_${idCounter}`;
}

/**
 * Get the current ISO timestamp string.
 */
function nowTimestamp(): string {
  return new Date().toISOString();
}

// ── SPLUMA Default Profile ──────────────────────────────────────────────────

/** Default SPLUMA contact details placeholder. */
const DEFAULT_CONTACT: ContactDetails = {
  name: 'SPLUMA National Office',
  email: '',
  phone: '',
};

/**
 * Returns the SPLUMA default municipality profile.
 *
 * This profile uses national-level SPLUMA requirements and applies when no
 * municipality-specific configuration exists. It contains reasonable defaults:
 * name "SPLUMA Default", province "National", empty fee schedule, empty forms,
 * empty process variations, and SPLUMA default timeframes converted to
 * CustomTimeframe entries.
 */
export function getDefaultProfile(): MunicipalityProfile {
  const now = nowTimestamp();
  return {
    id: 'spluma_default',
    tenantId: '',
    name: 'SPLUMA Default',
    province: 'National',
    contactDetails: { ...DEFAULT_CONTACT },
    landUseSchemeReference: 'SPLUMA (Act 16 of 2013)',
    feeSchedule: [],
    requiredForms: [],
    processVariations: [],
    customTimeframes: [
      {
        deadlineType: 'objection_period',
        defaultDays: SPLUMA_DEFAULT_TIMEFRAMES.objectionPeriodDays,
        municipalityDays: SPLUMA_DEFAULT_TIMEFRAMES.objectionPeriodDays,
        statutoryReference: 'SPLUMA Section 53',
      },
      {
        deadlineType: 'appeal_period',
        defaultDays: SPLUMA_DEFAULT_TIMEFRAMES.appealPeriodDays,
        municipalityDays: SPLUMA_DEFAULT_TIMEFRAMES.appealPeriodDays,
        statutoryReference: 'SPLUMA Section 51',
      },
      {
        deadlineType: 'decision_period',
        defaultDays: SPLUMA_DEFAULT_TIMEFRAMES.decisionPeriodDays,
        municipalityDays: SPLUMA_DEFAULT_TIMEFRAMES.decisionPeriodDays,
        statutoryReference: 'SPLUMA Section 56',
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

// ── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Creates a new municipality profile with auto-generated ID and timestamps.
 *
 * Stores in the in-memory collection scoped by the provided tenantId.
 *
 * @param params - Profile data excluding id, createdAt, and updatedAt
 * @returns The newly created MunicipalityProfile with generated fields
 */
export function createProfile(
  params: Omit<MunicipalityProfile, 'id' | 'createdAt' | 'updatedAt'>,
): MunicipalityProfile {
  const now = nowTimestamp();
  const profile: MunicipalityProfile = {
    ...params,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };
  profiles.push(profile);
  return profile;
}

/**
 * Updates an existing municipality profile by ID.
 *
 * Preserves `createdAt` and updates `updatedAt`. Fields not included in the
 * updates parameter remain unchanged.
 *
 * @param profileId - The ID of the profile to update
 * @param updates - Partial profile fields to apply
 * @returns The updated MunicipalityProfile
 * @throws Error if no profile with the given ID exists
 */
export function updateProfile(
  profileId: string,
  updates: Partial<Omit<MunicipalityProfile, 'id' | 'createdAt'>>,
): MunicipalityProfile {
  const index = profiles.findIndex((p) => p.id === profileId);
  if (index === -1) {
    throw new Error(`Municipality profile not found: ${profileId}`);
  }

  const existing = profiles[index];
  const updated: MunicipalityProfile = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowTimestamp(),
  };
  profiles[index] = updated;
  return updated;
}

/**
 * Fetches a single municipality profile by ID.
 *
 * @param profileId - The ID of the profile to fetch
 * @returns The MunicipalityProfile if found, or null
 */
export function getProfile(profileId: string): MunicipalityProfile | null {
  return profiles.find((p) => p.id === profileId) ?? null;
}

/**
 * Fetches a municipality profile by municipality name.
 *
 * Performs a case-insensitive comparison.
 *
 * @param name - The municipality name to search for
 * @returns The MunicipalityProfile if found, or null
 */
export function getProfileByName(name: string): MunicipalityProfile | null {
  const lower = name.toLowerCase();
  return profiles.find((p) => p.name.toLowerCase() === lower) ?? null;
}

/**
 * Lists all municipality profiles for a given tenantId.
 *
 * @param tenantId - The tenant identifier to scope the query
 * @returns Array of MunicipalityProfile records for the tenant
 */
export function listProfiles(tenantId: string): MunicipalityProfile[] {
  return profiles.filter((p) => p.tenantId === tenantId);
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * Resolves a municipality profile by ID, falling back to the SPLUMA default
 * profile if no match is found.
 *
 * This ensures every application always has a valid profile for deadline
 * calculations and document requirements even if the specific municipality
 * has not been configured.
 *
 * @param municipalityId - The ID of the municipality profile to resolve
 * @returns The matching MunicipalityProfile, or the SPLUMA default
 */
export function resolveProfile(municipalityId: string): MunicipalityProfile {
  const profile = getProfile(municipalityId);
  if (profile) return profile;
  return getDefaultProfile();
}

// ── Query Helpers ───────────────────────────────────────────────────────────

/**
 * Returns required forms from a profile for a given application type.
 *
 * Filters the profile's requiredForms array to include only forms that list
 * the specified application type in their applicationType array.
 *
 * @param profileId - The municipality profile ID
 * @param applicationType - The planning application type to filter by
 * @returns Array of RequiredForm entries matching the application type
 */
export function getRequiredDocuments(
  profileId: string,
  applicationType: PlanningApplicationType,
): RequiredForm[] {
  const profile = getProfile(profileId);
  if (!profile) return [];
  return profile.requiredForms.filter((form) =>
    form.applicationType.includes(applicationType),
  );
}

/**
 * Returns fee schedule items from a profile for a given application type.
 *
 * Filters the profile's feeSchedule array to include only entries matching
 * the specified application type.
 *
 * @param profileId - The municipality profile ID
 * @param applicationType - The planning application type to filter by
 * @returns Array of FeeScheduleItem entries matching the application type
 */
export function getFees(
  profileId: string,
  applicationType: PlanningApplicationType,
): FeeScheduleItem[] {
  const profile = getProfile(profileId);
  if (!profile) return [];
  return profile.feeSchedule.filter(
    (fee) => fee.applicationType === applicationType,
  );
}

/**
 * Returns custom timeframes from a profile.
 *
 * If the profile has no custom timeframes configured, returns the SPLUMA
 * default timeframes instead.
 *
 * @param profileId - The municipality profile ID
 * @returns Array of CustomTimeframe entries (profile-specific or SPLUMA defaults)
 */
export function getTimeframes(profileId: string): CustomTimeframe[] {
  const profile = getProfile(profileId);
  if (!profile || profile.customTimeframes.length === 0) {
    return getDefaultProfile().customTimeframes;
  }
  return profile.customTimeframes;
}

// ── Store Management (for testing) ──────────────────────────────────────────

/**
 * Resets the in-memory store. Intended for use in tests only.
 */
export function _resetStore(): void {
  profiles = [];
  idCounter = 0;
}

/**
 * Returns the current store contents. Intended for use in tests only.
 */
export function _getStore(): MunicipalityProfile[] {
  return [...profiles];
}
