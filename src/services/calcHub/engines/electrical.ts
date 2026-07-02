// Engineer's Calculation Hub — Electrical Engine
//
// Pure compute functions for electrical design per SANS 10142-1.
// Requirements: 3.1–3.4, 16.1–16.4

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import {
  cableSizingInputSchema,
  voltageDropInputSchema,
  shortCircuitInputSchema,
  maxDemandInputSchema,
  CABLE_SIZING_DEFAULTS,
  VOLTAGE_DROP_DEFAULTS,
  SHORT_CIRCUIT_DEFAULTS,
  MAX_DEMAND_DEFAULTS,
} from '../schemas/electrical'
import type {
  CableSizingInput,
  VoltageDropInput,
  ShortCircuitInput,
  MaxDemandInput,
} from '../schemas/electrical'
import { registerCalculator } from '../calcHubRegistry'

// ---------------------------------------------------------------------------
// Constants — Cable Data per SANS 10142-1
// ---------------------------------------------------------------------------

/** Available cable sizes (mm²) */
const CABLE_SIZES = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120] as const
type CableSize = (typeof CABLE_SIZES)[number]

/** Current ratings (A) by cable size for clipped installation at 30°C ambient */
const CABLE_CURRENT_RATINGS: Record<CableSize, number> = {
  1.5: 19.5,
  2.5: 27,
  4: 36,
  6: 46,
  10: 63,
  16: 85,
  25: 110,
  35: 137,
  50: 167,
  70: 213,
  95: 258,
  120: 298,
}

/** Cable resistance (mΩ/m) by size */
const CABLE_RESISTANCE: Record<CableSize, number> = {
  1.5: 14.5,
  2.5: 8.71,
  4: 5.45,
  6: 3.63,
  10: 2.18,
  16: 1.36,
  25: 0.87,
  35: 0.63,
  50: 0.47,
  70: 0.33,
  95: 0.24,
  120: 0.19,
}

/** Cable reactance (mΩ/m) by size */
const CABLE_REACTANCE: Record<CableSize, number> = {
  1.5: 0.29,
  2.5: 0.27,
  4: 0.25,
  6: 0.24,
  10: 0.22,
  16: 0.21,
  25: 0.20,
  35: 0.19,
  50: 0.18,
  70: 0.17,
  95: 0.17,
  120: 0.16,
}

/** Installation method derating factors per SANS 10142-1 */
const INSTALL_METHOD_DERATING: Record<string, number> = {
  clipped: 1.0,
  tray: 0.95,
  conduit: 0.87,
  buried: 0.82,
}

