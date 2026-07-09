/**
 * Unit tests for binCalculationService
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 *
 * @vitest-environment node
 */

import {
  computeBinCount,
  selectOptimalBinSize,
  calculateBins,
} from './binCalculationService';
import type { Municipality_Profile, BinSize } from './types';

describe('computeBinCount', () => {
  it('returns ceiling of volume divided by capacity', () => {
    expect(computeBinCount(500, 240)).toBe(3); // 500/240 = 2.08 → 3
    expect(computeBinCount(240, 240)).toBe(1); // exact fit
    expect(computeBinCount(241, 240)).toBe(2); // just over
    expect(computeBinCount(1100, 1100)).toBe(1);
  });

  it('throws when volume is zero or negative', () => {
    expect(() => computeBinCount(0, 240)).toThrow('Total volume must be greater than zero.');
    expect(() => computeBinCount(-100, 240)).toThrow('Total volume must be greater than zero.');
  });

  it('throws when capacity is zero or negative', () => {
    expect(() => computeBinCount(500, 0)).toThrow('Bin capacity must be greater than zero.');
    expect(() => computeBinCount(500, -1)).toThrow('Bin capacity must be greater than zero.');
  });
});

describe('selectOptimalBinSize', () => {
  const sizes: BinSize[] = [
    { capacityLitres: 240, footprint: { length: 0.6, width: 0.5 }, label: '240L Wheelie Bin' },
    { capacityLitres: 660, footprint: { length: 1.2, width: 0.8 }, label: '660L Bulk Bin' },
    { capacityLitres: 1100, footprint: { length: 1.4, width: 1.0 }, label: '1100L Bulk Bin' },
  ];

  it('selects size producing fewest bins within constraint', () => {
    // 2000L: 240→9 bins, 660→4 bins, 1100→2 bins. All under maxBins=20. Pick 1100.
    const result = selectOptimalBinSize(2000, sizes, 20);
    expect(result.capacityLitres).toBe(1100);
  });

  it('respects maxBins constraint', () => {
    // 5000L: 240→21 bins (exceeds 20), 660→8 bins, 1100→5 bins.
    // 240 fails constraint; among 660 and 1100, pick 1100 (fewest).
    const result = selectOptimalBinSize(5000, sizes, 20);
    expect(result.capacityLitres).toBe(1100);
  });

  it('selects largest size when no size satisfies constraint', () => {
    // 50000L with maxBins=2: 240→209, 660→76, 1100→46. None ≤2.
    // Fallback to largest available = 1100.
    const result = selectOptimalBinSize(50000, sizes, 2);
    expect(result.capacityLitres).toBe(1100);
  });

  it('throws when no sizes defined', () => {
    expect(() => selectOptimalBinSize(500, [], 20)).toThrow('No bin sizes defined');
  });

  it('throws when volume is zero or negative', () => {
    expect(() => selectOptimalBinSize(0, sizes, 20)).toThrow('Total volume must be greater than zero.');
  });
});

