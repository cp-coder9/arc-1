/**
 * Product Catalogue Adapter — Real product data integration for SpecForge.
 *
 * Replaces mock library search with Firestore queries against the
 * `productCatalogue` collection in production mode. Supports:
 * - Scope-based filtering (personal=userId, practice=firmId, platform/manufacturer/standards=no tenant restriction)
 * - Pagination (offset/limit, max 200)
 * - CSV upload with validation (max 10MB, 5000 rows)
 * - SupplierConnector interface (Levels 0–6)
 * - Specifile licensing guard
 * - Degraded mode on timeout (5s) or unavailability — never falls back to mock in production
 * - Normalization to SpecLibraryItem
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9
 */

import type {
  SpecLibraryItem,
  SpecLibraryScope,
  CatalogueSearchParams,
  CatalogueSearchResult,
  CsvImportResult,
  SupplierConnector,
  ConnectorLevel,
  ProductFilter,
  ProductDetail,
  AvailabilityStatus,
  PricingResponse,
} from '@/types/specforgeTypes';
import { adminDb } from '@/lib/firebase-admin';
import { csvUploadConstraints } from './specforgeSchemas';

// ── Constants ───────────────────────────────────────────────────────────────

/** Default pagination limit */
const DEFAULT_LIMIT = 50;

/** Maximum pagination limit — any value above this is clamped */
const MAX_LIMIT = 200;

/** Timeout for catalogue queries (milliseconds) */
const QUERY_TIMEOUT_MS = 5000;

/** Valid scope values for CSV row validation */
const VALID_SCOPES: SpecLibraryScope[] = ['personal', 'practice', 'platform', 'manufacturer', 'standards'];

// ── Types ───────────────────────────────────────────────────────────────────

/** Subscription record for Specifile licensing check */
export interface SpecifileSubscription {
  firmId: string;
  active: boolean;
  expiresAt: string; // ISO 8601
}

/** Configuration for a registered supplier connector */
export interface ConnectorConfig {
  connectorId: string;
  level: ConnectorLevel;
  connector: SupplierConnector;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a unique product ID */
function generateProductId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `prod-${ts}-${rand}`;
}

/**
 * Wrap a promise with a timeout. Rejects if the promise doesn't resolve
 * within `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Query timeout')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Normalize a raw Firestore document into a SpecLibraryItem.
 * Ensures typicalCostRange in whole Rands, leadTimeRange as positive integers,
 * sustainability/finishes/clauses with defaults.
 */
function normalizeToSpecLibraryItem(doc: FirebaseFirestore.DocumentData, id: string): SpecLibraryItem {
  const costRange = doc.typicalCostRange;
  const leadRange = doc.leadTimeRange;

  return {
    id,
    title: doc.title ?? '',
    category: doc.category ?? '',
    scope: VALID_SCOPES.includes(doc.scope) ? doc.scope : 'platform',
    typicalSupplier: doc.typicalSupplier ?? undefined,
    typicalCostRange: costRange ? {
      min: Math.round(Number(costRange.min) || 0),
      max: Math.round(Number(costRange.max) || 0),
    } : undefined,
    leadTimeRange: leadRange ? {
      min: Math.max(1, Math.round(Math.abs(Number(leadRange.min) || 1))),
      max: Math.max(1, Math.round(Math.abs(Number(leadRange.max) || 1))),
    } : undefined,
    commonFinishes: Array.isArray(doc.commonFinishes) ? doc.commonFinishes : [],
    sustainabilityNotes: typeof doc.sustainabilityNotes === 'string' ? doc.sustainabilityNotes : '',
    clauseRefs: Array.isArray(doc.clauseRefs) ? doc.clauseRefs : [],
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    usageCount: typeof doc.usageCount === 'number' ? doc.usageCount : 0,
    lastUsedAt: doc.lastUsedAt ?? undefined,
  };
}

/**
 * Parse CSV text into rows. Handles basic CSV format (comma-separated,
 * double-quote escaping). Returns header row and data rows separately.
 */
function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

// ── Specifile Licensing Guard ───────────────────────────────────────────────

/**
 * Check if a firm holds a valid, non-expired Specifile subscription.
 */
async function checkSpecifileLicense(firmId: string): Promise<boolean> {
  try {
    const subDoc = await adminDb
      .collection('specifileSubscriptions')
      .doc(firmId)
      .get();

    if (!subDoc.exists) return false;

    const data = subDoc.data() as SpecifileSubscription | undefined;
    if (!data || !data.active) return false;

    const expiresAt = new Date(data.expiresAt);
    return expiresAt > new Date();
  } catch {
    return false;
  }
}

