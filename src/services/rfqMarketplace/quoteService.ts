// ─── Quote Service ───────────────────────────────────────────────────────────
// Handles quote submission, revision, deadline enforcement, and access control.

import {
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { getDemoDoc, getDemoCol } from '../../demo-seed/demoFirestore';
import type {
  RfqDocument,
  QuoteResponse,
  QuoteLineItem,
  QuoteAttachment,
  QuoteAttachmentMimeType,
  ValidationResult,
  RfqValidationError,
} from './types';
import {
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MIN_UNIT_PRICE,
  MAX_UNIT_PRICE,
  MIN_LEAD_TIME_DAYS,
  MAX_LEAD_TIME_DAYS,
  MIN_DELIVERY_TERMS_LENGTH,
  MAX_QUOTE_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE_BYTES,
  ALLOWED_ATTACHMENT_MIME_TYPES,
} from './types';

// ─── Pure Helper Functions ───────────────────────────────────────────────────

/**
 * Checks whether the current time is before the RFQ quote deadline.
 * Pure function — compares current Date against the ISO 8601 deadline string.
 */
export function isBeforeDeadline(quoteDeadline: string): boolean {
  const deadline = new Date(quoteDeadline);
  const now = new Date();
  return now < deadline;
}

/**
 * Checks whether a supplier is on the RFQ invitation list.
 * Pure function — checks if supplierId exists in the RFQ's invitationList.
 */
export function isSupplierInvited(rfq: RfqDocument, supplierId: string): boolean {
  return rfq.invitationList.some(
    (invited) => invited.supplierId === supplierId
  );
}

// ─── Validation Functions ────────────────────────────────────────────────────

/**
 * Validates quote line items — unit prices must be between MIN and MAX.
 */
function validateQuoteLineItems(lineItems: QuoteLineItem[]): RfqValidationError[] {
  const errors: RfqValidationError[] = [];

  for (const item of lineItems) {
    if (item.unitPrice < MIN_UNIT_PRICE || item.unitPrice > MAX_UNIT_PRICE) {
      errors.push({
        code: RFQ_ERROR_CODES.QUOTE_PRICE_OUT_OF_RANGE,
        message: RFQ_ERROR_MESSAGES.QUOTE_PRICE_OUT_OF_RANGE,
        field: `lineItems.${item.rfqLineItemId}.unitPrice`,
      });
    }
  }

  return errors;
}

/**
 * Validates quote attachments (max 10, each ≤ 25MB, allowed formats).
 */
export function validateQuoteAttachments(attachments: QuoteAttachment[]): ValidationResult {
  const errors: RfqValidationError[] = [];

  if (attachments.length > MAX_QUOTE_ATTACHMENTS) {
    errors.push({
      code: RFQ_ERROR_CODES.QUOTE_TOO_MANY_ATTACHMENTS,
      message: RFQ_ERROR_MESSAGES.QUOTE_TOO_MANY_ATTACHMENTS,
      field: 'attachments',
    });
  }

  for (const attachment of attachments) {
    if (attachment.fileSize > MAX_ATTACHMENT_SIZE_BYTES) {
      errors.push({
        code: RFQ_ERROR_CODES.QUOTE_ATTACHMENT_TOO_LARGE,
        message: RFQ_ERROR_MESSAGES.QUOTE_ATTACHMENT_TOO_LARGE,
        field: `attachments.${attachment.id}`,
      });
    }

    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
        attachment.mimeType as QuoteAttachmentMimeType
      )
    ) {
      errors.push({
        code: RFQ_ERROR_CODES.QUOTE_INVALID_FORMAT,
        message: RFQ_ERROR_MESSAGES.QUOTE_INVALID_FORMAT,
        field: `attachments.${attachment.id}`,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validates all quote submission fields: line items, lead time, delivery terms, attachments.
 */
function validateQuoteSubmission(params: {
  lineItems: QuoteLineItem[];
  leadTimeDays: number;
  deliveryTerms: string;
  attachments: QuoteAttachment[];
}): ValidationResult {
  const errors: RfqValidationError[] = [];

  // Validate line item unit prices
  const lineItemErrors = validateQuoteLineItems(params.lineItems);
  errors.push(...lineItemErrors);

  // Validate lead time (1–730 days)
  if (
    params.leadTimeDays < MIN_LEAD_TIME_DAYS ||
    params.leadTimeDays > MAX_LEAD_TIME_DAYS ||
    !Number.isInteger(params.leadTimeDays)
  ) {
    errors.push({
      code: RFQ_ERROR_CODES.QUOTE_LEAD_TIME_INVALID,
      message: RFQ_ERROR_MESSAGES.QUOTE_LEAD_TIME_INVALID,
      field: 'leadTimeDays',
    });
  }

  // Validate delivery terms (min 10 chars)
  if (params.deliveryTerms.length < MIN_DELIVERY_TERMS_LENGTH) {
    errors.push({
      code: RFQ_ERROR_CODES.QUOTE_DELIVERY_TERMS_SHORT,
      message: RFQ_ERROR_MESSAGES.QUOTE_DELIVERY_TERMS_SHORT,
      field: 'deliveryTerms',
    });
  }

  // Validate attachments
  const attachmentResult = validateQuoteAttachments(params.attachments);
  if (attachmentResult.valid === false) {
    errors.push(...attachmentResult.errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Calculates the total price as the sum of all line item extended prices.
 */
function calculateTotalPrice(lineItems: QuoteLineItem[]): number {
  return lineItems.reduce((sum, item) => sum + item.extendedPrice, 0);
}

// ─── Core Service Functions ──────────────────────────────────────────────────

/**
 * Submits a new quote response for an RFQ.
 * Validates unit prices, lead time, delivery terms, deadline, and invitation status.
 * Records submission timestamp and assigns status "submitted".
 * Persists to projects/{pid}/rfqs/{rfqId}/quotes/{quoteId}.
 */
export async function submitQuote(params: {
  rfqId: string;
  projectId: string;
  supplierId: string;
  supplierName: string;
  lineItems: QuoteLineItem[];
  leadTimeDays: number;
  deliveryTerms: string;
  warrantyMonths?: number;
  attachments: QuoteAttachment[];
}): Promise<{ success: boolean; quote?: QuoteResponse; errors?: ValidationResult }> {
  // 1. Fetch the RFQ to check deadline and invitation
  const rfqRef = getDemoDoc('projects', params.projectId, 'rfqs', params.rfqId);
  const rfqSnapshot = await getDoc(rfqRef);

  if (!rfqSnapshot.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.ACCESS_DENIED,
          message: 'RFQ not found',
          field: 'rfqId',
        }],
      },
    };
  }

  const rfq = rfqSnapshot.data() as RfqDocument;

  // 2. Check deadline enforcement — reject if after quoteDeadline
  if (!isBeforeDeadline(rfq.quoteDeadline)) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.QUOTE_DEADLINE_PASSED,
          message: RFQ_ERROR_MESSAGES.QUOTE_DEADLINE_PASSED,
          field: 'quoteDeadline',
        }],
      },
    };
  }

  // 3. Access control — reject non-invited suppliers
  if (!isSupplierInvited(rfq, params.supplierId)) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.QUOTE_NOT_INVITED,
          message: RFQ_ERROR_MESSAGES.QUOTE_NOT_INVITED,
          field: 'supplierId',
        }],
      },
    };
  }

  // 4. Validate all fields
  const validation = validateQuoteSubmission({
    lineItems: params.lineItems,
    leadTimeDays: params.leadTimeDays,
    deliveryTerms: params.deliveryTerms,
    attachments: params.attachments,
  });

  if (!validation.valid) {
    return { success: false, errors: validation };
  }

  // 5. Calculate total price as sum of extended prices
  const totalPrice = calculateTotalPrice(params.lineItems);

  // 6. Build the quote document
  const now = new Date().toISOString();
  const quoteId = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const quote: QuoteResponse = {
    id: quoteId,
    rfqId: params.rfqId,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    lineItems: params.lineItems,
    totalPrice,
    leadTimeDays: params.leadTimeDays,
    deliveryTerms: params.deliveryTerms,
    warrantyMonths: params.warrantyMonths,
    attachments: params.attachments,
    revisionNumber: 1,
    status: 'submitted',
    submittedAt: now,
  };

  // 7. Persist to Firestore
  const quoteRef = getDemoDoc(
    'projects', params.projectId,
    'rfqs', params.rfqId,
    'quotes', quoteId
  );
  await setDoc(quoteRef, quote);

  return { success: true, quote };
}

