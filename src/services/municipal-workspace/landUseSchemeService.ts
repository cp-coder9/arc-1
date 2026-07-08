/**
 * Land Use Scheme Service
 *
 * Validates project parameters against municipality-specific zoning data.
 * Provides zone lookup, parameter checking, and parking calculations.
 */

import type {
  LandUseCheckInput,
  LandUseCheckResult,
  LandUseParameterCheck,
  ZoneDefinition,
} from '@/types/municipalWorkspace';
import type { MunicipalityType } from '@/types';
import { findZone, listZonesForMunicipality } from '@/data/land-use-schemes';

// Ensure all municipality zone data files are loaded and registered
import '@/data/land-use-schemes/coj-zones';
import '@/data/land-use-schemes/coct-zones';
import '@/data/land-use-schemes/tshwane-zones';

/**
 * Looks up a zone definition from the scheme database for a given municipality and zone code.
 * Returns null if the zone is not found.
 */
export function findZoneDefinition(
  municipalityId: MunicipalityType,
  zoneCode: string
): ZoneDefinition | null {
  return findZone(municipalityId, zoneCode);
}

/**
 * Lists all available zone definitions for a given municipality.
 */
export function listZones(municipalityId: MunicipalityType): ZoneDefinition[] {
  return listZonesForMunicipality(municipalityId);
}

/**
 * Calculates the required number of parking bays based on zone parking ratios,
 * the proposed land use, and the gross floor area.
 *
 * For dwelling_unit, seat, and bed unit measures, grossFloorArea represents
 * the number of units (dwelling units, seats, or beds respectively).
 * For m²_gla, the area divisor is parsed from the ratioDescription.
 *
 * Returns 0 if no matching parking ratio is found.
 */
export function calculateRequiredParking(
  zone: ZoneDefinition,
  landUse: string,
  grossFloorArea: number
): number {
  const normalizedLandUse = landUse.toLowerCase().trim();

  const ratio = zone.parameters.parkingRatios.find(
    (r) => normalizedLandUse.includes(r.landUseType.toLowerCase())
  );

  if (!ratio) return 0;

  if (ratio.unitMeasure === 'dwelling_unit' || ratio.unitMeasure === 'seat' || ratio.unitMeasure === 'bed') {
    // grossFloorArea is the number of units/seats/beds
    return Math.ceil(grossFloorArea * ratio.baysPerUnit);
  }

  // For m²_gla and other area-based measures, parse the area divisor from description
  // Pattern: "X bay(s) per Ym² ..."
  const areaMatch = ratio.ratioDescription.match(/per\s+(\d+)\s*m/i);
  if (areaMatch) {
    const areaPerBay = parseInt(areaMatch[1], 10);
    return Math.ceil((grossFloorArea / areaPerBay) * ratio.baysPerUnit);
  }

  // Fallback: use baysPerUnit as a direct multiplier
  return Math.ceil(grossFloorArea * ratio.baysPerUnit);
}

/**
 * Validates project parameters against the applicable zone definition.
 * Compares proposed coverage, FAR, height, setbacks, and parking against zone limits.
 *
 * Returns a detailed check result with pass/fail status for each parameter,
 * consent use identification, and overall pass/fail status.
 */
export function validateLandUse(input: LandUseCheckInput): LandUseCheckResult {
  const zone = findZoneDefinition(input.municipalityId, input.zoneCode);

  if (!zone) {
    return {
      status: 'zone_not_found',
      checks: [],
      consentRequired: false,
      consentUses: [],
    };
  }

  const checks: LandUseParameterCheck[] = [];

  // Coverage check (upper bound — pass if proposed ≤ permitted)
  checks.push(createUpperBoundCheck(
    'Coverage',
    input.proposedCoverage,
    zone.parameters.maxCoverage,
    '%'
  ));

  // FAR check (upper bound — pass if proposed ≤ permitted)
  checks.push(createUpperBoundCheck(
    'FAR',
    input.proposedFAR,
    zone.parameters.maxFAR,
    'ratio'
  ));

  // Height check (upper bound — pass if proposed ≤ permitted)
  checks.push(createUpperBoundCheck(
    'Height',
    input.proposedHeight,
    zone.parameters.maxHeight,
    'm'
  ));

  // Building line checks (lower bound — pass if proposed ≥ required minimum)
  checks.push(createLowerBoundCheck(
    'Front BL',
    input.proposedSetbacks.front,
    zone.parameters.buildingLines.front,
    'm'
  ));

  checks.push(createLowerBoundCheck(
    'Rear BL',
    input.proposedSetbacks.rear,
    zone.parameters.buildingLines.rear,
    'm'
  ));

  checks.push(createLowerBoundCheck(
    'Side BL',
    input.proposedSetbacks.sides,
    zone.parameters.buildingLines.sides,
    'm'
  ));

  // Parking check (lower bound — pass if proposed ≥ required)
  const requiredParking = calculateRequiredParking(
    zone,
    input.proposedLandUse,
    input.grossFloorArea ?? input.dwellingUnits ?? 1
  );

  checks.push(createLowerBoundCheck(
    'Parking',
    input.proposedParkingBays,
    requiredParking,
    'bays'
  ));

  // Consent use identification
  const consentRequired = zone.consentUses.some(
    (use) => input.proposedLandUse.toLowerCase().includes(use.toLowerCase())
  );

  const consentUses = zone.consentUses.filter(
    (use) => input.proposedLandUse.toLowerCase().includes(use.toLowerCase())
  );

  // Overall status: fail if any check fails
  const status = checks.some((c) => c.status === 'fail') ? 'fail' : 'pass';

  return {
    status,
    checks,
    consentRequired,
    consentUses,
    zone,
  };
}

/**
 * Creates an upper-bound parameter check (proposed must be ≤ permitted maximum).
 * Used for coverage, FAR, and height.
 */
function createUpperBoundCheck(
  parameter: string,
  proposedValue: number,
  permittedMax: number,
  unit: string
): LandUseParameterCheck {
  const status = proposedValue <= permittedMax ? 'pass' : 'fail';
  const check: LandUseParameterCheck = {
    parameter,
    proposedValue,
    permittedMax,
    unit,
    status,
  };
  if (status === 'fail') {
    check.excess = proposedValue - permittedMax;
  }
  return check;
}

/**
 * Creates a lower-bound parameter check (proposed must be ≥ permitted minimum).
 * Used for building lines and parking.
 * Note: permittedMax field stores the minimum requirement for display consistency.
 */
function createLowerBoundCheck(
  parameter: string,
  proposedValue: number,
  permittedMin: number,
  unit: string
): LandUseParameterCheck {
  const status = proposedValue >= permittedMin ? 'pass' : 'fail';
  const check: LandUseParameterCheck = {
    parameter,
    proposedValue,
    permittedMax: permittedMin,
    unit,
    status,
  };
  if (status === 'fail') {
    check.excess = permittedMin - proposedValue;
  }
  return check;
}
