// Engineer's Calculation Hub — Duct Sizing / HVAC Engines
//
// Pure compute functions for:
// - Round/rectangular duct sizing
// - Chilled water pipe sizing
// - Fan selection (P = Q·Δp/η)
// - Heat gain (sensible: fabric + internal gains)
// - Heat loss (fabric ΣU·A·ΔT + ventilation)
//
// Requirements: 3.1-3.4, 14.1-14.5
//
// References: SANS 10400-XA, ASHRAE Fundamentals, CIBSE Guide B

import type { CalculatorOutput, DerivationStep, PassFailStatus } from '../types'
import { registerCalculator } from '../calcHubRegistry'
import {
  ductSizingInputSchema,
  DUCT_SIZING_DEFAULTS,
  chilledWaterPipeInputSchema,
  CHILLED_WATER_PIPE_DEFAULTS,
  fanSelectionInputSchema,
  FAN_SELECTION_DEFAULTS,
  heatGainInputSchema,
  HEAT_GAIN_DEFAULTS,
  heatLossInputSchema,
  HEAT_LOSS_DEFAULTS,
} from '../schemas/ductSizing'
import type {
  DuctSizingInput,
  ChilledWaterPipeInput,
  FanSelectionInput,
  HeatGainInput,
  HeatLossInput,
} from '../schemas/ductSizing'

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
// 1. Duct Sizing Calculator (Round / Rectangular)
// ---------------------------------------------------------------------------

