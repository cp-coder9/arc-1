// Engineer's Calculation Hub — Wet Services Engines
//
// Pure compute functions for cold/hot water pipe sizing, pressure drop
// (Hazen-Williams), drainage pipe sizing (Manning's), vent sizing, geyser
// sizing, solar pre-heat, and circulation return.
// Requirements: 3.1-3.4, 17.1-17.9
//
// References: SANS 10252-1

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import { registerCalculator } from '../calcHubRegistry'
import {
  coldWaterPipeInputSchema,
  COLD_WATER_PIPE_DEFAULTS,
  hotWaterPipeInputSchema,
  HOT_WATER_PIPE_DEFAULTS,
  pressureDropInputSchema,
  PRESSURE_DROP_DEFAULTS,
  drainagePipeInputSchema,
  DRAINAGE_PIPE_DEFAULTS,
  ventSizingInputSchema,
  VENT_SIZING_DEFAULTS,
  geyserSizingInputSchema,
  GEYSER_SIZING_DEFAULTS,
  solarPreHeatInputSchema,
  SOLAR_PRE_HEAT_DEFAULTS,
  circulationReturnInputSchema,
  CIRCULATION_RETURN_DEFAULTS,
} from '../schemas/wetServices'
import type {
  ColdWaterPipeInput,
  HotWaterPipeInput,
  PressureDropInput,
  DrainagePipeInput,
  VentSizingInput,
  GeyserSizingInput,
  SolarPreHeatInput,
  CirculationReturnInput,
} from '../schemas/wetServices'
import { getNextStandardPipeDiameter } from '../data/pipeSizes'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hazen-Williams C coefficient by material */
const HAZEN_WILLIAMS_C: Record<string, number> = {
  copper: 130,
  steel: 100,
  pvc: 150,
}

/** Maximum velocity limits by material (m/s) */
const MAX_VELOCITY: Record<string, number> = {
  copper: 2.0,
  steel: 2.0,
  pvc: 2.0,
}

/** Hot water maximum velocity (lower for temperature-adjusted) */
const HOT_WATER_MAX_VELOCITY: Record<string, number> = {
  copper: 1.5,
  steel: 1.5,
  pvc: 1.2,
}

/** Manning's n for drainage pipe materials */
const MANNING_N: Record<string, number> = {
  pvc: 0.009,
  cast_iron: 0.012,
}

/** Solar irradiation by location (kWh/m²/day) */
const SOLAR_IRRADIATION: Record<string, number> = {
  johannesburg: 5.5,
  cape_town: 5.0,
  durban: 4.8,
  pretoria: 5.6,
}

/** Vent sizing lookup table — SANS 10252-1 Table 8 simplified
 * Key: max fixture units, Value: { maxLength: max developed length (m), diameter: mm }
 */
const VENT_TABLE: { maxFU: number; maxLength: number; diameter: number }[] = [
  { maxFU: 8, maxLength: 15, diameter: 32 },
  { maxFU: 24, maxLength: 12, diameter: 40 },
  { maxFU: 48, maxLength: 9, diameter: 50 },
  { maxFU: 84, maxLength: 15, diameter: 50 },
  { maxFU: 150, maxLength: 9, diameter: 65 },
  { maxFU: 256, maxLength: 15, diameter: 65 },
  { maxFU: 600, maxLength: 30, diameter: 80 },
  { maxFU: 1000, maxLength: 60, diameter: 100 },
]

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Determine pass/fail/warning from a utilisation ratio */
function statusFromRatio(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail'
  if (ratio >= 0.9) return 'warning'
  return 'pass'
}

/**
 * Loading units → probable simultaneous demand (L/s)
 * Q = 0.12·√(LU) for LU ≤ 200
 * Q = 0.083·√(LU) + 0.3 for LU > 200
 */
function loadingUnitsToFlow(lu: number): number {
  if (lu <= 200) {
    return 0.12 * Math.sqrt(lu)
  }
  return 0.083 * Math.sqrt(lu) + 0.3
}

/**
 * Compute pipe diameter from flow and max velocity:
 * D = √(4·Q / (π·v_max)) × 1000 (mm)
 * Q in L/s converted to m³/s internally
 */
function flowToDiameter(flowLs: number, vMax: number): number {
  const Q_m3s = flowLs / 1000
  return Math.sqrt((4 * Q_m3s) / (Math.PI * vMax)) * 1000
}

// ---------------------------------------------------------------------------
// 1. Cold Water Pipe Sizing
// ---------------------------------------------------------------------------

