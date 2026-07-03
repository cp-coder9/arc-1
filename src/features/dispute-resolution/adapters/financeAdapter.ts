/**
 * Finance Adapter — Dispute Resolution
 *
 * Creates payment instruction references for monetary adjudication awards.
 * Writes to the Finance module action centre within the contract-specified
 * payment period after a decision is issued.
 *
 * Requirements: 10.4
 */

import type { PlatformIntegrationService } from '@/features/p1-shared/services/platformIntegration';
import type { IntegrationWriteResult } from '@/features/p1-shared/types';

// ─── Typed Payloads ───────────────────────────────────────────────────────────

export interface PaymentInstructionInput {
  projectId: string;
  adjudicationId: string;
  claimId: string;
  claimReference: string;
  amountAwarded: number;
  decisionDate: string;
  /** ISO date by which payment must be made (contract-specified period) */
  paymentDeadline: string;
  payingParty: string;
  receivingParty: string;
  decisionSummary?: string;
}

export interface PaymentInstructionRef {
  instructionId: string;
  projectId: string;
  adjudicationId: string;
  claimReference: string;
  amountZAR: number;
  paymentDeadline: string;
  createdAt: string;
}

// ─── Adapter Interface ────────────────────────────────────────────────────────

export interface DisputeFinanceAdapter {
  /** Create a payment instruction reference for a monetary adjudication award */
  writePaymentInstruction(input: PaymentInstructionInput): Promise<IntegrationWriteResult & { ref?: PaymentInstructionRef }>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInstructionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates the Dispute Resolution Finance adapter.
 *
 * Accepts a PlatformIntegrationService and returns an object with
 * a typed write method for creating payment instruction references
 * for monetary adjudication awards. The write is surfaced to the
 * Finance module via the Action Centre with the payment deadline.
 *
 * On failure, operations are automatically retried via the platform
 * integration retry queue (exponential backoff, 3 retries).
 */
export function createDisputeFinanceAdapter(
  platform: PlatformIntegrationService,
): DisputeFinanceAdapter {
  return {
    async writePaymentInstruction(
      input: PaymentInstructionInput,
    ): Promise<IntegrationWriteResult & { ref?: PaymentInstructionRef }> {
      const instructionId = generateInstructionId();
      const createdAt = new Date().toISOString();

      const ref: PaymentInstructionRef = {
        instructionId,
        projectId: input.projectId,
        adjudicationId: input.adjudicationId,
        claimReference: input.claimReference,
        amountZAR: input.amountAwarded,
        paymentDeadline: input.paymentDeadline,
        createdAt,
      };

      // Write payment instruction to the Action Centre targeting Finance module
      const result = await platform.writeToActionCentre({
        projectId: input.projectId,
        sourceModule: 'dispute-resolution',
        actionType: 'payment_instruction',
        subject: `Adjudication award: R${input.amountAwarded.toLocaleString('en-ZA')} payable — Claim ${input.claimReference}`,
        deadline: input.paymentDeadline,
        priority: 'high',
        targetRole: 'quantity_surveyor',
      });

      // Also record the payment instruction in the audit trail
      await platform.writeToAuditTrail({
        projectId: input.projectId,
        moduleId: 'dispute-resolution',
        action: 'payment_instruction_created',
        recordRef: instructionId,
        actorId: 'system',
        timestamp: createdAt,
        newValues: {
          adjudicationId: input.adjudicationId,
          claimId: input.claimId,
          claimReference: input.claimReference,
          amountAwarded: input.amountAwarded,
          paymentDeadline: input.paymentDeadline,
          payingParty: input.payingParty,
          receivingParty: input.receivingParty,
          ...(input.decisionSummary && { decisionSummary: input.decisionSummary }),
        },
      });

      if (result.success) {
        return { ...result, ref };
      }

      return result;
    },
  };
}
