/**
 * Unit tests for Site Execution + Field Control Services (Pack 10)
 *
 * Tests state machines, business logic, guardrails and validators.
 * Firestore operations are mocked via the standard test setup.
 */
import { describe, it, expect } from 'vitest';
import {
  isValidNcrTransition,
  ncrBlocksPayment,
  isValidSnagTransition,
  snagBlocksPayment,
  isValidWarningTransition,
  isValidInstructionTransition,
  canIssueInstruction,
  canSupersedeInstruction,
} from '@/services/siteExecutionValidators';

// ─── NCR State Machine ──────────────────────────────────────────

describe('NCR Service', () => {
  describe('ncrBlocksPayment', () => {
    it('blocks payment for high severity', () => {
      expect(ncrBlocksPayment('high')).toBe(true);
    });

    it('blocks payment for critical severity', () => {
      expect(ncrBlocksPayment('critical')).toBe(true);
    });

    it('does not block payment for low severity', () => {
      expect(ncrBlocksPayment('low')).toBe(false);
    });

    it('does not block payment for medium severity', () => {
      expect(ncrBlocksPayment('medium')).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('allows open → corrective_action_submitted', () => {
      expect(isValidNcrTransition('open', 'corrective_action_submitted')).toBe(true);
    });

    it('allows open → rejected', () => {
      expect(isValidNcrTransition('open', 'rejected')).toBe(true);
    });

    it('allows corrective_action_submitted → verified_closed', () => {
      expect(isValidNcrTransition('corrective_action_submitted', 'verified_closed')).toBe(true);
    });

    it('allows corrective_action_submitted → open (reset)', () => {
      expect(isValidNcrTransition('corrective_action_submitted', 'open')).toBe(true);
    });

    it('allows rejected → open (reopen)', () => {
      expect(isValidNcrTransition('rejected', 'open')).toBe(true);
    });

    it('prevents verified_closed from any further transition', () => {
      expect(isValidNcrTransition('verified_closed', 'open')).toBe(false);
      expect(isValidNcrTransition('verified_closed', 'rejected')).toBe(false);
    });

    it('prevents open → verified_closed (must pass corrective action)', () => {
      expect(isValidNcrTransition('open', 'verified_closed')).toBe(false);
    });
  });
});

// ─── Snag State Machine ─────────────────────────────────────────

describe('Snag Service', () => {
  describe('snagBlocksPayment', () => {
    it('blocks payment for high priority snag', () => {
      expect(snagBlocksPayment('high')).toBe(true);
    });

    it('blocks payment for critical priority snag', () => {
      expect(snagBlocksPayment('critical')).toBe(true);
    });

    it('does not block payment for low priority snag', () => {
      expect(snagBlocksPayment('low')).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('allows open → allocated', () => {
      expect(isValidSnagTransition('open', 'allocated')).toBe(true);
    });

    it('allows allocated → ready_for_reinspection', () => {
      expect(isValidSnagTransition('allocated', 'ready_for_reinspection')).toBe(true);
    });

    it('allows ready_for_reinspection → closed', () => {
      expect(isValidSnagTransition('ready_for_reinspection', 'closed')).toBe(true);
    });

    it('allows ready_for_reinspection → allocated (back to fix)', () => {
      expect(isValidSnagTransition('ready_for_reinspection', 'allocated')).toBe(true);
    });

    it('prevents closed from any further transition', () => {
      expect(isValidSnagTransition('closed', 'open')).toBe(false);
      expect(isValidSnagTransition('closed', 'allocated')).toBe(false);
    });

    it('allows rejected → open (reopen)', () => {
      expect(isValidSnagTransition('rejected', 'open')).toBe(true);
    });
  });
});

// ─── Delay Warning State Machine ─────────────────────────────────

describe('Delay Warning Service', () => {
  describe('state transitions', () => {
    it('allows recorded → notice_required', () => {
      expect(isValidWarningTransition('recorded', 'notice_required')).toBe(true);
    });

    it('allows recorded → closed', () => {
      expect(isValidWarningTransition('recorded', 'closed')).toBe(true);
    });

    it('allows notice_required → under_review', () => {
      expect(isValidWarningTransition('notice_required', 'under_review')).toBe(true);
    });

    it('allows notice_required → closed', () => {
      expect(isValidWarningTransition('notice_required', 'closed')).toBe(true);
    });

    it('allows under_review → closed', () => {
      expect(isValidWarningTransition('under_review', 'closed')).toBe(true);
    });

    it('prevents closed from any further transition', () => {
      expect(isValidWarningTransition('closed', 'recorded')).toBe(false);
      expect(isValidWarningTransition('closed', 'notice_required')).toBe(false);
    });

    it('prevents recorded → under_review (must escalate first)', () => {
      expect(isValidWarningTransition('recorded', 'under_review')).toBe(false);
    });
  });
});

// ─── Site Instruction Authorisation Guardrails ───────────────────

describe('Site Instruction Service', () => {
  describe('canIssueInstruction', () => {
    it('allows architect to issue', () => {
      expect(canIssueInstruction('architect')).toBe(true);
    });

    it('allows admin to issue', () => {
      expect(canIssueInstruction('admin')).toBe(true);
    });

    it('denies contractor from issuing', () => {
      expect(canIssueInstruction('contractor')).toBe(false);
    });

    it('denies subcontractor from issuing', () => {
      expect(canIssueInstruction('subcontractor')).toBe(false);
    });

    it('denies freelancer from issuing', () => {
      expect(canIssueInstruction('freelancer')).toBe(false);
    });
  });

  describe('canSupersedeInstruction', () => {
    it('allows admin to supersede', () => {
      expect(canSupersedeInstruction('admin')).toBe(true);
    });

    it('denies architect from superseding', () => {
      expect(canSupersedeInstruction('architect')).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('allows draft → issued', () => {
      expect(isValidInstructionTransition('draft', 'issued')).toBe(true);
    });

    it('allows draft → superseded', () => {
      expect(isValidInstructionTransition('draft', 'superseded')).toBe(true);
    });

    it('allows issued → acknowledged', () => {
      expect(isValidInstructionTransition('issued', 'acknowledged')).toBe(true);
    });

    it('allows issued → superseded', () => {
      expect(isValidInstructionTransition('issued', 'superseded')).toBe(true);
    });

    it('allows acknowledged → superseded', () => {
      expect(isValidInstructionTransition('acknowledged', 'superseded')).toBe(true);
    });

    it('prevents superseded from any further transition', () => {
      expect(isValidInstructionTransition('superseded', 'draft')).toBe(false);
      expect(isValidInstructionTransition('superseded', 'issued')).toBe(false);
    });

    it('prevents draft → acknowledged (must be issued first)', () => {
      expect(isValidInstructionTransition('draft', 'acknowledged')).toBe(false);
    });
  });
});

// ─── Guardrail Summary ──────────────────────────────────────────

describe('Pack 10 Guardrails', () => {
  it('NCRs and snags at high/critical severity block payment', () => {
    expect(ncrBlocksPayment('high')).toBe(true);
    expect(ncrBlocksPayment('critical')).toBe(true);
    expect(snagBlocksPayment('high')).toBe(true);
    expect(snagBlocksPayment('critical')).toBe(true);
  });

  it('NCRs and snags at low/medium do NOT block payment', () => {
    expect(ncrBlocksPayment('low')).toBe(false);
    expect(ncrBlocksPayment('medium')).toBe(false);
    expect(snagBlocksPayment('low')).toBe(false);
    expect(snagBlocksPayment('medium')).toBe(false);
  });

  it('site instructions require authorised professional', () => {
    expect(canIssueInstruction('architect')).toBe(true);
    expect(canIssueInstruction('contractor')).toBe(false);
  });

  it('superseded/closed records cannot transition further', () => {
    // NCR verified_closed is terminal
    expect(isValidNcrTransition('verified_closed', 'open')).toBe(false);
    // Snag closed is terminal
    expect(isValidSnagTransition('closed', 'open')).toBe(false);
    // Warning closed is terminal
    expect(isValidWarningTransition('closed', 'recorded')).toBe(false);
    // Instruction superseded is terminal
    expect(isValidInstructionTransition('superseded', 'draft')).toBe(false);
  });
});
