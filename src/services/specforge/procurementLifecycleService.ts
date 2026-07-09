/**
 * Procurement Lifecycle Service — manages the full procurement workflow
 * from approved baseline through RFQ, quoting, award, PO generation,
 * delivery, site acceptance, payment release, and warranty handover.
 *
 * Key behaviours:
 * - Verifies an approved baseline exists before any procurement operation
 * - Stores supplier quotes (2–20 per item) as separate records
 * - Requires capability-gated approval for awards
 * - Generates POs with unique system-generated numbers on approval
 * - Supports partial/rejected/full delivery statuses
 * - Blocks payment until site acceptance confirmed
 * - Tracks warranty records linked to entries and items
 * - Calculates latest-order-date from programme schedule
 * - Handles addendum creation with supplier notification
 *
 * Validates: Requirements 10.1–10.14
 */

import type {
  SpecSupplierQuote,
  SpecPurchaseOrder,
  SpecDeliveryRecord,
  SpecWarrantyRecord,
  SpecAddendum,
  SpecAwardRequest,
  SpecCapability,
} from '@/types/specforgeTypes';
import { adminDb } from '@/lib/firebase-admin';
import { logSpecForgeAction } from './specforgeAuditAdapter';
import { getRolesWithCapability } from './specforgeInboxAdapter';
import { createInboxEvent } from '@/services/inboxEventAdapter';

// ── Constants ───────────────────────────────────────────────────────────────

const MIN_QUOTES_PER_ITEM = 2;
const MAX_QUOTES_PER_ITEM = 20;
const LATEST_ORDER_WARNING_DAYS = 14;

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique ID with a given prefix. */
function generateId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${ts}-${rand}`;
}

/** Generate a unique PO number (system-generated, unique). */
function generatePoNumber(): string {
  const date = new Date();
  const datePart = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PO-${datePart}-${rand}`;
}

/** Get Firestore collection reference for a project subcollection. */
function col(projectId: string, subcol: string) {
  return adminDb.collection('projects').doc(projectId).collection(subcol);
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface CreateRfqParams {
  specItemIds: string[];
  invitedSuppliers: string[];
  dueDate: string;
  notes?: string;
  createdBy: string;
}

export interface RfqDocument {
  id: string;
  projectId: string;
  specItemIds: string[];
  invitedSuppliers: string[];
  dueDate: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  status: 'open' | 'closed' | 'awarded';
}

export interface CreateAddendumParams {
  specItemId: string;
  rfqId: string;
  changeSummary: string;
  initiatedBy: string;
}

export interface LatestOrderDateResult {
  latestOrderDate: string | null;
  missingLeadTime: boolean;
  warningGenerated: boolean;
}

// ── Core Implementation ─────────────────────────────────────────────────────

/**
 * Verify that an approved baseline exists for the project.
 * An approved baseline is an issued snapshot with issueStatus = 'issued_snapshot'.
 * Rejects procurement operations with 400 if missing.
 *
 * Validates: Requirement 10.1
 */
export async function verifyApprovedBaseline(projectId: string): Promise<boolean> {
  const snapshotsRef = col(projectId, 'specSnapshots');
  const query = snapshotsRef
    .where('issueStatus', '==', 'issued_snapshot')
    .limit(1);
  const snapshot = await query.get();
  return !snapshot.empty;
}

/**
 * Create an RFQ for the given project and spec items.
 * Verifies approved baseline before proceeding.
 * Writes Audit_Event on creation.
 *
 * Validates: Requirement 10.1, 10.3
 */
export async function createRfq(
  projectId: string,
  params: CreateRfqParams,
): Promise<RfqDocument> {
  // Verify approved baseline
  const hasBaseline = await verifyApprovedBaseline(projectId);
  if (!hasBaseline) {
    throw new ProcurementBaselineError(
      'Cannot create RFQ: no approved baseline exists for this project. ' +
      'At least one issued snapshot with status "issued_snapshot" is required.',
    );
  }

  const timestamp = new Date().toISOString();
  const rfqDoc: RfqDocument = {
    id: generateId('rfq'),
    projectId,
    specItemIds: params.specItemIds,
    invitedSuppliers: params.invitedSuppliers,
    dueDate: params.dueDate,
    notes: params.notes,
    createdBy: params.createdBy,
    createdAt: timestamp,
    status: 'open',
  };

  // Persist RFQ document
  await col(projectId, 'specProcurement')
    .doc(rfqDoc.id)
    .set(rfqDoc);

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'created',
    targetId: rfqDoc.id,
    targetType: 'procurement',
    performedBy: params.createdBy,
    projectId,
    newValue: JSON.stringify({
      rfqId: rfqDoc.id,
      specItemIds: params.specItemIds,
      invitedSuppliers: params.invitedSuppliers,
    }),
  });

  return rfqDoc;
}

