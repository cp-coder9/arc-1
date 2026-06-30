// Feature: website-ui-redesign, Property 14: Agent paths stay on the grid
//
// For any agent loop produced by `planFlock` and for any progress value t in
// [0,1], the point returned by `pointOnLoop` lies on a Grid_Background line
// between two Network_Nodes (sharing an x or y coordinate with the node
// lattice), every node used by the loop sits at a grid junction, direction
// changes occur only at Network_Nodes, agent speed is uniform across the field,
// and at any instant both vertical and horizontal travel directions are present
// across the agents.
//
// Validates: Requirements 12.5, 13.2, 13.5
import fc from 'fast-check';
import {
  buildNodeLattice,
  planFlock,
  pointOnLoop,
  NODE_STEP_MULTIPLE,
  type GridSpec,
  type Node,
  type Direction,
} from '@/features/landing/flock/geometry';

const NUM_RUNS = 100;
const EPS = 1e-6;

// --- Generators ------------------------------------------------------------

/** Realistic grid specs: viewport widths 320..3840, finite positive step. */
const gridArb: fc.Arbitrary<GridSpec> = fc.record({
  stepPx: fc.integer({ min: 10, max: 100 }),
  width: fc.integer({ min: 320, max: 3840 }),
  height: fc.integer({ min: 320, max: 2160 }),
});

const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });
const countArb = fc.integer({ min: 1, max: 200 }); // planFlock clamps into [30,60]
const tArb = fc.double({ min: 0, max: 1, noNaN: true });

// --- Helpers ---------------------------------------------------------------

const VALID_DIRECTIONS: ReadonlySet<Direction> = new Set<Direction>([
  'up',
  'down',
  'left',
  'right',
]);

/** A point lies on a loop edge iff it shares the constant coordinate of an
 *  axis-aligned edge AND falls between that edge's two corner nodes. */
function liesOnLoopEdge(loop: Node[], pt: { x: number; y: number }): boolean {
  const n = loop.length;
  for (let i = 0; i < n; i += 1) {
    const a = loop[i];
    const b = loop[(i + 1) % n];
    if (Math.abs(a.x - b.x) <= EPS) {
      // vertical edge: x constant, y varies between corners
      const loY = Math.min(a.y, b.y);
      const hiY = Math.max(a.y, b.y);
      if (Math.abs(pt.x - a.x) <= EPS && pt.y >= loY - EPS && pt.y <= hiY + EPS) {
        return true;
      }
    }
    if (Math.abs(a.y - b.y) <= EPS) {
      // horizontal edge: y constant, x varies between corners
      const loX = Math.min(a.x, b.x);
      const hiX = Math.max(a.x, b.x);
      if (Math.abs(pt.y - a.y) <= EPS && pt.x >= loX - EPS && pt.x <= hiX + EPS) {
        return true;
      }
    }
  }
  return false;
}

// --- Property 14 -----------------------------------------------------------

describe('Property 14: Agent paths stay on the grid', () => {
  it('pointOnLoop always lands on a loop edge / grid line between two nodes', () => {
    fc.assert(
      fc.property(gridArb, countArb, seedArb, tArb, (grid, count, seed, t) => {
        const plans = planFlock(grid, count, seed);
        const allOnGrid = plans.every((plan) =>
          liesOnLoopEdge(plan.loop, pointOnLoop(plan.loop, t)),
        );
        expect(allOnGrid).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 30000);

  it('every node in the lattice and every loop corner sits at a grid junction', () => {
    fc.assert(
      fc.property(gridArb, countArb, seedArb, (grid, count, seed) => {
        const nodeStep = grid.stepPx * NODE_STEP_MULTIPLE;

        // Lattice junctions are exact multiples of stepPx * NODE_STEP_MULTIPLE.
        const latticeOk = buildNodeLattice(grid).every(
          (node) => node.x % nodeStep === 0 && node.y % nodeStep === 0,
        );
        expect(latticeOk).toBe(true);

        // Loop corners ride those same junctions.
        const cornersOk = planFlock(grid, count, seed).every((plan) =>
          plan.loop.every(
            (corner) => corner.x % nodeStep === 0 && corner.y % nodeStep === 0,
          ),
        );
        expect(cornersOk).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  }, 30000);

  it('direction is axis-aligned, changes only at corner nodes, and speed is uniform', () => {
    // Corners of a 4-edge square fall on quarter boundaries of arc length.
    const quarterBoundaries = [0.25, 0.5, 0.75];
    // 12 / 24 are multiples of 4 so sample boundaries land on corners, keeping
    // each interval inside a single edge (Manhattan distance == arc length).
    const SPEED_SAMPLES = 12;
    const DIR_SAMPLES = 24;

    // Returns the offending plan (or null) so we only call `expect` once per run.
    function findViolatingPlan(grid: GridSpec, count: number, seed: number) {
      const plans = planFlock(grid, count, seed);
      const baseSpeed = plans[0].speedPxPerSec;

      for (const plan of plans) {
        if (plan.speedPxPerSec !== baseSpeed) return { plan, reason: 'speed' };

        // --- uniform speed: equal t deltas map to equal arc length ---
        let prev = pointOnLoop(plan.loop, 0);
        const expectedStep =
          Math.abs(pointOnLoop(plan.loop, 1 / SPEED_SAMPLES).x - prev.x) +
          Math.abs(pointOnLoop(plan.loop, 1 / SPEED_SAMPLES).y - prev.y);
        const tol = Math.max(EPS, expectedStep * 1e-6);
        for (let k = 1; k <= SPEED_SAMPLES; k += 1) {
          const cur = pointOnLoop(plan.loop, k / SPEED_SAMPLES);
          const d = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
          if (Math.abs(d - expectedStep) > tol) return { plan, reason: 'speed-uniformity' };
          prev = cur;
        }

        // --- direction validity + change only at corner nodes ---
        let prevT = 0;
        let prevDir = pointOnLoop(plan.loop, 0).dir;
        if (!VALID_DIRECTIONS.has(prevDir)) return { plan, reason: 'direction-value' };
        for (let k = 1; k <= DIR_SAMPLES; k += 1) {
          const t = k / DIR_SAMPLES;
          const { dir } = pointOnLoop(plan.loop, t);
          if (!VALID_DIRECTIONS.has(dir)) return { plan, reason: 'direction-value' };
          if (dir !== prevDir) {
            const straddlesCorner = quarterBoundaries.some(
              (qb) => qb >= prevT - EPS && qb <= t + EPS,
            );
            if (!straddlesCorner) return { plan, reason: 'direction-change-off-node' };
          }
          prevT = t;
          prevDir = dir;
        }
      }
      return null;
    }

    fc.assert(
      fc.property(gridArb, countArb, seedArb, (grid, count, seed) => {
        const violation = findViolatingPlan(grid, count, seed);
        expect(violation).toBeNull();
      }),
      { numRuns: NUM_RUNS },
    );
  }, 30000);

  it('at any instant both vertical and horizontal travel exist across the field', () => {
    fc.assert(
      fc.property(gridArb, seedArb, tArb, (grid, seed, t) => {
        const plans = planFlock(grid, 50, seed);
        const dirs = plans.map((p) => pointOnLoop(p.loop, t).dir);
        const hasHorizontal = dirs.some((d) => d === 'left' || d === 'right');
        const hasVertical = dirs.some((d) => d === 'up' || d === 'down');
        expect(hasHorizontal).toBe(true);
        expect(hasVertical).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
