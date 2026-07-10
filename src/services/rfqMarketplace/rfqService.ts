// ─── RFQ Service ─────────────────────────────────────────────────────────────
// Handles RFQ CRUD, status transitions, validation, and deadline management.

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
  RfqStatus,
  EvaluationCriteria,
  RfqLineItem,
  ValidationResult,
  RfqValidationError,
} from './types';
import {
  isValidTransition,
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MIN_DEADLINE_HOURS_AHEAD,
  MIN_BBEE_WEIGHT_PUBLIC_SECTOR,
  BBEE_VALUE_THRESHOLD,
} from './types';

// ─── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Validates evaluation criteria weights sum to 100 and are integers 0–100.
 * Enforces B-BBEE minimum 10% for public sector or high-value RFQs.
 */
export function validateEvaluationCriteria(
  criteria: EvaluationCriteria,
  isPublicSector: boolean,
  estimatedValue?: number
): ValidationResult {
  const errors: RfqValidationError[] = [];

  const weights = [
    criteria.priceWeight,
    criteria.leadTimeWeight,
    criteria.bbeeWeight,
    criteria.warrantyWeight,
    criteria.performanceWeight,
  ];

  // Check all weights are integers between 0 and 100
  const allValid = weights.every(
    (w) => Number.isInteger(w) && w >= 0 && w <= 100
  );

  const sum = weights.reduce((acc, w) => acc + w, 0);

  if (!allValid || sum !== 100) {
    errors.push({
      code: RFQ_ERROR_CODES.RFQ_WEIGHTS_INVALID,
      message: RFQ_ERROR_MESSAGES.RFQ_WEIGHTS_INVALID,
      field: 'evaluationCriteria',
    });
  }

  // B-BBEE minimum weight enforcement for public sector or high-value RFQs
  const requiresBbeeMinimum =
    isPublicSector ||
    (estimatedValue !== undefined && estimatedValue > BBEE_VALUE_THRESHOLD);

  if (requiresBbeeMinimum && criteria.bbeeWeight < MIN_BBEE_WEIGHT_PUBLIC_SECTOR) {
    errors.push({
      code: RFQ_ERROR_CODES.RFQ_BBEE_WEIGHT_LOW,
      message: RFQ_ERROR_MESSAGES.RFQ_BBEE_WEIGHT_LOW,
      field: 'evaluationCriteria.bbeeWeight',
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

/**
 * Validates all fields required for RFQ submission.
 */
export function validateRfqSubmission(params: {
  title: string;
  description: string;
  lineItems: RfqLineItem[];
  quoteDeadline: string;
  evaluationCriteria: EvaluationCriteria;
  isPublicSector: boolean;
  estimatedValue?: number;
  packageScopeId?: string;
}): ValidationResult {
  const errors: RfqValidationError[] = [];

  // Title validation
  if (params.title.length > MAX_TITLE_LENGTH) {
    errors.push({
      code: RFQ_ERROR_CODES.RFQ_TITLE_TOO_LONG,
      message: RFQ_ERROR_MESSAGES.RFQ_TITLE_TOO_LONG,
      field: 'title',
    });
  }

  // Description validation
  if (params.description.length > MAX_DESCRIPTION_LENGTH) {
    errors.push({
      code: RFQ_ERROR_CODES.RFQ_DESCRIPTION_TOO_LONG,
      message: RFQ_ERROR_MESSAGES.RFQ_DESCRIPTION_TOO_LONG,
      field: 'description',
    });
  }

  // Line items validation
  if (!params.lineItems || params.lineItems.length === 0) {
    errors.push({
      code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS,
      message: RFQ_ERROR_MESSAGES.RFQ_NO_LINE_ITEMS,
      field: 'lineItems',
    });
  } else {
    // Validate each line item has quantity > 0 and a unit of measure
    const hasInvalidLineItem = params.lineItems.some(
      (item) => item.quantity <= 0 || !item.unit || item.unit.trim() === ''
    );
    if (hasInvalidLineItem) {
      errors.push({
        code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS,
        message: 'All line items must have quantity greater than zero and a unit of measure',
        field: 'lineItems',
      });
    }
  }

  // Deadline validation
  if (!params.quoteDeadline || params.quoteDeadline.trim() === '') {
    errors.push({
      code: RFQ_ERROR_CODES.RFQ_DEADLINE_MISSING,
      message: RFQ_ERROR_MESSAGES.RFQ_DEADLINE_MISSING,
      field: 'quoteDeadline',
    });
  } else {
    const deadlineDate = new Date(params.quoteDeadline);
    const now = new Date();
    const minDeadline = new Date(
      now.getTime() + MIN_DEADLINE_HOURS_AHEAD * 60 * 60 * 1000
    );

    if (isNaN(deadlineDate.getTime())) {
      errors.push({
        code: RFQ_ERROR_CODES.RFQ_DEADLINE_MISSING,
        message: RFQ_ERROR_MESSAGES.RFQ_DEADLINE_MISSING,
        field: 'quoteDeadline',
      });
    } else if (deadlineDate < minDeadline) {
      errors.push({
        code: RFQ_ERROR_CODES.RFQ_DEADLINE_TOO_SOON,
        message: RFQ_ERROR_MESSAGES.RFQ_DEADLINE_TOO_SOON,
        field: 'quoteDeadline',
      });
    }
  }

  // Evaluation criteria validation
  const criteriaResult = validateEvaluationCriteria(
    params.evaluationCriteria,
    params.isPublicSector,
    params.estimatedValue
  );

  if (criteriaResult.valid === false) {
    errors.push(...criteriaResult.errors);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true };
}

// ─── CRUD Operations ─────────────────────────────────────────────────────────

/**
 * Creates a new RFQ document in draft status.
 * Validates title, description, line items, deadline, and evaluation criteria.
 */
export async function createRfq(params: {
  projectId: string;
  title: string;
  description: string;
  packageScopeId: string;
  packageScopeTitle: string;
  lineItems: RfqLineItem[];
  deliveryAddress: string;
  quoteDeadline: string;
  evaluationCriteria: EvaluationCriteria;
  isPublicSector: boolean;
  localSpendTargetPct?: number;
  estimatedValue?: number;
  createdBy: string;
}): Promise<{ success: boolean; rfq?: RfqDocument; errors?: ValidationResult }> {
  // Validate submission
  const validation = validateRfqSubmission({
    title: params.title,
    description: params.description,
    lineItems: params.lineItems,
    quoteDeadline: params.quoteDeadline,
    evaluationCriteria: params.evaluationCriteria,
    isPublicSector: params.isPublicSector,
    estimatedValue: params.estimatedValue,
    packageScopeId: params.packageScopeId,
  });

  if (!validation.valid) {
    return { success: false, errors: validation };
  }

  const now = new Date().toISOString();
  const rfqId = `rfq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const rfqDocument: RfqDocument = {
    id: rfqId,
    projectId: params.projectId,
    title: params.title,
    description: params.description,
    packageScopeId: params.packageScopeId,
    packageScopeTitle: params.packageScopeTitle,
    lineItems: params.lineItems,
    deliveryAddress: params.deliveryAddress,
    quoteDeadline: params.quoteDeadline,
    evaluationCriteria: params.evaluationCriteria,
    status: 'draft',
    invitationList: [],
    isPublicSector: params.isPublicSector,
    localSpendTargetPct: params.localSpendTargetPct,
    estimatedValue: params.estimatedValue,
    createdBy: params.createdBy,
    createdAt: now,
    updatedAt: now,
  };

  // Persist to Firestore via demo-safe pattern
  const docRef = getDemoDoc('projects', params.projectId, 'rfqs', rfqId);
  await setDoc(docRef, rfqDocument);

  return { success: true, rfq: rfqDocument };
}

/**
 * Retrieves an RFQ document by ID.
 */
export async function getRfq(projectId: string, rfqId: string): Promise<RfqDocument | null> {
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data() as RfqDocument;
}

/**
 * Lists RFQs for a project, optionally filtered by status.
 */
export async function listRfqs(projectId: string, status?: RfqStatus): Promise<RfqDocument[]> {
  const colRef = getDemoCol('projects', projectId, 'rfqs');

  let q;
  if (status) {
    q = query(colRef, where('status', '==', status));
  } else {
    q = query(colRef);
  }

  const snapshot = await getDocs(q);
  const rfqs: RfqDocument[] = [];

  snapshot.forEach((docSnap) => {
    rfqs.push(docSnap.data() as RfqDocument);
  });

  return rfqs;
}

// ─── Status Transition Functions (Task 2.2) ─────────────────────────────────

/**
 * Transitions an RFQ from draft to published status.
 * Requires at least 1 supplier on the invitation list.
 */
export async function publishRfq(projectId: string, rfqId: string): Promise<{ success: boolean; errors?: ValidationResult }> {
  const rfq = await getRfq(projectId, rfqId);
  if (!rfq) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: 'RFQ not found' }],
      },
    };
  }

  // Check valid state transition
  if (!isValidTransition(rfq.status, 'published')) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: `Cannot transition from "${rfq.status}" to "published"`, field: 'status' }],
      },
    };
  }

  // Business rule: at least 1 supplier on invitation list
  if (!rfq.invitationList || rfq.invitationList.length < 1) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_SUPPLIERS, message: RFQ_ERROR_MESSAGES.RFQ_NO_SUPPLIERS, field: 'invitationList' }],
      },
    };
  }

  const now = new Date().toISOString();
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  await updateDoc(docRef, {
    status: 'published',
    publishedAt: now,
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Transitions an RFQ to evaluation status.
 * Triggered when deadline passes and at least 2 quotes received.
 */
export async function transitionToEvaluation(projectId: string, rfqId: string): Promise<{ success: boolean; errors?: ValidationResult }> {
  const rfq = await getRfq(projectId, rfqId);
  if (!rfq) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: 'RFQ not found' }],
      },
    };
  }

  // Check valid state transition
  if (!isValidTransition(rfq.status, 'evaluation')) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: `Cannot transition from "${rfq.status}" to "evaluation"`, field: 'status' }],
      },
    };
  }

  // Business rule: deadline must have passed
  const now = new Date();
  const deadline = new Date(rfq.quoteDeadline);
  if (now < deadline) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.QUOTE_DEADLINE_PASSED, message: 'Quote deadline has not yet passed', field: 'quoteDeadline' }],
      },
    };
  }

  // Business rule: at least 2 quotes received
  const quotesColRef = getDemoCol('projects', projectId, 'rfqs', rfqId, 'quotes');
  const quotesQuery = query(quotesColRef, where('status', '==', 'submitted'));
  const quotesSnapshot = await getDocs(quotesQuery);

  if (quotesSnapshot.size < 2) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: 'At least 2 submitted quotes are required to enter evaluation', field: 'quotes' }],
      },
    };
  }

  const nowIso = now.toISOString();
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  await updateDoc(docRef, {
    status: 'evaluation',
    updatedAt: nowIso,
  });

  return { success: true };
}

/**
 * Cancels an RFQ (from draft or published status).
 */
export async function cancelRfq(projectId: string, rfqId: string): Promise<{ success: boolean; errors?: ValidationResult }> {
  const rfq = await getRfq(projectId, rfqId);
  if (!rfq) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: 'RFQ not found' }],
      },
    };
  }

  // Check valid state transition (only draft and published can be cancelled)
  if (!isValidTransition(rfq.status, 'cancelled')) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: `Cannot cancel RFQ with status "${rfq.status}"`, field: 'status' }],
      },
    };
  }

  const now = new Date().toISOString();
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  await updateDoc(docRef, {
    status: 'cancelled',
    cancelledAt: now,
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Transitions an RFQ to awarded status (after both approvals).
 */
export async function awardRfq(projectId: string, rfqId: string): Promise<{ success: boolean; errors?: ValidationResult }> {
  const rfq = await getRfq(projectId, rfqId);
  if (!rfq) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: 'RFQ not found' }],
      },
    };
  }

  // Check valid state transition (only evaluation can transition to awarded)
  if (!isValidTransition(rfq.status, 'awarded')) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.RFQ_NO_LINE_ITEMS, message: `Cannot transition from "${rfq.status}" to "awarded"`, field: 'status' }],
      },
    };
  }

  // Business rule: both client and professional approvals must be recorded
  const awardDocRef = getDemoDoc('projects', projectId, 'rfqs', rfqId, 'award', 'recommendation');
  const awardSnapshot = await getDoc(awardDocRef);

  if (!awardSnapshot.exists()) {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED, message: 'Award recommendation not found', field: 'award' }],
      },
    };
  }

  const award = awardSnapshot.data();

  // Require client approval
  if (!award.clientApproval || award.clientApproval.decision !== 'approved') {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED, message: RFQ_ERROR_MESSAGES.AWARD_CLIENT_REQUIRED, field: 'clientApproval' }],
      },
    };
  }

  // Require professional approval
  if (!award.professionalApproval || award.professionalApproval.decision !== 'approved') {
    return {
      success: false,
      errors: {
        valid: false,
        errors: [{ code: RFQ_ERROR_CODES.AWARD_CLIENT_REQUIRED, message: 'Professional approval must be recorded before award', field: 'professionalApproval' }],
      },
    };
  }

  const now = new Date().toISOString();
  const docRef = getDemoDoc('projects', projectId, 'rfqs', rfqId);
  await updateDoc(docRef, {
    status: 'awarded',
    awardedAt: now,
    updatedAt: now,
  });

  return { success: true };
}
