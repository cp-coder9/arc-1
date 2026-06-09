import {
  calculateProfessionalFee,
  validateCalculatorInputs,
  calculatorById,
  calculatorsForRole,
  listAllCalculators,
  roundMoney,
  ARCHITECT_FEE_CALCULATOR,
  ENGINEER_FEE_CALCULATOR,
  QS_FEE_CALCULATOR,
  TOWN_PLANNER_FEE_CALCULATOR,
  CLIENT_SOFT_COST_CALCULATOR,
} from '../professionalFeeCalculatorService';
import type { CalculatorDefinition, CalculationInput, FormulaType } from '../professionalFeeCalculatorService';

const baseInput: CalculationInput = {
  projectValue: 2_000_000,
};

describe('roundMoney', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(100.456)).toBe(100.46);
    expect(roundMoney(100.454)).toBe(100.45);
    expect(roundMoney(100)).toBe(100);
  });
});

describe('validateCalculatorInputs', () => {
  it('accepts valid inputs for percentage_of_cost', () => {
    expect(validateCalculatorInputs('percentage_of_cost', { projectValue: 1_000_000 })).toEqual([]);
  });

  it('accepts valid inputs for sliding_scale', () => {
    expect(validateCalculatorInputs('sliding_scale', { projectValue: 2_000_000 })).toEqual([]);
  });

  it('accepts stage_apportioned with stagePercentage omitted (defaults to 100%)', () => {
    expect(validateCalculatorInputs('stage_apportioned', { projectValue: 1_000_000 })).toEqual([]);
  });

  it('accepts valid stage_apportioned inputs', () => {
    expect(validateCalculatorInputs('stage_apportioned', { projectValue: 1_000_000, stagePercentage: 50 })).toEqual([]);
  });

  it('rejects invalid stagePercentage range', () => {
    const errors = validateCalculatorInputs('stage_apportioned', { projectValue: 1_000_000, stagePercentage: 150 });
    expect(errors.some((e) => e.includes('stagePercentage'))).toBe(true);
  });

  it('requires hours for time_based', () => {
    const errors = validateCalculatorInputs('time_based', { projectValue: 0 });
    expect(errors.some((e) => e.includes('hours'))).toBe(true);
  });

  it('accepts valid time_based inputs', () => {
    expect(validateCalculatorInputs('time_based', { projectValue: 1, hours: 40 })).toEqual([]);
  });

  it('requires area for area_unit', () => {
    const errors = validateCalculatorInputs('area_unit', { projectValue: 1 });
    expect(errors.some((e) => e.includes('area'))).toBe(true);
  });

  it('accepts valid area_unit inputs', () => {
    expect(validateCalculatorInputs('area_unit', { projectValue: 1, area: 200 })).toEqual([]);
  });

  it('accepts hybrid with projectValue', () => {
    expect(validateCalculatorInputs('hybrid', { projectValue: 2_000_000 })).toEqual([]);
  });

  it('validates discount percent range', () => {
    const errors = validateCalculatorInputs('percentage_of_cost', { projectValue: 1_000_000, discountPercent: 150 });
    expect(errors.some((e) => e.includes('discountPercent'))).toBe(true);
  });
});

