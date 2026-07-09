/**
 * Unit tests for refuseAreaCalculatorService — Task 3.1
 * Tests waste volume computation for all building types.
 */

import { computeWasteVolume, computeRefuseArea, computeAreaAndDimensions } from './refuseAreaCalculatorService';
import type { Municipality_Profile, BuildingInputs } from './types';

/** Minimal valid municipality profile for testing */
function createTestProfile(overrides?: Partial<Municipality_Profile>): Municipality_Profile {
  return {
    id: 'test-municipality',
    name: 'Test Municipality',
    isFallback: false,
    lastUpdated: '2026-04-30T00:00:00.000Z',
    wasteRates: {
      residential: { litresPerUnitPerCycle: 240, collectionCycleDays: 7 },
      commercial: { litresPerSqmPerCycle: 0.8, collectionCycleDays: 7 },
      industrial: {
        light: { litresPerSqmPerCycle: 0.5 },
        medium: { litresPerSqmPerCycle: 1.0 },
        heavy: { litresPerSqmPerCycle: 2.0 },
        collectionCycleDays: 7,
      },
    },
    binStandards: {
      availableSizes: [
        { capacityLitres: 240, footprint: { length: 0.6, width: 0.5 }, label: '240L Wheelie Bin' },
        { capacityLitres: 1100, footprint: { length: 1.2, width: 1.0 }, label: '1100L Skip Bin' },
      ],
      maxBinsPerCollectionPoint: 20,
      separateWasteStreams: false,
    },
    areaRequirements: {
      minimumFloorArea: 4.0,
      minimumClearanceHeight: null,
      perBinFootprint: { length: 0.6, width: 0.5 },
    },
    vehicleAccess: {
      minimumRoadWidth: 3.5,
      turningCircleRadius: 12.0,
      maximumGradient: 8.0,
      maximumCarryDistance: 15.0,
      hardstandRequired: true,
      hardstandDimensions: { length: 6.0, width: 3.5 },
    },
    ventilation: {
      type: 'natural',
      naturalOpeningArea: 0.5,
      mechanicalRate: null,
    },
    drainage: {
      floorGradient: 1.5,
      drainDiameter: 100,
      washDownProvision: {
        required: true,
        type: 'hose_connection',
        location: 'within 3m of refuse room entrance',
      },
    },
    pestControl: {
      requirements: 'Vermin-proof door seals and mesh ventilation screens required.',
    },
    ...overrides,
  };
}

describe('computeWasteVolume', () => {
  const profile = createTestProfile();

  it('computes residential volume = unitCount × litresPerUnitPerCycle', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 24, averageOccupantsPerUnit: 4 },
    };
    const volume = computeWasteVolume(profile, inputs);
    expect(volume).toBe(24 * 240); // 5760
  });

  it('computes commercial volume = grossFloorArea × litresPerSqmPerCycle', () => {
    const inputs: BuildingInputs = {
      type: 'commercial',
      data: { grossFloorArea: 1000, estimatedOccupantCount: 200 },
    };
    const volume = computeWasteVolume(profile, inputs);
    expect(volume).toBe(1000 * 0.8); // 800
  });

  it('computes industrial volume using correct category rate', () => {
    const inputs: BuildingInputs = {
      type: 'industrial',
      data: { grossFloorArea: 2000, numberOfEmployees: 50, wasteGenerationCategory: 'heavy' },
    };
    const volume = computeWasteVolume(profile, inputs);
    expect(volume).toBe(2000 * 2.0); // 4000
  });

  it('computes industrial light category correctly', () => {
    const inputs: BuildingInputs = {
      type: 'industrial',
      data: { grossFloorArea: 500, numberOfEmployees: 10, wasteGenerationCategory: 'light' },
    };
    const volume = computeWasteVolume(profile, inputs);
    expect(volume).toBe(500 * 0.5); // 250
  });

  it('computes industrial medium category correctly', () => {
    const inputs: BuildingInputs = {
      type: 'industrial',
      data: { grossFloorArea: 1500, numberOfEmployees: 30, wasteGenerationCategory: 'medium' },
    };
    const volume = computeWasteVolume(profile, inputs);
    expect(volume).toBe(1500 * 1.0); // 1500
  });

  it('computes mixed-use volume as sum of component volumes', () => {
    const inputs: BuildingInputs = {
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 3 } },
          { type: 'commercial', inputs: { grossFloorArea: 500, estimatedOccupantCount: 100 } },
        ],
      },
    };
    const volume = computeWasteVolume(profile, inputs);
    const expectedResidential = 10 * 240; // 2400
    const expectedCommercial = 500 * 0.8; // 400
    expect(volume).toBe(expectedResidential + expectedCommercial); // 2800
  });

  it('computes mixed-use with three components including industrial', () => {
    const inputs: BuildingInputs = {
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 5, averageOccupantsPerUnit: 2 } },
          { type: 'commercial', inputs: { grossFloorArea: 200, estimatedOccupantCount: 40 } },
          { type: 'industrial', inputs: { grossFloorArea: 300, numberOfEmployees: 15, wasteGenerationCategory: 'medium' as const } },
        ],
      },
    };
    const volume = computeWasteVolume(profile, inputs);
    const expectedResidential = 5 * 240; // 1200
    const expectedCommercial = 200 * 0.8; // 160
    const expectedIndustrial = 300 * 1.0; // 300
    expect(volume).toBe(expectedResidential + expectedCommercial + expectedIndustrial); // 1660
  });
});

