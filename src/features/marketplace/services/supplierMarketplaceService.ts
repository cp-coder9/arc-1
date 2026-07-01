/**
 * Supplier & Material Marketplace Service
 *
 * Handles material listing lifecycle: creation with validation, supplier verification
 * gate, material search with filtering and pagination. Also handles the full quote
 * request and delivery workflow: quote creation, supplier response, contractor acceptance
 * with escrow, 7-day expiry, and 30-day delivery note timeout.
 *
 * Integrates with the audit trail and Firestore persistence.
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
 */

import type {
  MaterialListing,
  CertificationDoc,
  QuoteRequest,
  QuoteRequestStatus,
  MarketplaceError,
} from '../types';

import { logMarketplaceAction } from './marketplaceAuditService';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRODUCT_NAME_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 2000;
const LEAD_TIME_MIN = 1;
const LEAD_TIME_MAX = 365;
const WARRANTY_TERMS_MAX_LENGTH = 1000;
const MIN_DELIVERY_ZONES = 1;
const UNIT_PRICE_MIN = 0.01;
const UNIT_PRICE_MAX = 999_999_999.99;
const CERT_DOCS_MIN = 1;
const CERT_DOCS_MAX = 5;
const CERT_DOC_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
const VALID_CERT_FORMATS: Array<'pdf' | 'image'> = ['pdf', 'image'];
const MAX_RESULTS_PER_PAGE = 50;

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface CreateMaterialListingInput {
  productName: string;
  description: string;
  sansComplianceReference: string;
  leadTimeDays: number;
  warrantyTerms: string;
  deliveryZones: string[];
  unitPriceZar: number;
  certificationDocuments: CertificationDocInput[];
}

export interface CertificationDocInput {
  fileId: string;
  fileName: string;
  format: string;
  sizeBytes: number;
}

export interface MaterialListingUser {
  userId: string;
  role: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: Array<{ field: string; message: string }>;
}

export interface MaterialSearchQuery {
  sansComplianceReference?: string;
  deliveryZone?: string;
  leadTimeMin?: number;
  leadTimeMax?: number;
  certificationStatus?: 'certified' | 'uncertified';
  offset?: number;
  limit?: number;
}

// ─── Stub Types ───────────────────────────────────────────────────────────────

export interface SupplierStatusResult {
  verified: boolean;
}

// ─── External Dependency Stubs ────────────────────────────────────────────────

/**
 * Validates that the supplier account is verified and in good standing.
 * Checks the supplier's verification status from Firestore.
 * Fail-closed: rejects if status is unknown or unavailable.
 */
export async function validateSupplierStatus(
  userId: string
): Promise<SupplierStatusResult> {
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const userDoc = await adminDb.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      // Unknown supplier — fail-closed
      return { verified: false };
    }

    const data = userDoc.data();
    const verificationStatus = data?.verificationStatus || data?.supplierVerified;

    // Only explicitly verified suppliers may list
    if (verificationStatus === 'verified' || verificationStatus === true) {
      return { verified: true };
    }

    // Any other status (pending, rejected, missing) = not verified
    return { verified: false };
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to validate supplier status (fail-closed):', error);
    // Fail-closed: if we can't verify, reject
    return { verified: false };
  }
}

// ─── Pure Validation ──────────────────────────────────────────────────────────

/**
 * Pure validation function for material listing input.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 * No side effects — exported for direct testability.
 *
 * All constraints checked:
 * - productName: non-empty, max 150 characters
 * - description: non-empty, max 2000 characters
 * - sansComplianceReference: non-empty (selected from SANS reference catalogue)
 * - leadTimeDays: integer, 1–365
 * - warrantyTerms: non-empty, max 1000 characters
 * - deliveryZones: at least 1 zone
 * - unitPriceZar: ZAR 0.01–999,999,999.99
 * - certificationDocuments: 1–5 docs, each ≤ 20MB, format 'pdf' or 'image'
 *
 * Validates: Requirements 6.1, 6.7
 */
