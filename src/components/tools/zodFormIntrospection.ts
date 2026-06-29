// Zod schema introspection for definition-driven forms
//
// `DefinitionToolRunner` renders a typed, labelled, accessible form straight from a
// `CalculatorDefinition.inputSchema` (a Zod schema) instead of a bespoke hand-built form.
// To do that it needs to walk the schema and describe each top-level field: its kind
// (string / number / boolean / enum), whether it is required, a human-friendly label,
// any enum options, and a default value.
//
// Targets Zod 3.x internals (`_def.typeName`, `_def.innerType`, `_def.values`, etc.).
// Wrappers (optional / nullable / default / effects) are unwrapped to find the base type
// and to decide whether the field is required. Design ref: design.md "UI layer"
// (DefinitionToolRunner renders form from inputSchema). Requirements: 1.1, 10.2.

import type { ZodRawShape, ZodTypeAny } from 'zod'

/** The form-control kind a Zod field maps to. */
export type FieldKind = 'string' | 'number' | 'boolean' | 'enum' | 'unsupported'

/** A single renderable form field derived from a Zod object property. */
export interface FieldDescriptor {
  /** Property name on the schema (used as the value key). */
  name: string
  /** Which control to render. */
  kind: FieldKind
  /** Human-friendly label (from `.describe()` when present, else humanised name). */
  label: string
  /** Whether the field must be provided (false for optional / nullable / defaulted). */
  required: boolean
  /** Allowed values when `kind === 'enum'`. */
  options?: string[]
  /** Default value declared via `.default(...)`, if any. */
  defaultValue?: unknown
}

/**
 * Turn a camelCase / snake_case / kebab-case identifier into a Title Case label.
 * e.g. `valueForFeePurposes` -> "Value For Fee Purposes", `roof_u` -> "Roof U".
 */
export function humanizeFieldName(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!spaced) return name
  return spaced
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface Unwrapped {
  base: ZodTypeAny
  required: boolean
  defaultValue?: unknown
  description?: string
}

/**
 * Peel wrapper types (optional / nullable / default / effects) off a field schema to
 * reach the base type, tracking whether the field is required and any declared default.
 */
function unwrap(schema: ZodTypeAny): Unwrapped {
  let current = schema as ZodTypeAny & { _def?: Record<string, unknown> }
  let required = true
  let defaultValue: unknown
  let description: string | undefined = current?._def?.description as string | undefined

  // Bounded loop guards against pathological / circular schemas.
  for (let depth = 0; depth < 16; depth += 1) {
    const def = current?._def as Record<string, unknown> | undefined
    const typeName = def?.typeName as string | undefined

    if (typeName === 'ZodOptional' || typeName === 'ZodNullable') {
      required = false
      current = def!.innerType as typeof current
    } else if (typeName === 'ZodDefault') {
      required = false
      const factory = def!.defaultValue as (() => unknown) | undefined
      if (typeof factory === 'function') defaultValue = factory()
      current = def!.innerType as typeof current
    } else if (typeName === 'ZodEffects') {
      current = def!.schema as typeof current
    } else {
      break
    }

    description = description ?? (current?._def?.description as string | undefined)
  }

  return { base: current, required, defaultValue, description }
}

/** Classify the base (unwrapped) Zod type into a renderable field kind. */
function classify(base: ZodTypeAny): { kind: FieldKind; options?: string[] } {
  const def = (base as ZodTypeAny & { _def?: Record<string, unknown> })?._def
  const typeName = def?.typeName as string | undefined

  switch (typeName) {
    case 'ZodString':
      return { kind: 'string' }
    case 'ZodNumber':
      return { kind: 'number' }
    case 'ZodBoolean':
      return { kind: 'boolean' }
    case 'ZodEnum':
      return { kind: 'enum', options: [...((def!.values as string[]) ?? [])] }
    case 'ZodNativeEnum': {
      const raw = def!.values as Record<string, string | number>
      const options = Object.values(raw).filter((v): v is string => typeof v === 'string')
      return { kind: 'enum', options }
    }
    default:
      return { kind: 'unsupported' }
  }
}

/** Read the `.shape` of a ZodObject across Zod 3.x variants (getter or factory). */
function readObjectShape(def: Record<string, unknown>): ZodRawShape | null {
  const shape = def.shape
  if (typeof shape === 'function') return (shape as () => ZodRawShape)()
  if (shape && typeof shape === 'object') return shape as ZodRawShape
  return null
}

/**
 * Introspect a Zod object schema into an ordered list of renderable field descriptors.
 * Returns an empty array for non-object schemas so callers can render a graceful fallback.
 */
export function introspectObjectSchema(schema: ZodTypeAny | undefined): FieldDescriptor[] {
  const def = (schema as (ZodTypeAny & { _def?: Record<string, unknown> }) | undefined)?._def
  if (!def || def.typeName !== 'ZodObject') return []

  const shape = readObjectShape(def)
  if (!shape) return []

  return Object.entries(shape).map(([name, fieldSchema]) => {
    const { base, required, defaultValue, description } = unwrap(fieldSchema as ZodTypeAny)
    const { kind, options } = classify(base)
    return {
      name,
      kind,
      label: description?.trim() ? description.trim() : humanizeFieldName(name),
      required,
      options,
      defaultValue,
    }
  })
}
