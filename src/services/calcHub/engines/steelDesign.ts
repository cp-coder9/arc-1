// Engineer's Calculation Hub — Structural Steel Design Engine
//
// Pure compute functions for steel design per SANS 10162-1.
// Requirements: 3.1–3.8, 8.1–8.6

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import {
  steelBeamInputSchema,
  steelColumnInputSchema,
  steelBoltInputSchema,
  steelWeldInputSchema,
  steelBasePlateInputSchema,
  profileComparatorInputSchema,
  STEEL_BEAM_DEFAULTS,
  STEEL_COLUMN_DEFAULTS,
  STEEL_BOLT_DEFAULTS,
  STEEL_WELD_DEFAULTS,
  STEEL_BASE_PLATE_DEFAULTS,
  PROFILE_COMPARATOR_DEFAULTS,
} from '../schemas/steelDesign'
import type {
  SteelBeamInput,
  SteelColumnInput,
  SteelBoltInput,
  SteelWeldInput,
  SteelBasePlateInput,
  ProfileComparatorInput,
} from '../schemas/steelDesign'
import { getSteelSection } from '../data/steelSections'
import { registerCalculator } from '../calcHubRegistry'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const E_STEEL = 200_000 // Young's modulus (MPa)
const PHI_STEEL = 0.9 // Resistance factor — SANS 10162-1 §13.5
const PHI_BOLT = 0.8 // Bolt resistance factor — SANS 10162-1 §13.11
const PHI_WELD = 0.67 // Weld resistance factor — SANS 10162-1 §13.13
const XU_E70XX = 480 // Ultimate electrode strength (MPa) for E70XX
const COLUMN_N = 1.34 // Column curve exponent for hot-rolled W-shapes

/** Bolt tensile areas in mm² by nominal diameter */
const BOLT_AREAS: Record<string, number> = {
  '12': 84.3,
  '16': 157,
  '20': 245,
  '24': 353,
  '30': 561,
}

/** Bolt ultimate tensile strengths (fu) by grade in MPa */
const BOLT_FU: Record<string, number> = {
  '4.6': 400,
  '8.8': 830,
  '10.9': 1040,
}

/** Grade → fy mapping */
function getFy(grade: '300' | '350'): number {
  return grade === '300' ? 300 : 350
}

/** Determine pass/fail/warning from utilisation ratio */
function getStatus(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail'
  if (ratio >= 0.9) return 'warning'
  return 'pass'
}

// ---------------------------------------------------------------------------
// 1. Steel Beam Design — SANS 10162-1 §13.5
// ---------------------------------------------------------------------------

