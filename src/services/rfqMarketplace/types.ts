// ─── Supplier RFQ Marketplace — Type Definitions ────────────────────────────
// Module 6 (Tender/Procurement/Supplier) type system for the RFQ Marketplace.
// Covers: RFQ lifecycle, quote submission, comparison scoring, award workflow,
// supplier profiles, B-BBEE compliance, and state machine transitions.

// ─── RFQ Status & State Machine ─────────────────────────────────────────────

/** The lifecycle status of an RFQ document. */
export type RfqStatus = 'draft' | 'published' | 'evaluation' | 'awarded' | 'cancelled';

/**
 * Procurement status tracked in SpecForge for linked specification items.
 * Represents the full procurement-to-installation lifecycle.
 */
export type ProcurementStatus =
  | 'rfq_sent'
  | 'quoted'
  | 'ordered'
  | 'dispatched'
  | 'delivered'
  | 'installed'
  | 'closed';

/**
 * Type-safe RFQ state machine transitions.
 * Maps each status to the set of valid next statuses.
 */
export const RFQ_STATE_TRANSITIONS: Record<RfqStatus, readonly RfqStatus[]> = {
  draft: ['published', 'cancelled'],
  published: ['evaluation', 'cancelled'],
  evaluation: ['awarded'],
  awarded: [],
  cancelled: [],
} as const;

/**
 * Checks whether a given status transition is valid per the state machine.
 */
export function isValidTransition(from: RfqStatus, to: RfqStatus): boolean {
  return (RFQ_STATE_TRANSITIONS[from] as readonly string[]).includes(to);
}

// ─── Core RFQ Document ──────────────────────────────────────────────────────

/** A single line item within an RFQ, linked to a SpecForge specification. */
export interface RfqLineItem {
  id: string;
  specForgeItemId?: string;         // SpecForge_Link
  specForgeItemCode?: string;
  title: string;
  description: string;
  quantity: number;                  // Must be > 0
  unit: string;                     // Unit of Measure
  specificationRef?: string;
}

/**
 * Weighted evaluation criteria for scoring Quote_Responses.
 * All weights are integer percentages (0–100) and MUST sum to exactly 100.
 */
export interface EvaluationCriteria {
  priceWeight: number;              // 0–100, integer
  leadTimeWeight: number;           // 0–100, integer
  bbeeWeight: number;               // 0–100, integer
  warrantyWeight: number;           // 0–100, integer
  performanceWeight: number;        // 0–100, integer
}

/** Supplier verification status sourced from the platform verification service. */
export type VerificationStatus = 'verified' | 'pending' | 'expired' | 'rejected';

/** A supplier invited to respond to an RFQ. */
export interface InvitedSupplier {
  supplierId: string;
  supplierName: string;
  tradeCategories: string[];
  verificationStatus: VerificationStatus;
  bbeeLevelNumber?: number;         // 1–8
  invitedAt: string;                // ISO 8601
}

/** The primary RFQ document stored at projects/{pid}/rfqs/{rfqId}. */
export interface RfqDocument {
  id: string;
  projectId: string;
  title: string;                    // max 150 chars
  description: string;              // max 2000 chars
  packageScopeId: string;
  packageScopeTitle: string;
  lineItems: RfqLineItem[];
  deliveryAddress: string;
  quoteDeadline: string;            // ISO 8601, ≥24h from creation
  evaluationCriteria: EvaluationCriteria;
  status: RfqStatus;
  invitationList: InvitedSupplier[];
  isPublicSector: boolean;
  localSpendTargetPct?: number;     // 0–100 percentage
  estimatedValue?: number;          // Rand value
  createdBy: string;
  createdAt: string;                // ISO 8601
  updatedAt: string;                // ISO 8601
  publishedAt?: string;             // ISO 8601
  awardedAt?: string;               // ISO 8601
  cancelledAt?: string;             // ISO 8601
}

// ─── Quote Response ─────────────────────────────────────────────────────────

/** Status of a supplier's quote submission. */
export type QuoteStatus = 'submitted' | 'superseded';

/** Allowed MIME types for quote attachments. */
export type QuoteAttachmentMimeType =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'image/jpeg'
  | 'image/png';

/** A file attachment on a Quote_Response (product data, certifications, warranty docs). */
export interface QuoteAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;                 // bytes, max 25MB (26_214_400)
  mimeType: QuoteAttachmentMimeType;
}

