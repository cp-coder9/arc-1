// Engineer's Calculation Hub — Concrete Design Engines
//
// Pure compute functions for structural concrete design per SANS 10100-1.
// Calculators: Beam, Slab, Column, Anchorage/Lap, Crack Width, Minimum Reinforcement.
//
// Requirements: 3.1–3.4, 9.1–9.6

import type { CalculatorOutput, DerivationStep } from '../types';
import { registerCalculator } from '../calcHubRegistry';
import {
  concreteBeamInputSchema,
  CONCRETE_BEAM_DEFAULTS,
  concreteSlabInputSchema,
  CONCRETE_SLAB_DEFAULTS,
  concreteColumnInputSchema,
  CONCRETE_COLUMN_DEFAULTS,
  concreteAnchorageInputSchema,
  CONCRETE_ANCHORAGE_DEFAULTS,
  concreteCrackWidthInputSchema,
  CONCRETE_CRACK_WIDTH_DEFAULTS,
  concreteMinRebarInputSchema,
  CONCRETE_MIN_REBAR_DEFAULTS,
} from '../schemas/concreteDesign';
import type {
  ConcreteBeamInput,
  ConcreteSlabInput,
  ConcreteColumnInput,
  ConcreteAnchorageInput,
  ConcreteCrackWidthInput,
  ConcreteMinRebarInput,
} from '../schemas/concreteDesign';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusFromRatio(ratio: number): 'pass' | 'warning' | 'fail' {
  if (ratio > 1.0) return 'fail';
  if (ratio >= 0.9) return 'warning';
  return 'pass';
}

function fmt(v: number, dp = 2): string {
  return v.toFixed(dp);
}

// ---------------------------------------------------------------------------
// 1. Concrete Beam Design (SANS 10100-1 §4.3.3)
// ---------------------------------------------------------------------------

