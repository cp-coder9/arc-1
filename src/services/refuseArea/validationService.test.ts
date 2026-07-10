/**
 * Unit tests for validationService
 *
 * Requirements: 2.6, 2.7, 2.8, 2.9
 */

import { validateField, validateBuildingInputs, isFormValid } from './validationService';
import type { BuildingInputs } from './types';

describe('validateField', () => {
  describe('required fields', () => {
    it('returns "Required" for undefined value', () => {
      expect(validateField('unitCount', undefined, 'residential')).toBe('Required');
    });

    it('returns "Required" for null value', () => {
      expect(validateField('unitCount', null, 'residential')).toBe('Required');
    });

    it('returns "Required" for empty string', () => {
      expect(validateField('unitCount', '', 'residential')).toBe('Required');
    });

    it('returns "Required" for NaN', () => {
      expect(validateField('unitCount', NaN, 'residential')).toBe('Required');
    });
  });

  describe('residential fields', () => {
    it('accepts valid unitCount', () => {
      expect(validateField('unitCount', 100, 'residential')).toBeNull();
    });

    it('accepts unitCount at lower bound', () => {
      expect(validateField('unitCount', 1, 'residential')).toBeNull();
    });

    it('accepts unitCount at upper bound', () => {
      expect(validateField('unitCount', 10_000, 'residential')).toBeNull();
    });

    it('rejects unitCount below lower bound', () => {
      expect(validateField('unitCount', 0, 'residential')).toBe('Must be between 1 and 10000');
    });

    it('rejects unitCount above upper bound', () => {
      expect(validateField('unitCount', 10_001, 'residential')).toBe('Must be between 1 and 10000');
    });

    it('accepts valid averageOccupantsPerUnit', () => {
      expect(validateField('averageOccupantsPerUnit', 4, 'residential')).toBeNull();
    });

    it('accepts averageOccupantsPerUnit with 2 decimal places', () => {
      expect(validateField('averageOccupantsPerUnit', 2.55, 'residential')).toBeNull();
    });

    it('rejects averageOccupantsPerUnit above 20', () => {
      expect(validateField('averageOccupantsPerUnit', 21, 'residential')).toBe(
        'Must be between 1 and 20'
      );
    });
  });

  describe('commercial fields', () => {
    it('accepts valid grossFloorArea', () => {
      expect(validateField('grossFloorArea', 1000, 'commercial')).toBeNull();
    });

    it('rejects grossFloorArea exceeding 500,000', () => {
      expect(validateField('grossFloorArea', 500_001, 'commercial')).toBe(
        'Must be between 1 and 500000'
      );
    });

    it('accepts valid estimatedOccupantCount', () => {
      expect(validateField('estimatedOccupantCount', 500, 'commercial')).toBeNull();
    });

    it('rejects estimatedOccupantCount exceeding 100,000', () => {
      expect(validateField('estimatedOccupantCount', 100_001, 'commercial')).toBe(
        'Must be between 1 and 100000'
      );
    });
  });

  describe('industrial fields', () => {
    it('accepts valid numberOfEmployees', () => {
      expect(validateField('numberOfEmployees', 100, 'industrial')).toBeNull();
    });

    it('rejects numberOfEmployees exceeding 50,000', () => {
      expect(validateField('numberOfEmployees', 50_001, 'industrial')).toBe(
        'Must be between 1 and 50000'
      );
    });

    it('accepts valid wasteGenerationCategory', () => {
      expect(validateField('wasteGenerationCategory', 'light', 'industrial')).toBeNull();
      expect(validateField('wasteGenerationCategory', 'medium', 'industrial')).toBeNull();
      expect(validateField('wasteGenerationCategory', 'heavy', 'industrial')).toBeNull();
    });

    it('rejects invalid wasteGenerationCategory', () => {
      expect(validateField('wasteGenerationCategory', 'extreme', 'industrial')).toBe('Required');
    });

    it('rejects empty wasteGenerationCategory', () => {
      expect(validateField('wasteGenerationCategory', '', 'industrial')).toBe('Required');
    });
  });

  describe('decimal places', () => {
    it('accepts values with 0 decimal places', () => {
      expect(validateField('grossFloorArea', 100, 'commercial')).toBeNull();
    });

    it('accepts values with 1 decimal place', () => {
      expect(validateField('grossFloorArea', 100.5, 'commercial')).toBeNull();
    });

    it('accepts values with 2 decimal places', () => {
      expect(validateField('grossFloorArea', 100.55, 'commercial')).toBeNull();
    });

    it('rejects values with more than 2 decimal places', () => {
      expect(validateField('grossFloorArea', 100.555, 'commercial')).toBe(
        'Maximum 2 decimal places'
      );
    });
  });

  describe('unknown fields', () => {
    it('returns null for unknown field names', () => {
      expect(validateField('unknownField', 42, 'residential')).toBeNull();
    });
  });
});

