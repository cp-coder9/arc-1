import React from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

import ScheduleGrid from './ScheduleGrid'

// A representative per-row schedule schema: a BoQ-style line item with a required
// description, a positive quantity, and a non-negative rate. `.describe()` overrides
// the humanised label for one column to exercise the introspection path.
const rowSchema = z.object({
  description: z.string().min(1, 'Description is required').describe('Description'),
  quantity: z.number({ invalid_type_error: 'Quantity is required' }).positive('Quantity must be positive'),
  rate: z.number({ invalid_type_error: 'Rate is required' }).nonnegative('Rate must be ≥ 0'),
})

type Row = z.infer<typeof rowSchema>

const sumLineTotals = (rows: Row[]): Record<string, number> => ({
  total: rows.reduce((acc, r) => acc + r.quantity * r.rate, 0),
})

function renderGrid(overrides: Partial<React.ComponentProps<typeof ScheduleGrid<Row>>> = {}) {
  const onRowsChange = vi.fn()
  const utils = render(
    <ScheduleGrid<Row>
      scheduleSchema={rowSchema}
      onRowsChange={onRowsChange}
      computeAggregates={sumLineTotals}
      {...overrides}
    />,
  )
  return { onRowsChange, ...utils }
}

/** Helper: fill a row's cells (cells are labelled "<Column> for row <n>"). */
async function fillRow(
  user: ReturnType<typeof userEvent.setup>,
  rowNumber: number,
  values: { description?: string; quantity?: string; rate?: string },
) {
  if (values.description !== undefined) {
    await user.type(screen.getByLabelText(`Description for row ${rowNumber}`), values.description)
  }
  if (values.quantity !== undefined) {
    await user.type(screen.getByLabelText(`Quantity for row ${rowNumber}`), values.quantity)
  }
  if (values.rate !== undefined) {
    await user.type(screen.getByLabelText(`Rate for row ${rowNumber}`), values.rate)
  }
}

describe('ScheduleGrid — columns + accessibility', () => {
  test('derives column headers from the schedule schema', () => {
    renderGrid()
    expect(screen.getByRole('columnheader', { name: /Description/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Quantity/i })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Rate/i })).toBeInTheDocument()
  })

  test('exposes a labelled add control and a labelled region', () => {
    renderGrid({ title: 'BoQ Schedule' })
    expect(screen.getByRole('button', { name: /add row/i })).toBeInTheDocument()
    // The grid is wrapped in a labelled region for screen readers.
    expect(screen.getByRole('region', { name: /BoQ Schedule/i })).toBeInTheDocument()
  })
})

describe('ScheduleGrid — row operations (Requirement 2.1)', () => {
  test('adds a row and notifies the parent', async () => {
    const user = userEvent.setup()
    const { onRowsChange } = renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))

    // A new row's cells become available.
    expect(screen.getByLabelText('Description for row 1')).toBeInTheDocument()
    expect(onRowsChange).toHaveBeenCalledTimes(1)
    expect(onRowsChange.mock.calls[0][0]).toHaveLength(1)
  })

  test('edits a cell and propagates the change', async () => {
    const user = userEvent.setup()
    const { onRowsChange } = renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 1, { description: 'Concrete' })

    const lastCall = onRowsChange.mock.calls.at(-1)![0]
    expect(lastCall[0]).toMatchObject({ description: 'Concrete' })
  })

  test('duplicates a row, copying its values', async () => {
    const user = userEvent.setup()
    const { onRowsChange } = renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 1, { description: 'Rebar', quantity: '5', rate: '20' })

    await user.click(screen.getByRole('button', { name: /duplicate row 1/i }))

    const rows = onRowsChange.mock.calls.at(-1)![0]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ description: 'Rebar', quantity: 5, rate: 20 })
    expect(rows[1]).toMatchObject({ description: 'Rebar', quantity: 5, rate: 20 })
  })

  test('removes a row', async () => {
    const user = userEvent.setup()
    const { onRowsChange } = renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))
    await user.click(screen.getByRole('button', { name: /add row/i }))
    expect(onRowsChange.mock.calls.at(-1)![0]).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /remove row 1/i }))
    expect(onRowsChange.mock.calls.at(-1)![0]).toHaveLength(1)
  })

  test('reorders rows with move up / move down', async () => {
    const user = userEvent.setup()
    const { onRowsChange } = renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 1, { description: 'First' })
    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 2, { description: 'Second' })

    // Move row 2 up — "Second" should now precede "First".
    await user.click(screen.getByRole('button', { name: /move row 2 up/i }))

    const rows = onRowsChange.mock.calls.at(-1)![0]
    expect(rows[0]).toMatchObject({ description: 'Second' })
    expect(rows[1]).toMatchObject({ description: 'First' })
  })
})

