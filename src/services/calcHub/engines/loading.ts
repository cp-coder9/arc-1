// Engineer's Calculation Hub — Civil Loading Engine
//
// Pure compute functions for loading calculations per SANS 10160.
// - Wind loads: SANS 10160-3
// - Seismic loads: SANS 10160-4
// - Load combinations: SANS 10160-1 Table 3
// - Imposed load lookup: SANS 10160-2 Table 1
//
// Requirements: 3.1–3.4, 12.1–12.4

import type { CalculatorOutput, DerivationStep } from '../types'
import {
  windLoadInputSchema,
  seismicLoadInputSchema,
  loadCombinationInputSchema,
  imposedLoadLookupSchema,
  WIND_LOAD_DEFAULTS,
  SEISMIC_LOAD_DEFAULTS,
  LOAD_COMBINATION_DEFAULTS,
  IMPOSED_LOAD_LOOKUP_DEFAULTS,
} from '../schemas/loading'
import type {
  WindLoadInput,
  SeismicLoadInput,
  LoadCombinationInput,
  ImposedLoadLookupInput,
} from '../schemas/loading'
import { registerCalculator } from '../calcHubRegistry'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Air density ≈ 1.225 kg/m³ → 0.5·ρ ≈ 0.613 (peak pressure constant) */
const PEAK_PRESSURE_CONSTANT = 0.613

/** Terrain category roughness factors at 10m reference height (simplified) */
const TERRAIN_FACTORS: Record<string, number> = {
  '1': 1.30,
  '2': 1.00,
  '3': 0.78,
  '4': 0.56,
}

/** Terrain category descriptions */
const TERRAIN_DESCRIPTIONS: Record<string, string> = {
  '1': 'Open sea/coast, flat open country',
  '2': 'Farmland with few obstacles',
  '3': 'Suburban, industrial, forest',
  '4': 'Urban, city centre, dense buildings',
}

/** Ground type peak ground acceleration factors (ag) for SA seismic zones */
const GROUND_TYPE_AG: Record<string, number> = {
  '1': 0.10,
  '2': 0.15,
  '3': 0.20,
  '4': 0.25,
}

/** Ground type soil amplification factor S */
const GROUND_TYPE_S: Record<string, number> = {
  '1': 1.0,
  '2': 1.2,
  '3': 1.15,
  '4': 1.35,
}

/** Corner period Tc (s) per ground type */
const GROUND_TYPE_TC: Record<string, number> = {
  '1': 0.4,
  '2': 0.5,
  '3': 0.6,
  '4': 0.8,
}

/** Damping correction factor η (for 5% damping) */
const ETA = 1.0

/** Imposed load lookup table keyed by occupancy category */
const IMPOSED_LOAD_TABLE: Record<string, { load: number; description: string }> = {
  residential_domestic: { load: 1.5, description: 'Residential — domestic use' },
  residential_dormitory: { load: 1.5, description: 'Residential — dormitory/hostel' },
  office_general: { load: 2.5, description: 'Office — general' },
  office_filing: { load: 5.0, description: 'Office — filing/storage areas' },
  retail_general: { load: 5.0, description: 'Retail — general' },
  retail_dense: { load: 5.0, description: 'Retail — dense display' },
  assembly_fixed_seating: { load: 4.0, description: 'Assembly — fixed seating' },
  assembly_without_seating: { load: 5.0, description: 'Assembly — without seating' },
  industrial_light: { load: 5.0, description: 'Industrial — light' },
  industrial_heavy: { load: 7.5, description: 'Industrial — heavy' },
  storage_light: { load: 5.0, description: 'Storage — light' },
  storage_heavy: { load: 7.5, description: 'Storage — heavy/dense' },
  parking_light_vehicles: { load: 2.5, description: 'Parking — vehicles ≤ 30 kN' },
  parking_heavy_vehicles: { load: 5.0, description: 'Parking — vehicles > 30 kN' },
  hospital_wards: { load: 2.0, description: 'Hospital — wards' },
  hospital_operating: { load: 3.0, description: 'Hospital — operating theatres' },
  educational_classrooms: { load: 3.0, description: 'Educational — classrooms' },
  educational_corridors: { load: 4.0, description: 'Educational — corridors/stairs' },
  hotel_guest_rooms: { load: 2.0, description: 'Hotel — guest rooms' },
  hotel_public_areas: { load: 4.0, description: 'Hotel — public areas' },
  balconies: { load: 4.0, description: 'Balconies' },
  stairs_and_landings: { load: 4.0, description: 'Stairs and landings' },
  roofs_accessible: { load: 2.0, description: 'Roofs — accessible' },
  roofs_non_accessible: { load: 0.5, description: 'Roofs — not accessible (maintenance only)' },
}

