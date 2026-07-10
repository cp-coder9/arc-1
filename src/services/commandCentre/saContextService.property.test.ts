/**
 * Property 17: SACAP Stage Mapping
 *
 * - Same input always produces same output; mapping is deterministic
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { mapToSACAPStage, getArchitexStages } from './saContextService';
import type { ArchitexStage } from './saContextService';

// ── Arbitraries ──────────────────────────────────────────────────────────────

const ALL_ARCHITEX_STAGES: ArchitexStage[] = [
  'brief', 'appoint', 'design', 'comply', 'procure', 'build', 'pay', 'closeout',
];

const architexStageArb = fc.constantFrom<ArchitexStage>(...ALL_ARCHITEX_STAGES);

// ── Expected mapping (from design doc) ───────────────────────────────────────

const EXPECTED_MAPPING: Record<ArchitexStage, string> = {
  brief: 'Stage 1 - Inception',
  appoint: 'Stage 2 - Concept & Viability',
  design: 'Stage 3 - Design Development',
  comply: 'Stage 4 - Documentation & Procurement',
  procure: 'Stage 4 - Documentation & Procurement',
  build: 'Stage 5 - Construction',
  pay: 'Stage 5 - Construction',
  closeout: 'Stage 6 - Closeout',
};

// ── Property Tests ───────────────────────────────────────────────────────────

describe('Property 17: SACAP Stage Mapping', () => {
  it('mapToSACAPStage is deterministic — same input always produces same output', () => {
    fc.assert(
      fc.property(architexStageArb, (stage) => {
        const result1 = mapToSACAPStage(stage);
        const result2 = mapToSACAPStage(stage);
        expect(result1).toBe(result2);
      }),
      { numRuns: 100 },
    );
  });

  it('mapToSACAPStage returns the expected SACAP stage for each Architex stage', () => {
    fc.assert(
      fc.property(architexStageArb, (stage) => {
        const result = mapToSACAPStage(stage);
        expect(result).toBe(EXPECTED_MAPPING[stage]);
      }),
      { numRuns: 100 },
    );
  });

  it('all valid Architex stages map to a non-empty SACAP stage string', () => {
    fc.assert(
      fc.property(architexStageArb, (stage) => {
        const result = mapToSACAPStage(stage);
        expect(result.length).toBeGreaterThan(0);
        expect(result).toMatch(/^Stage \d/);
      }),
      { numRuns: 100 },
    );
  });

  it('getArchitexStages returns all 8 stages', () => {
    const stages = getArchitexStages();
    expect(stages).toHaveLength(8);
    for (const stage of ALL_ARCHITEX_STAGES) {
      expect(stages).toContain(stage);
    }
  });

  it('mapping covers all 6 SACAP work stages', () => {
    const sacapStages = new Set(ALL_ARCHITEX_STAGES.map((s) => mapToSACAPStage(s)));
    expect(sacapStages.size).toBe(6);
  });
});
