import {
  DEFAULT_FEE_ESTIMATOR_INPUT,
  DEFAULT_FEE_ESTIMATOR_SETTINGS,
  estimateArchitecturalFee,
  mergeFeeEstimatorSettings,
  sanitizeFeeEstimatorSettings,
} from '../feeEstimatorService';

describe('feeEstimatorService', () => {
  test('uses the PRD-mandated one percent platform fee default', () => {
    expect(DEFAULT_FEE_ESTIMATOR_SETTINGS.platformFeePercent).toBe(1);

    const estimate = estimateArchitecturalFee({
      ...DEFAULT_FEE_ESTIMATOR_INPUT,
      constructionValue: 1_000_000,
      includePlatformFee: true,
      includeCouncilAdmin: false,
      deliverables: [],
    }, {
      ...DEFAULT_FEE_ESTIMATOR_SETTINGS,
      baseFeePercentByProjectType: { ...DEFAULT_FEE_ESTIMATOR_SETTINGS.baseFeePercentByProjectType, residential: 10 },
      complexityMultipliers: { ...DEFAULT_FEE_ESTIMATOR_SETTINGS.complexityMultipliers, standard: 1 },
      urgencyMultipliers: { ...DEFAULT_FEE_ESTIMATOR_SETTINGS.urgencyMultipliers, standard: 1 },
      minimumProfessionalFee: 0,
      vatRate: 0,
    });

    expect(estimate.professionalFee).toBeGreaterThan(0);
    expect(estimate.platformFee).toBeCloseTo(estimate.professionalFee * 0.01, 6);
  });
  test('calculates an itemized estimate with VAT, platform and council fees', () => {
    const estimate = estimateArchitecturalFee({
      ...DEFAULT_FEE_ESTIMATOR_INPUT,
      constructionValue: 2_000_000,
      complexity: 'high',
      vatApplicable: true,
      includePlatformFee: true,
      includeCouncilAdmin: true,
    }, DEFAULT_FEE_ESTIMATOR_SETTINGS);

    expect(estimate.valueOfWorks).toBe(2_000_000);
    expect(estimate.professionalFee).toBeGreaterThan(0);
    expect(estimate.deliverableTotal).toBe(23_000);
    expect(estimate.councilAdminFee).toBe(3_500);
    expect(estimate.platformFee).toBeGreaterThan(0);
    expect(estimate.vat).toBeGreaterThan(0);
    expect(estimate.total).toBeGreaterThan(estimate.subtotalExVat);
    expect(estimate.breakdown).toHaveLength(5);
  });

  test('derives value of works from area when construction value is missing', () => {
    const estimate = estimateArchitecturalFee({
      ...DEFAULT_FEE_ESTIMATOR_INPUT,
      constructionValue: 0,
      areaSqm: 100,
      projectType: 'residential',
      includePlatformFee: false,
      includeCouncilAdmin: false,
      deliverables: [],
    }, DEFAULT_FEE_ESTIMATOR_SETTINGS);

    expect(estimate.valueOfWorks).toBe(950_000);
    expect(estimate.platformFee).toBe(0);
    expect(estimate.councilAdminFee).toBe(0);
  });

  test('merges partial admin settings with safe defaults', () => {
    const settings = mergeFeeEstimatorSettings({
      platformFeePercent: 7,
      baseFeePercentByProjectType: { residential: 9.25 } as any,
    });

    expect(settings.platformFeePercent).toBe(7);
    expect(settings.baseFeePercentByProjectType.residential).toBe(9.25);
    expect(settings.baseFeePercentByProjectType.commercial).toBe(DEFAULT_FEE_ESTIMATOR_SETTINGS.baseFeePercentByProjectType.commercial);
    expect(settings.stageWeightings.length).toBeGreaterThan(0);
  });

  test('sanitizes admin-editable fee settings to non-negative finite values', () => {
    const settings = sanitizeFeeEstimatorSettings({
      baseFeePercentByProjectType: { residential: -4, commercial: Number.NaN } as any,
      deliverableFees: { conceptDesign: -2500 } as any,
      stageWeightings: [
        { ...DEFAULT_FEE_ESTIMATOR_SETTINGS.stageWeightings[0], weighting: -10 },
      ],
      platformFeePercent: Number.POSITIVE_INFINITY,
      councilAdminFee: -1,
      vatRate: Number.NaN,
      minimumProfessionalFee: -500,
    });

    expect(settings.baseFeePercentByProjectType.residential).toBe(0);
    expect(settings.baseFeePercentByProjectType.commercial).toBe(DEFAULT_FEE_ESTIMATOR_SETTINGS.baseFeePercentByProjectType.commercial);
    expect(settings.deliverableFees.conceptDesign).toBe(0);
    expect(settings.stageWeightings[0].weighting).toBe(0);
    expect(settings.platformFeePercent).toBe(DEFAULT_FEE_ESTIMATOR_SETTINGS.platformFeePercent);
    expect(settings.councilAdminFee).toBe(0);
    expect(settings.vatRate).toBe(DEFAULT_FEE_ESTIMATOR_SETTINGS.vatRate);
    expect(settings.minimumProfessionalFee).toBe(0);
  });
});