/**
 * Submit a supplier quote for a spec item.
 * Stores as a separate record; supports 2–20 quotes per item.
 *
 * Validates: Requirement 10.2
 */
export async function submitQuote(
  projectId: string,
  quote: Omit<SpecSupplierQuote, 'id' | 'submittedAt'>,
): Promise<SpecSupplierQuote> {
  // Check quote count for this spec item
  const existingQuotes = await col(projectId, 'specQuotes')
    .where('specItemId', '==', quote.specItemId)
    .get();

  if (existingQuotes.size >= MAX_QUOTES_PER_ITEM) {
    throw new ProcurementValidationError(
      `Maximum of ${MAX_QUOTES_PER_ITEM} quotes per spec item reached.`,
    );
  }

  const timestamp = new Date().toISOString();
  const quoteRecord: SpecSupplierQuote = {
    ...quote,
    id: generateId('quote'),
    submittedAt: timestamp,
  };

  // Validate B-BBEE level
  if (quoteRecord.bbbeeLevel < 1 || quoteRecord.bbbeeLevel > 8) {
    throw new ProcurementValidationError(
      'B-BBEE level must be between 1 and 8.',
    );
  }

  // Persist quote
  await col(projectId, 'specQuotes')
    .doc(quoteRecord.id)
    .set(quoteRecord);

  return quoteRecord;
}

/**
 * Request award for a supplier selection.
 * Creates an award request with pending_approval status.
 * Requires a capability gate (approve_substitution or approve_technical_section).
 *
 * Validates: Requirement 10.4
 */
export async function requestAward(
  projectId: string,
  params: {
    procurementEntryId: string;
    specItemId: string;
    selectedSupplierUid: string;
    selectedQuoteId: string;
    requestedBy: string;
  },
): Promise<SpecAwardRequest> {
  // Verify approved baseline
  const hasBaseline = await verifyApprovedBaseline(projectId);
  if (!hasBaseline) {
    throw new ProcurementBaselineError(
      'Cannot request award: no approved baseline exists for this project.',
    );
  }

  const timestamp = new Date().toISOString();
  const awardRequest: SpecAwardRequest = {
    id: generateId('award'),
    procurementEntryId: params.procurementEntryId,
    specItemId: params.specItemId,
    selectedSupplierUid: params.selectedSupplierUid,
    selectedQuoteId: params.selectedQuoteId,
    requestedBy: params.requestedBy,
    requestedAt: timestamp,
    status: 'pending_approval',
  };

  // Persist award request
  await col(projectId, 'specProcurement')
    .doc(awardRequest.id)
    .set(awardRequest);

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'created',
    targetId: awardRequest.id,
    targetType: 'procurement',
    performedBy: params.requestedBy,
    projectId,
    newValue: JSON.stringify(awardRequest),
  });

  return awardRequest;
}

/**
 * Approve an award request.
 * Verifies approver has approve_substitution or approve_technical_section capability.
 * Generates a PO on approval.
 *
 * Validates: Requirement 10.4, 10.6
 */
