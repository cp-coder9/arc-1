// Engineer's Calculation Hub — Timber Design Engine
//
// Pure compute functions for timber structural design per SANS 10163-1.
// Covers beam design (bending, shear, deflection, bearing), compression
// members (buckling), and connections (bolt/nail capacities).
//
// Requirements: 3.1-3.4, 10.1-10.3

import type { CalculatorOutput, PassFailStatus, DerivationStep } from '../types';
import {
  timberBeamInputSchema,
  timberColumnInputSchema,
  timberConnectionInputSchema,
  type TimberBeamInput,
  type TimberColumnInput,
  type TimberConnectionInput,
  TIMBER_BEAM_DEFAULTS,
  TIMBER_COLUMN_DEFAULTS,
  TIMBER_CONNECTION_DEFAULTS,
} from '../schemas/timberDesign';
import { registerCalculator } from '../calcHubRegistry';

// ---------------------------------------------------------------------------
// Timber grade properties per SANS 10163-1
// ---------------------------------------------------------------------------

interface TimberGradeProps {
  fb: number; // Bending stress (MPa)
  fv: number; // Shear stress (MPa)
  fc: number; // Compressive stress parallel to grain (MPa)
  E: number;  // Modulus of elasticity (MPa)
}

const TIMBER_GRADES: Record<string, TimberGradeProps> = {
  '5':  { fb: 5,  fv: 0.7, fc: 4,   E: 7800 },
  '7':  { fb: 7,  fv: 1.0, fc: 5.5, E: 9600 },
  '10': { fb: 10, fv: 1.4, fc: 7.5, E: 12000 },
  '14': { fb: 14, fv: 2.0, fc: 10,  E: 16000 },
};

