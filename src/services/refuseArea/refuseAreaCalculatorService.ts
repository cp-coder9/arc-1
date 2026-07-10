/**
 * Municipal Refuse Area Calculator — Calculation Engine
 *
 * Pure function. No side effects, no I/O.
 * Computes refuse storage area dimensions, bin quantities, vehicle access,
 * ventilation, and drainage requirements from a Municipality_Profile and BuildingInputs.
 *
 * Requirements: 3.4, 3.5
 */

import type {
  Municipality_Profile,
  BuildingInputs,
  Refuse_Area_Result,
  BinAllocation,
  VehicleAccessResult,
  VentilationResult,
  DrainageResult,
  ComponentArea,
  ResidentialInputs,
  CommercialInputs,
  IndustrialInputs,
} from './types';

import { formatDateDDMMMYYYY } from './formatUtils';

const ADVISORY_DISCLAIMER =
  'This output is advisory only. It does not constitute legal compliance certification. Results are derived from interpreted municipal guidelines and must be verified by a qualified professional against current local bylaws.';

/**
 * Generates a UUID v4.
 * Uses globalThis.crypto.randomUUID when available (browser/modern Node),
 * falls back to a simple v4 UUID generator for test environments.
 */
function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for environments where crypto.randomUUID is not available
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Computes the total waste volume in litres for a given building input and municipality profile.
 * Exported for unit testing.
 *
 * Residential: unitCount × litresPerUnitPerCycle
 * Commercial: grossFloorArea × litresPerSqmPerCycle
 * Industrial: grossFloorArea × category rate
 * Mixed-Use: sum of each component's volume
 */
export function computeWasteVolume(
  profile: Municipality_Profile,
  inputs: BuildingInputs
): number {
  switch (inputs.type) {
    case 'residential':
      return inputs.data.unitCount * profile.wasteRates.residential.litresPerUnitPerCycle;

    case 'commercial':
      return inputs.data.grossFloorArea * profile.wasteRates.commercial.litresPerSqmPerCycle;

    case 'industrial': {
      const category = inputs.data.wasteGenerationCategory;
      const rate = profile.wasteRates.industrial[category].litresPerSqmPerCycle;
      return inputs.data.grossFloorArea * rate;
    }

    case 'mixed-use': {
      return inputs.data.components.reduce((total, component) => {
        const componentInputs = buildComponentInputs(component.type, component.inputs);
        return total + computeWasteVolume(profile, componentInputs);
      }, 0);
    }
  }
}

/**
 * Builds a BuildingInputs object from a mixed-use component for recursive volume computation.
 */
function buildComponentInputs(
  type: 'residential' | 'commercial' | 'industrial',
  inputs: ResidentialInputs | CommercialInputs | IndustrialInputs
): BuildingInputs {
  switch (type) {
    case 'residential':
      return { type: 'residential', data: inputs as ResidentialInputs };
    case 'commercial':
      return { type: 'commercial', data: inputs as CommercialInputs };
    case 'industrial':
      return { type: 'industrial', data: inputs as IndustrialInputs };
  }
}



/**
 * Placeholder: Computes bin allocation.
 * Will be properly implemented in task 3.3.
 */
function computeBinsPlaceholder(
  totalVolumeLitres: number,
  profile: Municipality_Profile
): {
  generalWaste: BinAllocation;
  recyclableWaste?: BinAllocation;
  totalFloorSpaceSqm: number;
} {
  const defaultBin = profile.binStandards.availableSizes[0] ?? {
    capacityLitres: 240,
    footprint: { length: 0.6, width: 0.5 },
    label: '240L Wheelie Bin',
  };

  const binCount = Math.max(1, Math.ceil(totalVolumeLitres / defaultBin.capacityLitres));
  const floorSpace = binCount * defaultBin.footprint.length * defaultBin.footprint.width;

  const generalWaste: BinAllocation = {
    binCapacityLitres: defaultBin.capacityLitres,
    binCount,
    totalVolumeLitres: binCount * defaultBin.capacityLitres,
    binLabel: defaultBin.label,
  };

  return {
    generalWaste,
    recyclableWaste: undefined,
    totalFloorSpaceSqm: floorSpace,
  };
}

/**
 * Computes the refuse storage area and room dimensions from bin floor space and profile.
 * Exported for unit testing.
 *
 * Step 3: Floor Area Computation
 *   binFloorSpace = binCount × perBinFootprint.length × perBinFootprint.width
 *   requiredArea = max(binFloorSpace × 1.3, profile.areaRequirements.minimumFloorArea)
 *   Absolute minimum: 4.0 m²
 *
 * Step 4: Dimensions
 *   height = profile.areaRequirements.minimumClearanceHeight ?? 2.4
 *   width = ceil(sqrt(requiredArea) × 10) / 10  (rounded to 0.1m)
 *   length = ceil((requiredArea / width) × 10) / 10
 *
 * Requirements: 3.1, 3.2, 3.3, 3.5, 3.6
 */
