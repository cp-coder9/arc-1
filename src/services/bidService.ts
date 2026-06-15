// ─── Pack 12: Bid Service ──────────────────────────────────────────────────
// Bid submission, evaluation, comparison, and award recommendation.
// Uses existing Bid, BidLineItem types from src/types.ts.

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Bid, BidLineItem, BidStatus } from '@/types';
import type { RfqPackage, BidEvaluation, EvaluationCriterion } from '@/services/rfqService';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Types ─────────────────────────────────────────────────────────────────

export interface BidSubmissionInput {
  tenderPackageId: string;
  contractorId: string;
  contractorName: string;
  totalAmount: number;
  lineItems: BidLineItem[];
  proposedTimeline: string;
  proposedStartDate: string;
  methodology: string;
  qualifications: string;
  attachments: { name: string; url: string }[];
  verificationId: string;
  submittedReturnables: string[];
}

export interface BidComparisonResult {
  rfqId: string;
  bids: Array<{
    bid: Bid;
    totalScore: number;
    priceScore: number;
    technicalScore: number;
    complianceScore: number;
  }>;
  rankings: string[];         // bidId sorted best-to-worst
  recommendation: {
    recommendedBidId: string;
    rationale: string;
    requiresApproval: boolean;
  };
}

export interface BidderInfo {
  contractorId: string;
  contractorName: string;
  cidbGrading?: string;
  averageRating: number;
  completedJobs: number;
  previouslyEngaged: boolean;
  blacklisted: boolean;
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PRICE_WEIGHT = 0.40;
const TECHNICAL_WEIGHT = 0.35;
const COMPLIANCE_WEIGHT = 0.25;

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Submit a new bid for an RFQ/tender package.
 * Validates that the Rfq is still accepting bids.
 */
export async function submitBid(input: BidSubmissionInput): Promise<Bid> {
  // Validate RFQ is accepting bids
  const rfqRef = getDemoDoc( 'rfq_packages', input.tenderPackageId);
  const rfqSnapshot = await getDoc(rfqRef);
  if (!rfqSnapshot.exists()) throw new Error(`Rfq ${input.tenderPackageId} not found`);
  const rfq = rfqSnapshot.data() as RfqPackage;

  if (rfq.stage !== 'published' && rfq.stage !== 'accepting_bids') {
    throw new Error(`Rfq ${input.tenderPackageId} is not accepting bids (stage: ${rfq.stage})`);
  }

  // Check for duplicate bid
  const existingQ = query(
    getDemoCol( 'rfq_packages', input.tenderPackageId, 'bids'),
    where('contractorId', '==', input.contractorId),
    where('status', 'in', ['submitted', 'shortlisted'] as BidStatus[]),
  );
  const existingSnapshot = await getDocs(existingQ);
  if (!existingSnapshot.empty) {
    throw new Error(`Contractor ${input.contractorName} already has an active bid for this Rfq`);
  }

  const now = new Date().toISOString();
  const bid: Omit<Bid, 'id'> = {
    tenderPackageId: input.tenderPackageId,
    contractorId: input.contractorId,
    contractorName: input.contractorName,
    totalAmount: input.totalAmount,
    lineItems: input.lineItems,
    proposedTimeline: input.proposedTimeline,
    proposedStartDate: input.proposedStartDate,
    methodology: input.methodology,
    qualifications: input.qualifications,
    attachments: input.attachments,
    verificationId: input.verificationId,
    status: 'submitted',
    createdAt: now,
    updatedAt: now,
  };

  const docRef = await addDoc(getDemoCol( 'rfq_packages', input.tenderPackageId, 'bids'), bid);
  return { ...bid, id: docRef.id };
}

/**
 * Withdraw a bid before evaluation.
 */
export async function withdrawBid(
  tenderPackageId: string,
  bidId: string,
): Promise<Bid> {
  const ref = getDemoDoc( 'rfq_packages', tenderPackageId, 'bids', bidId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`Bid ${bidId} not found`);

  const updates = { status: 'withdrawn' as BidStatus, updatedAt: new Date().toISOString() };
  await updateDoc(ref, updates);

  return { ...snapshot.data(), ...updates, id: bidId } as Bid;
}

/**
 * Evaluate a single bid against evaluation criteria.
 */
export async function evaluateBid(
  rfqId: string,
  bidId: string,
  scores: Record<string, number>,
  evaluatorId: string,
  evaluatorNotes: string,
): Promise<BidEvaluation> {
  const rfqRef = getDemoDoc( 'rfq_packages', rfqId);
  const rfqSnapshot = await getDoc(rfqRef);
  if (!rfqSnapshot.exists()) throw new Error(`Rfq ${rfqId} not found`);
  const rfq = rfqSnapshot.data() as RfqPackage;

  // Validate scores against criteria
  const criteriaIds = rfq.evaluationCriteria.map((c) => c.criterionId);
  const missingCriteria = criteriaIds.filter((id) => !(id in scores));
  if (missingCriteria.length > 0) {
    throw new Error(`Missing scores for criteria: ${missingCriteria.join(', ')}`);
  }

  // Calculate total and weighted scores
  let totalScore = 0;
  let weightedScore = 0;
  for (const criterion of rfq.evaluationCriteria) {
    const score = scores[criterion.criterionId] ?? 0;
    totalScore += score;
    weightedScore += score * (criterion.weight / 100);
  }

  const evaluation: BidEvaluation = {
    bidId,
    tenderPackageId: rfqId,
    scores,
    totalScore,
    weightedScore: Math.round(weightedScore * 100) / 100,
    evaluatorId,
    evaluatorNotes,
    evaluatedAt: new Date().toISOString(),
  };

  // Persist evaluation
  const evalRef = getDemoCol( 'rfq_packages', rfqId, 'bids', bidId, 'evaluations');
  await addDoc(evalRef, evaluation);

  // Update bid with AI score
  const bidRef = getDemoDoc( 'rfq_packages', rfqId, 'bids', bidId);
  await updateDoc(bidRef, {
    aiScore: Math.round(weightedScore),
    aiNotes: evaluatorNotes,
    updatedAt: new Date().toISOString(),
  });

  return evaluation;
}

/**
 * Compare all bids for an RFQ and generate a ranked comparison.
 */
export async function compareBids(rfqId: string): Promise<BidComparisonResult> {
  const rfq = await getDoc(getDemoDoc( 'rfq_packages', rfqId));
  if (!rfq.exists()) throw new Error(`Rfq ${rfqId} not found`);
  const rfqData = rfq.data() as RfqPackage;

  const bidsSnapshot = await getDocs(
    query(getDemoCol( 'rfq_packages', rfqId, 'bids'), where('status', '==', 'submitted')),
  );
  const bids = bidsSnapshot.docs.map((d) => ({ ...d.data(), id: d.id } as Bid));

  if (bids.length === 0) {
    throw new Error('No submitted bids to compare');
  }

  // Calculate scores for each bid
  const maxPrice = Math.max(...bids.map((b) => b.totalAmount));
  const evaluated = bids.map((bid) => {
    const priceScore = maxPrice > 0
      ? Math.round((1 - bid.totalAmount / maxPrice) * 100)
      : 100;

    const technicalScore = bid.lineItems.length > 0
      ? Math.min(100, bid.lineItems.length * 10)
      : 50;

    const complianceScore = calculateComplianceScore(bid);

    const totalScore = Math.round(
      priceScore * PRICE_WEIGHT +
      technicalScore * TECHNICAL_WEIGHT +
      complianceScore * COMPLIANCE_WEIGHT
    );

    return { bid, totalScore, priceScore, technicalScore, complianceScore };
  });

  // Sort by total score descending
  evaluated.sort((a, b) => b.totalScore - a.totalScore);
  const rankings = evaluated.map((e) => e.bid.id);

  // Generate recommendation
  const best = evaluated[0];
  const runnerUp = evaluated[1];

  let rationale: string;
  if (evaluated.length === 1) {
    rationale = `Single bid received from ${best.bid.contractorName}. Manual review recommended before award.`;
  } else {
    rationale = [
      `${best.bid.contractorName} ranked highest with a score of ${best.totalScore}/100.`,
      `Price: ${formatCurrency(best.bid.totalAmount)} (score: ${best.priceScore})`,
      runnerUp ? `Runner-up: ${runnerUp.bid.contractorName} (score: ${runnerUp.totalScore})` : '',
      'This is a decision-support recommendation. Professional review and approval are required before award.',
    ].filter(Boolean).join(' ');
  }

  const requiresApproval = best.priceScore < 60 || (rfqData.estimatedBudget != null && best.bid.totalAmount > rfqData.estimatedBudget);

  return {
    rfqId,
    bids: evaluated,
    rankings,
    recommendation: {
      recommendedBidId: best.bid.id,
      rationale,
      requiresApproval,
    },
  };
}

/**
 * Shortlist bids for further evaluation.
 */
export async function shortlistBids(
  rfqId: string,
  bidIds: string[],
): Promise<void> {
  const allBids = await getDocs(
    query(getDemoCol( 'rfq_packages', rfqId, 'bids'), where('status', '==', 'submitted')),
  );

  await Promise.all(
    allBids.docs.map((d) => {
      const newStatus: BidStatus = bidIds.includes(d.id) ? 'shortlisted' : 'rejected';
      return updateDoc(getDemoDoc( 'rfq_packages', rfqId, 'bids', d.id), {
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
    }),
  );
}

/**
 * Get a single bid by ID.
 */
export async function getBid(
  tenderPackageId: string,
  bidId: string,
): Promise<Bid | null> {
  const ref = getDemoDoc( 'rfq_packages', tenderPackageId, 'bids', bidId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { ...snapshot.data(), id: bidId } as Bid;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Calculate compliance score based on a bid's completeness.
 */
function calculateComplianceScore(bid: Bid): number {
  let score = 50; // baseline

  if (bid.lineItems.length > 0) score += 10;
  if (bid.proposedTimeline) score += 10;
  if (bid.methodology && bid.methodology.length > 10) score += 10;
  if (bid.qualifications) score += 10;
  if (bid.attachments.length > 0) score += 10;

  return Math.min(score, 100);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
}
