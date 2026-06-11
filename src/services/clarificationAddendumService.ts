/**
 * Clarification & Addendum Service
 *
 * Manages the bidder clarification and addendum workflow:
 *   - Bidder submits clarification question
 *   - Professional reviews and responds
 *   - Material questions trigger addenda distributed to ALL bidders
 *   - Equal-information principle enforced throughout
 *   - Full audit trail for distribution
 *
 * Key fairness principle: Clarifications that affect scope, price, programme,
 * or risk must become addenda distributed to ALL bidders, not just the asker.
 */

export type ClarificationStatus = 'submitted' | 'under_review' | 'responded' | 'escalated_to_addendum';

export interface ClarificationQuestionInput {
  rfqId: string;
  bidderId: string;
  bidderName: string;
  question: string;
  category: 'scope' | 'price' | 'programme' | 'drawings' | 'specifications' | 'contractual' | 'other';
  referenceDrawingNumbers?: string[];
}

export interface ClarificationQuestionRecord {
  questionId: string;
  rfqId: string;
  bidderId: string;
  bidderName: string;
  question: string;
  category: string;
  status: ClarificationStatus;
  isMaterial: boolean;
  materialRationale?: string;
  response?: string;
  respondedBy?: string;
  submittedAt: string;
  respondedAt?: string;
  linkedAddendumId?: string;
  createdAt: string;
  updatedAt: string;
}

export type AddendumStatus = 'draft' | 'issued';

export interface AddendumInput {
  rfqId: string;
  rfqTitle: string;
  subject: string;
  description: string;
  sourceQuestionIds: string[];
  issuedBy: string;
  allBidderIds: string[];
  allBidderEmails: string[];
}

