// Toolbox engine — core calculator runner
//
// `runCalculator` is the single orchestration entry point for executing any
// `CalculatorDefinition`. It performs the framework boilerplate that is identical for
// every tool, then delegates the domain math to the definition's `compute` function:
//
//   1. Validate top-level inputs against `def.inputSchema` (Zod).
//   2. Validate each schedule row against `def.scheduleSchema`; invalid rows are
//      *isolated* (excluded + warned) rather than failing the whole run (Requirement 2.4).
//   3. Resolve the guideline tables the definition consumes — latest version by default,
//      or pinned versions when replaying a saved run (Requirements 3.1, 3.3).
//   4. Build the `ComputeContext` and invoke `def.compute`, which runs the method
//      provider(s) (Task 2.2) and `evaluateClauseSet` (Task 2.3), then aggregates.
//   5. Merge engine-collected warnings and guarantee the resolved table versions are
//      represented in `sourceVersions` (traceability — design Property 2).
//
// Method providers and the clause-set evaluator plug in *inside* a definition's
// `compute`; the runner supplies them a validated, version-pinned context. Requirements:
// 1.2, 3.1, 3.3.

import {
  CalculatorError,
  type CalculationResult,
  type CalculatorDefinition,
  type ComputeContext,
  type GuidelineTable,
  type GuidelineVersionRef,
} from '../types'
import { resolveTables, type PinnedVersions } from './tableResolver'

export interface RunCalculatorOptions {
  /** All available guideline table versions the resolver may choose from (Task 3 store). */
  tables?: GuidelineTable[]
  /** Pinned versions by table id — replay a saved run deterministically. */
  pinnedVersions?: PinnedVersions
  /** Effective-as-of ISO timestamp for table resolution; defaults to undefined (latest). */
  asOf?: string
  /** Jurisdiction passed through to compute (defaults to 'ZA'). */
  jurisdiction?: string
}

/** Result of validating schedule rows: the valid subset plus warnings for excluded rows. */
interface ValidatedRows<TRow> {
  rows: TRow[]
  warnings: string[]
}

/**
 * Validate schedule rows individually so a single bad row never fails the whole run.
 * When no `scheduleSchema` is defined the rows are passed through unchanged.
 */
function validateRows<TInput, TRow>(
  def: CalculatorDefinition<TInput, TRow>,
  rawRows: unknown[],
): ValidatedRows<TRow> {
  if (!def.scheduleSchema) {
    return { rows: rawRows as TRow[], warnings: [] }
  }
  const rows: TRow[] = []
  const warnings: string[] = []
  rawRows.forEach((raw, index) => {
    const parsed = def.scheduleSchema!.safeParse(raw)
    if (parsed.success) {
      rows.push(parsed.data)
    } else {
      const issues = parsed.error.issues.map((i) => i.message).join('; ')
      warnings.push(`Row ${index + 1} excluded — invalid: ${issues}`)
    }
  })
  return { rows, warnings }
}

/** Stable dedupe key for a guideline/version pair. */
function versionKey(ref: GuidelineVersionRef): string {
  return `${ref.guideline}::${ref.version}`
}

/**
 * Execute a calculator definition end-to-end.
 *
 * @throws CalculatorError('INVALID_INPUT') when top-level inputs fail schema validation.
 * @throws CalculatorError('MISSING_TABLE' | 'MISSING_TABLE_VERSION') when a consumed
 *   table or pinned version cannot be resolved.
 * @throws CalculatorError('COMPUTE_FAILED') when the definition's compute throws.
 */
export function runCalculator<TInput = Record<string, unknown>, TRow = Record<string, unknown>>(
  def: CalculatorDefinition<TInput, TRow>,
  input: unknown,
  rows: unknown[] = [],
  options: RunCalculatorOptions = {},
): CalculationResult {
  // 1. Validate top-level inputs (hard failure — a tool cannot run without valid inputs).
  const parsedInput = def.inputSchema.safeParse(input)
  if (!parsedInput.success) {
    const issues = parsedInput.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    throw new CalculatorError('INVALID_INPUT', `Invalid inputs for "${def.id}": ${issues.join('; ')}`, {
      definitionId: def.id,
      issues,
    })
  }

  // 2. Validate schedule rows individually (soft — isolate invalid rows).
  const { rows: validRows, warnings: rowWarnings } = validateRows(def, rows)

  // 3. Resolve consumed tables (latest unless pinned), with jurisdiction filtering.
  const resolvedTables = resolveTables({
    tableRefs: def.tableRefs,
    available: options.tables ?? [],
    pinned: options.pinnedVersions,
    asOf: options.asOf,
    jurisdiction: options.jurisdiction,
  })

  // 4. Build the compute context and delegate domain math to the definition.
  const ctx: ComputeContext<TInput, TRow> = {
    input: parsedInput.data,
    rows: validRows,
    tables: resolvedTables,
    jurisdiction: options.jurisdiction ?? 'ZA',
    asOf: options.asOf,
  }

  let computed: CalculationResult
  try {
    computed = def.compute(ctx)
  } catch (err) {
    if (err instanceof CalculatorError) throw err
    throw new CalculatorError('COMPUTE_FAILED', `Compute failed for "${def.id}": ${(err as Error).message}`, {
      definitionId: def.id,
      cause: (err as Error).message,
    })
  }

  // 5. Merge engine-collected warnings and guarantee resolved table versions are traceable
  //    in sourceVersions (design Property 2 — no hidden constants).
  const sourceVersions: GuidelineVersionRef[] = [...(computed.sourceVersions ?? [])]
  const seen = new Set(sourceVersions.map(versionKey))
  for (const id of def.tableRefs) {
    const table = resolvedTables[id]
    const ref: GuidelineVersionRef = {
      guideline: table.id,
      version: table.version,
      effectiveFrom: table.effectiveFrom,
      status: table.status,
    }
    if (!seen.has(versionKey(ref))) {
      sourceVersions.push(ref)
      seen.add(versionKey(ref))
    }
  }

  return {
    ...computed,
    sourceVersions,
    warnings: [...rowWarnings, ...(computed.warnings ?? [])],
    disclaimers: computed.disclaimers ?? def.disclaimers,
  }
}
