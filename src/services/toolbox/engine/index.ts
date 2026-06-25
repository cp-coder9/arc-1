// Toolbox engine — public surface
//
// The engine orchestrates calculator runs: table resolution, input/row validation, and
// delegation to a definition's compute (which uses the method providers from Task 2.2 and
// the clause-set evaluator from Task 2.3). Re-exported here so callers import from one path.

export { runCalculator, type RunCalculatorOptions } from './runCalculator'
export {
  resolveTable,
  resolveTables,
  type PinnedVersions,
  type ResolveTablesArgs,
} from './tableResolver'
export {
  bracketFee,
  percentageFee,
  stageApportion,
  timeCost,
  areaUnit,
  hybrid,
  feeMethodProviders,
  type FeeMethodInput,
  type FeeMethodConfig,
  type BracketTableRow,
  type PercentageTableRow,
  type StageTableRow,
  type HourlyRateTableRow,
  type UnitRateTableRow,
} from './methodProviders'
export {
  evaluateClauseSet,
  computeComplianceScore,
  type ClauseSetEvaluation,
} from './evaluateClauseSet'
