// Engineer's Calculation Hub — Fire Engineering Engine
//
// Pure compute functions for fire safety per SANS 10400-T.
// Requirements: 3.1–3.4, 15.1–15.7

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import {
  travelDistanceInputSchema,
  exitWidthInputSchema,
  occupantLoadInputSchema,
  fireRatingInputSchema,
  fireFlowInputSchema,
  hydrantSpacingInputSchema,
  firePumpInputSchema,
  TRAVEL_DISTANCE_DEFAULTS,
  EXIT_WIDTH_DEFAULTS,
  OCCUPANT_LOAD_DEFAULTS,
  FIRE_RATING_DEFAULTS,
  FIRE_FLOW_DEFAULTS,
  HYDRANT_SPACING_DEFAULTS,
  FIRE_PUMP_DEFAULTS,
} from '../schemas/fireEngineering'
import type {
  TravelDistanceInput,
  ExitWidthInput,
  OccupantLoadInput,
  FireRatingInput,
  FireFlowInput,
  HydrantSpacingInput,
  FirePumpInput,
} from '../schemas/fireEngineering'
import { getTravelDistance } from '../data/fireDistances'
import { registerCalculator } from '../calcHubRegistry'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Exit capacity factor: 5mm per person per SANS 10400-T */
const EXIT_CAPACITY_FACTOR = 5 // mm per person

/** Minimum clear width per door leaf (mm) per SANS 10400-T */
const MIN_LEAF_WIDTH = 850 // mm

/** Occupancy density factors (m² per person) per SANS 10400-T Table 3 */
const OCCUPANCY_DENSITY: Record<string, number> = {
  assembly_fixed_seating: 0.75,
  assembly_standing: 0.5,
  business: 10,
  educational: 2,
  high_hazard: 9,
  industrial: 9,
  institutional_sleeping: 8,
  institutional_day_care: 3.5,
  mercantile: 3,
  residential: 15,
  storage: 30,
}

/** Fire resistance rating lookup: buildingType → height bracket → rating (minutes) */
const FIRE_RATING_TABLE: Record<string, { maxHeight: number; rating: number }[]> = {
  structural: [
    { maxHeight: 10, rating: 60 },
    { maxHeight: 20, rating: 90 },
    { maxHeight: 30, rating: 120 },
    { maxHeight: Infinity, rating: 180 },
  ],
  compartment_wall: [
    { maxHeight: 10, rating: 60 },
    { maxHeight: 20, rating: 90 },
    { maxHeight: 30, rating: 120 },
    { maxHeight: Infinity, rating: 120 },
  ],
  floor: [
    { maxHeight: 10, rating: 60 },
    { maxHeight: 20, rating: 90 },
    { maxHeight: 30, rating: 120 },
    { maxHeight: Infinity, rating: 120 },
  ],
}

/** Fire flow occupancy base factors (L/s per 100m²) */
const FIRE_FLOW_OCCUPANCY_FACTOR: Record<string, number> = {
  low: 6,
  moderate: 8,
  high: 10,
}

/** Fire flow construction type multipliers */
const FIRE_FLOW_CONSTRUCTION_FACTOR: Record<string, number> = {
  fire_resistant: 0.7,
  non_combustible: 0.85,
  combustible: 1.0,
}

/** Hydrant maximum spacing by risk category (m) */
const HYDRANT_MAX_SPACING: Record<string, number> = {
  low: 150,
  moderate: 90,
  high: 60,
}

/** Gravity constant for elevation head conversion (kPa per m) */
const RHO_G = 9.81 // kPa per metre of water head

/** Default pump efficiency */
const PUMP_EFFICIENCY = 0.7

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine pass/fail/warning from utilisation ratio */
function getStatus(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail'
  if (ratio >= 0.9) return 'warning'
  return 'pass'
}

// ---------------------------------------------------------------------------
// 1. Travel Distance Check — SANS 10400-T §4.19 / Table 1
// ---------------------------------------------------------------------------

