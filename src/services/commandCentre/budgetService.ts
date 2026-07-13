/**
 * Project Command Centre — Budget Controller Service
 *
 * Manages budget packages, variations, expenditure, and cost breakdown.
 * Persisted at:
 *   - `projects/{projectId}/budget_packages/` — per-package cost breakdown
 *   - `projects/{projectId}/variations/` — approved budget variations
 *
 * @module commandCentre/budgetService
 */

import {
  getDoc,
  setDoc,
  addDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';
import { getDemoDoc, getDemoCol } from '@/demo-seed/demoFirestore';
import { createVariationSchema } from '@/services/commandCentre/schemas';
import { recordAudit } from '@/services/commandCentre/commandCentreService';
import type { BudgetPackage, BudgetSummary } from '@/services/commandCentre/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface Variation {
  id: string;
  projectId: string;
  description: string;
  value: number;
  approvedBy: string;
  createdAt: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const PROJECTS_COL = 'projects';
const BUDGET_PACKAGES_COL = 'budget_packages';
const VARIATIONS_COL = 'variations';

/** Over-budget threshold: 5% */
const OVER_BUDGET_THRESHOLD = 0.05;

/** Epsilon tolerance for IEEE 754 floating-point comparison */
const FLOAT_EPSILON = 1e-7;

// ── Firestore Path Helpers ───────────────────────────────────────────────────

function budgetPackagesCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, BUDGET_PACKAGES_COL);
}

function budgetPackageDocument(projectId: string, packageId: string) {
  if (!projectId) throw new Error('projectId is required');
  if (!packageId) throw new Error('packageId is required');
  return getDemoDoc(PROJECTS_COL, projectId, BUDGET_PACKAGES_COL, packageId);
}

function variationsCollection(projectId: string) {
  if (!projectId) throw new Error('projectId is required');
  return getDemoCol(PROJECTS_COL, projectId, VARIATIONS_COL);
}

// ── Pure Computation Functions (exported for testability) ────────────────────

/**
 * Computes variance percentage: (spent - budget) / budget * 100.
 * Returns 0 when budget is 0 (avoids division by zero).
 */
export function computeVariance(spent: number, budget: number): number {
  if (budget === 0) return 0;
  return ((spent - budget) / budget) * 100;
}

/**
 * Returns true when expenditure exceeds budget by more than 5%.
 * Formula: (spent - budget) / budget > 0.05 + FLOAT_EPSILON
 * Uses epsilon tolerance to prevent IEEE 754 imprecision from causing
 * false positives at the exact 5% boundary.
 */
export function isOverBudgetThreshold(spent: number, budget: number): boolean {
  if (budget === 0) return spent > 0;
  return (spent - budget) / budget > OVER_BUDGET_THRESHOLD + FLOAT_EPSILON;
}

/**
 * Computes forecast at completion based on current spend rate and progress.
 * Formula: spentToDate / (progressPercent / 100)
 * If progress is 0, returns spentToDate (cannot extrapolate from zero progress).
 */
export function computeForecastAtCompletion(spentToDate: number, progressPercent: number): number {
  if (progressPercent <= 0) return spentToDate;
  return spentToDate / (progressPercent / 100);
}

// ── Budget Package Operations ────────────────────────────────────────────────

/**
 * Retrieves all budget packages for a project.
 */
export async function getBudgetPackages(projectId: string): Promise<BudgetPackage[]> {
  try {
    const snap = await getDocs(budgetPackagesCollection(projectId));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as BudgetPackage));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${BUDGET_PACKAGES_COL}`);
  }
}

/**
 * Checks whether a single budget package is over-budget (expenditure > budget + 5%).
 */
export function checkOverBudget(pkg: BudgetPackage): boolean {
  return isOverBudgetThreshold(pkg.spentAmount, pkg.budgetAmount);
}

// ── Variation Operations ─────────────────────────────────────────────────────

/**
 * Adds a variation to the project budget and recalculates the adjusted contract sum.
 * Validates input against the createVariationSchema.
 */
export async function addVariation(
  projectId: string,
  variation: { description: string; value: number; approvedBy: string },
): Promise<Variation> {
  // Validate input
  const parsed = createVariationSchema.parse(variation);

  const variationRecord: Omit<Variation, 'id'> = {
    projectId,
    description: parsed.description,
    value: parsed.value,
    approvedBy: parsed.approvedBy,
    createdAt: new Date().toISOString(),
  };

  try {
    const docRef = await addDoc(variationsCollection(projectId), variationRecord);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: parsed.approvedBy,
      actorName: parsed.approvedBy,
      actionType: 'create',
      entityType: 'variation',
      entityId: docRef.id,
      after: variationRecord as unknown as Record<string, unknown>,
      timestamp: variationRecord.createdAt,
    });

    return { id: docRef.id, ...variationRecord };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROJECTS_COL}/${projectId}/${VARIATIONS_COL}`);
  }
}

