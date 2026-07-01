import type { FeeInput } from './types';

/**
 * Validates that a fee calculation input is eligible for proposal generation.
 * Returns { valid: true } or { valid: false, reason: string }.
 *
 * Guards against generating proposals with invalid or incomplete data,
 * catching issues before they reach the engine or proposal builder.
 */
export function validateProposalEligibility(
  input: FeeInput,
): { valid: true } | { valid: false; reason: string } {
  if (input.projectValue <= 0) {
    return { valid: false, reason: 'Project value must be positive' };
  }

  const discountPercentage = input.discount?.percentage ?? 0;
  if (discountPercentage > 0 && !input.discount?.reason?.trim()) {
    return { valid: false, reason: 'Discount reason is required' };
  }

  return { valid: true };
}
