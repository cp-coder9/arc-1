import { describe, it, expect } from 'vitest';
import {
  checkProfessionalEligibility,
  type ProfessionalApplicationData,
  type ProfessionalEligibility,
} from '../../services/projectMarketplaceService';

describe('checkProfessionalEligibility — pure eligibility check', () => {
  const baseEligibleData: ProfessionalApplicationData = {
    registrationNumber: 'REG-001',
    cpdPointsEarned: 30,
    cpdPointsRequired: 25,
    trustScore: 85,
    toolUsageHistory: { 'tool-1': 5, 'tool-2': 3 },
    recentProjects: [],
    registrationStatus: 'active',
    unresolvedDisputes: 0,
  };

  it('returns eligible when all conditions met', () => {
    const result = checkProfessionalEligibility(baseEligibleData);
    expect(result.eligible).toBe(true);
    expect(result.blockingConditions).toHaveLength(0);
  });

  it('blocks when Trust Score below 75', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      trustScore: 74,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingConditions).toContain('Trust Score below 75');
  });

  it('allows when Trust Score is exactly 75', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      trustScore: 75,
    });
    expect(result.eligible).toBe(true);
    expect(result.blockingConditions).toHaveLength(0);
  });

  it('blocks when registration is not active (inactive)', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      registrationStatus: 'inactive',
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingConditions).toContain('Professional registration is not active');
  });

  it('blocks when registration is not active (suspended)', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      registrationStatus: 'suspended',
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingConditions).toContain('Professional registration is not active');
  });

  it('blocks when CPD points earned below minimum required', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      cpdPointsEarned: 10,
      cpdPointsRequired: 25,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingConditions).toContain('CPD points earned below minimum required');
  });

  it('allows when CPD points exactly equal required', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      cpdPointsEarned: 25,
      cpdPointsRequired: 25,
    });
    expect(result.eligible).toBe(true);
    expect(result.blockingConditions).toHaveLength(0);
  });

  it('blocks when unresolved disputes exist', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      unresolvedDisputes: 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingConditions).toContain('One or more unresolved disputes in active escrow');
  });

  it('identifies multiple blocking conditions simultaneously', () => {
    const result = checkProfessionalEligibility({
      ...baseEligibleData,
      trustScore: 50,
      registrationStatus: 'suspended',
      cpdPointsEarned: 5,
      cpdPointsRequired: 30,
      unresolvedDisputes: 3,
    });
    expect(result.eligible).toBe(false);
    expect(result.blockingConditions).toHaveLength(4);
    expect(result.blockingConditions).toContain('Trust Score below 75');
    expect(result.blockingConditions).toContain('Professional registration is not active');
    expect(result.blockingConditions).toContain('CPD points earned below minimum required');
    expect(result.blockingConditions).toContain('One or more unresolved disputes in active escrow');
  });

  it('returns the correct ProfessionalEligibility shape', () => {
    const result: ProfessionalEligibility = checkProfessionalEligibility(baseEligibleData);
    expect(result).toHaveProperty('eligible');
    expect(result).toHaveProperty('blockingConditions');
    expect(typeof result.eligible).toBe('boolean');
    expect(Array.isArray(result.blockingConditions)).toBe(true);
  });
});
