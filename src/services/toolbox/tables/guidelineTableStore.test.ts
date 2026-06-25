import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as firestore from 'firebase/firestore'
import { CalculatorError, type GuidelineTable } from '../types'
import { GuidelineTableStore, GUIDELINE_TABLES_COLLECTION } from './guidelineTableStore'
import { SEED_GUIDELINE_TABLES } from './seed'

// A small, self-contained seed used by most tests so assertions don't depend on the
// evolving bundled catalogue. xa_zone_limits has two versions: v1 (superseded) and v2.
function makeSeed(): GuidelineTable[] {
  return [
    {
      id: 'demo_brackets',
      version: '1.0.0',
      effectiveFrom: '2022-01-01',
      supersededBy: '2.0.0',
      jurisdiction: 'ZA',
      status: 'recommended',
      rows: [{ minCost: 0, basePct: 12 }],
    },
    {
      id: 'demo_brackets',
      version: '2.0.0',
      effectiveFrom: '2023-01-01',
      jurisdiction: 'ZA',
      status: 'recommended',
      rows: [{ minCost: 0, basePct: 11 }],
    },
    {
      id: 'demo_vat',
      version: '1.0.0',
      effectiveFrom: '2018-04-01',
      jurisdiction: 'ZA',
      status: 'mandatory',
      rows: [{ ratePct: 15 }],
    },
  ]
}

describe('GuidelineTableStore — seed loading', () => {
  it('loads the bundled seed and exposes every version', () => {
    const store = new GuidelineTableStore()
    const all = store.getAllTables()
    expect(all.length).toBe(SEED_GUIDELINE_TABLES.length)
    expect(store.getTableIds()).toContain('xa_zone_limits')
    expect(store.getTableIds()).toContain('vat_config')
  })

  it('returns defensive copies — mutating results never affects the store', () => {
    const store = new GuidelineTableStore(makeSeed())
    const all = store.getAllTables()
    ;(all[0].rows[0] as Record<string, number>).basePct = 999
    all[0].version = 'tampered'
    const fresh = store.getVersion('demo_brackets', '1.0.0')!
    expect((fresh.rows[0] as Record<string, number>).basePct).toBe(12)
  })
})

describe('GuidelineTableStore — latest vs all versions', () => {
  let store: GuidelineTableStore
  beforeEach(() => {
    store = new GuidelineTableStore(makeSeed())
  })

  it('getVersions returns all versions of an id, oldest-effective first', () => {
    const versions = store.getVersions('demo_brackets')
    expect(versions.map((v) => v.version)).toEqual(['1.0.0', '2.0.0'])
  })

  it('getLatest returns the non-superseded version', () => {
    const latest = store.getLatest('demo_brackets')
    expect(latest?.version).toBe('2.0.0')
    expect(latest?.supersededBy).toBeUndefined()
  })

  it('getLatest returns undefined for an unknown id', () => {
    expect(store.getLatest('does_not_exist')).toBeUndefined()
  })

  it('getLatestTables returns exactly one latest table per id', () => {
    const latest = store.getLatestTables()
    expect(latest.map((t) => t.id).sort()).toEqual(['demo_brackets', 'demo_vat'])
    expect(latest.find((t) => t.id === 'demo_brackets')?.version).toBe('2.0.0')
  })
})

