import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import DefinitionToolRunner, { deriveFormFields } from './DefinitionToolRunner'
import type { CalculatorDefinition } from '@/services/toolbox/types'

// A representative typed input schema covering number / enum / boolean / string fields,
// with per-field validation messages and a `.describe()` label override.
const inputSchema = z.object({
  area: z.number({ invalid_type_error: 'Area is required' }).min(1, 'Area must be at least 1'),
  orientation: z.enum(['north', 'south', 'east', 'west']),
  hasShading: z.boolean().default(false),
  projectName: z.string().min(1, 'Project name is required').describe('Project Name'),
})

type TestInput = z.infer<typeof inputSchema>

function makeDefinition(): CalculatorDefinition {
  return {
    id: 'test_def_v1',
    toolId: 'test_tool',
    title: 'Test Calculator',
    method: 'area',
    inputSchema,
    tableRefs: [],
    compute: (ctx) => ({
      lineResults: [],
      aggregates: { total: Number(ctx.input.area) * 2 },
      clauseResults: [],
      sourceVersions: [],
      disclaimers: ['Advisory only — professional sign-off required.'],
      warnings: [],
    }),
    reportTemplateId: 'test_report',
    source: { guideline: 'Test Guideline', version: '1.0', status: 'indicative' },
    disclaimers: ['Advisory only — professional sign-off required.'],
    status: 'full',
  }
}

describe('deriveFormFields', () => {
  test('introspects number / enum / boolean / string fields with required flags and labels', () => {
    const fields = deriveFormFields(inputSchema)
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f]))

    expect(byKey.area.kind).toBe('number')
    expect(byKey.area.required).toBe(true)

    expect(byKey.orientation.kind).toBe('select')
    expect(byKey.orientation.options?.map((o) => o.value)).toEqual(['north', 'south', 'east', 'west'])

    // `.default()` makes the field user-optional.
    expect(byKey.hasShading.kind).toBe('checkbox')
    expect(byKey.hasShading.required).toBe(false)

    // `.describe()` overrides the humanised label.
    expect(byKey.projectName.kind).toBe('text')
    expect(byKey.projectName.label).toBe('Project Name')
  })
})

describe('DefinitionToolRunner', () => {
  test('renders accessible, labelled fields from the Zod input schema', () => {
    render(<DefinitionToolRunner definition={makeDefinition()} tables={[]} />)

    // Each control is reachable by its accessible label (label associated with input).
    expect(screen.getByLabelText(/Area/i)).toHaveAttribute('type', 'number')
    expect(screen.getByLabelText(/Orientation/i).tagName).toBe('SELECT')
    expect(screen.getByLabelText(/Has Shading/i)).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText(/Project Name/i)).toHaveAttribute('type', 'text')
  })

  test('shows validation errors when required inputs are missing', async () => {
    const user = userEvent.setup()
    const onResult = vi.fn()
    render(<DefinitionToolRunner definition={makeDefinition()} tables={[]} onResult={onResult} />)

    await user.click(screen.getByRole('button', { name: /compute/i }))

    // Form-level error plus field-level error messages are surfaced as alerts.
    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    expect(screen.getByText('Please correct the highlighted fields.')).toBeInTheDocument()

    const areaField = screen.getByLabelText(/Area/i)
    expect(areaField).toHaveAttribute('aria-invalid', 'true')

    // No result computed on invalid submit.
    expect(onResult).toHaveBeenLastCalledWith(null)
    expect(screen.queryByRole('region', { name: /calculation result/i })).not.toBeInTheDocument()
  })

  test('computes a result via the engine on a valid submit', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    render(<DefinitionToolRunner definition={makeDefinition()} tables={[]} onRun={onRun} />)

    await user.type(screen.getByLabelText(/Area/i), '10')
    await user.selectOptions(screen.getByLabelText(/Orientation/i), 'north')
    await user.type(screen.getByLabelText(/Project Name/i), 'Pinewood')

    await user.click(screen.getByRole('button', { name: /compute/i }))

    const resultRegion = await screen.findByRole('region', { name: /calculation result/i })
    // compute() returns total = area * 2 = 20
    expect(within(resultRegion).getByText('20')).toBeInTheDocument()
    expect(within(resultRegion).getByText(/Advisory only/i)).toBeInTheDocument()

    expect(onRun).toHaveBeenCalledTimes(1)
    const [inputArg, resultArg] = onRun.mock.calls[0]
    expect(inputArg).toMatchObject({ area: 10, orientation: 'north', projectName: 'Pinewood' })
    expect(resultArg.aggregates.total).toBe(20)
  })
})