export function computeConcreteBeam(input: ConcreteBeamInput): CalculatorOutput {
  const { b, h, d, As, span, appliedMoment } = input;
  const fy = Number(input.fy);
  const fcu = Number(input.fcu);

  const derivation: DerivationStep[] = [];
  const sansReferences: string[] = ['SANS 10100-1 §4.3.3'];

  // K factor
  const Mu = appliedMoment; // kNm (applied)
  const K = (Mu * 1e6) / (b * d * d * fcu);
  derivation.push({
    label: 'K factor',
    formula: 'K = Mu / (b · d² · fcu)',
    substitution: `${fmt(Mu * 1e6, 0)} / (${b} × ${d}² × ${fcu})`,
    result: fmt(K, 4),
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Lever arm z
  const zCalc = d * (0.5 + Math.sqrt(0.25 - K / 0.9));
  const zMax = 0.95 * d;
  const z = Math.min(zCalc, zMax);
  derivation.push({
    label: 'Lever arm',
    formula: 'z = d · (0.5 + √(0.25 - K/0.9)), max 0.95d',
    substitution: `${d} × (0.5 + √(0.25 - ${fmt(K, 4)}/0.9)) = ${fmt(zCalc, 1)}, max ${fmt(zMax, 1)}`,
    result: `${fmt(z, 1)} mm`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Neutral axis depth
  const x = (d - z) / 0.45;
  derivation.push({
    label: 'Neutral axis depth',
    formula: 'x = (d - z) / 0.45',
    substitution: `(${d} - ${fmt(z, 1)}) / 0.45`,
    result: `${fmt(x, 1)} mm`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Ultimate moment capacity
  const MuCapacity = (0.87 * fy * As * z) / 1e6; // kNm
  derivation.push({
    label: 'Ultimate moment capacity',
    formula: 'Mu = 0.87 · fy · As · z',
    substitution: `0.87 × ${fy} × ${As} × ${fmt(z, 1)} / 1e6`,
    result: `${fmt(MuCapacity, 2)} kNm`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Required As
  const AsReq = (Mu * 1e6) / (0.87 * fy * z);
  derivation.push({
    label: 'Required reinforcement area',
    formula: 'As_req = Mu / (0.87 · fy · z)',
    substitution: `${fmt(Mu * 1e6, 0)} / (0.87 × ${fy} × ${fmt(z, 1)})`,
    result: `${fmt(AsReq, 0)} mm²`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Shear capacity (simplified)
  const vc = 0.79 * Math.pow((100 * As) / (b * d), 1 / 3) * Math.pow(400 / d, 0.25) / 1.25;
  const Vc = vc * b * d / 1000; // kN
  derivation.push({
    label: 'Shear capacity',
    formula: 'vc = 0.79·(100As/(bd))^(1/3)·(400/d)^0.25 / γm; Vc = vc·b·d',
    substitution: `vc = ${fmt(vc, 3)} N/mm²; Vc = ${fmt(vc, 3)} × ${b} × ${d} / 1000`,
    result: `${fmt(Vc, 1)} kN`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Utilisation ratio
  const ratio = Mu / MuCapacity;

  return {
    status: statusFromRatio(ratio),
    utilisationRatio: ratio,
    results: {
      'Moment Capacity (Mu)': { value: Number(fmt(MuCapacity, 2)), unit: 'kNm' },
      'Required As': { value: Number(fmt(AsReq, 0)), unit: 'mm²' },
      'Lever Arm (z)': { value: Number(fmt(z, 1)), unit: 'mm' },
      'Neutral Axis (x)': { value: Number(fmt(x, 1)), unit: 'mm' },
      'Shear Capacity (Vc)': { value: Number(fmt(Vc, 1)), unit: 'kN' },
    },
    derivation,
    sansReferences,
    intermediates: { K, z, x, MuCapacity, AsReq, Vc, vc, ratio },
  };
}

// ---------------------------------------------------------------------------
// 2. Slab Design (SANS 10100-1)
// ---------------------------------------------------------------------------

export function computeConcreteSlab(input: ConcreteSlabInput): CalculatorOutput {
  const { spanType, lx, h, imposedLoad, permanentLoad } = input;
  const ly = input.ly ?? lx;
  const fy = Number(input.fy);
  const fcu = Number(input.fcu);

  const derivation: DerivationStep[] = [];
  const sansReferences: string[] = ['SANS 10100-1 §3.5'];

  // Effective depth (assume 25mm cover + 10mm bar)
  const d = h - 25 - 5; // mm
  const b = 1000; // per metre width

  // Ultimate load
  const wu = 1.2 * permanentLoad + 1.6 * imposedLoad; // kN/m²
  derivation.push({
    label: 'Ultimate load',
    formula: 'wu = 1.2·Gk + 1.6·Qk',
    substitution: `1.2 × ${permanentLoad} + 1.6 × ${imposedLoad}`,
    result: `${fmt(wu, 2)} kN/m²`,
    sansRef: 'SANS 10100-1 §3.5',
  });

  // Moment coefficient
  let coefficient: number;
  if (spanType === 'one-way') {
    coefficient = 0.125; // wl²/8 for simply supported
  } else {
    // Two-way: simplified short-span coefficient based on ratio
    const ratio = ly / lx;
    coefficient = ratio >= 2 ? 0.125 : 0.062 + 0.032 * (ratio - 1);
  }

  // Design moment
  const moment = coefficient * wu * lx * lx; // kNm/m
  derivation.push({
    label: 'Design moment',
    formula: 'M = α · wu · lx²',
    substitution: `${fmt(coefficient, 4)} × ${fmt(wu, 2)} × ${lx}²`,
    result: `${fmt(moment, 2)} kNm/m`,
    sansRef: 'SANS 10100-1 §3.5',
  });

  // K factor
  const K = (moment * 1e6) / (b * d * d * fcu);
  derivation.push({
    label: 'K factor',
    formula: 'K = M / (b · d² · fcu)',
    substitution: `${fmt(moment * 1e6, 0)} / (${b} × ${d}² × ${fcu})`,
    result: fmt(K, 4),
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Lever arm
  const zCalc = d * (0.5 + Math.sqrt(0.25 - K / 0.9));
  const zMax = 0.95 * d;
  const z = Math.min(zCalc, zMax);
  derivation.push({
    label: 'Lever arm',
    formula: 'z = d · (0.5 + √(0.25 - K/0.9)), max 0.95d',
    substitution: `${d} × (0.5 + √(0.25 - ${fmt(K, 4)}/0.9))`,
    result: `${fmt(z, 1)} mm`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Required reinforcement
  const AsReq = (moment * 1e6) / (0.87 * fy * z); // mm²/m
  derivation.push({
    label: 'Required reinforcement',
    formula: 'As_req = M / (0.87 · fy · z)',
    substitution: `${fmt(moment * 1e6, 0)} / (0.87 × ${fy} × ${fmt(z, 1)})`,
    result: `${fmt(AsReq, 0)} mm²/m`,
    sansRef: 'SANS 10100-1 §4.3.3',
  });

  // Minimum reinforcement
  const AsMin = 0.0013 * b * h; // 0.13% for fy=450
  derivation.push({
    label: 'Minimum reinforcement',
    formula: 'As_min = 0.13% · b · h',
    substitution: `0.0013 × ${b} × ${h}`,
    result: `${fmt(AsMin, 0)} mm²/m`,
    sansRef: 'SANS 10100-1 Table 13',
  });

  // Deflection check: span/effective depth ratio
  const spanDepthActual = (lx * 1000) / d;
  const spanDepthLimit = spanType === 'one-way' ? 20 : 26; // simply supported / continuous approx
  const deflectionRatio = spanDepthActual / spanDepthLimit;
  derivation.push({
    label: 'Deflection check (span/d)',
    formula: 'Actual span/d ≤ Allowable span/d',
    substitution: `${fmt(spanDepthActual, 1)} ≤ ${spanDepthLimit}`,
    result: deflectionRatio <= 1.0 ? 'OK' : 'EXCEEDS',
    sansRef: 'SANS 10100-1 §3.4.6',
  });

  // Utilisation: use max of moment ratio and deflection ratio
  const AsProvided = Math.max(AsReq, AsMin);
  const ratio = Math.max(AsReq / AsProvided, deflectionRatio);

  sansReferences.push('SANS 10100-1 §4.3.3', 'SANS 10100-1 Table 13', 'SANS 10100-1 §3.4.6');

  return {
    status: statusFromRatio(ratio),
    utilisationRatio: ratio,
    results: {
      'Design Moment': { value: Number(fmt(moment, 2)), unit: 'kNm/m' },
      'Required As': { value: Number(fmt(AsReq, 0)), unit: 'mm²/m' },
      'Min As': { value: Number(fmt(AsMin, 0)), unit: 'mm²/m' },
      'Span/d Actual': { value: Number(fmt(spanDepthActual, 1)), unit: '' },
      'Span/d Limit': { value: spanDepthLimit, unit: '' },
    },
    derivation,
    sansReferences,
    intermediates: { wu, coefficient, moment, K, z, AsReq, AsMin, spanDepthActual, deflectionRatio },
  };
}

// ---------------------------------------------------------------------------
// 3. Column Design (SANS 10100-1 §4.7)
// ---------------------------------------------------------------------------

export function computeConcreteColumn(input: ConcreteColumnInput): CalculatorOutput {
  const { b, h, length, axialLoad, moment } = input;
  const fcu = Number(input.fcu);
  const fy = Number(input.fy);
  const kFactor = Number(input.effectiveLengthFactor);

  const derivation: DerivationStep[] = [];
  const sansReferences: string[] = ['SANS 10100-1 §4.7'];

  // Effective length
  const le = kFactor * length * 1000; // mm
  derivation.push({
    label: 'Effective length',
    formula: 'le = k · L',
    substitution: `${kFactor} × ${length} × 1000`,
    result: `${fmt(le, 0)} mm`,
    sansRef: 'SANS 10100-1 §4.7',
  });

  // Short/slender classification: le/h or le/b
  const slendernessH = le / h;
  const slendernessB = le / b;
  const slenderness = Math.max(slendernessH, slendernessB);
  const classification = slenderness <= 15 ? 'Short' : 'Slender';
  derivation.push({
    label: 'Slenderness classification',
    formula: 'le/h ≤ 15 → Short, else Slender',
    substitution: `le/h = ${fmt(le, 0)}/${h} = ${fmt(slendernessH, 1)}, le/b = ${fmt(le, 0)}/${b} = ${fmt(slendernessB, 1)}`,
    result: `${classification} (max ratio = ${fmt(slenderness, 1)})`,
    sansRef: 'SANS 10100-1 §4.7',
  });

  // Axial capacity (short column)
  const Nuz = 0.45 * fcu * b * h / 1000 + 0.87 * fy * 0.004 * b * h / 1000; // kN (with min 0.4% steel)
  derivation.push({
    label: 'Axial capacity (short, min steel)',
    formula: 'Nuz = 0.45·fcu·b·h + 0.87·fy·As (As=0.4%bh)',
    substitution: `0.45 × ${fcu} × ${b} × ${h}/1000 + 0.87 × ${fy} × ${fmt(0.004 * b * h, 0)}/1000`,
    result: `${fmt(Nuz, 1)} kN`,
    sansRef: 'SANS 10100-1 §4.7',
  });

  // Simplified interaction check: N/(0.45·fcu·b·h) + M/(0.45·fcu·b·h²) ≤ 1.0
  const axialTerm = (axialLoad * 1000) / (0.45 * fcu * b * h);
  const momentTerm = (moment * 1e6) / (0.45 * fcu * b * h * h);
  const interaction = axialTerm + momentTerm;
  derivation.push({
    label: 'Axial + Moment interaction',
    formula: 'N/(0.45·fcu·b·h) + M/(0.45·fcu·b·h²) ≤ 1.0',
    substitution: `${fmt(axialLoad * 1000, 0)}/(0.45×${fcu}×${b}×${h}) + ${fmt(moment * 1e6, 0)}/(0.45×${fcu}×${b}×${h}²)`,
    result: `${fmt(axialTerm, 3)} + ${fmt(momentTerm, 3)} = ${fmt(interaction, 3)}`,
    sansRef: 'SANS 10100-1 §4.7',
  });

  // Additional moment for slender columns
  let additionalMoment = 0;
  if (classification === 'Slender') {
    const au = (1 / 2000) * Math.pow(le / h, 2) * h; // mm eccentricity
    additionalMoment = axialLoad * au / 1000; // kNm
    derivation.push({
      label: 'Additional moment (slender)',
      formula: 'Madd = N · au, au = (1/2000)·(le/h)²·h',
      substitution: `au = (1/2000)×(${fmt(le, 0)}/${h})²×${h} = ${fmt(au, 1)}mm; Madd = ${axialLoad}×${fmt(au, 1)}/1000`,
      result: `${fmt(additionalMoment, 2)} kNm`,
      sansRef: 'SANS 10100-1 §4.7',
    });
  }

  const totalMoment = moment + additionalMoment;
  const interactionTotal = (axialLoad * 1000) / (0.45 * fcu * b * h) + (totalMoment * 1e6) / (0.45 * fcu * b * h * h);
  const ratio = interactionTotal;

  return {
    status: statusFromRatio(ratio),
    utilisationRatio: ratio,
    results: {
      'Classification': { value: classification, unit: '' },
      'Slenderness Ratio': { value: Number(fmt(slenderness, 1)), unit: '' },
      'Axial Capacity (Nuz)': { value: Number(fmt(Nuz, 1)), unit: 'kN' },
      'Interaction Check': { value: Number(fmt(interactionTotal, 3)), unit: '≤ 1.0' },
      'Additional Moment': { value: Number(fmt(additionalMoment, 2)), unit: 'kNm' },
    },
    derivation,
    sansReferences,
    intermediates: { le, slenderness, Nuz, axialTerm, momentTerm, interaction, additionalMoment, totalMoment, interactionTotal },
  };
}

// ---------------------------------------------------------------------------
// 4. Anchorage and Lap Length (SANS 10100-1 §5.8)
// ---------------------------------------------------------------------------

export function computeConcreteAnchorage(input: ConcreteAnchorageInput): CalculatorOutput {
  const { cover, barSpacing, confinement, lapType } = input;
  const phi = Number(input.barDiameter); // mm
  const fy = Number(input.fy);
  const fcu = Number(input.fcu);

  const derivation: DerivationStep[] = [];
  const sansReferences: string[] = ['SANS 10100-1 §5.8'];

  // Bond stress: fbu = β · √fcu
  const beta = lapType === 'tension' ? 0.28 : 0.35;
  const fbu = beta * Math.sqrt(fcu);
  derivation.push({
    label: 'Design bond stress',
    formula: 'fbu = β · √fcu',
    substitution: `${beta} × √${fcu}`,
    result: `${fmt(fbu, 2)} MPa`,
    sansRef: 'SANS 10100-1 §5.8',
  });

  // Basic anchorage length: lb = fy · φ / (4 · fbu)
  const lb = (fy * phi) / (4 * fbu);
  derivation.push({
    label: 'Basic anchorage length',
    formula: 'lb = fy · φ / (4 · fbu)',
    substitution: `${fy} × ${phi} / (4 × ${fmt(fbu, 2)})`,
    result: `${fmt(lb, 0)} mm`,
    sansRef: 'SANS 10100-1 §5.8',
  });

  // Modifiers
  let coverModifier = 1.0;
  if (cover < 3 * phi) {
    coverModifier = 1.4;
  } else if (cover < 2 * phi) {
    coverModifier = 1.6;
  }

  let spacingModifier = 1.0;
  if (barSpacing < 6 * phi) {
    spacingModifier = 1.15;
  }

  const confinementModifier = confinement === 'confined' ? 0.7 : 1.0;

  const totalModifier = coverModifier * spacingModifier * confinementModifier;
  derivation.push({
    label: 'Modifier factors',
    formula: 'α = αcover × αspacing × αconfinement',
    substitution: `${fmt(coverModifier, 2)} × ${fmt(spacingModifier, 2)} × ${fmt(confinementModifier, 2)}`,
    result: fmt(totalModifier, 2),
    sansRef: 'SANS 10100-1 §5.8',
  });

  // Design anchorage length
  const lbd = lb * totalModifier;
  derivation.push({
    label: 'Design anchorage length',
    formula: 'lbd = lb × α',
    substitution: `${fmt(lb, 0)} × ${fmt(totalModifier, 2)}`,
    result: `${fmt(lbd, 0)} mm`,
    sansRef: 'SANS 10100-1 §5.8',
  });

  // Lap length (tension laps = 1.4× anchorage, compression = 1.25×)
  const lapFactor = lapType === 'tension' ? 1.4 : 1.25;
  const lapLength = lbd * lapFactor;
  derivation.push({
    label: 'Lap length',
    formula: `Lap = ${fmt(lapFactor, 2)} × lbd (${lapType})`,
    substitution: `${fmt(lapFactor, 2)} × ${fmt(lbd, 0)}`,
    result: `${fmt(lapLength, 0)} mm`,
    sansRef: 'SANS 10100-1 §5.8',
  });

  // Utilisation: ratio of provided cover to minimum (informational, always pass for output)
  const minCover = phi; // minimum cover = bar diameter
  const ratio = minCover / cover; // < 1 means adequate

  return {
    status: statusFromRatio(ratio),
    utilisationRatio: ratio,
    results: {
      'Basic Anchorage Length (lb)': { value: Number(fmt(lb, 0)), unit: 'mm' },
      'Design Anchorage Length (lbd)': { value: Number(fmt(lbd, 0)), unit: 'mm' },
      'Lap Length': { value: Number(fmt(lapLength, 0)), unit: 'mm' },
      'Bond Stress (fbu)': { value: Number(fmt(fbu, 2)), unit: 'MPa' },
      'Total Modifier': { value: Number(fmt(totalModifier, 2)), unit: '' },
    },
    derivation,
    sansReferences,
    intermediates: { phi, fbu, lb, coverModifier, spacingModifier, confinementModifier, totalModifier, lbd, lapLength, ratio },
  };
}

// ---------------------------------------------------------------------------
// 5. Crack Width (SANS 10100-1 §3.8 — acr method)
// ---------------------------------------------------------------------------

export function computeConcreteCrackWidth(input: ConcreteCrackWidthInput): CalculatorOutput {
  const { b, h, d, As, barSpacing, cover, moment } = input;
  const phi = Number(input.barDiameter);
  const fcu = Number(input.fcu);
  const fy = Number(input.fy);

  const derivation: DerivationStep[] = [];
  const sansReferences: string[] = ['SANS 10100-1 §3.8'];

  // Modular ratio
  const Ec = 5.5 * Math.sqrt(fcu) * 1000; // short-term Ec in MPa (approx)
  const Es = 200000; // MPa
  const alphaE = Es / Ec;
  derivation.push({
    label: 'Modular ratio',
    formula: 'αe = Es / Ec, Ec = 5.5·√fcu (GPa)',
    substitution: `${Es} / ${fmt(Ec, 0)}`,
    result: fmt(alphaE, 2),
    sansRef: 'SANS 10100-1 §3.8',
  });

  // Neutral axis depth (cracked transformed section)
  // b·x²/2 = αe·As·(d-x)
  // b·x² + 2·αe·As·x - 2·αe·As·d = 0
  const a_coeff = b / 2;
  const b_coeff = alphaE * As;
  const c_coeff = -alphaE * As * d;
  const x = (-b_coeff + Math.sqrt(b_coeff * b_coeff - 4 * a_coeff * c_coeff)) / (2 * a_coeff);
  derivation.push({
    label: 'Neutral axis depth (cracked)',
    formula: 'b·x²/2 = αe·As·(d-x)',
    substitution: `Solving quadratic: a=${fmt(a_coeff, 1)}, b=${fmt(b_coeff, 1)}, c=${fmt(c_coeff, 0)}`,
    result: `${fmt(x, 1)} mm`,
    sansRef: 'SANS 10100-1 §3.8',
  });

  // Steel stress at service
  const Icr = (b * Math.pow(x, 3)) / 3 + alphaE * As * Math.pow(d - x, 2);
  const fs = (alphaE * moment * 1e6 * (d - x)) / Icr;
  const epsilon1 = fs / Es; // strain at steel level
  derivation.push({
    label: 'Steel stress (service)',
    formula: 'fs = αe · M · (d-x) / Icr',
    substitution: `${fmt(alphaE, 2)} × ${fmt(moment * 1e6, 0)} × (${d}-${fmt(x, 1)}) / ${fmt(Icr, 0)}`,
    result: `${fmt(fs, 1)} MPa`,
    sansRef: 'SANS 10100-1 §3.8',
  });

  // Strain at extreme tension fibre
  const epsilon_h = epsilon1 * (h - x) / (d - x);

  // Correction for tension stiffening
  const bt = b; // width at tension face
  const epsilon_m = epsilon_h - ((h - x) * (h - x) * bt) / (3 * Es * As * (d - x));
  // Ensure εm is not negative
  const epsilon_m_final = Math.max(epsilon_m, 0.5 * epsilon_h);
  derivation.push({
    label: 'Average strain (εm)',
    formula: 'εm = ε₁·(h-x)/(d-x) - correction',
    substitution: `${fmt(epsilon_h, 6)} - tension stiffening correction`,
    result: fmt(epsilon_m_final, 6),
    sansRef: 'SANS 10100-1 §3.8',
  });

  // acr: distance from crack to nearest bar
  const s = barSpacing; // mm
  const cmin = cover; // mm
  const acr = Math.sqrt(Math.pow(s / 2, 2) + Math.pow(cmin + phi / 2, 2)) - phi / 2;
  derivation.push({
    label: 'Distance to nearest bar (acr)',
    formula: 'acr = √((s/2)² + (cover+φ/2)²) - φ/2',
    substitution: `√((${s}/2)² + (${cmin}+${phi}/2)²) - ${phi}/2`,
    result: `${fmt(acr, 1)} mm`,
    sansRef: 'SANS 10100-1 §3.8',
  });

  // Crack width: w = 3·acr·εm / (1 + 2(acr - cmin)/(h - x))
  const denominator = 1 + 2 * (acr - cmin) / (h - x);
  const w = (3 * acr * epsilon_m_final) / denominator;
  derivation.push({
    label: 'Crack width',
    formula: 'w = 3·acr·εm / (1 + 2(acr-cmin)/(h-x))',
    substitution: `3 × ${fmt(acr, 1)} × ${fmt(epsilon_m_final, 6)} / (1 + 2×(${fmt(acr, 1)}-${cmin})/(${h}-${fmt(x, 1)}))`,
    result: `${fmt(w, 3)} mm`,
    sansRef: 'SANS 10100-1 §3.8',
  });

  // Allowable crack width
  const wLimit = 0.3; // mm (typical for normal exposure)
  const ratio = w / wLimit;
  derivation.push({
    label: 'Crack width check',
    formula: 'w ≤ 0.3 mm',
    substitution: `${fmt(w, 3)} ≤ ${wLimit}`,
    result: ratio <= 1.0 ? 'OK' : 'EXCEEDS',
    sansRef: 'SANS 10100-1 §3.8',
  });

  return {
    status: statusFromRatio(ratio),
    utilisationRatio: ratio,
    results: {
      'Crack Width (w)': { value: Number(fmt(w, 3)), unit: 'mm' },
      'Allowable (wlim)': { value: wLimit, unit: 'mm' },
      'Neutral Axis (x)': { value: Number(fmt(x, 1)), unit: 'mm' },
      'Steel Stress (fs)': { value: Number(fmt(fs, 1)), unit: 'MPa' },
      'acr': { value: Number(fmt(acr, 1)), unit: 'mm' },
    },
    derivation,
    sansReferences,
    intermediates: { alphaE, x, Icr, fs, epsilon1, epsilon_h, epsilon_m_final, acr, w, ratio },
  };
}

// ---------------------------------------------------------------------------
// 6. Minimum Reinforcement (SANS 10100-1 Table 13)
// ---------------------------------------------------------------------------

export function computeConcreteMinRebar(input: ConcreteMinRebarInput): CalculatorOutput {
  const { sectionType, b, h } = input;
  const fy = Number(input.fy);
  const fcu = Number(input.fcu);

  const derivation: DerivationStep[] = [];
  const sansReferences: string[] = ['SANS 10100-1 Table 13'];

  // Minimum percentage based on fy
  let minPercent: number;
  if (fy <= 250) {
    minPercent = 0.24;
  } else if (fy <= 450) {
    minPercent = 0.13;
  } else {
    minPercent = 0.13; // fy=500 same as 450
  }

  // Section-type-specific rules
  let AsMin: number;
  let description: string;

  switch (sectionType) {
    case 'beam':
      AsMin = (minPercent / 100) * b * h;
      description = `${minPercent}% × b × h (tension face)`;
      break;
    case 'slab':
      AsMin = (minPercent / 100) * 1000 * h; // per metre width
      description = `${minPercent}% × 1000 × h (per metre)`;
      break;
    case 'column':
      // Column minimum is 0.4% per SANS 10100-1
      AsMin = 0.004 * b * h;
      description = '0.4% × b × h (column)';
      minPercent = 0.4;
      break;
  }

  derivation.push({
    label: 'Minimum reinforcement percentage',
    formula: `As_min = ${description}`,
    substitution: sectionType === 'slab'
      ? `${minPercent}/100 × 1000 × ${h}`
      : `${minPercent}/100 × ${b} × ${h}`,
    result: `${fmt(AsMin!, 0)} mm²`,
    sansRef: 'SANS 10100-1 Table 13',
  });

  // Maximum reinforcement
  let AsMax: number;
  if (sectionType === 'column') {
    AsMax = 0.06 * b * h; // 6% for columns
  } else {
    AsMax = 0.04 * b * h; // 4% for beams/slabs
  }

  derivation.push({
    label: 'Maximum reinforcement',
    formula: sectionType === 'column' ? 'As_max = 6% × b × h' : 'As_max = 4% × b × h',
    substitution: sectionType === 'column'
      ? `0.06 × ${b} × ${h}`
      : `0.04 × ${b} × ${h}`,
    result: `${fmt(AsMax, 0)} mm²`,
    sansRef: 'SANS 10100-1 Table 13',
  });

  // Concrete grade note
  derivation.push({
    label: 'Concrete grade',
    formula: 'fcu',
    substitution: `Grade ${fcu}`,
    result: `${fcu} MPa`,
    sansRef: 'SANS 10100-1 Table 13',
  });

  // No ratio comparison here — informational calculator (always pass)
  const ratio = 0; // always pass for reference calculator

  return {
    status: 'pass',
    utilisationRatio: ratio,
    results: {
      'Min Reinforcement (As_min)': { value: Number(fmt(AsMin!, 0)), unit: 'mm²' },
      'Max Reinforcement (As_max)': { value: Number(fmt(AsMax, 0)), unit: 'mm²' },
      'Min Percentage': { value: Number(fmt(minPercent, 2)), unit: '%' },
      'Section Type': { value: sectionType, unit: '' },
    },
    derivation,
    sansReferences,
    intermediates: { minPercent, AsMin: AsMin!, AsMax },
  };
}

// ---------------------------------------------------------------------------
// Calculator Registrations
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'calc_hub_concrete_beam_v1',
    title: 'Concrete Beam Design',
    discipline: 'structural-concrete',
    sansRef: 'SANS 10100-1 §4.3.3',
    description: 'Flexural design, neutral axis, lever arm, required reinforcement, and shear capacity for RC beams.',
  },
  inputSchema: concreteBeamInputSchema,
  defaults: CONCRETE_BEAM_DEFAULTS,
  compute: computeConcreteBeam,
});

registerCalculator({
  meta: {
    id: 'calc_hub_concrete_slab_v1',
    title: 'Concrete Slab Design',
    discipline: 'structural-concrete',
    sansRef: 'SANS 10100-1 §3.5',
    description: 'One-way and two-way slab design with moment coefficients, reinforcement, and deflection check.',
  },
  inputSchema: concreteSlabInputSchema,
  defaults: CONCRETE_SLAB_DEFAULTS,
  compute: computeConcreteSlab,
});

registerCalculator({
  meta: {
    id: 'calc_hub_concrete_column_v1',
    title: 'Concrete Column Design',
    discipline: 'structural-concrete',
    sansRef: 'SANS 10100-1 §4.7',
    description: 'Short/slender classification and axial+moment interaction check for RC columns.',
  },
  inputSchema: concreteColumnInputSchema,
  defaults: CONCRETE_COLUMN_DEFAULTS,
  compute: computeConcreteColumn,
});

registerCalculator({
  meta: {
    id: 'calc_hub_concrete_anchorage_v1',
    title: 'Anchorage & Lap Lengths',
    discipline: 'structural-concrete',
    sansRef: 'SANS 10100-1 §5.8',
    description: 'Basic anchorage length, modifiers for cover/confinement/spacing, and lap lengths.',
  },
  inputSchema: concreteAnchorageInputSchema,
  defaults: CONCRETE_ANCHORAGE_DEFAULTS,
  compute: computeConcreteAnchorage,
});

registerCalculator({
  meta: {
    id: 'calc_hub_concrete_crack_width_v1',
    title: 'Crack Width (acr method)',
    discipline: 'structural-concrete',
    sansRef: 'SANS 10100-1 §3.8',
    description: 'Design crack width calculation using the acr method for serviceability checks.',
  },
  inputSchema: concreteCrackWidthInputSchema,
  defaults: CONCRETE_CRACK_WIDTH_DEFAULTS,
  compute: computeConcreteCrackWidth,
});

registerCalculator({
  meta: {
    id: 'calc_hub_concrete_min_rebar_v1',
    title: 'Minimum Reinforcement',
    discipline: 'structural-concrete',
    sansRef: 'SANS 10100-1 Table 13',
    description: 'Minimum and maximum reinforcement areas by section type, concrete grade, and steel grade.',
  },
  inputSchema: concreteMinRebarInputSchema,
  defaults: CONCRETE_MIN_REBAR_DEFAULTS,
  compute: computeConcreteMinRebar,
});
