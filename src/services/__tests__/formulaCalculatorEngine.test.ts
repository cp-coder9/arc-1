import { calculateFee, validateCalculatorInputs, getCalculatorById, listCalculatorsForRole, listCalculatorsByFormulaType, FORMULA_CALCULATOR_REGISTRY, type FormulaType } from '../formulaCalculatorEngine';

describe('formulaCalculatorEngine', () => {
  it('has 8 calculators in registry', () => {
    expect(FORMULA_CALCULATOR_REGISTRY.length).toBe(8);
  });

  it('covers formula types', () => {
    const types = new Set(FORMULA_CALCULATOR_REGISTRY.map(c => c.formulaType));
    expect(types.has('percentage_of_cost')).toBe(true);
    expect(types.has('sliding_scale')).toBe(true);
    expect(types.has('time_based')).toBe(true);
    expect(types.has('area_unit')).toBe(true);
    expect(types.has('hybrid')).toBe(true);
  });

  describe('percentage_of_cost', () => {
    const def = { calculatorId: 't', formulaType: 'percentage_of_cost' as FormulaType, vatRate: 0.15 };
    it('calculates 8% of project value', () => {
      const r = calculateFee(def, { projectValue: 1_000_000, complexityFactor: 1 });
      expect(r.originalProfessionalFee).toBeCloseTo(80_000);
    });
    it('applies complexity', () => {
      const r = calculateFee(def, { projectValue: 1_000_000, complexityFactor: 1.2 });
      expect(r.originalProfessionalFee).toBeCloseTo(96_000);
    });
  });

  describe('sliding_scale', () => {
    const def = { calculatorId: 't', formulaType: 'sliding_scale' as FormulaType, vatRate: 0.15 };
    it('calculates base + above threshold', () => {
      const r = calculateFee(def, { projectValue: 2_000_000, slidingScaleBaseFee: 50_000, slidingScaleThreshold: 1_000_000, slidingScaleAboveRate: 0.045, complexityFactor: 1 });
      expect(r.originalProfessionalFee).toBeCloseTo(95_000);
    });
  });

  describe('time_based', () => {
    const def = { calculatorId: 't', formulaType: 'time_based' as FormulaType, vatRate: 0.15 };
    it('multiplies hours by rate', () => {
      const r = calculateFee(def, { hours: 100, hourlyRate: 950, complexityFactor: 1 });
      expect(r.originalProfessionalFee).toBeCloseTo(95_000);
    });
  });

  describe('area_unit', () => {
    const def = { calculatorId: 't', formulaType: 'area_unit' as FormulaType, vatRate: 0.15 };
    it('multiplies area by unit rate', () => {
      const r = calculateFee(def, { area: 200, unitRate: 95, complexityFactor: 1 });
      expect(r.originalProfessionalFee).toBeCloseTo(19_000);
    });
  });

  describe('stage_apportioned', () => {
    const def = { calculatorId: 't', formulaType: 'stage_apportioned' as FormulaType, vatRate: 0.15 };
    it('apportions by stage', () => {
      const r = calculateFee(def, { projectValue: 1_000_000, stagePercentage: 50, complexityFactor: 1 });
      expect(r.originalProfessionalFee).toBeCloseTo(40_000);
    });
  });

  describe('hybrid', () => {
    const def = { calculatorId: 't', formulaType: 'hybrid' as FormulaType, vatRate: 0.15 };
    it('combines components with weights', () => {
      const r = calculateFee(def, { hybridComponents: [{ formulaType: 'percentage_of_cost', weight: 0.6, inputs: { projectValue: 1_000_000 } }, { formulaType: 'time_based', weight: 0.4, inputs: { hours: 50, hourlyRate: 950 } }] });
      expect(r.originalProfessionalFee).toBeCloseTo(67_000);
    });
    it('throws with no components', () => {
      expect(() => calculateFee(def, { hybridComponents: [] })).toThrow();
    });
  });

  describe('discount and VAT', () => {
    const def = { calculatorId: 't', formulaType: 'percentage_of_cost' as FormulaType, vatRate: 0.15 };
    it('applies discount percentage', () => {
      const r = calculateFee(def, { projectValue: 1_000_000, complexityFactor: 1, discountPercent: 10 });
      expect(r.discountAmount).toBeCloseTo(8_000);
      expect(r.professionalFeeAfterDiscount).toBeCloseTo(72_000);
    });
    it('warns on discount without reason', () => {
      const r = calculateFee(def, { projectValue: 1_000_000, discountPercent: 10 });
      expect(r.warnings).toContain('Discount reason is required before proposal issue.');
    });
    it('calculates VAT on fee after discount + disbursements', () => {
      const r = calculateFee(def, { projectValue: 1_000_000, complexityFactor: 1, disbursements: 5_000 });
      expect(r.vatAmount).toBeCloseTo(85_000 * 0.15);
    });
  });

  describe('validation', () => {
    it('validates required inputs', () => {
      expect(validateCalculatorInputs('percentage_of_cost', {}).length).toBeGreaterThan(0);
      expect(validateCalculatorInputs('time_based', {}).filter(e => e.field === 'hours').length).toBeGreaterThan(0);
    });
    it('validates hybrid weights sum to 1', () => {
      expect(validateCalculatorInputs('hybrid', { hybridComponents: [{ formulaType: 'time_based', weight: 0.3, inputs: { hours: 10, hourlyRate: 100 } }] }).some(e => e.field === 'hybridComponents')).toBe(true);
    });
    it('passes valid inputs', () => {
      expect(validateCalculatorInputs('percentage_of_cost', { projectValue: 1_000_000 }).length).toBe(0);
    });
  });

  describe('lookup', () => {
    it('getCalculatorById works', () => {
      expect(getCalculatorById('architect_fee_proposal').formulaType).toBe('percentage_of_cost');
    });
    it('throws on unknown', () => {
      expect(() => getCalculatorById('nope')).toThrow();
    });
    it('listCalculatorsForRole filters', () => {
      expect(listCalculatorsForRole('architect').length).toBeGreaterThan(0);
    });
    it('listCalculatorsByFormulaType filters', () => {
      expect(listCalculatorsByFormulaType('hybrid').length).toBe(2);
    });
  });

  it('produces 7 line items', () => {
    const r = calculateFee({ calculatorId: 't', formulaType: 'percentage_of_cost', vatRate: 0.15 }, { projectValue: 1_000_000 });
    expect(r.lines.length).toBe(7);
  });

  it('rounds all amounts to 2 decimals', () => {
    const r = calculateFee({ calculatorId: 't', formulaType: 'percentage_of_cost', vatRate: 0.15 }, { projectValue: 1_234_567, complexityFactor: 1.15 });
    [r.originalProfessionalFee, r.discountAmount, r.professionalFeeAfterDiscount, r.vatAmount, r.total].forEach(v => expect(Math.round(v * 100) / 100).toBe(v));
  });
});
