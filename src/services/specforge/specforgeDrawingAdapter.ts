/**
 * SpecForge Drawing Adapter — resolves spec item drawing references against
 * the Drawing Register and Revision Control services.
 *
 * Key behaviours:
 * - Resolves each drawingRef to its current revision status (current/superseded/not_found)
 * - For superseded drawings, includes the superseding drawing reference
 * - Generates structured warnings for superseded references (severity: "high")
 * - Caches last-known revision status for 60 seconds (in-memory TTL cache)
 * - Graceful degradation: if Drawing Register unavailable, returns unresolved refs
 *   with `degraded: true` flag and serves from cache when possible
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

import type { DrawingRecord } from '@/services/documentRegisterService';
import { drawings as sampleDrawings } from '@/services/sampleData';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DrawingRefResolution {
  drawingRef: string;
  drawingNumber: string;
  title: string;
  currentRevision: string;
  discipline: string;
  status: 'current' | 'superseded' | 'not_found';
  supersededBy?: { drawingNumber: string; drawingId: string; revision: string };
}

export interface DrawingRefResolutionResult {
  resolutions: DrawingRefResolution[];
  degraded: boolean;
}

export interface StructuredWarning {
  type: string;
  drawingRef: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  supersededBy?: { drawingNumber: string; drawingId: string; revision: string };
}

// ── Cache ───────────────────────────────────────────────────────────────────

/** Cache TTL in milliseconds (60 seconds). */
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  resolution: DrawingRefResolution;
  cachedAt: number;
}

/** In-memory cache keyed by `${projectId}:${drawingRef}`. */
const resolutionCache = new Map<string, CacheEntry>();

function getCacheKey(projectId: string, drawingRef: string): string {
  return `${projectId}:${drawingRef}`;
}

function getCachedResolution(projectId: string, drawingRef: string): DrawingRefResolution | null {
  const key = getCacheKey(projectId, drawingRef);
  const entry = resolutionCache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.cachedAt;
  if (age > CACHE_TTL_MS) {
    resolutionCache.delete(key);
    return null;
  }

  return entry.resolution;
}

function setCachedResolution(projectId: string, drawingRef: string, resolution: DrawingRefResolution): void {
  const key = getCacheKey(projectId, drawingRef);
  resolutionCache.set(key, { resolution, cachedAt: Date.now() });
}

// ── Drawing Data Source ─────────────────────────────────────────────────────

/**
 * Fetch drawings for a project. In production, queries Firestore via the
 * Document Register service. In demo/test modes, uses sample data.
 *
 * FAIL-CLOSED: In production (NODE_ENV=production), this throws if no real
 * data source has been configured via setDrawingDataSource(). This prevents
 * sample/demo data from leaking into production certificate flows.
 *
 * @throws Error when Drawing Register is unavailable in production
 */
let _fetchDrawingsForProject: (projectId: string) => Promise<DrawingRecord[]> = async (projectId: string) => {
  // Production: fail closed — require explicit wiring of Firestore data source
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `Drawing Register data source not configured for project "${projectId}". ` +
      `Call setDrawingDataSource() during app initialization to wire Firestore.`
    );
  }
  // Dev/demo/test: return sample data for development iteration
  return sampleDrawings;
};

/**
 * Override the drawing data source (for production Firestore integration or testing).
 * MUST be called during app startup in production to wire real Firestore queries.
 */
export function setDrawingDataSource(fetcher: (projectId: string) => Promise<DrawingRecord[]>): void {
  _fetchDrawingsForProject = fetcher;
}

/**
 * Reset the drawing data source to the default sample data fetcher (for testing).
 */
export function resetDrawingDataSource(): void {
  _fetchDrawingsForProject = async () => sampleDrawings;
}

// ── Resolution Logic ────────────────────────────────────────────────────────

/**
 * Resolve a single drawing reference against the Drawing Register.
 * Finds the drawing by `drawingNumber` and determines its status.
 */
