/**
 * SpecForge → Product Catalogue / Library Adapter
 *
 * Queries the product catalogue data source in production (Firestore collection)
 * and falls back to mock library data in demo mode.
 *
 * Features:
 * - Scope filtering (personal, practice, platform, manufacturer, standards)
 * - Case-insensitive substring search across title, category, tags, supplier
 * - Pagination with offset (default 0) and limit (default 50, max 200)
 * - Sort by usageCount descending
 * - Graceful error handling: returns empty array with error flag on data source failure
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8
 */

import type { SpecLibraryItem, SpecLibraryScope } from '@/types/specforgeTypes';

// ── Exported Interfaces ─────────────────────────────────────────────────────

export interface LibrarySearchParams {
  query: string;
  scope?: SpecLibraryScope;
  offset?: number;
  limit?: number;
  userId?: string;
  firmId?: string;
}

export interface LibrarySearchResult {
  items: SpecLibraryItem[];
  total: number;
  error?: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_OFFSET = 0;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ── Demo Mode Detection ─────────────────────────────────────────────────────

function isDemoMode(): boolean {
  return typeof process !== 'undefined'
    ? process.env.VITE_DEMO_MODE === 'true'
    : false;
}

// ── Mock Library Data (Demo Mode) ───────────────────────────────────────────

const MOCK_LIBRARY: SpecLibraryItem[] = [
  {
    id: 'lib-porcelain-600x1200',
    title: 'Large Format Porcelain Wall Tile 600x1200',
    category: 'Finishes',
    scope: 'platform',
    typicalSupplier: 'Various tile suppliers',
    typicalCostRange: { min: 850, max: 1450 },
    leadTimeRange: { min: 14, max: 28 },
    commonFinishes: ['Matte limestone', 'Polished marble', 'Textured concrete'],
    sustainabilityNotes: 'Low VOC adhesive recommended',
    clauseRefs: ['SANS/NBR finish subject to professional verification'],
    tags: ['tile', 'porcelain', 'wall', 'lobby', 'commercial'],
    usageCount: 47,
    lastUsedAt: '2026-05-20',
  },
  {
    id: 'lib-contract-lounge-chair',
    title: 'Contract Lounge Chair — Fabric/Timber',
    category: 'FF&E',
    scope: 'practice',
    typicalSupplier: 'Furniture vendors',
    typicalCostRange: { min: 12000, max: 55000 },
    leadTimeRange: { min: 42, max: 70 },
    commonFinishes: ['Fabric upholstery', 'Leather', 'Oak legs', 'Walnut legs'],
    sustainabilityNotes: 'FSC timber preference',
    tags: ['chair', 'lounge', 'reception', 'FF&E'],
    usageCount: 23,
    lastUsedAt: '2026-04-15',
  },
  {
    id: 'lib-linear-pendant',
    title: 'Bespoke Linear Pendant — Brushed Brass',
    category: 'Electrical / Lighting',
    scope: 'personal',
    typicalSupplier: 'Lighting specialists',
    typicalCostRange: { min: 45000, max: 120000 },
    leadTimeRange: { min: 56, max: 98 },
    commonFinishes: ['Brushed brass', 'Black powder-coat', 'Aged bronze'],
    sustainabilityNotes: 'LED driver replaceable; warm dim preferred',
    tags: ['pendant', 'lighting', 'feature', 'bespoke', 'reception'],
    usageCount: 8,
    lastUsedAt: '2026-03-10',
  },
  {
    id: 'lib-solid-surface-counter',
    title: 'Custom Reception Counter — Oak Veneer / Solid Surface',
    category: 'Joinery',
    scope: 'practice',
    typicalSupplier: 'Joinery subcontractors',
    typicalCostRange: { min: 120000, max: 250000 },
    leadTimeRange: { min: 35, max: 56 },
    commonFinishes: ['Oak veneer', 'Walnut veneer', 'Corian top', 'Granite top'],
    sustainabilityNotes: 'Low-formaldehyde board',
    clauseRefs: ['Shop drawings required before manufacture'],
    tags: ['counter', 'reception', 'joinery', 'custom', 'desk'],
    usageCount: 15,
    lastUsedAt: '2026-05-01',
  },
  {
    id: 'lib-vinyl-plank',
    title: 'Luxury Vinyl Plank — Commercial Grade',
    category: 'Finishes',
    scope: 'platform',
    typicalSupplier: 'Flooring distributors',
    typicalCostRange: { min: 350, max: 900 },
    leadTimeRange: { min: 7, max: 21 },
    commonFinishes: ['Light oak', 'Grey wash', 'Walnut', 'Concrete look'],
    sustainabilityNotes: 'Phthalate-free options preferred',
    tags: ['vinyl', 'flooring', 'LVT', 'commercial'],
    usageCount: 62,
    lastUsedAt: '2026-06-01',
  },
];

// ── Core Search Logic ───────────────────────────────────────────────────────

/**
 * Apply scope filter, tenant boundary, case-insensitive substring search,
 * sort by usageCount DESC, and paginate results. Works against any SpecLibraryItem array.
 */
function filterAndPaginate(
  items: SpecLibraryItem[],
  params: LibrarySearchParams,
): LibrarySearchResult {
  const { query, scope, userId, firmId } = params;
  const offset = Math.max(0, params.offset ?? DEFAULT_OFFSET);
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIMIT));
  const lowerQuery = query.toLowerCase();

  // Apply scope filter (Req 12.2)
  let filtered = scope
    ? items.filter((item) => item.scope === scope)
    : items;

  // Apply tenant boundary (Blocker #10)
  // Personal scope: filter by userId match
  // Practice scope: filter by firmId match
  // Platform/manufacturer/standards scopes remain global
  if (scope === 'personal' && userId) {
    filtered = filtered.filter((item) => {
      const itemRecord = item as SpecLibraryItem & { ownerId?: string; userId?: string };
      return itemRecord.ownerId === userId || itemRecord.userId === userId;
    });
  } else if (scope === 'practice' && firmId) {
    filtered = filtered.filter((item) => {
      const itemRecord = item as SpecLibraryItem & { firmId?: string; practiceId?: string };
      return itemRecord.firmId === firmId || itemRecord.practiceId === firmId;
    });
  }

  // Apply case-insensitive substring search across title, category, tags, supplier (Req 12.3)
  if (lowerQuery.length > 0) {
    filtered = filtered.filter((item) => {
      const searchable = [
        item.title,
        item.category,
        ...(item.tags ?? []),
        item.typicalSupplier ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(lowerQuery);
    });
  }

  // Sort by usageCount descending (Req 12.8)
  filtered.sort((a, b) => b.usageCount - a.usageCount);

  const total = filtered.length;

  // Apply pagination (Req 12.6)
  const paginated = filtered.slice(offset, offset + limit);

  return { items: paginated, total };
}

