// ─── Pack 11: Trust Service ────────────────────────────────────────────────
// Trust scoring, reputation management, and verification status tracking.
// Integrates with Firestore and existing UserVerification types.

import { collection, doc, getDoc, getDocs, addDoc, updateDoc, query, where, increment, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UserVerification, VerificationStatus } from '@/types';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Types ─────────────────────────────────────────────────────────────────

export type TrustLevel = 'low' | 'medium' | 'high' | 'verified';

export interface TrustScore {
  userId: string;
  overallScore: number;           // 0-100
  verificationScore: number;      // 0-100
  reputationScore: number;        // 0-100
  completionScore: number;        // 0-100
  timelinessScore: number;        // 0-100
  trustLevel: TrustLevel;
  lastCalculatedAt: string;
}

export interface ReputationRecord {
  reputationId: string;
  userId: string;
  averageRating: number;
  totalReviews: number;
  completedJobs: number;
  onTimeCompletionRate: number;   // 0-100
  onBudgetRate: number;           // 0-100
  disputeCount: number;
  lastUpdatedAt: string;
}

export interface VerificationChecklist {
  checklistId: string;
  userId: string;
  items: VerificationChecklistItem[];
  overallStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationChecklistItem {
  itemId: string;
  label: string;
  required: boolean;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
  notes?: string;
}

// ─── Service Functions ─────────────────────────────────────────────────────

/**
 * Calculate a comprehensive trust score for a user based on
 * verification status, reputation, completion history, and timeliness.
 */
export async function calculateTrustScore(userId: string): Promise<TrustScore> {
  const [verification, reputation] = await Promise.all([
    getLatestVerification(userId),
    getReputation(userId),
  ]);

  // Verification sub-score (0-100)
  const verificationScore = verification
    ? verification.status === 'verified' ? 85
      : verification.status === 'pending' ? 40
      : verification.status === 'expired' ? 25
      : 0
    : 0;

  // Reputation sub-score (0-100)
  const reputationScore = reputation
    ? Math.round(
        (reputation.averageRating / 5) * 40 +
        Math.min(reputation.onTimeCompletionRate, 100) * 0.3 +
        Math.min(reputation.onBudgetRate, 100) * 0.2 +
        Math.max(0, 100 - reputation.disputeCount * 20) * 0.1
      )
    : 0;

  // Completion sub-score (0-100) based on completed jobs
  const completionScore = reputation
    ? Math.min(reputation.completedJobs * 5, 100)
    : 0;

  // Timeliness sub-score (0-100)
  const timelinessScore = reputation
    ? Math.round(reputation.onTimeCompletionRate)
    : 0;

  // Overall weighted score
  const overallScore = Math.round(
    verificationScore * 0.40 +
    reputationScore * 0.30 +
    completionScore * 0.15 +
    timelinessScore * 0.15
  );

  const trustLevel = trustLevelForScore(overallScore);

  // Persist the trust score
  const trustRef = getDemoCol( 'trust_scores');
  const q = query(trustRef, where('userId', '==', userId));
  const existing = await getDocs(q);

  const trustScore: TrustScore = {
    userId,
    overallScore,
    verificationScore,
    reputationScore,
    completionScore,
    timelinessScore,
    trustLevel,
    lastCalculatedAt: new Date().toISOString(),
  };

  if (existing.docs.length > 0) {
    await updateDoc(getDemoDoc( 'trust_scores', existing.docs[0].id), trustScore as unknown as Record<string, unknown>);
  } else {
    await addDoc(trustRef, trustScore);
  }

  return trustScore;
}

/**
 * Get the current trust score for a user.
 */
export async function getTrustScore(userId: string): Promise<TrustScore | null> {
  const q = query(getDemoCol( 'trust_scores'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as TrustScore;
}

/**
 * Update reputation metrics when a job is completed or reviewed.
 */
export async function updateReputation(input: {
  userId: string;
  reviewRating: number;
  completedOnTime: boolean;
  completedOnBudget: boolean;
  disputeFiled: boolean;
}): Promise<ReputationRecord> {
  const current = await getReputation(input.userId);
  const totalReviews = (current?.totalReviews ?? 0) + 1;
  const completedJobs = (current?.completedJobs ?? 0) + 1;

  // Recalculate running averages
  const currentRating = current?.averageRating ?? 0;
  const averageRating = Math.round(((currentRating * (totalReviews - 1)) + input.reviewRating) / totalReviews * 10) / 10;

  const onTimeTotal = (current?.onTimeCompletionRate ?? 0) * (totalReviews - 1) / 100 + (input.completedOnTime ? 1 : 0);
  const onTimeCompletionRate = Math.round((onTimeTotal / totalReviews) * 100);

  const onBudgetTotal = (current?.onBudgetRate ?? 0) * (totalReviews - 1) / 100 + (input.completedOnBudget ? 1 : 0);
  const onBudgetRate = Math.round((onBudgetTotal / totalReviews) * 100);

  const disputeCount = (current?.disputeCount ?? 0) + (input.disputeFiled ? 1 : 0);

  const reputation: Omit<ReputationRecord, 'reputationId'> = {
    userId: input.userId,
    averageRating,
    totalReviews,
    completedJobs,
    onTimeCompletionRate,
    onBudgetRate,
    disputeCount,
    lastUpdatedAt: new Date().toISOString(),
  };

  const ref = getDemoCol( 'reputation');
  const q = query(ref, where('userId', '==', input.userId));
  const existing = await getDocs(q);

  if (existing.docs.length > 0) {
    await updateDoc(getDemoDoc( 'reputation', existing.docs[0].id), reputation as unknown as Record<string, unknown>);
    return { ...reputation, reputationId: existing.docs[0].id };
  } else {
    const docRef = await addDoc(ref, reputation);
    return { ...reputation, reputationId: docRef.id };
  }
}

/**
 * Get the reputation record for a user.
 */
export async function getReputation(userId: string): Promise<ReputationRecord | null> {
  const q = query(getDemoCol( 'reputation'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { ...snapshot.docs[0].data(), reputationId: snapshot.docs[0].id } as ReputationRecord;
}

/**
 * Get the latest verification record for a user.
 */
async function getLatestVerification(userId: string): Promise<UserVerification | null> {
  const q = query(getDemoCol( 'user_verifications'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const verifications = snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as unknown as UserVerification));
  return verifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}

/**
 * Create a verification checklist for a user onboarding process.
 */
export async function createVerificationChecklist(userId: string): Promise<VerificationChecklist> {
  const items: VerificationChecklistItem[] = [
    { itemId: 'id-verification', label: 'Identity verification (ID/passport)', required: true, verified: false },
    { itemId: 'professional-registration', label: 'Professional body registration check', required: true, verified: false },
    { itemId: 'tax-compliance', label: 'Tax compliance (SARS PIN)', required: true, verified: false },
    { itemId: 'insurance', label: 'Professional indemnity insurance', required: false, verified: false },
    { itemId: 'company-docs', label: 'Company registration documents', required: false, verified: false },
    { itemId: 'b-bbee', label: 'B-BBEE certificate', required: false, verified: false },
    { itemId: 'cidb-grading', label: 'CIDB grading', required: false, verified: false },
  ];

  const checklist: Omit<VerificationChecklist, 'checklistId'> = {
    userId,
    items,
    overallStatus: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const docRef = await addDoc(getDemoCol( 'verification_checklists'), checklist);
  return { ...checklist, checklistId: docRef.id };
}

/**
 * Verify a single checklist item.
 */
export async function verifyChecklistItem(
  checklistId: string,
  itemId: string,
  verifiedBy: string,
  notes?: string,
): Promise<VerificationChecklist> {
  const ref = getDemoDoc( 'verification_checklists', checklistId);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) throw new Error(`Checklist ${checklistId} not found`);

  const checklist = snapshot.data() as Omit<VerificationChecklist, 'checklistId'>;
  const updatedItems = checklist.items.map((item) =>
    item.itemId === itemId
      ? { ...item, verified: true, verifiedAt: new Date().toISOString(), verifiedBy, notes: notes ?? item.notes }
      : item
  );

  const allRequiredVerified = updatedItems.filter((i) => i.required).every((i) => i.verified);
  const overallStatus: VerificationStatus = allRequiredVerified ? 'verified' : 'pending';

  const updates = { items: updatedItems, overallStatus, updatedAt: new Date().toISOString() };
  await updateDoc(ref, updates);

  return { ...checklist, ...updates, checklistId };
}

/**
 * Get the verification checklist for a user.
 */
export async function getVerificationChecklist(userId: string): Promise<VerificationChecklist | null> {
  const q = query(getDemoCol( 'verification_checklists'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  return { ...snapshot.docs[0].data(), checklistId: snapshot.docs[0].id } as VerificationChecklist;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function trustLevelForScore(score: number): TrustLevel {
  if (score >= 80) return 'verified';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}