// Duration of load factors (k1) per SANS 10163-1
const DURATION_FACTORS: Record<string, number> = {
  permanent: 0.60,
  medium: 0.77,
  short: 0.88,
  instant: 1.00,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Determine pass/fail/warning status from utilisation ratio */
function getStatus(ratio: number): PassFailStatus {
  if (ratio > 1.0) return 'fail';
  if (ratio >= 0.9) return 'warning';
  return 'pass';
}

/**
 * Size factor k2 for bending (SANS 10163-1 §6.2.4).
 * For depths > 300mm, k2 = (300/d)^0.11; otherwise k2 = 1.0.
 */
function sizeFactor(depth: number): number {
  if (depth <= 300) return 1.0;
  return Math.pow(300 / depth, 0.11);
}

// ---------------------------------------------------------------------------
// Timber Beam Calculator (SANS 10163-1)
// ---------------------------------------------------------------------------

export function computeTimberBeam(input: TimberBeamInput): CalculatorOutput {
  const { width, depth, span, udl, timberGrade, loadDuration, deflectionLimit } = input;
  const grade = TIMBER_GRADES[timberGrade];
  const k1 = DURATION_FACTORS[loadDuration];
  const k2 = sizeFactor(depth);

  // Convert units
  const b = width;           // mm
  const d = depth;           // mm
  const L = span * 1000;    // mm (span in m → mm)
  const w = udl;             // kN/m (line load)

  const derivation: DerivationStep[] = [];
  const intermediates: Record<string, number> = {};

  // --- Step 1: Section modulus ---
  const Z = (b * d * d) / 6; // mm³
  intermediates['Z'] = Z;
  derivation.push({
    label: 'Section modulus',
    formula: 'Z = b·d²/6',
    substitution: `${b} × ${d}² / 6`,
    result: `${Z.toFixed(0)} mm³`,
    sansRef: 'SANS 10163-1 §6.2',
  });

  // --- Step 2: Second moment of area ---
  const I = (b * Math.pow(d, 3)) / 12; // mm⁴
  intermediates['I'] = I;
  derivation.push({
    label: 'Second moment of area',
    formula: 'I = b·d³/12',
    substitution: `${b} × ${d}³ / 12`,
    result: `${I.toFixed(0)} mm⁴`,
    sansRef: 'SANS 10163-1 §6.2',
  });

  // --- Step 3: Maximum bending moment (simply supported, UDL) ---
  const M = (w * Math.pow(span, 2)) / 8; // kNm
  intermediates['M'] = M;
  derivation.push({
    label: 'Maximum bending moment (simply supported UDL)',
    formula: 'M = w·L²/8',
    substitution: `${w} × ${span}² / 8`,
    result: `${M.toFixed(3)} kNm`,
    sansRef: 'SANS 10163-1 §6.2.1',
  });

  // --- Step 4: Actual bending stress ---
  const sigma_b = (M * 1e6) / Z; // MPa (kNm → Nmm)
  intermediates['sigma_b'] = sigma_b;
  derivation.push({
    label: 'Actual bending stress',
    formula: 'σb = M / Z',
    substitution: `${(M * 1e6).toFixed(0)} / ${Z.toFixed(0)}`,
    result: `${sigma_b.toFixed(2)} MPa`,
    sansRef: 'SANS 10163-1 §6.2.1',
  });

  // --- Step 5: Allowable bending stress ---
  const fb_allow = grade.fb * k1 * k2; // MPa
  intermediates['fb_allow'] = fb_allow;
  derivation.push({
    label: 'Allowable bending stress',
    formula: 'fb_allow = fb · k1 · k2',
    substitution: `${grade.fb} × ${k1} × ${k2.toFixed(4)}`,
    result: `${fb_allow.toFixed(2)} MPa`,
    sansRef: 'SANS 10163-1 §6.2.4',
  });

  // --- Step 6: Bending utilisation ---
  const bendingRatio = sigma_b / fb_allow;
  intermediates['bendingRatio'] = bendingRatio;
  const bendingPass = bendingRatio <= 1.0;
  derivation.push({
    label: 'Bending utilisation check',
    formula: 'σb ≤ fb_allow',
    substitution: `${sigma_b.toFixed(2)} ≤ ${fb_allow.toFixed(2)}`,
    result: bendingPass ? 'OK' : 'FAILS',
    sansRef: 'SANS 10163-1 §6.2.4',
    isFailing: !bendingPass,
  });

  // --- Step 7: Maximum shear force ---
  const V = (w * span) / 2; // kN
  intermediates['V'] = V;
  derivation.push({
    label: 'Maximum shear force',
    formula: 'V = w·L/2',
    substitution: `${w} × ${span} / 2`,
    result: `${V.toFixed(3)} kN`,
    sansRef: 'SANS 10163-1 §6.3',
  });

  // --- Step 8: Actual shear stress ---
  const tau = (1.5 * V * 1000) / (b * d); // MPa (kN → N)
  intermediates['tau'] = tau;
  derivation.push({
    label: 'Actual shear stress',
    formula: 'τ = 1.5·V / (b·d)',
    substitution: `1.5 × ${(V * 1000).toFixed(0)} / (${b} × ${d})`,
    result: `${tau.toFixed(3)} MPa`,
    sansRef: 'SANS 10163-1 §6.3.1',
  });

  // --- Step 9: Allowable shear stress ---
  const fv_allow = grade.fv * k1; // MPa
  intermediates['fv_allow'] = fv_allow;
  derivation.push({
    label: 'Allowable shear stress',
    formula: 'fv_allow = fv · k1',
    substitution: `${grade.fv} × ${k1}`,
    result: `${fv_allow.toFixed(3)} MPa`,
    sansRef: 'SANS 10163-1 §6.3.1',
  });

  // --- Step 10: Shear utilisation ---
  const shearRatio = tau / fv_allow;
  intermediates['shearRatio'] = shearRatio;
  const shearPass = shearRatio <= 1.0;
  derivation.push({
    label: 'Shear utilisation check',
    formula: 'τ ≤ fv_allow',
    substitution: `${tau.toFixed(3)} ≤ ${fv_allow.toFixed(3)}`,
    result: shearPass ? 'OK' : 'FAILS',
    sansRef: 'SANS 10163-1 §6.3.1',
    isFailing: !shearPass,
  });

  // --- Step 11: Deflection ---
  // δ = 5·w·L⁴ / (384·E·I)  (units: w in N/mm, L in mm, E in MPa, I in mm⁴)
  const w_Nmm = w / 1000; // kN/m → N/mm (1 kN/m = 1 N/mm)
  const delta = (5 * w_Nmm * Math.pow(L, 4)) / (384 * grade.E * I); // mm
  intermediates['delta'] = delta;
  derivation.push({
    label: 'Midspan deflection',
    formula: 'δ = 5·w·L⁴ / (384·E·I)',
    substitution: `5 × ${w_Nmm.toFixed(4)} × ${L}⁴ / (384 × ${grade.E} × ${I.toFixed(0)})`,
    result: `${delta.toFixed(2)} mm`,
    sansRef: 'SANS 10163-1 §6.4',
  });

  // --- Step 12: Deflection limit ---
  const deltaLimit = L / deflectionLimit; // mm
  intermediates['deltaLimit'] = deltaLimit;
  const deflectionRatio = delta / deltaLimit;
  intermediates['deflectionRatio'] = deflectionRatio;
  const deflectionPass = deflectionRatio <= 1.0;
  derivation.push({
    label: 'Deflection limit check',
    formula: 'δ ≤ L / deflectionLimit',
    substitution: `${delta.toFixed(2)} ≤ ${L} / ${deflectionLimit} = ${deltaLimit.toFixed(2)}`,
    result: deflectionPass ? 'OK' : 'FAILS',
    sansRef: 'SANS 10163-1 §6.4.1',
    isFailing: !deflectionPass,
  });

  // --- Step 13: Bearing stress at supports ---
  // Assume bearing length = width (conservative)
  const bearingArea = b * b; // mm² (width × bearing length assumed = width)
  const bearingStress = (V * 1000) / bearingArea; // MPa
  const fc_perp = grade.fc * 0.5; // Perpendicular-to-grain ≈ 50% of parallel
  const bearingAllow = fc_perp * k1;
  const bearingRatio = bearingStress / bearingAllow;
  intermediates['bearingStress'] = bearingStress;
  intermediates['bearingAllow'] = bearingAllow;
  intermediates['bearingRatio'] = bearingRatio;
  derivation.push({
    label: 'Bearing stress at support',
    formula: 'σ_bearing = V / A_bearing',
    substitution: `${(V * 1000).toFixed(0)} / ${bearingArea}`,
    result: `${bearingStress.toFixed(2)} MPa`,
    sansRef: 'SANS 10163-1 §6.5',
  });
  derivation.push({
    label: 'Bearing utilisation',
    formula: 'σ_bearing ≤ fc_perp · k1',
    substitution: `${bearingStress.toFixed(2)} ≤ ${fc_perp} × ${k1} = ${bearingAllow.toFixed(2)}`,
    result: bearingRatio <= 1.0 ? 'OK' : 'FAILS',
    sansRef: 'SANS 10163-1 §6.5.1',
    isFailing: bearingRatio > 1.0,
  });

  // --- Overall utilisation (governing ratio) ---
  const utilisationRatio = Math.max(bendingRatio, shearRatio, deflectionRatio, bearingRatio);
  const status = getStatus(utilisationRatio);

  return {
    status,
    utilisationRatio,
    results: {
      'Bending Stress (σb)': { value: Number(sigma_b.toFixed(2)), unit: 'MPa' },
      'Allowable Bending Stress': { value: Number(fb_allow.toFixed(2)), unit: 'MPa' },
      'Shear Stress (τ)': { value: Number(tau.toFixed(3)), unit: 'MPa' },
      'Allowable Shear Stress': { value: Number(fv_allow.toFixed(3)), unit: 'MPa' },
      'Midspan Deflection': { value: Number(delta.toFixed(2)), unit: 'mm' },
      'Deflection Limit': { value: Number(deltaLimit.toFixed(2)), unit: 'mm' },
      'Bearing Stress': { value: Number(bearingStress.toFixed(2)), unit: 'MPa' },
    },
    derivation,
    sansReferences: [
      'SANS 10163-1 §6.2',
      'SANS 10163-1 §6.2.1',
      'SANS 10163-1 §6.2.4',
      'SANS 10163-1 §6.3',
      'SANS 10163-1 §6.3.1',
      'SANS 10163-1 §6.4',
      'SANS 10163-1 §6.4.1',
      'SANS 10163-1 §6.5',
      'SANS 10163-1 §6.5.1',
    ],
    intermediates,
  };
}

// ---------------------------------------------------------------------------
// Timber Column / Compression Member Calculator (SANS 10163-1)
// ---------------------------------------------------------------------------

export function computeTimberColumn(input: TimberColumnInput): CalculatorOutput {
  const { width, depth, length, axialLoad, timberGrade, effectiveLengthFactor, loadDuration } = input;
  const grade = TIMBER_GRADES[timberGrade];
  const k1 = DURATION_FACTORS[loadDuration];

  const b = width;        // mm
  const d = depth;        // mm
  const Le = effectiveLengthFactor * length * 1000; // mm (effective length)
  const P = axialLoad;    // kN

  const derivation: DerivationStep[] = [];
  const intermediates: Record<string, number> = {};

  // --- Step 1: Cross-sectional area ---
  const A = b * d; // mm²
  intermediates['A'] = A;
  derivation.push({
    label: 'Cross-sectional area',
    formula: 'A = b × d',
    substitution: `${b} × ${d}`,
    result: `${A} mm²`,
    sansRef: 'SANS 10163-1 §7.2',
  });

  // --- Step 2: Radius of gyration (minor axis) ---
  const rMin = Math.min(b, d) / Math.sqrt(12); // mm
  intermediates['rMin'] = rMin;
  derivation.push({
    label: 'Radius of gyration (minor axis)',
    formula: 'r = min(b,d) / √12',
    substitution: `${Math.min(b, d)} / √12`,
    result: `${rMin.toFixed(2)} mm`,
    sansRef: 'SANS 10163-1 §7.2.1',
  });

  // --- Step 3: Effective slenderness ratio ---
  const lambda = Le / rMin;
  intermediates['lambda'] = lambda;
  derivation.push({
    label: 'Effective slenderness ratio',
    formula: 'λ = Le / r',
    substitution: `${Le.toFixed(0)} / ${rMin.toFixed(2)}`,
    result: `${lambda.toFixed(2)}`,
    sansRef: 'SANS 10163-1 §7.2.2',
  });

  // --- Step 4: Euler critical stress ---
  const Fe = (Math.PI * Math.PI * grade.E) / (lambda * lambda); // MPa
  intermediates['Fe'] = Fe;
  derivation.push({
    label: 'Euler critical stress',
    formula: 'Fe = π²·E / λ²',
    substitution: `π² × ${grade.E} / ${lambda.toFixed(2)}²`,
    result: `${Fe.toFixed(2)} MPa`,
    sansRef: 'SANS 10163-1 §7.2.3',
  });

  // --- Step 5: Adjusted compressive stress with buckling ---
  // SANS 10163-1 uses a stability factor approach:
  // Kc = 1 / (1 + (fc·k1 / Fe))  — simplified interaction
  // Adjusted allowable stress: fc_adj = fc · k1 · Kc
  const fc_k1 = grade.fc * k1;
  const Kc = 1 / (1 + (fc_k1 / Fe));
  const fc_adj = fc_k1 * Kc; // MPa
  intermediates['fc_k1'] = fc_k1;
  intermediates['Kc'] = Kc;
  intermediates['fc_adj'] = fc_adj;
  derivation.push({
    label: 'Stability factor',
    formula: 'Kc = 1 / (1 + fc·k1/Fe)',
    substitution: `1 / (1 + ${fc_k1.toFixed(2)} / ${Fe.toFixed(2)})`,
    result: `${Kc.toFixed(4)}`,
    sansRef: 'SANS 10163-1 §7.2.4',
  });
  derivation.push({
    label: 'Adjusted compressive stress',
    formula: 'fc_adj = fc · k1 · Kc',
    substitution: `${grade.fc} × ${k1} × ${Kc.toFixed(4)}`,
    result: `${fc_adj.toFixed(2)} MPa`,
    sansRef: 'SANS 10163-1 §7.2.4',
  });

  // --- Step 6: Compressive resistance ---
  const Cr = fc_adj * A / 1000; // kN
  intermediates['Cr'] = Cr;
  derivation.push({
    label: 'Compressive resistance',
    formula: 'Cr = fc_adj × A / 1000',
    substitution: `${fc_adj.toFixed(2)} × ${A} / 1000`,
    result: `${Cr.toFixed(2)} kN`,
    sansRef: 'SANS 10163-1 §7.2.5',
  });

  // --- Step 7: Actual compressive stress ---
  const sigma_c = (P * 1000) / A; // MPa
  intermediates['sigma_c'] = sigma_c;
  derivation.push({
    label: 'Actual compressive stress',
    formula: 'σc = P / A',
    substitution: `${(P * 1000).toFixed(0)} / ${A}`,
    result: `${sigma_c.toFixed(2)} MPa`,
    sansRef: 'SANS 10163-1 §7.2',
  });

  // --- Step 8: Utilisation check ---
  const utilisationRatio = sigma_c / fc_adj;
  intermediates['utilisationRatio'] = utilisationRatio;
  const status = getStatus(utilisationRatio);
  const columnPass = utilisationRatio <= 1.0;
  derivation.push({
    label: 'Compression utilisation check',
    formula: 'σc ≤ fc_adj',
    substitution: `${sigma_c.toFixed(2)} ≤ ${fc_adj.toFixed(2)}`,
    result: columnPass ? 'OK' : 'FAILS',
    sansRef: 'SANS 10163-1 §7.2.5',
    isFailing: !columnPass,
  });

  return {
    status,
    utilisationRatio,
    results: {
      'Slenderness Ratio (λ)': { value: Number(lambda.toFixed(2)), unit: '' },
      'Euler Critical Stress (Fe)': { value: Number(Fe.toFixed(2)), unit: 'MPa' },
      'Stability Factor (Kc)': { value: Number(Kc.toFixed(4)), unit: '' },
      'Compressive Resistance (Cr)': { value: Number(Cr.toFixed(2)), unit: 'kN' },
      'Actual Stress (σc)': { value: Number(sigma_c.toFixed(2)), unit: 'MPa' },
      'Adjusted Allowable (fc_adj)': { value: Number(fc_adj.toFixed(2)), unit: 'MPa' },
    },
    derivation,
    sansReferences: [
      'SANS 10163-1 §7.2',
      'SANS 10163-1 §7.2.1',
      'SANS 10163-1 §7.2.2',
      'SANS 10163-1 §7.2.3',
      'SANS 10163-1 §7.2.4',
      'SANS 10163-1 §7.2.5',
    ],
    intermediates,
  };
}

// ---------------------------------------------------------------------------
// Timber Connection Calculator (SANS 10163-1)
// ---------------------------------------------------------------------------

/**
 * Base capacity factor (k) for fasteners per SANS 10163-1 §8.
 * Simplified capacity per fastener: Q = k · d · t
 *   k depends on connection type and timber grade
 *   d = fastener diameter (mm)
 *   t = member thickness (mm) — effective penetration
 */
function getFastenerK(connectionType: string, timberGrade: string): number {
  // k values per SANS 10163-1 Table 8 (simplified)
  const kTable: Record<string, Record<string, number>> = {
    bolt: { '5': 0.035, '7': 0.042, '10': 0.050, '14': 0.060 },
    nail: { '5': 0.025, '7': 0.030, '10': 0.036, '14': 0.043 },
  };
  return kTable[connectionType]?.[timberGrade] ?? 0.035;
}

/** Minimum spacing requirements (mm) per SANS 10163-1 §8 */
function getMinSpacing(connectionType: string, diameter: number): {
  endDistance: number;
  edgeDistance: number;
  spacing: number;
} {
  if (connectionType === 'bolt') {
    return {
      endDistance: 7 * diameter,
      edgeDistance: 3 * diameter,
      spacing: 5 * diameter,
    };
  }
  // Nails
  return {
    endDistance: 15 * diameter,
    edgeDistance: 5 * diameter,
    spacing: 10 * diameter,
  };
}

export function computeTimberConnection(input: TimberConnectionInput): CalculatorOutput {
  const {
    connectionType,
    fastenerDiameter,
    numFasteners,
    shearType,
    memberThickness,
    timberGrade,
    appliedForce,
  } = input;

  const derivation: DerivationStep[] = [];
  const intermediates: Record<string, number> = {};

  const k = getFastenerK(connectionType, timberGrade);
  const d = fastenerDiameter; // mm
  const t = memberThickness;  // mm
  const n = numFasteners;
  const P = appliedForce;     // kN

  // --- Step 1: Capacity per fastener ---
  // Per SANS 10163-1 simplified: capacity per fastener in single shear = k × d × t
  // The k-values are calibrated so that Q = k·d·t gives result in kN directly.
  const Q_single_N = k * d * t; // kN
  intermediates['Q_single'] = Q_single_N;
  derivation.push({
    label: `Capacity per ${connectionType} (single shear)`,
    formula: 'Q = k · d · t',
    substitution: `${k} × ${d} × ${t}`,
    result: `${Q_single_N.toFixed(3)} kN`,
    sansRef: 'SANS 10163-1 §8.3',
  });

  // --- Step 2: Shear type multiplier ---
  const shearMultiplier = shearType === 'double' ? 2.0 : 1.0;
  const Q_adjusted = Q_single_N * shearMultiplier;
  intermediates['shearMultiplier'] = shearMultiplier;
  intermediates['Q_adjusted'] = Q_adjusted;
  derivation.push({
    label: `Adjusted capacity (${shearType} shear)`,
    formula: 'Q_adj = Q × shear_factor',
    substitution: `${Q_single_N.toFixed(3)} × ${shearMultiplier}`,
    result: `${Q_adjusted.toFixed(3)} kN`,
    sansRef: 'SANS 10163-1 §8.3.2',
  });

  // --- Step 3: Total connection capacity ---
  const totalCapacity = Q_adjusted * n; // kN
  intermediates['totalCapacity'] = totalCapacity;
  derivation.push({
    label: 'Total connection capacity',
    formula: 'R = Q_adj × n',
    substitution: `${Q_adjusted.toFixed(3)} × ${n}`,
    result: `${totalCapacity.toFixed(2)} kN`,
    sansRef: 'SANS 10163-1 §8.4',
  });

  // --- Step 4: Utilisation check ---
  const utilisationRatio = P / totalCapacity;
  intermediates['utilisationRatio'] = utilisationRatio;
  const connectionPass = utilisationRatio <= 1.0;
  derivation.push({
    label: 'Connection utilisation check',
    formula: 'P ≤ R',
    substitution: `${P} ≤ ${totalCapacity.toFixed(2)}`,
    result: connectionPass ? 'OK' : 'FAILS',
    sansRef: 'SANS 10163-1 §8.4',
    isFailing: !connectionPass,
  });

  // --- Step 5: Minimum spacings ---
  const spacings = getMinSpacing(connectionType, d);
  intermediates['minEndDistance'] = spacings.endDistance;
  intermediates['minEdgeDistance'] = spacings.edgeDistance;
  intermediates['minSpacing'] = spacings.spacing;
  derivation.push({
    label: 'Minimum end distance',
    formula: connectionType === 'bolt' ? '7·d' : '15·d',
    substitution: `${connectionType === 'bolt' ? 7 : 15} × ${d}`,
    result: `${spacings.endDistance} mm`,
    sansRef: 'SANS 10163-1 §8.5',
  });
  derivation.push({
    label: 'Minimum edge distance',
    formula: connectionType === 'bolt' ? '3·d' : '5·d',
    substitution: `${connectionType === 'bolt' ? 3 : 5} × ${d}`,
    result: `${spacings.edgeDistance} mm`,
    sansRef: 'SANS 10163-1 §8.5',
  });
  derivation.push({
    label: 'Minimum fastener spacing',
    formula: connectionType === 'bolt' ? '5·d' : '10·d',
    substitution: `${connectionType === 'bolt' ? 5 : 10} × ${d}`,
    result: `${spacings.spacing} mm`,
    sansRef: 'SANS 10163-1 §8.5',
  });

  const status = getStatus(utilisationRatio);

  return {
    status,
    utilisationRatio,
    results: {
      'Capacity per Fastener': { value: Number(Q_single_N.toFixed(3)), unit: 'kN' },
      'Total Connection Capacity': { value: Number(totalCapacity.toFixed(2)), unit: 'kN' },
      'Applied Force': { value: P, unit: 'kN' },
      'Min End Distance': { value: spacings.endDistance, unit: 'mm' },
      'Min Edge Distance': { value: spacings.edgeDistance, unit: 'mm' },
      'Min Spacing': { value: spacings.spacing, unit: 'mm' },
    },
    derivation,
    sansReferences: [
      'SANS 10163-1 §8.3',
      'SANS 10163-1 §8.3.2',
      'SANS 10163-1 §8.4',
      'SANS 10163-1 §8.5',
    ],
    intermediates,
  };
}

// ---------------------------------------------------------------------------
// Registry Registration
// ---------------------------------------------------------------------------

registerCalculator({
  meta: {
    id: 'timber-beam',
    title: 'Timber Beam Design',
    discipline: 'structural-timber',
    sansRef: 'SANS 10163-1',
    description: 'Bending stress, shear stress, deflection, and bearing checks for timber beams with duration-of-load and size factors.',
  },
  inputSchema: timberBeamInputSchema,
  defaults: TIMBER_BEAM_DEFAULTS,
  compute: computeTimberBeam,
});

registerCalculator({
  meta: {
    id: 'timber-column',
    title: 'Timber Compression Member',
    discipline: 'structural-timber',
    sansRef: 'SANS 10163-1',
    description: 'Effective slenderness, buckling stability, and compressive resistance for timber columns.',
  },
  inputSchema: timberColumnInputSchema,
  defaults: TIMBER_COLUMN_DEFAULTS,
  compute: computeTimberColumn,
});

registerCalculator({
  meta: {
    id: 'timber-connection',
    title: 'Timber Connections',
    discipline: 'structural-timber',
    sansRef: 'SANS 10163-1',
    description: 'Bolt and nail capacities for single/double shear with minimum spacing requirements.',
  },
  inputSchema: timberConnectionInputSchema,
  defaults: TIMBER_CONNECTION_DEFAULTS,
  compute: computeTimberConnection,
});
