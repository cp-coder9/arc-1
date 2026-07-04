// Engineer's Calculation Hub — Stormwater Engines
//
// Pure compute functions for rational method peak runoff, pipe sizing
// (Manning's equation), and attenuation tank sizing (triangular hydrograph).
// Requirements: 3.1-3.4, 13.1-13.3
//
// References: Rational Method, Manning's Equation, Triangular Hydrograph Method

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import { registerCalculator } from '../calcHubRegistry'
import {
  rationalMethodInputSchema,
  RATIONAL_METHOD_DEFAULTS,
  pipeSizingInputSchema,
  PIPE_SIZING_DEFAULTS,
  attenuationInputSchema,
  ATTENUATION_DEFAULTS,
} from '../schemas/stormwater'
import type {
  RationalMethodInput,
  PipeSizingInput,
  AttenuationInput,
} from '../schemas/stormwater'
import { getNextStandardPipeDiameter } from '../data/pipeSizes'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Determine pass/fail/warning from a utilisation ratio */
function statusFromRatio(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail'
  if (ratio >= 0.9) return 'warning'
  return 'pass'
}

// ---------------------------------------------------------------------------
// 1. Rational Method Calculator (Q = C·I·A / 3.6)
// ---------------------------------------------------------------------------

export function computeRationalMethod(input: RationalMethodInput): CalculatorOutput {
  const { runoffCoefficient, rainfallIntensity, catchmentArea } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Peak runoff: Q = C × I × A / 3.6
  const Q = (runoffCoefficient * rainfallIntensity * catchmentArea) / 3.6
  intermediates['Q'] = Q
  intermediates['C'] = runoffCoefficient
  intermediates['I'] = rainfallIntensity
  intermediates['A'] = catchmentArea

  derivation.push({
    label: 'Peak runoff (Rational Method)',
    formula: 'Q = C × I × A / 3.6',
    substitution: `Q = ${runoffCoefficient} × ${rainfallIntensity} × ${catchmentArea} / 3.6`,
    result: `${Q.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-R §4.2',
  })

  // For reference, show equivalent L/s
  const Q_Ls = Q * 1000
  intermediates['Q_Ls'] = Q_Ls
  derivation.push({
    label: 'Peak runoff (litres per second)',
    formula: 'Q_L/s = Q × 1000',
    substitution: `Q_L/s = ${Q.toFixed(4)} × 1000`,
    result: `${Q_Ls.toFixed(2)} L/s`,
    sansRef: 'SANS 10400-R §4.2',
  })

  // Utilisation ratio: capacity-based (rational method produces a design flow,
  // not a pass/fail check against a limit — report as pass with ratio based on runoff coefficient)
  const utilisationRatio = runoffCoefficient
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      peakRunoff: { value: Number(Q.toFixed(4)), unit: 'm³/s' },
      peakRunoffLitres: { value: Number(Q_Ls.toFixed(2)), unit: 'L/s' },
      runoffCoefficient: { value: runoffCoefficient, unit: '-' },
      rainfallIntensity: { value: rainfallIntensity, unit: 'mm/h' },
      catchmentArea: { value: catchmentArea, unit: 'ha' },
    },
    derivation,
    sansReferences: ['SANS 10400-R §4.2'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 2. Pipe Sizing Calculator (Manning's Equation)
// ---------------------------------------------------------------------------

/**
 * Solve Manning's equation for full-flow pipe diameter:
 *   Q = (1/n) · A · R^(2/3) · S^(1/2)
 *
 * For a circular pipe flowing full:
 *   A = π·D²/4
 *   R = D/4  (hydraulic radius for full pipe)
 *
 * Substituting:
 *   Q = (1/n) · (π·D²/4) · (D/4)^(2/3) · S^(1/2)
 *
 * Solving algebraically for D:
 *   D = [ (Q · n · 4^(5/3)) / (π · S^(1/2)) ]^(3/8)
 *
 * The derivation:
 *   Q = (1/n)·(π/4)·D²·(D/4)^(2/3)·√S
 *   Q = (1/n)·(π/4)·D²·D^(2/3)·4^(-2/3)·√S
 *   Q = (1/n)·(π/4)·4^(-2/3)·D^(8/3)·√S
 *   Q = (1/n)·π·4^(-5/3)·D^(8/3)·√S
 *   D^(8/3) = Q·n·4^(5/3) / (π·√S)
 *   D = [ Q·n·4^(5/3) / (π·√S) ]^(3/8)
 */
function solveManningDiameter(Q: number, n: number, S: number): number {
  const numerator = Q * n * Math.pow(4, 5 / 3)
  const denominator = Math.PI * Math.sqrt(S)
  return Math.pow(numerator / denominator, 3 / 8)
}

export function computePipeSizing(input: PipeSizingInput): CalculatorOutput {
  const { designFlow, slope, roughnessCoefficient, pipeMaterial } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const n = roughnessCoefficient

  // Solve for theoretical diameter
  const D_theoretical = solveManningDiameter(designFlow, n, slope)
  const D_theoretical_mm = D_theoretical * 1000
  intermediates['D_theoretical'] = D_theoretical
  intermediates['D_theoretical_mm'] = D_theoretical_mm

  derivation.push({
    label: 'Manning\'s equation for full pipe flow',
    formula: 'Q = (1/n) · (π·D²/4) · (D/4)^(2/3) · S^(1/2)',
    substitution: `Q = ${designFlow} m³/s, n = ${n}, S = ${slope}`,
    result: `Design flow = ${designFlow.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-R §4.3',
  })

  derivation.push({
    label: 'Solve for required pipe diameter',
    formula: 'D = [Q·n·4^(5/3) / (π·√S)]^(3/8)',
    substitution: `D = [${designFlow}×${n}×4^(5/3) / (π×√${slope})]^(3/8)`,
    result: `${D_theoretical_mm.toFixed(1)} mm`,
    sansRef: 'SANS 10400-R §4.3',
  })

  // Map pipe material to data lookup material
  // 'concrete' pipes use 'steel' sizes as proxy (similar nominal diameters)
  const materialLookup: Record<string, 'pvc' | 'steel' | 'copper' | 'hdpe'> = {
    pvc: 'pvc',
    concrete: 'steel',
    steel: 'steel',
  }
  const lookupMaterial = materialLookup[pipeMaterial]

  // Get next standard pipe diameter
  const standardPipe = getNextStandardPipeDiameter(D_theoretical_mm, lookupMaterial)
  const D_standard_mm = standardPipe ? standardPipe.nominalDiameter : Math.ceil(D_theoretical_mm / 50) * 50
  const D_standard = D_standard_mm / 1000
  intermediates['D_standard_mm'] = D_standard_mm
  intermediates['D_standard'] = D_standard

  derivation.push({
    label: 'Next standard pipe diameter',
    formula: 'D_std ≥ D_theoretical (from standard pipe table)',
    substitution: `D_theoretical = ${D_theoretical_mm.toFixed(1)} mm → next standard ${pipeMaterial.toUpperCase()}`,
    result: `${D_standard_mm} mm`,
    sansRef: 'SANS 10400-R §4.3',
  })

  // Verify capacity of selected pipe
  const A_pipe = (Math.PI * D_standard * D_standard) / 4
  const R_pipe = D_standard / 4
  const Q_capacity = (1 / n) * A_pipe * Math.pow(R_pipe, 2 / 3) * Math.sqrt(slope)
  intermediates['A_pipe'] = A_pipe
  intermediates['R_pipe'] = R_pipe
  intermediates['Q_capacity'] = Q_capacity

  derivation.push({
    label: 'Capacity of selected pipe (full flow)',
    formula: 'Q_cap = (1/n)·(π·D²/4)·(D/4)^(2/3)·√S',
    substitution: `Q_cap = (1/${n})×(π×${D_standard}²/4)×(${D_standard}/4)^(2/3)×√${slope}`,
    result: `${Q_capacity.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-R §4.3',
  })

  // Flow velocity in selected pipe
  const velocity = Q_capacity / A_pipe
  intermediates['velocity'] = velocity

  derivation.push({
    label: 'Flow velocity at full capacity',
    formula: 'v = Q / A',
    substitution: `v = ${Q_capacity.toFixed(4)} / ${A_pipe.toFixed(4)}`,
    result: `${velocity.toFixed(2)} m/s`,
    sansRef: 'SANS 10400-R §4.3',
  })

  // Utilisation ratio: design flow vs pipe capacity
  const utilisationRatio = designFlow / Q_capacity
  const status = statusFromRatio(utilisationRatio)

  derivation.push({
    label: 'Pipe utilisation ratio',
    formula: 'η = Q_design / Q_capacity',
    substitution: `η = ${designFlow.toFixed(4)} / ${Q_capacity.toFixed(4)}`,
    result: `${(utilisationRatio * 100).toFixed(1)}%`,
    sansRef: 'SANS 10400-R §4.3',
    isFailing: status === 'fail',
  })

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      theoreticalDiameter: { value: Number(D_theoretical_mm.toFixed(1)), unit: 'mm' },
      standardDiameter: { value: D_standard_mm, unit: 'mm' },
      pipeCapacity: { value: Number(Q_capacity.toFixed(4)), unit: 'm³/s' },
      flowVelocity: { value: Number(velocity.toFixed(2)), unit: 'm/s' },
      utilisationPercent: { value: Number((utilisationRatio * 100).toFixed(1)), unit: '%' },
    },
    derivation,
    sansReferences: ['SANS 10400-R §4.3'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 3. Attenuation Tank Sizing (Triangular Hydrograph Method)
// ---------------------------------------------------------------------------

/**
 * Simplified triangular hydrograph method:
 *   V_storage = 0.5 × (Q_post - Q_allow) × T × 3600
 *
 * Where:
 *   Q_post = post-development peak flow (m³/s)
 *   Q_allow = allowable outflow rate (m³/s)
 *   T = storm duration (hours)
 *   3600 = seconds per hour conversion
 *
 * The result is storage volume in m³ (cubic metres).
 */
export function computeAttenuation(input: AttenuationInput): CalculatorOutput {
  const { preDevelopmentPeak, postDevelopmentPeak, allowableOutflow, stormDuration } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  intermediates['Qpre'] = preDevelopmentPeak
  intermediates['Qpost'] = postDevelopmentPeak
  intermediates['Qallow'] = allowableOutflow
  intermediates['T'] = stormDuration

  // Show the increase in peak flow
  const flowIncrease = postDevelopmentPeak - preDevelopmentPeak
  intermediates['flowIncrease'] = flowIncrease

  derivation.push({
    label: 'Peak flow increase due to development',
    formula: 'ΔQ = Q_post - Q_pre',
    substitution: `ΔQ = ${postDevelopmentPeak} - ${preDevelopmentPeak}`,
    result: `${flowIncrease.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-R §4.5',
  })

  // Excess flow that must be attenuated
  const excessFlow = postDevelopmentPeak - allowableOutflow
  intermediates['excessFlow'] = excessFlow

  derivation.push({
    label: 'Excess flow requiring attenuation',
    formula: 'Q_excess = Q_post - Q_allow',
    substitution: `Q_excess = ${postDevelopmentPeak} - ${allowableOutflow}`,
    result: `${excessFlow.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-R §4.5',
    isFailing: excessFlow <= 0,
  })

  // Required storage volume using triangular hydrograph
  const V_storage = excessFlow > 0
    ? 0.5 * excessFlow * stormDuration * 3600
    : 0
  intermediates['V_storage'] = V_storage

  derivation.push({
    label: 'Required storage volume (triangular hydrograph)',
    formula: 'V = 0.5 × (Q_post - Q_allow) × T × 3600',
    substitution: `V = 0.5 × ${excessFlow.toFixed(4)} × ${stormDuration} × 3600`,
    result: `${V_storage.toFixed(2)} m³`,
    sansRef: 'SANS 10400-R §4.5',
  })

  // Convert to litres for practical reference
  const V_litres = V_storage * 1000
  intermediates['V_litres'] = V_litres

  derivation.push({
    label: 'Storage volume (litres)',
    formula: 'V_L = V × 1000',
    substitution: `V_L = ${V_storage.toFixed(2)} × 1000`,
    result: `${V_litres.toFixed(0)} L`,
    sansRef: 'SANS 10400-R §4.5',
  })

  // Storm duration in seconds for verification
  const T_seconds = stormDuration * 3600
  intermediates['T_seconds'] = T_seconds

  derivation.push({
    label: 'Storm duration',
    formula: 'T_s = T_h × 3600',
    substitution: `T_s = ${stormDuration} × 3600`,
    result: `${T_seconds.toFixed(0)} s`,
    sansRef: 'SANS 10400-R §4.5',
  })

  // Utilisation ratio: post-development vs allowable (how much over the limit)
  const utilisationRatio = allowableOutflow > 0
    ? postDevelopmentPeak / allowableOutflow
    : 1.0
  const status = statusFromRatio(utilisationRatio)

  derivation.push({
    label: 'Flow utilisation (post-development vs allowable)',
    formula: 'η = Q_post / Q_allow',
    substitution: `η = ${postDevelopmentPeak} / ${allowableOutflow}`,
    result: `${(utilisationRatio * 100).toFixed(1)}%`,
    sansRef: 'SANS 10400-R §4.5',
    isFailing: status === 'fail',
  })

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      storageVolume: { value: Number(V_storage.toFixed(2)), unit: 'm³' },
      storageVolumeLitres: { value: Number(V_litres.toFixed(0)), unit: 'L' },
      excessFlow: { value: Number(excessFlow.toFixed(4)), unit: 'm³/s' },
      postDevelopmentPeak: { value: postDevelopmentPeak, unit: 'm³/s' },
      allowableOutflow: { value: allowableOutflow, unit: 'm³/s' },
      stormDuration: { value: stormDuration, unit: 'hours' },
    },
    derivation,
    sansReferences: ['SANS 10400-R §4.5'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// Calculator Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'storm-rational-method',
    title: 'Rational Method (Peak Runoff)',
    discipline: 'civil-stormwater',
    sansRef: 'SANS 10400-R',
    description: 'Peak runoff calculation using Q = C·I·A/3.6 for stormwater drainage design',
  },
  inputSchema: rationalMethodInputSchema,
  defaults: RATIONAL_METHOD_DEFAULTS,
  compute: computeRationalMethod,
})

registerCalculator({
  meta: {
    id: 'storm-pipe-sizing',
    title: 'Pipe Sizing (Manning\'s Equation)',
    discipline: 'civil-stormwater',
    sansRef: 'SANS 10400-R',
    description: 'Stormwater pipe sizing using Manning\'s equation for full-flow conditions',
  },
  inputSchema: pipeSizingInputSchema,
  defaults: PIPE_SIZING_DEFAULTS,
  compute: computePipeSizing,
})

registerCalculator({
  meta: {
    id: 'storm-attenuation',
    title: 'Attenuation Tank Sizing',
    discipline: 'civil-stormwater',
    sansRef: 'SANS 10400-R',
    description: 'Required storage volume using the simplified triangular hydrograph method',
  },
  inputSchema: attenuationInputSchema,
  defaults: ATTENUATION_DEFAULTS,
  compute: computeAttenuation,
})