export function validateMaterialListingInput(
  input: CreateMaterialListingInput
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  // productName: non-empty, max 150 characters
  if (!input.productName || input.productName.trim().length === 0) {
    errors.push({ field: 'productName', message: 'Product name is required' });
  } else if (input.productName.length > PRODUCT_NAME_MAX_LENGTH) {
    errors.push({
      field: 'productName',
      message: `Product name must not exceed ${PRODUCT_NAME_MAX_LENGTH} characters`,
    });
  }

  // description: non-empty, max 2000 characters
  if (!input.description || input.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (input.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.push({
      field: 'description',
      message: `Description must not exceed ${DESCRIPTION_MAX_LENGTH} characters`,
    });
  }

  // sansComplianceReference: non-empty
  if (!input.sansComplianceReference || input.sansComplianceReference.trim().length === 0) {
    errors.push({
      field: 'sansComplianceReference',
      message: 'SANS compliance reference is required',
    });
  }

  // leadTimeDays: integer, 1–365
  if (input.leadTimeDays === undefined || input.leadTimeDays === null) {
    errors.push({ field: 'leadTimeDays', message: 'Lead time is required' });
  } else if (typeof input.leadTimeDays !== 'number' || isNaN(input.leadTimeDays)) {
    errors.push({ field: 'leadTimeDays', message: 'Lead time must be a number' });
  } else if (!Number.isInteger(input.leadTimeDays)) {
    errors.push({ field: 'leadTimeDays', message: 'Lead time must be a whole number of days' });
  } else if (input.leadTimeDays < LEAD_TIME_MIN) {
    errors.push({
      field: 'leadTimeDays',
      message: `Lead time must be at least ${LEAD_TIME_MIN} day`,
    });
  } else if (input.leadTimeDays > LEAD_TIME_MAX) {
    errors.push({
      field: 'leadTimeDays',
      message: `Lead time must not exceed ${LEAD_TIME_MAX} days`,
    });
  }

  // warrantyTerms: non-empty, max 1000 characters
  if (!input.warrantyTerms || input.warrantyTerms.trim().length === 0) {
    errors.push({ field: 'warrantyTerms', message: 'Warranty terms are required' });
  } else if (input.warrantyTerms.length > WARRANTY_TERMS_MAX_LENGTH) {
    errors.push({
      field: 'warrantyTerms',
      message: `Warranty terms must not exceed ${WARRANTY_TERMS_MAX_LENGTH} characters`,
    });
  }

  // deliveryZones: at least 1 zone
  if (!input.deliveryZones || !Array.isArray(input.deliveryZones)) {
    errors.push({ field: 'deliveryZones', message: 'At least one delivery zone is required' });
  } else if (input.deliveryZones.length < MIN_DELIVERY_ZONES) {
    errors.push({
      field: 'deliveryZones',
      message: 'At least one delivery zone is required',
    });
  }

  // unitPriceZar: ZAR 0.01–999,999,999.99
  if (input.unitPriceZar === undefined || input.unitPriceZar === null) {
    errors.push({ field: 'unitPriceZar', message: 'Unit price is required' });
  } else if (typeof input.unitPriceZar !== 'number' || isNaN(input.unitPriceZar)) {
    errors.push({ field: 'unitPriceZar', message: 'Unit price must be a valid number' });
  } else if (input.unitPriceZar < UNIT_PRICE_MIN) {
    errors.push({
      field: 'unitPriceZar',
      message: `Unit price must be at least ZAR ${UNIT_PRICE_MIN}`,
    });
  } else if (input.unitPriceZar > UNIT_PRICE_MAX) {
    errors.push({
      field: 'unitPriceZar',
      message: `Unit price must not exceed ZAR ${UNIT_PRICE_MAX.toFixed(2)}`,
    });
  }

  // certificationDocuments: 1–5 docs, each ≤ 20MB, format 'pdf' or 'image'
  if (!input.certificationDocuments || !Array.isArray(input.certificationDocuments)) {
    errors.push({
      field: 'certificationDocuments',
      message: 'At least one certification document is required',
    });
  } else if (input.certificationDocuments.length < CERT_DOCS_MIN) {
    errors.push({
      field: 'certificationDocuments',
      message: `At least ${CERT_DOCS_MIN} certification document is required`,
    });
  } else if (input.certificationDocuments.length > CERT_DOCS_MAX) {
    errors.push({
      field: 'certificationDocuments',
      message: `Maximum ${CERT_DOCS_MAX} certification documents allowed`,
    });
  } else {
    for (let i = 0; i < input.certificationDocuments.length; i++) {
      const doc = input.certificationDocuments[i];

      if (!doc.format || !VALID_CERT_FORMATS.includes(doc.format as 'pdf' | 'image')) {
        errors.push({
          field: `certificationDocuments[${i}]`,
          message: `Document ${i + 1}: format must be one of: ${VALID_CERT_FORMATS.join(', ')}`,
        });
      }

      if (doc.sizeBytes > CERT_DOC_MAX_SIZE_BYTES) {
        errors.push({
          field: `certificationDocuments[${i}]`,
          message: `Document ${i + 1}: file size exceeds maximum of 20MB`,
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

// ─── ID Generation ────────────────────────────────────────────────────────────

let listingCounter = 0;

function generateListingId(): string {
  listingCounter += 1;
  return `mat-listing-${Date.now()}-${listingCounter}`;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * Creates a new material listing with full validation.
 *
 * Validates input fields, checks supplier account verification status,
 * persists to Firestore, and logs the action to the audit trail.
 *
 * On validation failure, returns a MarketplaceError with per-field error messages
 * so the UI can retain form data and display inline errors.
 *
 * Validates: Requirements 6.1, 6.2, 6.7
 */
export async function createMaterialListing(
  params: CreateMaterialListingInput,
  user: MaterialListingUser
): Promise<MaterialListing | MarketplaceError> {
  // 1. Check supplier account verification (Requirement 6.2)
  const supplierStatus = await validateSupplierStatus(user.userId);
  if (!supplierStatus.verified) {
    return {
      code: 'SUPPLIER_NOT_VERIFIED',
      message: 'A verified account is required before materials can be listed',
      details: {
        reason: 'Supplier account is not verified',
      },
    };
  }

  // 2. Input validation (Requirement 6.1, 6.7)
  const validation = validateMaterialListingInput(params);
  if (!validation.valid) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Material listing validation failed',
      details: {
        field: validation.errors![0].field,
        reason: validation.errors!.map((e) => `${e.field}: ${e.message}`).join('; '),
      },
    };
  }

  // 3. Build the listing record
  const listingId = generateListingId();
  const timestamp = new Date().toISOString();

  const certDocs: CertificationDoc[] = params.certificationDocuments.map((doc) => ({
    fileId: doc.fileId,
    fileName: doc.fileName,
    format: doc.format as 'pdf' | 'image',
    sizeBytes: doc.sizeBytes,
  }));

  const listing: MaterialListing = {
    id: listingId,
    supplierId: user.userId,
    tenantId: user.userId, // Default tenant scope to supplier
    productName: params.productName,
    description: params.description,
    sansComplianceReference: params.sansComplianceReference,
    leadTimeDays: params.leadTimeDays,
    warrantyTerms: params.warrantyTerms,
    deliveryZones: [...params.deliveryZones],
    unitPriceZar: params.unitPriceZar,
    certificationDocuments: certDocs,
    status: 'active',
    createdAt: timestamp,
  };

  // 4. Persist to Firestore marketplace_material_listings/{listingId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_material_listings')
      .doc(listingId)
      .set({
        supplierId: listing.supplierId,
        tenantId: listing.tenantId,
        productName: listing.productName,
        description: listing.description,
        sansComplianceReference: listing.sansComplianceReference,
        leadTimeDays: listing.leadTimeDays,
        warrantyTerms: listing.warrantyTerms,
        deliveryZones: listing.deliveryZones,
        unitPriceZar: listing.unitPriceZar,
        certificationDocuments: listing.certificationDocuments,
        status: listing.status,
        createdAt: listing.createdAt,
      });
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to persist material listing:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save material listing',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 5. Log action to audit trail
  await logMarketplaceAction({
    actorId: user.userId,
    actionType: 'material_listing_created',
    entityId: listingId,
    entityType: 'material_listing',
    afterStatus: 'active',
    metadata: {
      productName: listing.productName,
      sansComplianceReference: listing.sansComplianceReference,
      unitPriceZar: listing.unitPriceZar,
      deliveryZoneCount: listing.deliveryZones.length,
      certDocCount: listing.certificationDocuments.length,
    },
  });

  return listing;
}

/**
 * Searches material listings with filters.
 *
 * Supports filtering by:
 * - SANS compliance reference (exact match)
 * - Delivery zone (listing must include the specified zone)
 * - Lead time range (min/max days)
 * - Certification status (certified = has docs, uncertified = no docs)
 *
 * Results ordered by relevance:
 * - SANS reference exact match first
 * - Then by lead time ascending (shorter lead time = higher relevance)
 *
 * Max 50 results per page. Pagination via offset/limit.
 *
 * Validates: Requirement 6.3
 */
export async function searchMaterials(
  query: MaterialSearchQuery
): Promise<MaterialListing[]> {
  const limit = Math.min(query.limit ?? MAX_RESULTS_PER_PAGE, MAX_RESULTS_PER_PAGE);
  const offset = query.offset ?? 0;

  // 1. Fetch active listings from Firestore
  let listings: MaterialListing[] = [];
  try {
    const { adminDb } = await import('@/lib/firebase-admin');

    // Build Firestore query — apply filters that Firestore can handle natively
    let snapshot;
    if (query.sansComplianceReference && query.deliveryZone) {
      // Firestore can handle equality + array-contains together
      snapshot = await adminDb
        .collection('marketplace_material_listings')
        .where('status', '==', 'active')
        .where('sansComplianceReference', '==', query.sansComplianceReference)
        .where('deliveryZones', 'array-contains', query.deliveryZone)
        .get();
    } else if (query.sansComplianceReference) {
      snapshot = await adminDb
        .collection('marketplace_material_listings')
        .where('status', '==', 'active')
        .where('sansComplianceReference', '==', query.sansComplianceReference)
        .get();
    } else if (query.deliveryZone) {
      snapshot = await adminDb
        .collection('marketplace_material_listings')
        .where('status', '==', 'active')
        .where('deliveryZones', 'array-contains', query.deliveryZone)
        .get();
    } else {
      snapshot = await adminDb
        .collection('marketplace_material_listings')
        .where('status', '==', 'active')
        .get();
    }

    listings = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        id: doc.id,
        supplierId: data.supplierId,
        tenantId: data.tenantId || data.supplierId,
        productName: data.productName,
        description: data.description,
        sansComplianceReference: data.sansComplianceReference,
        leadTimeDays: data.leadTimeDays,
        warrantyTerms: data.warrantyTerms,
        deliveryZones: data.deliveryZones,
        unitPriceZar: data.unitPriceZar,
        certificationDocuments: data.certificationDocuments || [],
        status: data.status,
        createdAt: data.createdAt,
      } as MaterialListing;
    });
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to search materials:', error);
    return [];
  }

  // 2. Apply client-side filters that Firestore can't handle in a single compound query

  // Filter by lead time range
  if (query.leadTimeMin != null) {
    listings = listings.filter((l) => l.leadTimeDays >= query.leadTimeMin!);
  }
  if (query.leadTimeMax != null) {
    listings = listings.filter((l) => l.leadTimeDays <= query.leadTimeMax!);
  }

  // Filter by certification status
  if (query.certificationStatus === 'certified') {
    listings = listings.filter(
      (l) => l.certificationDocuments && l.certificationDocuments.length > 0
    );
  } else if (query.certificationStatus === 'uncertified') {
    listings = listings.filter(
      (l) => !l.certificationDocuments || l.certificationDocuments.length === 0
    );
  }

  // 3. Order by relevance:
  //    - SANS reference exact match first (when query specified a reference)
  //    - Then by lead time ascending (shorter lead time = higher relevance)
  listings.sort((a, b) => {
    if (query.sansComplianceReference) {
      const aMatch = a.sansComplianceReference === query.sansComplianceReference ? 0 : 1;
      const bMatch = b.sansComplianceReference === query.sansComplianceReference ? 0 : 1;
      if (aMatch !== bMatch) {
        return aMatch - bMatch;
      }
    }
    // Secondary sort: lead time ascending
    return a.leadTimeDays - b.leadTimeDays;
  });

  // 4. Apply pagination (offset/limit, max 50 per page)
  return listings.slice(offset, offset + limit);
}


// ─── Quote Request & Delivery Workflow ────────────────────────────────────────

/**
 * Quote Request and Delivery Workflow
 *
 * Handles the full lifecycle of material quote requests:
 * - Contractor requests a quote linked to an active project
 * - Supplier responds with a quoted amount
 * - Contractor accepts and escrow is created
 * - 7-day expiry if supplier doesn't respond
 * - 30-day delivery note timeout triggers manual review
 *
 * Validates: Requirements 6.4, 6.5, 6.6, 6.8
 */

const QUOTE_EXPIRY_DAYS = 7;
const DELIVERY_NOTE_TIMEOUT_DAYS = 30;

// ─── Pure Functions for Testability ───────────────────────────────────────────

/**
 * Pure function that evaluates whether a quote has expired.
 *
 * Returns `{ expired: true }` if:
 * - Quote status is 'pending'
 * - 7 or more calendar days have elapsed since creation (comparing createdAt to now)
 *
 * Returns `{ expired: false, reason }` otherwise.
 *
 * Exported for testability — allows property-based testing without Firestore or side effects.
 *
 * Validates: Requirement 6.6
 */
export function evaluateQuoteExpiry(
  quote: { status: QuoteRequestStatus; createdAt: string; expiresAt: string },
  now: Date = new Date()
): { expired: boolean; reason?: string; daysSinceCreation?: number } {
  if (quote.status !== 'pending') {
    return { expired: false, reason: `Quote is not pending — current status is "${quote.status}"` };
  }

  const createdAt = new Date(quote.createdAt);
  const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCreation < QUOTE_EXPIRY_DAYS) {
    return {
      expired: false,
      reason: `Only ${Math.floor(daysSinceCreation)} days have elapsed (requires ${QUOTE_EXPIRY_DAYS})`,
      daysSinceCreation: Math.floor(daysSinceCreation),
    };
  }

  return { expired: true, daysSinceCreation: Math.floor(daysSinceCreation) };
}

// ─── Quote Input Types ────────────────────────────────────────────────────────

export interface RequestQuoteParams {
  contractorId: string;
  supplierId: string;
  listingId: string;
  linkedProjectId: string;
  quantity: number;
  deliveryAddress: string;
}

// ─── Quote External Dependency Stubs ──────────────────────────────────────────

/**
 * Validates that the linked project is active (not "closed" or "archived").
 * Stub: In production, this queries the project service for project status.
 */
export async function validateActiveProject(
  projectId: string
): Promise<{ active: boolean }> {
  // Stub implementation — assumes active unless overridden in tests
  return { active: true };
}

/**
 * Notifies a user via the Action Centre.
 * Stub: In production, this writes to the Action Centre / Inbox system.
 * CONTRACT: Notification surfaces within 60 seconds of invocation.
 */
export async function notifyUser(
  userId: string,
  notification: { type: string; message: string; entityId: string; entityType: string }
): Promise<void> {
  // Stub implementation — no-op in unit tests
}

/**
 * Creates an escrow holding for an accepted quote.
 * Stub: In production, this calls the Escrow_Service to create a holding.
 */
export async function createQuoteEscrow(
  data: { quoteId: string; contractorId: string; supplierId: string; amount: number }
): Promise<{ escrowId: string }> {
  // Stub implementation — returns a generated escrow ID
  return { escrowId: `escrow-${data.quoteId}-${Date.now()}` };
}

/**
 * Flags an escrow holding for manual review due to delivery note timeout.
 * Stub: In production, this transitions the escrow state to "under_review".
 */
export async function flagEscrowForReview(escrowId: string): Promise<void> {
  // Stub implementation — no-op in unit tests
}

// ─── Quote ID Generation ──────────────────────────────────────────────────────

let quoteCounter = 0;

function generateQuoteId(): string {
  quoteCounter += 1;
  return `quote-${Date.now()}-${quoteCounter}`;
}

// ─── Quote Service Functions ──────────────────────────────────────────────────

/**
 * Creates a quote request from a Contractor to a Supplier.
 *
 * - Validates the linked project is active (not "closed" or "archived")
 * - Sets expiry to 7 days from creation
 * - Notifies Supplier via Action Centre within 60 seconds
 * - Persists to Firestore `marketplace_quote_requests/{quoteId}`
 * - Logs action to audit trail
 *
 * Validates: Requirement 6.4
 */
export async function requestQuote(
  params: RequestQuoteParams
): Promise<QuoteRequest | MarketplaceError> {
  // 1. Validate linked project is active
  const projectStatus = await validateActiveProject(params.linkedProjectId);
  if (!projectStatus.active) {
    return {
      code: 'INVALID_PROJECT',
      message: 'Quote request must be linked to an active project',
      details: {
        field: 'linkedProjectId',
        reason: 'Project is closed or archived',
      },
    };
  }

  // 2. Build the quote request record
  const quoteId = generateQuoteId();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + QUOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const quoteRequest: QuoteRequest = {
    id: quoteId,
    contractorId: params.contractorId,
    supplierId: params.supplierId,
    listingId: params.listingId,
    linkedProjectId: params.linkedProjectId,
    quantity: params.quantity,
    deliveryAddress: params.deliveryAddress,
    status: 'pending',
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // 3. Persist to Firestore marketplace_quote_requests/{quoteId}
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_quote_requests')
      .doc(quoteId)
      .set({
        contractorId: quoteRequest.contractorId,
        supplierId: quoteRequest.supplierId,
        listingId: quoteRequest.listingId,
        linkedProjectId: quoteRequest.linkedProjectId,
        quantity: quoteRequest.quantity,
        deliveryAddress: quoteRequest.deliveryAddress,
        status: quoteRequest.status,
        createdAt: quoteRequest.createdAt,
        expiresAt: quoteRequest.expiresAt,
      });
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to persist quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to save quote request',
      details: { reason: 'Firestore write failed' },
    };
  }

  // 4. Notify Supplier via Action Centre (within 60 seconds)
  await notifyUser(params.supplierId, {
    type: 'quote_request_received',
    message: `New quote request received for listing ${params.listingId}`,
    entityId: quoteId,
    entityType: 'quote_request',
  });

  // 5. Log action to audit trail
  await logMarketplaceAction({
    actorId: params.contractorId,
    actionType: 'quote_requested',
    entityId: quoteId,
    entityType: 'quote_request',
    afterStatus: 'pending',
    metadata: {
      supplierId: params.supplierId,
      listingId: params.listingId,
      linkedProjectId: params.linkedProjectId,
      quantity: params.quantity,
    },
  });

  return quoteRequest;
}

/**
 * Supplier responds to a quote request with a quoted amount.
 *
 * - Verifies the supplier owns the quote request (quote.supplierId matches)
 * - Sets quotedAmount and transitions status to 'quoted'
 * - Logs action to audit trail
 *
 * Validates: Requirement 6.5 (partial — supplier confirms quote)
 */
export async function respondToQuote(
  quoteId: string,
  supplierId: string,
  quotedAmount: number
): Promise<QuoteRequest | MarketplaceError> {
  // 1. Fetch quote from Firestore
  let quoteData: any;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb.collection('marketplace_quote_requests').doc(quoteId).get();
    if (!doc.exists) {
      return {
        code: 'QUOTE_NOT_FOUND',
        message: 'Quote request not found',
        details: { reason: `No quote request with ID ${quoteId}` },
      };
    }
    quoteData = doc.data();
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to fetch quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to fetch quote request',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify supplier ownership
  if (quoteData.supplierId !== supplierId) {
    return {
      code: 'UNAUTHORIZED',
      message: 'Only the assigned supplier can respond to this quote request',
      details: { reason: 'Supplier ID does not match quote request' },
    };
  }

  // 3. Verify quote is in 'pending' status
  if (quoteData.status !== 'pending') {
    return {
      code: 'INVALID_STATUS',
      message: `Cannot respond to a quote request with status "${quoteData.status}"`,
      details: { reason: `Quote is already in "${quoteData.status}" status` },
    };
  }

  // 4. Update quote with quoted amount and transition to 'quoted'
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_quote_requests')
      .doc(quoteId)
      .update({
        quotedAmount,
        status: 'quoted',
      });
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to update quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update quote request',
      details: { reason: 'Firestore update failed' },
    };
  }

  // 5. Log action to audit trail
  await logMarketplaceAction({
    actorId: supplierId,
    actionType: 'quote_responded',
    entityId: quoteId,
    entityType: 'quote_request',
    beforeStatus: 'pending',
    afterStatus: 'quoted',
    metadata: {
      quotedAmount,
    },
  });

  // 6. Return updated QuoteRequest
  const updatedQuote: QuoteRequest = {
    id: quoteId,
    contractorId: quoteData.contractorId,
    supplierId: quoteData.supplierId,
    listingId: quoteData.listingId,
    linkedProjectId: quoteData.linkedProjectId,
    quantity: quoteData.quantity,
    deliveryAddress: quoteData.deliveryAddress,
    status: 'quoted',
    quotedAmount,
    createdAt: quoteData.createdAt,
    expiresAt: quoteData.expiresAt,
  };

  return updatedQuote;
}

