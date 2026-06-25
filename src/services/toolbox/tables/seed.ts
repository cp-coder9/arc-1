// Toolbox tables — local seed data
//
// The seed provides a baseline set of versioned `GuidelineTable`s so calculators can run
// client-side without a network round-trip (NFR: offline-tolerant). The Firestore-backed
// store hydrates/merges over these at runtime; offline, these remain authoritative.
//
// Seed rows are intentionally a minimal starter set — later tasks author the full table
// catalogue. Admin edits never mutate these in place; they append new versions
// (see `guidelineTableStore.appendVersion`). Requirements: 3.1, 3.2.

import type { GuidelineTable } from '../types'
import seedJson from './seedTables.json'

/** The raw seed tables, typed as the framework `GuidelineTable` contract. */
export const SEED_GUIDELINE_TABLES: GuidelineTable[] = (seedJson.tables as GuidelineTable[]).map(
  (t) => ({ ...t, rows: [...t.rows] }),
)

/** Convenience: the distinct table ids present in the seed. */
export const SEED_TABLE_IDS: string[] = Array.from(
  new Set(SEED_GUIDELINE_TABLES.map((t) => t.id)),
)