/** A single line-item price within a Quote_Response. */
export interface QuoteLineItem {
  rfqLineItemId: string;
  unitPrice: number;                // 0.01–999,999,999.99
  extendedPrice: number;            // unitPrice × quantity
  notes?: string;
}

/** A supplier's structured quote submission for an RFQ. */
export interface QuoteResponse {
  id: string;
  rfqId: string;
  supplierId: string;
  supplierName: string;
  lineItems: QuoteLineItem[];
  totalPrice: number;               // computed sum of extendedPrice values
  leadTimeDays: number;             // 1–730
  deliveryTerms: string;            // min 10 chars
  warrantyMonths?: number;
  attachments: QuoteAttachment[];
  revisionNumber: number;
  status: QuoteStatus;
  submittedAt: string;              // ISO 8601
}

// ─── Comparison Engine ──────────────────────────────────────────────────────

/** Raw metric values extracted from a quote for scoring. */
export interface RawScores {
  price: number;
  leadTime: number;
  bbee: number;
  warranty: number;
  performance: number;
}

/** Normalised scores (linear min-max) in the range [0, 100]. */
export interface NormalizedScores {
  price: number;        // 0–100
  leadTime: number;     // 0–100
  bbee: number;         // 0–100
  warranty: number;     // 0–100
  performance: number;  // 0–100
}

/** A scored and ranked quote produced by the Comparison Engine. */
export interface ScoredQuote {
  quoteId: string;
  supplierId: string;
  supplierName: string;
  rawScores: RawScores;
  normalizedScores: NormalizedScores;
  weightedScore: number;  // 0–100, two decimal places
  rank: number;
}

/** Cached comparison result stored at projects/{pid}/rfqs/{rfqId}/comparison. */
export interface ComparisonResult {
  scoredQuotes: ScoredQuote[];
  generatedAt: string;              // ISO 8601
}

// ─── Award Recommendation & Approval ────────────────────────────────────────

/** Status of an award recommendation through the approval gate. */
export type AwardRecommendationStatus =
  | 'pending_client'
  | 'pending_professional'
  | 'approved'
  | 'rejected';

/** Type of conflict-of-interest flag detected between supplier and project team. */
export type ConflictType = 'ownership' | 'directorship' | 'affiliation';

/** A detected conflict of interest between a supplier entity and a project team member. */
export interface ConflictFlag {
  type: ConflictType;
  supplierEntity: string;
  teamMemberName: string;
  teamMemberRole: string;
  acknowledged: boolean;
  acknowledgementJustification?: string; // min 100 chars when acknowledged
}

/** A recorded approval or rejection decision. */
export interface ApprovalRecord {
  approverId: string;
  approverName: string;
  decision: 'approved' | 'rejected';
  reason?: string;
  decidedAt: string;                // ISO 8601
}

/** Award recommendation record stored at projects/{pid}/rfqs/{rfqId}/award. */
export interface AwardRecommendation {
  id: string;
  rfqId: string;
  recommendedSupplierId: string;
  recommendedQuoteId: string;
  quotedPrice: number;
  justification: string;            // min 50 chars
  riskNotes?: string;
  comparedQuoteIds: string[];
  conflictOfInterestFlags: ConflictFlag[];
  clientApproval?: ApprovalRecord;
  professionalApproval?: ApprovalRecord;
  status: AwardRecommendationStatus;
  createdBy: string;
  createdAt: string;                // ISO 8601
}

// ─── Supplier Marketplace Profile ───────────────────────────────────────────

/** Past-performance metrics calculated from trailing 12-month platform data. */
export interface PerformanceMetrics {
  quoteAcceptanceRate: number;      // 0–100%
  onTimeDeliveryPct: number;        // 0–100%
  averageRating: number;            // 0–5
  metricsPeriodStart: string;       // ISO 8601
  metricsPeriodEnd: string;         // ISO 8601
}

/** Supplier's marketplace profile for discovery and invitation. */
export interface SupplierMarketplaceProfile {
  supplierId: string;
  firmName: string;
  tradeCategories: string[];        // 1–10
  deliveryRegions: string[];        // 1–9, SA provinces
  verificationStatus: VerificationStatus;
  bbeeLevelNumber?: number;         // 1–8
  bbeeCertificateExpiry?: string;   // ISO 8601
  performanceMetrics?: PerformanceMetrics;
  completedDeliveryCount: number;
}

// ─── Error Codes ────────────────────────────────────────────────────────────

/**
 * All RFQ Marketplace error codes used for validation and business rule enforcement.
 * These are returned in validation error responses for client and server-side handling.
 */