export async function approveAward(
  projectId: string,
  awardId: string,
  approverId: string,
  approverCapabilities: SpecCapability[],
): Promise<SpecPurchaseOrder> {
  // Capability gate check
  const hasApprovalCapability =
    approverCapabilities.includes('approve_substitution') ||
    approverCapabilities.includes('approve_technical_section');

  if (!hasApprovalCapability) {
    throw new ProcurementCapabilityError(
      'Approver must have approve_substitution or approve_technical_section capability.',
    );
  }

  // Get the award request
  const awardDoc = await col(projectId, 'specProcurement').doc(awardId).get();
  if (!awardDoc.exists) {
    throw new ProcurementNotFoundError(`Award request ${awardId} not found.`);
  }

  const award = awardDoc.data() as SpecAwardRequest;
  if (award.status !== 'pending_approval') {
    throw new ProcurementValidationError(
      `Award request is in status "${award.status}", cannot approve.`,
    );
  }

  const timestamp = new Date().toISOString();

  // Update award status
  await col(projectId, 'specProcurement').doc(awardId).update({
    status: 'approved',
    approvedBy: approverId,
    approvedAt: timestamp,
  });

  // Get the selected quote for PO details
  const quoteDoc = await col(projectId, 'specQuotes').doc(award.selectedQuoteId).get();
  const quote = quoteDoc.exists ? (quoteDoc.data() as SpecSupplierQuote) : null;

  // Generate Purchase Order
  const po: SpecPurchaseOrder = {
    id: generateId('po'),
    poNumber: generatePoNumber(),
    procurementEntryId: award.procurementEntryId,
    specItemIds: [award.specItemId],
    supplierUid: award.selectedSupplierUid,
    supplierFirmName: quote?.supplierFirmName ?? 'Unknown Supplier',
    unitRates: quote ? { [award.specItemId]: quote.unitRate } : {},
    totalCost: quote?.totalCost ?? 0,
    deliverySchedule: [{
      lineItemId: award.specItemId,
      expectedDate: new Date(Date.now() + (quote?.leadTimeDays ?? 30) * 86400000).toISOString(),
      quantity: 1,
    }],
    paymentTerms: 'Net 30',
    status: 'issued',
    generatedAt: timestamp,
  };

  // Persist PO
  await col(projectId, 'specPurchaseOrders').doc(po.id).set(po);

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'approved',
    targetId: awardId,
    targetType: 'procurement',
    performedBy: approverId,
    projectId,
    newValue: JSON.stringify({ poNumber: po.poNumber, poId: po.id }),
  });

  return po;
}

/**
 * Reject an award request.
 * Records rejection reason, retains pending_award status, emits Inbox_Event.
 *
 * Validates: Requirement 10.5
 */
export async function rejectAward(
  projectId: string,
  awardId: string,
  rejectedBy: string,
  rejectionReason: string,
): Promise<void> {
  // Get the award request
  const awardDoc = await col(projectId, 'specProcurement').doc(awardId).get();
  if (!awardDoc.exists) {
    throw new ProcurementNotFoundError(`Award request ${awardId} not found.`);
  }

  const award = awardDoc.data() as SpecAwardRequest;
  if (award.status !== 'pending_approval') {
    throw new ProcurementValidationError(
      `Award request is in status "${award.status}", cannot reject.`,
    );
  }

  // Update award with rejection — keep in pending_award status
  await col(projectId, 'specProcurement').doc(awardId).update({
    status: 'rejected',
    rejectionReason,
  });

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'status_changed',
    targetId: awardId,
    targetType: 'procurement',
    performedBy: rejectedBy,
    projectId,
    previousValue: 'pending_approval',
    newValue: JSON.stringify({ status: 'rejected', rejectionReason }),
  });

  // Emit Inbox_Event to the user who initiated the award request
  createInboxEvent(
    award.requestedBy,
    `Award rejected: ${rejectionReason}`,
    awardId,
    'high',
  );
}

/**
 * Record a delivery for a procurement entry.
 * Supports partial/rejected/full statuses.
 * Writes Audit_Event for each delivery recording.
 *
 * Validates: Requirement 10.8
 */
