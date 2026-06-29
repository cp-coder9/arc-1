// Toolbox tables — versioned GuidelineTable store
//
// Backs calculator thresholds/tariffs/brackets with versioned, source-traceable data
// (Requirement 3.1). Admin edits append a NEW version with `effectiveFrom` and stamp the
// prior latest with `supersededBy`, leaving prior versions intact so issued runs stay
// reproducible against the exact version they pinned (Requirement 3.2, 3.3).
//
// Architecture:
//   - In-memory cache, seeded synchronously from the local JSON seed so calculators run
//     offline without a network round-trip (NFR: offline-tolerant).
//   - Firestore (non-default DB) is the durable backing store: `hydrateFromFirestore`
//     merges remote versions over the seed; `appendVersion` persists best-effort.
//   - The store exposes arrays of `GuidelineTable` the engine/resolver consume directly
//     (`getAllTables` feeds `runCalculator({ tables })`).
//
// Firestore access mirrors the existing service pattern (see `templateLibraryService.ts`):
// `collection`/`doc`/`getDocs`/`setDoc` against `@/lib/firebase` `db`, errors funnelled
// through `handleFirestoreError`. Each version is a discrete document so prior versions
// are never overwritten.

import { collection, doc, getDocs, setDoc } from 'firebase/firestore'
import { db, handleFirestoreError, OperationType } from '@/lib/firebase'
import { CalculatorError, type GuidelineTable } from '../types'
import { resolveTable } from '../engine/tableResolver'
import { SEED_GUIDELINE_TABLES } from './seed'

/** Firestore collection holding every version of every guideline table. */
export const GUIDELINE_TABLES_COLLECTION = 'guidelineTables'

/** Fields an admin supplies when appending a new version of an existing/new table. */
export interface AppendVersionInput<TRow = unknown> {
  /** New version label (semver or gazette ref). MUST differ from existing versions. */
  version: string
  /** ISO date the new version takes effect. */
  effectiveFrom: string
  /** The replacement row data for this version. */
  rows: TRow[]
  /** Optional jurisdiction; defaults to the prior version's (or 'ZA' for a brand-new id). */
  jurisdiction?: string
  /** Optional status; defaults to the prior version's. */
  status?: GuidelineTable['status']
}

/** Deep-clone a table so external callers can never mutate the store's cached state. */
function cloneTable<TRow = unknown>(t: GuidelineTable<TRow>): GuidelineTable<TRow> {
  return { ...t, rows: t.rows.map((r) => (r && typeof r === 'object' ? { ...r } : r)) as TRow[] }
}

/** Stable Firestore document id for a (table id, version) pair. */
function docIdFor(id: string, version: string): string {
  return `${id}__${version}`
}

