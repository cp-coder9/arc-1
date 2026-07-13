/**
 * Municipality Profile Service — Business logic for municipality-specific
 * configurations including forms, fees, process variations, and timeframes.
 *
 * Pure functions for CRUD operations, profile resolution with SPLUMA default
 * fallback, and lookups for required documents, fees, and timeframes.
 *
 * Firestore collection: `municipality_profiles/{id}`
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
import { adminDb } from '@/lib/firebase-admin';

// ── Firestore Collection ────────────────────────────────────────────────────

const profilesCollection = () => adminDb.collection('municipality_profiles');

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
 * Stores in the Firestore collection scoped by the provided tenantId.
 *
 * @param params - Profile data excluding id, createdAt, and updatedAt
 * @returns The newly created MunicipalityProfile with generated fields
 */
export async function createProfile(
  params: Omit<MunicipalityProfile, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<MunicipalityProfile> {
  const now = nowTimestamp();
  const docRef = profilesCollection().doc();
  const profile: MunicipalityProfile = {
    ...params,
    id: docRef.id,
    createdAt: now,
    updatedAt: now,
  };
  await docRef.set(profile);
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
export async function updateProfile(
  profileId: string,
  updates: Partial<Omit<MunicipalityProfile, 'id' | 'createdAt'>>,
): Promise<MunicipalityProfile> {
  const docRef = profilesCollection().doc(profileId);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error(`Municipality profile not found: ${profileId}`);
  }

  const existing = doc.data() as MunicipalityProfile;
  const updated: MunicipalityProfile = {
    ...existing,
    ...updates,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: nowTimestamp(),
  };
  await docRef.set(updated);
  return updated;
}

/**
 * Fetches a single municipality profile by ID.
 *
 * @param profileId - The ID of the profile to fetch
 * @returns The MunicipalityProfile if found, or null
 */
export async function getProfile(profileId: string): Promise<MunicipalityProfile | null> {
  const doc = await profilesCollection().doc(profileId).get();
  if (!doc.exists) return null;
  return doc.data() as MunicipalityProfile;
}

/**
 * Fetches a municipality profile by municipality name.
 *
 * Performs a case-insensitive comparison by querying all profiles
 * and filtering client-side (Firestore doesn't support case-insensitive queries natively).
 *
 * @param name - The municipality name to search for
 * @returns The MunicipalityProfile if found, or null
 */
export async function getProfileByName(name: string): Promise<MunicipalityProfile | null> {
  // Query by exact name first (most common case)
  const snapshot = await profilesCollection().where('name', '==', name).limit(1).get();
  if (!snapshot.empty) {
    return snapshot.docs[0].data() as MunicipalityProfile;
  }
  // Fallback: query all and compare case-insensitively
  const allSnapshot = await profilesCollection().get();
  const lower = name.toLowerCase();
  for (const doc of allSnapshot.docs) {
    const profile = doc.data() as MunicipalityProfile;
    if (profile.name.toLowerCase() === lower) {
      return profile;
    }
  }
  return null;
}

/**
 * Lists all municipality profiles for a given tenantId.
 *
 * @param tenantId - The tenant identifier to scope the query
 * @returns Array of MunicipalityProfile records for the tenant
 */
export async function listProfiles(tenantId: string): Promise<MunicipalityProfile[]> {
  const snapshot = await profilesCollection()
    .where('tenantId', '==', tenantId)
    .get();
  return snapshot.docs.map((doc) => doc.data() as MunicipalityProfile);
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
export async function resolveProfile(municipalityId: string): Promise<MunicipalityProfile> {
  const profile = await getProfile(municipalityId);
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
export async function getRequiredDocuments(
  profileId: string,
  applicationType: PlanningApplicationType,
): Promise<RequiredForm[]> {
  const profile = await getProfile(profileId);
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
export async function getFees(
  profileId: string,
  applicationType: PlanningApplicationType,
): Promise<FeeScheduleItem[]> {
  const profile = await getProfile(profileId);
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
export async function getTimeframes(profileId: string): Promise<CustomTimeframe[]> {
  const profile = await getProfile(profileId);
  if (!profile || profile.customTimeframes.length === 0) {
    return getDefaultProfile().customTimeframes;
  }
  return profile.customTimeframes;
}

// ── Store Management (for testing) ──────────────────────────────────────────

/**
 * Resets the Firestore collection. Intended for use in tests only.
 */
export async function _resetStore(): Promise<void> {
  const snapshot = await profilesCollection().get();
  const batch = adminDb.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
}

/**
 * Returns the current store contents. Intended for use in tests only.
 */
export async function _getStore(): Promise<MunicipalityProfile[]> {
  const snapshot = await profilesCollection().get();
  return snapshot.docs.map((doc) => doc.data() as MunicipalityProfile);
}