/**
 * Revises an existing quote submission before the deadline.
 * Supersedes the previous submission, retains revision history, increments revision number.
 */
export async function reviseQuote(params: {
  rfqId: string;
  projectId: string;
  supplierId: string;
  supplierName: string;
  lineItems: QuoteLineItem[];
  leadTimeDays: number;
  deliveryTerms: string;
  warrantyMonths?: number;
  attachments: QuoteAttachment[];
}): Promise<{ success: boolean; quote?: QuoteResponse; errors?: ValidationResult }> {
  // 1. Fetch the RFQ to check deadline and invitation
  const rfqRef = getDemoDoc('projects', params.projectId, 'rfqs', params.rfqId);
  const rfqSnapshot = await getDoc(rfqRef);

  if (!rfqSnapshot.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.ACCESS_DENIED,
          message: 'RFQ not found',
          field: 'rfqId',
        }],
      },
    };
  }

  const rfq = rfqSnapshot.data() as RfqDocument;

  // 2. Check deadline enforcement
  if (!isBeforeDeadline(rfq.quoteDeadline)) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.QUOTE_DEADLINE_PASSED,
          message: RFQ_ERROR_MESSAGES.QUOTE_DEADLINE_PASSED,
          field: 'quoteDeadline',
        }],
      },
    };
  }

  // 3. Access control — reject non-invited suppliers
  if (!isSupplierInvited(rfq, params.supplierId)) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{
          code: RFQ_ERROR_CODES.QUOTE_NOT_INVITED,
          message: RFQ_ERROR_MESSAGES.QUOTE_NOT_INVITED,
          field: 'supplierId',
        }],
      },
    };
  }

  // 4. Validate all fields
  const validation = validateQuoteSubmission({
    lineItems: params.lineItems,
    leadTimeDays: params.leadTimeDays,
    deliveryTerms: params.deliveryTerms,
    attachments: params.attachments,
  });

  if (!validation.valid) {
    return { success: false, errors: validation };
  }

  // 5. Find the previous submitted quote from this supplier
  const quotesColRef = getDemoCol(
    'projects', params.projectId,
    'rfqs', params.rfqId,
    'quotes'
  );
  const previousQuotesQuery = query(
    quotesColRef,
    where('supplierId', '==', params.supplierId),
    where('status', '==', 'submitted')
  );
  const previousSnapshot = await getDocs(previousQuotesQuery);

  let previousRevisionNumber = 0;

  // 6. Supersede previous submissions
  for (const docSnap of previousSnapshot.docs) {
    const prevQuote = docSnap.data() as QuoteResponse;
    previousRevisionNumber = Math.max(previousRevisionNumber, prevQuote.revisionNumber);

    // Set previous quote status to 'superseded'
    const prevQuoteRef = getDemoDoc(
      'projects', params.projectId,
      'rfqs', params.rfqId,
      'quotes', prevQuote.id
    );
    await updateDoc(prevQuoteRef, { status: 'superseded' });
  }

  // 7. Calculate total price
  const totalPrice = calculateTotalPrice(params.lineItems);

  // 8. Build the new revised quote
  const now = new Date().toISOString();
  const quoteId = `quote_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const quote: QuoteResponse = {
    id: quoteId,
    rfqId: params.rfqId,
    supplierId: params.supplierId,
    supplierName: params.supplierName,
    lineItems: params.lineItems,
    totalPrice,
    leadTimeDays: params.leadTimeDays,
    deliveryTerms: params.deliveryTerms,
    warrantyMonths: params.warrantyMonths,
    attachments: params.attachments,
    revisionNumber: previousRevisionNumber + 1,
    status: 'submitted',
    submittedAt: now,
  };

  // 9. Persist the new quote
  const quoteRef = getDemoDoc(
    'projects', params.projectId,
    'rfqs', params.rfqId,
    'quotes', quoteId
  );
  await setDoc(quoteRef, quote);

  return { success: true, quote };
}

// ─── Read Operations ─────────────────────────────────────────────────────────

/**
 * Retrieves a specific quote by ID.
 */
export async function getQuote(
  projectId: string,
  rfqId: string,
  quoteId: string
): Promise<QuoteResponse | null> {
  const quoteRef = getDemoDoc(
    'projects', projectId,
    'rfqs', rfqId,
    'quotes', quoteId
  );
  const snapshot = await getDoc(quoteRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as QuoteResponse;
}

/**
 * Lists all quotes for an RFQ.
 */
export async function listQuotes(
  projectId: string,
  rfqId: string
): Promise<QuoteResponse[]> {
  const colRef = getDemoCol(
    'projects', projectId,
    'rfqs', rfqId,
    'quotes'
  );
  const snapshot = await getDocs(query(colRef));
  const quotes: QuoteResponse[] = [];

  snapshot.forEach((docSnap) => {
    quotes.push(docSnap.data() as QuoteResponse);
  });

  return quotes;
}