// ── Production Firestore Query ──────────────────────────────────────────────

/**
 * Query the Firestore `productCatalogue` collection.
 * Returns all matching items from the data source with server-side filtering.
 *
 * NOTE: Firestore does not support case-insensitive substring search natively,
 * so we fetch scoped items and apply text filtering in-memory.
 */
async function queryFirestoreProductCatalogue(
  params: LibrarySearchParams,
): Promise<LibrarySearchResult> {
  // Dynamic import to avoid pulling firebase-admin into client bundles
  const { adminDb } = await import('@/lib/firebase-admin');

  const collectionRef = adminDb.collection('productCatalogue');

  // Build query: scope filter + order by usageCount descending
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let queryRef: any = collectionRef;

  // Apply scope filter at Firestore level when provided (Req 12.2)
  if (params.scope) {
    queryRef = queryRef.where('scope', '==', params.scope);
  }

  // Order by usageCount descending at Firestore level (Req 12.8)
  queryRef = queryRef.orderBy('usageCount', 'desc');

  const snapshot = await queryRef.get();

  const items: SpecLibraryItem[] = snapshot.docs.map((doc: { id: string; data: () => Record<string, unknown> }) => ({
    id: doc.id,
    ...doc.data(),
  })) as SpecLibraryItem[];

  // Apply text search in-memory (Firestore lacks native substring search)
  return filterAndPaginate(items, params);
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Search the product catalogue.
 *
 * In production mode, queries the Firestore `productCatalogue` collection.
 * In demo mode, falls back to the in-memory mock library data.
 *
 * Returns `{ items, total, error?: boolean }`:
 * - `items`: paginated results matching query and scope
 * - `total`: total number of matching results before pagination
 * - `error`: true when the data source is unavailable (Req 12.7)
 */
export async function searchProductCatalogue(
  params: LibrarySearchParams,
): Promise<LibrarySearchResult> {
  // Demo mode fallback (Req 12.1)
  if (isDemoMode()) {
    return filterAndPaginate(MOCK_LIBRARY, params);
  }

  // Production mode: query Firestore
  try {
    return await queryFirestoreProductCatalogue(params);
  } catch {
    // Data source unavailable — return empty with error flag (Req 12.7)
    return { items: [], total: 0, error: true };
  }
}
