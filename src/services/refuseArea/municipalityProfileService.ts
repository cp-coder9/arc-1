/**
 * Municipality Profile Service — Firestore Integration
 *
 * Handles loading municipality profiles, filtering municipalities by search text,
 * and providing fallback profile logic for unlisted municipalities.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import type { Municipality_Profile } from './types';

// --- Error types ---

export class ProfileLoadError extends Error {
  constructor(
    message: string,
    public readonly code: 'timeout' | 'network' | 'not_found' | 'permission_denied' | 'unknown',
    public readonly municipalityId?: string
  ) {
    super(message);
    this.name = 'ProfileLoadError';
  }
}

// --- Constants ---

const COLLECTION_NAME = 'refuse_municipality_profiles';
const LOAD_TIMEOUT_MS = 5000;
const FALLBACK_PROFILE_ID = 'generic-fallback';
const MIN_SEARCH_CHARS = 2;

// --- Public API ---

export interface MunicipalityListItem {
  id: string;
  name: string;
}

/**
 * Fetches all municipality names and IDs from the refuse_municipality_profiles
 * Firestore collection.
 *
 * Requirement 1.1: Display a searchable municipality selector containing all
 * supported South African municipalities.
 */
export async function listMunicipalities(): Promise<MunicipalityListItem[]> {
  try {
    const colRef = collection(db, COLLECTION_NAME);
    const snapshot = await getDocs(colRef);

    const municipalities: MunicipalityListItem[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      municipalities.push({
        id: docSnap.id,
        name: data.name as string,
      });
    });

    return municipalities.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    throw new ProfileLoadError(
      'Failed to load municipality list',
      classifyError(error),
    );
  }
}

/**
 * Filters a list of municipalities by case-insensitive substring match.
 * Returns an empty array if searchText is fewer than 2 characters.
 *
 * Requirement 1.1: Selector filters the list to show only municipalities whose name
 * contains the text typed by the user after a minimum of 2 characters are entered.
 */
export function filterMunicipalities(
  searchText: string,
  municipalities: MunicipalityListItem[]
): MunicipalityListItem[] {
  if (searchText.length < MIN_SEARCH_CHARS) {
    return [];
  }

  const needle = searchText.toLowerCase();

  return municipalities.filter((m) =>
    m.name.toLowerCase().includes(needle)
  );
}

/**
 * Loads a single Municipality_Profile from Firestore by ID.
 * Enforces a 5-second timeout and provides retry support.
 *
 * Requirements:
 * - 1.2: Load profile within 5 seconds
 * - 1.5: Display loading indicator and prevent form submission
 * - 1.6: Display error on timeout/network failure with retry action
 */
export async function loadProfile(municipalityId: string): Promise<Municipality_Profile> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOAD_TIMEOUT_MS);

  try {
    const profile = await fetchProfileWithTimeout(municipalityId, controller.signal);
    clearTimeout(timeoutId);
    return profile;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof ProfileLoadError) {
      throw error;
    }

    if (isAbortError(error)) {
      throw new ProfileLoadError(
        `Municipality profile load timed out after ${LOAD_TIMEOUT_MS / 1000} seconds`,
        'timeout',
        municipalityId
      );
    }

    throw new ProfileLoadError(
      'Failed to load municipality profile',
      classifyError(error),
      municipalityId
    );
  }
}

/**
 * Returns the fallback profile ID and a notice message for municipalities
 * not listed in the database.
 *
 * Requirement 1.4: When a municipality is not listed, offer the generic fallback
 * profile and display a notice that the user should verify requirements with the
 * relevant local authority.
 */
export function getFallbackInfo(): { profileId: string; notice: string } {
  return {
    profileId: FALLBACK_PROFILE_ID,
    notice:
      'This municipality is not currently listed. A generic fallback profile is being used. ' +
      'Please verify refuse area requirements with the relevant local authority.',
  };
}

/**
 * Checks whether a municipality ID represents the fallback/generic profile.
 */
export function isFallbackProfile(municipalityId: string): boolean {
  return municipalityId === FALLBACK_PROFILE_ID;
}

// --- Internal helpers ---

async function fetchProfileWithTimeout(
  municipalityId: string,
  signal: AbortSignal
): Promise<Municipality_Profile> {
  // Create a promise that rejects when the signal aborts
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    }, { once: true });
  });

  // Race the Firestore fetch against the abort signal
  const fetchPromise = (async () => {
    const docRef = doc(db, COLLECTION_NAME, municipalityId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new ProfileLoadError(
        `Municipality profile not found: ${municipalityId}`,
        'not_found',
        municipalityId
      );
    }

    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
    } as Municipality_Profile;
  })();

  return Promise.race([fetchPromise, abortPromise]);
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  );
}

function classifyError(error: unknown): ProfileLoadError['code'] {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    if (msg.includes('permission') || msg.includes('unauthorized')) {
      return 'permission_denied';
    }
    if (msg.includes('network') || msg.includes('unavailable') || msg.includes('offline')) {
      return 'network';
    }
    if (msg.includes('not found') || msg.includes('not-found')) {
      return 'not_found';
    }
    if (msg.includes('timeout') || msg.includes('aborted')) {
      return 'timeout';
    }
  }
  return 'unknown';
}
