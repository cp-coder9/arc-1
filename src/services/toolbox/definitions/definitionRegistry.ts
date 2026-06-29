// Toolbox calculator definition registry
//
// A minimal, in-memory registry mapping a `CalculatorDefinition.id` (and, for convenience,
// a tool's `calculatorDefinitionId`) to its `CalculatorDefinition`. The definition-driven
// runner (`StandaloneToolRunner` → `DefinitionToolRunner`) looks a definition up here to
// decide whether to take the rich, framework path or fall back to the legacy runner.
//
// Later tasks (6–13) author concrete definitions and `register()` them into this registry
// (typically at module-load time from `src/services/toolbox/definitions/index.ts`). Keeping
// the registry tiny and side-effect-free keeps the migration zero-downtime: a tool without a
// registered definition simply uses the legacy path.
//
// Design reference: design.md "Definition layer" + "Migration / Rollout". Requirements: 1.2.

import type { CalculatorDefinition } from '@/services/toolbox/types'

const registry = new Map<string, CalculatorDefinition>()

/**
 * Register (or replace) a calculator definition by its `id`. Returns the definition so
 * authors can `export const def = registerCalculatorDefinition({...})` in one statement.
 */
export function registerCalculatorDefinition<TInput, TRow>(
  definition: CalculatorDefinition<TInput, TRow>,
): CalculatorDefinition<TInput, TRow> {
  registry.set(definition.id, definition as unknown as CalculatorDefinition)
  return definition
}

/** Resolve a calculator definition by id, or `undefined` when none is registered. */
export function getCalculatorDefinition(id: string | undefined | null): CalculatorDefinition | undefined {
  if (!id) return undefined
  return registry.get(id)
}

/** True when a definition with the given id is registered. */
export function hasCalculatorDefinition(id: string | undefined | null): boolean {
  if (!id) return false
  return registry.has(id)
}

/** All registered definitions (insertion order). */
export function listCalculatorDefinitions(): CalculatorDefinition[] {
  return [...registry.values()]
}

/** Remove a single definition by id. Returns true when one was removed. */
export function unregisterCalculatorDefinition(id: string): boolean {
  return registry.delete(id)
}

/** Test/utility helper: clear the registry. */
export function resetCalculatorDefinitions(): void {
  registry.clear()
}
