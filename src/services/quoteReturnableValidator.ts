/**
 * Quote Returnable Validator
 *
 * Validates bidder quote submissions against RFQ returnable requirements:
 *   - Completeness check against mandatory returnables
 *   - Format validation
 *   - Mandatory field validation
 *   - Risk flag identification
 *   - Exclusions and qualifications visibility enforcement
 *
 * Guardrail: Quote exclusions/qualifications must be visible, not hidden.
 * AI may validate returnables but cannot award.
 */

import type { RfqReturnable } from './rfqPackageBuilder';

export type QuoteSubmissionStatus =
  | 'draft'
  | 'submitted'
  | 'non_compliant'
  | 'compliant'
  | 'recommended'
  | 'appointment_pending_approval';

export interface QuoteReturnableItem {
  returnableId: string;
  provided: boolean;
  fileName?: string;
  format?: string;
  notes?: string;
}

export interface QuoteSubmissionInput {
  rfqId: string;
  bidderId: string;
  bidderName: string;
  priceZar: number;
  leadTimeWeeks: number;
  exclusions: string[];
  qualifications: string[];
  returnables: QuoteReturnableItem[];
  programmeSummary: string;
  methodologySummary: string;
  validUntilIso: string;
  submittedAtIso: string;
}

export interface QuoteSubmissionRecord {
  quoteId: string;
  rfqId: string;
  bidderId: string;
  bidderName: string;
  priceZar: number;
  leadTimeWeeks: number;
  exclusions: string[];
  qualifications: string[];
  returnables: QuoteReturnableItem[];
  programmeSummary: string;
  methodologySummary: string;
  validUntilIso: string;
  submittedAtIso: string;
  status: QuoteSubmissionStatus;
  createdAt: string;
}

export interface QuoteValidationResult {
  quoteId: string;
  status: QuoteSubmissionStatus;
  compliant: boolean;
  completenessScore: number; // 0-1
  mandatoryReturnablesProvided: number;
  mandatoryReturnablesTotal: number;
  missingReturnables: string[];
  formatIssues: string[];
  exclusionFlags: string[];
  qualificationWarnings: string[];
  riskFlags: string[];
  priceAnomaly?: string;
  leadTimeAnomaly?: string;
  validationNotes: string;
  humanReviewRequired: boolean;
}

const EXCLUSION_RISK_KEYWORDS = [
  /not included/i,
  /excluded/i,
  /exclusion/i,
  /not allowed/i,
  /not permitted/i,
  /outside scope/i,
  /additional cost/i,
  /extra over/i,
  /daywork/i,
  /provisional/i,
  /allowance/i,
  /prime cost/i,
  /pc sum/i,
];

const QUALIFICATION_RISK_KEYWORDS = [
  /subject to/i,
  /conditional/i,
  /dependent/i,
  /assuming/i,
  /provided that/i,
  /on condition/i,
  /if.*then/i,
  /pending/i,
  /estimated/i,
];

/**
 * Validates a quote submission against required returnables and guardrails.
 */