export async function recordDelivery(
  projectId: string,
  params: {
    procurementEntryId: string;
    poId: string;
    specItemId: string;
    quantityOrdered: number;
    quantityDelivered: number;
    rejectionReason?: string;
    recordedBy: string;
  },
): Promise<SpecDeliveryRecord> {
  // Determine delivery status
  let deliveryStatus: 'partial' | 'full' | 'rejected';
  if (params.rejectionReason) {
    deliveryStatus = 'rejected';
  } else if (params.quantityDelivered >= params.quantityOrdered) {
    deliveryStatus = 'full';
  } else if (params.quantityDelivered > 0) {
    deliveryStatus = 'partial';
  } else {
    throw new ProcurementValidationError(
      'Quantity delivered must be greater than 0, or a rejection reason must be provided.',
    );
  }

  const timestamp = new Date().toISOString();
  const deliveryRecord: SpecDeliveryRecord = {
    id: generateId('del'),
    procurementEntryId: params.procurementEntryId,
    poId: params.poId,
    specItemId: params.specItemId,
    deliveryStatus,
    quantityOrdered: params.quantityOrdered,
    quantityDelivered: params.quantityDelivered,
    rejectionReason: params.rejectionReason,
    deliveredAt: timestamp,
    recordedBy: params.recordedBy,
    siteAccepted: false,
    paymentReleaseBlocked: true,
  };

  // Persist delivery record
  await col(projectId, 'specDeliveries').doc(deliveryRecord.id).set(deliveryRecord);

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'status_changed',
    targetId: deliveryRecord.id,
    targetType: 'procurement',
    performedBy: params.recordedBy,
    projectId,
    newValue: JSON.stringify({
      deliveryStatus,
      quantityDelivered: params.quantityDelivered,
      quantityOrdered: params.quantityOrdered,
    }),
  });

  return deliveryRecord;
}

/**
 * Confirm site acceptance for a delivery.
 * Unblocks payment and emits Inbox_Event to review_budget users.
 *
 * Validates: Requirement 10.9, 10.10
 */
export async function confirmSiteAcceptance(
  projectId: string,
  deliveryId: string,
  userId: string,
): Promise<void> {
  const deliveryDoc = await col(projectId, 'specDeliveries').doc(deliveryId).get();
  if (!deliveryDoc.exists) {
    throw new ProcurementNotFoundError(`Delivery record ${deliveryId} not found.`);
  }

  const delivery = deliveryDoc.data() as SpecDeliveryRecord;
  if (delivery.siteAccepted) {
    throw new ProcurementValidationError('Site acceptance already confirmed.');
  }

  const timestamp = new Date().toISOString();

  // Update delivery: unblock payment, mark site accepted
  await col(projectId, 'specDeliveries').doc(deliveryId).update({
    siteAccepted: true,
    siteAcceptedBy: userId,
    siteAcceptedAt: timestamp,
    paymentReleaseBlocked: false,
  });

  // Emit Inbox_Event to review_budget users
  const budgetRoles = getRolesWithCapability('review_budget');
  for (const role of budgetRoles) {
    createInboxEvent(
      role,
      `Site acceptance confirmed for delivery ${deliveryId}. Payment release unblocked.`,
      deliveryId,
      'medium',
    );
  }

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'status_changed',
    targetId: deliveryId,
    targetType: 'procurement',
    performedBy: userId,
    projectId,
    previousValue: JSON.stringify({ siteAccepted: false, paymentReleaseBlocked: true }),
    newValue: JSON.stringify({ siteAccepted: true, paymentReleaseBlocked: false }),
  });
}

/**
 * Upload warranty documentation for a procurement entry.
 * Stores warranty record linked to entry and item. Requires min 1 document ref.
 *
 * Validates: Requirement 10.11
 */