export const RFQ_ERROR_CODES = {
  // RFQ creation & configuration
  RFQ_TITLE_TOO_LONG: 'RFQ_TITLE_TOO_LONG',
  RFQ_DESCRIPTION_TOO_LONG: 'RFQ_DESCRIPTION_TOO_LONG',
  RFQ_NO_LINE_ITEMS: 'RFQ_NO_LINE_ITEMS',
  RFQ_DEADLINE_MISSING: 'RFQ_DEADLINE_MISSING',
  RFQ_DEADLINE_TOO_SOON: 'RFQ_DEADLINE_TOO_SOON',
  RFQ_WEIGHTS_INVALID: 'RFQ_WEIGHTS_INVALID',
  RFQ_BBEE_WEIGHT_LOW: 'RFQ_BBEE_WEIGHT_LOW',
  RFQ_NO_SUPPLIERS: 'RFQ_NO_SUPPLIERS',
  RFQ_MAX_SUPPLIERS: 'RFQ_MAX_SUPPLIERS',

  // Quote submission
  QUOTE_DEADLINE_PASSED: 'QUOTE_DEADLINE_PASSED',
  QUOTE_NOT_INVITED: 'QUOTE_NOT_INVITED',
  QUOTE_PRICE_OUT_OF_RANGE: 'QUOTE_PRICE_OUT_OF_RANGE',
  QUOTE_LEAD_TIME_INVALID: 'QUOTE_LEAD_TIME_INVALID',
  QUOTE_DELIVERY_TERMS_SHORT: 'QUOTE_DELIVERY_TERMS_SHORT',
  QUOTE_ATTACHMENT_TOO_LARGE: 'QUOTE_ATTACHMENT_TOO_LARGE',
  QUOTE_TOO_MANY_ATTACHMENTS: 'QUOTE_TOO_MANY_ATTACHMENTS',
  QUOTE_INVALID_FORMAT: 'QUOTE_INVALID_FORMAT',

  // Award & approval
  AWARD_JUSTIFICATION_SHORT: 'AWARD_JUSTIFICATION_SHORT',
  AWARD_CONFLICT_UNRESOLVED: 'AWARD_CONFLICT_UNRESOLVED',
  AWARD_CONFLICT_ACK_SHORT: 'AWARD_CONFLICT_ACK_SHORT',
  AWARD_BBEE_BLOCKED: 'AWARD_BBEE_BLOCKED',
  AWARD_QUOTE_SUPERSEDED: 'AWARD_QUOTE_SUPERSEDED',
  AWARD_CLIENT_REQUIRED: 'AWARD_CLIENT_REQUIRED',

  // Access control
  ACCESS_DENIED: 'ACCESS_DENIED',

  // Supplier profile
  PROFILE_NO_CATEGORIES: 'PROFILE_NO_CATEGORIES',
  PROFILE_NO_REGIONS: 'PROFILE_NO_REGIONS',
} as const;

/** Union type of all valid RFQ Marketplace error codes. */
export type RfqErrorCode = typeof RFQ_ERROR_CODES[keyof typeof RFQ_ERROR_CODES];

/**
 * Human-readable error messages keyed by error code.
 * Used for consistent user-facing validation messages.
 */
export const RFQ_ERROR_MESSAGES: Record<RfqErrorCode, string> = {
  RFQ_TITLE_TOO_LONG: 'RFQ title must be 150 characters or fewer',
  RFQ_DESCRIPTION_TOO_LONG: 'Description must be 2000 characters or fewer',
  RFQ_NO_LINE_ITEMS: 'At least one line item is required',
  RFQ_DEADLINE_MISSING: 'Quote deadline is required',
  RFQ_DEADLINE_TOO_SOON: 'Deadline must be at least 24 hours in the future',
  RFQ_WEIGHTS_INVALID: 'Evaluation criteria weights must sum to 100%',
  RFQ_BBEE_WEIGHT_LOW: 'B-BBEE weight must be at least 10% for public sector projects',
  RFQ_NO_SUPPLIERS: 'At least one supplier must be invited before publishing',
  RFQ_MAX_SUPPLIERS: 'Maximum 50 suppliers per invitation list',
  QUOTE_DEADLINE_PASSED: 'The quote deadline has passed',
  QUOTE_NOT_INVITED: 'You are not invited to this RFQ',
  QUOTE_PRICE_OUT_OF_RANGE: 'Unit price must be between R0.01 and R999,999,999.99',
  QUOTE_LEAD_TIME_INVALID: 'Lead time must be between 1 and 730 days',
  QUOTE_DELIVERY_TERMS_SHORT: 'Delivery terms must be at least 10 characters',
  QUOTE_ATTACHMENT_TOO_LARGE: 'Attachment must be 25MB or smaller',
  QUOTE_TOO_MANY_ATTACHMENTS: 'Maximum 10 attachments per quote',
  QUOTE_INVALID_FORMAT: 'Supported formats: PDF, DOCX, XLSX, JPG, PNG',
  AWARD_JUSTIFICATION_SHORT: 'Justification must be at least 50 characters',
  AWARD_CONFLICT_UNRESOLVED: 'All conflicts of interest must be addressed before approval',
  AWARD_CONFLICT_ACK_SHORT: 'Conflict justification must be at least 100 characters',
  AWARD_BBEE_BLOCKED: 'Supplier B-BBEE certificate must be valid before award',
  AWARD_QUOTE_SUPERSEDED: 'Recommendation must be reviewed against current supplier data',
  AWARD_CLIENT_REQUIRED: 'Client approval must be recorded first',
  ACCESS_DENIED: "You don't have permission for this action",
  PROFILE_NO_CATEGORIES: 'At least one trade category is required',
  PROFILE_NO_REGIONS: 'At least one delivery region is required',
};