// ── Core Search Implementation ──────────────────────────────────────────────

/**
 * Build scope-filtered Firestore query based on the user's context.
 *
 * - personal: userId match
 * - practice: firmId match
 * - platform/manufacturer/standards: no tenant restriction (scope field match only)
 */
async function queryProductCatalogue(
  params: CatalogueSearchParams,
  effectiveLimit: number,
  effectiveOffset: number,
): Promise<{ items: SpecLibraryItem[]; total: number }> {
  const { query, scope, userId, firmId } = params;

  let baseQuery: FirebaseFirestore.Query = adminDb.collection('productCatalogue');

  // Scope filtering
  if (scope === 'personal') {
    baseQuery = baseQuery.where('scope', '==', 'personal').where('userId', '==', userId);
  } else if (scope === 'practice') {
    baseQuery = baseQuery.where('scope', '==', 'practice').where('firmId', '==', firmId);
  } else if (scope) {
    // platform, manufacturer, standards — no tenant restriction
    baseQuery = baseQuery.where('scope', '==', scope);
  }
  // If no scope: query across all scopes visible to the user
  // (personal + practice + platform/manufacturer/standards)

  // Text filtering: Firestore doesn't support full-text search natively,
  // so we use a title-based prefix query combined with server-side filtering
  // for more precise matching.
  const snapshot = await baseQuery.get();

  const lowerQuery = query.toLowerCase();
  const allMatching: SpecLibraryItem[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // If no scope was specified, filter to items visible to this user
    if (!scope) {
      const itemScope = data.scope as SpecLibraryScope;
      if (itemScope === 'personal' && data.userId !== userId) continue;
      if (itemScope === 'practice' && data.firmId !== firmId) continue;
      // platform/manufacturer/standards are visible to everyone
    }

    // Text match against title, category, tags, supplier
    const searchable = [
      data.title ?? '',
      data.category ?? '',
      ...(Array.isArray(data.tags) ? data.tags : []),
      data.typicalSupplier ?? '',
    ].join(' ').toLowerCase();

    if (lowerQuery && !searchable.includes(lowerQuery)) continue;

    allMatching.push(normalizeToSpecLibraryItem(data, doc.id));
  }

  const total = allMatching.length;
  const items = allMatching.slice(effectiveOffset, effectiveOffset + effectiveLimit);

  return { items, total };
}

// ── Product Catalogue Adapter ───────────────────────────────────────────────

/**
 * Search the product catalogue. Queries Firestore in production mode,
 * returns empty+degraded on timeout/unavailability.
 * NEVER falls back to mock data in production.
 */
export async function search(params: CatalogueSearchParams): Promise<CatalogueSearchResult> {
  // Pagination: clamp limit to max 200
  const effectiveOffset = Math.max(0, params.offset ?? 0);
  const requestedLimit = params.limit ?? DEFAULT_LIMIT;
  const effectiveLimit = Math.min(Math.max(1, requestedLimit), MAX_LIMIT);

  try {
    const { items, total } = await withTimeout(
      queryProductCatalogue(params, effectiveLimit, effectiveOffset),
      QUERY_TIMEOUT_MS,
    );

    // Specifile licensing guard: if any results are Specifile-sourced,
    // check the firm's subscription
    let specifileLicenseRequired = false;
    let filteredItems = items;

    const hasSpecifileItems = items.some(
      (item) => item.typicalSupplier?.toLowerCase().includes('specifile'),
    );

    if (hasSpecifileItems) {
      const hasLicense = await checkSpecifileLicense(params.firmId);
      if (!hasLicense) {
        filteredItems = items.filter(
          (item) => !item.typicalSupplier?.toLowerCase().includes('specifile'),
        );
        specifileLicenseRequired = true;
      }
    }

    return {
      items: filteredItems,
      total,
      offset: effectiveOffset,
      limit: effectiveLimit,
      ...(specifileLicenseRequired ? { specifileLicenseRequired: true } : {}),
    };
  } catch {
    // On timeout or unavailability: return empty results with degraded flag
    // NEVER fall back to mock data in production
    return {
      items: [],
      total: 0,
      offset: effectiveOffset,
      limit: effectiveLimit,
      degraded: true,
    };
  }
}

// ── CSV Upload Implementation ───────────────────────────────────────────────