/** Ambient temperature derating factors per SANS 10142-1 */
const AMBIENT_TEMP_DERATING: Record<number, number> = {
  25: 1.03,
  30: 1.0,
  35: 0.94,
  40: 0.87,
  45: 0.79,
  50: 0.71,
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/** Determine pass/fail/warning from utilisation ratio */
function getStatus(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail'
  if (ratio >= 0.9) return 'warning'
  return 'pass'
}

/**
 * Get ambient temperature derating factor.
 * Interpolates linearly between known values for non-standard temps.
 */
function getAmbientDerating(temp: number): number {
  const known = AMBIENT_TEMP_DERATING[temp]
  if (known !== undefined) return known

  // Linear interpolation between nearest known values
  const temps = Object.keys(AMBIENT_TEMP_DERATING).map(Number).sort((a, b) => a - b)
  if (temp <= temps[0]) return AMBIENT_TEMP_DERATING[temps[0]]
  if (temp >= temps[temps.length - 1]) return AMBIENT_TEMP_DERATING[temps[temps.length - 1]]

  for (let i = 0; i < temps.length - 1; i++) {
    if (temp >= temps[i] && temp <= temps[i + 1]) {
      const t1 = temps[i]
      const t2 = temps[i + 1]
      const f1 = AMBIENT_TEMP_DERATING[t1]
      const f2 = AMBIENT_TEMP_DERATING[t2]
      return f1 + ((temp - t1) / (t2 - t1)) * (f2 - f1)
    }
  }
  return 1.0
}

/**
 * Select the minimum cable size that satisfies the derated current requirement.
 * Returns the cable size in mm² or null if no standard size is adequate.
 */
function selectCableSize(derated_current: number): CableSize | null {
  for (const size of CABLE_SIZES) {
    if (CABLE_CURRENT_RATINGS[size] >= derated_current) {
      return size
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// 1. Cable Sizing — SANS 10142-1
// ---------------------------------------------------------------------------

export function computeCableSizing(input: CableSizingInput): CalculatorOutput {
  const I = input.current // Design current (A)
  const L = input.length // Cable length (m)
  const V = Number(input.voltage) // System voltage (V)
  const pf = input.powerFactor
  const maxVdPercent = input.maxVoltageDrop

  // Derating factors
  const Ci = INSTALL_METHOD_DERATING[input.installMethod]
  const Ca = getAmbientDerating(input.ambientTemp)
  const Cg = input.groupingFactor

  // Combined derating factor
  const totalDerating = Ci * Ca * Cg

  // Required current-carrying capacity (It) considering derating
  // It = I / (Ci × Ca × Cg) — the cable must carry at least this in reference conditions
  const It = I / totalDerating

  // Select minimum cable size
  const selectedSize = selectCableSize(It)

  if (!selectedSize) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: {
        error: { value: 'No standard cable size adequate for the required current', unit: '' },
      },
      derivation: [{
        label: 'Required Tabulated Current',
        formula: 'It = I / (Ci × Ca × Cg)',
        substitution: `It = ${I} / (${Ci} × ${Ca} × ${Cg})`,
        result: `${It.toFixed(2)} A — exceeds maximum cable rating`,
        sansRef: 'SANS 10142-1',
        isFailing: true,
      }],
      sansReferences: ['SANS 10142-1'],
      intermediates: { I, It, Ci, Ca, Cg, totalDerating },
    }
  }

  // Cable rating for selected size
  const Iz = CABLE_CURRENT_RATINGS[selectedSize]

  // Voltage drop verification for selected cable
  const R = CABLE_RESISTANCE[selectedSize] // mΩ/m
  const X = CABLE_REACTANCE[selectedSize] // mΩ/m
  const cosφ = pf
  const sinφ = Math.sqrt(1 - pf * pf)

  // Vd = I·L·(R·cosφ + X·sinφ) / 1000 (V)
  const Vd = (I * L * (R * cosφ + X * sinφ)) / 1000
  const VdPercent = (Vd / V) * 100

  // Utilisation based on voltage drop allowance
  const vdRatio = VdPercent / maxVdPercent
  // Current utilisation
  const currentRatio = It / Iz
  // Governing ratio
  const maxRatio = Math.max(vdRatio, currentRatio)
  const status = getStatus(maxRatio)

  const derivation: DerivationStep[] = [
    {
      label: 'Installation Method Derating',
      formula: 'Ci (installation method factor)',
      substitution: `Ci = ${Ci} (${input.installMethod})`,
      result: `${Ci}`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Ambient Temperature Derating',
      formula: 'Ca (ambient temperature factor)',
      substitution: `Ca at ${input.ambientTemp}°C`,
      result: `${Ca.toFixed(3)}`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Grouping Derating',
      formula: 'Cg (grouping factor)',
      substitution: `Cg = ${Cg}`,
      result: `${Cg}`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Required Tabulated Current',
      formula: 'It = I / (Ci × Ca × Cg)',
      substitution: `It = ${I} / (${Ci} × ${Ca.toFixed(3)} × ${Cg})`,
      result: `${It.toFixed(2)} A`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Selected Cable Size',
      formula: 'Minimum size where Iz ≥ It',
      substitution: `${selectedSize} mm² (Iz = ${Iz} A ≥ It = ${It.toFixed(2)} A)`,
      result: `${selectedSize} mm²`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Voltage Drop Calculation',
      formula: 'Vd = I·L·(R·cosφ + X·sinφ) / 1000',
      substitution: `Vd = ${I}×${L}×(${R}×${cosφ.toFixed(3)} + ${X}×${sinφ.toFixed(3)}) / 1000`,
      result: `${Vd.toFixed(3)} V (${VdPercent.toFixed(2)}%)`,
      sansRef: 'SANS 10142-1',
      isFailing: VdPercent > maxVdPercent,
    },
    {
      label: 'Voltage Drop Check',
      formula: 'Vd% ≤ allowable%',
      substitution: `${VdPercent.toFixed(2)}% ≤ ${maxVdPercent}%`,
      result: VdPercent <= maxVdPercent ? 'PASS' : 'FAIL',
      sansRef: 'SANS 10142-1',
      isFailing: VdPercent > maxVdPercent,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(maxRatio * 1000) / 1000,
    results: {
      selectedCableSize: { value: selectedSize, unit: 'mm²' },
      cableRating: { value: Iz, unit: 'A' },
      requiredCurrent: { value: Math.round(It * 100) / 100, unit: 'A' },
      voltageDrop: { value: Math.round(Vd * 1000) / 1000, unit: 'V' },
      voltageDropPercent: { value: Math.round(VdPercent * 100) / 100, unit: '%' },
    },
    derivation,
    sansReferences: ['SANS 10142-1'],
    intermediates: {
      I, L, V, Ci, Ca, Cg, totalDerating, It, Iz,
      R, X, cosφ, sinφ, Vd, VdPercent, vdRatio, currentRatio,
    },
  }
}

// ---------------------------------------------------------------------------
// 2. Voltage Drop — SANS 10142-1
// ---------------------------------------------------------------------------

export function computeVoltageDrop(input: VoltageDropInput): CalculatorOutput {
  const I = input.current // A
  const L = input.length // m
  const V = Number(input.voltage) // V
  const pf = input.powerFactor
  const cableSize = Number(input.cableSize) as CableSize

  const R = CABLE_RESISTANCE[cableSize] // mΩ/m
  const X = CABLE_REACTANCE[cableSize] // mΩ/m
  const cosφ = pf
  const sinφ = Math.sqrt(1 - pf * pf)

  // Vd = I·L·(R·cosφ + X·sinφ) / 1000 (V)
  const Vd = (I * L * (R * cosφ + X * sinφ)) / 1000
  const VdPercent = (Vd / V) * 100

  // Allowable voltage drop is 5% per SANS 10142-1
  const allowablePercent = 5
  const ratio = VdPercent / allowablePercent
  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Cable Impedance Data',
      formula: 'R, X from cable tables',
      substitution: `${cableSize} mm²: R = ${R} mΩ/m, X = ${X} mΩ/m`,
      result: `R = ${R}, X = ${X} mΩ/m`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Power Factor Components',
      formula: 'cosφ, sinφ',
      substitution: `cosφ = ${cosφ.toFixed(3)}, sinφ = √(1-${cosφ}²)`,
      result: `cosφ = ${cosφ.toFixed(3)}, sinφ = ${sinφ.toFixed(3)}`,
    },
    {
      label: 'Voltage Drop',
      formula: 'Vd = I·L·(R·cosφ + X·sinφ) / 1000',
      substitution: `Vd = ${I}×${L}×(${R}×${cosφ.toFixed(3)} + ${X}×${sinφ.toFixed(3)}) / 1000`,
      result: `${Vd.toFixed(3)} V`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Voltage Drop Percentage',
      formula: 'Vd% = (Vd / V) × 100',
      substitution: `Vd% = (${Vd.toFixed(3)} / ${V}) × 100`,
      result: `${VdPercent.toFixed(2)}%`,
      sansRef: 'SANS 10142-1',
      isFailing: VdPercent > allowablePercent,
    },
    {
      label: 'Compliance Check',
      formula: 'Vd% ≤ 5%',
      substitution: `${VdPercent.toFixed(2)}% ≤ ${allowablePercent}%`,
      result: VdPercent <= allowablePercent ? 'PASS' : 'FAIL',
      sansRef: 'SANS 10142-1',
      isFailing: VdPercent > allowablePercent,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      voltageDrop: { value: Math.round(Vd * 1000) / 1000, unit: 'V' },
      voltageDropPercent: { value: Math.round(VdPercent * 100) / 100, unit: '%' },
      allowablePercent: { value: allowablePercent, unit: '%' },
      cableResistance: { value: R, unit: 'mΩ/m' },
      cableReactance: { value: X, unit: 'mΩ/m' },
    },
    derivation,
    sansReferences: ['SANS 10142-1'],
    intermediates: { I, L, V, R, X, cosφ, sinφ, Vd, VdPercent, ratio },
  }
}

// ---------------------------------------------------------------------------
// 3. Short Circuit Current — SANS 10142-1
// ---------------------------------------------------------------------------

export function computeShortCircuit(input: ShortCircuitInput): CalculatorOutput {
  const V = Number(input.supplyVoltage) // V
  const kVA = input.transformerRating // kVA
  const Zt_percent = input.transformerImpedance // %
  const cableLength = input.cableLength // m
  const cableSize = input.cableSize // mm²

  // Transformer impedance (Ω): Zt = (V² × Zt%) / (kVA × 1000 × 100)
  // Zt = V² / (kVA×1000) × (Zt%/100)
  const Zt = (V * V * Zt_percent) / (kVA * 1000 * 100)

  // Cable impedance: find the closest standard cable size for R/X lookup
  const closestSize = findClosestCableSize(cableSize)
  const R_per_m = CABLE_RESISTANCE[closestSize] / 1000 // mΩ/m → Ω/m
  const X_per_m = CABLE_REACTANCE[closestSize] / 1000 // mΩ/m → Ω/m

  // Total cable impedance (Ω)
  const Rc = R_per_m * cableLength
  const Xc = X_per_m * cableLength
  const Zc = Math.sqrt(Rc * Rc + Xc * Xc)

  // Total impedance
  const ZTotal = Zt + Zc

  // Prospective short circuit current: Isc = V / (√3 × ZTotal) for 3-phase
  // For single-phase (230V): Isc = V / ZTotal
  // For 3-phase (400V, 11kV): Isc = V / (√3 × ZTotal)
  const isThreePhase = V >= 400
  const Isc = isThreePhase ? V / (Math.sqrt(3) * ZTotal) : V / ZTotal

  // No direct utilisation ratio for fault current — present as information
  // Use ratio of 0 (informational, always "pass")
  const status: PassFailStatus = 'pass'

  const derivation: DerivationStep[] = [
    {
      label: 'Transformer Impedance',
      formula: 'Zt = V²·Zt% / (kVA×1000×100)',
      substitution: `Zt = ${V}²×${Zt_percent} / (${kVA}×1000×100)`,
      result: `${(Zt * 1000).toFixed(3)} mΩ (${Zt.toFixed(6)} Ω)`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Cable Resistance',
      formula: 'Rc = R/m × L',
      substitution: `Rc = ${(R_per_m * 1000).toFixed(2)} mΩ/m × ${cableLength} m`,
      result: `${(Rc * 1000).toFixed(2)} mΩ (${Rc.toFixed(6)} Ω)`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Cable Reactance',
      formula: 'Xc = X/m × L',
      substitution: `Xc = ${(X_per_m * 1000).toFixed(2)} mΩ/m × ${cableLength} m`,
      result: `${(Xc * 1000).toFixed(2)} mΩ (${Xc.toFixed(6)} Ω)`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Cable Impedance',
      formula: 'Zc = √(Rc² + Xc²)',
      substitution: `Zc = √(${Rc.toFixed(6)}² + ${Xc.toFixed(6)}²)`,
      result: `${(Zc * 1000).toFixed(3)} mΩ (${Zc.toFixed(6)} Ω)`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Total Impedance',
      formula: 'Z_total = Zt + Zc',
      substitution: `Z_total = ${Zt.toFixed(6)} + ${Zc.toFixed(6)}`,
      result: `${(ZTotal * 1000).toFixed(3)} mΩ (${ZTotal.toFixed(6)} Ω)`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Prospective Fault Current',
      formula: isThreePhase ? 'Isc = V / (√3 × Z_total)' : 'Isc = V / Z_total',
      substitution: isThreePhase
        ? `Isc = ${V} / (√3 × ${ZTotal.toFixed(6)})`
        : `Isc = ${V} / ${ZTotal.toFixed(6)}`,
      result: `${Isc.toFixed(1)} A (${(Isc / 1000).toFixed(2)} kA)`,
      sansRef: 'SANS 10142-1',
    },
  ]

  return {
    status,
    utilisationRatio: 0,
    results: {
      Isc: { value: Math.round(Isc * 10) / 10, unit: 'A' },
      Isc_kA: { value: Math.round((Isc / 1000) * 100) / 100, unit: 'kA' },
      Zt: { value: Math.round(Zt * 1e6) / 1e6, unit: 'Ω' },
      Zc: { value: Math.round(Zc * 1e6) / 1e6, unit: 'Ω' },
      ZTotal: { value: Math.round(ZTotal * 1e6) / 1e6, unit: 'Ω' },
    },
    derivation,
    sansReferences: ['SANS 10142-1'],
    intermediates: {
      V, kVA, Zt_percent, Zt, Rc, Xc, Zc, ZTotal, Isc,
      cableLength, cableSize: closestSize,
    },
  }
}

/**
 * Find the closest standard cable size from the data tables.
 */
function findClosestCableSize(size: number): CableSize {
  let closest: CableSize = CABLE_SIZES[0]
  let minDiff = Math.abs(size - closest)
  for (const s of CABLE_SIZES) {
    const diff = Math.abs(size - s)
    if (diff < minDiff) {
      minDiff = diff
      closest = s
    }
  }
  return closest
}

// ---------------------------------------------------------------------------
// 4. Maximum Demand — SANS 10142-1 Table 1
// ---------------------------------------------------------------------------

export function computeMaxDemand(input: MaxDemandInput): CalculatorOutput {
  const circuits = input.circuits

  // Sum connected loads with diversity factors
  let totalConnected = 0
  let totalDiversified = 0
  const circuitResults: Array<{
    description: string
    connected: number
    diversity: number
    diversified: number
  }> = []

  for (const circuit of circuits) {
    const connected = circuit.connectedLoad
    const diversified = connected * circuit.diversityFactor
    totalConnected += connected
    totalDiversified += diversified
    circuitResults.push({
      description: circuit.description,
      connected,
      diversity: circuit.diversityFactor,
      diversified,
    })
  }

  // Determine required DB rating (next standard size above max demand)
  // Standard DB ratings: 40A, 60A, 80A, 100A, 125A, 160A, 200A
  // Convert kW to A at 230V single-phase: I = P×1000 / V
  const V = 230 // Single-phase supply voltage
  const maxDemandAmps = (totalDiversified * 1000) / V
  const DB_RATINGS = [40, 60, 80, 100, 125, 160, 200]
  const requiredDB = DB_RATINGS.find((r) => r >= maxDemandAmps) ?? DB_RATINGS[DB_RATINGS.length - 1]

  // Utilisation of DB capacity
  const ratio = maxDemandAmps / requiredDB
  const status = getStatus(ratio)

  // Build derivation steps — one per circuit plus totals
  const derivation: DerivationStep[] = circuitResults.map((c) => ({
    label: c.description,
    formula: 'Diversified load = Connected × Diversity Factor',
    substitution: `${c.connected} kW × ${c.diversity}`,
    result: `${c.diversified.toFixed(2)} kW`,
    sansRef: 'SANS 10142-1 Table 1',
  }))

  derivation.push(
    {
      label: 'Total Connected Load',
      formula: 'Σ connected loads',
      substitution: circuitResults.map((c) => `${c.connected}`).join(' + '),
      result: `${totalConnected.toFixed(2)} kW`,
      sansRef: 'SANS 10142-1 Table 1',
    },
    {
      label: 'Total Maximum Demand',
      formula: 'Σ (connected × diversity)',
      substitution: circuitResults.map((c) => `${c.diversified.toFixed(2)}`).join(' + '),
      result: `${totalDiversified.toFixed(2)} kW`,
      sansRef: 'SANS 10142-1 Table 1',
    },
    {
      label: 'Maximum Demand Current',
      formula: 'I = P×1000 / V',
      substitution: `I = ${totalDiversified.toFixed(2)}×1000 / ${V}`,
      result: `${maxDemandAmps.toFixed(2)} A`,
      sansRef: 'SANS 10142-1',
    },
    {
      label: 'Required DB Rating',
      formula: 'Next standard size ≥ max demand current',
      substitution: `${maxDemandAmps.toFixed(2)} A → next standard`,
      result: `${requiredDB} A`,
      sansRef: 'SANS 10142-1',
    },
  )

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      totalConnectedLoad: { value: Math.round(totalConnected * 100) / 100, unit: 'kW' },
      totalMaxDemand: { value: Math.round(totalDiversified * 100) / 100, unit: 'kW' },
      maxDemandCurrent: { value: Math.round(maxDemandAmps * 100) / 100, unit: 'A' },
      requiredDBRating: { value: requiredDB, unit: 'A' },
      numberOfCircuits: { value: circuits.length, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10142-1 Table 1', 'SANS 10142-1'],
    intermediates: {
      totalConnected,
      totalDiversified,
      maxDemandAmps,
      requiredDB,
      V,
    },
  }
}

// ---------------------------------------------------------------------------
// Calculator Registrations
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'electrical-cable-sizing',
    title: 'Cable Sizing',
    discipline: 'electrical-cable',
    sansRef: 'SANS 10142-1',
    description:
      'Determine minimum cable cross-section from current-carrying capacity with derating, then verify voltage drop compliance.',
  },
  inputSchema: cableSizingInputSchema,
  defaults: CABLE_SIZING_DEFAULTS,
  compute: computeCableSizing,
})