export function computeColdWaterPipe(input: ColdWaterPipeInput): CalculatorOutput {
  const { loadingUnits, pipeMaterial, pipeLength, heightAboveMain, availablePressure } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Step 1: Loading units → probable simultaneous demand
  const Q = loadingUnitsToFlow(loadingUnits)
  intermediates['Q'] = Q
  intermediates['loadingUnits'] = loadingUnits

  const formulaUsed = loadingUnits <= 200
    ? 'Q = 0.12 × √(LU)'
    : 'Q = 0.083 × √(LU) + 0.3'

  derivation.push({
    label: 'Probable simultaneous demand',
    formula: formulaUsed,
    substitution: loadingUnits <= 200
      ? `Q = 0.12 × √(${loadingUnits})`
      : `Q = 0.083 × √(${loadingUnits}) + 0.3`,
    result: `${Q.toFixed(3)} L/s`,
    sansRef: 'SANS 10252-1 §4.3',
  })

  // Step 2: Determine required pipe diameter
  const vMax = MAX_VELOCITY[pipeMaterial]
  const D_calc = flowToDiameter(Q, vMax)
  intermediates['D_calc'] = D_calc
  intermediates['vMax'] = vMax

  derivation.push({
    label: 'Required pipe diameter',
    formula: 'D = √(4·Q / (π·v_max)) × 1000',
    substitution: `D = √(4×${(Q / 1000).toFixed(6)} / (π×${vMax})) × 1000`,
    result: `${D_calc.toFixed(1)} mm`,
    sansRef: 'SANS 10252-1 §4.4',
  })

  // Step 3: Select next standard pipe size
  const materialLookup = pipeMaterial === 'pvc' ? 'pvc' as const : pipeMaterial === 'steel' ? 'steel' as const : 'copper' as const
  const stdPipe = getNextStandardPipeDiameter(D_calc, materialLookup)
  const D_selected = stdPipe ? stdPipe.nominalDiameter : Math.ceil(D_calc / 5) * 5
  intermediates['D_selected'] = D_selected

  derivation.push({
    label: 'Selected standard pipe diameter',
    formula: 'D_std ≥ D_calc (from pipe table)',
    substitution: `D_calc = ${D_calc.toFixed(1)} mm → next standard ${pipeMaterial}`,
    result: `${D_selected} mm`,
    sansRef: 'SANS 10252-1 §4.4',
  })

  // Step 4: Pressure drop using Hazen-Williams
  const C = HAZEN_WILLIAMS_C[pipeMaterial]
  const Q_m3s = Q / 1000
  const D_m = D_selected / 1000
  const hf = 10.67 * Math.pow(Q_m3s, 1.85) * pipeLength /
    (Math.pow(C, 1.85) * Math.pow(D_m, 4.87))
  const frictionLoss_kPa = hf * 9.81
  intermediates['hf'] = hf
  intermediates['frictionLoss_kPa'] = frictionLoss_kPa
  intermediates['C'] = C

  derivation.push({
    label: 'Friction head loss (Hazen-Williams)',
    formula: 'hf = 10.67·Q^1.85·L / (C^1.85·D^4.87)',
    substitution: `hf = 10.67×${Q_m3s.toFixed(6)}^1.85×${pipeLength} / (${C}^1.85×${D_m.toFixed(4)}^4.87)`,
    result: `${hf.toFixed(3)} m`,
    sansRef: 'SANS 10252-1 §4.5',
  })

  // Step 5: Residual pressure check
  const staticHead_kPa = heightAboveMain * 9.81
  const residualPressure = availablePressure - staticHead_kPa - frictionLoss_kPa
  intermediates['staticHead_kPa'] = staticHead_kPa
  intermediates['residualPressure'] = residualPressure

  // Minimum residual pressure: 100 kPa at highest draw-off
  const minResidual = 100
  const utilisationRatio = minResidual / Math.max(residualPressure, 0.001)

  derivation.push({
    label: 'Residual pressure at highest draw-off',
    formula: 'P_res = P_supply - ρgh - Δp_friction',
    substitution: `P_res = ${availablePressure} - ${staticHead_kPa.toFixed(1)} - ${frictionLoss_kPa.toFixed(1)}`,
    result: `${residualPressure.toFixed(1)} kPa`,
    sansRef: 'SANS 10252-1 §4.6',
    isFailing: residualPressure < minResidual,
  })

  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      probableFlow: { value: Number(Q.toFixed(3)), unit: 'L/s' },
      calculatedDiameter: { value: Number(D_calc.toFixed(1)), unit: 'mm' },
      selectedDiameter: { value: D_selected, unit: 'mm' },
      frictionHeadLoss: { value: Number(hf.toFixed(3)), unit: 'm' },
      residualPressure: { value: Number(residualPressure.toFixed(1)), unit: 'kPa' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §4.3', 'SANS 10252-1 §4.4', 'SANS 10252-1 §4.5', 'SANS 10252-1 §4.6'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 2. Hot Water Pipe Sizing
// ---------------------------------------------------------------------------

export function computeHotWaterPipe(input: HotWaterPipeInput): CalculatorOutput {
  const { loadingUnits, pipeMaterial, pipeLength, maxDeadLeg } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Step 1: Probable simultaneous demand
  const Q = loadingUnitsToFlow(loadingUnits)
  intermediates['Q'] = Q

  const formulaUsed = loadingUnits <= 200
    ? 'Q = 0.12 × √(LU)'
    : 'Q = 0.083 × √(LU) + 0.3'

  derivation.push({
    label: 'Probable simultaneous demand (hot water)',
    formula: formulaUsed,
    substitution: loadingUnits <= 200
      ? `Q = 0.12 × √(${loadingUnits})`
      : `Q = 0.083 × √(${loadingUnits}) + 0.3`,
    result: `${Q.toFixed(3)} L/s`,
    sansRef: 'SANS 10252-1 §5.2',
  })

  // Step 2: Temperature-adjusted velocity limit
  const vMax = HOT_WATER_MAX_VELOCITY[pipeMaterial]
  intermediates['vMax'] = vMax

  derivation.push({
    label: 'Temperature-adjusted max velocity',
    formula: 'v_max (hot water, reduced for noise/erosion)',
    substitution: `Material: ${pipeMaterial}, T = 60°C`,
    result: `${vMax} m/s`,
    sansRef: 'SANS 10252-1 §5.3',
  })

  // Step 3: Required pipe diameter
  const D_calc = flowToDiameter(Q, vMax)
  intermediates['D_calc'] = D_calc

  derivation.push({
    label: 'Required pipe diameter',
    formula: 'D = √(4·Q / (π·v_max)) × 1000',
    substitution: `D = √(4×${(Q / 1000).toFixed(6)} / (π×${vMax})) × 1000`,
    result: `${D_calc.toFixed(1)} mm`,
    sansRef: 'SANS 10252-1 §5.3',
  })

  // Step 4: Select next standard pipe size
  const materialLookup = pipeMaterial === 'pvc' ? 'pvc' as const : pipeMaterial === 'steel' ? 'steel' as const : 'copper' as const
  const stdPipe = getNextStandardPipeDiameter(D_calc, materialLookup)
  const D_selected = stdPipe ? stdPipe.nominalDiameter : Math.ceil(D_calc / 5) * 5
  intermediates['D_selected'] = D_selected

  derivation.push({
    label: 'Selected standard pipe diameter',
    formula: 'D_std ≥ D_calc (from pipe table)',
    substitution: `D_calc = ${D_calc.toFixed(1)} mm → next standard ${pipeMaterial}`,
    result: `${D_selected} mm`,
    sansRef: 'SANS 10252-1 §5.3',
  })

  // Step 5: Dead leg volume check
  // Dead leg volume = π/4 × D² × L (in litres)
  const D_m = D_selected / 1000
  const deadLegVolume = (Math.PI / 4) * D_m * D_m * maxDeadLeg * 1000
  intermediates['deadLegVolume'] = deadLegVolume

  // SANS 10252-1 limit: dead leg max 1.5L for pipes ≤ 22mm, 3L for larger
  const maxDeadLegVolume = D_selected <= 22 ? 1.5 : 3.0
  const deadLegRatio = deadLegVolume / maxDeadLegVolume
  intermediates['maxDeadLegVolume'] = maxDeadLegVolume
  intermediates['deadLegRatio'] = deadLegRatio

  derivation.push({
    label: 'Dead leg volume check',
    formula: 'V_dead = π/4 × D² × L_dead × 1000',
    substitution: `V_dead = π/4 × ${D_m.toFixed(4)}² × ${maxDeadLeg} × 1000`,
    result: `${deadLegVolume.toFixed(2)} L (max ${maxDeadLegVolume} L)`,
    sansRef: 'SANS 10252-1 §5.4',
    isFailing: deadLegRatio > 1.0,
  })

  // Utilisation is based on dead leg compliance + velocity utilisation
  const velocityActual = (Q / 1000) / ((Math.PI / 4) * D_m * D_m)
  const velocityRatio = velocityActual / vMax
  intermediates['velocityActual'] = velocityActual
  const utilisationRatio = Math.max(velocityRatio, deadLegRatio)
  const status = statusFromRatio(utilisationRatio)

  derivation.push({
    label: 'Actual velocity in selected pipe',
    formula: 'v = Q / A',
    substitution: `v = ${(Q / 1000).toFixed(6)} / (π/4 × ${D_m.toFixed(4)}²)`,
    result: `${velocityActual.toFixed(2)} m/s (limit ${vMax} m/s)`,
    sansRef: 'SANS 10252-1 §5.3',
  })

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      probableFlow: { value: Number(Q.toFixed(3)), unit: 'L/s' },
      calculatedDiameter: { value: Number(D_calc.toFixed(1)), unit: 'mm' },
      selectedDiameter: { value: D_selected, unit: 'mm' },
      deadLegVolume: { value: Number(deadLegVolume.toFixed(2)), unit: 'L' },
      maxDeadLegVolume: { value: maxDeadLegVolume, unit: 'L' },
      actualVelocity: { value: Number(velocityActual.toFixed(2)), unit: 'm/s' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §5.2', 'SANS 10252-1 §5.3', 'SANS 10252-1 §5.4'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 3. Pressure Drop (Hazen-Williams)
// ---------------------------------------------------------------------------

export function computePressureDrop(input: PressureDropInput): CalculatorOutput {
  const { flowRate, pipeDiameter, pipeLength, hazenWilliamsC, numFittings } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const C = hazenWilliamsC
  const Q = flowRate / 1000 // Convert L/s to m³/s
  const D = pipeDiameter / 1000 // Convert mm to m
  intermediates['Q_m3s'] = Q
  intermediates['D_m'] = D
  intermediates['C'] = C

  // Step 1: Equivalent length for fittings (approx 0.6m per fitting)
  const fittingLength = numFittings * 0.6
  const totalLength = pipeLength + fittingLength
  intermediates['fittingLength'] = fittingLength
  intermediates['totalLength'] = totalLength

  derivation.push({
    label: 'Equivalent pipe length (including fittings)',
    formula: 'L_total = L_pipe + N_fittings × 0.6',
    substitution: `L_total = ${pipeLength} + ${numFittings} × 0.6`,
    result: `${totalLength.toFixed(1)} m`,
    sansRef: 'SANS 10252-1 §4.5',
  })

  // Step 2: Hazen-Williams head loss
  // hf = 10.67·Q^1.85·L / (C^1.85·D^4.87)
  const hf = 10.67 * Math.pow(Q, 1.85) * totalLength /
    (Math.pow(C, 1.85) * Math.pow(D, 4.87))
  intermediates['hf'] = hf

  derivation.push({
    label: 'Friction head loss (Hazen-Williams)',
    formula: 'hf = 10.67·Q^1.85·L / (C^1.85·D^4.87)',
    substitution: `hf = 10.67×${Q.toFixed(6)}^1.85×${totalLength.toFixed(1)} / (${C}^1.85×${D.toFixed(4)}^4.87)`,
    result: `${hf.toFixed(3)} m`,
    sansRef: 'SANS 10252-1 §4.5',
  })

  // Step 3: Convert to pressure (kPa)
  const pressureDrop_kPa = hf * 9.81
  intermediates['pressureDrop_kPa'] = pressureDrop_kPa

  derivation.push({
    label: 'Pressure drop',
    formula: 'Δp = hf × ρ × g = hf × 9.81',
    substitution: `Δp = ${hf.toFixed(3)} × 9.81`,
    result: `${pressureDrop_kPa.toFixed(2)} kPa`,
    sansRef: 'SANS 10252-1 §4.5',
  })

  // Step 4: Head loss per metre
  const hf_per_m = hf / totalLength
  intermediates['hf_per_m'] = hf_per_m

  derivation.push({
    label: 'Head loss per metre',
    formula: 'hf/L = hf / L_total',
    substitution: `hf/L = ${hf.toFixed(3)} / ${totalLength.toFixed(1)}`,
    result: `${hf_per_m.toFixed(4)} m/m`,
    sansRef: 'SANS 10252-1 §4.5',
  })

  // Step 5: Flow velocity
  const A_pipe = (Math.PI / 4) * D * D
  const velocity = Q / A_pipe
  intermediates['velocity'] = velocity

  derivation.push({
    label: 'Flow velocity',
    formula: 'v = Q / A = Q / (π·D²/4)',
    substitution: `v = ${Q.toFixed(6)} / (π×${D.toFixed(4)}²/4)`,
    result: `${velocity.toFixed(2)} m/s`,
    sansRef: 'SANS 10252-1 §4.4',
  })

  // Utilisation: velocity vs 2.0 m/s max
  const utilisationRatio = velocity / 2.0
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      headLoss: { value: Number(hf.toFixed(3)), unit: 'm' },
      pressureDrop: { value: Number(pressureDrop_kPa.toFixed(2)), unit: 'kPa' },
      headLossPerMetre: { value: Number(hf_per_m.toFixed(4)), unit: 'm/m' },
      flowVelocity: { value: Number(velocity.toFixed(2)), unit: 'm/s' },
      equivalentLength: { value: Number(totalLength.toFixed(1)), unit: 'm' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §4.4', 'SANS 10252-1 §4.5'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 4. Drainage Pipe Sizing (Manning's Equation — Partially Filled)
// ---------------------------------------------------------------------------

/**
 * Manning's equation for partially filled circular pipes at 75% depth ratio.
 * At d/D = 0.75:
 *   θ = 2·arccos(1 - 2×0.75) = 2·arccos(-0.5) = 2×(2π/3) = 4π/3
 *   A = (D²/8)·(θ - sinθ)
 *   P = D·θ/2
 *   R = A/P
 *   Q = (1/n)·A·R^(2/3)·S^(1/2)
 */
function manningPartialFlow(D_m: number, n: number, S: number): number {
  const depthRatio = 0.75
  const theta = 2 * Math.acos(1 - 2 * depthRatio)
  const A = (D_m * D_m / 8) * (theta - Math.sin(theta))
  const P = (D_m * theta) / 2
  const R = A / P
  return (1 / n) * A * Math.pow(R, 2 / 3) * Math.sqrt(S)
}

export function computeDrainagePipe(input: DrainagePipeInput): CalculatorOutput {
  const { fixtureUnits, gradient, pipeType } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const n = MANNING_N[pipeType]
  intermediates['n'] = n
  intermediates['fixtureUnits'] = fixtureUnits
  intermediates['gradient'] = gradient

  // Step 1: Convert fixture units to design flow
  // Approximate: Q (L/s) ≈ 0.12·√(FU) for drainage (similar to loading units)
  const Q_Ls = 0.12 * Math.sqrt(fixtureUnits)
  const Q_m3s = Q_Ls / 1000
  intermediates['Q_Ls'] = Q_Ls
  intermediates['Q_m3s'] = Q_m3s

  derivation.push({
    label: 'Design flow from fixture units',
    formula: 'Q = 0.12 × √(FU)',
    substitution: `Q = 0.12 × √(${fixtureUnits})`,
    result: `${Q_Ls.toFixed(3)} L/s`,
    sansRef: 'SANS 10252-1 §6.2',
  })

  // Step 2: Determine minimum pipe diameter by iterating standard sizes
  // Use PVC drainage sizes: 40, 50, 75, 110, 160, 200, 250, 315 mm
  const drainageSizes = [40, 50, 75, 110, 160, 200, 250, 315]
  let D_selected = drainageSizes[drainageSizes.length - 1]
  let Q_capacity = 0

  for (const D_mm of drainageSizes) {
    const D_m = D_mm / 1000
    const cap = manningPartialFlow(D_m, n, gradient) * 1000 // L/s
    if (cap >= Q_Ls) {
      D_selected = D_mm
      Q_capacity = cap
      break
    }
    Q_capacity = cap
  }

  // If we didn't find a pipe large enough, use the largest
  if (Q_capacity < Q_Ls) {
    const D_m = D_selected / 1000
    Q_capacity = manningPartialFlow(D_m, n, gradient) * 1000
  }

  intermediates['D_selected'] = D_selected
  intermediates['Q_capacity'] = Q_capacity

  derivation.push({
    label: 'Manning\'s equation (75% depth ratio)',
    formula: 'Q = (1/n)·A·R^(2/3)·S^(1/2) at d/D = 0.75',
    substitution: `n = ${n}, S = ${gradient}, D = ${D_selected} mm`,
    result: `Capacity = ${Q_capacity.toFixed(3)} L/s`,
    sansRef: 'SANS 10252-1 §6.3',
  })

  derivation.push({
    label: 'Selected drain pipe diameter',
    formula: 'Smallest D where Q_capacity ≥ Q_design',
    substitution: `Q_design = ${Q_Ls.toFixed(3)} L/s, Q_capacity = ${Q_capacity.toFixed(3)} L/s`,
    result: `${D_selected} mm ${pipeType.toUpperCase()}`,
    sansRef: 'SANS 10252-1 §6.3',
  })

  // Step 3: Flow velocity at design conditions
  const D_m = D_selected / 1000
  const theta = 2 * Math.acos(1 - 2 * 0.75)
  const A_flow = (D_m * D_m / 8) * (theta - Math.sin(theta))
  const velocity = (Q_Ls / 1000) / A_flow
  intermediates['velocity'] = velocity

  derivation.push({
    label: 'Flow velocity at design flow',
    formula: 'v = Q / A_flow',
    substitution: `v = ${(Q_Ls / 1000).toFixed(6)} / ${A_flow.toFixed(6)}`,
    result: `${velocity.toFixed(2)} m/s`,
    sansRef: 'SANS 10252-1 §6.4',
  })

  // Utilisation ratio: design flow vs pipe capacity
  const utilisationRatio = Q_Ls / Q_capacity
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      designFlow: { value: Number(Q_Ls.toFixed(3)), unit: 'L/s' },
      selectedDiameter: { value: D_selected, unit: 'mm' },
      pipeCapacity: { value: Number(Q_capacity.toFixed(3)), unit: 'L/s' },
      flowVelocity: { value: Number(velocity.toFixed(2)), unit: 'm/s' },
      gradient: { value: gradient, unit: 'm/m' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §6.2', 'SANS 10252-1 §6.3', 'SANS 10252-1 §6.4'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 5. Vent Pipe Sizing
// ---------------------------------------------------------------------------

export function computeVentSizing(input: VentSizingInput): CalculatorOutput {
  const { fixtureUnits, developedLength } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  intermediates['fixtureUnits'] = fixtureUnits
  intermediates['developedLength'] = developedLength

  // Lookup from SANS 10252-1 Table 8
  let selectedDiameter = 100 // default to largest
  let matchedEntry: typeof VENT_TABLE[0] | undefined

  for (const entry of VENT_TABLE) {
    if (fixtureUnits <= entry.maxFU && developedLength <= entry.maxLength) {
      selectedDiameter = entry.diameter
      matchedEntry = entry
      break
    }
  }

  // If no match found, use the largest diameter
  if (!matchedEntry) {
    selectedDiameter = 100
    matchedEntry = VENT_TABLE[VENT_TABLE.length - 1]
  }

  intermediates['selectedDiameter'] = selectedDiameter

  derivation.push({
    label: 'Vent sizing lookup (SANS 10252-1 Table 8)',
    formula: 'D_vent = f(FU, developed_length)',
    substitution: `FU = ${fixtureUnits}, L_dev = ${developedLength} m`,
    result: `${selectedDiameter} mm`,
    sansRef: 'SANS 10252-1 §7.4',
  })

  derivation.push({
    label: 'Table entry constraints',
    formula: 'FU ≤ maxFU AND L_dev ≤ maxLength',
    substitution: `FU=${fixtureUnits} ≤ ${matchedEntry.maxFU}, L=${developedLength} ≤ ${matchedEntry.maxLength}`,
    result: `${selectedDiameter} mm vent pipe`,
    sansRef: 'SANS 10252-1 §7.4',
  })

  // Utilisation as ratio of FU to table max
  const utilisationRatio = fixtureUnits / matchedEntry.maxFU
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      ventDiameter: { value: selectedDiameter, unit: 'mm' },
      fixtureUnits: { value: fixtureUnits, unit: 'FU' },
      developedLength: { value: developedLength, unit: 'm' },
      tableMaxFU: { value: matchedEntry.maxFU, unit: 'FU' },
      tableMaxLength: { value: matchedEntry.maxLength, unit: 'm' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §7.4'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 6. Geyser / Storage Vessel Sizing
// ---------------------------------------------------------------------------

export function computeGeyserSizing(input: GeyserSizingInput): CalculatorOutput {
  const { numOccupants, peakDemandFactor, recoveryRate } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // SA design: 50 litres per person per day for hot water
  const litresPerPerson = 50
  const peakHour = 1 // peak hour duration

  intermediates['numOccupants'] = numOccupants
  intermediates['peakDemandFactor'] = peakDemandFactor
  intermediates['recoveryRate'] = recoveryRate
  intermediates['litresPerPerson'] = litresPerPerson

  // Step 1: Peak demand
  const peakDemand = numOccupants * litresPerPerson * peakDemandFactor
  intermediates['peakDemand'] = peakDemand

  derivation.push({
    label: 'Peak hot water demand',
    formula: 'V_peak = occupants × 50 L/person × peakFactor',
    substitution: `V_peak = ${numOccupants} × ${litresPerPerson} × ${peakDemandFactor}`,
    result: `${peakDemand.toFixed(0)} L`,
    sansRef: 'SANS 10252-1 §8.2',
  })

  // Step 2: Recovery during peak hour
  const recoveryDuringPeak = recoveryRate * peakHour
  intermediates['recoveryDuringPeak'] = recoveryDuringPeak

  derivation.push({
    label: 'Recovery during peak hour',
    formula: 'V_recovery = recoveryRate × peakHour',
    substitution: `V_recovery = ${recoveryRate} × ${peakHour}`,
    result: `${recoveryDuringPeak.toFixed(0)} L`,
    sansRef: 'SANS 10252-1 §8.3',
  })

  // Step 3: Required storage volume
  // V = (occupants × 50L × peakFactor) - (recoveryRate × peakHour)
  const V_required = Math.max(peakDemand - recoveryDuringPeak, 0)
  intermediates['V_required'] = V_required

  derivation.push({
    label: 'Required storage volume',
    formula: 'V = V_peak - V_recovery',
    substitution: `V = ${peakDemand.toFixed(0)} - ${recoveryDuringPeak.toFixed(0)}`,
    result: `${V_required.toFixed(0)} L`,
    sansRef: 'SANS 10252-1 §8.3',
  })

  // Step 4: Select standard geyser size
  const standardSizes = [100, 150, 200, 250, 300, 400, 500]
  let selectedSize = standardSizes[standardSizes.length - 1]
  for (const size of standardSizes) {
    if (size >= V_required) {
      selectedSize = size
      break
    }
  }
  intermediates['selectedSize'] = selectedSize

  derivation.push({
    label: 'Selected geyser size',
    formula: 'V_geyser ≥ V_required (standard sizes)',
    substitution: `V_required = ${V_required.toFixed(0)} L → next standard size`,
    result: `${selectedSize} L`,
    sansRef: 'SANS 10252-1 §8.3',
  })

  // Utilisation: required vs selected capacity
  const utilisationRatio = selectedSize > 0 ? V_required / selectedSize : 0
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      peakDemand: { value: Number(peakDemand.toFixed(0)), unit: 'L' },
      recoveryDuringPeak: { value: Number(recoveryDuringPeak.toFixed(0)), unit: 'L' },
      requiredStorage: { value: Number(V_required.toFixed(0)), unit: 'L' },
      selectedGeyserSize: { value: selectedSize, unit: 'L' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §8.2', 'SANS 10252-1 §8.3'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 7. Solar Pre-Heat System
// ---------------------------------------------------------------------------

export function computeSolarPreHeat(input: SolarPreHeatInput): CalculatorOutput {
  const { dailyHotWaterDemand, location, collectorEfficiency, solarIrradiation } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Step 1: Determine solar irradiation
  const irradiation = solarIrradiation ?? SOLAR_IRRADIATION[location]
  intermediates['irradiation'] = irradiation
  intermediates['dailyDemand'] = dailyHotWaterDemand
  intermediates['efficiency'] = collectorEfficiency

  derivation.push({
    label: 'Solar irradiation for location',
    formula: 'I_solar = lookup(location) or override',
    substitution: `Location: ${location}, I = ${irradiation} kWh/m²/day`,
    result: `${irradiation} kWh/m²/day`,
    sansRef: 'SANS 10252-1 §9.2',
  })

  // Step 2: Energy required to heat water
  // ΔT = 60°C - 15°C = 45°C (mains to hot water temperature)
  const deltaT = 45
  // Energy = mass × Cp × ΔT = demand(L) × 4.18(kJ/kg·K) × ΔT(K) / 3600 → kWh
  const energyRequired = (dailyHotWaterDemand * deltaT * 4.18) / 3600
  intermediates['deltaT'] = deltaT
  intermediates['energyRequired'] = energyRequired

  derivation.push({
    label: 'Daily energy required',
    formula: 'E = demand × ΔT × 4.18 / 3600',
    substitution: `E = ${dailyHotWaterDemand} × ${deltaT} × 4.18 / 3600`,
    result: `${energyRequired.toFixed(2)} kWh/day`,
    sansRef: 'SANS 10252-1 §9.3',
  })

  // Step 3: Required collector area
  // A = E / (I × η) = (demand × ΔT × 4.18) / (irradiation × efficiency × 3600)
  const A_collector = energyRequired / (irradiation * collectorEfficiency)
  intermediates['A_collector'] = A_collector

  derivation.push({
    label: 'Required collector area',
    formula: 'A = (demand × ΔT × 4.18) / (irradiation × efficiency × 3600)',
    substitution: `A = (${dailyHotWaterDemand} × ${deltaT} × 4.18) / (${irradiation} × ${collectorEfficiency} × 3600)`,
    result: `${A_collector.toFixed(2)} m²`,
    sansRef: 'SANS 10252-1 §9.3',
  })

  // Step 4: Solar fraction achieved
  const solarEnergyAvailable = A_collector * irradiation * collectorEfficiency
  const solarFraction = solarEnergyAvailable / energyRequired
  intermediates['solarEnergyAvailable'] = solarEnergyAvailable
  intermediates['solarFraction'] = solarFraction

  derivation.push({
    label: 'Solar fraction achieved',
    formula: 'SF = (A × I × η) / E_required',
    substitution: `SF = (${A_collector.toFixed(2)} × ${irradiation} × ${collectorEfficiency}) / ${energyRequired.toFixed(2)}`,
    result: `${(solarFraction * 100).toFixed(1)}%`,
    sansRef: 'SANS 10252-1 §9.4',
  })

  // Step 5: Number of standard panels (typical 2m² per panel)
  const panelArea = 2.0
  const numPanels = Math.ceil(A_collector / panelArea)
  intermediates['numPanels'] = numPanels

  derivation.push({
    label: 'Number of standard panels (2 m² each)',
    formula: 'N = ⌈A_collector / 2.0⌉',
    substitution: `N = ⌈${A_collector.toFixed(2)} / 2.0⌉`,
    result: `${numPanels} panels`,
    sansRef: 'SANS 10252-1 §9.4',
  })

  // Utilisation: design aims for ~100% solar fraction; ratio shows coverage
  // Invert: lower fraction means more auxiliary needed
  const utilisationRatio = 1.0 - Math.min(solarFraction, 1.0)
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      collectorArea: { value: Number(A_collector.toFixed(2)), unit: 'm²' },
      numPanels: { value: numPanels, unit: 'panels' },
      solarFraction: { value: Number((solarFraction * 100).toFixed(1)), unit: '%' },
      energyRequired: { value: Number(energyRequired.toFixed(2)), unit: 'kWh/day' },
      irradiation: { value: irradiation, unit: 'kWh/m²/day' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §9.2', 'SANS 10252-1 §9.3', 'SANS 10252-1 §9.4'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 8. Circulation Return System
// ---------------------------------------------------------------------------

export function computeCirculationReturn(input: CirculationReturnInput): CalculatorOutput {
  const { pipeLength, pipeDiameter, insulationThickness, ambientTemp, flowTemp } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const D_pipe = pipeDiameter / 1000 // m
  const insulation_m = insulationThickness / 1000 // m
  const deltaT = flowTemp - ambientTemp
  intermediates['D_pipe'] = D_pipe
  intermediates['insulation_m'] = insulation_m
  intermediates['deltaT'] = deltaT

  // Step 1: Heat loss per metre of insulated pipe
  // U_pipe approximation for insulated pipe (W/m·K):
  // U = 2π·k / ln((D + 2t) / D)
  // k_insulation ≈ 0.04 W/m·K (typical mineral wool / foam)
  const k_insulation = 0.04
  const D_outer = D_pipe + 2 * insulation_m
  const U_linear = (2 * Math.PI * k_insulation) / Math.log(D_outer / D_pipe)
  intermediates['k_insulation'] = k_insulation
  intermediates['D_outer'] = D_outer
  intermediates['U_linear'] = U_linear

  derivation.push({
    label: 'Linear heat transfer coefficient (insulated pipe)',
    formula: 'U = 2π·k / ln((D + 2t) / D)',
    substitution: `U = 2π×${k_insulation} / ln((${D_pipe.toFixed(4)} + 2×${insulation_m}) / ${D_pipe.toFixed(4)})`,
    result: `${U_linear.toFixed(4)} W/m·K`,
    sansRef: 'SANS 10252-1 §10.2',
  })

  // Step 2: Total heat loss from pipe run
  // heat_loss = U_linear × L × ΔT (W)
  const heatLoss = U_linear * pipeLength * deltaT
  intermediates['heatLoss'] = heatLoss
  const heatLoss_kW = heatLoss / 1000
  intermediates['heatLoss_kW'] = heatLoss_kW

  derivation.push({
    label: 'Total pipe heat loss',
    formula: 'Q_loss = U × L × ΔT',
    substitution: `Q_loss = ${U_linear.toFixed(4)} × ${pipeLength} × ${deltaT}`,
    result: `${heatLoss.toFixed(1)} W (${heatLoss_kW.toFixed(3)} kW)`,
    sansRef: 'SANS 10252-1 §10.2',
  })

  // Step 3: Required circulation flow rate
  // flow = Q_loss / (Cp × ΔT_circ)
  // ΔT_circ = temperature drop in circulation loop (typically 5°C)
  const deltaT_circ = 5 // °C allowable drop
  const Cp = 4180 // J/kg·K
  const flowRate = heatLoss / (Cp * deltaT_circ) // kg/s ≈ L/s
  intermediates['deltaT_circ'] = deltaT_circ
  intermediates['flowRate'] = flowRate

  derivation.push({
    label: 'Required circulation flow rate',
    formula: 'ṁ = Q_loss / (Cp × ΔT_circ)',
    substitution: `ṁ = ${heatLoss.toFixed(1)} / (${Cp} × ${deltaT_circ})`,
    result: `${flowRate.toFixed(4)} L/s`,
    sansRef: 'SANS 10252-1 §10.3',
  })

  // Step 4: Pump head estimation
  // Friction head in circulation loop (approximate using 200 Pa/m for small pipes)
  const frictionPerMetre = 200 // Pa/m (typical for small copper pipes)
  const totalHead_Pa = frictionPerMetre * pipeLength * 2 // flow + return
  const totalHead_m = totalHead_Pa / 9810
  intermediates['totalHead_Pa'] = totalHead_Pa
  intermediates['totalHead_m'] = totalHead_m

  derivation.push({
    label: 'Estimated pump head',
    formula: 'H = friction_per_m × L × 2 / 9810',
    substitution: `H = ${frictionPerMetre} × ${pipeLength} × 2 / 9810`,
    result: `${totalHead_m.toFixed(2)} m`,
    sansRef: 'SANS 10252-1 §10.4',
  })

  // Step 5: Pump duty
  // Power = flow × head × ρ × g / η_pump
  const pumpEfficiency = 0.5 // typical small circulator
  const pumpPower = (flowRate / 1000) * totalHead_Pa / pumpEfficiency // W
  intermediates['pumpEfficiency'] = pumpEfficiency
  intermediates['pumpPower'] = pumpPower

  derivation.push({
    label: 'Circulation pump power',
    formula: 'P = Q × Δp / η',
    substitution: `P = ${flowRate.toFixed(4)} × ${totalHead_Pa} / ${pumpEfficiency} (as W)`,
    result: `${pumpPower.toFixed(1)} W`,
    sansRef: 'SANS 10252-1 §10.4',
  })

  // Utilisation: heat loss relative to acceptable (< 10 W/m is good)
  const heatLossPerMetre = heatLoss / pipeLength
  intermediates['heatLossPerMetre'] = heatLossPerMetre
  const maxAcceptable = 10 // W/m
  const utilisationRatio = heatLossPerMetre / maxAcceptable
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      totalHeatLoss: { value: Number(heatLoss.toFixed(1)), unit: 'W' },
      heatLossPerMetre: { value: Number(heatLossPerMetre.toFixed(2)), unit: 'W/m' },
      circulationFlow: { value: Number(flowRate.toFixed(4)), unit: 'L/s' },
      pumpHead: { value: Number(totalHead_m.toFixed(2)), unit: 'm' },
      pumpPower: { value: Number(pumpPower.toFixed(1)), unit: 'W' },
    },
    derivation,
    sansReferences: ['SANS 10252-1 §10.2', 'SANS 10252-1 §10.3', 'SANS 10252-1 §10.4'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// Calculator Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'wet-cold-water-pipe',
    title: 'Cold Water Pipe Sizing',
    discipline: 'wet-waterpipe',
    sansRef: 'SANS 10252-1',
    description: 'Size cold water pipes from loading units, check velocity and residual pressure',
  },
  inputSchema: coldWaterPipeInputSchema,
  defaults: COLD_WATER_PIPE_DEFAULTS,
  compute: computeColdWaterPipe,
})

registerCalculator({
  meta: {
    id: 'wet-hot-water-pipe',
    title: 'Hot Water Pipe Sizing',
    discipline: 'wet-hotwater',
    sansRef: 'SANS 10252-1',
    description: 'Size hot water pipes with temperature-adjusted velocity and dead leg checks',
  },
  inputSchema: hotWaterPipeInputSchema,
  defaults: HOT_WATER_PIPE_DEFAULTS,
  compute: computeHotWaterPipe,
})

registerCalculator({
  meta: {
    id: 'wet-pressure-drop',
    title: 'Pressure Drop (Hazen-Williams)',
    discipline: 'wet-waterpipe',
    sansRef: 'SANS 10252-1',
    description: 'Calculate friction losses using Hazen-Williams formula for water supply pipes',
  },
  inputSchema: pressureDropInputSchema,
  defaults: PRESSURE_DROP_DEFAULTS,
  compute: computePressureDrop,
})

registerCalculator({
  meta: {
    id: 'wet-drainage-pipe',
    title: 'Drainage Pipe Sizing',
    discipline: 'wet-drainage',
    sansRef: 'SANS 10252-1',
    description: 'Size drainage pipes from fixture units using Manning\'s equation for partially filled pipes',
  },
  inputSchema: drainagePipeInputSchema,
  defaults: DRAINAGE_PIPE_DEFAULTS,
  compute: computeDrainagePipe,
})

registerCalculator({
  meta: {
    id: 'wet-vent-sizing',
    title: 'Vent Pipe Sizing',
    discipline: 'wet-drainage',
    sansRef: 'SANS 10252-1',
    description: 'Determine vent pipe diameter from fixture units and developed length per Table 8',
  },
  inputSchema: ventSizingInputSchema,
  defaults: VENT_SIZING_DEFAULTS,
  compute: computeVentSizing,
})

registerCalculator({
  meta: {
    id: 'wet-geyser-sizing',
    title: 'Geyser / Storage Vessel Sizing',
    discipline: 'wet-hotwater',
    sansRef: 'SANS 10252-1',
    description: 'Compute hot water storage volume from occupants, peak demand, and recovery rate',
  },
  inputSchema: geyserSizingInputSchema,
  defaults: GEYSER_SIZING_DEFAULTS,
  compute: computeGeyserSizing,
})

registerCalculator({
  meta: {
    id: 'wet-solar-preheat',
    title: 'Solar Pre-Heat System',
    discipline: 'wet-hotwater',
    sansRef: 'SANS 10252-1',
    description: 'Calculate solar collector area from demand, location irradiation, and efficiency',
  },
  inputSchema: solarPreHeatInputSchema,
  defaults: SOLAR_PRE_HEAT_DEFAULTS,
  compute: computeSolarPreHeat,
})

registerCalculator({
  meta: {
    id: 'wet-circulation-return',
    title: 'Circulation Return System',
    discipline: 'wet-hotwater',
    sansRef: 'SANS 10252-1',
    description: 'Compute heat loss from pipe runs and circulation pump duty',
  },
  inputSchema: circulationReturnInputSchema,
  defaults: CIRCULATION_RETURN_DEFAULTS,
  compute: computeCirculationReturn,
})
