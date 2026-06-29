import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GlassTable, type Column } from './GlassTable'

/**
 * Unit tests for GlassTable component.
 * Requirements: 4.5, 4.6, 4.7, 4.8
 */

interface Row {
  id: string
  name: string
  status: string
}

const columns: Column<Row>[] = [
  { key: 'name', label: 'Name' },
  { key: 'status', label: 'Status' },
]

const rows: Row[] = [
  { id: '1', name: 'Alpha Project', status: 'Active' },
  { id: '2', name: 'Beta Project', status: 'Pending' },
]

describe('GlassTable', () => {
  // ── Req 4.7: isLoading state ───────────────────────────────────────────────

  it('renders skeleton rows (not "Loading..." text) when isLoading is true', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={[]} rowKey="id" isLoading />
    )
    // The loading wrapper should have the aria-busy attribute
    const loader = container.querySelector('[aria-busy="true"]')
    expect(loader).toBeInTheDocument()
    // Skeleton row elements are rendered (glass-tile blocks)
    const skeletonRows = container.querySelectorAll('.glass-tile')
    expect(skeletonRows.length).toBeGreaterThan(0)
    // "Loading..." text is no longer used – skeleton UI replaced it
    expect(container.textContent?.trim()).toBe('')
  })

  it('does not render the table when isLoading is true', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={rows} rowKey="id" isLoading />
    )
    expect(container.querySelector('table')).toBeNull()
  })

  // ── Req 4.8: empty state ───────────────────────────────────────────────────

  it('renders default "No records found" when rows is empty', () => {
    render(<GlassTable columns={columns} rows={[]} rowKey="id" />)
    expect(screen.getByText('No records found')).toBeInTheDocument()
  })

  it('renders custom emptyState when rows is empty', () => {
    render(
      <GlassTable
        columns={columns}
        rows={[]}
        rowKey="id"
        emptyState={<span>Nothing here yet</span>}
      />
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })

  it('does not render the table when rows is empty', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={[]} rowKey="id" />
    )
    expect(container.querySelector('table')).toBeNull()
  })

  // ── Req 4.5: thead with th elements (font-semibold, text-foreground-muted) ──

  it('renders column headers in thead', () => {
    render(<GlassTable columns={columns} rows={rows} rowKey="id" />)
    expect(
      screen.getByRole('columnheader', { name: 'Name' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('columnheader', { name: 'Status' })
    ).toBeInTheDocument()
  })

  it('applies font-semibold and text-foreground-muted to th cells', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={rows} rowKey="id" />
    )
    const ths = container.querySelectorAll('th')
    ths.forEach((th) => {
      expect(th.className).toContain('font-semibold')
      expect(th.className).toContain('text-foreground-muted')
    })
  })

  it('adds scope="col" to each th for accessibility (Req 11.6)', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={rows} rowKey="id" />
    )
    const ths = container.querySelectorAll('th')
    ths.forEach((th) => {
      expect(th).toHaveAttribute('scope', 'col')
    })
  })

  // ── Req 4.5: tbody with tr.glass-record rows ───────────────────────────────

  it('renders all rows in tbody', () => {
    render(<GlassTable columns={columns} rows={rows} rowKey="id" />)
    expect(screen.getByText('Alpha Project')).toBeInTheDocument()
    expect(screen.getByText('Beta Project')).toBeInTheDocument()
  })

  it('applies glass-record class to each row', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={rows} rowKey="id" />
    )
    const trs = container.querySelectorAll('tbody tr')
    trs.forEach((tr) => {
      expect(tr.className).toContain('glass-record')
    })
  })

  it('renders correct number of rows', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={rows} rowKey="id" />
    )
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2)
  })

  // ── Req 4.6: onRowClick callback ──────────────────────────────────────────

  it('calls onRowClick with the correct row when a row is clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <GlassTable
        columns={columns}
        rows={rows}
        rowKey="id"
        onRowClick={handleClick}
      />
    )

    await user.click(screen.getByText('Alpha Project'))
    expect(handleClick).toHaveBeenCalledTimes(1)
    expect(handleClick).toHaveBeenCalledWith(rows[0])
  })

  it('calls onRowClick with the correct row on Enter key', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <GlassTable
        columns={columns}
        rows={rows}
        rowKey="id"
        onRowClick={handleClick}
      />
    )

    const buttons = screen.getAllByRole('button')
    buttons[0].focus()
    await user.keyboard('{Enter}')
    expect(handleClick).toHaveBeenCalledWith(rows[0])
  })

  it('calls onRowClick with the correct row on Space key', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()

    render(
      <GlassTable
        columns={columns}
        rows={rows}
        rowKey="id"
        onRowClick={handleClick}
      />
    )

    const buttons = screen.getAllByRole('button')
    buttons[1].focus()
    await user.keyboard(' ')
    expect(handleClick).toHaveBeenCalledWith(rows[1])
  })

  it('does not set row as interactive when onRowClick is not provided', () => {
    const { container } = render(
      <GlassTable columns={columns} rows={rows} rowKey="id" />
    )
    const trs = container.querySelectorAll('tbody tr')
    trs.forEach((tr) => {
      expect(tr).not.toHaveAttribute('role', 'button')
      expect(tr).not.toHaveAttribute('tabindex')
    })
  })

  // ── Custom render function ─────────────────────────────────────────────────

  it('uses custom render function for column cell', () => {
    const columnsWithRender: Column<Row>[] = [
      { key: 'name', label: 'Name' },
      {
        key: 'status',
        label: 'Status',
        render: (value) => <span className="badge">{String(value)}</span>,
      },
    ]

    render(
      <GlassTable columns={columnsWithRender} rows={rows} rowKey="id" />
    )

    const badges = document.querySelectorAll('.badge')
    expect(badges).toHaveLength(2)
    expect(badges[0].textContent).toBe('Active')
    expect(badges[1].textContent).toBe('Pending')
  })

  it('falls back to String() when render is not provided', () => {
    render(<GlassTable columns={columns} rows={rows} rowKey="id" />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })
})