registerCalculator({
  meta: {
    id: 'electrical-voltage-drop',
    title: 'Voltage Drop Check',
    discipline: 'electrical-cable',
    sansRef: 'SANS 10142-1',
    description:
      'Compute voltage drop Vd = I·L·(R·cosφ + X·sinφ)/1000 and verify ≤ allowable percentage.',
  },
  inputSchema: voltageDropInputSchema,
  defaults: VOLTAGE_DROP_DEFAULTS,
  compute: computeVoltageDrop,
})

registerCalculator({
  meta: {
    id: 'electrical-short-circuit',
    title: 'Short Circuit Current',
    discipline: 'electrical-cable',
    sansRef: 'SANS 10142-1',
    description:
      'Compute prospective fault current using supply impedance method for protection device verification.',
  },
  inputSchema: shortCircuitInputSchema,
  defaults: SHORT_CIRCUIT_DEFAULTS,
  compute: computeShortCircuit,
})

registerCalculator({
  meta: {
    id: 'electrical-max-demand',
    title: 'Maximum Demand',
    discipline: 'electrical-maxdemand',
    sansRef: 'SANS 10142-1 Table 1',
    description:
      'Sum connected loads with diversity factors per SANS 10142-1 Table 1 to determine required DB rating.',
  },
  inputSchema: maxDemandInputSchema,
  defaults: MAX_DEMAND_DEFAULTS,
  compute: computeMaxDemand,
})