function compareEffective(a: string, b: string): number {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Versioned guideline-table store. Construct with a custom seed for tests; the exported
 * singleton uses the bundled local seed.
 */
export class GuidelineTableStore {
  private tables: GuidelineTable[]
  private hydrated = false

  constructor(seed: GuidelineTable[] = SEED_GUIDELINE_TABLES) {
    this.tables = seed.map(cloneTable)
  }

  // --------------------------------------------------------------------------
  // Queries (synchronous, served from the in-memory cache)
  // --------------------------------------------------------------------------

  /** Every version of every table — the shape the engine/resolver consume. */
  getAllTables(): GuidelineTable[] {
    return this.tables.map(cloneTable)
  }

  /** The distinct table ids currently known to the store. */
  getTableIds(): string[] {
    return Array.from(new Set(this.tables.map((t) => t.id)))
  }

  /** All versions of one table id, oldest-effective first. */
  getVersions(id: string): GuidelineTable[] {
    return this.tables
      .filter((t) => t.id === id)
      .sort((a, b) => compareEffective(a.effectiveFrom, b.effectiveFrom))
      .map(cloneTable)
  }

  /**
   * The latest live (non-superseded) version of a table id, or `undefined` if the id is
   * unknown. Mirrors the engine resolver's "latest" semantics for consistency.
   */
  getLatest(id: string): GuidelineTable | undefined {
    try {
      return cloneTable(resolveTable(id, this.tables))
    } catch (err) {
      if (err instanceof CalculatorError && err.code === 'MISSING_TABLE') return undefined
      throw err
    }
  }

  /** One latest-version table per known id (handy for default engine runs). */
  getLatestTables(): GuidelineTable[] {
    return this.getTableIds()
      .map((id) => this.getLatest(id))
      .filter((t): t is GuidelineTable => t !== undefined)
  }

  /** A specific (id, version) pair, or `undefined` when absent. */
  getVersion(id: string, version: string): GuidelineTable | undefined {
    const match = this.tables.find((t) => t.id === id && t.version === version)
    return match ? cloneTable(match) : undefined
  }

  // --------------------------------------------------------------------------
  // Mutation — append-version + supersede (Requirement 3.2)
  // --------------------------------------------------------------------------

  /**
   * Append a new version of a table. The prior latest live version (if any) is stamped
   * with `supersededBy = input.version`; its rows and metadata are otherwise left intact.
   * Returns the newly created version.
   *
   * @throws CalculatorError('INVALID_INPUT') when the version already exists for this id.
   */
  appendVersion<TRow = unknown>(id: string, input: AppendVersionInput<TRow>): GuidelineTable<TRow> {
    if (this.tables.some((t) => t.id === id && t.version === input.version)) {
      throw new CalculatorError(
        'INVALID_INPUT',
        `Guideline table "${id}" already has a version "${input.version}".`,
        { id, version: input.version },
      )
    }

    const prior = this.getLatest(id)
    // Stamp the prior latest as superseded — without touching its rows.
    if (prior) {
      const idx = this.tables.findIndex((t) => t.id === id && t.version === prior.version)
      if (idx !== -1) {
        this.tables[idx] = { ...this.tables[idx], supersededBy: input.version }
      }
    }

    const next: GuidelineTable<TRow> = {
      id,
      version: input.version,
      effectiveFrom: input.effectiveFrom,
      jurisdiction: input.jurisdiction ?? prior?.jurisdiction ?? 'ZA',
      status: input.status ?? prior?.status,
      rows: input.rows.map((r) => (r && typeof r === 'object' ? { ...r } : r)) as TRow[],
    }
    this.tables.push(next as GuidelineTable)
    return cloneTable(next)
  }

  /** Reset the cache to a known seed (test helper). */
  reset(seed: GuidelineTable[] = SEED_GUIDELINE_TABLES): void {
    this.tables = seed.map(cloneTable)
    this.hydrated = false
  }

  // --------------------------------------------------------------------------
  // Firestore-backed durability (best-effort; seed remains the offline fallback)
  // --------------------------------------------------------------------------

  /**
   * Load every version document from Firestore and merge over the seed (remote wins per
   * (id, version)). Safe to call when offline: any failure leaves the seeded cache intact
   * and the store still serves calculators. Idempotent.
   */
  async hydrateFromFirestore(force = false): Promise<void> {
    if (this.hydrated && !force) return
    try {
      const snap = await getDocs(collection(db, GUIDELINE_TABLES_COLLECTION))
      const remote: GuidelineTable[] = []
      snap.forEach((d) => {
        remote.push(d.data() as GuidelineTable)
      })
      if (remote.length > 0) {
        const byKey = new Map<string, GuidelineTable>()
        for (const t of this.tables) byKey.set(docIdFor(t.id, t.version), t)
        for (const t of remote) byKey.set(docIdFor(t.id, t.version), t)
        this.tables = Array.from(byKey.values()).map(cloneTable)
      }
      this.hydrated = true
    } catch (error) {
      // Offline-tolerant: keep the seeded cache; surface the error via the standard path
      // without throwing past callers that can run from seed.
      console.warn('GuidelineTableStore: Firestore hydrate failed; using local seed.', error)
    }
  }

  /** Persist a single table version document to Firestore (one doc per version). */
  async persistVersion(table: GuidelineTable): Promise<void> {
    try {
      const ref = doc(db, GUIDELINE_TABLES_COLLECTION, docIdFor(table.id, table.version))
      await setDoc(ref, table)
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `${GUIDELINE_TABLES_COLLECTION}/${docIdFor(table.id, table.version)}`)
    }
  }

  /**
   * Append a new version and durably persist both the new version and the superseded-stamp
   * update on the prior version. Local cache is updated first so callers stay offline-safe.
   */
  async appendVersionAndPersist<TRow = unknown>(
    id: string,
    input: AppendVersionInput<TRow>,
  ): Promise<GuidelineTable<TRow>> {
    const created = this.appendVersion(id, input)
    const prior = this.tables.find((t) => t.id === id && t.supersededBy === input.version)
    await this.persistVersion(created)
    if (prior) await this.persistVersion(prior)
    return created
  }
}

/** Shared singleton backed by the bundled seed. */
export const guidelineTableStore = new GuidelineTableStore()
