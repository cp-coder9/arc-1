/**
 * Site Execution + Field Control Pure Validators (Pack 10)
 *
 * Stateless guardrails, state machines, and business logic.
 * Extracted for testability — no Firebase dependency.
 */
import type { NCRStatus, SnagStatus, DelayWarningStatus, SiteInstructionStatus, UserRole, Severity } from '@/types';

// ─── NCR ────────────────────────────────────────────────

const NCR_TRANSITIONS: Record<NCRStatus, NCRStatus[]> = {
  open: ['corrective_action_submitted', 'rejected'],
  corrective_action_submitted: ['verified_closed', 'open', 'rejected'],
  verified_closed: [],
  rejected: ['open'],
};

export function isValidNcrTransition(from: NCRStatus, to: NCRStatus): boolean {
  return NCR_TRANSITIONS[from]?.includes(to) ?? false;
}

export function ncrBlocksPayment(severity: Severity): boolean {
  return severity === 'high' || severity === 'critical';
}

// ─── Snag ───────────────────────────────────────────────

const SNAG_TRANSITIONS: Record<SnagStatus, SnagStatus[]> = {
  open: ['allocated', 'rejected'],
  allocated: ['ready_for_reinspection', 'rejected'],
  ready_for_reinspection: ['closed', 'allocated'],
  closed: [],
  rejected: ['open'],
};

export function isValidSnagTransition(from: SnagStatus, to: SnagStatus): boolean {
  return SNAG_TRANSITIONS[from]?.includes(to) ?? false;
}

export function snagBlocksPayment(priority: Severity): boolean {
  return priority === 'high' || priority === 'critical';
}

// ─── Delay Warning ──────────────────────────────────────

const WARNING_TRANSITIONS: Record<DelayWarningStatus, DelayWarningStatus[]> = {
  recorded: ['notice_required', 'closed'],
  notice_required: ['under_review', 'closed'],
  under_review: ['closed'],
  closed: [],
};

export function isValidWarningTransition(from: DelayWarningStatus, to: DelayWarningStatus): boolean {
  return WARNING_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Site Instruction ───────────────────────────────────

const AUTHORISED_ROLES: UserRole[] = ['architect', 'admin'];
const SUPER_USER_ROLES: UserRole[] = ['admin'];

const INSTRUCTION_TRANSITIONS: Record<SiteInstructionStatus, SiteInstructionStatus[]> = {
  draft: ['issued', 'superseded'],
  issued: ['acknowledged', 'superseded'],
  acknowledged: ['superseded'],
  superseded: [],
};

export function isValidInstructionTransition(from: SiteInstructionStatus, to: SiteInstructionStatus): boolean {
  return INSTRUCTION_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canIssueInstruction(role: UserRole): boolean {
  return AUTHORISED_ROLES.includes(role);
}

export function canSupersedeInstruction(role: UserRole): boolean {
  return SUPER_USER_ROLES.includes(role);
}

// ─── Exports ────────────────────────────────────────────

export const siteExecutionValidators = {
  isValidNcrTransition,
  ncrBlocksPayment,
  isValidSnagTransition,
  snagBlocksPayment,
  isValidWarningTransition,
  isValidInstructionTransition,
  canIssueInstruction,
  canSupersedeInstruction,
};

export default siteExecutionValidators;
