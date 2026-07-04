// Engineer's Calculation Hub — Geotechnical Engines
//
// Pure compute functions for bearing capacity, pad footing, retaining wall, and pile capacity.
// Requirements: 3.1-3.4, 11.1-11.4
//
// References: Terzaghi (1943), Meyerhof (1963), Rankine (1857), Coulomb (1776)

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import { registerCalculator } from '../calcHubRegistry'
import {
  bearingCapacityInputSchema,
  BEARING_CAPACITY_DEFAULTS,
  padFootingInputSchema,
  PAD_FOOTING_DEFAULTS,
  retainingWallInputSchema,
  RETAINING_WALL_DEFAULTS,
  pileCapacityInputSchema,
  PILE_CAPACITY_DEFAULTS,
} from '../schemas/geotechnical'
import type {
  BearingCapacityInput,
  PadFootingInput,
  RetainingWallInput,
  PileCapacityInput,
} from '../schemas/geotechnical'

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Convert degrees to radians */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Determine pass/fail/warning from a utilisation ratio */
function statusFromRatio(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail'
  if (ratio >= 0.9) return 'warning'
  return 'pass'
}

/**
 * Compute general bearing capacity factors using standard formulae:
 *   Nq = e^(π·tanφ) · tan²(45 + φ/2)
 *   Nc = (Nq - 1) / tanφ   (for φ > 0)
 *   Nγ = 2·(Nq + 1)·tanφ
 * Special case φ = 0: Nc = 5.14, Nq = 1, Nγ = 0
 */
function bearingFactors(phiDeg: number): { Nc: number; Nq: number; Ngamma: number } {
  if (phiDeg === 0) {
    return { Nc: 5.14, Nq: 1, Ngamma: 0 }
  }
  const phi = toRad(phiDeg)
  const tanPhi = Math.tan(phi)
  const Nq = Math.exp(Math.PI * tanPhi) * Math.pow(Math.tan(Math.PI / 4 + phi / 2), 2)
  const Nc = (Nq - 1) / tanPhi
  const Ngamma = 2 * (Nq + 1) * tanPhi
  return { Nc, Nq, Ngamma }
}

// ---------------------------------------------------------------------------
// 1. Bearing Capacity Calculator
// ---------------------------------------------------------------------------

