/**
 * Unit tests for budgetService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: vi.fn(),
}));

const getDocMock = vi.mocked(firestore.getDoc);
const addDocMock = vi.mocked(firestore.addDoc);
const getDocsMock = vi.mocked(firestore.getDocs);
const updateDocMock = vi.mocked(firestore.updateDoc);

import {
  getBudgetSummary,
  getBudgetPackages,
  addVariation,
  checkOverBudget,
  recordExpenditure,
  computeVariance,
  isOverBudgetThreshold,
  computeForecastAtCompletion,
} from './budgetService';
import type { BudgetPackage } from './types';

describe('budgetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Pure Computation Functions ─────────────────────────────────────────────

  describe('computeVariance', () => {
    it('computes positive variance when over budget', () => {
      expect(computeVariance(1050, 1000)).toBeCloseTo(5);
    });

    it('computes negative variance when under budget', () => {
      expect(computeVariance(900, 1000)).toBeCloseTo(-10);
    });

    it('returns 0 when spent equals budget', () => {
      expect(computeVariance(1000, 1000)).toBe(0);
    });

    it('returns 0 when budget is 0', () => {
      expect(computeVariance(500, 0)).toBe(0);
    });
  });

  describe('isOverBudgetThreshold', () => {
    it('returns false when variance is exactly 5%', () => {
      // (1050 - 1000) / 1000 = 0.05 — NOT greater than 0.05
      expect(isOverBudgetThreshold(1050, 1000)).toBe(false);
    });

    it('returns true when variance is just above 5%', () => {
      // (1050.01 - 1000) / 1000 = 0.05001 — greater than 0.05
      expect(isOverBudgetThreshold(1050.01, 1000)).toBe(true);
    });

    it('returns false when variance is just below 5%', () => {
      // (1049.99 - 1000) / 1000 = 0.04999 — NOT greater than 0.05
      expect(isOverBudgetThreshold(1049.99, 1000)).toBe(false);
    });

    it('returns false when under budget', () => {
      expect(isOverBudgetThreshold(800, 1000)).toBe(false);
    });

    it('returns true when spent is positive and budget is 0', () => {
      expect(isOverBudgetThreshold(1, 0)).toBe(true);
    });

    it('returns false when both are 0', () => {
      expect(isOverBudgetThreshold(0, 0)).toBe(false);
    });
  });

  describe('computeForecastAtCompletion', () => {
    it('extrapolates based on progress and spend', () => {
      // spentToDate=500k, progressPercent=50 → forecast = 500k / 0.5 = 1M
      expect(computeForecastAtCompletion(500_000, 50)).toBe(1_000_000);
    });

    it('returns spentToDate when progress is 0', () => {
      expect(computeForecastAtCompletion(100_000, 0)).toBe(100_000);
    });

    it('returns spentToDate when progress is negative', () => {
      expect(computeForecastAtCompletion(100_000, -5)).toBe(100_000);
    });

    it('handles 100% progress correctly', () => {
      // spentToDate=1M, progress=100 → forecast = 1M / 1.0 = 1M
      expect(computeForecastAtCompletion(1_000_000, 100)).toBe(1_000_000);
    });
  });

  // ── checkOverBudget ────────────────────────────────────────────────────────

  describe('checkOverBudget', () => {
    it('returns true for over-budget package', () => {
      const pkg: BudgetPackage = {
        id: 'pkg-1',
        projectId: 'proj-1',
        name: 'Structural',
        budgetAmount: 100_000,
        committedAmount: 80_000,
        spentAmount: 106_000, // 6% over
        progressPercent: 60,
        variance: 6,
        isOverBudget: true,
      };
      expect(checkOverBudget(pkg)).toBe(true);
    });

    it('returns false for within-budget package', () => {
      const pkg: BudgetPackage = {
        id: 'pkg-2',
        projectId: 'proj-1',
        name: 'Electrical',
        budgetAmount: 200_000,
        committedAmount: 150_000,
        spentAmount: 195_000, // 2.5% under
        progressPercent: 80,
        variance: -2.5,
        isOverBudget: false,
      };
      expect(checkOverBudget(pkg)).toBe(false);
    });

    it('returns false at exactly 5% boundary', () => {
      const pkg: BudgetPackage = {
        id: 'pkg-3',
        projectId: 'proj-1',
        name: 'Plumbing',
        budgetAmount: 100_000,
        committedAmount: 100_000,
        spentAmount: 105_000, // exactly 5%
        progressPercent: 100,
        variance: 5,
        isOverBudget: false,
      };
      expect(checkOverBudget(pkg)).toBe(false);
    });
  });

  // ── getBudgetPackages ──────────────────────────────────────────────────────

  describe('getBudgetPackages', () => {
    it('returns all budget packages for a project', async () => {
      const mockPackages = [
        { id: 'pkg-1', projectId: 'proj-1', name: 'Structural', budgetAmount: 500_000, committedAmount: 400_000, spentAmount: 350_000, progressPercent: 70, variance: -30, isOverBudget: false },
        { id: 'pkg-2', projectId: 'proj-1', name: 'Electrical', budgetAmount: 200_000, committedAmount: 180_000, spentAmount: 220_000, progressPercent: 90, variance: 10, isOverBudget: true },
      ];
      getDocsMock.mockResolvedValue({
        docs: mockPackages.map((p) => ({ id: p.id, data: () => p })),
      } as any);

      const result = await getBudgetPackages('proj-1');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Structural');
      expect(result[1].name).toBe('Electrical');
    });

    it('returns empty array when no packages exist', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      const result = await getBudgetPackages('proj-1');
      expect(result).toEqual([]);
    });

    it('throws when projectId is empty', async () => {
      await expect(getBudgetPackages('')).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on failure', async () => {
      const error = new Error('Network error');
      getDocsMock.mockRejectedValue(error);

      await expect(getBudgetPackages('proj-1')).rejects.toThrow('Network error');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/budget_packages',
      );
    });
  });

  // ── addVariation ───────────────────────────────────────────────────────────

  describe('addVariation', () => {
    it('creates a variation and returns it with ID', async () => {
      addDocMock.mockResolvedValue({ id: 'var-1' } as any);

      const result = await addVariation('proj-1', {
        description: 'Additional scope for Phase 2',
        value: 250_000,
        approvedBy: 'user-qs-1',
      });

      expect(result.id).toBe('var-1');
      expect(result.description).toBe('Additional scope for Phase 2');
      expect(result.value).toBe(250_000);
      expect(result.approvedBy).toBe('user-qs-1');
      expect(result.projectId).toBe('proj-1');
      expect(result.createdAt).toBeDefined();
      expect(addDocMock).toHaveBeenCalled();
    });

    it('supports negative variation values (deductions)', async () => {
      addDocMock.mockResolvedValue({ id: 'var-2' } as any);

      const result = await addVariation('proj-1', {
        description: 'Scope reduction',
        value: -50_000,
        approvedBy: 'user-qs-1',
      });

      expect(result.value).toBe(-50_000);
    });

    it('rejects invalid input (missing description)', async () => {
      await expect(
        addVariation('proj-1', { description: '', value: 100_000, approvedBy: 'user-1' }),
      ).rejects.toThrow();
    });

    it('rejects invalid input (missing approvedBy)', async () => {
      await expect(
        addVariation('proj-1', { description: 'Test', value: 100_000, approvedBy: '' }),
      ).rejects.toThrow();
    });

    it('calls handleFirestoreError on persistence failure', async () => {
      const error = new Error('Write failed');
      addDocMock.mockRejectedValue(error);

      await expect(
        addVariation('proj-1', { description: 'Test var', value: 100_000, approvedBy: 'user-1' }),
      ).rejects.toThrow('Write failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'create',
        'projects/proj-1/variations',
      );
    });
  });

  // ── getBudgetSummary ───────────────────────────────────────────────────────

  describe('getBudgetSummary', () => {
    it('aggregates contract sum, variations, spent, forecast, and variance', async () => {
      const mockPackages = [
        { budgetAmount: 500_000, spentAmount: 300_000, progressPercent: 50, committedAmount: 400_000 },
        { budgetAmount: 300_000, spentAmount: 200_000, progressPercent: 60, committedAmount: 250_000 },
      ];
      const mockVariations = [
        { value: 100_000 },
        { value: -20_000 },
      ];

      getDocsMock
        .mockResolvedValueOnce({
          docs: mockPackages.map((p, i) => ({ id: `pkg-${i}`, data: () => p })),
        } as any)
        .mockResolvedValueOnce({
          docs: mockVariations.map((v, i) => ({ id: `var-${i}`, data: () => v })),
        } as any);

      const result = await getBudgetSummary('proj-1');

      // contractSum = 500k + 300k = 800k
      expect(result.contractSum).toBe(800_000);
      // approvedVariations = 100k + (-20k) = 80k
      expect(result.approvedVariations).toBe(80_000);
      // spentToDate = 300k + 200k = 500k
      expect(result.spentToDate).toBe(500_000);
      // overallProgress = (50*500k + 60*300k) / 800k = (25M + 18M) / 800k = 53.75
      // forecast = 500k / (53.75/100) = 500k / 0.5375 ≈ 930,232.56
      expect(result.forecastAtCompletion).toBeCloseTo(930_232.56, 0);
      // adjustedContractSum = 800k + 80k = 880k
      // costVariancePercent = (930232.56 - 880000) / 880000 * 100 ≈ 5.71%
      expect(result.costVariancePercent).toBeCloseTo(5.71, 0);
    });

    it('returns zero summary when no packages or variations exist', async () => {
      getDocsMock
        .mockResolvedValueOnce({ docs: [] } as any)
        .mockResolvedValueOnce({ docs: [] } as any);

      const result = await getBudgetSummary('proj-1');

      expect(result.contractSum).toBe(0);
      expect(result.approvedVariations).toBe(0);
      expect(result.spentToDate).toBe(0);
      expect(result.forecastAtCompletion).toBe(0);
      expect(result.costVariancePercent).toBe(0);
    });

    it('calls handleFirestoreError on failure', async () => {
      const error = new Error('Query failed');
      getDocsMock.mockRejectedValue(error);

      await expect(getBudgetSummary('proj-1')).rejects.toThrow('Query failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/budget_packages',
      );
    });
  });

  // ── recordExpenditure ──────────────────────────────────────────────────────

  describe('recordExpenditure', () => {
    const basePkg = {
      id: 'pkg-1',
      projectId: 'proj-1',
      name: 'Structural',
      budgetAmount: 100_000,
      committedAmount: 80_000,
      spentAmount: 90_000,
      progressPercent: 85,
      variance: -10,
      isOverBudget: false,
    };

    it('updates spentAmount and recalculates variance', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'pkg-1',
        data: () => basePkg,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await recordExpenditure('proj-1', 'pkg-1', 10_000);

      // newSpent = 90k + 10k = 100k → variance = (100k-100k)/100k*100 = 0%
      expect(result.spentAmount).toBe(100_000);
      expect(result.variance).toBe(0);
      expect(result.isOverBudget).toBe(false);
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('flags over-budget when threshold exceeded', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'pkg-1',
        data: () => basePkg,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      // Adding 16k: 90k + 16k = 106k → (106k-100k)/100k = 0.06 > 0.05
      const result = await recordExpenditure('proj-1', 'pkg-1', 16_000);

      expect(result.spentAmount).toBe(106_000);
      expect(result.isOverBudget).toBe(true);
      expect(result.variance).toBeCloseTo(6);
    });

    it('throws when package not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        recordExpenditure('proj-1', 'pkg-missing', 5000),
      ).rejects.toThrow("Budget package 'pkg-missing' not found");
    });

    it('throws when amount is zero or negative', async () => {
      await expect(
        recordExpenditure('proj-1', 'pkg-1', 0),
      ).rejects.toThrow('Expenditure amount must be positive');

      await expect(
        recordExpenditure('proj-1', 'pkg-1', -500),
      ).rejects.toThrow('Expenditure amount must be positive');
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'pkg-1',
        data: () => basePkg,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(
        recordExpenditure('proj-1', 'pkg-1', 5000),
      ).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/budget_packages/pkg-1',
      );
    });
  });
});
