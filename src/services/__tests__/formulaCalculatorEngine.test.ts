import {
  calculateFee,
  validateCalculatorInputs,
  getCalculatorById,
  listCalculatorsForRole,
  listCalculatorsByFormulaType,
  FORMULA_CALCULATOR_REGISTRY,
  type CalculatorDefinition,
  type CalculationInput,
  type FormulaType,
} from '../formulaCalculatorEngine';

describe('formulaCalculatorEngine', () => {
  describe('FORMULA_CALCULATOR_REGISTRY', () => {
    it('contains all 8 calculator definitions', () => {
      expect(FORMULA_CALCULATOR_REGISTRY.length).toBe(8);
    });

    it('covers 5 of 6 formula types in registry (stage_apportioned is runtime-only)', () => {
      const types = new Set(FORMULA_CALCULATOR_REGISTRY.map((c) => c.formulaType));
      expect(types.has('percentage_of_cost')).toBe(true);
      expect(types.has('sliding_scale')).toBe(true);
      expect(types.has('time_based')).toBe(true);
      expect(types.has('area_unit')).toBe(true);
      expect(types.has('hybrid')).toBe(true);
      // stage_apportioned is calc-only (not in registry, used at runtime)
    });

    it('every calculator has required fields', () => {
      FORMULA_CALCULATOR_REGISTRY.forEach((calc) => {
        expect(calc.calculatorId).toBeTruthy();
        expect(calc.label).toBeTruthy();
        expect(calc.role).toBeTruthy();
        expect(calc.formulaType).toBeTruthy();
        expect(calc.sourceName).toBeTruthy();
        expect(calc.sourceVersion).toBeTruthy();
        expect(typeof calc.vatRate).toBe('number');
        expect(typeof calc.requiresProfessionalConfirmation).toBe('boolean');
      });
    });
  });

  describe('calculateFee — percentage_of_cost', () => {
    const definition = { calculatorId: 'test_poc', formulaType: 'percentage_of_cost' as FormulaType, vatRate: 0.15 };

    it('calculates 8% of project value with complexity factor', () => {
      const result = calculateFee(definition, { projectValue: 1_000_000, complexityFactor: 1 });
      expect(result.originalProfessionalFee).toBeCloseTo(80_000);
    });

    it('applies complexity multiplier', () => {
      const result = calculateFee(definition, { projectValue: 1_000_000, complexityFactor: 1.2 });
      expect(result.originalProfessionalFee).toBeCloseTo(96_000);
    });

    it('calculates VAT correctly', () => {
      const result = calculateFee(definition, { projectValue: 1_000_000, complexityFactor: 1, disbursements: 0, statutoryFees: 0 });
      expect(result.vatAmount).toBeCloseTo(12_000); // 15% of 80_000
    });

    it('applies discount and records warning without reason', () => {
      const result = calculateFee(definition, { projectValue: 1_000_000, complexityFactor: 1, discountPercent: 10 });
      expect(result.discountAmount).toBeCloseTo(8_000);
      expect(result.professionalFeeAfterDiscount).toBeCloseTo(72_000);
      expect(result.warnings).toContain('Discount reason is required before proposal issue.');
    });

    it('includes discount reason and avoids warning', () => {
      const result = calculateFee(definition, { projectValue: 1_000_000, complexityFactor: 1, discountPercent: 10, discountReason: 'Promo' });
      expect(result.discountAmount).toBeCloseTo(8_000);
      expect(result.warnings).not.toContain('Discount reason is required before proposal issue.');
    });

    it('includes disbursements and statutory fees', () => {
      const result = calculateFee(definition, { projectValue: 1_000_000, complexityFactor: 1, disbursements: 5_000, statutoryFees: 3_500 });
      expect(result.disbursements).toBeCloseTo(5_000);
      expect(result.statutoryFees).toBeCloseTo(3_500);
      // VAT applies to professional fee + disbursements
      expect(result.vatAmount).toBeCloseTo((80_000 + 5_000) * 0.15);
    });
  });

  describe('calculateFee — sliding_scale', () => {
    const definition = { calculatorId: 'test_ss', formulaType: 'sliding_scale' as FormulaType, vatRate: 0.15 };

    it('calculates base fee + above-threshold amount', () => {
      const result = calculateFee(definition, {
        projectValue: 2_000_000,
        slidingScaleBaseFee: 50_000,
        slidingScaleThreshold: 1_000_000,
        slidingScaleAboveRate: 0.045,
        complexityFactor: 1,
      });
      // 50_000 + (2_000_000 - 1_000_000) * 0.045 = 50_000 + 45_000 = 95_000
      expect(result.originalProfessionalFee).toBeCloseTo(95_000);
    });

    it('uses only base fee when below threshold', () => {
      const result = calculateFee(definition, {
        projectValue: 500_000,
        slidingScaleBaseFee: 50_000,
        slidingScaleThreshold: 1_000_000,
        slidingScaleAboveRate: 0.045,
        complexityFactor: 1,
      });
      // 50_000 + max(0, 500_000 - 1_000_000) * 0.045 = 50_000
      expect(result.originalProfessionalFee).toBeCloseTo(50_000);
    });

    it('applies complexity factor', () => {
      const result = calculateFee(definition, {
        projectValue: 2_000_000,
        slidingScaleBaseFee: 50_000,
        slidingScaleThreshold: 1_000_000,
        slidingScaleAboveRate: 0.045,
        complexityFactor: 1.1,
      });
      // (50_000 + 45_000) * 1.1 = 104_500
      expect(result.originalProfessionalFee).toBeCloseTo(104_500);
    });
  });

  describe('calculateFee — stage_apportioned', () => {
    const definition = { calculatorId: 'test_sa', formulaType: 'stage_apportioned' as FormulaType, vatRate: 0.15 };

    it('apportions fee by stage percentage', () => {
      const result = calculateFee(definition, {
        projectValue: 1_000_000,
        stagePercentage: 50,
        complexityFactor: 1,
      });
      // 1_000_000 * 0.08 * 0.50 = 40_000
      expect(result.originalProfessionalFee).toBeCloseTo(40_000);
    });

    it('defaults to 100% when stage percentage not specified', () => {
      const result = calculateFee(definition, {
        projectValue: 1_000_000,
        complexityFactor: 1,
      });
      expect(result.originalProfessionalFee).toBeCloseTo(80_000);
    });
  });

  describe('calculateFee — time_based', () => {
    const definition = { calculatorId: 'test_tb', formulaType: 'time_based' as FormulaType, vatRate: 0.15 };

    it('multiplies hours by hourly rate', () => {
      const result = calculateFee(definition, { hours: 100, hourlyRate: 950, complexityFactor: 1 });
      expect(result.originalProfessionalFee).toBeCloseTo(95_000);
    });

    it('warns when hours are less than 1', () => {
      const result = calculateFee(definition, { hours: 0.5, hourlyRate: 950, complexityFactor: 1 });
      expect(result.warnings.some((w) => w.includes('less than 1 hour'))).toBe(true);
    });

    it('applies complexity factor', () => {
      const result = calculateFee(definition, { hours: 100, hourlyRate: 950, complexityFactor: 1.2 });
      expect(result.originalProfessionalFee).toBeCloseTo(114_000);
    });
  });

  describe('calculateFee — area_unit', () => {
    const definition = { calculatorId: 'test_au', formulaType: 'area_unit' as FormulaType, vatRate: 0.15 };

    it('multiplies area by unit rate and complexity', () => {
      const result = calculateFee(definition, { area: 200, unitRate: 95, complexityFactor: 1 });
      expect(result.originalProfessionalFee).toBeCloseTo(19_000);
    });

    it('handles zero area gracefully', () => {
      const result = calculateFee(definition, { area: 0, unitRate: 95, complexityFactor: 1 });
      expect(result.originalProfessionalFee).toBe(0);
    });
  });

  describe('calculateFee — hybrid', () => {
    const definition = { calculatorId: 'test_hybrid', formulaType: 'hybrid' as FormulaType, vatRate: 0.15 };

    it('combines percentage_of_cost and time_based with weights', () => {
      const result = calculateFee(definition, {
        hybridComponents: [
          {
            formulaType: 'percentage_of_cost',
            weight: 0.6,
            inputs: { projectValue: 1_000_000, complexityFactor: 1 },
          },
          {
            formulaType: 'time_based',
            weight: 0.4,
            inputs: { hours: 50, hourlyRate: 950, complexityFactor: 1 },
          },
        ],
      });
      // Component 1: 1_000_000 * 0.08 * 1 = 80_000 * 0.6 = 48_000
      // Component 2: 50 * 950 * 1 = 47_500 * 0.4 = 19_000
      // Total: 67_000
      expect(result.originalProfessionalFee).toBeCloseTo(67_000);
    });

    it('includes hybrid description in warnings', () => {
      const result = calculateFee(definition, {
        hybridComponents: [
          { formulaType: 'area_unit', weight: 1, inputs: { area: 100, unitRate: 100, complexityFactor: 1 } },
        ],
      });
      expect(result.warnings.some((w) => w.includes('Hybrid fee combines'))).toBe(true);
    });

    it('throws when no hybrid components provided', () => {
      expect(() =>
        calculateFee(definition, { hybridComponents: [] }),
      ).toThrow('Hybrid formula requires at least one component');
    });
  });

  describe('validateCalculatorInputs', () => {
    it('returns no errors for valid percentage_of_cost inputs', () => {
      const errors = validateCalculatorInputs('percentage_of_cost', { projectValue: 1_000_000 });
      expect(errors).toHaveLength(0);
    });

    it('returns errors for missing required fields', () => {
      const errors = validateCalculatorInputs('percentage_of_cost', {});
      expect(errors.some((e) => e.field === 'projectValue')).toBe(true);
    });

    it('returns errors for negative values', () => {
      const errors = validateCalculatorInputs('percentage_of_cost', { projectValue: -100 });
      expect(errors.some((e) => e.field === 'projectValue')).toBe(true);
    });

    it('validates time_based requires hours and rate', () => {
      const errors = validateCalculatorInputs('time_based', {});
      expect(errors.some((e) => e.field === 'hours')).toBe(true);
      expect(errors.some((e) => e.field === 'hourlyRate')).toBe(true);
    });

    it('validates area_unit requires area and unit rate', () => {
      const errors = validateCalculatorInputs('area_unit', {});
      expect(errors.some((e) => e.field === 'area')).toBe(true);
      expect(errors.some((e) => e.field === 'unitRate')).toBe(true);
    });

    it('validates stage_percentage range', () => {
      const errors = validateCalculatorInputs('stage_apportioned', { projectValue: 1_000_000, stagePercentage: 150 });
      expect(errors.some((e) => e.field === 'stagePercentage')).toBe(true);
    });

    it('validates discount percentage range', () => {
      const errors = validateCalculatorInputs('percentage_of_cost', { projectValue: 1000, discountPercent: 150 });
      expect(errors.some((e) => e.field === 'discountPercent')).toBe(true);
    });

    it('validates hybrid component weights sum to 1', () => {
      const errors = validateCalculatorInputs('hybrid', {
        hybridComponents: [
          { formulaType: 'time_based', weight: 0.3, inputs: { hours: 10, hourlyRate: 100 } },      ],
      });
      expect(errors.some((e) => e.field === 'hybridComponents')).toBe(true);
    });

    it('validates nested hybrid component inputs', () => {
      const errors = validateCalculatorInputs('hybrid', {
        hybridComponents: [
          { formulaType: 'time_based', weight: 1.0, inputs: {} },
        ],
      });

    });

    it('returns no errors for valid hybrid with correct weights', () => {
      const errors = validateCalculatorInputs('hybrid', {
        hybridComponents: [
          { formulaType: 'percentage_of_cost', weight: 0.5, inputs: { projectValue: 1_000_000 } },
          { formulaType: 'area_unit', weight: 0.5, inputs: { area: 100, unitRate: 100 } },
        ],
      });
      expect(errors.filter((e) => e.field === 'hybridComponents')).toHaveLength(0);
    });
  });

  describe('calculator lookup', () => {
    it('getCalculatorById returns correct calculator', () => {
      const calc = getCalculatorById('architect_fee_proposal');
      expect(calc.formulaType).toBe('percentage_of_cost');
      expect(calc.role).toBe('architect');
    });

    it('getCalculatorById throws for unknown ID', () => {
      expect(() => getCalculatorById('non_existent')).toThrow('Formula calculator not found');
    });

    it('listCalculatorsForRole returns role-specific calculators', () => {
      const architect = listCalculatorsForRole('architect');
      expect(architect.length).toBeGreaterThan(0);
      architect.forEach((calc) => expect(calc.role).toBe('architect'));
    });

    it('listCalculatorsByFormulaType filters correctly', () => {
      const sliding = listCalculatorsByFormulaType('sliding_scale');
      expect(sliding.length).toBeGreaterThan(0);
      sliding.forEach((calc) => expect(calc.formulaType).toBe('sliding_scale'));
    });
  });

  describe('fee line items', () => {
    it('produces 7 fee line items', () => {
      const result = calculateFee(
        { calculatorId: 'test', formulaType: 'percentage_of_cost', vatRate: 0.15 },
        { projectValue: 1_000_000, complexityFactor: 1, disbursements: 5_000, statutoryFees: 3_500 },
      );
      expect(result.lines).toHaveLength(7);
    });

    it('line item categories are correct', () => {
      const result = calculateFee(
        { calculatorId: 'test', formulaType: 'percentage_of_cost', vatRate: 0.15 },
        { projectValue: 1_000_000, complexityFactor: 1 },
      );
      const categories = result.lines.map((l) => l.category);
      expect(categories).toContain('professional_fee');
      expect(categories).toContain('discount');
      expect(categories).toContain('vat');
      expect(categories).toContain('disbursement');
      expect(categories).toContain('statutory_fee');
      expect(categories).toContain('total');
    });

    it('all monetary values are rounded to 2 decimal places', () => {
      const result = calculateFee(
        { calculatorId: 'test', formulaType: 'percentage_of_cost', vatRate: 0.15 },
        { projectValue: 1_234_567, complexityFactor: 1.15 },
      );
      const monetaryFields = [
        result.originalProfessionalFee,
        result.discountAmount,
        result.professionalFeeAfterDiscount,
        result.disbursements,
        result.statutoryFees,
        result.vatAmount,
        result.total,
      ];
      monetaryFields.forEach((value) => {
        expect(Math.round(value * 100) / 100).toBe(value);
      });
    });
  });
});