export function computeTravelDistance(input: TravelDistanceInput): CalculatorOutput {
  const entry = getTravelDistance(input.buildingClassification, input.sprinklered)

  if (!entry) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: {
        error: {
          value: `No travel distance data for classification "${input.buildingClassification}" (sprinklered: ${input.sprinklered})`,
          unit: '',
        },
      },
      derivation: [],
      sansReferences: ['SANS 10400-T Table 1'],
      intermediates: {},
    }
  }

  const maxDistance = entry.maxDistance
  const measured = input.measuredDistance
  const ratio = measured / maxDistance

  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Maximum Allowable Travel Distance',
      formula: 'Max = lookup(classification, sprinklered)',
      substitution: `Max = lookup("${input.buildingClassification}", ${input.sprinklered})`,
      result: `${maxDistance} m`,
      sansRef: 'SANS 10400-T Table 1',
    },
    {
      label: 'Measured Travel Distance',
      formula: 'D_measured',
      substitution: `D_measured = ${measured}`,
      result: `${measured} m`,
    },
    {
      label: 'Utilisation (Measured / Max)',
      formula: 'U = D_measured / Max',
      substitution: `U = ${measured} / ${maxDistance}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10400-T Table 1',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      maxAllowableDistance: { value: maxDistance, unit: 'm' },
      measuredDistance: { value: measured, unit: 'm' },
      classification: { value: entry.description, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10400-T Table 1'],
    intermediates: { maxDistance, measured, ratio },
  }
}

// ---------------------------------------------------------------------------
// 2. Exit Width — SANS 10400-T
// ---------------------------------------------------------------------------

export function computeExitWidth(input: ExitWidthInput): CalculatorOutput {
  const { occupantLoad, numExits, doorLeafWidth } = input

  // Total required width = occupants × 5mm
  const totalRequiredWidth = occupantLoad * EXIT_CAPACITY_FACTOR // mm
  // Width required per exit
  const widthPerExit = totalRequiredWidth / numExits // mm
  // Apply minimum leaf width
  const requiredPerExit = Math.max(widthPerExit, MIN_LEAF_WIDTH)

  // Ratio: required per exit vs provided leaf width
  const ratio = requiredPerExit / doorLeafWidth

  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Total Required Exit Width',
      formula: 'W_total = Occupants × 5 mm/person',
      substitution: `W_total = ${occupantLoad} × ${EXIT_CAPACITY_FACTOR}`,
      result: `${totalRequiredWidth} mm`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Width Per Exit',
      formula: 'W_per_exit = W_total / N_exits',
      substitution: `W_per_exit = ${totalRequiredWidth} / ${numExits}`,
      result: `${widthPerExit.toFixed(0)} mm`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Minimum Leaf Width Check',
      formula: 'W_required = max(W_per_exit, 850mm)',
      substitution: `W_required = max(${widthPerExit.toFixed(0)}, ${MIN_LEAF_WIDTH})`,
      result: `${requiredPerExit.toFixed(0)} mm`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Utilisation (Required / Provided)',
      formula: 'U = W_required / W_provided',
      substitution: `U = ${requiredPerExit.toFixed(0)} / ${doorLeafWidth}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10400-T',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      totalRequiredWidth: { value: totalRequiredWidth, unit: 'mm' },
      widthPerExit: { value: Math.round(widthPerExit), unit: 'mm' },
      requiredPerExit: { value: Math.round(requiredPerExit), unit: 'mm' },
      providedWidth: { value: doorLeafWidth, unit: 'mm' },
    },
    derivation,
    sansReferences: ['SANS 10400-T'],
    intermediates: { totalRequiredWidth, widthPerExit, requiredPerExit },
  }
}

// ---------------------------------------------------------------------------
// 3. Occupant Load — SANS 10400-T Table 3
// ---------------------------------------------------------------------------