function resolveRef(drawingRef: string, drawings: DrawingRecord[]): DrawingRefResolution {
  // Find the drawing matching this ref by drawingNumber
  // There may be multiple records with the same drawingNumber (superseded + current)
  const matchingDrawings = drawings.filter((d) => d.drawingNumber === drawingRef);

  if (matchingDrawings.length === 0) {
    return {
      drawingRef,
      drawingNumber: drawingRef,
      title: '',
      currentRevision: '',
      discipline: '',
      status: 'not_found',
    };
  }

  // Prefer the current (non-superseded) version; fall back to the first match
  const currentDrawing = matchingDrawings.find((d) => d.status !== 'superseded');
  const supersededDrawing = matchingDrawings.find((d) => d.status === 'superseded');

  if (currentDrawing) {
    // Drawing exists and is current
    return {
      drawingRef,
      drawingNumber: currentDrawing.drawingNumber,
      title: currentDrawing.title,
      currentRevision: currentDrawing.currentRevision,
      discipline: currentDrawing.discipline,
      status: 'current',
    };
  }

  // All matching drawings are superseded — resolve the superseding drawing
  if (supersededDrawing) {
    const supersedingDrawing = supersededDrawing.supersededByDrawingId
      ? drawings.find((d) => d.drawingId === supersededDrawing.supersededByDrawingId)
      : undefined;

    return {
      drawingRef,
      drawingNumber: supersededDrawing.drawingNumber,
      title: supersededDrawing.title,
      currentRevision: supersededDrawing.currentRevision,
      discipline: supersededDrawing.discipline,
      status: 'superseded',
      supersededBy: supersedingDrawing
        ? {
            drawingNumber: supersedingDrawing.drawingNumber,
            drawingId: supersedingDrawing.drawingId,
            revision: supersedingDrawing.currentRevision,
          }
        : undefined,
    };
  }

  // Fallback — should not reach here, but handle defensively
  const fallback = matchingDrawings[0];
  return {
    drawingRef,
    drawingNumber: fallback.drawingNumber,
    title: fallback.title,
    currentRevision: fallback.currentRevision,
    discipline: fallback.discipline,
    status: 'current',
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Resolve an array of drawing references for a project.
 *
 * For each ref:
 * 1. Check the cache for a valid entry (< 60 seconds old)
 * 2. If not cached, query the Drawing Register and resolve
 * 3. Cache the result for subsequent calls
 *
 * On Drawing Register failure:
 * - Serve from cache where available
 * - Return unresolved refs as `not_found`
 * - Set `degraded: true` on the result
 *
 * Requirements: 10.1, 10.4, 10.5, 10.6
 */
export async function resolveDrawingRefs(
  drawingRefs: string[],
  projectId: string,
): Promise<DrawingRefResolutionResult> {
  if (drawingRefs.length === 0) {
    return { resolutions: [], degraded: false };
  }

  // Attempt to fetch drawings from the Drawing Register
  let drawings: DrawingRecord[] | null = null;
  let degraded = false;

  try {
    drawings = await _fetchDrawingsForProject(projectId);
  } catch {
    // Drawing Register unavailable — enter degraded mode
    degraded = true;
  }

  const resolutions: DrawingRefResolution[] = [];

  for (const ref of drawingRefs) {
    // Try cache first
    const cached = getCachedResolution(projectId, ref);

    if (degraded) {
      // In degraded mode, serve from cache or return not_found
      if (cached) {
        resolutions.push(cached);
      } else {
        resolutions.push({
          drawingRef: ref,
          drawingNumber: ref,
          title: '',
          currentRevision: '',
          discipline: '',
          status: 'not_found',
        });
      }
      continue;
    }

    // Normal mode — resolve against the Drawing Register
    if (cached) {
      resolutions.push(cached);
    } else {
      const resolution = resolveRef(ref, drawings!);
      setCachedResolution(projectId, ref, resolution);
      resolutions.push(resolution);
    }
  }

  return { resolutions, degraded };
}

/**
 * Build structured warnings for drawing resolutions.
 * Generates a warning for each superseded drawing reference.
 *
 * Requirements: 10.2, 10.3
 */
export function buildDrawingWarnings(resolutions: DrawingRefResolution[]): StructuredWarning[] {
  return resolutions
    .filter((r) => r.status === 'superseded')
    .map((r) => ({
      type: 'superseded_drawing',
      drawingRef: r.drawingRef,
      message: `Drawing ${r.drawingRef} (${r.title}) has been superseded${
        r.supersededBy
          ? ` by ${r.supersededBy.drawingNumber} rev ${r.supersededBy.revision}`
          : ''
      }. Update specification reference.`,
      severity: 'high' as const,
      supersededBy: r.supersededBy,
    }));
}

// ── Cache Management (for testing) ──────────────────────────────────────────

/** Clear the entire resolution cache (for testing). */
export function clearResolutionCache(): void {
  resolutionCache.clear();
}

/** Get the current cache size (for testing). */
export function getResolutionCacheSize(): number {
  return resolutionCache.size;
}

/** Exposed cache TTL constant (for testing). */
export const CACHE_TTL = CACHE_TTL_MS;