/**
 * Contractor accepts a quote — creates escrow holding.
 *
 * - Verifies contractor owns the quote (quote.contractorId matches)
 * - Creates escrow holding via createQuoteEscrow stub
 * - Transitions status to 'accepted'
 * - Payment released only after Contractor uploads signed delivery note AND
 *   delivery status is "accepted"
 * - Logs action to audit trail
 *
 * Validates: Requirement 6.5
 */
export async function acceptQuote(
  quoteId: string,
  contractorId: string
): Promise<QuoteRequest | MarketplaceError> {
  // 1. Fetch quote from Firestore
  let quoteData: any;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb.collection('marketplace_quote_requests').doc(quoteId).get();
    if (!doc.exists) {
      return {
        code: 'QUOTE_NOT_FOUND',
        message: 'Quote request not found',
        details: { reason: `No quote request with ID ${quoteId}` },
      };
    }
    quoteData = doc.data();
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to fetch quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to fetch quote request',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify contractor ownership
  if (quoteData.contractorId !== contractorId) {
    return {
      code: 'UNAUTHORIZED',
      message: 'Only the requesting contractor can accept this quote',
      details: { reason: 'Contractor ID does not match quote request' },
    };
  }

  // 3. Verify quote is in 'quoted' status
  if (quoteData.status !== 'quoted') {
    return {
      code: 'INVALID_STATUS',
      message: `Cannot accept a quote request with status "${quoteData.status}"`,
      details: { reason: `Quote must be in "quoted" status to accept` },
    };
  }

  // 4. Create escrow holding (payment released only after signed delivery note + accepted delivery)
  const escrowResult = await createQuoteEscrow({
    quoteId,
    contractorId,
    supplierId: quoteData.supplierId,
    amount: quoteData.quotedAmount,
  });

  // 5. Update quote to 'accepted' with escrow reference
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_quote_requests')
      .doc(quoteId)
      .update({
        status: 'accepted',
        escrowId: escrowResult.escrowId,
      });
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to update quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update quote request',
      details: { reason: 'Firestore update failed' },
    };
  }

  // 6. Log action to audit trail
  await logMarketplaceAction({
    actorId: contractorId,
    actionType: 'quote_accepted',
    entityId: quoteId,
    entityType: 'quote_request',
    beforeStatus: 'quoted',
    afterStatus: 'accepted',
    metadata: {
      escrowId: escrowResult.escrowId,
      quotedAmount: quoteData.quotedAmount,
      supplierId: quoteData.supplierId,
    },
  });

  // 7. Return updated QuoteRequest
  const updatedQuote: QuoteRequest = {
    id: quoteId,
    contractorId: quoteData.contractorId,
    supplierId: quoteData.supplierId,
    listingId: quoteData.listingId,
    linkedProjectId: quoteData.linkedProjectId,
    quantity: quoteData.quantity,
    deliveryAddress: quoteData.deliveryAddress,
    status: 'accepted',
    quotedAmount: quoteData.quotedAmount,
    createdAt: quoteData.createdAt,
    expiresAt: quoteData.expiresAt,
  };

  return updatedQuote;
}