export function computeDuctSizing(input: DuctSizingInput): CalculatorOutput {
  const { airflowRate, maxVelocity, ductShape, aspectRatio } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Convert airflow from L/s to m³/s
  const Q_m3s = airflowRate / 1000
  intermediates['Q_m3s'] = Q_m3s
  derivation.push({
    label: 'Convert airflow to m³/s',
    formula: 'Q = airflow / 1000',
    substitution: `Q = ${airflowRate} / 1000`,
    result: `${Q_m3s.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-XA §4.3',
  })

  // Required duct area: A = Q / v
  const A_required = Q_m3s / maxVelocity
  intermediates['A_required'] = A_required
  derivation.push({
    label: 'Required duct cross-sectional area',
    formula: 'A = Q / v',
    substitution: `A = ${Q_m3s.toFixed(4)} / ${maxVelocity}`,
    result: `${(A_required * 1e6).toFixed(0)} mm² (${A_required.toFixed(6)} m²)`,
    sansRef: 'SANS 10400-XA §4.3',
  })

  let D_round_mm: number
  let width_mm = 0
  let height_mm = 0
  let De_mm = 0

  if (ductShape === 'round') {
    // Round duct: D = √(4A/π) × 1000
    D_round_mm = Math.sqrt((4 * A_required) / Math.PI) * 1000
    intermediates['D_round_mm'] = D_round_mm
    derivation.push({
      label: 'Round duct diameter',
      formula: 'D = √(4A/π) × 1000',
      substitution: `D = √(4×${A_required.toFixed(6)}/π) × 1000`,
      result: `${D_round_mm.toFixed(1)} mm`,
      sansRef: 'SANS 10400-XA §4.3',
    })
  } else {
    // Rectangular duct: solve w × h = A with aspect ratio (w/h = aspectRatio)
    // h = √(A / aspectRatio), w = aspectRatio × h
    const h_m = Math.sqrt(A_required / aspectRatio)
    const w_m = aspectRatio * h_m
    height_mm = Math.ceil(h_m * 1000 / 25) * 25 // Round up to nearest 25mm
    width_mm = Math.ceil(w_m * 1000 / 25) * 25

    intermediates['width_mm'] = width_mm
    intermediates['height_mm'] = height_mm

    derivation.push({
      label: 'Rectangular duct dimensions (aspect ratio = w/h)',
      formula: 'h = √(A/AR), w = AR × h (rounded to 25mm)',
      substitution: `h = √(${A_required.toFixed(6)}/${aspectRatio}), w = ${aspectRatio}×h`,
      result: `${width_mm} × ${height_mm} mm`,
      sansRef: 'SANS 10400-XA §4.3',
    })

    // Equivalent round diameter: De = 1.3·(a·b)^0.625 / (a+b)^0.25
    const a = width_mm
    const b = height_mm
    De_mm = 1.3 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25)
    intermediates['De_mm'] = De_mm

    derivation.push({
      label: 'Equivalent round diameter',
      formula: 'De = 1.3·(a·b)^0.625 / (a+b)^0.25',
      substitution: `De = 1.3×(${a}×${b})^0.625 / (${a}+${b})^0.25`,
      result: `${De_mm.toFixed(1)} mm`,
      sansRef: 'ASHRAE Fundamentals',
    })

    // Also compute equivalent round for reference
    D_round_mm = Math.sqrt((4 * A_required) / Math.PI) * 1000
    intermediates['D_round_mm'] = D_round_mm
  }

  // Actual velocity with selected duct size
  let actualArea_m2: number
  if (ductShape === 'round') {
    // Round up to nearest 25mm for standard size
    const D_standard = Math.ceil(D_round_mm / 25) * 25
    intermediates['D_standard_mm'] = D_standard
    actualArea_m2 = Math.PI * Math.pow(D_standard / 1000, 2) / 4
  } else {
    actualArea_m2 = (width_mm / 1000) * (height_mm / 1000)
  }

  const actualVelocity = Q_m3s / actualArea_m2
  intermediates['actualVelocity'] = actualVelocity

  derivation.push({
    label: 'Actual air velocity in duct',
    formula: 'v_actual = Q / A_actual',
    substitution: `v_actual = ${Q_m3s.toFixed(4)} / ${actualArea_m2.toFixed(6)}`,
    result: `${actualVelocity.toFixed(2)} m/s`,
    sansRef: 'SANS 10400-XA §4.3',
  })

  // Utilisation: actual velocity / max velocity
  const utilisationRatio = actualVelocity / maxVelocity
  const status = statusFromRatio(utilisationRatio)

  const results: CalculatorOutput['results'] = {
    requiredArea: { value: Number((A_required * 1e6).toFixed(0)), unit: 'mm²' },
    actualVelocity: { value: Number(actualVelocity.toFixed(2)), unit: 'm/s' },
  }

  if (ductShape === 'round') {
    const D_standard = Math.ceil(D_round_mm / 25) * 25
    results['roundDiameter'] = { value: D_standard, unit: 'mm' }
  } else {
    results['ductWidth'] = { value: width_mm, unit: 'mm' }
    results['ductHeight'] = { value: height_mm, unit: 'mm' }
    results['equivalentRoundDiameter'] = { value: Number(De_mm.toFixed(1)), unit: 'mm' }
  }

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results,
    derivation,
    sansReferences: ['SANS 10400-XA §4.3', 'ASHRAE Fundamentals'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 2. Chilled Water Pipe Sizing Calculator
// ---------------------------------------------------------------------------

export function computeChilledWaterPipe(input: ChilledWaterPipeInput): CalculatorOutput {
  const { coolingLoad, deltaT, maxVelocity } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Flow rate: Q_flow = Load / (4.18 × ΔT) (L/s)
  // coolingLoad in kW, 4.18 kJ/(kg·K), water density ~1 kg/L
  const Q_flow = coolingLoad / (4.18 * deltaT)
  intermediates['Q_flow_Ls'] = Q_flow
  derivation.push({
    label: 'Required water flow rate',
    formula: 'Q_flow = Load / (4.18 × ΔT)',
    substitution: `Q_flow = ${coolingLoad} / (4.18 × ${deltaT})`,
    result: `${Q_flow.toFixed(3)} L/s`,
    sansRef: 'CIBSE Guide B §4',
  })

  // Convert to m³/s for pipe sizing
  const Q_m3s = Q_flow / 1000
  intermediates['Q_m3s'] = Q_m3s

  // Required pipe area: A = Q_flow / (v × 1000)
  // Q_flow in L/s, v in m/s → A in m²: A = (Q_flow/1000) / v
  const A_required = Q_m3s / maxVelocity
  intermediates['A_required'] = A_required
  derivation.push({
    label: 'Required pipe cross-sectional area',
    formula: 'A = Q_flow / (v × 1000)',
    substitution: `A = ${Q_flow.toFixed(3)} / (${maxVelocity} × 1000)`,
    result: `${(A_required * 1e6).toFixed(1)} mm²`,
    sansRef: 'CIBSE Guide B §4',
  })

  // Required pipe diameter: D = √(4A/π) × 1000
  const D_required = Math.sqrt((4 * A_required) / Math.PI) * 1000
  intermediates['D_required_mm'] = D_required

  derivation.push({
    label: 'Required pipe internal diameter',
    formula: 'D = √(4A/π) × 1000',
    substitution: `D = √(4×${A_required.toFixed(8)}/π) × 1000`,
    result: `${D_required.toFixed(1)} mm`,
    sansRef: 'CIBSE Guide B §4',
  })

  // Select next standard pipe size
  const standardPipeSizes = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300]
  const selectedPipe = standardPipeSizes.find(s => s >= D_required) ?? standardPipeSizes[standardPipeSizes.length - 1]
  intermediates['selectedPipe_mm'] = selectedPipe

  derivation.push({
    label: 'Selected standard pipe size',
    formula: 'Next standard size ≥ D_required',
    substitution: `Standard sizes: ${standardPipeSizes.join(', ')} mm`,
    result: `${selectedPipe} mm`,
    sansRef: 'CIBSE Guide B §4',
  })

  // Actual velocity with selected pipe
  const actualArea = Math.PI * Math.pow(selectedPipe / 1000, 2) / 4
  const actualVelocity = Q_m3s / actualArea
  intermediates['actualVelocity'] = actualVelocity

  derivation.push({
    label: 'Actual water velocity in pipe',
    formula: 'v_actual = Q / A_pipe',
    substitution: `v_actual = ${Q_m3s.toFixed(6)} / ${actualArea.toFixed(6)}`,
    result: `${actualVelocity.toFixed(2)} m/s`,
    sansRef: 'CIBSE Guide B §4',
  })

  // Utilisation: actual velocity / max velocity
  const utilisationRatio = actualVelocity / maxVelocity
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      flowRate: { value: Number(Q_flow.toFixed(3)), unit: 'L/s' },
      requiredDiameter: { value: Number(D_required.toFixed(1)), unit: 'mm' },
      selectedPipeSize: { value: selectedPipe, unit: 'mm' },
      actualVelocity: { value: Number(actualVelocity.toFixed(2)), unit: 'm/s' },
    },
    derivation,
    sansReferences: ['CIBSE Guide B §4', 'SANS 10252-1 §5'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 3. Fan Selection Calculator
// ---------------------------------------------------------------------------

export function computeFanSelection(input: FanSelectionInput): CalculatorOutput {
  const { airflowRate, systemResistance, fanEfficiency } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  // Convert airflow from L/s to m³/s
  const Q_m3s = airflowRate / 1000
  intermediates['Q_m3s'] = Q_m3s
  derivation.push({
    label: 'Convert airflow to m³/s',
    formula: 'Q = airflow / 1000',
    substitution: `Q = ${airflowRate} / 1000`,
    result: `${Q_m3s.toFixed(4)} m³/s`,
    sansRef: 'SANS 10400-XA §4.3',
  })

  // Fan power: P = Q × Δp / η (W)
  const fanPower_W = (Q_m3s * systemResistance) / fanEfficiency
  intermediates['fanPower_W'] = fanPower_W
  derivation.push({
    label: 'Fan absorbed power',
    formula: 'P = Q × Δp / η',
    substitution: `P = ${Q_m3s.toFixed(4)} × ${systemResistance} / ${fanEfficiency}`,
    result: `${fanPower_W.toFixed(1)} W`,
    sansRef: 'CIBSE Guide B §3',
  })

  // Convert to kW
  const fanPower_kW = fanPower_W / 1000
  intermediates['fanPower_kW'] = fanPower_kW
  derivation.push({
    label: 'Fan power in kW',
    formula: 'P_kW = P_W / 1000',
    substitution: `P_kW = ${fanPower_W.toFixed(1)} / 1000`,
    result: `${fanPower_kW.toFixed(3)} kW`,
    sansRef: 'CIBSE Guide B §3',
  })

  // Motor size including drive losses (assume 90% drive efficiency)
  const driveEfficiency = 0.9
  const motorPower_kW = fanPower_kW / driveEfficiency
  intermediates['motorPower_kW'] = motorPower_kW
  derivation.push({
    label: 'Motor power (including drive losses, η_drive = 0.9)',
    formula: 'P_motor = P_fan / η_drive',
    substitution: `P_motor = ${fanPower_kW.toFixed(3)} / ${driveEfficiency}`,
    result: `${motorPower_kW.toFixed(3)} kW`,
    sansRef: 'CIBSE Guide B §3',
  })

  // Select next standard motor size
  const standardMotors = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75]
  const selectedMotor = standardMotors.find(m => m >= motorPower_kW) ?? standardMotors[standardMotors.length - 1]
  intermediates['selectedMotor_kW'] = selectedMotor

  derivation.push({
    label: 'Selected standard motor size',
    formula: 'Next standard motor ≥ P_motor',
    substitution: `Standard sizes: 0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3.0, 4.0, 5.5, 7.5, 11, 15 ... kW`,
    result: `${selectedMotor} kW`,
    sansRef: 'CIBSE Guide B §3',
  })

  // Utilisation: motor loading = motorPower / selectedMotor
  const utilisationRatio = motorPower_kW / selectedMotor
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      airflowM3s: { value: Number(Q_m3s.toFixed(4)), unit: 'm³/s' },
      fanPower: { value: Number(fanPower_W.toFixed(1)), unit: 'W' },
      fanPowerKw: { value: Number(fanPower_kW.toFixed(3)), unit: 'kW' },
      motorPower: { value: Number(motorPower_kW.toFixed(3)), unit: 'kW' },
      selectedMotorSize: { value: selectedMotor, unit: 'kW' },
    },
    derivation,
    sansReferences: ['SANS 10400-XA §4.3', 'CIBSE Guide B §3'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 4. Heat Gain Calculator
// ---------------------------------------------------------------------------

export function computeHeatGain(input: HeatGainInput): CalculatorOutput {
  const {
    wallArea, roofArea, glazingArea,
    wallUValue, roofUValue, glazingUValue,
    outdoorTemp, indoorTemp,
    occupants, lightingWatts, equipmentWatts,
  } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const deltaT = outdoorTemp - indoorTemp
  intermediates['deltaT'] = deltaT
  derivation.push({
    label: 'Temperature differential',
    formula: 'ΔT = T_outdoor - T_indoor',
    substitution: `ΔT = ${outdoorTemp} - ${indoorTemp}`,
    result: `${deltaT} °C`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  // Fabric heat gain: Q_wall + Q_roof + Q_glazing
  const Q_wall = wallUValue * wallArea * deltaT
  intermediates['Q_wall'] = Q_wall
  derivation.push({
    label: 'Wall heat gain',
    formula: 'Q_wall = U_wall × A_wall × ΔT',
    substitution: `Q_wall = ${wallUValue} × ${wallArea} × ${deltaT}`,
    result: `${Q_wall.toFixed(1)} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  const Q_roof = roofUValue * roofArea * deltaT
  intermediates['Q_roof'] = Q_roof
  derivation.push({
    label: 'Roof heat gain',
    formula: 'Q_roof = U_roof × A_roof × ΔT',
    substitution: `Q_roof = ${roofUValue} × ${roofArea} × ${deltaT}`,
    result: `${Q_roof.toFixed(1)} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  const Q_glazing = glazingUValue * glazingArea * deltaT
  intermediates['Q_glazing'] = Q_glazing
  derivation.push({
    label: 'Glazing heat gain',
    formula: 'Q_glazing = U_glazing × A_glazing × ΔT',
    substitution: `Q_glazing = ${glazingUValue} × ${glazingArea} × ${deltaT}`,
    result: `${Q_glazing.toFixed(1)} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  const Q_fabric = Q_wall + Q_roof + Q_glazing
  intermediates['Q_fabric'] = Q_fabric
  derivation.push({
    label: 'Total fabric heat gain',
    formula: 'Q_fabric = Q_wall + Q_roof + Q_glazing',
    substitution: `Q_fabric = ${Q_wall.toFixed(1)} + ${Q_roof.toFixed(1)} + ${Q_glazing.toFixed(1)}`,
    result: `${Q_fabric.toFixed(1)} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  // Internal gains
  const OCCUPANT_SENSIBLE_W = 90 // 90W sensible per person
  const Q_occupants = occupants * OCCUPANT_SENSIBLE_W
  intermediates['Q_occupants'] = Q_occupants
  derivation.push({
    label: 'Occupant sensible heat gain',
    formula: 'Q_occ = occupants × 90 W/person',
    substitution: `Q_occ = ${occupants} × ${OCCUPANT_SENSIBLE_W}`,
    result: `${Q_occupants} W`,
    sansRef: 'ASHRAE Fundamentals Ch.18',
  })

  intermediates['Q_lighting'] = lightingWatts
  derivation.push({
    label: 'Lighting heat gain',
    formula: 'Q_lights = installed lighting power',
    substitution: `Q_lights = ${lightingWatts}`,
    result: `${lightingWatts} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  intermediates['Q_equipment'] = equipmentWatts
  derivation.push({
    label: 'Equipment heat gain',
    formula: 'Q_equip = installed equipment power',
    substitution: `Q_equip = ${equipmentWatts}`,
    result: `${equipmentWatts} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  const Q_internal = Q_occupants + lightingWatts + equipmentWatts
  intermediates['Q_internal'] = Q_internal
  derivation.push({
    label: 'Total internal gains',
    formula: 'Q_internal = Q_occ + Q_lights + Q_equip',
    substitution: `Q_internal = ${Q_occupants} + ${lightingWatts} + ${equipmentWatts}`,
    result: `${Q_internal} W`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  // Total cooling load
  const Q_total_W = Q_fabric + Q_internal
  const Q_total_kW = Q_total_W / 1000
  intermediates['Q_total_W'] = Q_total_W
  intermediates['Q_total_kW'] = Q_total_kW
  derivation.push({
    label: 'Total sensible cooling load',
    formula: 'Q_total = Q_fabric + Q_internal',
    substitution: `Q_total = ${Q_fabric.toFixed(1)} + ${Q_internal}`,
    result: `${Q_total_W.toFixed(1)} W (${Q_total_kW.toFixed(2)} kW)`,
    sansRef: 'SANS 10400-XA §4.4',
  })

  // Utilisation: ratio of fabric gain to internal gain as indicator
  // For heat gain, utilisation is informational — always pass (it's a sizing calc)
  // We use a nominal utilisation based on total load / typical design limit (50 W/m² × total area)
  const totalArea = wallArea + roofArea + glazingArea
  const nominalLimit = totalArea > 0 ? 50 * totalArea : Q_total_W
  const utilisationRatio = totalArea > 0 ? Q_total_W / nominalLimit : 0.5
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      fabricHeatGain: { value: Number(Q_fabric.toFixed(1)), unit: 'W' },
      internalHeatGain: { value: Number(Q_internal.toFixed(0)), unit: 'W' },
      totalCoolingLoad_W: { value: Number(Q_total_W.toFixed(1)), unit: 'W' },
      totalCoolingLoad_kW: { value: Number(Q_total_kW.toFixed(2)), unit: 'kW' },
    },
    derivation,
    sansReferences: ['SANS 10400-XA §4.4', 'ASHRAE Fundamentals Ch.18'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// 5. Heat Loss Calculator
// ---------------------------------------------------------------------------

export function computeHeatLoss(input: HeatLossInput): CalculatorOutput {
  const { elements, ventilationRate, indoorTemp, outdoorTemp, volume } = input

  const derivation: DerivationStep[] = []
  const intermediates: Record<string, number> = {}

  const deltaT = indoorTemp - outdoorTemp
  intermediates['deltaT'] = deltaT
  derivation.push({
    label: 'Temperature differential',
    formula: 'ΔT = T_indoor - T_outdoor',
    substitution: `ΔT = ${indoorTemp} - ${outdoorTemp}`,
    result: `${deltaT} °C`,
    sansRef: 'SANS 10400-XA §4.5',
  })

  // Fabric heat loss: Q_fabric = Σ(U × A × ΔT)
  let Q_fabric = 0
  const elementSteps: string[] = []
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i]
    const q_el = el.uValue * el.area * deltaT
    Q_fabric += q_el
    intermediates[`Q_element_${i}`] = q_el
    elementSteps.push(`${el.uValue}×${el.area}×${deltaT}=${q_el.toFixed(1)}`)
  }
  intermediates['Q_fabric'] = Q_fabric

  derivation.push({
    label: 'Fabric heat loss (Σ U·A·ΔT)',
    formula: 'Q_fabric = Σ(U_i × A_i × ΔT)',
    substitution: elementSteps.join(' + '),
    result: `${Q_fabric.toFixed(1)} W`,
    sansRef: 'SANS 10400-XA §4.5',
  })

  // Ventilation heat loss: Q_vent = ρ·Cp·Q_air·ΔT
  // ρ·Cp for air ≈ 1.2 × 1005 / 1000 = 1.2 kJ/(m³·K) ≈ 1.2 W/(L/s·K) simplified
  // Or equivalently: Q_vent = 0.33 × n × V × ΔT for air changes method
  // Using ventilation rate directly: Q_vent = ventilationRate(L/s) × 1.2 × ΔT (W)
  // Factor: 1 L/s of outdoor air carries 1.2 W per K temperature difference
  const ventFactor = 1.2 // W per (L/s·K)
  const Q_vent = ventilationRate * ventFactor * deltaT
  intermediates['Q_vent'] = Q_vent
  derivation.push({
    label: 'Ventilation heat loss',
    formula: 'Q_vent = Q_air × 1.2 × ΔT',
    substitution: `Q_vent = ${ventilationRate} × ${ventFactor} × ${deltaT}`,
    result: `${Q_vent.toFixed(1)} W`,
    sansRef: 'SANS 10400-XA §4.5',
  })

  // Also compute air changes per hour for reference
  // n = (ventilationRate × 3.6) / volume  (ACH)
  const airChanges = (ventilationRate * 3.6) / volume
  intermediates['airChanges'] = airChanges
  derivation.push({
    label: 'Air changes per hour',
    formula: 'n = (Q_air × 3.6) / V',
    substitution: `n = (${ventilationRate} × 3.6) / ${volume}`,
    result: `${airChanges.toFixed(2)} ACH`,
    sansRef: 'SANS 10400-XA §4.5',
  })

  // Total heating load
  const Q_total_W = Q_fabric + Q_vent
  const Q_total_kW = Q_total_W / 1000
  intermediates['Q_total_W'] = Q_total_W
  intermediates['Q_total_kW'] = Q_total_kW
  derivation.push({
    label: 'Total heating load',
    formula: 'Q_total = Q_fabric + Q_vent',
    substitution: `Q_total = ${Q_fabric.toFixed(1)} + ${Q_vent.toFixed(1)}`,
    result: `${Q_total_W.toFixed(1)} W (${Q_total_kW.toFixed(2)} kW)`,
    sansRef: 'SANS 10400-XA §4.5',
  })

  // Utilisation: heat load per unit volume (W/m³) as informational ratio
  // Typical limit ~25 W/m³ for well-insulated buildings
  const heatLoadPerVolume = Q_total_W / volume
  const nominalLimit = 25 // W/m³ typical design benchmark
  const utilisationRatio = heatLoadPerVolume / nominalLimit
  intermediates['heatLoadPerVolume'] = heatLoadPerVolume
  const status = statusFromRatio(utilisationRatio)

  return {
    status,
    utilisationRatio: Number(utilisationRatio.toFixed(3)),
    results: {
      fabricHeatLoss: { value: Number(Q_fabric.toFixed(1)), unit: 'W' },
      ventilationHeatLoss: { value: Number(Q_vent.toFixed(1)), unit: 'W' },
      totalHeatingLoad_W: { value: Number(Q_total_W.toFixed(1)), unit: 'W' },
      totalHeatingLoad_kW: { value: Number(Q_total_kW.toFixed(2)), unit: 'kW' },
      airChangesPerHour: { value: Number(airChanges.toFixed(2)), unit: 'ACH' },
      heatLoadPerVolume: { value: Number(heatLoadPerVolume.toFixed(1)), unit: 'W/m³' },
    },
    derivation,
    sansReferences: ['SANS 10400-XA §4.5'],
    intermediates,
  }
}

// ---------------------------------------------------------------------------
// Calculator Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'hvac-duct-sizing',
    title: 'Duct Sizing (Round / Rectangular)',
    discipline: 'mechanical-duct',
    sansRef: 'SANS 10400-XA',
    description: 'Size round or rectangular ducts for given airflow and velocity limit, with equivalent diameter',
  },
  inputSchema: ductSizingInputSchema,
  defaults: DUCT_SIZING_DEFAULTS,
  compute: computeDuctSizing,
})

registerCalculator({
  meta: {
    id: 'hvac-chilled-water-pipe',
    title: 'Chilled Water Pipe Sizing',
    discipline: 'mechanical-duct',
    sansRef: 'CIBSE Guide B',
    description: 'Size chilled water pipes for cooling load and temperature differential',
  },
  inputSchema: chilledWaterPipeInputSchema,
  defaults: CHILLED_WATER_PIPE_DEFAULTS,
  compute: computeChilledWaterPipe,
})

registerCalculator({
  meta: {
    id: 'hvac-fan-selection',
    title: 'Fan Selection',
    discipline: 'mechanical-duct',
    sansRef: 'CIBSE Guide B',
    description: 'Fan power calculation (P = Q·Δp/η) with motor sizing and drive losses',
  },
  inputSchema: fanSelectionInputSchema,
  defaults: FAN_SELECTION_DEFAULTS,
  compute: computeFanSelection,
})

registerCalculator({
  meta: {
    id: 'hvac-heat-gain',
    title: 'Heat Gain Calculation',
    discipline: 'mechanical-heating',
    sansRef: 'SANS 10400-XA',
    description: 'Sensible heat gain from fabric (walls/roof/glazing) and internal gains (occupants/lights/equipment)',
  },
  inputSchema: heatGainInputSchema,
  defaults: HEAT_GAIN_DEFAULTS,
  compute: computeHeatGain,
})

registerCalculator({
  meta: {
    id: 'hvac-heat-loss',
    title: 'Heat Loss Calculation',
    discipline: 'mechanical-heating',
    sansRef: 'SANS 10400-XA',
    description: 'Fabric heat loss (ΣU·A·ΔT) and ventilation heat loss for heating load determination',
  },
  inputSchema: heatLossInputSchema,
  defaults: HEAT_LOSS_DEFAULTS,
  compute: computeHeatLoss,
})
