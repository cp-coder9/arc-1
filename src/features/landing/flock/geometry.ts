// Feature: website-ui-redesign
//
// Pure, DOM-free flock geometry for the Landing_Page Flock_Activation sequence.
//
// These functions compute the geometry of the Agent_Field: where the grid
// junctions (Network_Nodes) sit, how the Agent_Shards disperse, and the closed
// rectangular loops the agents patrol along the grid lines. They contain no DOM
// access and are fully deterministic for a given `seed`, so they can be exercised
// by property-based tests (design Properties 13 & 14).
//
// Coordinate system: screen pixels with the origin at the top-left. `x` grows to
// the right, `y` grows downward. Hence a positive `dy` is `'down'` and a negative
// `dy` is `'up'`.

// ---------------------------------------------------------------------------
// Public interfaces (mirrors design.md)
// ---------------------------------------------------------------------------

export interface GridSpec {
  /** Size of one grid cell in pixels. Grid lines are drawn every `stepPx`. */
  stepPx: number;
  /** Viewport width in pixels. */
  width: number;
  /** Viewport height in pixels. */
  height: number;
}

/** A node sits at a grid junction (every 2 grid steps). */
export interface Node {
  x: number;
  y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface AgentPlan {
  id: number;
  /** Mini-bird size in px, within FLOCK.minSize..FLOCK.maxSize (Req 12.2). */
  sizePx: number;
  /** Divergent outward dispersal target for the explode phase. */
  burstTarget: { x: number; y: number };
  /** Closed rectangular loop on the node grid the agent patrols (Req 12.5). */
  loop: Node[];
  /** Travel direction around the loop; mixed across agents (Req 12.5). */
  clockwise: boolean;
  /** Patrol speed; uniform across the whole field (Req 12.5). */
  speedPxPerSec: number;
}

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/**
 * Canonical flock bounds (design Data Models): Agent_Shard count range 30–60,
 * varying size range 20–60px, and the uniform patrol speed (Req 12.2, 12.5).
 */
export const FLOCK = {
  minAgents: 30,
  maxAgents: 60,
  minSize: 20,
  maxSize: 60,
  speedPxPerSec: 30,
} as const;

/** Network_Nodes (junctions) sit every this many grid steps (Req 13.2). */
export const NODE_STEP_MULTIPLE = 2;

/** Maximum settled opacity of an Agent_Shard (Req 12.4) — used by AgentField. */
export const SETTLE_MAX_OPACITY = 0.25;

// ---------------------------------------------------------------------------
// Deterministic seeded RNG (mulberry32)
// ---------------------------------------------------------------------------

/**
 * Creates a deterministic pseudo-random generator from a 32-bit seed.
 * Returns a function producing floats in [0, 1). Same seed → same sequence,
 * so all geometry derived from it is reproducible for property tests.
 */
function createRng(seed: number): () => number {
  // Normalise to a non-negative 32-bit integer; guard against NaN/Infinity.
  let state = Number.isFinite(seed) ? Math.floor(seed) : 0;
  state = state >>> 0;
  if (state === 0) state = 0x9e3779b9; // avoid the all-zero fixed point
  return function next(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function clamp(value: number, lo: number, hi: number): number {
  if (value < lo) return lo;
  if (value > hi) return hi;
  return value;
}

/** Sanitises a GridSpec so every downstream calculation stays finite & positive. */
function normaliseGrid(grid: GridSpec): { stepPx: number; width: number; height: number; nodeStep: number } {
  const stepPx = Number.isFinite(grid.stepPx) && grid.stepPx > 0 ? grid.stepPx : 1;
  const width = Number.isFinite(grid.width) && grid.width > 0 ? grid.width : 0;
  const height = Number.isFinite(grid.height) && grid.height > 0 ? grid.height : 0;
  const nodeStep = stepPx * NODE_STEP_MULTIPLE;
  return { stepPx, width, height, nodeStep };
}

// ---------------------------------------------------------------------------
// buildNodeLattice
// ---------------------------------------------------------------------------

/**
 * Builds the Network_Node lattice from a grid spec. Nodes sit at grid junctions
 * every 2 grid steps (Req 13.2), spanning the viewport from the origin up to the
 * last junction that fits within `width`/`height`. Every returned coordinate is a
 * multiple of `stepPx`, so each node lies exactly on a grid line and never falls
 * outside the viewport bounds — for any viewport from 320px to 3840px.
 */
export function buildNodeLattice(grid: GridSpec): Node[] {
  const { width, height, nodeStep } = normaliseGrid(grid);

  const xs: number[] = [];
  for (let x = 0; x <= width + 1e-9; x += nodeStep) xs.push(x);
  const ys: number[] = [];
  for (let y = 0; y <= height + 1e-9; y += nodeStep) ys.push(y);

  // Always expose at least the origin so callers never receive an empty lattice.
  if (xs.length === 0) xs.push(0);
  if (ys.length === 0) ys.push(0);

  const nodes: Node[] = [];
  for (const y of ys) {
    for (const x of xs) {
      nodes.push({ x, y });
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// planFlock
// ---------------------------------------------------------------------------

/**
 * Produces deterministic Agent_Shard plans for a grid + seed.
 *
 * Guarantees (design Property 13 / 14):
 *  - the count is clamped into [30, 60] regardless of the requested `count`;
 *  - every shard's `sizePx` is within FLOCK.minSize..FLOCK.maxSize;
 *  - every shard has a divergent outward `burstTarget` (angles fanned around the
 *    hero centre) that stays within the viewport;
 *  - every `loop` is a closed, axis-aligned SQUARE whose corners are grid
 *    junctions, so agents travel node-to-node strictly along grid lines;
 *  - travel direction is mixed: both clockwise and counter-clockwise agents are
 *    always present, which (because square loops share equal quarter-perimeters)
 *    guarantees both vertical and horizontal travel exist at every instant;
 *  - `speedPxPerSec` is uniform across the whole field.
 */
export function planFlock(grid: GridSpec, count: number, seed: number): AgentPlan[] {
  const { stepPx, width, height, nodeStep } = normaliseGrid(grid);
  const rng = createRng(seed);

  const safeCount = clamp(
    Number.isFinite(count) ? Math.round(count) : FLOCK.minAgents,
    FLOCK.minAgents,
    FLOCK.maxAgents,
  );

  // How many full node-cells fit on each axis. A cell spans one `nodeStep`, so a
  // unit square loop occupies columns [col, col+1] and rows [row, row+1].
  const cols = Math.floor(width / nodeStep);
  const rows = Math.floor(height / nodeStep);
  const hasNodeGrid = cols >= 1 && rows >= 1;

  // Fallback side for pathological viewports too small to contain a node-cell
  // (e.g. an extreme stepPx vs. width combination). Snap to a grid line so the
  // loop still rides grid lines and never leaves the viewport.
  const degenerateSide = Math.max(
    stepPx,
    Math.floor(Math.max(0, Math.min(width, height)) / stepPx) * stepPx || stepPx,
  );

  const centerX = width / 2;
  const centerY = height / 2;
  // Largest radius that still keeps burst targets inside the viewport.
  const maxRadius = Math.max(1, Math.min(width, height) / 2);

  const plans: AgentPlan[] = [];

  for (let i = 0; i < safeCount; i += 1) {
    // --- size: within bounds, deterministic ---
    const sizePx =
      FLOCK.minSize + rng() * (FLOCK.maxSize - FLOCK.minSize);

    // --- divergent burst target: fan angles evenly around the centre + jitter ---
    const angle = (i / safeCount) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / safeCount);
    const radius = (0.35 + 0.65 * rng()) * maxRadius;
    const burstTarget = {
      x: clamp(centerX + Math.cos(angle) * radius, 0, width),
      y: clamp(centerY + Math.sin(angle) * radius, 0, height),
    };

    // --- mixed direction: alternate so both orientations always coexist ---
    // Travel direction is encoded directly in the loop's corner ordering so a
    // 2-arg `pointOnLoop(loop, t)` reproduces it. Clockwise and counter-clockwise
    // loops share the SAME start corner and traverse oppositely, so at any t a
    // clockwise agent and a counter-clockwise agent move on perpendicular edges —
    // guaranteeing both vertical and horizontal travel exist across the field.
    const clockwise = i % 2 === 0;

    // --- square loop anchored on the node grid ---
    let loop: Node[];
    if (hasNodeGrid) {
      // Square side in node-cells (1..k) that still fits from the chosen anchor.
      const col = Math.floor(rng() * cols); // 0..cols-1
      const row = Math.floor(rng() * rows); // 0..rows-1
      const maxK = Math.min(cols - col, rows - row); // keep it square & in-bounds
      const k = 1 + Math.floor(rng() * Math.max(1, maxK));
      const side = k * nodeStep;
      const x0 = col * nodeStep;
      const y0 = row * nodeStep;
      loop = squareLoop(x0, y0, side, clockwise);
    } else {
      loop = squareLoop(0, 0, degenerateSide, clockwise);
    }

    plans.push({
      id: i,
      sizePx,
      burstTarget,
      loop,
      clockwise,
      speedPxPerSec: FLOCK.speedPxPerSec,
    });
  }

  return plans;
}

/**
 * Builds the four corners of an axis-aligned square loop in travel order.
 *
 * Both orderings start at the same top-left corner so a clockwise loop and a
 * counter-clockwise loop are exact mirrors:
 *  - clockwise:        TL → TR → BR → BL  (edges: right, down, left, up)
 *  - counter-clockwise: TL → BL → BR → TR  (edges: down, right, up, left)
 *
 * Because both are squares with equal quarter-perimeters, at any progress `t`
 * the clockwise loop is on a horizontal edge exactly when the counter-clockwise
 * loop is on a vertical edge (and vice versa).
 */
function squareLoop(x0: number, y0: number, side: number, clockwise: boolean): Node[] {
  const x1 = x0 + side;
  const y1 = y0 + side;
  const TL = { x: x0, y: y0 };
  const TR = { x: x1, y: y0 };
  const BR = { x: x1, y: y1 };
  const BL = { x: x0, y: y1 };
  return clockwise ? [TL, TR, BR, BL] : [TL, BL, BR, TR];
}

// ---------------------------------------------------------------------------
// pointOnLoop
// ---------------------------------------------------------------------------

/**
 * Returns the point travelling node-to-node along a closed loop at progress
 * `t` in [0, 1], parameterised by arc length so speed is uniform (Req 12.5).
 *
 * The loop is traversed in the order its corners are given, closing back from
 * `loop[n-1]` to `loop[0]`. The travel direction (clockwise vs. counter-clockwise)
 * is therefore encoded by the corner ordering produced by `planFlock`. Because
 * every segment between corners is axis-aligned and the corners are grid
 * junctions, the returned point always shares an x or y coordinate with the node
 * lattice (it stays on a grid line), and the reported direction only changes at
 * the corner nodes.
 */
export function pointOnLoop(
  loop: Node[],
  t: number,
): { x: number; y: number; dir: Direction } {
  if (loop.length === 0) {
    return { x: 0, y: 0, dir: 'right' };
  }
  if (loop.length === 1) {
    return { x: loop[0].x, y: loop[0].y, dir: 'right' };
  }

  const n = loop.length;

  // Segment list (closing back to the first corner) with lengths.
  const segments: { start: Node; end: Node; len: number; dir: Direction }[] = [];
  let perimeter = 0;
  for (let i = 0; i < n; i += 1) {
    const start = loop[i];
    const end = loop[(i + 1) % n];
    const len = Math.abs(end.x - start.x) + Math.abs(end.y - start.y); // axis-aligned
    segments.push({ start, end, len, dir: directionOf(start, end) });
    perimeter += len;
  }

  // Degenerate (all corners coincident) → stay put.
  if (perimeter === 0) {
    return { x: loop[0].x, y: loop[0].y, dir: segments[0]?.dir ?? 'right' };
  }

  const tt = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  let remaining = tt * perimeter;

  for (const seg of segments) {
    if (seg.len === 0) continue;
    if (remaining <= seg.len + 1e-9) {
      const frac = seg.len === 0 ? 0 : remaining / seg.len;
      return {
        x: seg.start.x + (seg.end.x - seg.start.x) * frac,
        y: seg.start.y + (seg.end.y - seg.start.y) * frac,
        dir: seg.dir,
      };
    }
    remaining -= seg.len;
  }

  // t === 1 (or floating-point overshoot): land exactly on the closing point.
  const last = segments[segments.length - 1];
  return { x: last.end.x, y: last.end.y, dir: last.dir };
}

/** Axis-aligned direction from `start` to `end` (screen coords: +y is down). */
function directionOf(start: Node, end: Node): Direction {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? 'right' : 'left';
  }
  return dy >= 0 ? 'down' : 'up';
}
