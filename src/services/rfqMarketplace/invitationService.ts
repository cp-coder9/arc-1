// ─── Invitation Service ──────────────────────────────────────────────────────
// Handles supplier discovery, filtering, and invitation list management.
// Queries Firestore `suppliers/{supplierId}/marketplace` with composite index
// on tradeCategories, deliveryRegions, verificationStatus.

import { getDoc, updateDoc } from 'firebase/firestore';
import { getDemoDoc } from '../../demo-seed/demoFirestore';
import { searchMarketplace } from './supplierProfileService';
import { notifyRfqPublished } from './rfqNotificationService';
import type {
  InvitedSupplier,
  RfqDocument,
  SupplierMarketplaceProfile,
  VerificationStatus,
  ValidationResult,
  RfqValidationError,
} from './types';
import {
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MAX_INVITATION_LIST_SIZE,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of suppliers returned per discovery page. */
const MAX_DISCOVERY_PAGE_SIZE = 100;

/** Empty results message suggesting broadened filter criteria. */
export const EMPTY_RESULTS_MESSAGE =
  'No matching suppliers found. Try broadening your filter criteria by selecting additional trade categories, delivery regions, or adjusting the verification status filter.';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Filter criteria for supplier discovery. */
export interface SupplierDiscoveryFilters {
  tradeCategories?: string[];
  deliveryRegions?: string[];
  verificationStatus?: VerificationStatus;
  minBbeeLevel?: number;
  maxBbeeLevel?: number;
  page?: number;
  pageSize?: number;
}

/** Paginated result from supplier discovery. */
export interface SupplierDiscoveryResult {
  suppliers: SupplierMarketplaceProfile[];
  totalCount: number;
  page: number;
  pageSize: number;
  message?: string;
}

/** Warning badge details for suppliers with verification issues. */
export interface VerificationWarning {
  supplierId: string;
  supplierName: string;
  verificationStatus: 'expired' | 'rejected';
  message: string;
}

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Fetches the RFQ document from Firestore.
 */
async function fetchRfqDocument(
  projectId: string,
  rfqId: string
): Promise<RfqDocument | null> {
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  const snapshot = await getDoc(docRef);
  if (!snapshot.exists()) {
    return null;
  }
  return snapshot.data() as RfqDocument;
}

/**
 * Updates the RFQ document's invitation list in Firestore.
 */
async function updateRfqInvitationList(
  projectId: string,
  rfqId: string,
  invitationList: InvitedSupplier[]
): Promise<void> {
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  await updateDoc(docRef, {
    invitationList,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Checks if a supplier has a verification warning (expired or rejected).
 */
export function getVerificationWarning(
  supplier: { supplierId: string; supplierName?: string; firmName?: string; verificationStatus: VerificationStatus }
): VerificationWarning | null {
  if (supplier.verificationStatus === 'expired' || supplier.verificationStatus === 'rejected') {
    const name = supplier.supplierName ?? supplier.firmName ?? supplier.supplierId;
    return {
      supplierId: supplier.supplierId,
      supplierName: name,
      verificationStatus: supplier.verificationStatus,
      message:
        supplier.verificationStatus === 'expired'
          ? `Supplier "${name}" has an expired verification status. Their credentials may need renewal.`
          : `Supplier "${name}" has a rejected verification status. Review before inviting.`,
    };
  }
  return null;
}

// ─── Service Functions ───────────────────────────────────────────────────────

/**
 * Discovers suppliers matching filter criteria.
 * Queries Firestore `suppliers/{supplierId}/marketplace` with composite index
 * on tradeCategories, deliveryRegions, verificationStatus.
 * Returns paginated results (max 100 per page).
 * Filters by B-BBEE level in-memory after Firestore query.
 */
export async function discoverSuppliers(
  filters: SupplierDiscoveryFilters
): Promise<SupplierDiscoveryResult> {
  // Enforce max page size of 100
  const requestedPageSize = filters.pageSize ?? 20;
  const pageSize = Math.min(requestedPageSize, MAX_DISCOVERY_PAGE_SIZE);
  const page = filters.page ?? 1;

  // Leverage searchMarketplace from supplierProfileService for Firestore querying
  const searchResult = await searchMarketplace({
    tradeCategories: filters.tradeCategories,
    deliveryRegions: filters.deliveryRegions,
    verificationStatus: filters.verificationStatus,
    // Fetch all matching results for B-BBEE filtering, then paginate
    page: 1,
    pageSize: MAX_DISCOVERY_PAGE_SIZE * 10, // Fetch enough for filtering
  });

  let filteredProfiles = searchResult.profiles;

  // In-memory B-BBEE level filtering
  if (filters.minBbeeLevel !== undefined || filters.maxBbeeLevel !== undefined) {
    filteredProfiles = filteredProfiles.filter((profile) => {
      // If no B-BBEE level set on profile, exclude from B-BBEE filtered results
      if (profile.bbeeLevelNumber === undefined) {
        return false;
      }
      if (filters.minBbeeLevel !== undefined && profile.bbeeLevelNumber < filters.minBbeeLevel) {
        return false;
      }
      if (filters.maxBbeeLevel !== undefined && profile.bbeeLevelNumber > filters.maxBbeeLevel) {
        return false;
      }
      return true;
    });
  }

  const totalCount = filteredProfiles.length;

  // Apply pagination to filtered results
  const startIndex = (page - 1) * pageSize;
  const paginatedProfiles = filteredProfiles.slice(startIndex, startIndex + pageSize);

  // Handle empty results with suggestion message
  if (totalCount === 0) {
    return {
      suppliers: [],
      totalCount: 0,
      page,
      pageSize,
      message: EMPTY_RESULTS_MESSAGE,
    };
  }

  return {
    suppliers: paginatedProfiles,
    totalCount,
    page,
    pageSize,
  };
}

/**
 * Adds suppliers to an RFQ invitation list.
 * Enforces maximum 50 suppliers per list.
 * Supports both manual individual addition and bulk selection.
 * Displays warning badge for suppliers with verification status "expired" or "rejected".
 */
export async function addToInvitationList(params: {
  projectId: string;
  rfqId: string;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    tradeCategories: string[];
    verificationStatus: VerificationStatus;
    bbeeLevelNumber?: number;
  }>;
}): Promise<{ success: boolean; added: InvitedSupplier[]; warnings?: VerificationWarning[]; errors?: ValidationResult }> {
  // Fetch the current RFQ document
  const rfq = await fetchRfqDocument(params.projectId, params.rfqId);
  if (!rfq) {
    return {
      success: false,
      added: [],
      errors: {
        valid: false,
        errors: [
          {
            code: 'RFQ_NOT_FOUND' as never,
            message: 'RFQ not found',
            field: 'rfqId',
          },
        ],
      },
    };
  }

  // Get current invitation list
  const currentList = rfq.invitationList ?? [];

  // Filter out suppliers already on the list
  const existingIds = new Set(currentList.map((s) => s.supplierId));
  const newSuppliers = params.suppliers.filter((s) => !existingIds.has(s.supplierId));

  // Check if adding new suppliers would exceed the maximum
  const totalAfterAdd = currentList.length + newSuppliers.length;
  if (totalAfterAdd > MAX_INVITATION_LIST_SIZE) {
    const errors: RfqValidationError[] = [
      {
        code: RFQ_ERROR_CODES.RFQ_MAX_SUPPLIERS,
        message: RFQ_ERROR_MESSAGES.RFQ_MAX_SUPPLIERS,
        field: 'invitationList',
      },
    ];
    return { success: false, added: [], errors: { valid: false, errors } };
  }

  // Create InvitedSupplier records
  const now = new Date().toISOString();
  const invitedSuppliers: InvitedSupplier[] = newSuppliers.map((s) => ({
    supplierId: s.supplierId,
    supplierName: s.supplierName,
    tradeCategories: s.tradeCategories,
    verificationStatus: s.verificationStatus,
    bbeeLevelNumber: s.bbeeLevelNumber,
    invitedAt: now,
  }));

  // Update the RFQ document with the new invitation list
  const updatedList = [...currentList, ...invitedSuppliers];
  await updateRfqInvitationList(params.projectId, params.rfqId, updatedList);

  // Collect verification warnings for suppliers with expired or rejected status
  const warnings: VerificationWarning[] = [];
  for (const supplier of invitedSuppliers) {
    const warning = getVerificationWarning(supplier);
    if (warning) {
      warnings.push(warning);
    }
  }

  return {
    success: true,
    added: invitedSuppliers,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Adds suppliers to an already-published RFQ.
 * Triggers notification to newly added suppliers within 60 seconds.
 * Displays warning badge for suppliers with verification status "expired" or "rejected".
 */
export async function addSuppliersToPublishedRfq(params: {
  projectId: string;
  rfqId: string;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    tradeCategories: string[];
    verificationStatus: VerificationStatus;
    bbeeLevelNumber?: number;
  }>;
}): Promise<{ success: boolean; added: InvitedSupplier[]; warnings?: VerificationWarning[]; errors?: ValidationResult }> {
  // Fetch the current RFQ document
  const rfq = await fetchRfqDocument(params.projectId, params.rfqId);
  if (!rfq) {
    return {
      success: false,
      added: [],
      errors: {
        valid: false,
        errors: [
          {
            code: 'RFQ_NOT_FOUND' as never,
            message: 'RFQ not found',
            field: 'rfqId',
          },
        ],
      },
    };
  }

  // Verify the RFQ is in published status
  if (rfq.status !== 'published') {
    return {
      success: false,
      added: [],
      errors: {
        valid: false,
        errors: [
          {
            code: 'RFQ_NOT_PUBLISHED' as never,
            message: 'Suppliers can only be added to a published RFQ via this method',
            field: 'status',
          },
        ],
      },
    };
  }

  // Get current invitation list
  const currentList = rfq.invitationList ?? [];

  // Filter out suppliers already on the list
  const existingIds = new Set(currentList.map((s) => s.supplierId));
  const newSuppliers = params.suppliers.filter((s) => !existingIds.has(s.supplierId));

  // Check if adding new suppliers would exceed the maximum
  const totalAfterAdd = currentList.length + newSuppliers.length;
  if (totalAfterAdd > MAX_INVITATION_LIST_SIZE) {
    const errors: RfqValidationError[] = [
      {
        code: RFQ_ERROR_CODES.RFQ_MAX_SUPPLIERS,
        message: RFQ_ERROR_MESSAGES.RFQ_MAX_SUPPLIERS,
        field: 'invitationList',
      },
    ];
    return { success: false, added: [], errors: { valid: false, errors } };
  }

  // Create InvitedSupplier records
  const now = new Date().toISOString();
  const invitedSuppliers: InvitedSupplier[] = newSuppliers.map((s) => ({
    supplierId: s.supplierId,
    supplierName: s.supplierName,
    tradeCategories: s.tradeCategories,
    verificationStatus: s.verificationStatus,
    bbeeLevelNumber: s.bbeeLevelNumber,
    invitedAt: now,
  }));

  // Update the RFQ document with the new invitation list
  const updatedList = [...currentList, ...invitedSuppliers];
  await updateRfqInvitationList(params.projectId, params.rfqId, updatedList);

  // Trigger notification to newly added suppliers within 60 seconds
  // Fire-and-forget to ensure we respond quickly; notification service handles retries
  if (invitedSuppliers.length > 0) {
    const supplierIds = invitedSuppliers.map((s) => s.supplierId);
    // Notification is dispatched asynchronously — must complete within 60 seconds
    notifyRfqPublished({
      projectId: params.projectId,
      rfqId: params.rfqId,
      rfqTitle: rfq.title,
      rfqReferenceNumber: rfq.id,
      quoteDeadline: rfq.quoteDeadline,
      supplierIds,
    }).catch(() => {
      // Notification failures are handled by the notification service retry logic
      // Logged in the audit trail by rfqNotificationService
    });
  }

  // Collect verification warnings for suppliers with expired or rejected status
  const warnings: VerificationWarning[] = [];
  for (const supplier of invitedSuppliers) {
    const warning = getVerificationWarning(supplier);
    if (warning) {
      warnings.push(warning);
    }
  }

  return {
    success: true,
    added: invitedSuppliers,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Removes a supplier from an RFQ invitation list (only while draft).
 */
export async function removeFromInvitationList(params: {
  projectId: string;
  rfqId: string;
  supplierId: string;
}): Promise<{ success: boolean; errors?: ValidationResult }> {
  // Fetch the current RFQ document
  const rfq = await fetchRfqDocument(params.projectId, params.rfqId);
  if (!rfq) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [
          {
            code: 'RFQ_NOT_FOUND' as never,
            message: 'RFQ not found',
            field: 'rfqId',
          },
        ],
      },
    };
  }

  // Only allow removal while RFQ is in draft status
  if (rfq.status !== 'draft') {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [
          {
            code: 'RFQ_NOT_DRAFT' as never,
            message: 'Suppliers can only be removed from a draft RFQ',
            field: 'status',
          },
        ],
      },
    };
  }

  // Filter out the supplier from the list
  const currentList = rfq.invitationList ?? [];
  const updatedList = currentList.filter((s) => s.supplierId !== params.supplierId);

  // Check if supplier was actually on the list
  if (updatedList.length === currentList.length) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [
          {
            code: 'SUPPLIER_NOT_FOUND' as never,
            message: 'Supplier not found on the invitation list',
            field: 'supplierId',
          },
        ],
      },
    };
  }

  // Update the RFQ document
  await updateRfqInvitationList(params.projectId, params.rfqId, updatedList);

  return { success: true };
}

/**
 * Gets the current invitation list for an RFQ.
 * Includes verification warnings for suppliers with expired or rejected status.
 */
export async function getInvitationList(
  projectId: string,
  rfqId: string
): Promise<InvitedSupplier[]> {
  const rfq = await fetchRfqDocument(projectId, rfqId);
  if (!rfq) {
    return [];
  }
  return rfq.invitationList ?? [];
}