export function computeOccupantLoad(input: OccupantLoadInput): CalculatorOutput {
  const { floorArea, useClassification } = input

  const densityFactor = OCCUPANCY_DENSITY[useClassification]
  if (densityFactor === undefined) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: {
        error: { value: `Unknown use classification: "${useClassification}"`, unit: '' },
      },
      derivation: [],
      sansReferences: ['SANS 10400-T Table 3'],
      intermediates: {},
    }
  }

  // N = A / density_factor
  const occupantLoad = Math.ceil(floorArea / densityFactor)

  // For occupant load, there's no "fail" — it's an informational calculation
  // We use ratio = 0 (always pass) since it's a lookup, not a compliance check
  const derivation: DerivationStep[] = [
    {
      label: 'Floor Area',
      formula: 'A',
      substitution: `A = ${floorArea}`,
      result: `${floorArea} m²`,
    },
    {
      label: 'Occupancy Density Factor',
      formula: 'density = lookup(classification)',
      substitution: `density = lookup("${useClassification}")`,
      result: `${densityFactor} m²/person`,
      sansRef: 'SANS 10400-T Table 3',
    },
    {
      label: 'Maximum Occupant Load',
      formula: 'N = A / density',
      substitution: `N = ${floorArea} / ${densityFactor}`,
      result: `${occupantLoad} persons`,
      sansRef: 'SANS 10400-T Table 3',
    },
  ]

  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      occupantLoad: { value: occupantLoad, unit: 'persons' },
      floorArea: { value: floorArea, unit: 'm²' },
      densityFactor: { value: densityFactor, unit: 'm²/person' },
    },
    derivation,
    sansReferences: ['SANS 10400-T Table 3'],
    intermediates: { floorArea, densityFactor, occupantLoad },
  }
}

// ---------------------------------------------------------------------------
// 4. Fire Resistance Rating — SANS 10400-T Table 5
// ---------------------------------------------------------------------------

export function computeFireRating(input: FireRatingInput): CalculatorOutput {
  const { buildingType, buildingHeight, occupancyClassification } = input

  const table = FIRE_RATING_TABLE[buildingType]
  if (!table) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: {
        error: { value: `Unknown building type: "${buildingType}"`, unit: '' },
      },
      derivation: [],
      sansReferences: ['SANS 10400-T Table 5'],
      intermediates: {},
    }
  }

  // Find the rating bracket
  const bracket = table.find((b) => buildingHeight <= b.maxHeight)
  const rating = bracket ? bracket.rating : table[table.length - 1].rating

  // Informational output — no utilisation ratio
  const derivation: DerivationStep[] = [
    {
      label: 'Building Type',
      formula: 'type',
      substitution: `type = "${buildingType}"`,
      result: buildingType,
    },
    {
      label: 'Building Height',
      formula: 'H',
      substitution: `H = ${buildingHeight}`,
      result: `${buildingHeight} m`,
    },
    {
      label: 'Occupancy Classification',
      formula: 'class',
      substitution: `class = "${occupancyClassification}"`,
      result: occupancyClassification,
    },
    {
      label: 'Required Fire Resistance Rating',
      formula: 'FRR = lookup(type, height)',
      substitution: `FRR = lookup("${buildingType}", ${buildingHeight}m)`,
      result: `${rating} minutes`,
      sansRef: 'SANS 10400-T Table 5',
    },
  ]

  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      fireResistanceRating: { value: rating, unit: 'minutes' },
      buildingType: { value: buildingType, unit: '' },
      buildingHeight: { value: buildingHeight, unit: 'm' },
      occupancyClassification: { value: occupancyClassification, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10400-T Table 5'],
    intermediates: { buildingHeight, rating },
  }
}

// ---------------------------------------------------------------------------
// 5. Fire Flow Rate — SANS 10400-T / SANS 10090
// ---------------------------------------------------------------------------