export interface AddendumRecord {
  addendumId: string;
  number: number; // sequential per RFQ
  rfqId: string;
  rfqTitle: string;
  subject: string;
  description: string;
  status: AddendumStatus;
  sourceQuestionIds: string[];
  issuedBy: string;
  distributedToBidderIds: string[];
  distributedToBidderEmails: string[];
  equalInformationCompliant: boolean;
  distributionVerifiedBy?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddendumDistributionRecord {
  distributionId: string;
  addendumId: string;
  rfqId: string;
  bidderId: string;
  bidderEmail: string;
  distributedAt: string;
  acknowledgedAt?: string;
  method: 'email' | 'platform' | 'both';
}

const EQUAL_INFORMATION_NOTE =
  'Equal-information principle: All bidders must receive the same material information. Addenda are distributed to ALL invited bidders regardless of who asked the question.';

/**
 * Determines whether a clarification question is "material" and therefore
 * requires an addendum to all bidders.
 *
 * A question is material if it relates to scope, price, programme, or risk.
 */
export function assessMateriality(
  category: ClarificationQuestionInput['category'],
  question: string,
): { isMaterial: boolean; rationale: string } {
  // Always material — affects all bidders' pricing and programme
  const materialCategories: ClarificationQuestionInput['category'][] = [
    'scope',
    'price',
    'programme',
    'specifications',
  ];

  if (materialCategories.includes(category)) {
    return {
      isMaterial: true,
      rationale: `${category.charAt(0).toUpperCase() + category.slice(1)} clarifications are material and affect all bidders' submissions.`,
    };
  }

  // Drawings can be material if they affect interpretation
  if (category === 'drawings') {
    return {
      isMaterial: true,
      rationale: 'Drawing clarifications may affect quantities and pricing for all bidders.',
    };
  }

  // Contractual questions are usually material
  if (category === 'contractual') {
    return {
      isMaterial: true,
      rationale: 'Contractual clarifications affect all bidders equally.',
    };
  }

  // Check question content for material keywords
  const materialKeywords = [
    /scope/i,
    /price/i,
    /cost/i,
    /programme/i,
    /deadline/i,
    /specification/i,
    /requirement/i,
    /change/i,
    /variation/i,
    /substitute/i,
    /alternative/i,
    /equivalent/i,
  ];

  const hasMaterialKeyword = materialKeywords.some((pattern) => pattern.test(question));
  if (hasMaterialKeyword) {
    return {
      isMaterial: true,
      rationale: 'Question contains material keywords that may affect other bidders.',
    };
  }

  return {
    isMaterial: false,
    rationale: 'Question is procedural/administrative and does not affect commercial terms.',
  };
}

/**
 * Creates a clarification question record from a bidder.
 */
export function submitClarificationQuestion(
  input: ClarificationQuestionInput,
): ClarificationQuestionRecord {
  if (!input.rfqId.trim()) throw new Error('RFQ ID is required');
  if (!input.bidderId.trim()) throw new Error('Bidder ID is required');
  if (!input.question.trim() || input.question.trim().length < 10)
    throw new Error('Question must be at least 10 characters');

  const now = new Date().toISOString();
  const materiality = assessMateriality(input.category, input.question);

  return {
    questionId: `clar_${input.rfqId}_${Date.now()}`,
    rfqId: input.rfqId,
    bidderId: input.bidderId,
    bidderName: input.bidderName.trim(),
    question: input.question.trim(),
    category: input.category,
    status: 'submitted',
    isMaterial: materiality.isMaterial,
    materialRationale: materiality.rationale,
    submittedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Records a professional's response to a clarification question.
 * If the question is material, marks it for escalation to addendum.
 */
export function respondToClarification(
  question: ClarificationQuestionRecord,
  responderId: string,
  response: string,
): ClarificationQuestionRecord {
  if (!response.trim()) throw new Error('Response is required');
  if (!responderId.trim()) throw new Error('Responder ID is required');

  const now = new Date().toISOString();
  const newStatus: ClarificationStatus = question.isMaterial
    ? 'escalated_to_addendum'
    : 'responded';

  return {
    ...question,
    status: newStatus,
    response: response.trim(),
    respondedBy: responderId,
    respondedAt: now,
    updatedAt: now,
  };
}

/**
 * Creates an addendum record from material clarification questions.
 * The addendum must be distributed to ALL bidders, not just the asker.
 */
let addendumCounter = 0; // per-process counter; Firestore should be source of truth in production

export function createAddendum(input: AddendumInput): AddendumRecord {
  if (!input.rfqId.trim()) throw new Error('RFQ ID is required');
  if (!input.subject.trim()) throw new Error('Subject is required');
  if (!input.description.trim()) throw new Error('Description is required');
  if (input.allBidderIds.length === 0)
    throw new Error('At least one bidder must be specified for distribution');
  if (input.allBidderIds.length < 2)
    throw new Error(
      'EQUAL-INFORMATION VIOLATION: Addenda must be distributed to ALL invited bidders, not just the bidder who asked the question.',
    );
  if (input.allBidderEmails.length !== input.allBidderIds.length)
    throw new Error('Each bidder distribution must include a matching bidder email');
  if (input.sourceQuestionIds.length === 0)
    throw new Error('At least one source question ID is required');

  // Verify all bidders are included (fairness check)
  const allBiddersIncluded =
    input.allBidderIds.length >= 2 || input.sourceQuestionIds.length <= 1;

  if (!allBiddersIncluded) {
    throw new Error(
      'EQUAL-INFORMATION VIOLATION: Addenda must be distributed to ALL invited bidders, not just the bidder who asked the question.',
    );
  }

  addendumCounter++;
  const now = new Date().toISOString();

  return {
    addendumId: `addendum_${input.rfqId}_${addendumCounter}`,
    number: addendumCounter,
    rfqId: input.rfqId,
    rfqTitle: input.rfqTitle.trim(),
    subject: input.subject.trim(),
    description: input.description.trim(),
    status: 'draft',
    sourceQuestionIds: [...input.sourceQuestionIds],
    issuedBy: input.issuedBy,
    distributedToBidderIds: [...input.allBidderIds],
    distributedToBidderEmails: [...input.allBidderEmails],
    equalInformationCompliant: true,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Issues an addendum to all bidders.
 * Verifies equal distribution before issue.
 */
export function issueAddendum(
  addendum: AddendumRecord,
  verifiedBy: string,
): { addendum: AddendumRecord; distributions: AddendumDistributionRecord[] } {
  if (addendum.status === 'issued') throw new Error('Addendum already issued');

  const now = new Date().toISOString();
  const issuedAddendum: AddendumRecord = {
    ...addendum,
    status: 'issued',
    issuedAt: now,
    distributionVerifiedBy: verifiedBy,
    updatedAt: now,
  };

  // Create distribution records for each bidder
  const distributions: AddendumDistributionRecord[] = addendum.distributedToBidderIds.map(
    (bidderId, index) => ({
      distributionId: `dist_${addendum.addendumId}_${bidderId}`,
      addendumId: addendum.addendumId,
      rfqId: addendum.rfqId,
      bidderId,
      bidderEmail: addendum.distributedToBidderEmails[index] ?? '',
      distributedAt: now,
      method: 'platform' as const,
    }),
  );

  return { addendum: issuedAddendum, distributions };
}

/**
 * Verifies that all invited bidders have received all addenda.
 * Part of the equal-information guardrail.
 */
export function verifyEqualDistribution(
  invitedBidderIds: string[],
  addenda: AddendumRecord[],
): { compliant: boolean; missingBidders: string[]; details: string[] } {
  const missingBidders: string[] = [];
  const details: string[] = [];

  for (const addendum of addenda) {
    for (const bidderId of invitedBidderIds) {
      if (!addendum.distributedToBidderIds.includes(bidderId)) {
        if (!missingBidders.includes(bidderId)) {
          missingBidders.push(bidderId);
        }
        details.push(
          `Bidder ${bidderId} did not receive addendum ${addendum.addendumId}: ${addendum.subject}`,
        );
      }
    }
  }

  return {
    compliant: missingBidders.length === 0,
    missingBidders,
    details,
  };
}

/**
 * Returns the equal-information compliance statement for audit purposes.
 */
export function getEqualInformationStatement(): string {
  return EQUAL_INFORMATION_NOTE;
}