describe('calculateProfessionalFee', () => {
  describe('percentage_of_cost formula', () => {
    it('calculates architect fee at 8%', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, { projectValue: 1_000_000 });
      expect(result.originalProfessionalFee).toBeCloseTo(80_000);
      expect(result.formulaType).toBe('percentage_of_cost');
    });

    it('applies complexity factor', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        complexityFactor: 1.2,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(96_000); // 80_000 * 1.2
    });

    it('calculates engineer fee at 6%', () => {
      const result = calculateProfessionalFee(ENGINEER_FEE_CALCULATOR, { projectValue: 1_000_000 });
      expect(result.originalProfessionalFee).toBeCloseTo(60_000);
    });
  });

  describe('sliding_scale formula', () => {
    it('returns base fee for project value below threshold', () => {
      const result = calculateProfessionalFee(QS_FEE_CALCULATOR, { projectValue: 500_000 });
      expect(result.originalProfessionalFee).toBeCloseTo(40_000);
    });

    it('adds rate for value above threshold', () => {
      const result = calculateProfessionalFee(QS_FEE_CALCULATOR, { projectValue: 2_000_000 });
      // baseFee 40_000 + (2_000_000 - 1_000_000) * 0.035 = 40_000 + 35_000 = 75_000
      expect(result.originalProfessionalFee).toBeCloseTo(75_000);
    });
  });

  describe('stage_apportioned formula', () => {
    const stageCalc: CalculatorDefinition = {
      ...ARCHITECT_FEE_CALCULATOR,
      calculatorId: 'stage_test',
      formulaType: 'stage_apportioned',
    };

    it('apportions fee by stage percentage', () => {
      const result = calculateProfessionalFee(stageCalc, {
        projectValue: 1_000_000,
        stagePercentage: 25,
      });
      // 1_000_000 * 8% * 25% = 20_000
      expect(result.originalProfessionalFee).toBeCloseTo(20_000);
    });

    it('defaults to 100% stage when not specified', () => {
      const result = calculateProfessionalFee(stageCalc, { projectValue: 1_000_000 });
      expect(result.originalProfessionalFee).toBeCloseTo(80_000);
    });
  });

  describe('time_based formula', () => {
    const timeCalc: CalculatorDefinition = {
      ...ARCHITECT_FEE_CALCULATOR,
      calculatorId: 'time_test',
      formulaType: 'time_based',
      defaultHourlyRate: 1200,
    };

    it('calculates fee from hours and rate', () => {
      const result = calculateProfessionalFee(timeCalc, {
        projectValue: 1,
        hours: 100,
        hourlyRate: 1500,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(150_000);
    });

    it('uses default hourly rate when not specified', () => {
      const result = calculateProfessionalFee(timeCalc, {
        projectValue: 1,
        hours: 50,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(60_000); // 50 * 1200
    });
  });

  describe('area_unit formula', () => {
    const areaCalc: CalculatorDefinition = {
      ...ARCHITECT_FEE_CALCULATOR,
      calculatorId: 'area_test',
      formulaType: 'area_unit',
      defaultUnitRate: 800,
    };

    it('calculates fee from area and unit rate', () => {
      const result = calculateProfessionalFee(areaCalc, {
        projectValue: 1,
        area: 250,
        unitRate: 1000,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(250_000);
    });

    it('uses default unit rate', () => {
      const result = calculateProfessionalFee(areaCalc, {
        projectValue: 1,
        area: 200,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(160_000); // 200 * 800
    });

    it('applies complexity factor', () => {
      const result = calculateProfessionalFee(areaCalc, {
        projectValue: 1,
        area: 200,
        complexityFactor: 1.5,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(240_000); // 160_000 * 1.5
    });
  });

  describe('hybrid formula', () => {
    it('combines percentage and time-based components', () => {
      const result = calculateProfessionalFee(TOWN_PLANNER_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        hours: 20,
        hourlyRate: 950,
      });
      // pctPortion: 1_000_000 * 0.035 = 35_000
      // timePortion: 20 * 950 = 19_000
      // total = 54_000
      expect(result.originalProfessionalFee).toBeCloseTo(54_000);
    });
  });

  describe('VAT and totals', () => {
    it('calculates VAT correctly at 15%', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
      });
      // Fee: 80_000, VAT base: 80_000, VAT: 12_000, Total: 92_000
      expect(result.vatAmount).toBeCloseTo(12_000);
      expect(result.total).toBeCloseTo(92_000);
    });
  });

  describe('discount', () => {
    it('applies discount before VAT', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        discountPercent: 10,
        discountReason: 'Introductory discount',
      });
      expect(result.originalProfessionalFee).toBeCloseTo(80_000);
      expect(result.discountAmount).toBeCloseTo(8_000);
      expect(result.professionalFeeAfterDiscount).toBeCloseTo(72_000);
      expect(result.vatAmount).toBeCloseTo(10_800); // 72_000 * 0.15
    });

    it('warns when discount has no reason', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        discountPercent: 10,
      });
      expect(result.warnings).toContain('Discount reason is required before proposal issue.');
    });
  });

  describe('disbursements and statutory fees', () => {
    it('includes disbursements in VAT base but not in discount', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        disbursements: 5_000,
      });
      // Fee: 80_000, Disbursements: 5_000, VAT: (80_000+5_000)*0.15 = 12_750, Total: 97_750
      expect(result.vatAmount).toBeCloseTo(12_750);
      expect(result.total).toBeCloseTo(97_750);
    });

    it('statutory fees are excluded from VAT base', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        statutoryFees: 2_500,
      });
      expect(result.vatAmount).toBeCloseTo(12_000); // Only on 80_000
      expect(result.total).toBeCloseTo(94_500); // 80_000 + 12_000 + 2_500
    });
  });

  describe('line items', () => {
    it('produces correct line item categories', () => {
      const result = calculateProfessionalFee(ARCHITECT_FEE_CALCULATOR, {
        projectValue: 1_000_000,
        discountPercent: 5,
        discountReason: 'Test',
        disbursements: 2000,
        statutoryFees: 1000,
      });
      const categories = result.lines.map((l) => l.category);
      expect(categories).toContain('professional_fee');
      expect(categories).toContain('discount');
      expect(categories).toContain('disbursement');
      expect(categories).toContain('statutory_fee');
      expect(categories).toContain('vat');
      expect(categories).toContain('total');
    });
  });
});

describe('calculator registry', () => {
  it('finds architect calculator by ID', () => {
    const calc = calculatorById('architect_fee_proposal');
    expect(calc.role).toBe('architect');
    expect(calc.formulaType).toBe('percentage_of_cost');
  });

  it('finds QS calculator by ID', () => {
    const calc = calculatorById('qs_fee_placeholder');
    expect(calc.role).toBe('quantity_surveyor');
    expect(calc.formulaType).toBe('sliding_scale');
  });

  it('throws for unknown calculator ID', () => {
    expect(() => calculatorById('nonexistent')).toThrow('Calculator not found');
  });

  it('lists calculators for architect role', () => {
    const calcs = calculatorsForRole('architect');
    expect(calcs.length).toBeGreaterThan(0);
    expect(calcs[0].role).toBe('architect');
  });

  it('lists all calculators', () => {
    const all = listAllCalculators();
    expect(all.length).toBeGreaterThanOrEqual(5);
  });
});
