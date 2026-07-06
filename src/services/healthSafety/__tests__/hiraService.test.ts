/**
 * Unit tests for HIRA Engine edge cases.
 *
 * Validates: Requirements 5.4
 */

import { describe, it, expect } from 'vitest';
import {
  calculateRiskRating,
  createHazard,
  updateControls,
  getHighRiskHazards,
} from '../hiraService';
import type { HazardEntry } from '../hsTypes';

describe('HIRA Service — Edge Cases', () => {
  // ─── Boundary Values ──────────────────────────────────────────────────────

  describe('calculateRiskRating boundary values', () => {
    it('likelihood=1, severity=1 → rating=1, level="low"', () => {
      const result = calculateRiskRating(1, 1);
      expect(result.rating).toBe(1);
      expect(result.level).toBe('low');
    });

    it('likelihood=5, severity=5 → rating=25, level="critical"', () => {
      const result = calculateRiskRating(5, 5);
      expect(result.rating).toBe(25);
      expect(result.level).toBe('critical');
    });

    it('likelihood=2, severity=2 → rating=4, level="low" (max of low range)', () => {
      const result = calculateRiskRating(2, 2);
      expect(result.rating).toBe(4);
      expect(result.level).toBe('low');
    });

    it('likelihood=1, severity=5 → rating=5, level="medium" (min of medium range)', () => {
      const result = calculateRiskRating(1, 5);
      expect(result.rating).toBe(5);
      expect(result.level).toBe('medium');
    });
  });

  // ─── Control Update Triggers Recalculation ────────────────────────────────

  describe('updateControls triggers residual risk recalculation', () => {
    it('reduces severity by 1 and recalculates residual risk', () => {
      const hazard = createHazard({
        projectId: 'proj-1',
        description: 'Working at height without fall protection',
        activity: 'Roof work',
        location: 'Building A roof',
        likelihood: 4,
        severity: 4,
        existingControls: ['Safety briefing'],
        additionalControls: [],
        responsiblePerson: 'John Smith',
      });

      // Initial: 4×4 = 16 → critical
      expect(hazard.riskRating).toBe(16);
      expect(hazard.residualRisk).toBe('critical');

      // After controls: severity reduced by 1 → 4×3 = 12 → high
      const updated = updateControls(hazard, ['Harness', 'Safety net']);
      expect(updated.residualRisk).toBe('high');
      expect(updated.additionalControls).toEqual(['Harness', 'Safety net']);
    });
  });

  // ─── Empty Controls Array Handling ────────────────────────────────────────

  describe('updateControls with empty controls array', () => {
    it('still reduces severity by 1 even with empty controls', () => {
      const hazard = createHazard({
        projectId: 'proj-2',
        description: 'Electrical work near live circuits',
        activity: 'Electrical installation',
        location: 'Panel room',
        likelihood: 3,
        severity: 3,
        existingControls: ['Lockout-tagout'],
        additionalControls: [],
        responsiblePerson: 'Jane Doe',
      });

      // Initial: 3×3 = 9 → medium (threshold boundary: medium is 5–9)
      expect(hazard.riskRating).toBe(9);
      expect(hazard.residualRisk).toBe('medium');

      // After empty controls: severity reduced by 1 → 3×2 = 6 → medium
      const updated = updateControls(hazard, []);
      expect(updated.residualRisk).toBe('medium');
      expect(updated.additionalControls).toEqual([]);
    });
  });

  // ─── getHighRiskHazards with Mixed List ───────────────────────────────────

  describe('getHighRiskHazards with mixed risk levels', () => {
    it('returns only high and critical hazards', () => {
      const baseHazard: Omit<HazardEntry, 'id' | 'residualRisk' | 'riskRating' | 'createdAt' | 'updatedAt' | 'likelihood' | 'severity'> = {
        projectId: 'proj-3',
        description: 'Test hazard',
        activity: 'General work',
        location: 'Site A',
        existingControls: [],
        additionalControls: [],
        responsiblePerson: 'Test Person',
      };

      const hazards: HazardEntry[] = [
        {
          ...baseHazard,
          id: 'h1',
          likelihood: 1,
          severity: 1,
          riskRating: 1,
          residualRisk: 'low',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          ...baseHazard,
          id: 'h2',
          likelihood: 1,
          severity: 5,
          riskRating: 5,
          residualRisk: 'medium',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          ...baseHazard,
          id: 'h3',
          likelihood: 3,
          severity: 4,
          riskRating: 12,
          residualRisk: 'high',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          ...baseHazard,
          id: 'h4',
          likelihood: 5,
          severity: 5,
          riskRating: 25,
          residualRisk: 'critical',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          ...baseHazard,
          id: 'h5',
          likelihood: 2,
          severity: 2,
          riskRating: 4,
          residualRisk: 'low',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ];

      const highRisk = getHighRiskHazards(hazards);

      expect(highRisk).toHaveLength(2);
      expect(highRisk.map((h) => h.id)).toEqual(['h3', 'h4']);
      expect(highRisk.every((h) => h.residualRisk === 'high' || h.residualRisk === 'critical')).toBe(true);
    });
  });
});