export function computeSteelBeam(input: SteelBeamInput): CalculatorOutput {
  const section = getSteelSection(input.sectionId)
  if (!section) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: { error: { value: `Section "${input.sectionId}" not found`, unit: '' } },
      derivation: [],
      sansReferences: [],
      intermediates: {},
    }
  }

  const fy = getFy(input.grade)
  const w = input.udl // kN/m
  const L = input.span // m
  const { Sx, Ix, d, tw } = section

  // Factored moment: Mu = wL²/8 (kNm)
  const Mu = (w * L * L) / 8

  // Moment resistance: Mr = φ·fy·Sx/1000 (kNm, Sx in cm³ → ×1e3 mm³)
  // Sx cm³ = Sx × 1000 mm³; Mr = φ·fy·(Sx×1000)/1e6 kNm = φ·fy·Sx/1000
  const Mr = (PHI_STEEL * fy * Sx) / 1000

  // Shear resistance: Vr = φ·0.66·fy·d·tw/1000 (kN, d/tw in mm)
  const Vf = (w * L) / 2 // factored shear at support (kN)
  const Vr = (PHI_STEEL * 0.66 * fy * d * tw) / 1000

  // Deflection: δ = 5·w·L⁴/(384·E·Ix) — units: w kN/m→N/mm, L m→mm, Ix cm⁴→mm⁴
  // w (kN/m) = w (N/mm) → w*1 N/mm  ... actually kN/m × 1 = N/mm (1 kN/m = 1 N/mm)
  const wNperMM = w // 1 kN/m = 1 N/mm
  const Lmm = L * 1000
  const IxMM4 = Ix * 1e4 // cm⁴ → mm⁴
  const delta = (5 * wNperMM * Math.pow(Lmm, 4)) / (384 * E_STEEL * IxMM4)
  const deltaLimit = (L * 1000) / input.deflectionLimit

  // Utilisation ratios
  const momentRatio = Mu / Mr
  const shearRatio = Vf / Vr
  const deflectionRatio = delta / deltaLimit
  const maxRatio = Math.max(momentRatio, shearRatio, deflectionRatio)

  const status = getStatus(maxRatio)

  const derivation: DerivationStep[] = [
    {
      label: 'Factored Moment (simply supported UDL)',
      formula: 'Mu = w·L²/8',
      substitution: `Mu = ${w}×${L}²/8`,
      result: `${Mu.toFixed(2)} kNm`,
      sansRef: 'SANS 10162-1 §13.5',
    },
    {
      label: 'Moment Resistance',
      formula: 'Mr = φ·fy·Sx/1000',
      substitution: `Mr = ${PHI_STEEL}×${fy}×${Sx}/1000`,
      result: `${Mr.toFixed(2)} kNm`,
      sansRef: 'SANS 10162-1 §13.5',
    },
    {
      label: 'Moment Utilisation',
      formula: 'Mu/Mr',
      substitution: `${Mu.toFixed(2)}/${Mr.toFixed(2)}`,
      result: `${(momentRatio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10162-1 §13.5',
      isFailing: momentRatio > 1.0,
    },
    {
      label: 'Factored Shear',
      formula: 'Vf = w·L/2',
      substitution: `Vf = ${w}×${L}/2`,
      result: `${Vf.toFixed(2)} kN`,
    },
    {
      label: 'Shear Resistance',
      formula: 'Vr = φ·0.66·fy·d·tw/1000',
      substitution: `Vr = ${PHI_STEEL}×0.66×${fy}×${d}×${tw}/1000`,
      result: `${Vr.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.5',
    },
    {
      label: 'Shear Utilisation',
      formula: 'Vf/Vr',
      substitution: `${Vf.toFixed(2)}/${Vr.toFixed(2)}`,
      result: `${(shearRatio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10162-1 §13.5',
      isFailing: shearRatio > 1.0,
    },
    {
      label: 'Midspan Deflection',
      formula: 'δ = 5·w·L⁴/(384·E·Ix)',
      substitution: `δ = 5×${wNperMM}×${Lmm}⁴/(384×${E_STEEL}×${IxMM4.toExponential(3)})`,
      result: `${delta.toFixed(2)} mm`,
      sansRef: 'SANS 10162-1 §13.5',
    },
    {
      label: 'Deflection Limit',
      formula: 'δ_limit = L/deflectionLimit',
      substitution: `δ_limit = ${Lmm}/${input.deflectionLimit}`,
      result: `${deltaLimit.toFixed(2)} mm`,
    },
    {
      label: 'Deflection Utilisation',
      formula: 'δ/δ_limit',
      substitution: `${delta.toFixed(2)}/${deltaLimit.toFixed(2)}`,
      result: `${(deflectionRatio * 100).toFixed(1)}%`,
      isFailing: deflectionRatio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(maxRatio * 1000) / 1000,
    results: {
      Mu: { value: Math.round(Mu * 100) / 100, unit: 'kNm' },
      Mr: { value: Math.round(Mr * 100) / 100, unit: 'kNm' },
      Vf: { value: Math.round(Vf * 100) / 100, unit: 'kN' },
      Vr: { value: Math.round(Vr * 100) / 100, unit: 'kN' },
      delta: { value: Math.round(delta * 100) / 100, unit: 'mm' },
      deltaLimit: { value: Math.round(deltaLimit * 100) / 100, unit: 'mm' },
    },
    derivation,
    sansReferences: ['SANS 10162-1 §13.5'],
    intermediates: {
      fy,
      Sx,
      Ix,
      d,
      tw,
      momentRatio,
      shearRatio,
      deflectionRatio,
    },
  }
}

// ---------------------------------------------------------------------------
// 2. Steel Column Buckling — SANS 10162-1 §13.3
// ---------------------------------------------------------------------------

export function computeSteelColumn(input: SteelColumnInput): CalculatorOutput {
  const section = getSteelSection(input.sectionId)
  if (!section) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: { error: { value: `Section "${input.sectionId}" not found`, unit: '' } },
      derivation: [],
      sansReferences: [],
      intermediates: {},
    }
  }

  const fy = getFy(input.grade)
  const K = input.effectiveLengthFactor
  const Le = input.effectiveLength * 1000 // m → mm
  const Pu = input.axialLoad // kN (applied)
  const { ry, A: Acm2 } = section
  const A = Acm2 * 100 // cm² → mm²

  // Slenderness ratio
  const lambda = (K * Le) / ry

  // Euler buckling stress
  const Fe = (Math.PI * Math.PI * E_STEEL) / (lambda * lambda)

  // Non-dimensional slenderness
  const lambdaN = Math.sqrt(fy / Fe)

  // Factored compressive resistance: Cr = φ·A·fy·(1+λn^(2n))^(-1/n) / 1000
  const n = COLUMN_N
  const Cr = (PHI_STEEL * A * fy * Math.pow(1 + Math.pow(lambdaN, 2 * n), -1 / n)) / 1000

  const ratio = Pu / Cr
  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Effective Length',
      formula: 'KL = K·L',
      substitution: `KL = ${K}×${Le} mm`,
      result: `${(K * Le).toFixed(0)} mm`,
      sansRef: 'SANS 10162-1 §13.3',
    },
    {
      label: 'Slenderness Ratio',
      formula: 'λ = KL/r',
      substitution: `λ = ${(K * Le).toFixed(0)}/${ry}`,
      result: `${lambda.toFixed(2)}`,
      sansRef: 'SANS 10162-1 §13.3',
    },
    {
      label: 'Euler Buckling Stress',
      formula: 'Fe = π²·E/λ²',
      substitution: `Fe = π²×${E_STEEL}/${lambda.toFixed(2)}²`,
      result: `${Fe.toFixed(2)} MPa`,
      sansRef: 'SANS 10162-1 §13.3',
    },
    {
      label: 'Non-dimensional Slenderness',
      formula: 'λn = √(fy/Fe)',
      substitution: `λn = √(${fy}/${Fe.toFixed(2)})`,
      result: `${lambdaN.toFixed(4)}`,
      sansRef: 'SANS 10162-1 §13.3',
    },
    {
      label: 'Factored Compressive Resistance',
      formula: 'Cr = φ·A·fy·(1+λn^(2n))^(-1/n)/1000',
      substitution: `Cr = ${PHI_STEEL}×${A}×${fy}×(1+${lambdaN.toFixed(4)}^(2×${n}))^(-1/${n})/1000`,
      result: `${Cr.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.3',
    },
    {
      label: 'Utilisation',
      formula: 'Pu/Cr',
      substitution: `${Pu}/${Cr.toFixed(2)}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10162-1 §13.3',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      Cr: { value: Math.round(Cr * 100) / 100, unit: 'kN' },
      lambda: { value: Math.round(lambda * 100) / 100, unit: '' },
      Fe: { value: Math.round(Fe * 100) / 100, unit: 'MPa' },
      lambdaN: { value: Math.round(lambdaN * 10000) / 10000, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10162-1 §13.3'],
    intermediates: { fy, A, ry, lambda, Fe, lambdaN, Cr, ratio },
  }
}

// ---------------------------------------------------------------------------
// 3. Bolted Connections — SANS 10162-1 §13.11
// ---------------------------------------------------------------------------

export function computeSteelBolt(input: SteelBoltInput): CalculatorOutput {
  const Ab = BOLT_AREAS[input.boltDiameter]
  const fu_bolt = BOLT_FU[input.boltGrade]
  const fy_plate = getFy(input.plateGrade)
  const n = input.shearPlanes
  const nBolts = input.numBolts
  const t = input.plateThickness // mm
  const dBolt = Number(input.boltDiameter) // mm
  const appliedForce = input.appliedForce // kN

  // Bolt shear capacity: Vr_bolt = 0.6·φ·n·Ab·fu / 1000 (per bolt, kN)
  const VrBoltSingle = (0.6 * PHI_BOLT * n * Ab * fu_bolt) / 1000
  const VrBoltTotal = VrBoltSingle * nBolts

  // Bearing capacity per bolt: Br = 3·φ·t·d·fu_plate / 1000 (kN)
  // fu_plate approximation: for Grade 300 → fu≈430, Grade 350 → fu≈480
  const fu_plate = input.plateGrade === '300' ? 430 : 480
  const BrSingle = (3 * PHI_BOLT * t * dBolt * fu_plate) / 1000
  const BrTotal = BrSingle * nBolts

  // Governing capacity is the lesser
  const Vr = Math.min(VrBoltTotal, BrTotal)
  const ratio = appliedForce / Vr
  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Bolt Shear Capacity (per bolt)',
      formula: 'Vr_bolt = 0.6·φ·n·Ab·fu/1000',
      substitution: `Vr_bolt = 0.6×${PHI_BOLT}×${n}×${Ab}×${fu_bolt}/1000`,
      result: `${VrBoltSingle.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.11',
    },
    {
      label: 'Total Bolt Shear Capacity',
      formula: 'Vr_bolts = Vr_bolt × nBolts',
      substitution: `Vr_bolts = ${VrBoltSingle.toFixed(2)}×${nBolts}`,
      result: `${VrBoltTotal.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.11',
    },
    {
      label: 'Bearing Capacity (per bolt)',
      formula: 'Br = 3·φ·t·d·fu_plate/1000',
      substitution: `Br = 3×${PHI_BOLT}×${t}×${dBolt}×${fu_plate}/1000`,
      result: `${BrSingle.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.11',
    },
    {
      label: 'Total Bearing Capacity',
      formula: 'Br_total = Br × nBolts',
      substitution: `Br_total = ${BrSingle.toFixed(2)}×${nBolts}`,
      result: `${BrTotal.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.11',
    },
    {
      label: 'Governing Resistance',
      formula: 'Vr = min(Vr_bolts, Br_total)',
      substitution: `Vr = min(${VrBoltTotal.toFixed(2)}, ${BrTotal.toFixed(2)})`,
      result: `${Vr.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.11',
    },
    {
      label: 'Utilisation',
      formula: 'P/Vr',
      substitution: `${appliedForce}/${Vr.toFixed(2)}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10162-1 §13.11',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      VrBoltTotal: { value: Math.round(VrBoltTotal * 100) / 100, unit: 'kN' },
      BrTotal: { value: Math.round(BrTotal * 100) / 100, unit: 'kN' },
      Vr: { value: Math.round(Vr * 100) / 100, unit: 'kN' },
    },
    derivation,
    sansReferences: ['SANS 10162-1 §13.11'],
    intermediates: { Ab, fu_bolt, fu_plate, VrBoltSingle, BrSingle, Vr, ratio },
  }
}

// ---------------------------------------------------------------------------
// 4. Weld Capacity — SANS 10162-1 §13.13
// ---------------------------------------------------------------------------

export function computeSteelWeld(input: SteelWeldInput): CalculatorOutput {
  const leg = input.weldSize // mm
  const length = input.weldLength // mm
  const appliedForce = input.appliedForce // kN

  // Effective throat: a = 0.707 × leg
  const throat = 0.707 * leg

  // Weld area: Aw = throat × length (mm²)
  const Aw = throat * length

  // Weld shear resistance: Vr_weld = 0.67·φ·Aw·Xu / 1000 (kN)
  const Vr = (0.67 * PHI_WELD * Aw * XU_E70XX) / 1000

  const ratio = appliedForce / Vr
  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Effective Throat',
      formula: 'a = 0.707·leg',
      substitution: `a = 0.707×${leg}`,
      result: `${throat.toFixed(2)} mm`,
      sansRef: 'SANS 10162-1 §13.13',
    },
    {
      label: 'Weld Area',
      formula: 'Aw = a·length',
      substitution: `Aw = ${throat.toFixed(2)}×${length}`,
      result: `${Aw.toFixed(1)} mm²`,
      sansRef: 'SANS 10162-1 §13.13',
    },
    {
      label: 'Weld Shear Resistance',
      formula: 'Vr = 0.67·φ·Aw·Xu/1000',
      substitution: `Vr = 0.67×${PHI_WELD}×${Aw.toFixed(1)}×${XU_E70XX}/1000`,
      result: `${Vr.toFixed(2)} kN`,
      sansRef: 'SANS 10162-1 §13.13',
    },
    {
      label: 'Utilisation',
      formula: 'P/Vr',
      substitution: `${appliedForce}/${Vr.toFixed(2)}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10162-1 §13.13',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      throat: { value: Math.round(throat * 100) / 100, unit: 'mm' },
      Aw: { value: Math.round(Aw * 10) / 10, unit: 'mm²' },
      Vr: { value: Math.round(Vr * 100) / 100, unit: 'kN' },
    },
    derivation,
    sansReferences: ['SANS 10162-1 §13.13'],
    intermediates: { leg, length, throat, Aw, Vr, ratio },
  }
}

// ---------------------------------------------------------------------------
// 5. Base Plate Design — SANS 10162-1
// ---------------------------------------------------------------------------

export function computeSteelBasePlate(input: SteelBasePlateInput): CalculatorOutput {
  const section = getSteelSection(input.columnSectionId)
  if (!section) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: { error: { value: `Section "${input.columnSectionId}" not found`, unit: '' } },
      derivation: [],
      sansReferences: [],
      intermediates: {},
    }
  }

  const fy_plate = getFy(input.plateGrade)
  const fcu = Number(input.concreteGrade) // MPa
  const Pu = input.axialLoad * 1000 // kN → N
  const B = input.basePlateWidth // mm
  const N = input.basePlateLength // mm
  const { d, bf } = section

  // Bearing resistance of concrete: 0.85·φc·fcu (φc = 0.6 for concrete bearing)
  const phi_c = 0.6
  const bearingCapacity = 0.85 * phi_c * fcu // MPa

  // Required area from bearing
  const A_required = Pu / bearingCapacity // mm²
  const A_provided = B * N // mm²

  // Actual bearing pressure
  const fp = Pu / A_provided // MPa

  // Cantilever projections (yield line theory)
  const m = (N - 0.95 * d) / 2 // projection beyond column depth
  const nProj = (B - 0.8 * bf) / 2 // projection beyond flange width

  // Required plate thickness: tp = max(m, n) × √(2·fp / (φ·fy))
  const cantilever = Math.max(m, nProj)
  const tp_required = cantilever * Math.sqrt((2 * fp) / (PHI_STEEL * fy_plate))

  // Utilisation: area-based
  const ratio = A_required / A_provided
  const status = getStatus(ratio)

  const derivation: DerivationStep[] = [
    {
      label: 'Concrete Bearing Capacity',
      formula: 'fc_bearing = 0.85·φc·fcu',
      substitution: `fc_bearing = 0.85×${phi_c}×${fcu}`,
      result: `${bearingCapacity.toFixed(2)} MPa`,
      sansRef: 'SANS 10162-1',
    },
    {
      label: 'Required Bearing Area',
      formula: 'A_req = Pu / fc_bearing',
      substitution: `A_req = ${Pu.toFixed(0)}/${bearingCapacity.toFixed(2)}`,
      result: `${A_required.toFixed(0)} mm²`,
      sansRef: 'SANS 10162-1',
    },
    {
      label: 'Provided Area',
      formula: 'A_prov = B×N',
      substitution: `A_prov = ${B}×${N}`,
      result: `${A_provided.toFixed(0)} mm²`,
    },
    {
      label: 'Bearing Pressure',
      formula: 'fp = Pu / A_prov',
      substitution: `fp = ${Pu.toFixed(0)}/${A_provided}`,
      result: `${fp.toFixed(2)} MPa`,
      sansRef: 'SANS 10162-1',
    },
    {
      label: 'Cantilever Projection (m)',
      formula: 'm = (N - 0.95·d)/2',
      substitution: `m = (${N} - 0.95×${d})/2`,
      result: `${m.toFixed(2)} mm`,
      sansRef: 'SANS 10162-1',
    },
    {
      label: 'Cantilever Projection (n)',
      formula: 'n = (B - 0.8·bf)/2',
      substitution: `n = (${B} - 0.8×${bf})/2`,
      result: `${nProj.toFixed(2)} mm`,
      sansRef: 'SANS 10162-1',
    },
    {
      label: 'Required Plate Thickness',
      formula: 'tp = max(m,n)·√(2·fp/(φ·fy))',
      substitution: `tp = ${cantilever.toFixed(2)}×√(2×${fp.toFixed(2)}/(${PHI_STEEL}×${fy_plate}))`,
      result: `${tp_required.toFixed(2)} mm`,
      sansRef: 'SANS 10162-1',
    },
    {
      label: 'Bearing Utilisation',
      formula: 'A_req / A_prov',
      substitution: `${A_required.toFixed(0)}/${A_provided}`,
      result: `${(ratio * 100).toFixed(1)}%`,
      sansRef: 'SANS 10162-1',
      isFailing: ratio > 1.0,
    },
  ]

  return {
    status,
    utilisationRatio: Math.round(ratio * 1000) / 1000,
    results: {
      tp_required: { value: Math.round(tp_required * 100) / 100, unit: 'mm' },
      bearingPressure: { value: Math.round(fp * 100) / 100, unit: 'MPa' },
      bearingCapacity: { value: Math.round(bearingCapacity * 100) / 100, unit: 'MPa' },
      A_required: { value: Math.round(A_required), unit: 'mm²' },
      A_provided: { value: A_provided, unit: 'mm²' },
    },
    derivation,
    sansReferences: ['SANS 10162-1'],
    intermediates: { fy_plate, fcu, fp, m, nProj, cantilever, tp_required, ratio },
  }
}

// ---------------------------------------------------------------------------
// 6. Profile Comparator
// ---------------------------------------------------------------------------

export function computeProfileComparator(input: ProfileComparatorInput): CalculatorOutput {
  const sections = input.sectionIds.map((id) => ({
    id,
    section: getSteelSection(id),
  }))

  const missing = sections.filter((s) => !s.section)
  if (missing.length > 0) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: {
        error: { value: `Sections not found: ${missing.map((m) => m.id).join(', ')}`, unit: '' },
      },
      derivation: [],
      sansReferences: [],
      intermediates: {},
    }
  }

  // Build comparison results — each property gets a combined string value
  const props = ['d', 'bf', 'tf', 'tw', 'A', 'Ix', 'Zx', 'Sx', 'rx', 'ry', 'mass'] as const
  const results: Record<string, { value: string | number; unit: string }> = {}

  for (const prop of props) {
    const values = sections.map((s) => {
      const sec = s.section!
      return `${s.id}: ${sec[prop]}`
    })
    const units: Record<string, string> = {
      d: 'mm', bf: 'mm', tf: 'mm', tw: 'mm',
      A: 'cm²', Ix: 'cm⁴', Zx: 'cm³', Sx: 'cm³',
      rx: 'mm', ry: 'mm', mass: 'kg/m',
    }
    results[prop] = { value: values.join(' | '), unit: units[prop] }
  }

  // Build derivation showing each section's full property set
  const derivation: DerivationStep[] = sections.map((s) => {
    const sec = s.section!
    return {
      label: sec.name,
      formula: 'Section properties lookup',
      substitution: `d=${sec.d}, bf=${sec.bf}, tf=${sec.tf}, tw=${sec.tw}, A=${sec.A}, Ix=${sec.Ix}, Sx=${sec.Sx}`,
      result: `mass=${sec.mass} kg/m`,
    }
  })

  // Store numeric intermediates for each section
  const intermediates: Record<string, number> = {}
  sections.forEach((s, i) => {
    const sec = s.section!
    intermediates[`section_${i}_d`] = sec.d
    intermediates[`section_${i}_Ix`] = sec.Ix
    intermediates[`section_${i}_Sx`] = sec.Sx
    intermediates[`section_${i}_A`] = sec.A
    intermediates[`section_${i}_mass`] = sec.mass
  })

  return {
    status: 'pass',
    utilisationRatio: 0,
    results,
    derivation,
    sansReferences: [],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// Calculator Registrations
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'steel-beam-design',
    title: 'Steel Beam Design',
    discipline: 'structural-steel',
    sansRef: 'SANS 10162-1 §13.5',
    description: 'Simply supported beam: moment, shear, and deflection checks per SANS 10162-1.',
  },
  inputSchema: steelBeamInputSchema,
  defaults: STEEL_BEAM_DEFAULTS,
  compute: computeSteelBeam,
})

