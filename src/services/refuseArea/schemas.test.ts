/**
 * Unit tests for Municipal Refuse Area Calculator — Zod Validation Schemas
 *
 * Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 *
 * @vitest-environment node
 */

import {
  residentialInputsSchema,
  commercialInputsSchema,
  industrialInputsSchema,
  mixedUseInputsSchema,
  buildingInputsSchema,
} from './schemas';

describe('residentialInputsSchema', () => {
  it('accepts valid residential inputs', () => {
    const result = residentialInputsSchema.safeParse({
      unitCount: 24,
      averageOccupantsPerUnit: 4,
    });
    expect(result.success).toBe(true);
  });

  it('accepts boundary values', () => {
    expect(residentialInputsSchema.safeParse({ unitCount: 1, averageOccupantsPerUnit: 1 }).success).toBe(true);
    expect(residentialInputsSchema.safeParse({ unitCount: 10000, averageOccupantsPerUnit: 20 }).success).toBe(true);
  });

  it('accepts values with up to 2 decimal places', () => {
    expect(residentialInputsSchema.safeParse({ unitCount: 1.5, averageOccupantsPerUnit: 2.25 }).success).toBe(true);
  });

  it('rejects zero values', () => {
    const result = residentialInputsSchema.safeParse({ unitCount: 0, averageOccupantsPerUnit: 4 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be between 1 and 10000');
    }
  });

  it('rejects negative values', () => {
    const result = residentialInputsSchema.safeParse({ unitCount: -5, averageOccupantsPerUnit: 4 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be between 1 and 10000');
    }
  });

  it('rejects values exceeding upper bounds', () => {
    const result = residentialInputsSchema.safeParse({ unitCount: 10001, averageOccupantsPerUnit: 4 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be between 1 and 10000');
    }
  });

  it('rejects more than 2 decimal places', () => {
    const result = residentialInputsSchema.safeParse({ unitCount: 5.123, averageOccupantsPerUnit: 4 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Maximum 2 decimal places');
    }
  });

  it('rejects missing fields', () => {
    const result = residentialInputsSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Required')).toBe(true);
    }
  });
});

describe('commercialInputsSchema', () => {
  it('accepts valid commercial inputs', () => {
    const result = commercialInputsSchema.safeParse({
      grossFloorArea: 2500,
      estimatedOccupantCount: 150,
    });
    expect(result.success).toBe(true);
  });

  it('rejects floor area exceeding 500,000', () => {
    const result = commercialInputsSchema.safeParse({
      grossFloorArea: 500001,
      estimatedOccupantCount: 150,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be between 1 and 500000');
    }
  });

  it('rejects occupant count exceeding 100,000', () => {
    const result = commercialInputsSchema.safeParse({
      grossFloorArea: 2500,
      estimatedOccupantCount: 100001,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be between 1 and 100000');
    }
  });
});

describe('industrialInputsSchema', () => {
  it('accepts valid industrial inputs', () => {
    const result = industrialInputsSchema.safeParse({
      grossFloorArea: 5000,
      numberOfEmployees: 200,
      wasteGenerationCategory: 'medium',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing waste generation category', () => {
    const result = industrialInputsSchema.safeParse({
      grossFloorArea: 5000,
      numberOfEmployees: 200,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message === 'Required')).toBe(true);
    }
  });

  it('rejects invalid waste generation category', () => {
    const result = industrialInputsSchema.safeParse({
      grossFloorArea: 5000,
      numberOfEmployees: 200,
      wasteGenerationCategory: 'extreme',
    });
    expect(result.success).toBe(false);
  });

  it('rejects employees exceeding 50,000', () => {
    const result = industrialInputsSchema.safeParse({
      grossFloorArea: 5000,
      numberOfEmployees: 50001,
      wasteGenerationCategory: 'light',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Must be between 1 and 50000');
    }
  });
});

describe('mixedUseInputsSchema', () => {
  it('accepts mixed-use with 2 or more components', () => {
    const result = mixedUseInputsSchema.safeParse({
      components: [
        { type: 'residential', inputs: { unitCount: 24, averageOccupantsPerUnit: 4 } },
        { type: 'commercial', inputs: { grossFloorArea: 1000, estimatedOccupantCount: 50 } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects mixed-use with fewer than 2 components', () => {
    const result = mixedUseInputsSchema.safeParse({
      components: [
        { type: 'residential', inputs: { unitCount: 24, averageOccupantsPerUnit: 4 } },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('At least two usage components required');
    }
  });

  it('rejects mixed-use with zero components', () => {
    const result = mixedUseInputsSchema.safeParse({
      components: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('At least two usage components required');
    }
  });

  it('validates individual component inputs within mixed-use', () => {
    const result = mixedUseInputsSchema.safeParse({
      components: [
        { type: 'residential', inputs: { unitCount: 0, averageOccupantsPerUnit: 4 } },
        { type: 'commercial', inputs: { grossFloorArea: 1000, estimatedOccupantCount: 50 } },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('buildingInputsSchema', () => {
  it('accepts valid residential building input', () => {
    const result = buildingInputsSchema.safeParse({
      type: 'residential',
      data: { unitCount: 24, averageOccupantsPerUnit: 4 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid commercial building input', () => {
    const result = buildingInputsSchema.safeParse({
      type: 'commercial',
      data: { grossFloorArea: 2500, estimatedOccupantCount: 150 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid industrial building input', () => {
    const result = buildingInputsSchema.safeParse({
      type: 'industrial',
      data: { grossFloorArea: 5000, numberOfEmployees: 200, wasteGenerationCategory: 'heavy' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid mixed-use building input', () => {
    const result = buildingInputsSchema.safeParse({
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 3 } },
          { type: 'industrial', inputs: { grossFloorArea: 2000, numberOfEmployees: 100, wasteGenerationCategory: 'light' } },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid data for specified building type', () => {
    const result = buildingInputsSchema.safeParse({
      type: 'residential',
      data: { grossFloorArea: 2500, estimatedOccupantCount: 150 },
    });
    expect(result.success).toBe(false);
  });
});