describe('ScheduleGrid — live aggregates + invalid-row isolation (Requirements 2.2, 2.4)', () => {
  test('recomputes the aggregate live as rows change', async () => {
    const user = userEvent.setup()
    renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 1, { description: 'Beam', quantity: '3', rate: '10' })

    const region = screen.getByRole('region', { name: /schedule aggregates/i })
    expect(within(region).getByText('30')).toBeInTheDocument()

    // Editing the rate updates the aggregate immediately.
    const rate = screen.getByLabelText('Rate for row 1')
    await user.clear(rate)
    await user.type(rate, '20')
    expect(within(region).getByText('60')).toBeInTheDocument()
  })

  test('flags an invalid row and excludes it from the aggregate', async () => {
    const user = userEvent.setup()
    renderGrid()

    // Row 1: valid → contributes 2 * 10 = 20.
    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 1, { description: 'Slab', quantity: '2', rate: '10' })

    // Row 2: invalid (missing quantity & rate) → must be flagged and excluded.
    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 2, { description: 'Incomplete' })

    // Row 1 valid badge, row 2 invalid badge.
    const validBadges = screen.getAllByText('Valid')
    const invalidBadges = screen.getAllByText('Invalid')
    expect(validBadges).toHaveLength(1)
    expect(invalidBadges).toHaveLength(1)

    // Aggregate reflects only the valid row (20), not the invalid one.
    const region = screen.getByRole('region', { name: /schedule aggregates/i })
    expect(within(region).getByText('20')).toBeInTheDocument()
    expect(within(region).getByText(/1 invalid row\(s\) excluded/i)).toBeInTheDocument()
  })

  test('an invalid row does not corrupt a sibling row’s validity (isolation)', async () => {
    const user = userEvent.setup()
    renderGrid()

    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 1, { description: 'Good', quantity: '1', rate: '5' })
    await user.click(screen.getByRole('button', { name: /add row/i }))
    await fillRow(user, 2, { description: 'Bad', quantity: '-3', rate: '5' })

    // Row 1 remains valid even though row 2 is invalid.
    const rowOne = screen.getByLabelText('Description for row 1').closest('tr')!
    const rowTwo = screen.getByLabelText('Description for row 2').closest('tr')!
    expect(rowOne).toHaveAttribute('data-row-valid', 'true')
    expect(rowTwo).toHaveAttribute('data-row-valid', 'false')
  })
})

describe('ScheduleGrid — initial rows', () => {
  test('renders rows passed via initialRows', () => {
    renderGrid({
      initialRows: [
        { description: 'Footing', quantity: 4, rate: 15 },
        { description: 'Column', quantity: 2, rate: 30 },
      ],
    })

    expect(screen.getByLabelText('Description for row 1')).toHaveValue('Footing')
    expect(screen.getByLabelText('Description for row 2')).toHaveValue('Column')

    // 4*15 + 2*30 = 120
    const region = screen.getByRole('region', { name: /schedule aggregates/i })
    expect(within(region).getByText('120')).toBeInTheDocument()
  })
})