describe('validateBuildingInputs', () => {
  describe('residential', () => {
    it('returns empty errors for valid inputs', () => {
      const inputs: BuildingInputs = {
        type: 'residential',
        data: { unitCount: 24, averageOccupantsPerUnit: 4 },
      };
      expect(validateBuildingInputs(inputs)).toEqual({});
    });

    it('returns errors for invalid inputs', () => {
      const inputs: BuildingInputs = {
        type: 'residential',
        data: { unitCount: 0, averageOccupantsPerUnit: 25 },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['unitCount']).toBe('Must be between 1 and 10000');
      expect(errors['averageOccupantsPerUnit']).toBe('Must be between 1 and 20');
    });
  });

  describe('commercial', () => {
    it('returns empty errors for valid inputs', () => {
      const inputs: BuildingInputs = {
        type: 'commercial',
        data: { grossFloorArea: 5000, estimatedOccupantCount: 200 },
      };
      expect(validateBuildingInputs(inputs)).toEqual({});
    });

    it('returns errors for out-of-range inputs', () => {
      const inputs: BuildingInputs = {
        type: 'commercial',
        data: { grossFloorArea: 600_000, estimatedOccupantCount: 0 },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['grossFloorArea']).toBe('Must be between 1 and 500000');
      expect(errors['estimatedOccupantCount']).toBe('Must be between 1 and 100000');
    });
  });

  describe('industrial', () => {
    it('returns empty errors for valid inputs', () => {
      const inputs: BuildingInputs = {
        type: 'industrial',
        data: { grossFloorArea: 10_000, numberOfEmployees: 500, wasteGenerationCategory: 'medium' },
      };
      expect(validateBuildingInputs(inputs)).toEqual({});
    });

    it('returns error for missing wasteGenerationCategory', () => {
      const inputs: BuildingInputs = {
        type: 'industrial',
        data: {
          grossFloorArea: 10_000,
          numberOfEmployees: 500,
          wasteGenerationCategory: '' as 'light',
        },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['wasteGenerationCategory']).toBe('Required');
    });
  });

  describe('mixed-use', () => {
    it('returns empty errors for valid mixed-use with 2 components', () => {
      const inputs: BuildingInputs = {
        type: 'mixed-use',
        data: {
          components: [
            { type: 'residential', inputs: { unitCount: 20, averageOccupantsPerUnit: 3 } },
            { type: 'commercial', inputs: { grossFloorArea: 2000, estimatedOccupantCount: 100 } },
          ],
        },
      };
      expect(validateBuildingInputs(inputs)).toEqual({});
    });

    it('returns error when fewer than 2 components', () => {
      const inputs: BuildingInputs = {
        type: 'mixed-use',
        data: {
          components: [
            { type: 'residential', inputs: { unitCount: 20, averageOccupantsPerUnit: 3 } },
          ],
        },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['components']).toBe('At least two usage components required');
    });

    it('returns error when components array is empty', () => {
      const inputs: BuildingInputs = {
        type: 'mixed-use',
        data: { components: [] },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['components']).toBe('At least two usage components required');
    });

    it('validates individual component fields', () => {
      const inputs: BuildingInputs = {
        type: 'mixed-use',
        data: {
          components: [
            { type: 'residential', inputs: { unitCount: 0, averageOccupantsPerUnit: 3 } },
            { type: 'commercial', inputs: { grossFloorArea: 2000, estimatedOccupantCount: 100 } },
          ],
        },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['components[0].unitCount']).toBe('Must be between 1 and 10000');
    });

    it('validates industrial component within mixed-use', () => {
      const inputs: BuildingInputs = {
        type: 'mixed-use',
        data: {
          components: [
            { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 2 } },
            {
              type: 'industrial',
              inputs: {
                grossFloorArea: 5000,
                numberOfEmployees: 60_000,
                wasteGenerationCategory: 'heavy',
              },
            },
          ],
        },
      };
      const errors = validateBuildingInputs(inputs);
      expect(errors['components[1].numberOfEmployees']).toBe('Must be between 1 and 50000');
    });
  });
});

describe('isFormValid', () => {
  it('returns true for valid residential inputs', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 24, averageOccupantsPerUnit: 4 },
    };
    expect(isFormValid(inputs)).toBe(true);
  });

  it('returns false for invalid inputs', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 0, averageOccupantsPerUnit: 4 },
    };
    expect(isFormValid(inputs)).toBe(false);
  });

  it('returns false for mixed-use with fewer than 2 components', () => {
    const inputs: BuildingInputs = {
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 2 } },
        ],
      },
    };
    expect(isFormValid(inputs)).toBe(false);
  });

  it('returns true for valid mixed-use with 2+ components', () => {
    const inputs: BuildingInputs = {
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 2 } },
          { type: 'commercial', inputs: { grossFloorArea: 3000, estimatedOccupantCount: 150 } },
        ],
      },
    };
    expect(isFormValid(inputs)).toBe(true);
  });
});