// ── Budget Summary ───────────────────────────────────────────────────────────

/**
 * Aggregates budget summary from budget_packages and variations collections.
 * - contractSum: sum of all package budgetAmounts (the base contract value)
 * - approvedVariations: sum of all variation values
 * - spentToDate: sum of all package spentAmounts
 * - forecastAtCompletion: computed from spend rate and remaining work
 * - costVariancePercent: (forecast - adjustedContractSum) / adjustedContractSum * 100
 */
export async function getBudgetSummary(projectId: string): Promise<BudgetSummary> {
  try {
    // Fetch budget packages
    const packagesSnap = await getDocs(budgetPackagesCollection(projectId));
    const packages = packagesSnap.docs.map((d) => d.data() as BudgetPackage);

    // Fetch variations
    const variationsSnap = await getDocs(variationsCollection(projectId));
    const variations = variationsSnap.docs.map((d) => d.data() as Variation);

    // Aggregate values
    const contractSum = packages.reduce((sum, pkg) => sum + (pkg.budgetAmount || 0), 0);
    const approvedVariations = variations.reduce((sum, v) => sum + (v.value || 0), 0);
    const spentToDate = packages.reduce((sum, pkg) => sum + (pkg.spentAmount || 0), 0);

    // Compute overall progress
    const totalProgressWeighted = packages.reduce(
      (sum, pkg) => sum + (pkg.progressPercent || 0) * (pkg.budgetAmount || 0),
      0,
    );
    const overallProgress = contractSum > 0 ? totalProgressWeighted / contractSum : 0;

    // Forecast at completion
    const forecastAtCompletion = computeForecastAtCompletion(spentToDate, overallProgress);

    // Adjusted contract sum and cost variance
    const adjustedContractSum = contractSum + approvedVariations;
    const costVariancePercent = adjustedContractSum !== 0
      ? ((forecastAtCompletion - adjustedContractSum) / adjustedContractSum) * 100
      : 0;

    return {
      contractSum,
      approvedVariations,
      spentToDate,
      forecastAtCompletion,
      costVariancePercent,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `${PROJECTS_COL}/${projectId}/${BUDGET_PACKAGES_COL}`);
  }
}

// ── Expenditure Recording ────────────────────────────────────────────────────

/**
 * Records expenditure against a specific budget package.
 * Updates spentAmount, recalculates variance, and checks over-budget threshold.
 */
export async function recordExpenditure(
  projectId: string,
  packageId: string,
  amount: number,
): Promise<BudgetPackage> {
  if (amount <= 0) throw new Error('Expenditure amount must be positive');

  try {
    const pkgRef = budgetPackageDocument(projectId, packageId);
    const snap = await getDoc(pkgRef);

    if (!snap.exists()) {
      throw new Error(`Budget package '${packageId}' not found`);
    }

    const pkg = { id: snap.id, ...snap.data() } as BudgetPackage;
    const newSpent = pkg.spentAmount + amount;
    const newVariance = computeVariance(newSpent, pkg.budgetAmount);
    const newIsOverBudget = isOverBudgetThreshold(newSpent, pkg.budgetAmount);

    const updates = {
      spentAmount: newSpent,
      variance: newVariance,
      isOverBudget: newIsOverBudget,
    };

    await updateDoc(pkgRef, updates);

    // Fire-and-forget audit
    recordAudit({
      projectId,
      actorId: 'system',
      actorName: 'System',
      actionType: 'update',
      entityType: 'budget_package',
      entityId: packageId,
      before: { spentAmount: pkg.spentAmount, variance: pkg.variance, isOverBudget: pkg.isOverBudget },
      after: updates,
      timestamp: new Date().toISOString(),
    });

    return { ...pkg, ...updates };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('must be positive'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `${PROJECTS_COL}/${projectId}/${BUDGET_PACKAGES_COL}/${packageId}`);
  }
}

// ── Service Export ───────────────────────────────────────────────────────────

export const budgetService = {
  getBudgetSummary,
  getBudgetPackages,
  addVariation,
  checkOverBudget,
  recordExpenditure,
  // Pure functions exported for testing
  computeVariance,
  isOverBudgetThreshold,
  computeForecastAtCompletion,
};

export default budgetService;