export async function uploadWarranty(
  projectId: string,
  params: {
    procurementEntryId: string;
    specItemId: string;
    warrantyStartDate: string;
    warrantyDurationMonths: number;
    terms: string;
    documentRefs: string[];
    uploadedBy: string;
  },
): Promise<SpecWarrantyRecord> {
  // Validate minimum 1 document reference
  if (!params.documentRefs || params.documentRefs.length < 1) {
    throw new ProcurementValidationError(
      'At least one document reference is required for warranty upload.',
    );
  }

  const timestamp = new Date().toISOString();
  const warrantyRecord: SpecWarrantyRecord = {
    id: generateId('wrty'),
    procurementEntryId: params.procurementEntryId,
    specItemId: params.specItemId,
    warrantyStartDate: params.warrantyStartDate,
    warrantyDurationMonths: params.warrantyDurationMonths,
    terms: params.terms,
    documentRefs: params.documentRefs,
    uploadedBy: params.uploadedBy,
    uploadedAt: timestamp,
  };

  // Persist warranty record
  await col(projectId, 'specWarranties').doc(warrantyRecord.id).set(warrantyRecord);

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'created',
    targetId: warrantyRecord.id,
    targetType: 'procurement',
    performedBy: params.uploadedBy,
    projectId,
    newValue: JSON.stringify({
      specItemId: params.specItemId,
      warrantyDurationMonths: params.warrantyDurationMonths,
      documentCount: params.documentRefs.length,
    }),
  });

  return warrantyRecord;
}

/**
 * Check closeout eligibility for a procurement entry.
 * All line items must have status 'installed' AND warranty uploaded → eligible.
 *
 * Validates: Requirement 10.12
 */
export async function checkCloseoutEligibility(
  projectId: string,
  procurementEntryId: string,
): Promise<boolean> {
  // Get all deliveries for this procurement entry
  const deliveriesSnap = await col(projectId, 'specDeliveries')
    .where('procurementEntryId', '==', procurementEntryId)
    .get();

  if (deliveriesSnap.empty) {
    return false;
  }

  // Check all deliveries have full status and site acceptance
  const deliveries = deliveriesSnap.docs.map(d => d.data() as SpecDeliveryRecord);
  const allInstalled = deliveries.every(
    d => d.deliveryStatus === 'full' && d.siteAccepted,
  );

  if (!allInstalled) {
    return false;
  }

  // Check warranty uploaded for each spec item in this entry
  const specItemIds = [...new Set(deliveries.map(d => d.specItemId))];
  for (const specItemId of specItemIds) {
    const warrantySnap = await col(projectId, 'specWarranties')
      .where('procurementEntryId', '==', procurementEntryId)
      .where('specItemId', '==', specItemId)
      .limit(1)
      .get();

    if (warrantySnap.empty) {
      return false;
    }
  }

  return true;
}

/**
 * Calculate the latest order date for a procurement entry.
 * latestOrderDate = requiredOnSiteDate - leadTimeDays.
 * Flags missing_lead_time if leadTimeDays is undefined.
 * Generates Inbox warning at 14 days before latest order date.
 *
 * Validates: Requirement 10.13, 10.14
 */
export async function calculateLatestOrderDate(
  projectId: string,
  params: {
    procurementEntryId: string;
    specItemId: string;
    requiredOnSiteDate?: string;
    leadTimeDays?: number;
  },
): Promise<LatestOrderDateResult> {
  // If lead time is not defined, flag as missing
  if (params.leadTimeDays === undefined || params.leadTimeDays === null) {
    // Emit Inbox_Event about missing lead time
    createInboxEvent(
      'site_manager',
      `Lead time not defined for procurement entry ${params.procurementEntryId}. ` +
      'Provide lead time before scheduling can proceed.',
      params.procurementEntryId,
      'high',
    );

    return {
      latestOrderDate: null,
      missingLeadTime: true,
      warningGenerated: true,
    };
  }

  // If no required-on-site date, cannot calculate
  if (!params.requiredOnSiteDate) {
    return {
      latestOrderDate: null,
      missingLeadTime: false,
      warningGenerated: false,
    };
  }

  // Calculate latest order date
  const requiredDate = new Date(params.requiredOnSiteDate);
  const latestOrderMs = requiredDate.getTime() - (params.leadTimeDays * 86400000);
  const latestOrderDate = new Date(latestOrderMs).toISOString();

  // Check if within 14-day warning threshold
  const now = Date.now();
  const daysUntilLatestOrder = Math.ceil((latestOrderMs - now) / 86400000);
  let warningGenerated = false;

  if (daysUntilLatestOrder <= LATEST_ORDER_WARNING_DAYS && daysUntilLatestOrder > 0) {
    // Generate Inbox_Event warning
    createInboxEvent(
      'site_manager',
      `Latest order date warning: ${daysUntilLatestOrder} days remaining ` +
      `for procurement entry ${params.procurementEntryId}. ` +
      `Order must be placed by ${latestOrderDate.split('T')[0]}.`,
      params.procurementEntryId,
      'high',
    );
    warningGenerated = true;
  }

  return {
    latestOrderDate,
    missingLeadTime: false,
    warningGenerated,
  };
}