export function validateQuoteSubmission(
  quote: QuoteSubmissionInput,
  requiredReturnables: RfqReturnable[],
  budgetEstimateZar?: number,
): QuoteValidationResult {
  const missingReturnables: string[] = [];
  const formatIssues: string[] = [];
  const exclusionFlags: string[] = [];
  const qualificationWarnings: string[] = [];
  const riskFlags: string[] = [];

  // Check mandatory returnables
  const mandatoryReturnables = requiredReturnables.filter((r) => r.mandatory);
  let mandatoryReturnablesProvided = 0;

  for (const required of mandatoryReturnables) {
    const provided = quote.returnables.find((r) => r.returnableId === required.id);
    if (!provided || !provided.provided) {
      missingReturnables.push(`${required.name}: ${required.description}`);
    } else {
      mandatoryReturnablesProvided++;
      if (required.format && provided.format && required.format !== provided.format) {
        formatIssues.push(
          `${required.name}: expected ${required.format}, received ${provided.format}`,
        );
      }
    }
  }

  const mandatoryReturnablesTotal = mandatoryReturnables.length;
  const completenessScore =
    mandatoryReturnablesTotal > 0
      ? mandatoryReturnablesProvided / mandatoryReturnablesTotal
      : 1;

  // Flag exclusions for visibility (Guardrail: exclusions must be visible)
  for (const exclusion of quote.exclusions) {
    const matchedKeywords = EXCLUSION_RISK_KEYWORDS.filter((k) => k.test(exclusion));
    if (matchedKeywords.length > 0) {
      exclusionFlags.push(
        `Exclusion flag: "${exclusion}" — may affect scope or price comparability`,
      );
    }
  }

  // Flag qualifications for visibility
  for (const qualification of quote.qualifications) {
    const matchedKeywords = QUALIFICATION_RISK_KEYWORDS.filter((k) =>
      k.test(qualification),
    );
    if (matchedKeywords.length > 0) {
      qualificationWarnings.push(
        `Qualification warning: "${qualification}" — submission may be conditional`,
      );
    }
  }

  // Price anomaly check
  let priceAnomaly: string | undefined;
  if (quote.priceZar <= 0) {
    riskFlags.push('Price is zero or negative — requires verification');
    priceAnomaly = 'Price is zero or negative';
  } else if (budgetEstimateZar && quote.priceZar > budgetEstimateZar * 1.5) {
    riskFlags.push(`Price (R${quote.priceZar.toLocaleString()}) exceeds 150% of budget`);
    priceAnomaly = 'Price significantly exceeds budget estimate';
  } else if (budgetEstimateZar && quote.priceZar < budgetEstimateZar * 0.5) {
    riskFlags.push(
      `Price (R${quote.priceZar.toLocaleString()}) is below 50% of budget — scope may be incomplete`,
    );
    priceAnomaly = 'Price significantly below budget — scope check recommended';
  }

  // Lead time anomaly
  let leadTimeAnomaly: string | undefined;
  if (quote.leadTimeWeeks <= 0) {
    riskFlags.push('Lead time is zero or negative — requires verification');
    leadTimeAnomaly = 'Lead time is zero or negative';
  } else if (quote.leadTimeWeeks > 52) {
    riskFlags.push('Lead time exceeds 52 weeks — programme risk');
    leadTimeAnomaly = 'Lead time exceeds 52 weeks';
  }

  // Validity check
  const validUntil = Date.parse(quote.validUntilIso);
  if (Number.isNaN(validUntil)) {
    riskFlags.push('Invalid validity date');
  } else if (validUntil <= Date.now()) {
    riskFlags.push('Quote validity has expired');
  }

  // Submission date check
  const submittedAt = Date.parse(quote.submittedAtIso);
  if (Number.isNaN(submittedAt)) {
    riskFlags.push('Invalid submission date');
  }

  const compliant = missingReturnables.length === 0 && formatIssues.length === 0;
  const status: QuoteSubmissionStatus = compliant ? 'compliant' : 'non_compliant';

  const validationNotes = compliant
    ? 'Quote is compliant with all mandatory returnables. Ready for comparison.'
    : `Quote is non-compliant. ${missingReturnables.length} missing returnable(s), ${formatIssues.length} format issue(s).`;

  return {
    quoteId: quote.rfqId + '_' + quote.bidderId,
    status,
    compliant,
    completenessScore: Math.round(completenessScore * 100) / 100,
    mandatoryReturnablesProvided,
    mandatoryReturnablesTotal,
    missingReturnables,
    formatIssues,
    exclusionFlags,
    qualificationWarnings,
    riskFlags: [...new Set(riskFlags)],
    priceAnomaly,
    leadTimeAnomaly,
    validationNotes,
    humanReviewRequired: !compliant || exclusionFlags.length > 0 || qualificationWarnings.length > 0,
  };
}

/**
 * Creates a quote submission record.
 */
export function createQuoteSubmission(input: QuoteSubmissionInput): QuoteSubmissionRecord {
  if (!input.rfqId.trim()) throw new Error('RFQ ID is required');
  if (!input.bidderId.trim()) throw new Error('Bidder ID is required');
  if (input.priceZar < 0 || !Number.isFinite(input.priceZar))
    throw new Error('Price must be a non-negative number');
  if (input.leadTimeWeeks < 0) throw new Error('Lead time must be non-negative');

  const now = new Date().toISOString();

  return {
    quoteId: `quote_${input.rfqId}_${input.bidderId}`,
    rfqId: input.rfqId,
    bidderId: input.bidderId,
    bidderName: input.bidderName.trim(),
    priceZar: input.priceZar,
    leadTimeWeeks: input.leadTimeWeeks,
    exclusions: input.exclusions ?? [],
    qualifications: input.qualifications ?? [],
    returnables: input.returnables ?? [],
    programmeSummary: input.programmeSummary.trim(),
    methodologySummary: input.methodologySummary.trim(),
    validUntilIso: input.validUntilIso,
    submittedAtIso: input.submittedAtIso,
    status: 'submitted',
    createdAt: now,
  };
}
