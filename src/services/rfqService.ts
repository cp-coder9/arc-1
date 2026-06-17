// ─── Pack 12: RFQ Service ──────────────────────────────────────────────────
// Request for Quotation workflow — package creation, publication, addenda,
// bidder management, and evaluation lifecycle.
// Uses existing TenderPackage, Bid types from src/types.ts.

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TenderPackage, Bid, BidLineItem, TenderStatus, BidStatus } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Types ─────────────────────────────────────────────────────────────────

export type RfqStage =
  | 'scoping'
  | 'drafting'
  | 'review'
  | 'published'
  | 'accepting_bids'
  | 'evaluation'
  | 'awarded'
  | 'cancelled';

export type RfqMethod = 'open' | 'invited' | 'negotiated';

export interface RfqPackage extends Omit<TenderPackage, 'status'> {
  rfqNumber: string;               // Human-readable RFQ number
  method: RfqMethod;
  stage: RfqStage;
  returnables: string[];           // Required returnable documents
  invitedBidderIds: string[];      // For invited method
  addenda: RfqAddendum[];
  clarifications: RfqClarification[];
  evaluationCriteria: EvaluationCriterion[];
  publishedAt?: string;
  closedAt?: string;
  projectName: string;
  procurementCategory: string;
  siteAddress?: string;
}

export interface RfqAddendum {
  addendumId: string;
  addendumNumber: number;
  summary: string;
  detail: string;
  issuedAt: string;
  issuedBy: string;
}

export interface RfqClarification {
  clarificationId: string;
  bidderId: string;
  bidderName: string;
  question: string;
  answer?: string;
  material: boolean;               // Material = must be shared with all bidders
  askedAt: string;
  answeredAt?: string;
  answeredBy?: string;
}

export interface EvaluationCriterion {
  criterionId: string;
  name: string;
  weight: number;                  // 0-100, sum of all weights = 100
  description: string;
  scoringGuide: string;
}

export interface BidEvaluation {
  bidId: string;
  tenderPackageId: string;
  scores: Record<string, number>;  // criterionId -> score
  totalScore: number;
  weightedScore: number;
  evaluatorId: string;
  evaluatorNotes: string;
  evaluatedAt: string;
}

export interface TenderTimeline {
  publishedAt?: string;
  clarificationDeadline?: string;
  submissionDeadline: string;
  evaluationPeriod: string;        // e.g. '14 days after close'
  awardDate?: string;
  contractStart?: string;
  contractEnd?: string;
}

// ─── Service Functions ─────────────────────────────────────────────────────

let rfqCounter = 0;

/**
 * Create a new RFQ package.
 */
export async function createRfqPackage(input: {
  projectId: string;
  jobId: string;
  title: string;
  description: string;
  scope: string[];
  documents: { name: string; url: string }[];
  deadline: string;
  estimatedBudget?: number;
  requiredDisciplines: string[];
  requiredCertifications?: string[];
  method: RfqMethod;
  returnables: string[];
  invitedBidderIds?: string[];
  evaluationCriteria: Omit<EvaluationCriterion, 'criterionId'>[];
  createdBy: string;
  projectName: string;
  procurementCategory: string;
  siteAddress?: string;
}): Promise<RfqPackage> {
  rfqCounter++;
  const now = new Date().toISOString();
  const rfqNumber = `RFQ-${new Date().getFullYear()}-${String(rfqCounter).padStart(4, '0')}`;

  const addenda: RfqAddendum[] = [];
  const clarifications: RfqClarification[] = [];
  const criteriaWithIds: EvaluationCriterion[] = input.evaluationCriteria.map((c, i) => ({
    ...c,
    criterionId: `criterion-${i + 1}`,
  }));

  const rfqPackage: Omit<RfqPackage, 'id'> = {
    rfqNumber,
    projectId: input.projectId,
    jobId: input.jobId,
    title: input.title,
    description: input.description,
    scope: input.scope,
    documents: input.documents,
    deadline: input.deadline,
    estimatedBudget: input.estimatedBudget,
    requiredDisciplines: input.requiredDisciplines as RfqPackage['requiredDisciplines'],
    requiredCertifications: input.requiredCertifications,
    method: input.method,
    stage: 'drafting',
    returnables: input.returnables,
    invitedBidderIds: input.invitedBidderIds ?? [],
    addenda,
    clarifications,
    evaluationCriteria: criteriaWithIds,
    createdBy: input.createdBy,
    projectName: input.projectName,
    procurementCategory: input.procurementCategory,
    siteAddress: input.siteAddress,
    createdAt: now,
  };

  const docRef = await addDoc(getDemoCol( 'rfq_packages'), rfqPackage);
  return { ...rfqPackage, id: docRef.id };
}

/**
 * Publish an RFQ — moves from drafting to published and accepting bids.
 */
