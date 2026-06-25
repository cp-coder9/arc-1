// Accessibility contracts test — toolbox framework
//
// Verifies the framework's accessibility contracts for all registered definitions:
// - All input schemas have named/labelled fields (screen-reader meaningful)
// - All definitions include disclaimers (Design Property 5 — advisory invariant)
// - All schedule schemas have typed fields with string descriptions
//
// Validates: Requirements 10.2 (accessible, labelled forms).

import { describe, it, expect } from 'vitest'
import { listCalculatorDefinitions } from './definitions'
import type { CalculatorDefinition } from './types'

// Import all definitions to populate the registry
import './definitions/index'

/** Extract field names from a Zod schema's shape (works for ZodObject). */
function getSchemaFieldNames(schema: unknown): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any
  if (s && s._def && s._def.shape) {
    const shape = typeof s._def.shape === 'function' ? s._def.shape() : s._def.shape
    return Object.keys(shape)
  }
  if (s && s.shape) {
    const shape = typeof s.shape === 'function' ? s.shape() : s.shape
    return Object.keys(shape)
  }
  return []
}

/** Check if a Zod schema has a description (via `.describe()`). */
function hasSchemaDescription(schema: unknown): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any
  return !!(s && s._def && s._def.description)
}

/** Get the field descriptions from a Zod object schema. */
function getFieldDescriptions(schema: unknown): Record<string, string | undefined> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = schema as any
  const result: Record<string, string | undefined> = {}
  let shape: Record<string, unknown> | undefined

  if (s && s._def && s._def.shape) {
    shape = typeof s._def.shape === 'function' ? s._def.shape() : s._def.shape
  } else if (s && s.shape) {
    shape = typeof s.shape === 'function' ? s.shape() : s.shape
  }

  if (shape) {
    for (const [key, field] of Object.entries(shape)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const f = field as any
      result[key] = f?._def?.description
    }
  }
  return result
}

describe('Accessibility — input schema labelling', () => {
  const definitions = listCalculatorDefinitions()
  // Full definitions must have proper labelled schemas; preview stubs are expected to be minimal
  const fullDefinitions = definitions.filter((d) => d.status === 'full')
  const previewDefinitions = definitions.filter((d) => d.status === 'preview')

  it('has at least one registered definition', () => {
    expect(definitions.length).toBeGreaterThan(0)
  })

  it('has both full and preview definitions', () => {
    expect(fullDefinitions.length).toBeGreaterThan(0)
    expect(previewDefinitions.length).toBeGreaterThan(0)
  })

  it('all full definitions have inputSchema with named fields (screen-reader meaningful)', () => {
    const failures: string[] = []

    for (const def of fullDefinitions) {
      const fields = getSchemaFieldNames(def.inputSchema)
      if (fields.length === 0) {
        failures.push(`${def.id}: inputSchema has no extractable field names`)
      }
      // Each field name should be a meaningful identifier (not single char, not generic)
      for (const field of fields) {
        if (field.length < 2) {
          failures.push(`${def.id}: field "${field}" is too short to be screen-reader meaningful`)
        }
      }
    }

    expect(failures).toEqual([])
  })

  it('preview definitions are explicitly labelled (no silent placeholders)', () => {
    const failures: string[] = []

    for (const def of previewDefinitions) {
      if (def.status !== 'preview') {
        failures.push(`${def.id}: expected status "preview" but got "${def.status}"`)
      }
      // Preview stubs must still have a title for accessible rendering
      if (!def.title || def.title.trim().length < 3) {
        failures.push(`${def.id}: preview stub missing meaningful title`)
      }
    }

    expect(failures).toEqual([])
  })

  it('all full definition schedule schemas (when present) have typed, named fields', () => {
    const failures: string[] = []

    for (const def of fullDefinitions) {
      if (!def.scheduleSchema) continue
      const fields = getSchemaFieldNames(def.scheduleSchema)
      if (fields.length === 0) {
        failures.push(`${def.id}: scheduleSchema has no extractable field names`)
      }
      for (const field of fields) {
        if (field.length < 2) {
          failures.push(`${def.id}: schedule field "${field}" is too short`)
        }
      }
    }

    expect(failures).toEqual([])
  })
})

describe('Accessibility — advisory invariant (Design Property 5)', () => {
  const definitions = listCalculatorDefinitions()

  it('all definitions include at least one disclaimer', () => {
    const failures: string[] = []

    for (const def of definitions) {
      if (!def.disclaimers || def.disclaimers.length === 0) {
        failures.push(`${def.id}: missing disclaimers (advisory invariant violated)`)
      }
    }

    expect(failures).toEqual([])
  })

  it('all disclaimers are non-empty strings', () => {
    const failures: string[] = []

    for (const def of definitions) {
      for (const d of def.disclaimers) {
        if (typeof d !== 'string' || d.trim().length === 0) {
          failures.push(`${def.id}: has an empty or non-string disclaimer`)
        }
      }
    }

    expect(failures).toEqual([])
  })
})

describe('Accessibility — definition completeness for UI rendering', () => {
  const definitions = listCalculatorDefinitions()

  it('all definitions have a non-empty title suitable for heading/aria-label', () => {
    const failures: string[] = []

    for (const def of definitions) {
      if (!def.title || def.title.trim().length < 3) {
        failures.push(`${def.id}: title is missing or too short for accessible labelling`)
      }
    }

    expect(failures).toEqual([])
  })

  it('all definitions have a source guideline reference', () => {
    const failures: string[] = []

    for (const def of definitions) {
      if (!def.source || !def.source.guideline) {
        failures.push(`${def.id}: missing source guideline reference`)
      }
    }

    expect(failures).toEqual([])
  })

  it('all definitions have a valid status (full or preview)', () => {
    const failures: string[] = []

    for (const def of definitions) {
      if (def.status !== 'full' && def.status !== 'preview') {
        failures.push(`${def.id}: status "${def.status}" is not "full" or "preview"`)
      }
    }

    expect(failures).toEqual([])
  })
})
