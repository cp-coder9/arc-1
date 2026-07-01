import { validateProposalEligibility } from '../proposalGuard';
import { FeeCalculatorEngine } from '../feeEngine';
import { ProfessionProfileRegistry } from '../profiles';
import type { FeeInput } from '../types';

function makeValidInput(overrides: Partial<FeeInput> = {}): FeeInput {
  return {
    profession: 'architect',
    projectValue: 5_000_000,
    complexityId: 'medium',
    workCategorySplits: { new: 1 },
    selectedStages: {
      s1: { applicable: true, reductionPercentage: 0 },
      s2: { applicable: true, reductionPercentage: 0 },
      s3: { applicable: true, reductionPercentage: 0 },
      s41: { applicable: true, reductionPercentage: 0 },
      s42: { applicable: true, reductionPercentage: 0 },
      s5: { applicable: true, reductionPercentage: 0 },
      s6: { applicable: true, reductionPercentage: 0 },
    },
    vatApplicable: true,
    ...overrides,
  };
}

describe('validateProposalEligibility', () => {
  it('returns valid for normal input with no discount', () => {
    const input = makeValidInput();
    const result = validateProposalEligibility(input);
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for input with discount that has a reason', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0.1,
        reason: 'Repeat client discount',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });
    const result = validateProposalEligibility(input);
    expect(result).toEqual({ valid: true });
  });

  it('returns invalid when discount > 0 without reason', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0.15,
        reason: '',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });
    const result = validateProposalEligibility(input);
    expect(result).toEqual({ valid: false, reason: 'Discount reason is required' });
  });

  it('returns invalid when discount reason is whitespace only', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0.05,
        reason: '   \t  ',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });
    const result = validateProposalEligibility(input);
    expect(result).toEqual({ valid: false, reason: 'Discount reason is required' });
  });

  it('returns invalid for zero project value', () => {
    const input = makeValidInput({ projectValue: 0 });
    const result = validateProposalEligibility(input);
    expect(result).toEqual({ valid: false, reason: 'Project value must be positive' });
  });

  it('returns invalid for negative project value', () => {
    const input = makeValidInput({ projectValue: -100_000 });
    const result = validateProposalEligibility(input);
    expect(result).toEqual({ valid: false, reason: 'Project value must be positive' });
  });
});

describe('FeeCalculatorEngine discount validation', () => {
  const engine = new FeeCalculatorEngine();
  const registry = new ProfessionProfileRegistry();
  const profile = registry.get('architect');

  it('throws when discount percentage > 0 and reason is empty', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0.1,
        reason: '',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });

    expect(() => engine.calculate(input, profile)).toThrow('Discount reason is required');
  });

  it('throws when discount percentage > 0 and reason is whitespace only', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0.2,
        reason: '   ',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });

    expect(() => engine.calculate(input, profile)).toThrow('Discount reason is required');
  });

  it('does not throw when discount percentage > 0 and reason is provided', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0.1,
        reason: 'Long-term relationship discount',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });

    expect(() => engine.calculate(input, profile)).not.toThrow();
  });

  it('does not throw when discount percentage is 0 regardless of reason', () => {
    const input = makeValidInput({
      discount: {
        percentage: 0,
        reason: '',
        appliesToDisbursements: false,
        appliesToStatutoryFees: false,
      },
    });

    expect(() => engine.calculate(input, profile)).not.toThrow();
  });
});
