// ─── RFQ Marketplace — RBAC Service ─────────────────────────────────────────
// Role-Based Access Control enforcement for the Supplier RFQ Marketplace.
// Implements access checks for RFQ creation, quote submission, award
// recommendation, approval actions, and supplier visibility scoping.

import {
  RFQ_CREATION_ROLES,
  AWARD_RECOMMENDATION_ROLES,
  RFQ_ERROR_CODES,
  RFQ_ERROR_MESSAGES,
} from './types';

import type {
  RfqDocument,
  ValidationResult,
} from './types';

// ─── RFQ Creation Access ────────────────────────────────────────────────────

/**
 * Checks whether a user has permission to create an RFQ on a project.
 * Valid roles: architect, quantity_surveyor, contractor, admin.
 *
 * @param userRoles - The roles the user holds on the project
 * @returns ValidationResult indicating access granted or denied
 *
 * Validates: Requirements 10.1
 */
export function checkRfqCreationAccess(userRoles: string[]): ValidationResult {
  const hasAccess = userRoles.some((role) =>
    (RFQ_CREATION_ROLES as readonly string[]).includes(role)
  );

  if (hasAccess) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: [
      {
        code: RFQ_ERROR_CODES.ACCESS_DENIED,
        message: RFQ_ERROR_MESSAGES.ACCESS_DENIED,
        field: 'role',
      },
    ],
  };
}

// ─── Quote Submission Access ────────────────────────────────────────────────

/**
 * Checks whether a supplier has permission to submit a quote for an RFQ.
 * Requires supplier role AND presence on the RFQ's invitation list.
 *
 * @param userRole - The user's role (must be 'supplier')
 * @param supplierId - The supplier's unique identifier
 * @param rfq - The RFQ document to check invitation list against
 * @returns ValidationResult indicating access granted or denied
 *
 * Validates: Requirements 10.2
 */
export function checkQuoteSubmissionAccess(
  userRole: string,
  supplierId: string,
  rfq: RfqDocument
): ValidationResult {
  if (userRole !== 'supplier') {
    return {
      valid: false,
      errors: [
        {
          code: RFQ_ERROR_CODES.ACCESS_DENIED,
          message: RFQ_ERROR_MESSAGES.ACCESS_DENIED,
          field: 'role',
        },
      ],
    };
  }

  const isInvited = rfq.invitationList.some(
    (supplier) => supplier.supplierId === supplierId
  );

  if (!isInvited) {
    return {
      valid: false,
      errors: [
        {
          code: RFQ_ERROR_CODES.QUOTE_NOT_INVITED,
          message: RFQ_ERROR_MESSAGES.QUOTE_NOT_INVITED,
          field: 'supplierId',
        },
      ],
    };
  }

  return { valid: true };
}

// ─── Award Recommendation Access ────────────────────────────────────────────

/**
 * Checks whether a user has permission to create an award recommendation.
 * Valid roles: quantity_surveyor, architect, contractor.
 *
 * @param userRoles - The roles the user holds on the project
 * @returns ValidationResult indicating access granted or denied
 *
 * Validates: Requirements 10.3
 */
export function checkAwardRecommendationAccess(userRoles: string[]): ValidationResult {
  const hasAccess = userRoles.some((role) =>
    (AWARD_RECOMMENDATION_ROLES as readonly string[]).includes(role)
  );

  if (hasAccess) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: [
      {
        code: RFQ_ERROR_CODES.ACCESS_DENIED,
        message: RFQ_ERROR_MESSAGES.ACCESS_DENIED,
        field: 'role',
      },
    ],
  };
}

// ─── Approval Access ────────────────────────────────────────────────────────

/**
 * Checks whether a user has permission to approve or reject an award.
 * Valid users: designated client approver or professional approver.
 *
 * @param userId - The user attempting the approval action
 * @param projectApprovers - The designated approver IDs for the project
 * @returns ValidationResult indicating access granted or denied
 *
 * Validates: Requirements 10.4
 */
export function checkApprovalAccess(
  userId: string,
  projectApprovers: {
    clientApproverId: string;
    professionalApproverId: string;
  }
): ValidationResult {
  const isApprover =
    userId === projectApprovers.clientApproverId ||
    userId === projectApprovers.professionalApproverId;

  if (isApprover) {
    return { valid: true };
  }

  return {
    valid: false,
    errors: [
      {
        code: RFQ_ERROR_CODES.ACCESS_DENIED,
        message: RFQ_ERROR_MESSAGES.ACCESS_DENIED,
        field: 'userId',
      },
    ],
  };
}

// ─── Supplier Visibility Scope ──────────────────────────────────────────────

/**
 * Filters RFQs to only those where the supplier is on the invitation list.
 * Implements supplier visibility scoping — suppliers only see RFQs they're invited to.
 *
 * @param rfqs - The full list of RFQ documents to filter
 * @param supplierId - The supplier's unique identifier
 * @returns Only the RFQs where supplierId is present in the invitationList
 *
 * Validates: Requirements 10.5
 */
export function filterRfqsForSupplier(
  rfqs: RfqDocument[],
  supplierId: string
): RfqDocument[] {
  return rfqs.filter((rfq) =>
    rfq.invitationList.some((supplier) => supplier.supplierId === supplierId)
  );
}