describe('GuidelineTableStore — append-version + supersede (Requirement 3.2)', () => {
  let store: GuidelineTableStore
  beforeEach(() => {
    store = new GuidelineTableStore(makeSeed())
  })

  it('creates a new version and marks the prior latest as superseded', () => {
    const created = store.appendVersion('demo_brackets', {
      version: '3.0.0',
      effectiveFrom: '2024-06-01',
      rows: [{ minCost: 0, basePct: 10 }],
    })
    expect(created.version).toBe('3.0.0')
    expect(created.supersededBy).toBeUndefined()
    expect(store.getLatest('demo_brackets')?.version).toBe('3.0.0')

    const prior = store.getVersion('demo_brackets', '2.0.0')!
    expect(prior.supersededBy).toBe('3.0.0')
  })

  it('leaves prior version rows fully intact after supersede', () => {
    store.appendVersion('demo_brackets', {
      version: '3.0.0',
      effectiveFrom: '2024-06-01',
      rows: [{ minCost: 0, basePct: 10 }],
    })
    const prior = store.getVersion('demo_brackets', '2.0.0')!
    expect((prior.rows[0] as Record<string, number>).basePct).toBe(11)
    // All three versions remain queryable — nothing was deleted or overwritten.
    expect(store.getVersions('demo_brackets').map((v) => v.version)).toEqual([
      '1.0.0',
      '2.0.0',
      '3.0.0',
    ])
  })

  it('inherits jurisdiction/status from the prior version by default', () => {
    const created = store.appendVersion('demo_brackets', {
      version: '3.0.0',
      effectiveFrom: '2024-06-01',
      rows: [{ minCost: 0, basePct: 10 }],
    })
    expect(created.jurisdiction).toBe('ZA')
    expect(created.status).toBe('recommended')
  })

  it('supports appending a brand-new table id (no prior to supersede)', () => {
    const created = store.appendVersion('new_table', {
      version: '1.0.0',
      effectiveFrom: '2025-01-01',
      rows: [{ value: 1 }],
      status: 'indicative',
    })
    expect(created.jurisdiction).toBe('ZA')
    expect(created.status).toBe('indicative')
    expect(store.getLatest('new_table')?.version).toBe('1.0.0')
  })

  it('rejects a duplicate version for an existing id', () => {
    expect(() =>
      store.appendVersion('demo_brackets', {
        version: '2.0.0',
        effectiveFrom: '2024-01-01',
        rows: [],
      }),
    ).toThrowError(CalculatorError)
  })
})

describe('GuidelineTableStore — Firestore backing with offline fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the local seed when Firestore returns no documents (offline-tolerant)', async () => {
    const store = new GuidelineTableStore(makeSeed())
    await store.hydrateFromFirestore()
    // Default mock getDocs yields an empty snapshot — seed must remain authoritative.
    expect(store.getTableIds().sort()).toEqual(['demo_brackets', 'demo_vat'])
  })

  it('merges remote versions over the seed when present', async () => {
    const remote: GuidelineTable = {
      id: 'demo_brackets',
      version: '5.0.0',
      effectiveFrom: '2030-01-01',
      jurisdiction: 'ZA',
      status: 'recommended',
      rows: [{ minCost: 0, basePct: 5 }],
    }
    vi.spyOn(firestore, 'getDocs').mockResolvedValueOnce({
      forEach: (cb: (d: { data: () => unknown }) => void) => {
        cb({ data: () => remote })
      },
    } as never)

    const store = new GuidelineTableStore(makeSeed())
    await store.hydrateFromFirestore()
    expect(store.getVersion('demo_brackets', '5.0.0')).toBeDefined()
    // Seed versions remain alongside the merged remote one.
    expect(store.getVersion('demo_brackets', '1.0.0')).toBeDefined()
  })

  it('survives a Firestore failure by serving the seed', async () => {
    vi.spyOn(firestore, 'getDocs').mockRejectedValueOnce(new Error('network down'))
    const store = new GuidelineTableStore(makeSeed())
    await expect(store.hydrateFromFirestore()).resolves.toBeUndefined()
    expect(store.getTableIds()).toContain('demo_brackets')
  })

  it('persists the new and superseded versions when appending durably', async () => {
    const setDocSpy = vi.spyOn(firestore, 'setDoc')
    const store = new GuidelineTableStore(makeSeed())
    await store.appendVersionAndPersist('demo_brackets', {
      version: '3.0.0',
      effectiveFrom: '2024-06-01',
      rows: [{ minCost: 0, basePct: 10 }],
    })
    // One write for the new version, one for the superseded-stamp on the prior version.
    expect(setDocSpy).toHaveBeenCalledTimes(2)
  })

  it('targets the guidelineTables collection', () => {
    const collectionSpy = vi.spyOn(firestore, 'collection')
    const store = new GuidelineTableStore(makeSeed())
    void store.hydrateFromFirestore()
    expect(collectionSpy).toHaveBeenCalledWith(expect.anything(), GUIDELINE_TABLES_COLLECTION)
  })
})