describe('computeRefuseArea', () => {
  const profile = createTestProfile();

  it('returns a valid result structure with all required fields', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 24, averageOccupantsPerUnit: 4 },
    };
    const result = computeRefuseArea(profile, inputs);

    expect(result.id).toBeTruthy();
    expect(result.computedAt).toBeTruthy();
    expect(result.municipalityId).toBe('test-municipality');
    expect(result.municipalityName).toBe('Test Municipality');
    expect(result.profileLastUpdated).toBe('30 Apr 2026');
    expect(result.buildingType).toBe('residential');
    expect(result.inputs).toEqual(inputs);
    expect(result.advisoryDisclaimer).toContain('advisory only');
    expect(result.advisoryDisclaimer).toContain('does not constitute legal compliance certification');
  });

  it('computes correct total waste volume in bins result', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 10, averageOccupantsPerUnit: 3 },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.bins.totalWasteVolumeLitres).toBe(10 * 240); // 2400
  });

  it('generates unique IDs for each computation', () => {
    const inputs: BuildingInputs = {
      type: 'commercial',
      data: { grossFloorArea: 100, estimatedOccupantCount: 20 },
    };
    const result1 = computeRefuseArea(profile, inputs);
    const result2 = computeRefuseArea(profile, inputs);
    expect(result1.id).not.toBe(result2.id);
  });

  it('includes component areas for mixed-use inputs', () => {
    const inputs: BuildingInputs = {
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 3 } },
          { type: 'commercial', inputs: { grossFloorArea: 500, estimatedOccupantCount: 100 } },
        ],
      },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.area.componentAreas).toBeDefined();
    expect(result.area.componentAreas).toHaveLength(2);
    expect(result.area.componentAreas![0].type).toBe('residential');
    expect(result.area.componentAreas![1].type).toBe('commercial');
  });

  it('does not include component areas for non-mixed-use inputs', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 5, averageOccupantsPerUnit: 2 },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.area.componentAreas).toBeUndefined();
  });

  it('formats profileLastUpdated as DD MMM YYYY', () => {
    const profileWithDate = createTestProfile({ lastUpdated: '2025-12-01T00:00:00.000Z' });
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 1, averageOccupantsPerUnit: 1 },
    };
    const result = computeRefuseArea(profileWithDate, inputs);
    expect(result.profileLastUpdated).toBe('01 Dec 2025');
  });

  it('includes advisory disclaimer text', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 1, averageOccupantsPerUnit: 1 },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.advisoryDisclaimer).toBe(
      'This output is advisory only. It does not constitute legal compliance certification. Results are derived from interpreted municipal guidelines and must be verified by a qualified professional against current local bylaws.'
    );
  });

  it('passes through vehicle access data from profile', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 1, averageOccupantsPerUnit: 1 },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.vehicleAccess.minimumRoadWidth).toBe(3.5);
    expect(result.vehicleAccess.turningCircleRadius).toBe(12.0);
    expect(result.vehicleAccess.maximumGradient).toBe(8.0);
    expect(result.vehicleAccess.maximumCarryDistance).toBe(15.0);
    expect(result.vehicleAccess.hardstandRequired).toBe(true);
    expect(result.vehicleAccess.missingFields).toEqual([]);
  });

  it('passes through ventilation data from profile', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 1, averageOccupantsPerUnit: 1 },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.ventilation.type).toBe('natural');
    expect(result.ventilation.naturalOpeningArea).toBe(0.5);
    expect(result.ventilation.mechanicalRate).toBeNull();
    expect(result.ventilation.missingFields).toContain('mechanicalRate');
  });

  it('passes through pest control requirements', () => {
    const inputs: BuildingInputs = {
      type: 'residential',
      data: { unitCount: 1, averageOccupantsPerUnit: 1 },
    };
    const result = computeRefuseArea(profile, inputs);
    expect(result.pestControl).toBe('Vermin-proof door seals and mesh ventilation screens required.');
  });
});