export function computeFireFlow(input: FireFlowInput): CalculatorOutput {
  const { buildingArea, occupancyType, constructionType } = input

  const occupancyFactor = FIRE_FLOW_OCCUPANCY_FACTOR[occupancyType]
  const constructionFactor = FIRE_FLOW_CONSTRUCTION_FACTOR[constructionType]

  // Q = A × occupancy_factor × construction_factor / 1000
  // occupancy_factor is L/s per 100m², so: Q = (A / 100) × occupancyFactor × constructionFactor
  const flowRate = (buildingArea / 100) * occupancyFactor * constructionFactor // L/s

  // Informational — no compliance limit to compare against directly
  const derivation: DerivationStep[] = [
    {
      label: 'Building Area',
      formula: 'A',
      substitution: `A = ${buildingArea}`,
      result: `${buildingArea} m²`,
    },
    {
      label: 'Occupancy Factor',
      formula: 'f_occ = lookup(occupancyType)',
      substitution: `f_occ = lookup("${occupancyType}")`,
      result: `${occupancyFactor} L/s per 100m²`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Construction Factor',
      formula: 'f_con = lookup(constructionType)',
      substitution: `f_con = lookup("${constructionType}")`,
      result: `${constructionFactor}`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Required Fire Flow',
      formula: 'Q = (A / 100) × f_occ × f_con',
      substitution: `Q = (${buildingArea} / 100) × ${occupancyFactor} × ${constructionFactor}`,
      result: `${flowRate.toFixed(2)} L/s`,
      sansRef: 'SANS 10400-T',
    },
  ]

  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      fireFlowRate: { value: Math.round(flowRate * 100) / 100, unit: 'L/s' },
      buildingArea: { value: buildingArea, unit: 'm²' },
      occupancyFactor: { value: occupancyFactor, unit: 'L/s per 100m²' },
      constructionFactor: { value: constructionFactor, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10400-T'],
    intermediates: { buildingArea, occupancyFactor, constructionFactor, flowRate },
  }
}

// ---------------------------------------------------------------------------
// 6. Hydrant Spacing — SANS 10090
// ---------------------------------------------------------------------------