/**
 * Upload and parse a CSV file, validate rows against SpecLibraryItem schema,
 * persist valid rows, and return an import/rejection summary.
 *
 * Constraints:
 * - Max file size: 10MB
 * - Max rows: 5000
 * - Each row must have non-empty title, category, and valid scope
 */
export async function uploadCsv(
  firmId: string,
  file: Buffer,
  userId: string,
): Promise<CsvImportResult> {
  // File size check
  if (file.length > csvUploadConstraints.maxFileSize) {
    return {
      imported: 0,
      rejected: 0,
      rejections: [{ row: 0, reason: `File exceeds maximum size of 10MB (${Math.round(file.length / 1024 / 1024)}MB provided)` }],
    };
  }

  const text = file.toString('utf-8');
  const { headers, rows } = parseCsv(text);

  if (headers.length === 0) {
    return {
      imported: 0,
      rejected: 0,
      rejections: [{ row: 0, reason: 'CSV file is empty or has no header row' }],
    };
  }

  // Row count check
  if (rows.length > csvUploadConstraints.maxRows) {
    return {
      imported: 0,
      rejected: 0,
      rejections: [{ row: 0, reason: `CSV exceeds maximum of ${csvUploadConstraints.maxRows} rows (${rows.length} provided)` }],
    };
  }

  // Map header names to indices (case-insensitive)
  const headerMap: Record<string, number> = {};
  headers.forEach((h, idx) => { headerMap[h.toLowerCase().trim()] = idx; });

  const titleIdx = headerMap['title'] ?? -1;
  const categoryIdx = headerMap['category'] ?? -1;
  const scopeIdx = headerMap['scope'] ?? -1;

  if (titleIdx === -1 || categoryIdx === -1 || scopeIdx === -1) {
    return {
      imported: 0,
      rejected: 0,
      rejections: [{ row: 0, reason: 'CSV must contain "title", "category", and "scope" columns' }],
    };
  }

  const imported: SpecLibraryItem[] = [];
  const rejections: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // 1-indexed, plus header row

    // Extract required fields
    const title = (row[titleIdx] ?? '').trim();
    const category = (row[categoryIdx] ?? '').trim();
    const scopeValue = (row[scopeIdx] ?? '').trim().toLowerCase() as SpecLibraryScope;

    // Validate required fields
    if (!title) {
      rejections.push({ row: rowNumber, reason: 'Title is required and cannot be empty' });
      continue;
    }
    if (!category) {
      rejections.push({ row: rowNumber, reason: 'Category is required and cannot be empty' });
      continue;
    }
    if (!VALID_SCOPES.includes(scopeValue)) {
      rejections.push({ row: rowNumber, reason: `Invalid scope "${row[scopeIdx]?.trim() ?? ''}". Must be one of: ${VALID_SCOPES.join(', ')}` });
      continue;
    }

    // Build item from available columns
    const item: SpecLibraryItem = {
      id: generateProductId(),
      title,
      category,
      scope: scopeValue,
      typicalSupplier: getOptionalField(row, headerMap, 'supplier') || getOptionalField(row, headerMap, 'typicalsupplier') || undefined,
      typicalCostRange: parseCostRange(row, headerMap),
      leadTimeRange: parseLeadTimeRange(row, headerMap),
      commonFinishes: parseArrayField(row, headerMap, 'finishes') || parseArrayField(row, headerMap, 'commonfinishes') || [],
      sustainabilityNotes: getOptionalField(row, headerMap, 'sustainability') || getOptionalField(row, headerMap, 'sustainabilitynotes') || '',
      clauseRefs: parseArrayField(row, headerMap, 'clauserefs') || parseArrayField(row, headerMap, 'clauses') || [],
      tags: parseArrayField(row, headerMap, 'tags') || [],
      usageCount: 0,
    };

    // Set ownership fields based on scope
    const itemData: Record<string, unknown> = { ...item };
    if (scopeValue === 'personal') {
      itemData.userId = userId;
    }
    if (scopeValue === 'practice') {
      itemData.firmId = firmId;
    }

    imported.push(item);
  }

  // Persist valid rows to the firm's product catalogue collection
  if (imported.length > 0) {
    const batch = adminDb.batch();
    for (const item of imported) {
      const docRef = adminDb.collection('productCatalogue').doc(item.id);
      const docData: Record<string, unknown> = {
        ...item,
        firmId,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
      };
      batch.set(docRef, docData);
    }
    await batch.commit();
  }

  return {
    imported: imported.length,
    rejected: rejections.length,
    rejections,
  };
}