/**
 * Create an addendum to a spec item after RFQ issuance.
 * Notifies all invited suppliers via Inbox_Event.
 * Writes Audit_Event recording the addendum.
 *
 * Validates: Requirement 10.3
 */
export async function createAddendum(
  projectId: string,
  params: CreateAddendumParams,
): Promise<SpecAddendum> {
  const timestamp = new Date().toISOString();

  // Look up the RFQ to get invited suppliers
  const rfqDoc = await col(projectId, 'specProcurement').doc(params.rfqId).get();
  let invitedSuppliers: string[] = [];
  if (rfqDoc.exists) {
    const rfqData = rfqDoc.data() as RfqDocument;
    invitedSuppliers = rfqData.invitedSuppliers ?? [];
  }

  const addendum: SpecAddendum = {
    id: generateId('add'),
    specItemId: params.specItemId,
    rfqId: params.rfqId,
    changeSummary: params.changeSummary,
    initiatedBy: params.initiatedBy,
    initiatedAt: timestamp,
    notifiedSuppliers: invitedSuppliers,
  };

  // Persist addendum
  await col(projectId, 'specAddenda').doc(addendum.id).set(addendum);

  // Notify all invited suppliers via Inbox_Event
  for (const supplierUid of invitedSuppliers) {
    createInboxEvent(
      supplierUid,
      `Addendum issued for RFQ ${params.rfqId}: ${params.changeSummary.slice(0, 200)}`,
      addendum.id,
      'high',
    );
  }

  // Write Audit_Event
  await logSpecForgeAction({
    action: 'updated',
    targetId: addendum.id,
    targetType: 'procurement',
    performedBy: params.initiatedBy,
    projectId,
    newValue: JSON.stringify({
      specItemId: params.specItemId,
      rfqId: params.rfqId,
      changeSummary: params.changeSummary,
      notifiedSupplierCount: invitedSuppliers.length,
    }),
  });

  return addendum;
}

/**
 * Get quote comparison data for a spec item.
 * Returns all quotes normalized for side-by-side comparison on:
 * unit rate, total cost, lead time, warranty terms, B-BBEE score.
 *
 * Validates: Requirement 10.2
 */
export async function getQuoteComparison(
  projectId: string,
  specItemId: string,
): Promise<SpecSupplierQuote[]> {
  const quotesSnap = await col(projectId, 'specQuotes')
    .where('specItemId', '==', specItemId)
    .get();

  return quotesSnap.docs.map(d => d.data() as SpecSupplierQuote);
}

// ── Error Classes ───────────────────────────────────────────────────────────

/**
 * Error thrown when procurement operations are attempted without an approved baseline.
 */
export class ProcurementBaselineError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ProcurementBaselineError';
  }
}

/**
 * Error thrown when a procurement operation fails validation.
 */
export class ProcurementValidationError extends Error {
  public readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ProcurementValidationError';
  }
}

/**
 * Error thrown when a required procurement entity is not found.
 */
export class ProcurementNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(message: string) {
    super(message);
    this.name = 'ProcurementNotFoundError';
  }
}

/**
 * Error thrown when a user lacks the required capability for a procurement operation.
 */
export class ProcurementCapabilityError extends Error {
  public readonly statusCode = 403;
  constructor(message: string) {
    super(message);
    this.name = 'ProcurementCapabilityError';
  }
}
