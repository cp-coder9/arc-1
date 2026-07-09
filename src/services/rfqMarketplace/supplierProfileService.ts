// ─── Supplier Profile Service ────────────────────────────────────────────────
// Handles supplier marketplace profile CRUD, trade categories, delivery regions,
// and performance metrics.

import {
  getDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { getDemoDoc, getDemoCol } from '../../demo-seed/demoFirestore';
import type {
  SupplierMarketplaceProfile,
  PerformanceMetrics,
  VerificationStatus,
  ValidationResult,
  RfqValidationError,
} from './types';
import {
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MAX_TRADE_CATEGORIES,
  MAX_DELIVERY_REGIONS,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Valid South African provinces for delivery regions. */
export const SA_PROVINCES = [
  'Gauteng',
  'Western Cape',
  'KwaZulu-Natal',
  'Eastern Cape',
  'Free State',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
] as const;

export type SAProvince = (typeof SA_PROVINCES)[number];

// ─── Delivery Record Interface ───────────────────────────────────────────────

/** A completed delivery record used to calculate performance metrics. */
export interface DeliveryRecord {
  deliveryId: string;
  supplierId: string;
  rfqId: string;
  wasAccepted: boolean;
  wasOnTime: boolean;
  rating?: number; // 0–5
  completedAt: string; // ISO 8601
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates a supplier profile update payload.
 * Rejects 0 categories, >10 categories, 0 regions, or >9 regions.
 */
export function validateProfileUpdate(params: {
  tradeCategories?: string[];
  deliveryRegions?: string[];
}): ValidationResult {
  const errors: RfqValidationError[] = [];

  if (params.tradeCategories !== undefined) {
    if (params.tradeCategories.length === 0) {
      errors.push({
        code: RFQ_ERROR_CODES.PROFILE_NO_CATEGORIES,
        message: RFQ_ERROR_MESSAGES.PROFILE_NO_CATEGORIES,
        field: 'tradeCategories',
      });
    } else if (params.tradeCategories.length > MAX_TRADE_CATEGORIES) {
      errors.push({
        code: RFQ_ERROR_CODES.PROFILE_NO_CATEGORIES,
        message: `Maximum ${MAX_TRADE_CATEGORIES} trade categories allowed`,
        field: 'tradeCategories',
      });
    }
  }

  if (params.deliveryRegions !== undefined) {
    if (params.deliveryRegions.length === 0) {
      errors.push({
        code: RFQ_ERROR_CODES.PROFILE_NO_REGIONS,
        message: RFQ_ERROR_MESSAGES.PROFILE_NO_REGIONS,
        field: 'deliveryRegions',
      });
    } else if (params.deliveryRegions.length > MAX_DELIVERY_REGIONS) {
      errors.push({
        code: RFQ_ERROR_CODES.PROFILE_NO_REGIONS,
        message: `Maximum ${MAX_DELIVERY_REGIONS} delivery regions allowed`,
        field: 'deliveryRegions',
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// ─── Performance Metrics (Pure Function) ─────────────────────────────────────

/**
 * Calculates past-performance metrics from delivery records.
 * Pure function — accepts delivery records and returns computed metrics.
 * Only considers records from the trailing 12-month period.
 */
export function computePerformanceMetrics(
  deliveryRecords: DeliveryRecord[],
  referenceDate: Date = new Date()
): PerformanceMetrics | null {
  // Filter to trailing 12-month window
  const twelveMonthsAgo = new Date(referenceDate);
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const relevantRecords = deliveryRecords.filter((record) => {
    const completedAt = new Date(record.completedAt);
    return completedAt >= twelveMonthsAgo && completedAt <= referenceDate;
  });

  if (relevantRecords.length === 0) {
    return null;
  }

  // Quote acceptance rate: percentage of deliveries that were accepted
  const acceptedCount = relevantRecords.filter((r) => r.wasAccepted).length;
  const quoteAcceptanceRate = Math.round((acceptedCount / relevantRecords.length) * 100);

  // On-time delivery percentage
  const onTimeCount = relevantRecords.filter((r) => r.wasOnTime).length;
  const onTimeDeliveryPct = Math.round((onTimeCount / relevantRecords.length) * 100);

  // Average rating (only from records with ratings)
  const ratedRecords = relevantRecords.filter(
    (r) => r.rating !== undefined && r.rating !== null
  );
  const averageRating =
    ratedRecords.length > 0
      ? Math.round(
          (ratedRecords.reduce((sum, r) => sum + (r.rating ?? 0), 0) /
            ratedRecords.length) *
            100
        ) / 100
      : 0;

  return {
    quoteAcceptanceRate,
    onTimeDeliveryPct,
    averageRating,
    metricsPeriodStart: twelveMonthsAgo.toISOString(),
    metricsPeriodEnd: referenceDate.toISOString(),
  };
}

// ─── Firestore Persistence Helpers ───────────────────────────────────────────

function getProfileDocRef(supplierId: string) {
  return getDemoDoc('suppliers', supplierId, 'marketplace');
}

function getDeliveriesColRef(supplierId: string) {
  return getDemoCol('suppliers', supplierId, 'deliveries');
}

function getSuppliersMarketplaceCol() {
  return getDemoCol('suppliersMarketplace');
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Creates a new supplier marketplace profile.
 * Validates trade categories (1–10) and delivery regions (1–9).
 */
export async function createProfile(params: {
  supplierId: string;
  firmName: string;
  tradeCategories: string[];
  deliveryRegions: string[];
}): Promise<{ success: boolean; profile?: SupplierMarketplaceProfile; errors?: ValidationResult }> {
  // Validate inputs
  const validation = validateProfileUpdate({
    tradeCategories: params.tradeCategories,
    deliveryRegions: params.deliveryRegions,
  });

  if (!validation.valid) {
    return { success: false, errors: validation };
  }

  // Get verification status from platform
  const verificationStatus = await getVerificationStatus(params.supplierId);

  const profile: SupplierMarketplaceProfile = {
    supplierId: params.supplierId,
    firmName: params.firmName,
    tradeCategories: params.tradeCategories,
    deliveryRegions: params.deliveryRegions,
    verificationStatus,
    completedDeliveryCount: 0,
  };

  // Persist to suppliers/{supplierId}/marketplace
  const docRef = getProfileDocRef(params.supplierId);
  await setDoc(docRef, profile);

  // Also persist to the searchable collection for marketplace search
  const marketplaceDocRef = getDemoDoc('suppliersMarketplace', params.supplierId);
  await setDoc(marketplaceDocRef, profile);

  return { success: true, profile };
}

/**
 * Updates an existing supplier marketplace profile.
 * Rejects updates with 0 categories or 0 regions.
 */
export async function updateProfile(params: {
  supplierId: string;
  firmName?: string;
  tradeCategories?: string[];
  deliveryRegions?: string[];
}): Promise<{ success: boolean; profile?: SupplierMarketplaceProfile; errors?: ValidationResult }> {
  // Validate inputs
  const validation = validateProfileUpdate({
    tradeCategories: params.tradeCategories,
    deliveryRegions: params.deliveryRegions,
  });

  if (!validation.valid) {
    return { success: false, errors: validation };
  }

  // Get existing profile
  const docRef = getProfileDocRef(params.supplierId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [
          {
            code: 'PROFILE_NOT_FOUND' as never,
            message: 'Supplier profile not found',
            field: 'supplierId',
          },
        ],
      },
    };
  }

  const existingProfile = docSnap.data() as SupplierMarketplaceProfile;

  // Build update payload
  const updateData: Partial<SupplierMarketplaceProfile> = {};
  if (params.firmName !== undefined) updateData.firmName = params.firmName;
  if (params.tradeCategories !== undefined) updateData.tradeCategories = params.tradeCategories;
  if (params.deliveryRegions !== undefined) updateData.deliveryRegions = params.deliveryRegions;

  // Refresh verification status
  updateData.verificationStatus = await getVerificationStatus(params.supplierId);

  // Update in Firestore
  await updateDoc(docRef, updateData);

  // Also update the searchable collection
  const marketplaceDocRef = getDemoDoc('suppliersMarketplace', params.supplierId);
  await updateDoc(marketplaceDocRef, updateData);

  // Return merged profile
  const updatedProfile: SupplierMarketplaceProfile = {
    ...existingProfile,
    ...updateData,
  };

  return { success: true, profile: updatedProfile };
}

/**
 * Retrieves a supplier's marketplace profile.
 */
export async function getProfile(
  supplierId: string
): Promise<SupplierMarketplaceProfile | null> {
  const docRef = getProfileDocRef(supplierId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return docSnap.data() as SupplierMarketplaceProfile;
}

/**
 * Calculates past-performance metrics from trailing 12-month platform data.
 * Returns quote acceptance rate, on-time delivery %, and average rating.
 * Refreshes within 24h of new delivery completion.
 */
export async function calculatePerformanceMetrics(
  supplierId: string
): Promise<PerformanceMetrics | null> {
  const deliveriesCol = getDeliveriesColRef(supplierId);
  const snapshot = await getDocs(deliveriesCol);

  const deliveryRecords: DeliveryRecord[] = snapshot.docs.map(
    (d) => d.data() as DeliveryRecord
  );

  return computePerformanceMetrics(deliveryRecords);
}

/**
 * Checks whether a supplier qualifies for "New Supplier" badge
 * (zero completed deliveries on the platform).
 */
export async function isNewSupplier(supplierId: string): Promise<boolean> {
  const profile = await getProfile(supplierId);

  if (!profile) {
    return true;
  }

  return profile.completedDeliveryCount === 0;
}

/**
 * Gets the verification badge status for a supplier from the platform verification service.
 * Sources from the supplier's verification data in Firestore.
 */
export async function getVerificationStatus(
  supplierId: string
): Promise<VerificationStatus> {
  try {
    const verificationDocRef = getDemoDoc('suppliers', supplierId, 'verification');
    const verificationSnap = await getDoc(verificationDocRef);

    if (!verificationSnap.exists()) {
      return 'pending';
    }

    const data = verificationSnap.data() as {
      status?: VerificationStatus;
      expiresAt?: string;
    };

    // Check if verification has expired
    if (data.status === 'verified' && data.expiresAt) {
      const expiryDate = new Date(data.expiresAt);
      if (expiryDate < new Date()) {
        return 'expired';
      }
    }

    return data.status ?? 'pending';
  } catch {
    // Default to pending if we can't access the verification service
    return 'pending';
  }
}

/**
 * Searches the marketplace by trade category, delivery region, and verification status.
 * Returns results within 3 seconds. Filters in-memory for the demo implementation.
 */
export async function searchMarketplace(filters: {
  tradeCategories?: string[];
  deliveryRegions?: string[];
  verificationStatus?: VerificationStatus;
  page?: number;
  pageSize?: number;
}): Promise<{ profiles: SupplierMarketplaceProfile[]; totalCount: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  // Fetch all marketplace profiles
  const marketplaceCol = getSuppliersMarketplaceCol();
  let q = query(marketplaceCol);

  // If we have a verification status filter, apply it at the query level
  if (filters.verificationStatus) {
    q = query(marketplaceCol, where('verificationStatus', '==', filters.verificationStatus));
  }

  const snapshot = await getDocs(q);
  let profiles: SupplierMarketplaceProfile[] = snapshot.docs.map(
    (d) => d.data() as SupplierMarketplaceProfile
  );

  // In-memory filtering for trade categories (array overlap)
  if (filters.tradeCategories && filters.tradeCategories.length > 0) {
    profiles = profiles.filter((profile) =>
      profile.tradeCategories.some((cat) =>
        filters.tradeCategories!.includes(cat)
      )
    );
  }

  // In-memory filtering for delivery regions (array overlap)
  if (filters.deliveryRegions && filters.deliveryRegions.length > 0) {
    profiles = profiles.filter((profile) =>
      profile.deliveryRegions.some((region) =>
        filters.deliveryRegions!.includes(region)
      )
    );
  }

  const totalCount = profiles.length;

  // Pagination
  const startIndex = (page - 1) * pageSize;
  const paginatedProfiles = profiles.slice(startIndex, startIndex + pageSize);

  return { profiles: paginatedProfiles, totalCount };
}