// ─── Validation Error Types ─────────────────────────────────────────────────

/** A single validation error with code, message, and optional field reference. */
export interface RfqValidationError {
  code: RfqErrorCode;
  message: string;
  field?: string;
}

/** Result of a validation operation — either success or failure with errors. */
export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: RfqValidationError[] };

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum number of suppliers allowed on an invitation list. */
export const MAX_INVITATION_LIST_SIZE = 50;

/** Maximum number of attachments per quote response. */
export const MAX_QUOTE_ATTACHMENTS = 10;

/** Maximum attachment file size in bytes (25 MB). */
export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 26_214_400

/** Minimum hours in the future for a quote deadline. */
export const MIN_DEADLINE_HOURS_AHEAD = 24;

/** Maximum title length in characters. */
export const MAX_TITLE_LENGTH = 150;

/** Maximum description length in characters. */
export const MAX_DESCRIPTION_LENGTH = 2000;

/** Minimum unit price in Rand. */
export const MIN_UNIT_PRICE = 0.01;

/** Maximum unit price in Rand. */
export const MAX_UNIT_PRICE = 999_999_999.99;

/** Minimum lead time in calendar days. */
export const MIN_LEAD_TIME_DAYS = 1;

/** Maximum lead time in calendar days. */
export const MAX_LEAD_TIME_DAYS = 730;

/** Minimum delivery terms length in characters. */
export const MIN_DELIVERY_TERMS_LENGTH = 10;

/** Minimum justification length for award recommendation. */
export const MIN_JUSTIFICATION_LENGTH = 50;

/** Minimum length for conflict-of-interest acknowledgement justification. */
export const MIN_CONFLICT_ACK_LENGTH = 100;

/** Minimum B-BBEE weight percentage for public sector / high-value RFQs. */
export const MIN_BBEE_WEIGHT_PUBLIC_SECTOR = 10;

/** Estimated value threshold (Rand) above which B-BBEE minimum weight applies. */
export const BBEE_VALUE_THRESHOLD = 1_000_000;

/** Maximum number of trade categories per supplier profile. */
export const MAX_TRADE_CATEGORIES = 10;

/** Maximum number of delivery regions per supplier profile. */
export const MAX_DELIVERY_REGIONS = 9;

/** Allowed MIME types for quote attachments. */
export const ALLOWED_ATTACHMENT_MIME_TYPES: readonly QuoteAttachmentMimeType[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
] as const;

// ─── Role Access Types ──────────────────────────────────────────────────────

/** Roles that can create RFQs on a project. */
export type RfqCreationRole = 'architect' | 'quantity_surveyor' | 'contractor' | 'admin';

/** Roles that can create award recommendations. */
export type AwardRecommendationRole = 'quantity_surveyor' | 'architect' | 'contractor';

/** All roles permitted to create RFQs. */
export const RFQ_CREATION_ROLES: readonly RfqCreationRole[] = [
  'architect',
  'quantity_surveyor',
  'contractor',
  'admin',
] as const;

/** All roles permitted to create award recommendations. */
export const AWARD_RECOMMENDATION_ROLES: readonly AwardRecommendationRole[] = [
  'quantity_surveyor',
  'architect',
  'contractor',
] as const;