describe('calculateBins', () => {
  const baseProfile: Municipality_Profile = {
    id: 'test-municipality',
    name: 'Test Municipality',
    isFallback: false,
    lastUpdated: '2026-01-15',
    wasteRates: {
      residential: { litresPerUnitPerCycle: 240, collectionCycleDays: 7 },
      commercial: { litresPerSqmPerCycle: 0.8, collectionCycleDays: 7 },
      industrial: {
        light: { litresPerSqmPerCycle: 0.3 },
        medium: { litresPerSqmPerCycle: 0.6 },
        heavy: { litresPerSqmPerCycle: 1.2 },
        collectionCycleDays: 7,
      },
    },
    binStandards: {
      availableSizes: [
        { capacityLitres: 240, footprint: { length: 0.6, width: 0.5 }, label: '240L Wheelie Bin' },
        { capacityLitres: 1100, footprint: { length: 1.4, width: 1.0 }, label: '1100L Bulk Bin' },
      ],
      maxBinsPerCollectionPoint: 20,
      separateWasteStreams: false,
    },
    areaRequirements: {
      minimumFloorArea: 4.0,
      minimumClearanceHeight: null,
      perBinFootprint: { length: 0.7, width: 0.6 },
    },
    vehicleAccess: {
      minimumRoadWidth: 3.5,
      turningCircleRadius: 12.0,
      maximumGradient: 8,
      maximumCarryDistance: 25,
      hardstandRequired: true,
      hardstandDimensions: { length: 8, width: 4 },
    },
    ventilation: { type: 'natural', naturalOpeningArea: 0.5, mechanicalRate: null },
    drainage: {
      floorGradient: 1.5,
      drainDiameter: 100,
      washDownProvision: { required: true, type: 'hose_connection', location: 'adjacent to door' },
    },
    pestControl: { requirements: 'Vermin-proof doors and screens required' },
  };

  it('computes single stream correctly', () => {
    const result = calculateBins(2000, baseProfile);

    // 2000L: 240→9 bins, 1100→2 bins. 2 ≤ 20, pick 1100.
    expect(result.generalWaste.binCapacityLitres).toBe(1100);
    expect(result.generalWaste.binCount).toBe(2);
    expect(result.generalWaste.totalVolumeLitres).toBe(2200);
    expect(result.recyclableWaste).toBeUndefined();
    // Floor space: 2 × 0.7 × 0.6 = 0.84
    expect(result.totalFloorSpaceSqm).toBeCloseTo(0.84);
  });

  it('computes separate waste streams when separateWasteStreams is true', () => {
    const separatedProfile: Municipality_Profile = {
      ...baseProfile,
      binStandards: {
        ...baseProfile.binStandards,
        separateWasteStreams: true,
        generalBinSizes: [
          { capacityLitres: 1100, footprint: { length: 1.4, width: 1.0 }, label: '1100L General' },
        ],
        recyclableBinSizes: [
          { capacityLitres: 240, footprint: { length: 0.6, width: 0.5 }, label: '240L Recycling' },
        ],
      },
    };

    const result = calculateBins(1000, separatedProfile);

    // General: 1000 × 0.7 = 700L → 700/1100 = ceil → 1 bin
    expect(result.generalWaste.binCapacityLitres).toBe(1100);
    expect(result.generalWaste.binCount).toBe(1);
    expect(result.generalWaste.binLabel).toBe('1100L General');

    // Recyclable: 1000 × 0.3 = 300L → 300/240 = ceil → 2 bins
    expect(result.recyclableWaste).toBeDefined();
    expect(result.recyclableWaste!.binCapacityLitres).toBe(240);
    expect(result.recyclableWaste!.binCount).toBe(2);
    expect(result.recyclableWaste!.binLabel).toBe('240L Recycling');

    // Floor space: general (1 × 0.7 × 0.6) + recyclable (2 × 0.7 × 0.6) = 0.42 + 0.84 = 1.26
    expect(result.totalFloorSpaceSqm).toBeCloseTo(1.26);
  });

  it('throws error when volume is zero', () => {
    expect(() => calculateBins(0, baseProfile)).toThrow(
      'total waste volume must be greater than zero'
    );
  });

  it('throws error when no bin sizes defined', () => {
    const emptyBinsProfile: Municipality_Profile = {
      ...baseProfile,
      binStandards: {
        ...baseProfile.binStandards,
        availableSizes: [],
      },
    };
    expect(() => calculateBins(500, emptyBinsProfile)).toThrow(
      'no bin size standards defined'
    );
  });

  it('floor space equals binCount × perBinFootprint.length × perBinFootprint.width across streams', () => {
    const separatedProfile: Municipality_Profile = {
      ...baseProfile,
      binStandards: {
        ...baseProfile.binStandards,
        separateWasteStreams: true,
      },
    };

    const result = calculateBins(5000, separatedProfile);

    const expectedFloor =
      result.generalWaste.binCount * 0.7 * 0.6 +
      (result.recyclableWaste?.binCount ?? 0) * 0.7 * 0.6;

    expect(result.totalFloorSpaceSqm).toBeCloseTo(expectedFloor);
  });
});
