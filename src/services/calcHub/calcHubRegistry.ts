// Engineer's Calculation Hub — Calculator Registry
//
// In-memory singleton registry storing CalcHubCalculator objects.
// Provides lookup by ID, filtering by discipline, and bulk retrieval.
//
// Requirements: 19.1, 19.4, 19.5

import type { CalcHubCalculator, DisciplineGroup } from './types'

/** Internal store — keyed by calculator meta.id */
const registry = new Map<string, CalcHubCalculator>()

/**
 * Register a calculator in the hub registry.
 * Throws if a calculator with the same ID is already registered.
 */
export function registerCalculator(calculator: CalcHubCalculator): void {
  const { id } = calculator.meta
  if (registry.has(id)) {
    throw new Error(
      `CalcHubRegistry: calculator with id "${id}" is already registered.`
    )
  }
  registry.set(id, calculator)
}

/**
 * Retrieve a registered calculator by its unique ID.
 * Returns undefined if no calculator with that ID exists.
 */
export function getCalculator(id: string): CalcHubCalculator | undefined {
  return registry.get(id)
}

/**
 * Return all calculators belonging to a given discipline group.
 */
export function getCalculatorsByDiscipline(
  discipline: DisciplineGroup
): CalcHubCalculator[] {
  return Array.from(registry.values()).filter(
    (calc) => calc.meta.discipline === discipline
  )
}

/**
 * Return all registered calculators.
 */
export function getAllCalculators(): CalcHubCalculator[] {
  return Array.from(registry.values())
}

/**
 * Clear the registry. Intended for testing purposes only.
 */
export function clearRegistry(): void {
  registry.clear()
}
