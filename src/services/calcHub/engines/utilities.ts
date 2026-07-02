// Engineer's Calculation Hub — Utilities Engines
//
// Pure compute functions for:
// 1. Unit conversion (18+ categories)
// 2. Material density lookup
// 3. Section properties calculator (rectangle, circle, I-section, T-section, L-section)
//
// Requirements: 3.1-3.4, 18.1-18.3

import type { CalculatorOutput, DerivationStep } from '../types'
import { registerCalculator } from '../calcHubRegistry'
import { convertUnit } from '../data/unitConversions'
import { getMaterialDensity } from '../data/materialDensities'
import {
  unitConversionInputSchema,
  UNIT_CONVERSION_DEFAULTS,
  materialDensityLookupSchema,
  MATERIAL_DENSITY_LOOKUP_DEFAULTS,
  sectionPropertiesInputSchema,
  SECTION_PROPERTIES_DEFAULTS,
} from '../schemas/utilities'
import type {
  UnitConversionInput,
  MaterialDensityLookupInput,
  SectionPropertiesInput,
} from '../schemas/utilities'

// ---------------------------------------------------------------------------
// 1. Unit Conversion Calculator
// ---------------------------------------------------------------------------

export function computeUnitConversion(input: UnitConversionInput): CalculatorOutput {
  const { value, fromUnit, toUnit, category } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Perform the conversion
  const result = convertUnit(value, fromUnit, toUnit, category)
  intermediates['inputValue'] = value
  intermediates['convertedValue'] = result

  derivation.push({
    label: 'Unit conversion',
    formula: `Convert ${fromUnit} → ${toUnit} (${category})`,
    substitution: `${value} ${fromUnit}`,
    result: `${result} ${toUnit}`,
    sansRef: 'SANS 10160-1 §1.3',
  })

  // Utilities don't have a pass/fail limit — always pass with ratio 0
  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      convertedValue: { value: Number(result.toPrecision(10)), unit: toUnit },
      originalValue: { value, unit: fromUnit },
    },
    derivation,
    sansReferences: ['SANS 10160-1 §1.3'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 2. Material Density Lookup Calculator
// ---------------------------------------------------------------------------

export function computeMaterialDensity(input: MaterialDensityLookupInput): CalculatorOutput {
  const { materialName } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const density = getMaterialDensity(materialName)

  if (density === undefined) {
    // Material not found — return a fail status
    derivation.push({
      label: 'Material density lookup',
      formula: `Lookup: "${materialName}"`,
      substitution: `Material "${materialName}" not found in database`,
      result: 'N/A',
      sansRef: 'SANS 10160-2 §3.1',
      isFailing: true,
    })

    return {
      status: 'fail',
      utilisationRatio: 0,
      results: {
        density: { value: 'Not found', unit: 'kg/m³' },
      },
      derivation,
      sansReferences: ['SANS 10160-2 §3.1'],
      intermediates,
    }
  }

  intermediates['density'] = density
  // Also provide kN/m³ conversion (density × g / 1000)
  const densityKN = (density * 9.80665) / 1000
  intermediates['densityKN'] = densityKN

  derivation.push({
    label: 'Material density lookup',
    formula: `Lookup: "${materialName}"`,
    substitution: `Found in material database`,
    result: `${density} kg/m³`,
    sansRef: 'SANS 10160-2 §3.1',
  })

  derivation.push({
    label: 'Unit weight (kN/m³)',
    formula: 'γ = ρ × g / 1000',
    substitution: `γ = ${density} × 9.80665 / 1000`,
    result: `${densityKN.toFixed(2)} kN/m³`,
    sansRef: 'SANS 10160-2 §3.1',
  })

  // Utilities always pass — no limit check
  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      density: { value: density, unit: 'kg/m³' },
      unitWeight: { value: Number(densityKN.toFixed(2)), unit: 'kN/m³' },
    },
    derivation,
    sansReferences: ['SANS 10160-2 §3.1'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 3. Section Properties Calculator
// ---------------------------------------------------------------------------

/** Compute section properties for a rectangle */
function computeRectangle(b: number, h: number) {
  const A = b * h
  const Ix = (b * Math.pow(h, 3)) / 12
  const Iy = (h * Math.pow(b, 3)) / 12
  const Zx = (b * Math.pow(h, 2)) / 6
  const Zy = (h * Math.pow(b, 2)) / 6
  const Sx = (b * Math.pow(h, 2)) / 4
  const Sy = (h * Math.pow(b, 2)) / 4
  const rx = h / Math.sqrt(12)
  const ry = b / Math.sqrt(12)
  return { A, Ix, Iy, Zx, Zy, Sx, Sy, rx, ry, yc: h / 2, xc: b / 2 }
}

/** Compute section properties for a circle (D = width) */
function computeCircle(D: number) {
  const A = (Math.PI * Math.pow(D, 2)) / 4
  const Ix = (Math.PI * Math.pow(D, 4)) / 64
  const Iy = Ix
  const Zx = (Math.PI * Math.pow(D, 3)) / 32
  const Zy = Zx
  const Sx = Math.pow(D, 3) / 6
  const Sy = Sx
  const rx = D / 4
  const ry = rx
  return { A, Ix, Iy, Zx, Zy, Sx, Sy, rx, ry, yc: D / 2, xc: D / 2 }
}

/** Compute section properties for an I-section */
function computeISection(
  bf: number, h: number, tf: number, tw: number
) {
  // I-section: two flanges + web
  // Overall height = h, flange width = bf, flange thickness = tf, web thickness = tw
  const hw = h - 2 * tf // clear web height

  // Area
  const A = 2 * bf * tf + hw * tw

  // Moment of inertia about x-axis (strong axis)
  // I = (bf·h³ - (bf - tw)·hw³) / 12
  const Ix = (bf * Math.pow(h, 3) - (bf - tw) * Math.pow(hw, 3)) / 12

  // Moment of inertia about y-axis (weak axis)
  // I = (2·tf·bf³ + hw·tw³) / 12
  const Iy = (2 * tf * Math.pow(bf, 3) + hw * Math.pow(tw, 3)) / 12

  // Section moduli (elastic)
  const Zx = Ix / (h / 2)
  const Zy = Iy / (bf / 2)

  // Plastic moduli (approximate for doubly-symmetric I-section)
  // Sx = bf·tf·(h - tf) + tw·hw²/4
  const Sx = bf * tf * (h - tf) + (tw * Math.pow(hw, 2)) / 4
  const Sy = (2 * tf * Math.pow(bf, 2)) / 4 + (hw * Math.pow(tw, 2)) / 4

  // Radii of gyration
  const rx = Math.sqrt(Ix / A)
  const ry = Math.sqrt(Iy / A)

  return { A, Ix, Iy, Zx, Zy, Sx, Sy, rx, ry, yc: h / 2, xc: bf / 2 }
}

/** Compute section properties for a T-section */
function computeTSection(
  bf: number, h: number, tf: number, tw: number
) {
  // T-section: flange on top + web below
  // Overall height = h, flange width = bf, flange thickness = tf, web thickness = tw
  const hw = h - tf // web height

  // Area
  const Af = bf * tf   // flange area
  const Aw = tw * hw   // web area
  const A = Af + Aw

  // Centroid from bottom
  const yf = h - tf / 2  // flange centroid from bottom
  const yw = hw / 2       // web centroid from bottom
  const yc = (Af * yf + Aw * yw) / A

  // Moment of inertia about centroidal x-axis (parallel axis theorem)
  const If = (bf * Math.pow(tf, 3)) / 12 + Af * Math.pow(yf - yc, 2)
  const Iw = (tw * Math.pow(hw, 3)) / 12 + Aw * Math.pow(yw - yc, 2)
  const Ix = If + Iw

  // Moment of inertia about y-axis
  const Iy = (tf * Math.pow(bf, 3)) / 12 + (hw * Math.pow(tw, 3)) / 12

  // Section moduli (elastic) — use max distance from centroid
  const ytop = h - yc
  const ybot = yc
  const Zx = Ix / Math.max(ytop, ybot)
  const Zy = Iy / (bf / 2)

  // Plastic modulus (approximate)
  // Find equal area axis
  const Sx = computePlasticModulusT(bf, h, tf, tw, A)
  const Sy = (tf * Math.pow(bf, 2)) / 4 + (hw * Math.pow(tw, 2)) / 4

  // Radii of gyration
  const rx = Math.sqrt(Ix / A)
  const ry = Math.sqrt(Iy / A)

  const xc = bf / 2

  return { A, Ix, Iy, Zx, Zy, Sx, Sy, rx, ry, yc, xc }
}

/** Compute plastic section modulus for T-section (approximate) */
function computePlasticModulusT(
  bf: number, h: number, tf: number, tw: number, A: number
): number {
  // Equal area axis: splits total area in half
  const halfA = A / 2
  const hw = h - tf

  // Check if the equal area axis is in the web or flange
  const webArea = tw * hw
  if (halfA <= webArea) {
    // Equal area axis is in the web
    const yEA = halfA / tw  // height from bottom
    // Sx = sum of (area × distance from EA axis) for each half
    const Sbot = tw * yEA * (yEA / 2)
    const Stop = tw * (hw - yEA) * ((hw - yEA) / 2) + bf * tf * (hw - yEA + tf / 2)
    return Sbot + Stop
  } else {
    // Equal area axis is in the flange
    const yInFlange = (halfA - webArea) / bf
    const yEA = hw + yInFlange // from bottom
    const Sbot = tw * hw * (yEA - hw / 2) + bf * yInFlange * (yInFlange / 2)
    const Stop = bf * (tf - yInFlange) * ((tf - yInFlange) / 2)
    return Sbot + Stop
  }
}

/** Compute section properties for an L-section (equal leg angle) */
function computeLSection(h: number, tw: number) {
  // Equal-leg angle: both legs have length h and thickness tw
  const leg = h
  const t = tw

  // Area
  const A = 2 * leg * t - t * t // subtract the corner overlap

  // Centroid from outer corner (for equal leg)
  const yc = (leg * t * (leg / 2) + (leg - t) * t * (t / 2)) / A
  const xc = yc // symmetric for equal leg

  // Moment of inertia about centroidal axes (equal-leg angle)
  // Vertical leg: t × h, centroid at t/2 from left edge
  // Horizontal leg: (h - t) × t, centroid at (h-t)/2 + t from bottom? 
  // Use composite approach:
  // Leg 1 (vertical): width=t, height=leg, centroid at (xc=t/2, yc_1=leg/2)
  const I1x = (t * Math.pow(leg, 3)) / 12 + (t * leg) * Math.pow(leg / 2 - yc, 2)
  // Leg 2 (horizontal, minus overlap): width=(leg-t), height=t, centroid at ((leg-t)/2+t, t/2)
  const I2x = ((leg - t) * Math.pow(t, 3)) / 12 + ((leg - t) * t) * Math.pow(t / 2 - yc, 2)
  const Ix = I1x + I2x

  // For equal-leg angle, Iy = Ix
  const Iy = Ix

  // Section moduli
  const maxDistX = Math.max(yc, leg - yc)
  const Zx = Ix / maxDistX
  const Zy = Iy / maxDistX

  // Plastic modulus (simplified approximation for equal-leg angle)
  const Sx = A * yc / 2 + A * (leg - yc) / 2
  // Simplified: Sx ≈ A × (leg/2 - overlap correction)
  const SxApprox = (t * Math.pow(leg, 2)) / 4 + ((leg - t) * Math.pow(t, 2)) / 4
  const Sy = SxApprox // symmetric

  // Radii of gyration
  const rx = Math.sqrt(Ix / A)
  const ry = Math.sqrt(Iy / A)

  return { A, Ix, Iy, Zx, Zy, Sx: SxApprox, Sy, rx, ry, yc, xc }
}

export function computeSectionProperties(input: SectionPropertiesInput): CalculatorOutput {
  const { shape, width, height, flangeWidth, flangeThickness, webThickness } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  let props: {
    A: number; Ix: number; Iy: number
    Zx: number; Zy: number; Sx: number; Sy: number
    rx: number; ry: number; yc: number; xc: number
  }

  switch (shape) {
    case 'rectangle': {
      props = computeRectangle(width, height)
      derivation.push({
        label: 'Rectangle section properties',
        formula: 'I = b·h³/12, Z = b·h²/6, S = b·h²/4, A = b·h, r = h/√12',
        substitution: `b = ${width} mm, h = ${height} mm`,
        result: `A = ${props.A.toFixed(2)} mm²`,
        sansRef: 'SANS 10162-1 §4.3',
      })
      break
    }
    case 'circle': {
      const D = width
      props = computeCircle(D)
      derivation.push({
        label: 'Circular section properties',
        formula: 'I = π·D⁴/64, Z = π·D³/32, S = D³/6, A = π·D²/4, r = D/4',
        substitution: `D = ${D} mm`,
        result: `A = ${props.A.toFixed(2)} mm²`,
        sansRef: 'SANS 10162-1 §4.3',
      })
      break
    }
    case 'i_section': {
      const bf = flangeWidth ?? width
      const tf = flangeThickness ?? 10
      const tw = webThickness ?? 6
      props = computeISection(bf, height, tf, tw)
      derivation.push({
        label: 'I-section properties',
        formula: 'Ix = (bf·h³ - (bf-tw)·hw³)/12, hw = h - 2·tf',
        substitution: `bf = ${bf} mm, h = ${height} mm, tf = ${tf} mm, tw = ${tw} mm`,
        result: `A = ${props.A.toFixed(2)} mm²`,
        sansRef: 'SANS 10162-1 §4.3',
      })
      break
    }
    case 't_section': {
      const bf = flangeWidth ?? width
      const tf = flangeThickness ?? 10
      const tw = webThickness ?? 6
      props = computeTSection(bf, height, tf, tw)
      derivation.push({
        label: 'T-section properties (centroid computed)',
        formula: 'yc = (Af·yf + Aw·yw) / A, Ix by parallel axis theorem',
        substitution: `bf = ${bf} mm, h = ${height} mm, tf = ${tf} mm, tw = ${tw} mm`,
        result: `A = ${props.A.toFixed(2)} mm², yc = ${props.yc.toFixed(2)} mm`,
        sansRef: 'SANS 10162-1 §4.3',
      })
      break
    }
    case 'l_section': {
      const tw = webThickness ?? 10
      props = computeLSection(height, tw)
      derivation.push({
        label: 'L-section properties (equal leg angle)',
        formula: 'Equal-leg angle: leg = h, t = tw',
        substitution: `leg = ${height} mm, t = ${tw} mm`,
        result: `A = ${props.A.toFixed(2)} mm²`,
        sansRef: 'SANS 10162-1 §4.3',
      })
      break
    }
    default:
      props = computeRectangle(width, height)
  }

  // Store all intermediates
  intermediates['A'] = props.A
  intermediates['Ix'] = props.Ix
  intermediates['Iy'] = props.Iy
  intermediates['Zx'] = props.Zx
  intermediates['Zy'] = props.Zy
  intermediates['Sx'] = props.Sx
  intermediates['Sy'] = props.Sy
  intermediates['rx'] = props.rx
  intermediates['ry'] = props.ry
  intermediates['yc'] = props.yc
  intermediates['xc'] = props.xc

  // Add detail derivation steps
  derivation.push({
    label: 'Second moment of area (Ix)',
    formula: 'Ix about centroidal x-axis',
    substitution: `Shape: ${shape}`,
    result: `${props.Ix.toFixed(2)} mm⁴`,
    sansRef: 'SANS 10162-1 §4.3',
  })

  derivation.push({
    label: 'Section modulus (Zx)',
    formula: 'Zx = Ix / y_max',
    substitution: `Zx = ${props.Ix.toFixed(2)} / ${(props.yc > 0 ? Math.max(props.yc, (shape === 'circle' ? props.yc : height - props.yc)) : height / 2).toFixed(2)}`,
    result: `${props.Zx.toFixed(2)} mm³`,
    sansRef: 'SANS 10162-1 §4.3',
  })

  derivation.push({
    label: 'Radius of gyration (rx)',
    formula: 'rx = √(Ix / A)',
    substitution: `rx = √(${props.Ix.toFixed(2)} / ${props.A.toFixed(2)})`,
    result: `${props.rx.toFixed(2)} mm`,
    sansRef: 'SANS 10162-1 §4.3',
  })

  // Utilities — no pass/fail limit
  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      area: { value: Number(props.A.toFixed(2)), unit: 'mm²' },
      Ix: { value: Number(props.Ix.toFixed(2)), unit: 'mm⁴' },
      Iy: { value: Number(props.Iy.toFixed(2)), unit: 'mm⁴' },
      Zx: { value: Number(props.Zx.toFixed(2)), unit: 'mm³' },
      Zy: { value: Number(props.Zy.toFixed(2)), unit: 'mm³' },
      Sx: { value: Number(props.Sx.toFixed(2)), unit: 'mm³' },
      Sy: { value: Number(props.Sy.toFixed(2)), unit: 'mm³' },
      rx: { value: Number(props.rx.toFixed(2)), unit: 'mm' },
      ry: { value: Number(props.ry.toFixed(2)), unit: 'mm' },
    },
    derivation,
    sansReferences: ['SANS 10162-1 §4.3'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// Calculator Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'util-unit-conversion',
    title: 'Unit Converter',
    discipline: 'utilities',
    sansRef: 'SANS 10160-1',
    description: 'Convert between 18+ unit categories (length, area, volume, mass, force, pressure, moment, velocity, flow, temperature, density, power, energy, angle, time, acceleration, torque, stress)',
  },
  inputSchema: unitConversionInputSchema,
  defaults: UNIT_CONVERSION_DEFAULTS,
  compute: computeUnitConversion,
})

registerCalculator({
  meta: {
    id: 'util-material-density',
    title: 'Material Density Lookup',
    discipline: 'utilities',
    sansRef: 'SANS 10160-2',
    description: 'Look up material density for 20+ common construction materials including steel, concrete, timber, masonry, and aggregates',
  },
  inputSchema: materialDensityLookupSchema,
  defaults: MATERIAL_DENSITY_LOOKUP_DEFAULTS,
  compute: computeMaterialDensity,
})

registerCalculator({
  meta: {
    id: 'util-section-properties',
    title: 'Section Properties Calculator',
    discipline: 'utilities',
    sansRef: 'SANS 10162-1',
    description: 'Compute I, Z, S, A, r for rectangle, circle, I-section, T-section, and L-section shapes from user-defined dimensions',
  },
  inputSchema: sectionPropertiesInputSchema,
  defaults: SECTION_PROPERTIES_DEFAULTS,
  compute: computeSectionProperties,
})
