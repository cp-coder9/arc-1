// Feature: website-ui-redesign — unit tests for pure flock geometry (task 7.1)
import { describe, it, expect } from 'vitest';
import {
  buildNodeLattice,
  planFlock,
  pointOnLoop,
  FLOCK,
  NODE_STEP_MULTIPLE,
  type GridSpec,
} from '@/features/landing/flock/geometry';

const DEFAULT_GRID: GridSpec = { stepPx: 54, width: 1280, height: 800 };
const SMALL_GRID: GridSpec = { stepPx: 54, width: 320, height: 568 };
const LARGE_GRID: GridSpec = { stepPx: 54, width: 3840, height: 2160 };

function nodeStep(grid: GridSpec) {
  return grid.stepPx * NODE_STEP_MULTIPLE;
}

describe('buildNodeLattice', () => {
  it.each([SMALL_GRID, DEFAULT_GRID, LARGE_GRID])(
    'places nodes at junctions every 2 steps, on grid lines and within bounds (%o)',
    (grid) => {
      const step = nodeStep(grid);
      const nodes = buildNodeLattice(grid);
      expect(nodes.length).toBeGreaterThan(0);
      for (const n of nodes) {
        // multiples of the node step => on a grid line and on a junction
        expect(n.x % step).toBe(0);
        expect(n.y % step).toBe(0);
        // never outside the viewport
        expect(n.x).toBeGreaterThanOrEqual(0);
        expect(n.y).toBeGreaterThanOrEqual(0);
        expect(n.x).toBeLessThanOrEqual(grid.width);
        expect(n.y).toBeLessThanOrEqual(grid.height);
      }
    },
  );

  it('is deterministic for a given grid', () => {
    expect(buildNodeLattice(DEFAULT_GRID)).toEqual(buildNodeLattice(DEFAULT_GRID));
  });
});

describe('planFlock', () => {
  it('clamps the agent count into [30, 60]', () => {
    expect(planFlock(DEFAULT_GRID, 5, 1)).toHaveLength(FLOCK.minAgents);
    expect(planFlock(DEFAULT_GRID, 1000, 1)).toHaveLength(FLOCK.maxAgents);
    expect(planFlock(DEFAULT_GRID, 45, 1)).toHaveLength(45);
  });

  it('is reproducible for a given seed and differs across seeds', () => {
    expect(planFlock(DEFAULT_GRID, 40, 7)).toEqual(planFlock(DEFAULT_GRID, 40, 7));
    expect(planFlock(DEFAULT_GRID, 40, 7)).not.toEqual(planFlock(DEFAULT_GRID, 40, 8));
  });

  it.each([SMALL_GRID, DEFAULT_GRID, LARGE_GRID])(
    'produces valid shards: sizes within bounds, in-bounds targets, uniform speed, grid-aligned square loops (%o)',
    (grid) => {
      const step = nodeStep(grid);
      const plans = planFlock(grid, 50, 123);
      for (const p of plans) {
        // size within bounds
        expect(p.sizePx).toBeGreaterThanOrEqual(FLOCK.minSize);
        expect(p.sizePx).toBeLessThanOrEqual(FLOCK.maxSize);
        // burst target within viewport
        expect(p.burstTarget.x).toBeGreaterThanOrEqual(0);
        expect(p.burstTarget.x).toBeLessThanOrEqual(grid.width);
        expect(p.burstTarget.y).toBeGreaterThanOrEqual(0);
        expect(p.burstTarget.y).toBeLessThanOrEqual(grid.height);
        // uniform speed
        expect(p.speedPxPerSec).toBe(FLOCK.speedPxPerSec);
        // closed rectangular (square) loop on the node grid
        expect(p.loop).toHaveLength(4);
        for (const corner of p.loop) {
          expect(corner.x % step).toBe(0);
          expect(corner.y % step).toBe(0);
          expect(corner.x).toBeLessThanOrEqual(grid.width);
          expect(corner.y).toBeLessThanOrEqual(grid.height);
        }
        // it is a square
        const w = Math.abs(p.loop[1].x - p.loop[0].x) + Math.abs(p.loop[1].y - p.loop[0].y);
        const sides = p.loop.map((c, i) => {
          const nx = p.loop[(i + 1) % 4];
          return Math.abs(nx.x - c.x) + Math.abs(nx.y - c.y);
        });
        for (const s of sides) expect(s).toBe(w);
      }
    },
  );

  it('produces divergent burst targets (not all clustered in one direction)', () => {
    const plans = planFlock(DEFAULT_GRID, 40, 99);
    const cx = DEFAULT_GRID.width / 2;
    const cy = DEFAULT_GRID.height / 2;
    const angles = new Set(
      plans.map((p) => {
        const a = Math.atan2(p.burstTarget.y - cy, p.burstTarget.x - cx);
        // bucket into 8 sectors
        return Math.round((((a + Math.PI) / (2 * Math.PI)) * 8)) % 8;
      }),
    );
    expect(angles.size).toBeGreaterThanOrEqual(4);
  });

  it('mixes clockwise and counter-clockwise agents', () => {
    const plans = planFlock(DEFAULT_GRID, 40, 5);
    expect(plans.some((p) => p.clockwise)).toBe(true);
    expect(plans.some((p) => !p.clockwise)).toBe(true);
  });
});

describe('pointOnLoop', () => {
  const loop = planFlock(DEFAULT_GRID, 30, 1)[0].loop;
  const step = nodeStep(DEFAULT_GRID);

  it('returns endpoints at t=0 and t=1 (closed loop)', () => {
    const at0 = pointOnLoop(loop, 0);
    const at1 = pointOnLoop(loop, 1);
    expect({ x: at0.x, y: at0.y }).toEqual({ x: loop[0].x, y: loop[0].y });
    expect({ x: at1.x, y: at1.y }).toEqual({ x: loop[0].x, y: loop[0].y });
  });

  it('always lies on a grid line shared with the node lattice', () => {
    for (let i = 0; i <= 100; i += 1) {
      const t = i / 100;
      const pt = pointOnLoop(loop, t);
      const onGrid = pt.x % step === 0 || pt.y % step === 0;
      expect(onGrid).toBe(true);
    }
  });

  it('travels at uniform speed (equal arc length per equal dt)', () => {
    const samples = 8;
    const dists: number[] = [];
    let prev = pointOnLoop(loop, 0);
    for (let i = 1; i <= samples; i += 1) {
      const cur = pointOnLoop(loop, i / samples);
      dists.push(Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y));
      prev = cur;
    }
    const first = dists[0];
    for (const d of dists) expect(d).toBeCloseTo(first, 6);
  });

  it('reports only axis-aligned directions and changes them at corners', () => {
    const dirs = new Set([0.05, 0.3, 0.55, 0.8].map((t) => pointOnLoop(loop, t).dir));
    // a square loop visits all four directions
    expect(dirs.size).toBe(4);
  });

  it('has both vertical and horizontal travel present across agents at every sampled instant', () => {
    const plans = planFlock(DEFAULT_GRID, 40, 42);
    for (let i = 0; i < 20; i += 1) {
      const t = i / 20;
      const dirs = plans.map((p) => pointOnLoop(p.loop, t).dir);
      const hasHorizontal = dirs.some((d) => d === 'left' || d === 'right');
      const hasVertical = dirs.some((d) => d === 'up' || d === 'down');
      expect(hasHorizontal).toBe(true);
      expect(hasVertical).toBe(true);
    }
  });
});
