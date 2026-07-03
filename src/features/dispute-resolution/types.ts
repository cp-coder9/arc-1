/**
 * Dispute Resolution Module — Type Definitions
 *
 * Types for formal claims management, evidence linkage, quantum/delay analysis,
 * notice timelines, and adjudication workflows under South African standard
 * contract forms (JBCC, NEC, GCC, FIDIC).
 */

import type { ContractForm } from '@/services/contractAdmin/contractTypes';

// ─── Enumerations ─────────────────────────────────────────────────────────────

export type ClaimType = 'EoT' | 'loss_and_expense' | 'disruption' | 'prolongation';

export type ClaimStage =
  | 'notified'
  | 'particularised'
  | 'assessed'
  | 'responded'
  | 'notice_of_dissatisfaction'
  | 'referred_to_adjudication'
  | 'adjudication_decision_issued'
  | 'settled';

export type ResponseSubState = 'accepted' | 'partially_accepted' | 'rejected';

export type EvidenceRelevance = 'causation' | 'quantum' | 'delay' | 'mitigation';

export type CostCategory =
  | 'labour'
  | 'materials'
  | 'plant'
  | 'preliminaries'
  | 'overheads'
  | 'profit'
  | 'other';

export type DelayType = 'critical_path' | 'concurrent';

export type ResponsibleParty = 'employer' | 'contractor' | 'neutral' | 'shared';

export type AdjudicationStage =
  | 'referred'
  | 'adjudicator_appointed'
  | 'submissions_open'
  | 'submissions_closed'
  | 'hearing_scheduled'
  | 'hearing_completed'
  | 'decision_issued'
  | 'decision_implemented';

// ─── Formal Claim ─────────────────────────────────────────────────────────────

export interface FormalClaim {
  id: string;
  projectId: string;
  referenceNumber: string;
  claimType: ClaimType;
  causativeEventDate: string;
  notificationDate: string;
  contractClauseNumber: string;
  contractClauseTitle: string;
  briefDescription: string;       // max 500
  detailedParticulars?: string;   // max 5000
  amountClaimed?: number;
  timeClaimed?: number;           // Working_Days
  currentStage: ClaimStage;
  responseSubState?: ResponseSubState;
  awardedAmount?: number;
  awardedTime?: number;
  timeBarredRisk: boolean;
  linkedContractAdminClaimId?: string;
  evidenceItems: EvidenceLink[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Evidence Linkage ─────────────────────────────────────────────────────────

export interface EvidenceLink {
  id: string;
  claimId: string;
  evidenceType: string;
  sourceModule: string;
  sourceReferenceId: string;
  dateOfEvidence: string;
  description: string;            // max 200
  relevanceCategory: EvidenceRelevance;
  sourceStatus: 'available' | 'source_unavailable';
  linkedAt: string;
  linkedBy: string;
}

// ─── Notice Timeline ──────────────────────────────────────────────────────────

export interface NoticeDeadline {
  claimId: string;
  deadlineType: 'notification' | 'particulars' | 'response' | 'adjudication_referral';
  dueDate: string;
  contractForm: ContractForm;
  isOverdue: boolean;
  daysRemaining: number;
}

// ─── Quantum Assessment ───────────────────────────────────────────────────────

export interface QuantumLineItem {
  id: string;
  assessmentId: string;
  description: string;            // max 500
  costCategory: CostCategory;
  unit: string;                   // max 50
  quantity: number;               // 0.01–999,999.99
  rate: number;                   // 0.01–999,999.99
  amount: number;                 // auto: quantity * rate
}

export interface QuantumAssessment {
  id: string;
  claimId: string;
  projectId: string;
  lineItems: QuantumLineItem[];
  subtotalByCategory: Record<CostCategory, number>;
  totalQuantumAmount: number;
  percentageByCategory: Record<CostCategory, number>;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Delay Analysis ───────────────────────────────────────────────────────────

export interface DelayEvent {
  id: string;
  analysisId: string;
  description: string;            // max 500
  startDate: string;
  endDate: string;
  delayType: DelayType;
  responsibleParty: ResponsibleParty;
  workingDaysImpacted: number;
}

export interface DelayAnalysis {
  id: string;
  claimId: string;
  projectId: string;
  events: DelayEvent[];
  totalByParty: Record<ResponsibleParty, number>;
  netClaimableDelay: number;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Adjudication ─────────────────────────────────────────────────────────────

export interface Adjudication {
  id: string;
  claimId: string;
  projectId: string;
  adjudicatorName: string;        // max 200
  appointmentDate: string;
  referringParty: string;
  respondentParty: string;
  disputeValue: number;           // 0.01–999,999,999.99
  timeInDispute?: number;         // 0–9999
  referralNoticeRef: string;
  currentStage: AdjudicationStage;
  maxSubmissionRounds: number;    // 1–5, default 2
  submissionDeadline?: string;
  decisionDate?: string;
  amountAwarded?: number;
  timeAwarded?: number;
  decisionSummary?: string;       // max 2000
  isInterimBinding: boolean;
  createdAt: string;
  updatedAt: string;
}