// getStatus is available for future capacity-based loading checks if needed
// For load-generation calculators, status is always 'pass' with 0 utilisation

// ---------------------------------------------------------------------------
// 1. Wind Load — SANS 10160-3
// ---------------------------------------------------------------------------

export function computeWindLoad(input: WindLoadInput): CalculatorOutput {
  const { basicWindSpeed, terrainCategory, topographyFactor, buildingHeight, buildingWidth, buildingDepth, roofAngle } = input

  // Terrain roughness factor (cr) — simplified at reference height
  const cr = TERRAIN_FACTORS[terrainCategory]

  // Orography factor (co) — typically 1.0 for flat terrain
  const co = 1.0

  // Topography factor (ct) — user-provided
  const ct = topographyFactor

  // Design wind speed: v = vb · cr · co · ct
  const v = basicWindSpeed * cr * co * ct

  // Peak wind pressure: qp = 0.613 × v² / 1000 (kPa)
  // This is from qp = 0.5 · ρ · v² with ρ = 1.226 → 0.5×1.226 ≈ 0.613
  const qp = (PEAK_PRESSURE_CONSTANT * v * v) / 1000

  // External pressure coefficient (Cpe) — simplified based on h/d ratio and roof angle
  const hd = buildingHeight / buildingDepth
  let cpeWindward = 0.8
  let cpeLeeward = -0.5
  if (hd > 1) cpeLeeward = -0.7
  if (hd > 4) cpeLeeward = -0.8

  // Roof pressure coefficient (simplified, depends on angle)
  let cpeRoof = -0.8
  if (roofAngle > 30) cpeRoof = 0.2 * (roofAngle - 30) / 60 // transitions positive for steep roofs
  if (roofAngle > 60) cpeRoof = 0.6

  // Internal pressure coefficient (Cpi) — dominant openings assumption
  const cpiPositive = 0.2
  const cpiNegative = -0.3

  // Net wall pressure (windward): qp × (Cpe_windward - Cpi_negative)
  const netWindward = qp * (cpeWindward - cpiNegative)
  // Net wall pressure (leeward): qp × (|Cpe_leeward| + Cpi_positive) — suction
  const netLeeward = qp * (Math.abs(cpeLeeward) + cpiPositive)
  // Net roof uplift: qp × (|Cpe_roof| + Cpi_positive)
  const netRoofUplift = qp * (Math.abs(cpeRoof) + cpiPositive)

  // Total wind force on building face (windward): F = qp × Cpe × A
  const windwardArea = buildingHeight * buildingWidth
  const totalWindForce = qp * cpeWindward * windwardArea

  // Utilisation is informational for wind — use 0 (pass by default, no capacity check)
  const utilisationRatio = 0

  const derivation: DerivationStep[] = [
    {
      label: 'Terrain Roughness Factor',
      formula: 'cr = terrain category factor',
      substitution: `cr = Category ${terrainCategory} (${TERRAIN_DESCRIPTIONS[terrainCategory]})`,
      result: `${cr.toFixed(2)}`,
      sansRef: 'SANS 10160-3 §7.3',
    },
    {
      label: 'Design Wind Speed',
      formula: 'v = vb · cr · co · ct',
      substitution: `v = ${basicWindSpeed} × ${cr} × ${co} × ${ct}`,
      result: `${v.toFixed(2)} m/s`,
      sansRef: 'SANS 10160-3 §7.2',
    },
    {
      label: 'Peak Wind Pressure',
      formula: 'qp = 0.613 × v² / 1000',
      substitution: `qp = 0.613 × ${v.toFixed(2)}² / 1000`,
      result: `${qp.toFixed(4)} kPa`,
      sansRef: 'SANS 10160-3 §7.4',
    },
    {
      label: 'External Pressure Coefficient (Windward)',
      formula: 'Cpe,windward (h/d dependent)',
      substitution: `h/d = ${buildingHeight}/${buildingDepth} = ${hd.toFixed(2)}`,
      result: `${cpeWindward.toFixed(2)}`,
      sansRef: 'SANS 10160-3 §8.3',
    },
    {
      label: 'External Pressure Coefficient (Leeward)',
      formula: 'Cpe,leeward (h/d dependent)',
      substitution: `h/d = ${hd.toFixed(2)}`,
      result: `${cpeLeeward.toFixed(2)}`,
      sansRef: 'SANS 10160-3 §8.3',
    },
    {
      label: 'Roof Pressure Coefficient',
      formula: 'Cpe,roof (angle dependent)',
      substitution: `roof angle = ${roofAngle}°`,
      result: `${cpeRoof.toFixed(2)}`,
      sansRef: 'SANS 10160-3 §8.4',
    },
    {
      label: 'Internal Pressure Coefficients',
      formula: 'Cpi (dominant openings)',
      substitution: `Cpi+ = ${cpiPositive}, Cpi- = ${cpiNegative}`,
      result: `+${cpiPositive} / ${cpiNegative}`,
      sansRef: 'SANS 10160-3 §8.5',
    },
  ]

  derivation.push(
    {
      label: 'Net Windward Wall Pressure',
      formula: 'p_net = qp × (Cpe - Cpi)',
      substitution: `p_net = ${qp.toFixed(4)} × (${cpeWindward} - (${cpiNegative}))`,
      result: `${netWindward.toFixed(4)} kPa`,
      sansRef: 'SANS 10160-3 §8.3',
    },
    {
      label: 'Net Leeward Wall Suction',
      formula: 'p_net = qp × (|Cpe| + Cpi)',
      substitution: `p_net = ${qp.toFixed(4)} × (${Math.abs(cpeLeeward).toFixed(2)} + ${cpiPositive})`,
      result: `${netLeeward.toFixed(4)} kPa`,
      sansRef: 'SANS 10160-3 §8.3',
    },
    {
      label: 'Net Roof Uplift Pressure',
      formula: 'p_roof = qp × (|Cpe,roof| + Cpi)',
      substitution: `p_roof = ${qp.toFixed(4)} × (${Math.abs(cpeRoof).toFixed(2)} + ${cpiPositive})`,
      result: `${netRoofUplift.toFixed(4)} kPa`,
      sansRef: 'SANS 10160-3 §8.4',
    },
    {
      label: 'Total Wind Force on Windward Face',
      formula: 'F = qp × Cpe × A',
      substitution: `F = ${qp.toFixed(4)} × ${cpeWindward} × (${buildingHeight} × ${buildingWidth})`,
      result: `${totalWindForce.toFixed(2)} kN`,
      sansRef: 'SANS 10160-3 §8.3',
    },
  )

  return {
    status: 'pass',
    utilisationRatio,
    results: {
      designWindSpeed: { value: Math.round(v * 100) / 100, unit: 'm/s' },
      peakWindPressure: { value: Math.round(qp * 10000) / 10000, unit: 'kPa' },
      netWindwardPressure: { value: Math.round(netWindward * 10000) / 10000, unit: 'kPa' },
      netLeewardSuction: { value: Math.round(netLeeward * 10000) / 10000, unit: 'kPa' },
      netRoofUplift: { value: Math.round(netRoofUplift * 10000) / 10000, unit: 'kPa' },
      totalWindForce: { value: Math.round(totalWindForce * 100) / 100, unit: 'kN' },
    },
    derivation,
    sansReferences: ['SANS 10160-3 §7.2', 'SANS 10160-3 §7.3', 'SANS 10160-3 §7.4', 'SANS 10160-3 §8.3', 'SANS 10160-3 §8.4', 'SANS 10160-3 §8.5'],
    intermediates: { cr, co, ct, v, qp, cpeWindward, cpeLeeward, cpeRoof, cpiPositive, cpiNegative, netWindward, netLeeward, netRoofUplift, totalWindForce, hd },
  }
}