/**
 * Handles 7-day quote expiry.
 *
 * If 7 calendar days have elapsed since creation and the supplier hasn't responded
 * (status still 'pending'), marks the quote as 'expired' and notifies the Contractor.
 *
 * Validates: Requirement 6.6
 */
export async function handleQuoteExpiry(
  quoteId: string
): Promise<QuoteRequest | MarketplaceError> {
  // 1. Fetch quote from Firestore
  let quoteData: any;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb.collection('marketplace_quote_requests').doc(quoteId).get();
    if (!doc.exists) {
      return {
        code: 'QUOTE_NOT_FOUND',
        message: 'Quote request not found',
        details: { reason: `No quote request with ID ${quoteId}` },
      };
    }
    quoteData = doc.data();
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to fetch quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to fetch quote request',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify quote is still 'pending'
  if (quoteData.status !== 'pending') {
    return {
      code: 'INVALID_STATUS',
      message: `Quote is not pending — current status is "${quoteData.status}"`,
      details: { reason: 'Only pending quotes can expire' },
    };
  }

  // 3. Check if 7 days have elapsed
  const createdAt = new Date(quoteData.createdAt);
  const now = new Date();
  const daysSinceCreation = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceCreation < QUOTE_EXPIRY_DAYS) {
    return {
      code: 'NOT_EXPIRED',
      message: 'Quote has not yet reached the 7-day expiry window',
      details: { reason: `Only ${Math.floor(daysSinceCreation)} days have elapsed` },
    };
  }

  // 4. Mark as expired
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    await adminDb
      .collection('marketplace_quote_requests')
      .doc(quoteId)
      .update({ status: 'expired' });
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to expire quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to update quote request',
      details: { reason: 'Firestore update failed' },
    };
  }

  // 5. Notify Contractor via Action Centre
  await notifyUser(quoteData.contractorId, {
    type: 'quote_expired',
    message: `Your quote request for listing ${quoteData.listingId} has expired without a supplier response`,
    entityId: quoteId,
    entityType: 'quote_request',
  });

  // 6. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'quote_expired',
    entityId: quoteId,
    entityType: 'quote_request',
    beforeStatus: 'pending',
    afterStatus: 'expired',
    metadata: {
      contractorId: quoteData.contractorId,
      supplierId: quoteData.supplierId,
      daysSinceCreation: Math.floor(daysSinceCreation),
    },
  });

  // 7. Return updated QuoteRequest
  const updatedQuote: QuoteRequest = {
    id: quoteId,
    contractorId: quoteData.contractorId,
    supplierId: quoteData.supplierId,
    listingId: quoteData.listingId,
    linkedProjectId: quoteData.linkedProjectId,
    quantity: quoteData.quantity,
    deliveryAddress: quoteData.deliveryAddress,
    status: 'expired',
    createdAt: quoteData.createdAt,
    expiresAt: quoteData.expiresAt,
  };

  return updatedQuote;
}