describe('computeAreaAndDimensions', () => {
  const baseProfile = createTestProfile();

  it('applies 1.3 circulation factor to bin floor space', () => {
    // binFloorSpace = 5.0 m², profile minimumFloorArea = 4.0
    // requiredArea = max(5.0 * 1.3, 4.0) = 6.5
    const result = computeAreaAndDimensions(5.0, baseProfile);
    expect(result.totalAreaSqm).toBe(6.5);
    expect(result.minimumApplied).toBe(false);
  });

  it('uses profile minimumFloorArea when larger than bin floor space × 1.3', () => {
    // binFloorSpace = 1.0, 1.0 * 1.3 = 1.3, but profile min is 4.0
    const result = computeAreaAndDimensions(1.0, baseProfile);
    expect(result.totalAreaSqm).toBe(4.0);
    expect(result.minimumApplied).toBe(false);
  });

  it('enforces 4.0 m² absolute minimum when profile minimum is lower', () => {
    const lowMinProfile = createTestProfile({
      areaRequirements: {
        minimumFloorArea: 2.0,
        minimumClearanceHeight: null,
        perBinFootprint: { length: 0.6, width: 0.5 },
      },
    });
    // binFloorSpace = 1.0, 1.0 * 1.3 = 1.3, profile min = 2.0
    // max(1.3, 2.0) = 2.0, but 2.0 < 4.0 → enforce 4.0
    const result = computeAreaAndDimensions(1.0, lowMinProfile);
    expect(result.totalAreaSqm).toBe(4.0);
    expect(result.minimumApplied).toBe(true);
  });

  it('sets minimumApplied = false when area >= 4.0 naturally', () => {
    const result = computeAreaAndDimensions(10.0, baseProfile);
    expect(result.totalAreaSqm).toBe(13.0); // 10 * 1.3
    expect(result.minimumApplied).toBe(false);
  });

  it('rounds total area to 2 decimal places', () => {
    // binFloorSpace = 3.333..., 3.333 * 1.3 = 4.333...
    const result = computeAreaAndDimensions(3.333, baseProfile);
    // max(3.333 * 1.3, 4.0) = max(4.3329, 4.0) = 4.3329 → rounded to 4.33
    expect(result.totalAreaSqm).toBe(4.33);
  });

  it('uses default height of 2.4 when profile clearance height is null', () => {
    const result = computeAreaAndDimensions(5.0, baseProfile);
    expect(result.dimensions.height).toBe(2.4);
  });

  it('uses profile clearance height when specified', () => {
    const customHeightProfile = createTestProfile({
      areaRequirements: {
        minimumFloorArea: 4.0,
        minimumClearanceHeight: 3.0,
        perBinFootprint: { length: 0.6, width: 0.5 },
      },
    });
    const result = computeAreaAndDimensions(5.0, customHeightProfile);
    expect(result.dimensions.height).toBe(3.0);
  });

  it('computes width as ceil(sqrt(area) × 10) / 10', () => {
    // area = 6.5, sqrt(6.5) ≈ 2.5495..., * 10 = 25.495, ceil = 26, / 10 = 2.6
    const result = computeAreaAndDimensions(5.0, baseProfile);
    expect(result.dimensions.width).toBe(2.6);
  });

  it('computes length as ceil((area / width) × 10) / 10', () => {
    // area = 6.5, width = 2.6
    // 6.5 / 2.6 = 2.5, * 10 = 25, ceil = 25, / 10 = 2.5
    const result = computeAreaAndDimensions(5.0, baseProfile);
    expect(result.dimensions.length).toBe(2.5);
  });

  it('ensures all dimensions are multiples of 0.1m', () => {
    const result = computeAreaAndDimensions(7.77, baseProfile);
    // Check that each dimension × 10 is an integer (multiple of 0.1)
    expect(Math.round(result.dimensions.width * 10)).toBe(result.dimensions.width * 10);
    expect(Math.round(result.dimensions.length * 10)).toBe(result.dimensions.length * 10);
    expect(Math.round(result.dimensions.height * 10)).toBe(result.dimensions.height * 10);
  });

  it('handles zero bin floor space (enforces minimum)', () => {
    const result = computeAreaAndDimensions(0, baseProfile);
    expect(result.totalAreaSqm).toBe(4.0);
    expect(result.minimumApplied).toBe(false); // profile min is 4.0, so it's the profile min not the absolute min
  });

  it('mixed-use total is sum of component areas', () => {
    const inputs: BuildingInputs = {
      type: 'mixed-use',
      data: {
        components: [
          { type: 'residential', inputs: { unitCount: 10, averageOccupantsPerUnit: 3 } },
          { type: 'commercial', inputs: { grossFloorArea: 500, estimatedOccupantCount: 100 } },
        ],
      },
    };
    const result = computeRefuseArea(baseProfile, inputs);

    // Verify componentAreas exist and total equals their sum
    expect(result.area.componentAreas).toBeDefined();
    const componentSum = result.area.componentAreas!.reduce((sum, c) => sum + c.areaSqm, 0);
    // Total should equal the sum (both rounded to 2dp)
    expect(result.area.totalAreaSqm).toBe(Math.round(componentSum * 100) / 100);
  });
});