export function computeAreaAndDimensions(
  binFloorSpaceSqm: number,
  profile: Municipality_Profile
): {
  totalAreaSqm: number;
  dimensions: { length: number; width: number; height: number };
  minimumApplied: boolean;
} {
  const minimumFloorArea = profile.areaRequirements.minimumFloorArea ?? 4.0;

  // Step 3: Floor area — apply 1.3 circulation factor, enforce profile minimum
  let requiredArea = Math.max(binFloorSpaceSqm * 1.3, minimumFloorArea);
  let minimumApplied = false;

  // Absolute minimum enforcement: 4.0 m²
  if (requiredArea < 4.0) {
    requiredArea = 4.0;
    minimumApplied = true;
  }

  // Round total area to 2 decimal places
  const totalAreaSqm = Math.round(requiredArea * 100) / 100;

  // Step 4: Dimensions — all rounded to nearest 0.1m
  const height = Math.round((profile.areaRequirements.minimumClearanceHeight ?? 2.4) * 10) / 10;
  const width = Math.ceil(Math.sqrt(totalAreaSqm) * 10) / 10;
  const length = Math.ceil((totalAreaSqm / width) * 10) / 10;

  return {
    totalAreaSqm,
    dimensions: { length, width, height },
    minimumApplied,
  };
}

/**
 * Computes vehicle access requirements via direct pass-through from the municipality profile.
 * No value transformation occurs — non-null fields are copied directly.
 * Null fields are tracked in the `missingFields` array so downstream consumers
 * can surface "not specified" notices with advisory language.
 *
 * Tracked fields: minimumRoadWidth, turningCircleRadius, maximumGradient,
 *   maximumCarryDistance, hardstandRequired, hardstandDimensions.
 *
 * Exported for unit testing.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export function computeVehicleAccess(profile: Municipality_Profile): VehicleAccessResult {
  const va = profile.vehicleAccess;
  const missingFields: string[] = [];

  if (va.minimumRoadWidth === null) missingFields.push('minimumRoadWidth');
  if (va.turningCircleRadius === null) missingFields.push('turningCircleRadius');
  if (va.maximumGradient === null) missingFields.push('maximumGradient');
  if (va.maximumCarryDistance === null) missingFields.push('maximumCarryDistance');
  if (va.hardstandRequired === null) missingFields.push('hardstandRequired');
  if (va.hardstandDimensions === null) missingFields.push('hardstandDimensions');

  return {
    minimumRoadWidth: va.minimumRoadWidth,
    turningCircleRadius: va.turningCircleRadius,
    maximumGradient: va.maximumGradient,
    maximumCarryDistance: va.maximumCarryDistance,
    hardstandRequired: va.hardstandRequired,
    hardstandDimensions: va.hardstandDimensions,
    missingFields,
  };
}

/**
 * Computes ventilation requirements via direct pass-through from the municipality profile.
 * No value transformation occurs — non-null fields are copied directly.
 * Null fields are tracked in the `missingFields` array so downstream consumers
 * can surface "not specified" notices with advisory language.
 *
 * Tracked fields: type, naturalOpeningArea, mechanicalRate.
 *
 * Exported for unit testing.
 * Requirements: 6.1, 6.2, 6.3, 6.5
 */
export function computeVentilation(profile: Municipality_Profile): VentilationResult {
  const v = profile.ventilation;
  const missingFields: string[] = [];

  if (v.type === null) missingFields.push('type');
  if (v.naturalOpeningArea === null) missingFields.push('naturalOpeningArea');
  if (v.mechanicalRate === null) missingFields.push('mechanicalRate');

  return {
    type: v.type,
    naturalOpeningArea: v.naturalOpeningArea,
    mechanicalRate: v.mechanicalRate,
    missingFields,
  };
}

/**
 * Computes drainage requirements via direct pass-through from the municipality profile.
 * No value transformation occurs — non-null fields are copied directly.
 * The drainage wash-down provision sub-object is flattened into the result:
 *   - `washDownProvision.required` → `washDownRequired`
 *   - `washDownProvision.type` → `washDownType`
 *   - `washDownProvision.location` → `washDownLocation`
 *
 * Null fields are tracked in the `missingFields` array so downstream consumers
 * can surface "not specified" notices with advisory language.
 *
 * Tracked fields: floorGradient, drainDiameter, washDownRequired, washDownType, washDownLocation.
 *
 * Exported for unit testing.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export function computeDrainage(profile: Municipality_Profile): DrainageResult {
  const d = profile.drainage;
  const missingFields: string[] = [];

  if (d.floorGradient === null) missingFields.push('floorGradient');
  if (d.drainDiameter === null) missingFields.push('drainDiameter');
  if (d.washDownProvision.required === null) missingFields.push('washDownRequired');
  if (d.washDownProvision.type === null) missingFields.push('washDownType');
  if (d.washDownProvision.location === null) missingFields.push('washDownLocation');

  return {
    floorGradient: d.floorGradient,
    drainDiameter: d.drainDiameter,
    washDownRequired: d.washDownProvision.required,
    washDownType: d.washDownProvision.type,
    washDownLocation: d.washDownProvision.location,
    missingFields,
  };
}

/**
 * Computes the full refuse area result from a municipality profile and building inputs.
 * Pure function — no side effects, no I/O.
 */
