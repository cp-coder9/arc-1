/**
 * Municipal Refuse Area Calculator — Bin Calculation Service
 *
 * Pure functions for bin count, bin size optimization, waste stream separation,
 * and floor space computation.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
 */

import type { Municipality_Profile, BinSize, BinAllocation } from './types';

/**
 * Result of the full bin calculation for a building project.
 */
export interface BinCalculationResult {
  generalWaste: BinAllocation;
  recyclableWaste?: BinAllocation;
  totalFloorSpaceSqm: number;
}

/**
 * Computes the number of bins required for a given volume and bin capacity.
 * Returns the ceiling of (totalVolumeLitres / binCapacityLitres).
 *
 * @throws Error if totalVolumeLitres is zero or negative
 * @throws Error if binCapacityLitres is zero or negative
 */
export function computeBinCount(totalVolumeLitres: number, binCapacityLitres: number): number {
  if (totalVolumeLitres <= 0) {
    throw new Error('Total volume must be greater than zero.');
  }
  if (binCapacityLitres <= 0) {
    throw new Error('Bin capacity must be greater than zero.');
  }
  return Math.ceil(totalVolumeLitres / binCapacityLitres);
}

/**
 * Selects the optimal bin size from available sizes.
 * The optimal size is the one that produces the fewest total bins while
 * NOT exceeding maxBins. If no size satisfies the constraint, the largest
 * available size is selected.
 *
 * @throws Error if availableSizes is empty
 * @throws Error if totalVolumeLitres is zero or negative
 */
export function selectOptimalBinSize(
  totalVolumeLitres: number,
  availableSizes: BinSize[],
  maxBins: number
): BinSize {
  if (availableSizes.length === 0) {
    throw new Error('No bin sizes defined. Cannot determine optimal bin size.');
  }
  if (totalVolumeLitres <= 0) {
    throw new Error('Total volume must be greater than zero.');
  }

  // Find sizes that satisfy the maxBins constraint
  const satisfying = availableSizes.filter((size) => {
    const count = Math.ceil(totalVolumeLitres / size.capacityLitres);
    return count <= maxBins;
  });

  if (satisfying.length === 0) {
    // No size satisfies the constraint — select the largest available size
    return availableSizes.reduce((largest, current) =>
      current.capacityLitres > largest.capacityLitres ? current : largest
    );
  }

  // Among satisfying sizes, select the one producing the fewest bins
  let bestSize = satisfying[0];
  let fewestBins = Math.ceil(totalVolumeLitres / bestSize.capacityLitres);

  for (let i = 1; i < satisfying.length; i++) {
    const count = Math.ceil(totalVolumeLitres / satisfying[i].capacityLitres);
    if (count < fewestBins) {
      fewestBins = count;
      bestSize = satisfying[i];
    }
  }

  return bestSize;
}

/**
 * Computes a BinAllocation for a single waste stream.
 */
function computeStreamAllocation(
  volumeLitres: number,
  availableSizes: BinSize[],
  maxBins: number
): BinAllocation {
  const optimalSize = selectOptimalBinSize(volumeLitres, availableSizes, maxBins);
  const binCount = computeBinCount(volumeLitres, optimalSize.capacityLitres);

  return {
    binCapacityLitres: optimalSize.capacityLitres,
    binCount,
    totalVolumeLitres: binCount * optimalSize.capacityLitres,
    binLabel: optimalSize.label,
  };
}

/**
 * Computes the floor space occupied by bins for a single allocation.
 * Uses the profile's perBinFootprint dimensions (not the individual bin footprints).
 */
function computeAllocationFloorSpace(
  allocation: BinAllocation,
  perBinFootprint: { length: number; width: number }
): number {
  return allocation.binCount * perBinFootprint.length * perBinFootprint.width;
}

/**
 * Calculates the full bin allocation for a building project.
 *
 * When the profile specifies separate waste streams, volume is split:
 * - 70% general waste
 * - 30% recyclable waste
 *
 * Each stream is computed independently using the respective bin sizes.
 *
 * @throws Error if totalVolumeLitres is zero or negative
 * @throws Error if no bin sizes are defined in the profile
 */
export function calculateBins(
  totalVolumeLitres: number,
  profile: Municipality_Profile
): BinCalculationResult {
  if (totalVolumeLitres <= 0) {
    throw new Error(
      'Bin calculation cannot be completed: total waste volume must be greater than zero.'
    );
  }

  const { binStandards, areaRequirements } = profile;
  const { perBinFootprint } = areaRequirements;

  if (binStandards.availableSizes.length === 0) {
    throw new Error(
      'Bin calculation cannot be completed: no bin size standards defined in the municipality profile.'
    );
  }

  const maxBins = binStandards.maxBinsPerCollectionPoint;

  if (binStandards.separateWasteStreams) {
    // Split volume: 70% general, 30% recyclable
    const generalVolume = totalVolumeLitres * 0.7;
    const recyclableVolume = totalVolumeLitres * 0.3;

    // Use dedicated bin sizes if available, otherwise fall back to availableSizes
    const generalSizes =
      binStandards.generalBinSizes && binStandards.generalBinSizes.length > 0
        ? binStandards.generalBinSizes
        : binStandards.availableSizes;

    const recyclableSizes =
      binStandards.recyclableBinSizes && binStandards.recyclableBinSizes.length > 0
        ? binStandards.recyclableBinSizes
        : binStandards.availableSizes;

    const generalWaste = computeStreamAllocation(generalVolume, generalSizes, maxBins);
    const recyclableWaste = computeStreamAllocation(recyclableVolume, recyclableSizes, maxBins);

    const totalFloorSpaceSqm =
      computeAllocationFloorSpace(generalWaste, perBinFootprint) +
      computeAllocationFloorSpace(recyclableWaste, perBinFootprint);

    return {
      generalWaste,
      recyclableWaste,
      totalFloorSpaceSqm,
    };
  }

  // Single stream: all waste is general
  const generalWaste = computeStreamAllocation(
    totalVolumeLitres,
    binStandards.availableSizes,
    maxBins
  );

  const totalFloorSpaceSqm = computeAllocationFloorSpace(generalWaste, perBinFootprint);

  return {
    generalWaste,
    recyclableWaste: undefined,
    totalFloorSpaceSqm,
  };
}