// ---------------------------------------------------------------------------
// 2. Seismic Load — SANS 10160-4
// ---------------------------------------------------------------------------

export function computeSeismicLoad(input: SeismicLoadInput): CalculatorOutput {
  const { groundType, importanceFactor, behaviourFactor, buildingWeight, buildingHeight, numStoreys, naturalPeriod } = input

  // Peak ground acceleration (ag) based on ground type / SA seismic zone
  const ag = GROUND_TYPE_AG[groundType]
  const agMs2 = ag * 9.81 // convert to m/s²

  // Soil amplification factor S
  const S = GROUND_TYPE_S[groundType]

  // Corner period Tc
  const Tc = GROUND_TYPE_TC[groundType]

  // Behaviour factor q
  const q = behaviourFactor

  // Natural period T1
  const T1 = naturalPeriod

  // Design spectral acceleration Sd(T1)
  // For T1 < Tc: Sd = ag·S·η·2.5/q (plateau region)
  // For T1 >= Tc: Sd = ag·S·η·2.5·(Tc/T1)/q (descending branch)
  let Sd: number
  let spectralRegion: string
  if (T1 < Tc) {
    Sd = ag * S * ETA * 2.5 / q
    spectralRegion = 'plateau (T < Tc)'
  } else {
    Sd = ag * S * ETA * 2.5 * (Tc / T1) / q
    spectralRegion = 'descending (T ≥ Tc)'
  }

  // Base shear: V = Sd · W · γI (importance factor)
  const V = Sd * buildingWeight * importanceFactor

  // Vertical distribution of lateral forces (linear, SANS 10160-4 simplified)
  // Fi = V × (wi·hi) / Σ(wj·hj)
  // Assuming equal floor weights: Fi = V × hi / Σhj
  const storeyHeight = buildingHeight / numStoreys
  const storeyHeights: number[] = []
  let sumH = 0
  for (let i = 1; i <= numStoreys; i++) {
    const hi = i * storeyHeight
    storeyHeights.push(hi)
    sumH += hi
  }
  const storeyForces = storeyHeights.map((hi) => (V * hi) / sumH)

  // Utilisation is informational — no capacity check for load generation
  const utilisationRatio = 0

  const derivation: DerivationStep[] = [
    {
      label: 'Peak Ground Acceleration',
      formula: 'ag (ground type factor)',
      substitution: `Ground Type ${groundType}`,
      result: `${ag.toFixed(2)}g (${agMs2.toFixed(3)} m/s²)`,
      sansRef: 'SANS 10160-4 §5.2',
    },
    {
      label: 'Soil Amplification Factor',
      formula: 'S (ground type)',
      substitution: `Ground Type ${groundType}`,
      result: `${S.toFixed(2)}`,
      sansRef: 'SANS 10160-4 §5.3',
    },
    {
      label: 'Corner Period',
      formula: 'Tc (ground type)',
      substitution: `Ground Type ${groundType}`,
      result: `${Tc.toFixed(2)} s`,
      sansRef: 'SANS 10160-4 §5.3',
    },
    {
      label: 'Spectral Region',
      formula: 'T1 vs Tc comparison',
      substitution: `T1 = ${T1} s, Tc = ${Tc} s`,
      result: spectralRegion,
      sansRef: 'SANS 10160-4 §5.4',
    },
    {
      label: 'Design Spectral Acceleration',
      formula: T1 < Tc ? 'Sd = ag·S·η·2.5/q' : 'Sd = ag·S·η·2.5·(Tc/T1)/q',
      substitution: T1 < Tc
        ? `Sd = ${ag}×${S}×${ETA}×2.5/${q}`
        : `Sd = ${ag}×${S}×${ETA}×2.5×(${Tc}/${T1})/${q}`,
      result: `${Sd.toFixed(4)}g`,
      sansRef: 'SANS 10160-4 §5.4',
    },
  ]

  derivation.push(
    {
      label: 'Seismic Base Shear',
      formula: 'V = Sd × W × γI',
      substitution: `V = ${Sd.toFixed(4)} × ${buildingWeight} × ${importanceFactor}`,
      result: `${V.toFixed(2)} kN`,
      sansRef: 'SANS 10160-4 §6.2',
    },
    {
      label: 'Vertical Distribution (storey forces)',
      formula: 'Fi = V × hi / Σhj',
      substitution: `Σhj = ${sumH.toFixed(2)} m, ${numStoreys} storeys @ ${storeyHeight.toFixed(2)} m`,
      result: `Top storey: ${storeyForces[storeyForces.length - 1].toFixed(2)} kN, Base storey: ${storeyForces[0].toFixed(2)} kN`,
      sansRef: 'SANS 10160-4 §6.3',
    },
  )

  // Build storey forces into results
  const results: Record<string, { value: number | string; unit: string }> = {
    baseShear: { value: Math.round(V * 100) / 100, unit: 'kN' },
    spectralAcceleration: { value: Math.round(Sd * 10000) / 10000, unit: 'g' },
    peakGroundAcceleration: { value: ag, unit: 'g' },
  }
  storeyForces.forEach((f, i) => {
    results[`storeyForce_${i + 1}`] = { value: Math.round(f * 100) / 100, unit: 'kN' }
  })

  const intermediates: Record<string, number> = {
    ag, S, Tc, q, T1, Sd, V, importanceFactor, buildingWeight, sumH,
  }
  storeyForces.forEach((f, i) => {
    intermediates[`F_${i + 1}`] = f
  })

  return {
    status: 'pass',
    utilisationRatio,
    results,
    derivation,
    sansReferences: ['SANS 10160-4 §5.2', 'SANS 10160-4 §5.3', 'SANS 10160-4 §5.4', 'SANS 10160-4 §6.2', 'SANS 10160-4 §6.3'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 3. Load Combinations — SANS 10160-1 Table 3
// ---------------------------------------------------------------------------

export function computeLoadCombinations(input: LoadCombinationInput): CalculatorOutput {
  const { deadLoad, liveLoad, windLoad, seismicLoad } = input
  const EQ = seismicLoad ?? 0

  // ULS Combinations per SANS 10160-1 Table 3
  const ulsCombo1 = 1.2 * deadLoad + 1.6 * liveLoad // DL + LL
  const ulsCombo2 = 1.2 * deadLoad + 1.3 * windLoad + 0.5 * liveLoad // DL + WL + LL
  const ulsCombo3 = 0.9 * deadLoad + 1.3 * windLoad // DL + WL (uplift check)
  const ulsCombo4 = 1.2 * deadLoad + 1.0 * EQ // DL + EQ
  const ulsCombo5 = 1.2 * deadLoad + 1.0 * EQ + 0.3 * liveLoad // DL + EQ + LL (reduced)

  // SLS Combinations
  const slsCombo1 = 1.0 * deadLoad + 1.0 * liveLoad // DL + LL
  const slsCombo2 = 1.0 * deadLoad + 0.6 * liveLoad + 0.6 * windLoad // DL + LL + WL

  // Governing ULS
  const ulsMax = Math.max(ulsCombo1, ulsCombo2, ulsCombo3, ulsCombo4, ulsCombo5)
  const slsMax = Math.max(slsCombo1, slsCombo2)

  // Determine governing combination name
  const ulsCombos = [
    { name: '1.2DL + 1.6LL', value: ulsCombo1 },
    { name: '1.2DL + 1.3WL + 0.5LL', value: ulsCombo2 },
    { name: '0.9DL + 1.3WL', value: ulsCombo3 },
    { name: '1.2DL + 1.0EQ', value: ulsCombo4 },
    { name: '1.2DL + 1.0EQ + 0.3LL', value: ulsCombo5 },
  ]
  const governingULS = ulsCombos.reduce((max, c) => c.value > max.value ? c : max, ulsCombos[0])

  // Utilisation is informational — no capacity check
  const utilisationRatio = 0

  const derivation: DerivationStep[] = [
    {
      label: 'ULS Combo 1: Gravity',
      formula: '1.2·DL + 1.6·LL',
      substitution: `1.2×${deadLoad} + 1.6×${liveLoad}`,
      result: `${ulsCombo1.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'ULS Combo 2: Gravity + Wind',
      formula: '1.2·DL + 1.3·WL + 0.5·LL',
      substitution: `1.2×${deadLoad} + 1.3×${windLoad} + 0.5×${liveLoad}`,
      result: `${ulsCombo2.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'ULS Combo 3: Uplift',
      formula: '0.9·DL + 1.3·WL',
      substitution: `0.9×${deadLoad} + 1.3×${windLoad}`,
      result: `${ulsCombo3.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'ULS Combo 4: Seismic',
      formula: '1.2·DL + 1.0·EQ',
      substitution: `1.2×${deadLoad} + 1.0×${EQ}`,
      result: `${ulsCombo4.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'ULS Combo 5: Seismic + Live',
      formula: '1.2·DL + 1.0·EQ + 0.3·LL',
      substitution: `1.2×${deadLoad} + 1.0×${EQ} + 0.3×${liveLoad}`,
      result: `${ulsCombo5.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'SLS Combo 1: Service gravity',
      formula: '1.0·DL + 1.0·LL',
      substitution: `1.0×${deadLoad} + 1.0×${liveLoad}`,
      result: `${slsCombo1.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'SLS Combo 2: Service + Wind',
      formula: '1.0·DL + 0.6·LL + 0.6·WL',
      substitution: `1.0×${deadLoad} + 0.6×${liveLoad} + 0.6×${windLoad}`,
      result: `${slsCombo2.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
    {
      label: 'Governing ULS Combination',
      formula: 'max(all ULS)',
      substitution: governingULS.name,
      result: `${ulsMax.toFixed(2)} kN/m² (or kN)`,
      sansRef: 'SANS 10160-1 §3',
    },
  ]

  return {
    status: 'pass',
    utilisationRatio,
    results: {
      ulsCombo1: { value: Math.round(ulsCombo1 * 100) / 100, unit: 'kN/m²' },
      ulsCombo2: { value: Math.round(ulsCombo2 * 100) / 100, unit: 'kN/m²' },
      ulsCombo3: { value: Math.round(ulsCombo3 * 100) / 100, unit: 'kN/m²' },
      ulsCombo4: { value: Math.round(ulsCombo4 * 100) / 100, unit: 'kN/m²' },
      ulsCombo5: { value: Math.round(ulsCombo5 * 100) / 100, unit: 'kN/m²' },
      slsCombo1: { value: Math.round(slsCombo1 * 100) / 100, unit: 'kN/m²' },
      slsCombo2: { value: Math.round(slsCombo2 * 100) / 100, unit: 'kN/m²' },
      governingULS: { value: `${governingULS.name} = ${ulsMax.toFixed(2)}`, unit: 'kN/m²' },
      governingSLS: { value: Math.round(slsMax * 100) / 100, unit: 'kN/m²' },
    },
    derivation,
    sansReferences: ['SANS 10160-1 §3'],
    intermediates: { deadLoad, liveLoad, windLoad, EQ, ulsCombo1, ulsCombo2, ulsCombo3, ulsCombo4, ulsCombo5, slsCombo1, slsCombo2, ulsMax, slsMax },
  }
}

// ---------------------------------------------------------------------------
// 4. Imposed Load Lookup — SANS 10160-2 Table 1
// ---------------------------------------------------------------------------

export function computeImposedLoadLookup(input: ImposedLoadLookupInput): CalculatorOutput {
  const { occupancyCategory } = input

  const entry = IMPOSED_LOAD_TABLE[occupancyCategory]
  if (!entry) {
    return {
      status: 'fail',
      utilisationRatio: 0,
      results: { error: { value: `Category "${occupancyCategory}" not found`, unit: '' } },
      derivation: [],
      sansReferences: [],
      intermediates: {},
    }
  }

  const { load, description } = entry

  const derivation: DerivationStep[] = [
    {
      label: 'Occupancy Category',
      formula: 'Lookup from SANS 10160-2 Table 1',
      substitution: `Category: ${occupancyCategory}`,
      result: description,
      sansRef: 'SANS 10160-2 §5',
    },
    {
      label: 'Imposed Load (qk)',
      formula: 'qk from Table 1',
      substitution: `${description}`,
      result: `${load.toFixed(1)} kPa`,
      sansRef: 'SANS 10160-2 §5',
    },
  ]

  return {
    status: 'pass',
    utilisationRatio: 0,
    results: {
      imposedLoad: { value: load, unit: 'kPa' },
      category: { value: description, unit: '' },
    },
    derivation,
    sansReferences: ['SANS 10160-2 §5'],
    intermediates: { load },
  }
}

// ---------------------------------------------------------------------------
// Calculator Registrations
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'wind-load',
    title: 'Wind Load',
    discipline: 'civil-loading',
    sansRef: 'SANS 10160-3',
    description: 'Wind pressure calculation: basic wind speed, terrain factors, pressure coefficients per SANS 10160-3.',
  },
  inputSchema: windLoadInputSchema,
  defaults: WIND_LOAD_DEFAULTS,
  compute: computeWindLoad,
})

registerCalculator({
  meta: {
    id: 'seismic-load',
    title: 'Seismic Load',
    discipline: 'civil-loading',
    sansRef: 'SANS 10160-4',
    description: 'Equivalent lateral force method: base shear and vertical distribution per SANS 10160-4.',
  },
  inputSchema: seismicLoadInputSchema,
  defaults: SEISMIC_LOAD_DEFAULTS,
  compute: computeSeismicLoad,
})

registerCalculator({
  meta: {
    id: 'load-combinations',
    title: 'Load Combinations',
    discipline: 'civil-loading',
    sansRef: 'SANS 10160-1',
    description: 'ULS and SLS load combinations with partial factors per SANS 10160-1 Table 3.',
  },
  inputSchema: loadCombinationInputSchema,
  defaults: LOAD_COMBINATION_DEFAULTS,
  compute: computeLoadCombinations,
})

registerCalculator({
  meta: {
    id: 'imposed-load-lookup',
    title: 'Imposed Load Lookup',
    discipline: 'civil-loading',
    sansRef: 'SANS 10160-2',
    description: 'Imposed load values by occupancy category per SANS 10160-2 Table 1.',
  },
  inputSchema: imposedLoadLookupSchema,
  defaults: IMPOSED_LOAD_LOOKUP_DEFAULTS,
  compute: computeImposedLoadLookup,
})
