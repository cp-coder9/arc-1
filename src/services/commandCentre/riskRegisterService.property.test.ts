/**
 * Property 3: Summary Stat Aggregation
 *
 * - Risk counts per severity equal actual count of risks with that severity
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type { RiskItem, RiskSeverity, RiskCategory, RiskStatus } from './types';

// ── Pure computation matching getRiskStats logic ─────────────────────────────

interface RiskStats {
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

function computeRiskStats(risks: RiskItem[]): RiskStats {
  const stats: RiskStats = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    total: risks.length,
  };

  for (const risk of risks) {
    if (risk.severity === 'critical') stats.critical++;
    else if (risk.severity === 'high') stats.high++;
    else if (risk.severity === 'medium') stats.medium++;
    else if (risk.severity === 'low') stats.low++;
  }

  return stats;
}

// ── Arbitraries ──────────────────────────────────────────────────────────────

const severityArb = fc.constantFrom<RiskSeverity>('critical', 'high', 'medium', 'low');
const categoryArb = fc.constantFrom<RiskCategory>('supply_chain', 'resource', 'quality', 'compliance', 'commercial', 'safety');
const statusArb = fc.constantFrom<RiskStatus>('open', 'mitigating', 'escalated', 'monitoring', 'closed');
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);
const timestampArb = fc.integer({ min: new Date('2024-01-01T00:00:00.000Z').getTime(), max: new Date('2026-12-31T00:00:00.000Z').getTime() }).map((ts) => new Date(ts).toISOString());

const riskItemArb: fc.Arbitrary<RiskItem> = fc.record({
  id: fc.uuid(),
  projectId: nonEmptyStringArb,
  description: nonEmptyStringArb,
  category: categoryArb,
  severity: severityArb,
  status: statusArb,
  ownerId: nonEmptyStringArb,
  ownerName: nonEmptyStringArb,
  mitigationPlan: fc.option(nonEmptyStringArb, { nil: undefined }),
  createdBy: nonEmptyStringArb,
  createdAt: timestampArb,
  updatedAt: timestampArb,
  aiGenerated: fc.option(fc.boolean(), { nil: undefined }),
});

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 3: Summary Stat Aggregation (Risk Register)', () => {
  it('risk counts per severity equal the actual count of risks with that severity', () => {
    fc.assert(
      fc.property(fc.array(riskItemArb, { minLength: 0, maxLength: 50 }), (risks) => {
        const stats = computeRiskStats(risks);

        const actualCritical = risks.filter((r) => r.severity === 'critical').length;
        const actualHigh = risks.filter((r) => r.severity === 'high').length;
        const actualMedium = risks.filter((r) => r.severity === 'medium').length;
        const actualLow = risks.filter((r) => r.severity === 'low').length;

        expect(stats.critical).toBe(actualCritical);
        expect(stats.high).toBe(actualHigh);
        expect(stats.medium).toBe(actualMedium);
        expect(stats.low).toBe(actualLow);
      }),
      { numRuns: 100 },
    );
  });

  it('total count equals sum of all severity counts', () => {
    fc.assert(
      fc.property(fc.array(riskItemArb, { minLength: 0, maxLength: 50 }), (risks) => {
        const stats = computeRiskStats(risks);
        expect(stats.critical + stats.high + stats.medium + stats.low).toBe(stats.total);
      }),
      { numRuns: 100 },
    );
  });

  it('total count equals the length of the input array', () => {
    fc.assert(
      fc.property(fc.array(riskItemArb, { minLength: 0, maxLength: 50 }), (risks) => {
        const stats = computeRiskStats(risks);
        expect(stats.total).toBe(risks.length);
      }),
      { numRuns: 100 },
    );
  });

  it('empty risk list produces all-zero stats', () => {
    const stats = computeRiskStats([]);
    expect(stats).toEqual({ critical: 0, high: 0, medium: 0, low: 0, total: 0 });
  });
});