export function computeRefuseArea(
  profile: Municipality_Profile,
  inputs: BuildingInputs
): Refuse_Area_Result {
  // Step 1: Total waste volume
  const totalWasteVolumeLitres = computeWasteVolume(profile, inputs);

  // Step 2: Bin calculation (placeholder — task 3.3)
  const binResult = computeBinsPlaceholder(totalWasteVolumeLitres, profile);

  // Step 3 & 4: Area and dimensions
  const areaResult = computeAreaAndDimensions(binResult.totalFloorSpaceSqm, profile);

  // Step 5: Vehicle access, ventilation, drainage (pass-through from profile)
  const vehicleAccess = computeVehicleAccess(profile);
  const ventilation = computeVentilation(profile);
  const drainage = computeDrainage(profile);

  // Mixed-use: sum individual component areas, return both component-level and combined total
  let componentAreas: ComponentArea[] | undefined;
  if (inputs.type === 'mixed-use') {
    componentAreas = inputs.data.components.map((component) => {
      const componentInputs = buildComponentInputs(component.type, component.inputs);
      const componentVolume = computeWasteVolume(profile, componentInputs);
      const componentBins = computeBinsPlaceholder(componentVolume, profile);
      const componentArea = computeAreaAndDimensions(componentBins.totalFloorSpaceSqm, profile);
      return {
        type: component.type,
        areaSqm: componentArea.totalAreaSqm,
      };
    });

    // For mixed-use, the total area is the sum of individual component areas
    const summedArea = componentAreas.reduce((sum, c) => sum + c.areaSqm, 0);
    // Apply absolute minimum of 4.0 m² to the summed total
    let mixedTotalArea = summedArea;
    let mixedMinimumApplied = false;
    if (mixedTotalArea < 4.0) {
      mixedTotalArea = 4.0;
      mixedMinimumApplied = true;
    }
    // Round total area to 2 decimal places
    mixedTotalArea = Math.round(mixedTotalArea * 100) / 100;

    // Compute dimensions from the summed total
    const height = Math.round((profile.areaRequirements.minimumClearanceHeight ?? 2.4) * 10) / 10;
    const width = Math.ceil(Math.sqrt(mixedTotalArea) * 10) / 10;
    const length = Math.ceil((mixedTotalArea / width) * 10) / 10;

    return {
      id: generateId(),
      computedAt: new Date().toISOString(),
      municipalityId: profile.id,
      municipalityName: profile.name,
      profileLastUpdated: formatDateDDMMMYYYY(profile.lastUpdated),
      buildingType: inputs.type,
      inputs,

      area: {
        totalAreaSqm: mixedTotalArea,
        dimensions: { length, width, height },
        minimumApplied: mixedMinimumApplied,
        componentAreas,
      },

      bins: {
        totalWasteVolumeLitres,
        generalWaste: binResult.generalWaste,
        recyclableWaste: binResult.recyclableWaste,
        totalFloorSpaceSqm: binResult.totalFloorSpaceSqm,
      },

      vehicleAccess,
      ventilation,
      drainage,
      pestControl: profile.pestControl.requirements,

      advisoryDisclaimer: ADVISORY_DISCLAIMER,
    };
  }

  return {
    id: generateId(),
    computedAt: new Date().toISOString(),
    municipalityId: profile.id,
    municipalityName: profile.name,
    profileLastUpdated: formatDateDDMMMYYYY(profile.lastUpdated),
    buildingType: inputs.type,
    inputs,

    area: {
      totalAreaSqm: areaResult.totalAreaSqm,
      dimensions: areaResult.dimensions,
      minimumApplied: areaResult.minimumApplied,
    },

    bins: {
      totalWasteVolumeLitres,
      generalWaste: binResult.generalWaste,
      recyclableWaste: binResult.recyclableWaste,
      totalFloorSpaceSqm: binResult.totalFloorSpaceSqm,
    },

    vehicleAccess,
    ventilation,
    drainage,
    pestControl: profile.pestControl.requirements,

    advisoryDisclaimer: ADVISORY_DISCLAIMER,
  };
}