/**
 * Handles 30-day delivery note timeout.
 *
 * If 30 calendar days have passed since the supplier marked the order as dispatched
 * and the contractor hasn't uploaded a delivery note, flags the escrow for manual review
 * and notifies both parties.
 *
 * Validates: Requirement 6.8
 */
export async function handleDeliveryNoteTimeout(
  quoteId: string
): Promise<QuoteRequest | MarketplaceError> {
  // 1. Fetch quote from Firestore
  let quoteData: any;
  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const doc = await adminDb.collection('marketplace_quote_requests').doc(quoteId).get();
    if (!doc.exists) {
      return {
        code: 'QUOTE_NOT_FOUND',
        message: 'Quote request not found',
        details: { reason: `No quote request with ID ${quoteId}` },
      };
    }
    quoteData = doc.data();
  } catch (error) {
    console.error('[SupplierMarketplace] Failed to fetch quote request:', error);
    return {
      code: 'PERSISTENCE_ERROR',
      message: 'Failed to fetch quote request',
      details: { reason: 'Firestore read failed' },
    };
  }

  // 2. Verify quote is in 'accepted' status (order dispatched but delivery note missing)
  if (quoteData.status !== 'accepted') {
    return {
      code: 'INVALID_STATUS',
      message: `Quote is not in accepted status — current status is "${quoteData.status}"`,
      details: { reason: 'Only accepted quotes with dispatched orders can trigger delivery note timeout' },
    };
  }

  // 3. Check if dispatched date exists and 30 days have elapsed
  const dispatchedAt = quoteData.dispatchedAt ? new Date(quoteData.dispatchedAt) : null;
  if (!dispatchedAt) {
    return {
      code: 'NOT_DISPATCHED',
      message: 'Order has not been marked as dispatched',
      details: { reason: 'No dispatch date recorded' },
    };
  }

  const now = new Date();
  const daysSinceDispatch = (now.getTime() - dispatchedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceDispatch < DELIVERY_NOTE_TIMEOUT_DAYS) {
    return {
      code: 'NOT_TIMED_OUT',
      message: 'Delivery note timeout has not yet been reached',
      details: { reason: `Only ${Math.floor(daysSinceDispatch)} days since dispatch` },
    };
  }

  // 4. Flag escrow for manual review
  const escrowId = quoteData.escrowId;
  if (escrowId) {
    await flagEscrowForReview(escrowId);
  }

  // 5. Notify Contractor via Action Centre
  await notifyUser(quoteData.contractorId, {
    type: 'delivery_note_timeout',
    message: `Your delivery note for quote ${quoteId} is overdue. The escrow has been flagged for manual review.`,
    entityId: quoteId,
    entityType: 'quote_request',
  });

  // 6. Notify Supplier via Action Centre
  await notifyUser(quoteData.supplierId, {
    type: 'delivery_note_timeout',
    message: `The delivery note for quote ${quoteId} has not been uploaded within 30 days. The escrow has been flagged for manual review.`,
    entityId: quoteId,
    entityType: 'quote_request',
  });

  // 7. Log action to audit trail
  await logMarketplaceAction({
    actorId: 'system',
    actionType: 'delivery_note_timeout',
    entityId: quoteId,
    entityType: 'quote_request',
    metadata: {
      contractorId: quoteData.contractorId,
      supplierId: quoteData.supplierId,
      escrowId: escrowId || null,
      daysSinceDispatch: Math.floor(daysSinceDispatch),
    },
  });

  // 8. Return the quote (status unchanged — escrow flagged for review)
  const quote: QuoteRequest = {
    id: quoteId,
    contractorId: quoteData.contractorId,
    supplierId: quoteData.supplierId,
    listingId: quoteData.listingId,
    linkedProjectId: quoteData.linkedProjectId,
    quantity: quoteData.quantity,
    deliveryAddress: quoteData.deliveryAddress,
    status: quoteData.status,
    quotedAmount: quoteData.quotedAmount,
    createdAt: quoteData.createdAt,
    expiresAt: quoteData.expiresAt,
  };

  return quote;
}