export async function publishRfq(rfqId: string, publishedBy: string): Promise<RfqPackage> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);

  const updates = {
    stage: 'published' as RfqStage,
    publishedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(ref, updates);

  return { ...snapshot.data(), ...updates, id: rfqId } as unknown as RfqPackage;
}

/**
 * Issue an addendum to an active RFQ.
 */
export async function issueAddendum(
  rfqId: string,
  summary: string,
  detail: string,
  issuedBy: string,
): Promise<RfqAddendum> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);

  const data = snapshot.data() as RfqPackage;
  const addendumNumber = data.addenda.length + 1;
  const addendum: RfqAddendum = {
    addendumId: `addendum-${rfqId}-${addendumNumber}`,
    addendumNumber,
    summary,
    detail,
    issuedAt: new Date().toISOString(),
    issuedBy,
  };

  await updateDoc(ref, {
    addenda: [...data.addenda, addendum],
    updatedAt: new Date().toISOString(),
  });

  return addendum;
}

/**
 * Submit a clarification question for an RFQ.
 */
export async function submitClarification(
  rfqId: string,
  bidderId: string,
  bidderName: string,
  question: string,
  material: boolean,
): Promise<RfqClarification> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);

  const data = snapshot.data() as RfqPackage;
  const clarification: RfqClarification = {
    clarificationId: `clarification-${rfqId}-${data.clarifications.length + 1}`,
    bidderId,
    bidderName,
    question,
    material,
    askedAt: new Date().toISOString(),
  };

  await updateDoc(ref, {
    clarifications: [...data.clarifications, clarification],
    updatedAt: new Date().toISOString(),
  });

  return clarification;
}

/**
 * Answer a clarification question.
 */
export async function answerClarification(
  rfqId: string,
  clarificationId: string,
  answer: string,
  answeredBy: string,
): Promise<RfqPackage> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);

  const data = snapshot.data() as RfqPackage;
  const updatedClarifications = data.clarifications.map((c) =>
    c.clarificationId === clarificationId
      ? { ...c, answer, answeredAt: new Date().toISOString(), answeredBy }
      : c
  );

  await updateDoc(ref, {
    clarifications: updatedClarifications,
    updatedAt: new Date().toISOString(),
  });

  return { ...data, clarifications: updatedClarifications, id: rfqId } as unknown as RfqPackage;
}

/**
 * Close bidding and move to evaluation stage.
 */
export async function closeBidding(rfqId: string): Promise<RfqPackage> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);

  const updates = {
    stage: 'evaluation' as RfqStage,
    closedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(ref, updates);

  return { ...snapshot.data(), ...updates, id: rfqId } as unknown as RfqPackage;
}

/**
 * Award an RFQ to a selected bid.
 */
export async function awardRfq(
  rfqId: string,
  bidId: string,
  contractorId: string,
): Promise<RfqPackage> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`RFQ ${rfqId} not found`);

  const updates = {
    stage: 'awarded' as RfqStage,
    awardedBidId: bidId,
    awardedContractorId: contractorId,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(ref, updates);

  // Update the bid status
  const bidRef = getDemoDoc( 'rfq_packages', rfqId, 'bids', bidId);
  await updateDoc(bidRef, { status: 'awarded' as BidStatus, updatedAt: new Date().toISOString() });

  // Mark other bids as rejected
  const bidsQ = query(getDemoCol( 'rfq_packages', rfqId, 'bids'), where('status', '==', 'submitted'));
  const bidsSnapshot = await getDocs(bidsQ);
  await Promise.all(
    bidsSnapshot.docs
      .filter((d) => d.id !== bidId)
      .map((d) => updateDoc(getDemoDoc( 'rfq_packages', rfqId, 'bids', d.id), { status: 'rejected' as BidStatus, updatedAt: new Date().toISOString() }))
  );

  return { ...snapshot.data(), ...updates, id: rfqId } as unknown as RfqPackage;
}

/**
 * Get a single RFQ package by ID.
 */
export async function getRfqPackage(rfqId: string): Promise<RfqPackage | null> {
  const ref = getDemoDoc( 'rfq_packages', rfqId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return { ...snapshot.data(), id: rfqId } as unknown as RfqPackage;
}

/**
 * Get all RFQs for a project.
 */
export async function getProjectRfqs(projectId: string): Promise<RfqPackage[]> {
  const q = query(getDemoCol( 'rfq_packages'), where('projectId', '==', projectId), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as unknown as RfqPackage));
}

/**
 * Get all bids for an RFQ.
 */
export async function getBidsForRfq(rfqId: string): Promise<Bid[]> {
  const q = query(getDemoCol( 'rfq_packages', rfqId, 'bids'), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Bid));
}

/**
 * Validate returnables submitted with a bid.
 */
export function validateReturnables(
  rfq: RfqPackage,
  submittedReturnables: string[],
): { compliant: boolean; missingReturnables: string[] } {
  const missingReturnables = rfq.returnables.filter((r) => !submittedReturnables.includes(r));
  return {
    compliant: missingReturnables.length === 0,
    missingReturnables,
  };
}