export function computeHydrantSpacing(input: HydrantSpacingInput): CalculatorOutput {
  const { riskCategory, proposedSpacing } = input

  const maxSpacing = HYDRANT_MAX_SPACING[riskCategory]

  // Ratio: proposed / max (over 1.0 means proposed spacing exceeds allowable)
  const ratio = proposedSpacing / maxSpacing

  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Maximum Hydrant Spacing',
      formula: 'S_max = lookup(riskCategory)',
      substitution: `S_max = lookup("${riskCategory}")`,
      result: `${maxSpacing} m`,
      sansRef: 'SANS 10090',
    },
    {
      label: 'Proposed Spacing',
      formula: 'S_proposed',
      substitution: `S_proposed = ${proposedSpacing}`,
      result: `${proposedSpacing} m`,
    },
    {
      label: 'Utilisation (Proposed / Max)',
      formula: 'U = S_proposed / S_max',
      substitution: `U = ${proposedSpacing} / ${maxSpacing}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10090',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      maxSpacing: { value: maxSpacing, unit: 'm' },
      proposedSpacing: { value: proposedSpacing, unit: 'm' },
      riskCategory: { value: riskCategory, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10090'],
    intermediates: { maxSpacing, proposedSpacing, ratio },
  }
}

// ---------------------------------------------------------------------------
// 7. Fire Pump Sizing — SANS 10400-T / SANS 1891
// ---------------------------------------------------------------------------

export function computeFirePump(input: FirePumpInput): CalculatorOutput {
  const { systemDemandFlow, frictionLoss, elevationHead, residualPressure } = input

  // Total head (kPa) = friction + elevation head (ρgh) + residual
  const elevationPressure = elevationHead * RHO_G // kPa
  const totalHead = frictionLoss + elevationPressure + residualPressure // kPa

  // Pump power: P = Q × H / (η × 1000)
  // Q in L/s, H in kPa: P (kW) = Q × H / (1000 × η)
  // Actually P = Q(L/s) × H(kPa) / (η × 1000) → since 1 L/s × 1 kPa = 0.001 kW
  const pumpPower = (systemDemandFlow * totalHead) / (PUMP_EFFICIENCY * 1000) // kW

  // Informational — pump sizing doesn't have a pass/fail utilisation ratio
  const derivation: DerivationStep[] = [
    {
      label: 'System Demand Flow',
      formula: 'Q',
      substitution: `Q = ${systemDemandFlow}`,
      result: `${systemDemandFlow} L/s`,
    },
    {
      label: 'Friction Loss',
      formula: 'H_f',
      substitution: `H_f = ${frictionLoss}`,
      result: `${frictionLoss} kPa`,
    },
    {
      label: 'Elevation Head Pressure',
      formula: 'H_e = h × ρg',
      substitution: `H_e = ${elevationHead} × ${RHO_G}`,
      result: `${elevationPressure.toFixed(2)} kPa`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Residual Pressure',
      formula: 'H_r',
      substitution: `H_r = ${residualPressure}`,
      result: `${residualPressure} kPa`,
    },
    {
      label: 'Total Duty Head',
      formula: 'H_total = H_f + H_e + H_r',
      substitution: `H_total = ${frictionLoss} + ${elevationPressure.toFixed(2)} + ${residualPressure}`,
      result: `${totalHead.toFixed(2)} kPa`,
      sansRef: 'SANS 10400-T',
    },
    {
      label: 'Required Pump Power',
      formula: 'P = Q × H_total / (η × 1000)',
      substitution: `P = ${systemDemandFlow} × ${totalHead.toFixed(2)} / (${PUMP_EFFICIENCY} × 1000)`,
      result: `${pumpPower.toFixed(2)} kW`,
      sansRef: 'SANS 1891',
    },
  ]

  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      totalHead: { value: Math.round(totalHead * 100) / 100, unit: 'kPa' },
      pumpPower: { value: Math.round(pumpPower * 100) / 100, unit: 'kW' },
      systemDemandFlow: { value: systemDemandFlow, unit: 'L/s' },
      elevationPressure: { value: Math.round(elevationPressure * 100) / 100, unit: 'kPa' },
    },
    derivation,
    sansReferences: ['SANS 10400-T', 'SANS 1891'],
    intermediates: { elevationPressure, totalHead, pumpPower },
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'fire-travel-distance',
    title: 'Travel Distance Check',
    discipline: 'fire-escape',
    sansRef: 'SANS 10400-T Table 1',
    description: 'Compare measured travel distance against maximum allowable per SANS 10400-T.',
  },
  inputSchema: travelDistanceInputSchema,
  defaults: TRAVEL_DISTANCE_DEFAULTS,
  compute: computeTravelDistance,
})

registerCalculator({
  meta: {
    id: 'fire-exit-width',
    title: 'Exit Width Calculation',
    discipline: 'fire-escape',
    sansRef: 'SANS 10400-T',
    description: 'Minimum required exit width from occupant load and exit capacity factor.',
  },
  inputSchema: exitWidthInputSchema,
  defaults: EXIT_WIDTH_DEFAULTS,
  compute: computeExitWidth,
})

registerCalculator({
  meta: {
    id: 'fire-occupant-load',
    title: 'Occupant Load Calculation',
    discipline: 'fire-escape',
    sansRef: 'SANS 10400-T Table 3',
    description: 'Maximum occupant load from floor area and occupancy density factor.',
  },
  inputSchema: occupantLoadInputSchema,
  defaults: OCCUPANT_LOAD_DEFAULTS,
  compute: computeOccupantLoad,
})

registerCalculator({
  meta: {
    id: 'fire-resistance-rating',
    title: 'Fire Resistance Rating',
    discipline: 'fire-rating',
    sansRef: 'SANS 10400-T Table 5',
    description: 'Required fire resistance period by building type, height, and occupancy.',
  },
  inputSchema: fireRatingInputSchema,
  defaults: FIRE_RATING_DEFAULTS,
  compute: computeFireRating,
})

registerCalculator({
  meta: {
    id: 'fire-flow-rate',
    title: 'Fire Flow Rate',
    discipline: 'fire-water',
    sansRef: 'SANS 10400-T',
    description: 'Required fire water flow from building area, occupancy, and construction type.',
  },
  inputSchema: fireFlowInputSchema,
  defaults: FIRE_FLOW_DEFAULTS,
  compute: computeFireFlow,
})

registerCalculator({
  meta: {
    id: 'fire-hydrant-spacing',
    title: 'Hydrant Spacing Check',
    discipline: 'fire-water',
    sansRef: 'SANS 10090',
    description: 'Maximum permissible hydrant spacing by risk category.',
  },
  inputSchema: hydrantSpacingInputSchema,
  defaults: HYDRANT_SPACING_DEFAULTS,
  compute: computeHydrantSpacing,
})

registerCalculator({
  meta: {
    id: 'fire-pump-sizing',
    title: 'Fire Pump Sizing',
    discipline: 'fire-water',
    sansRef: 'SANS 1891',
    description: 'Required pump duty from system demand, friction losses, and elevation head.',
  },
  inputSchema: firePumpInputSchema,
  defaults: FIRE_PUMP_DEFAULTS,
  compute: computeFirePump,
})
