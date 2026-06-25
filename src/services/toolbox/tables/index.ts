// Toolbox tables — public surface
//
// Versioned guideline/tariff/clause table data layer (design "Data layer"). The store
// serves arrays of `GuidelineTable` the engine/resolver consume, with append-version +
// supersede semantics for admin edits and a Firestore backing with a local-seed fallback.

export {
  GuidelineTableStore,
  guidelineTableStore,
  GUIDELINE_TABLES_COLLECTION,
  type AppendVersionInput,
} from './guidelineTableStore'
export { SEED_GUIDELINE_TABLES, SEED_TABLE_IDS } from './seed'