// ── CSV Field Parsers ───────────────────────────────────────────────────────

function getOptionalField(row: string[], headerMap: Record<string, number>, field: string): string | undefined {
  const idx = headerMap[field];
  if (idx === undefined || idx >= row.length) return undefined;
  const val = row[idx]?.trim();
  return val || undefined;
}

function parseCostRange(row: string[], headerMap: Record<string, number>): { min: number; max: number } | undefined {
  const minStr = getOptionalField(row, headerMap, 'costmin') || getOptionalField(row, headerMap, 'cost_min');
  const maxStr = getOptionalField(row, headerMap, 'costmax') || getOptionalField(row, headerMap, 'cost_max');

  if (!minStr && !maxStr) {
    // Try single cost field
    const costStr = getOptionalField(row, headerMap, 'cost') || getOptionalField(row, headerMap, 'typicalcost');
    if (costStr) {
      const val = Math.round(Number(costStr) || 0);
      if (val > 0) return { min: val, max: val };
    }
    return undefined;
  }

  const min = Math.round(Number(minStr) || 0);
  const max = Math.round(Number(maxStr) || 0);
  if (min <= 0 && max <= 0) return undefined;
  return { min: Math.max(0, min), max: Math.max(min, max) };
}

function parseLeadTimeRange(row: string[], headerMap: Record<string, number>): { min: number; max: number } | undefined {
  const minStr = getOptionalField(row, headerMap, 'leadtimemin') || getOptionalField(row, headerMap, 'leadtime_min');
  const maxStr = getOptionalField(row, headerMap, 'leadtimemax') || getOptionalField(row, headerMap, 'leadtime_max');

  if (!minStr && !maxStr) {
    const ltStr = getOptionalField(row, headerMap, 'leadtime') || getOptionalField(row, headerMap, 'leadtimedays');
    if (ltStr) {
      const val = Math.max(1, Math.round(Math.abs(Number(ltStr) || 1)));
      return { min: val, max: val };
    }
    return undefined;
  }

  const min = Math.max(1, Math.round(Math.abs(Number(minStr) || 1)));
  const max = Math.max(min, Math.round(Math.abs(Number(maxStr) || 1)));
  return { min, max };
}

function parseArrayField(row: string[], headerMap: Record<string, number>, field: string): string[] | undefined {
  const val = getOptionalField(row, headerMap, field);
  if (!val) return undefined;
  return val.split(';').map((s) => s.trim()).filter(Boolean);
}

// ── Supplier Connector Interface Definition ─────────────────────────────────

/**
 * SupplierConnector interface — defines integration methods for external
 * supplier systems at various connector levels (0–6).
 *
 * Level 0: Manual/portal — no automated integration
 * Level 1: Basic product search (search only)
 * Level 2: Product search + detail retrieval
 * Level 3: Search + detail + availability checking
 * Level 4: Full catalogue API (search, detail, availability, pricing)
 * Level 5: Real-time inventory + automated ordering
 * Level 6: Full ERP/EDI integration with bidirectional data flow
 *
 * The SupplierConnector interface is re-exported from specforgeTypes.ts.
 * Implementations would be registered per connector and invoked by the adapter.
 */

/** Registry of active supplier connectors */
const connectorRegistry: Map<string, ConnectorConfig> = new Map();

/**
 * Register a supplier connector.
 */
export function registerConnector(config: ConnectorConfig): void {
  connectorRegistry.set(config.connectorId, config);
}

/**
 * Unregister a supplier connector.
 */
export function unregisterConnector(connectorId: string): void {
  connectorRegistry.delete(connectorId);
}

/**
 * Get all registered connectors.
 */
export function getConnectors(): ConnectorConfig[] {
  return Array.from(connectorRegistry.values());
}

/**
 * Get a specific connector by ID.
 */
export function getConnector(connectorId: string): ConnectorConfig | undefined {
  return connectorRegistry.get(connectorId);
}

// ── Exported Adapter Interface ──────────────────────────────────────────────

/**
 * ProductCatalogueAdapter — the primary interface for SpecForge product
 * catalogue operations. Combines Firestore queries, CSV import, connector
 * orchestration, and licensing guards.
 */
export const productCatalogueAdapter = {
  search,
  uploadCsv,
  registerConnector,
  unregisterConnector,
  getConnectors,
  getConnector,
};

export default productCatalogueAdapter;
