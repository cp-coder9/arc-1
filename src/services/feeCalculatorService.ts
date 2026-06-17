// ─── Fee Calculator Service — SACAP-based Professional Fee Calculation ───────
// Implements professional fee calculations based on SACAP / FeeDesk guidelines.
// Supports multiple formula types: percentage-of-cost, sliding scale, stage-apportioned,
// time-based, area-unit, and hybrid.

import { collection, doc, getDoc, getDocs, setDoc, addDoc, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  CalculationInput,

  CalculationResult,
  CalculatorDefinition,
  FeeLine,
  ProjectRecord,
} from './toolboxTypes';
import { calculatorById } from './toolboxRegistry';


import { getDemoDoc, getDemoCol } from '../demo-seed/demoFirestore';
// ─── Firestore Paths ─────────────────────────────────────────────────────────

const CALCULATIONS_COL = 'fee_calculations';
const PROJECTS_COL = 'projects';

function calculationDoc(calculationId: string) {
  return getDemoDoc( CALCULATIONS_COL, calculationId);
}

function calculationCollection() {
  return getDemoCol( CALCULATIONS_COL);
}

function projectCalculationsCollection(projectId: string) {
  return getDemoCol( PROJECTS_COL, projectId, CALCULATIONS_COL);
}

// ─── Formula Engine ──────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calculate professional fee using the specified formula type.
 * SACAP guideline defaults: percentage_of_cost = 8% of project value
 * adjusted by complexity factor (0.8–1.5).
 */
export function calculateFee(def: CalculatorDefinition, input: CalculationInput): CalculationResult {
  const complexity = input.complexityFactor ?? 1;
  let professionalFee = 0;
  const warnings: string[] = [];

  switch (def.formulaType) {
    case 'percentage_of_cost':
      professionalFee = input.projectValue * 0.08 * complexity;
      break;
    case 'sliding_scale':
      professionalFee = 50000 + Math.max(input.projectValue - 1000000, 0) * 0.045 * complexity;
      break;
    case 'stage_apportioned':
      professionalFee = input.projectValue * 0.08 * ((input.stagePercentage ?? 100) / 100) * complexity;
      break;
    case 'time_based':
      professionalFee = (input.hours ?? 0) * (input.hourlyRate ?? 0);
      break;
    case 'area_unit':
      professionalFee = (input.area ?? 0) * (input.unitRate ?? 0) * complexity;
      break;
    case 'hybrid':
      professionalFee = input.projectValue * 0.035 * complexity + (input.hours ?? 10) * (input.hourlyRate ?? 950);
      break;
  }

  const discountPercent = input.discountPercent ?? 0;
  if (discountPercent > 0 && !input.discountReason) {
    warnings.push('Discount reason is required before proposal issue.');
  }

  const discountAmount = professionalFee * (discountPercent / 100);
  const professionalFeeAfterDiscount = professionalFee - discountAmount;
  const disbursements = input.disbursements ?? 0;
  const statutory = input.statutoryFees ?? 0;
  const vatAmount = (professionalFeeAfterDiscount + disbursements) * def.vatRate;
  const total = professionalFeeAfterDiscount + disbursements + statutory + vatAmount;

  const lines: FeeLine[] = [
    { label: 'Original professional fee', amount: round(professionalFee), category: 'professional_fee' },
    { label: 'Professional fee discount', amount: round(-discountAmount), category: 'discount' },
    { label: 'Professional fee after discount', amount: round(professionalFeeAfterDiscount), category: 'professional_fee' },
    { label: 'Disbursements', amount: round(disbursements), category: 'disbursement' },
    { label: 'Statutory / municipal fees', amount: round(statutory), category: 'statutory_fee' },
    { label: 'VAT', amount: round(vatAmount), category: 'vat' },
    { label: 'Total', amount: round(total), category: 'total' },
  ];

  return {
    calculatorId: def.calculatorId,
    originalProfessionalFee: round(professionalFee),
    discountAmount: round(discountAmount),
    professionalFeeAfterDiscount: round(professionalFeeAfterDiscount),
    vatAmount: round(vatAmount),
    total: round(total),
    lines,
    warnings,
  };
}

// ─── Firestore-backed Operations ─────────────────────────────────────────────

export interface FeeCalculationSnapshot {
  calculationId: string;
  projectId?: string;
  tenantId?: string;
  calculatorId: string;
  input: CalculationInput;
  result: CalculationResult;
  professionalName?: string;
  professionalRole?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Create a fee calculation snapshot and persist it to Firestore. */
export async function createFeeCalculation(input: {
  calculatorId: string;
  calculationInput: CalculationInput;
  projectId?: string;
  tenantId?: string;
  professionalName?: string;
  professionalRole?: string;
}): Promise<FeeCalculationSnapshot & { id: string }> {
  try {
    const def = calculatorById(input.calculatorId);
    const result = calculateFee(def, input.calculationInput);

    const snapshot: Omit<FeeCalculationSnapshot, 'calculationId'> = {
      projectId: input.projectId,
      tenantId: input.tenantId,
      calculatorId: input.calculatorId,
      input: input.calculationInput,
      result,
      professionalName: input.professionalName,
      professionalRole: input.professionalRole,
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(calculationCollection(), snapshot);
    return { calculationId: docRef.id, ...snapshot, id: docRef.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, CALCULATIONS_COL);
    throw error;
  }
}

/** Get a fee calculation snapshot by ID. */
export async function getFeeCalculation(calculationId: string): Promise<(FeeCalculationSnapshot & { id: string }) | null> {
  try {
    const docSnap = await getDoc(calculationDoc(calculationId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as FeeCalculationSnapshot;
    return { calculationId: docSnap.id, ...data, id: docSnap.id };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${CALCULATIONS_COL}/${calculationId}`);
    return null;
  }
}

/** List all fee calculations for a project. */
export async function listProjectFeeCalculations(projectId: string): Promise<(FeeCalculationSnapshot & { id: string })[]> {
  try {
    const q = query(
      projectCalculationsCollection(projectId),
      orderBy('createdAt', 'desc'),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({
      calculationId: d.id,
      ...(d.data() as FeeCalculationSnapshot),
      id: d.id,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${CALCULATIONS_COL}`);
    return [];
  }
}

/** Recalculate and persist an updated fee based on new inputs. */
export async function recalculateFee(
  calculationId: string,
  newInput: CalculationInput,
): Promise<(FeeCalculationSnapshot & { id: string }) | null> {
  try {
    const existing = await getFeeCalculation(calculationId);
    if (!existing) return null;

    const def = calculatorById(existing.calculatorId);
    const result = calculateFee(def, newInput);

    const now = new Date().toISOString();
    await setDoc(
      calculationDoc(calculationId),
      {
        ...existing,
        input: newInput,
        result,
        updatedAt: now,
      },
      { merge: true },
    );

    return {
      ...existing,
      input: newInput,
      result,
      updatedAt: now,
      id: calculationId,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${CALCULATIONS_COL}/${calculationId}`);
    return null;
  }
}

// ─── Aggregated Service Export ───────────────────────────────────────────────

export const feeCalculatorService = {
  calculateFee,
  createFeeCalculation,
  getFeeCalculation,
  listProjectFeeCalculations,
  recalculateFee,
};

export default feeCalculatorService;