registerCalculator({
  meta: {
    id: 'steel-column-buckling',
    title: 'Steel Column Buckling',
    discipline: 'structural-steel',
    sansRef: 'SANS 10162-1 §13.3',
    description: 'Axial compression resistance with column curve for hot-rolled W-shapes.',
  },
  inputSchema: steelColumnInputSchema,
  defaults: STEEL_COLUMN_DEFAULTS,
  compute: computeSteelColumn,
})

registerCalculator({
  meta: {
    id: 'steel-bolt-connection',
    title: 'Bolted Connection',
    discipline: 'structural-steel',
    sansRef: 'SANS 10162-1 §13.11',
    description: 'Bolt shear and bearing capacity check per SANS 10162-1.',
  },
  inputSchema: steelBoltInputSchema,
  defaults: STEEL_BOLT_DEFAULTS,
  compute: computeSteelBolt,
})

registerCalculator({
  meta: {
    id: 'steel-weld-capacity',
    title: 'Fillet Weld Capacity',
    discipline: 'structural-steel',
    sansRef: 'SANS 10162-1 §13.13',
    description: 'Fillet weld shear resistance for E70XX electrodes per SANS 10162-1.',
  },
  inputSchema: steelWeldInputSchema,
  defaults: STEEL_WELD_DEFAULTS,
  compute: computeSteelWeld,
})

registerCalculator({
  meta: {
    id: 'steel-base-plate',
    title: 'Steel Base Plate Design',
    discipline: 'structural-steel',
    sansRef: 'SANS 10162-1',
    description: 'Base plate thickness from bearing pressure and yield line theory.',
  },
  inputSchema: steelBasePlateInputSchema,
  defaults: STEEL_BASE_PLATE_DEFAULTS,
  compute: computeSteelBasePlate,
})

registerCalculator({
  meta: {
    id: 'steel-profile-comparator',
    title: 'Profile Comparator',
    discipline: 'structural-steel',
    sansRef: 'SA Red Book',
    description: 'Compare section properties for multiple steel profiles side by side.',
  },
  inputSchema: profileComparatorInputSchema,
  defaults: PROFILE_COMPARATOR_DEFAULTS,
  compute: computeProfileComparator,
})