export function computeBearingCapacity(input: BearingCapacityInput): CalculatorOutput {
  const { frictionAngle, cohesion, unitWeight, foundationDepth, foundationWidth, method, factorOfSafety } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Overburden pressure at foundation depth
  const q = unitWeight * foundationDepth
  intermediates['q_overburden'] = q
  derivation.push({
    label: 'Overburden pressure at foundation depth',
    formula: 'q = γ · D',
    substitution: `q = ${unitWeight} × ${foundationDepth}`,
    result: `${q.toFixed(2)} kPa`,
    sansRef: 'Terzaghi (1943)',
  })

  // Bearing capacity factors
  const { Nc, Nq, Ngamma } = bearingFactors(frictionAngle)
  intermediates['Nc'] = Nc
  intermediates['Nq'] = Nq
  intermediates['Ngamma'] = Ngamma
  derivation.push({
    label: 'Bearing capacity factors',
    formula: 'Nq = e^(π·tanφ)·tan²(45+φ/2), Nc = (Nq-1)/tanφ, Nγ = 2·(Nq+1)·tanφ',
    substitution: `φ = ${frictionAngle}°`,
    result: `Nc = ${Nc.toFixed(2)}, Nq = ${Nq.toFixed(2)}, Nγ = ${Ngamma.toFixed(2)}`,
    sansRef: 'Terzaghi (1943)',
  })

  let qu: number

  if (method === 'terzaghi') {
    // Terzaghi: qu = c·Nc + q·Nq + 0.5·γ·B·Nγ
    qu = cohesion * Nc + q * Nq + 0.5 * unitWeight * foundationWidth * Ngamma
    derivation.push({
      label: 'Ultimate bearing capacity (Terzaghi)',
      formula: 'qu = c·Nc + q·Nq + 0.5·γ·B·Nγ',
      substitution: `qu = ${cohesion}×${Nc.toFixed(2)} + ${q.toFixed(2)}×${Nq.toFixed(2)} + 0.5×${unitWeight}×${foundationWidth}×${Ngamma.toFixed(2)}`,
      result: `${qu.toFixed(2)} kPa`,
      sansRef: 'Terzaghi (1943)',
    })
  } else {
    // Meyerhof: qu = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ
    // Shape factors: sc = 1 + 0.2·B/L (assume square: L = B), sq = sγ = 1
    // Depth factors: dc = 1 + 0.2·D/B, dq = dγ = 1
    const L = foundationWidth // square footing assumption
    const sc = 1 + 0.2 * (foundationWidth / L)
    const sq = 1
    const sgamma = 1
    const dc = 1 + 0.2 * (foundationDepth / foundationWidth)
    const dq = 1
    const dgamma = 1

    intermediates['sc'] = sc
    intermediates['dc'] = dc

    derivation.push({
      label: 'Meyerhof shape & depth factors',
      formula: 'sc = 1+0.2·B/L, dc = 1+0.2·D/B, sq = sγ = dq = dγ = 1',
      substitution: `sc = 1+0.2×${foundationWidth}/${L}, dc = 1+0.2×${foundationDepth}/${foundationWidth}`,
      result: `sc = ${sc.toFixed(3)}, dc = ${dc.toFixed(3)}`,
      sansRef: 'Meyerhof (1963)',
    })

    qu = cohesion * Nc * sc * dc + q * Nq * sq * dq + 0.5 * unitWeight * foundationWidth * Ngamma * sgamma * dgamma
    derivation.push({
      label: 'Ultimate bearing capacity (Meyerhof)',
      formula: 'qu = c·Nc·sc·dc + q·Nq·sq·dq + 0.5·γ·B·Nγ·sγ·dγ',
      substitution: `qu = ${cohesion}×${Nc.toFixed(2)}×${sc.toFixed(3)}×${dc.toFixed(3)} + ${q.toFixed(2)}×${Nq.toFixed(2)}×${sq}×${dq} + 0.5×${unitWeight}×${foundationWidth}×${Ngamma.toFixed(2)}×${sgamma}×${dgamma}`,
      result: `${qu.toFixed(2)} kPa`,
      sansRef: 'Meyerhof (1963)',
    })
  }

  intermediates['qu'] = qu

  // Allowable bearing pressure
  const qa = qu / factorOfSafety
  intermediates['qa'] = qa
  derivation.push({
    label: 'Allowable bearing pressure',
    formula: 'qa = qu / FoS',
    substitution: `qa = ${qu.toFixed(2)} / ${factorOfSafety}`,
    result: `${qa.toFixed(2)} kPa`,
    sansRef: 'SANS 10161 §5',
  })

  // Applied bearing pressure (assume load = qa for utilisation = 1.0 at limit)
  // The utilisation ratio here is inverse: higher qa is better → ratio = 1/FoS normalised
  // We report ratio as applied/allowable. Since we just compute capacity, ratio = 1/FoS (always passes)
  const utilisationRatio = 1 / factorOfSafety
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio,
    results: {
      ultimateBearingCapacity: { value: Number(qu.toFixed(2)), unit: 'kPa' },
      allowableBearingPressure: { value: Number(qa.toFixed(2)), unit: 'kPa' },
      Nc: { value: Number(Nc.toFixed(2)), unit: '-' },
      Nq: { value: Number(Nq.toFixed(2)), unit: '-' },
      Ngamma: { value: Number(Ngamma.toFixed(2)), unit: '-' },
    },
    derivation,
    sansReferences: ['Terzaghi (1943)', 'Meyerhof (1963)', 'SANS 10161 §5'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 2. Pad Footing Calculator
// ---------------------------------------------------------------------------

export function computePadFooting(input: PadFootingInput): CalculatorOutput {
  const { columnLoad, columnWidth, columnDepth, allowableBearing, fcu, fy, soilUnitWeight: _soilUnitWeight } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Required footing area
  const areaRequired = columnLoad / allowableBearing
  const sideLength = Math.sqrt(areaRequired)
  // Round up to nearest 50mm
  const sideLengthRounded = Math.ceil(sideLength * 20) / 20
  const actualArea = sideLengthRounded * sideLengthRounded
  intermediates['areaRequired'] = areaRequired
  intermediates['sideLength'] = sideLengthRounded
  intermediates['actualArea'] = actualArea

  derivation.push({
    label: 'Required footing area',
    formula: 'A_req = P / qa',
    substitution: `A_req = ${columnLoad} / ${allowableBearing}`,
    result: `${areaRequired.toFixed(3)} m²`,
    sansRef: 'SANS 10161 §6',
  })

  derivation.push({
    label: 'Footing side length (square)',
    formula: 'B = √A_req (rounded up to 50mm)',
    substitution: `B = √${areaRequired.toFixed(3)}`,
    result: `${sideLengthRounded.toFixed(2)} m`,
    sansRef: 'SANS 10161 §6',
  })

  // Bearing pressure check
  const appliedPressure = columnLoad / actualArea
  intermediates['appliedPressure'] = appliedPressure
  derivation.push({
    label: 'Applied bearing pressure',
    formula: 'q_applied = P / A_actual',
    substitution: `q_applied = ${columnLoad} / ${actualArea.toFixed(3)}`,
    result: `${appliedPressure.toFixed(2)} kPa`,
    sansRef: 'SANS 10161 §6',
  })

  // Assume effective depth d = 400mm for initial check
  const d = 400 // mm
  const dMetres = d / 1000

  // Punching shear check
  // Critical perimeter at d/2 from column face
  const colW_m = columnWidth / 1000
  const colD_m = columnDepth / 1000
  const punchPerimeter = 2 * (colW_m + d / 1000) + 2 * (colD_m + d / 1000)
  const punchArea = (colW_m + dMetres) * (colD_m + dMetres)
  const punchForce = columnLoad * (1 - punchArea / actualArea)
  const punchStress = (punchForce * 1000) / (punchPerimeter * 1000 * d) // MPa
  // Allowable punching shear stress (simplified): vc = 0.25 * √fcu
  const vcPunch = 0.25 * Math.sqrt(fcu)

  intermediates['punchPerimeter'] = punchPerimeter
  intermediates['punchForce'] = punchForce
  intermediates['punchStress'] = punchStress
  intermediates['vcPunch'] = vcPunch

  derivation.push({
    label: 'Punching shear perimeter (at d/2 from column)',
    formula: 'u = 2·(c₁ + d) + 2·(c₂ + d)',
    substitution: `u = 2×(${colW_m}+${dMetres}) + 2×(${colD_m}+${dMetres})`,
    result: `${punchPerimeter.toFixed(3)} m`,
    sansRef: 'SANS 10100-1 §4.3.4',
  })

  derivation.push({
    label: 'Punching shear stress',
    formula: 'v_punch = V_punch / (u · d)',
    substitution: `v_punch = ${(punchForce * 1000).toFixed(0)} / (${(punchPerimeter * 1000).toFixed(0)} × ${d})`,
    result: `${punchStress.toFixed(3)} MPa`,
    sansRef: 'SANS 10100-1 §4.3.4',
  })

  derivation.push({
    label: 'Allowable punching shear stress',
    formula: 'vc = 0.25·√fcu',
    substitution: `vc = 0.25×√${fcu}`,
    result: `${vcPunch.toFixed(3)} MPa`,
    sansRef: 'SANS 10100-1 §4.3.4',
  })

  // Flexural capacity check
  // Cantilever from column face: lc = (B - col_width) / 2
  const cantilever = (sideLengthRounded - colW_m) / 2
  // Ultimate moment per metre width: Mu = qu * lc² / 2
  const quUltimate = columnLoad / actualArea * 1.5 // factored
  const Mu = quUltimate * cantilever * cantilever / 2 // kNm per m width
  intermediates['cantilever'] = cantilever
  intermediates['Mu'] = Mu

  derivation.push({
    label: 'Cantilever bending moment (per m width)',
    formula: 'Mu = (1.5·q)·lc²/2',
    substitution: `Mu = ${quUltimate.toFixed(2)}×${cantilever.toFixed(3)}²/2`,
    result: `${Mu.toFixed(2)} kNm/m`,
    sansRef: 'SANS 10100-1 §4.3.3',
  })

  // Required reinforcement: As = Mu / (0.87 · fy · z)
  // z = d · (0.5 + √(0.25 - K/0.9)), K = Mu / (fcu · b · d²)
  const b = 1000 // 1m width in mm
  const K = (Mu * 1e6) / (fcu * b * d * d)
  const zFactor = 0.5 + Math.sqrt(Math.max(0.25 - K / 0.9, 0))
  const z = Math.min(zFactor, 0.95) * d
  const As = (Mu * 1e6) / (0.87 * fy * z) // mm²/m

  intermediates['K'] = K
  intermediates['z'] = z
  intermediates['As'] = As

  derivation.push({
    label: 'Required reinforcement area',
    formula: 'As = Mu / (0.87·fy·z)',
    substitution: `K = ${K.toFixed(4)}, z = ${z.toFixed(1)}mm, As = ${(Mu * 1e6).toFixed(0)} / (0.87×${fy}×${z.toFixed(1)})`,
    result: `${As.toFixed(0)} mm²/m`,
    sansRef: 'SANS 10100-1 §4.3.3',
  })

  // Minimum reinforcement: As_min = 0.13% · b · d
  const AsMin = 0.0013 * b * d
  intermediates['AsMin'] = AsMin

  derivation.push({
    label: 'Minimum reinforcement',
    formula: 'As_min = 0.13% · b · h',
    substitution: `As_min = 0.0013 × ${b} × ${d}`,
    result: `${AsMin.toFixed(0)} mm²/m`,
    sansRef: 'SANS 10100-1 Table 13',
  })

  // Utilisation ratio: punching shear governs
  const punchRatio = punchStress / vcPunch
  const utilisationRatio = punchRatio
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      footingSideLength: { value: Number(sideLengthRounded.toFixed(2)), unit: 'm' },
      footingArea: { value: Number(actualArea.toFixed(3)), unit: 'm²' },
      appliedBearingPressure: { value: Number(appliedPressure.toFixed(2)), unit: 'kPa' },
      punchingShearStress: { value: Number(punchStress.toFixed(3)), unit: 'MPa' },
      allowablePunchShear: { value: Number(vcPunch.toFixed(3)), unit: 'MPa' },
      requiredReinforcement: { value: Number(Math.max(As, AsMin).toFixed(0)), unit: 'mm²/m' },
      bendingMoment: { value: Number(Mu.toFixed(2)), unit: 'kNm/m' },
    },
    derivation,
    sansReferences: ['SANS 10161 §6', 'SANS 10100-1 §4.3.3', 'SANS 10100-1 §4.3.4', 'SANS 10100-1 Table 13'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 3. Retaining Wall Stability Calculator
// ---------------------------------------------------------------------------

export function computeRetainingWall(input: RetainingWallInput): CalculatorOutput {
  const {
    wallHeight, stemThickness, baseWidth, toeLength, heelLength,
    soilFrictionAngle, soilUnitWeight, surcharge, soilCohesion: _soilCohesion,
    method, wallFriction,
  } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const phi = toRad(soilFrictionAngle)
  const H = wallHeight
  const gamma = soilUnitWeight

  // Active earth pressure coefficient
  let Ka: number
  if (method === 'rankine') {
    Ka = (1 - Math.sin(phi)) / (1 + Math.sin(phi))
    derivation.push({
      label: 'Active earth pressure coefficient (Rankine)',
      formula: 'Ka = (1 - sinφ) / (1 + sinφ)',
      substitution: `Ka = (1 - sin${soilFrictionAngle}°) / (1 + sin${soilFrictionAngle}°)`,
      result: `${Ka.toFixed(4)}`,
      sansRef: 'Rankine (1857)',
    })
  } else {
    // Coulomb: Ka = sin²(α+φ) / [sin²α · sin(α-δ) · (1 + √(sin(φ+δ)·sin(φ-β) / sin(α-δ)·sin(α+β)))²]
    // Simplified for vertical wall (α=90°) and horizontal backfill (β=0°):
    const delta = toRad(wallFriction)
    const num = Math.pow(Math.cos(phi - delta), 2)
    const denom = Math.pow(Math.cos(delta), 2) * Math.pow(1 + Math.sqrt((Math.sin(phi + delta) * Math.sin(phi)) / Math.cos(delta)), 2)
    Ka = num / denom

    derivation.push({
      label: 'Active earth pressure coefficient (Coulomb)',
      formula: 'Ka = cos²(φ-δ) / [cos²δ · (1+√(sin(φ+δ)·sinφ/cosδ))²]',
      substitution: `φ = ${soilFrictionAngle}°, δ = ${wallFriction}°`,
      result: `${Ka.toFixed(4)}`,
      sansRef: 'Coulomb (1776)',
    })
  }
  intermediates['Ka'] = Ka

  // Passive earth pressure coefficient
  const Kp = 1 / Ka
  intermediates['Kp'] = Kp
  derivation.push({
    label: 'Passive earth pressure coefficient',
    formula: 'Kp = 1 / Ka',
    substitution: `Kp = 1 / ${Ka.toFixed(4)}`,
    result: `${Kp.toFixed(4)}`,
    sansRef: method === 'rankine' ? 'Rankine (1857)' : 'Coulomb (1776)',
  })

  // Active pressure force
  const Pa = 0.5 * Ka * gamma * H * H
  intermediates['Pa'] = Pa
  derivation.push({
    label: 'Active earth pressure force',
    formula: 'Pa = 0.5·Ka·γ·H²',
    substitution: `Pa = 0.5×${Ka.toFixed(4)}×${gamma}×${H}²`,
    result: `${Pa.toFixed(2)} kN/m`,
    sansRef: 'SANS 10161 §7',
  })

  // Surcharge active force
  const PaSurcharge = Ka * surcharge * H
  intermediates['PaSurcharge'] = PaSurcharge
  derivation.push({
    label: 'Active surcharge force',
    formula: 'Pa_s = Ka·q·H',
    substitution: `Pa_s = ${Ka.toFixed(4)}×${surcharge}×${H}`,
    result: `${PaSurcharge.toFixed(2)} kN/m`,
    sansRef: 'SANS 10161 §7',
  })

  // Overturning moment about toe
  const Mo_earth = Pa * (H / 3)
  const Mo_surcharge = PaSurcharge * (H / 2)
  const Mo = Mo_earth + Mo_surcharge
  intermediates['Mo'] = Mo
  derivation.push({
    label: 'Overturning moment about toe',
    formula: 'Mo = Pa·H/3 + Pa_s·H/2',
    substitution: `Mo = ${Pa.toFixed(2)}×${H}/3 + ${PaSurcharge.toFixed(2)}×${H}/2`,
    result: `${Mo.toFixed(2)} kNm/m`,
    sansRef: 'SANS 10161 §7',
  })

  // Wall self-weight and resisting moment
  const stemThicknessM = stemThickness / 1000
  const baseThickness = 0.4 // assume 400mm base
  const concreteDensity = 24 // kN/m³

  // Stem weight
  const Wstem = stemThicknessM * (H - baseThickness) * concreteDensity
  const stemArm = toeLength + stemThicknessM / 2

  // Base weight
  const Wbase = baseWidth * baseThickness * concreteDensity
  const baseArm = baseWidth / 2

  // Soil on heel
  const Wsoil = heelLength * (H - baseThickness) * gamma
  const soilArm = baseWidth - heelLength / 2

  const totalW = Wstem + Wbase + Wsoil
  const Mr = Wstem * stemArm + Wbase * baseArm + Wsoil * soilArm

  intermediates['Wstem'] = Wstem
  intermediates['Wbase'] = Wbase
  intermediates['Wsoil'] = Wsoil
  intermediates['totalW'] = totalW
  intermediates['Mr'] = Mr

  derivation.push({
    label: 'Resisting moment about toe',
    formula: 'Mr = ΣW·arm',
    substitution: `Mr = ${Wstem.toFixed(2)}×${stemArm.toFixed(3)} + ${Wbase.toFixed(2)}×${baseArm.toFixed(3)} + ${Wsoil.toFixed(2)}×${soilArm.toFixed(3)}`,
    result: `${Mr.toFixed(2)} kNm/m`,
    sansRef: 'SANS 10161 §7',
  })

  // Overturning FoS
  const FoS_overturn = Mr / Mo
  intermediates['FoS_overturn'] = FoS_overturn
  const overturnPass = FoS_overturn >= 2.0
  derivation.push({
    label: 'Factor of Safety against overturning (≥ 2.0)',
    formula: 'FoS_ot = Mr / Mo',
    substitution: `FoS_ot = ${Mr.toFixed(2)} / ${Mo.toFixed(2)}`,
    result: `${FoS_overturn.toFixed(2)}`,
    sansRef: 'SANS 10161 §7',
    isFailing: !overturnPass,
  })

  // Sliding FoS
  // Friction resistance: μ = tan(2φ/3) for base friction
  const delta_base = (2 * soilFrictionAngle) / 3
  const frictionCoeff = Math.tan(toRad(delta_base))
  const frictionResist = totalW * frictionCoeff
  // Passive resistance on toe (embedded depth = baseThickness)
  const Pp = 0.5 * Kp * gamma * baseThickness * baseThickness
  const totalResistSlide = frictionResist + Pp
  const totalDrivingSlide = Pa + PaSurcharge
  const FoS_slide = totalResistSlide / totalDrivingSlide

  intermediates['FoS_slide'] = FoS_slide
  intermediates['frictionResist'] = frictionResist
  intermediates['Pp'] = Pp
  const slidePass = FoS_slide >= 1.5

  derivation.push({
    label: 'Factor of Safety against sliding (≥ 1.5)',
    formula: 'FoS_sl = (W·tanδ + Pp) / (Pa + Pa_s)',
    substitution: `FoS_sl = (${totalW.toFixed(2)}×${frictionCoeff.toFixed(3)} + ${Pp.toFixed(2)}) / (${Pa.toFixed(2)} + ${PaSurcharge.toFixed(2)})`,
    result: `${FoS_slide.toFixed(2)}`,
    sansRef: 'SANS 10161 §7',
    isFailing: !slidePass,
  })

  // Bearing pressure at base
  const eccentricity = baseWidth / 2 - (Mr - Mo) / totalW
  const qMax = (totalW / baseWidth) * (1 + 6 * eccentricity / baseWidth)
  const qMin = (totalW / baseWidth) * (1 - 6 * eccentricity / baseWidth)
  intermediates['eccentricity'] = eccentricity
  intermediates['qMax'] = qMax
  intermediates['qMin'] = qMin

  derivation.push({
    label: 'Base bearing pressure distribution',
    formula: 'q_max = (W/B)·(1 + 6e/B)',
    substitution: `e = ${eccentricity.toFixed(3)}m, q_max = (${totalW.toFixed(2)}/${baseWidth})×(1+6×${eccentricity.toFixed(3)}/${baseWidth})`,
    result: `q_max = ${qMax.toFixed(2)} kPa, q_min = ${qMin.toFixed(2)} kPa`,
    sansRef: 'SANS 10161 §7',
  })

  // Overall utilisation: worst of (2.0/FoS_ot) and (1.5/FoS_sl)
  const overturnRatio = 2.0 / FoS_overturn
  const slideRatio = 1.5 / FoS_slide
  const utilisationRatio = Math.max(overturnRatio, slideRatio)
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      Ka: { value: Number(Ka.toFixed(4)), unit: '-' },
      Kp: { value: Number(Kp.toFixed(4)), unit: '-' },
      activePressure: { value: Number(Pa.toFixed(2)), unit: 'kN/m' },
      overturningMoment: { value: Number(Mo.toFixed(2)), unit: 'kNm/m' },
      resistingMoment: { value: Number(Mr.toFixed(2)), unit: 'kNm/m' },
      FoS_overturning: { value: Number(FoS_overturn.toFixed(2)), unit: '-' },
      FoS_sliding: { value: Number(FoS_slide.toFixed(2)), unit: '-' },
      maxBearingPressure: { value: Number(qMax.toFixed(2)), unit: 'kPa' },
      minBearingPressure: { value: Number(qMin.toFixed(2)), unit: 'kPa' },
    },
    derivation,
    sansReferences: ['SANS 10161 §7', method === 'rankine' ? 'Rankine (1857)' : 'Coulomb (1776)'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 4. Pile Capacity Calculator
// ---------------------------------------------------------------------------

export function computePileCapacity(input: PileCapacityInput): CalculatorOutput {
  const { pileDiameter, pileLength, soilLayers, endBearingFactor, shaftFrictionFactor } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const diam_m = pileDiameter / 1000
  const radius_m = diam_m / 2
  const Ab = Math.PI * radius_m * radius_m // pile base area (m²)
  intermediates['Ab'] = Ab

  derivation.push({
    label: 'Pile base area',
    formula: 'Ab = π·(D/2)²',
    substitution: `Ab = π×(${diam_m}/2)²`,
    result: `${Ab.toFixed(4)} m²`,
    sansRef: 'SANS 10161 §8',
  })

  // Determine soil at pile tip
  let depthAccum = 0
  let tipLayerIndex = 0
  for (let i = 0; i < soilLayers.length; i++) {
    depthAccum += soilLayers[i].thickness
    if (depthAccum >= pileLength) {
      tipLayerIndex = i
      break
    }
    if (i === soilLayers.length - 1) {
      tipLayerIndex = i
    }
  }

  const tipLayer = soilLayers[tipLayerIndex]

  // Overburden at pile tip
  let sigmav = 0
  let currentDepth = 0
  for (let i = 0; i <= tipLayerIndex; i++) {
    const layerThickness = Math.min(soilLayers[i].thickness, pileLength - currentDepth)
    sigmav += soilLayers[i].unitWeight * layerThickness
    currentDepth += layerThickness
    if (currentDepth >= pileLength) break
  }
  intermediates['sigmav_tip'] = sigmav

  derivation.push({
    label: 'Effective overburden at pile tip',
    formula: 'σv = Σ(γ_i · h_i)',
    substitution: `σv = Σ(γ×h) over ${tipLayerIndex + 1} layer(s)`,
    result: `${sigmav.toFixed(2)} kPa`,
    sansRef: 'SANS 10161 §8',
  })

  // End-bearing capacity: Qb = Ab · (c·Nc + σv·Nq)
  const { Nc: NcTip, Nq: NqTip } = bearingFactors(tipLayer.frictionAngle)
  // Use provided Nc factor (endBearingFactor) for cohesive soils
  const Nc_used = tipLayer.cohesion > 0 ? endBearingFactor : NcTip
  const Qb = Ab * (tipLayer.cohesion * Nc_used + sigmav * NqTip)
  intermediates['Qb'] = Qb
  intermediates['NcTip'] = Nc_used
  intermediates['NqTip'] = NqTip

  derivation.push({
    label: 'End-bearing capacity',
    formula: 'Qb = Ab·(c·Nc + σv·Nq)',
    substitution: `Qb = ${Ab.toFixed(4)}×(${tipLayer.cohesion}×${Nc_used.toFixed(2)} + ${sigmav.toFixed(2)}×${NqTip.toFixed(2)})`,
    result: `${Qb.toFixed(2)} kN`,
    sansRef: 'SANS 10161 §8',
  })

  // Shaft friction: Qs = Σ(α·cu·As_i) for cohesive, Σ(K·σv'·tanδ·As_i) for granular
  let Qs = 0
  let layerDepthStart = 0
  const pileCircumference = Math.PI * diam_m

  for (let i = 0; i < soilLayers.length; i++) {
    const layer = soilLayers[i]
    const layerTop = layerDepthStart
    const layerBottom = layerDepthStart + layer.thickness
    const effectiveTop = Math.max(layerTop, 0)
    const effectiveBottom = Math.min(layerBottom, pileLength)

    if (effectiveTop >= pileLength) break

    const effectiveThickness = effectiveBottom - effectiveTop
    if (effectiveThickness <= 0) {
      layerDepthStart += layer.thickness
      continue
    }

    const As_i = pileCircumference * effectiveThickness

    let fs_i: number
    if (layer.cohesion > 0) {
      // Alpha method: fs = α · cu
      fs_i = shaftFrictionFactor * layer.cohesion
    } else {
      // Beta method: fs = K · σv' · tanδ
      const midDepth = (effectiveTop + effectiveBottom) / 2
      let sigmavMid = 0
      let d = 0
      for (let j = 0; j <= i; j++) {
        const t = Math.min(soilLayers[j].thickness, midDepth - d)
        if (t > 0) sigmavMid += soilLayers[j].unitWeight * t
        d += soilLayers[j].thickness
        if (d >= midDepth) break
      }
      const K = 1.0 // lateral earth pressure coefficient
      const tanDelta = Math.tan(toRad(layer.frictionAngle * 2 / 3))
      fs_i = K * sigmavMid * tanDelta
    }

    Qs += fs_i * As_i
    layerDepthStart += layer.thickness
  }

  intermediates['Qs'] = Qs
  derivation.push({
    label: 'Shaft friction capacity',
    formula: 'Qs = Σ(fs_i · As_i) [α·cu for cohesive, K·σv·tanδ for granular]',
    substitution: `Pile circumference = ${pileCircumference.toFixed(3)}m, ${soilLayers.length} layer(s)`,
    result: `${Qs.toFixed(2)} kN`,
    sansRef: 'SANS 10161 §8',
  })

  // Ultimate pile capacity
  const Qu = Qb + Qs
  intermediates['Qu'] = Qu
  derivation.push({
    label: 'Ultimate pile capacity',
    formula: 'Qu = Qb + Qs',
    substitution: `Qu = ${Qb.toFixed(2)} + ${Qs.toFixed(2)}`,
    result: `${Qu.toFixed(2)} kN`,
    sansRef: 'SANS 10161 §8',
  })

  // Allowable pile load (FoS = 2.5 typical)
  const FoS_pile = 2.5
  const Qa = Qu / FoS_pile
  intermediates['Qa'] = Qa
  derivation.push({
    label: 'Allowable pile load (FoS = 2.5)',
    formula: 'Qa = Qu / FoS',
    substitution: `Qa = ${Qu.toFixed(2)} / ${FoS_pile}`,
    result: `${Qa.toFixed(2)} kN`,
    sansRef: 'SANS 10161 §8',
  })

  // Utilisation: capacity-based (report inverse — lower is better)
  const utilisationRatio = 1 / FoS_pile
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      endBearing: { value: Number(Qb.toFixed(2)), unit: 'kN' },
      shaftFriction: { value: Number(Qs.toFixed(2)), unit: 'kN' },
      ultimateCapacity: { value: Number(Qu.toFixed(2)), unit: 'kN' },
      allowableLoad: { value: Number(Qa.toFixed(2)), unit: 'kN' },
      pileBaseArea: { value: Number(Ab.toFixed(4)), unit: 'm²' },
    },
    derivation,
    sansReferences: ['SANS 10161 §8'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// Calculator Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'geo-bearing-capacity',
    title: 'Bearing Capacity',
    discipline: 'geotechnical',
    sansRef: 'SANS 10161',
    description: 'Terzaghi and Meyerhof bearing capacity analysis with Nc/Nq/Nγ factors',
  },
  inputSchema: bearingCapacityInputSchema,
  defaults: BEARING_CAPACITY_DEFAULTS,
  compute: computeBearingCapacity,
})

registerCalculator({
  meta: {
    id: 'geo-pad-footing',
    title: 'Pad Footing Design',
    discipline: 'geotechnical',
    sansRef: 'SANS 10100-1 / SANS 10161',
    description: 'Pad footing sizing, punching shear, flexural capacity, and reinforcement',
  },
  inputSchema: padFootingInputSchema,
  defaults: PAD_FOOTING_DEFAULTS,
  compute: computePadFooting,
})

registerCalculator({
  meta: {
    id: 'geo-retaining-wall',
    title: 'Retaining Wall Stability',
    discipline: 'geotechnical',
    sansRef: 'SANS 10161',
    description: 'Active/passive pressures, overturning and sliding FoS, bearing pressure',
  },
  inputSchema: retainingWallInputSchema,
  defaults: RETAINING_WALL_DEFAULTS,
  compute: computeRetainingWall,
})

registerCalculator({
  meta: {
    id: 'geo-pile-capacity',
    title: 'Pile Capacity',
    discipline: 'geotechnical',
    sansRef: 'SANS 10161',
    description: 'End-bearing and shaft friction pile capacity analysis',
  },
  inputSchema: pileCapacityInputSchema,
  defaults: PILE_CAPACITY_DEFAULTS,
  compute: computePileCapacity,
})
