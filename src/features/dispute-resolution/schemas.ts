/**
 * Dispute Resolution Module — Zod Validation Schemas
 *
 * Validates formal claims, evidence linkage, quantum line items,
 * delay events, and adjudication data for South African construction
 * dispute workflows.
 *
 * Requirements: 5.5, 5.7, 7.2, 8.1, 9.1, 9.3
 */

import { z } from 'zod';

// ─── Formal Claim Schema ──────────────────────────────────────────────────────

export const formalClaimSchema = z.object({
  claimType: z.enum(['EoT', 'loss_and_expense', 'disruption', 'prolongation']),
  causativeEventDate: z.string().date(),
  notificationDate: z.string().date(),
  contractClauseNumber: z.string().min(1),
  contractClauseTitle: z.string().min(1),
  briefDescription: z.string().min(1).max(500),
  detailedParticulars: z.string().max(5000).optional(),
  amountClaimed: z.number().min(0.01).max(999_999_999.99).optional(),
  timeClaimed: z.number().int().min(1).max(999).optional(),
}).refine(data => {
  if (['loss_and_expense', 'disruption'].includes(data.claimType)) {
    return data.amountClaimed !== undefined;
  }
  return true;
}, { message: 'Amount claimed is required for monetary claims' })
.refine(data => {
  if (['EoT', 'prolongation'].includes(data.claimType)) {
    return data.timeClaimed !== undefined;
  }
  return true;
}, { message: 'Time claimed is required for EoT/prolongation claims' });

// ─── Evidence Link Schema ─────────────────────────────────────────────────────

export const evidenceLinkSchema = z.object({
  evidenceType: z.string().min(1),
  sourceModule: z.string().min(1),
  sourceReferenceId: z.string().min(1),
  dateOfEvidence: z.string().date(),
  description: z.string().min(1).max(200),
  relevanceCategory: z.enum(['causation', 'quantum', 'delay', 'mitigation']),
});

// ─── Quantum Line Item Schema ─────────────────────────────────────────────────

export const quantumLineItemSchema = z.object({
  description: z.string().min(1).max(500),
  costCategory: z.enum(['labour', 'materials', 'plant', 'preliminaries', 'overheads', 'profit', 'other']),
  unit: z.string().min(1).max(50),
  quantity: z.number().min(0.01).max(999_999.99),
  rate: z.number().min(0.01).max(999_999.99),
});

// ─── Delay Event Schema ───────────────────────────────────────────────────────

export const delayEventSchema = z.object({
  description: z.string().min(1).max(500),
  startDate: z.string().date(),
  endDate: z.string().date(),
  delayType: z.enum(['critical_path', 'concurrent']),
  responsibleParty: z.enum(['employer', 'contractor', 'neutral', 'shared']),
}).refine(data => new Date(data.endDate) >= new Date(data.startDate), {
  message: 'End date must be on or after start date',
});

// ─── Adjudication Schema ──────────────────────────────────────────────────────

export const adjudicationSchema = z.object({
  adjudicatorName: z.string().min(1).max(200),
  appointmentDate: z.string().date(),
  referringParty: z.string().min(1),
  respondentParty: z.string().min(1),
  disputeValue: z.number().min(0.01).max(999_999_999.99),
  timeInDispute: z.number().int().min(0).max(9999).optional(),
  referralNoticeRef: z.string().min(1),
  maxSubmissionRounds: z.number().int().min(1).max(5).default(2),
});

// ─── Inferred Input Types ─────────────────────────────────────────────────────

export type FormalClaimInput = z.infer<typeof formalClaimSchema>;
export type EvidenceLinkInput = z.infer<typeof evidenceLinkSchema>;
export type QuantumLineItemInput = z.infer<typeof quantumLineItemSchema>;
export type DelayEventInput = z.infer<typeof delayEventSchema>;
export type AdjudicationInput = z.infer<typeof adjudicationSchema>;
