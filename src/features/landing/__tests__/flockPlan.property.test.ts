// Feature: website-ui-redesign, Property 13
//
// Property 13: Flock plan bounds and settle opacity — Validates Requirements 12.2, 12.4
//
// For any grid spec and seed, `planFlock` produces between 30 and 60 Agent_Shards
// (count clamped), each with a size within the configured bounds and a divergent
// outward burst target that stays inside the viewport, with a uniform patrol
// speed across the whole field; and the settled-opacity cap the AgentField uses
// (SETTLE_MAX_OPACITY) is at most 0.25 and sits below the OS_Reveal card.
import fc from 'fast-check';
import {
  planFlock,
  FLOCK,
  SETTLE_MAX_OPACITY,
  type GridSpec,
} from '@/features/landing/flock/geometry';

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

// Smart generator: realistic viewports (>= 320px so a real Agent_Field exists),
// varied grid step, and seeds + counts that span well below, within, and well
// above the [30, 60] clamp range.
const gridArb: fc.Arbitrary<GridSpec> = fc.record({
  stepPx: fc.integer({ min: 10, max: 240 }),
  width: fc.integer({ min: 320, max: 3840 }),
  height: fc.integer({ min: 320, max: 2160 }),
});

const seedArb = fc.integer({ min: -2_147_483_648, max: 2_147_483_647 });
// Counts both in and out of the valid range (0 .. 200).
const countArb = fc.integer({ min: 0, max: 200 });

describe('Property 13: Flock plan bounds and settle opacity', () => {
  it('planFlock clamps count to [30,60], keeps sizes/targets/speed within bounds and divergent', () => {
    fc.assert(
      fc.property(gridArb, countArb, seedArb, (grid, count, seed) => {
        const plans = planFlock(grid, count, seed);

        // --- count clamped into [30, 60] (Req 12.2) ---
        expect(plans.length).toBeGreaterThanOrEqual(FLOCK.minAgents);
        expect(plans.length).toBeLessThanOrEqual(FLOCK.maxAgents);
        // exact clamped count for finite inputs
        expect(plans.length).toBe(
          clamp(Math.round(count), FLOCK.minAgents, FLOCK.maxAgents),
        );

        const targetKeys = new Set<string>();
        for (const p of plans) {
          // --- size within configured bounds (Req 12.2) ---
          expect(p.sizePx).toBeGreaterThanOrEqual(FLOCK.minSize);
          expect(p.sizePx).toBeLessThanOrEqual(FLOCK.maxSize);

          // --- burst target inside the viewport (Req 12.2) ---
          expect(p.burstTarget.x).toBeGreaterThanOrEqual(0);
          expect(p.burstTarget.x).toBeLessThanOrEqual(grid.width);
          expect(p.burstTarget.y).toBeGreaterThanOrEqual(0);
          expect(p.burstTarget.y).toBeLessThanOrEqual(grid.height);

          // --- uniform patrol speed across the whole field (Req 12.5 context) ---
          expect(p.speedPxPerSec).toBe(FLOCK.speedPxPerSec);

          targetKeys.add(`${p.burstTarget.x},${p.burstTarget.y}`);
        }

        // --- divergent dispersal: targets are not all identical (Req 12.2) ---
        expect(targetKeys.size).toBeGreaterThan(1);
      }),
      { numRuns: 100 },
    );
  });

  it('settle opacity cap (SETTLE_MAX_OPACITY) is at most 0.25 (Req 12.4)', () => {
    // The AgentField applies this cap once shards settle into the Agent_Field
    // beneath the OS_Reveal card; it is a fixed bound, asserted across runs.
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(SETTLE_MAX_OPACITY).toBeLessThanOrEqual(0.25);
        expect(SETTLE_MAX_OPACITY).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });
});
