// ScheduleGrid — dynamic, definition-driven schedule editor (Task 5.2)
//
// Renders an editable, accessible grid of schedule rows whose columns are derived from a
// `CalculatorDefinition.scheduleSchema` (Zod) using the shared introspection helper. It
// supports the full row lifecycle — add / edit / duplicate / reorder / remove — validates
// each row individually against the schema (showing a per-row validity badge), and notifies
// the parent of the current rows so the engine can recompute live.
//
// Invalid rows are *isolated*: they are flagged and excluded from the live aggregate summary
// (mirroring the engine's row-isolation behaviour in `runCalculator`), so a single bad row
// never corrupts the totals shown to the user.
//
// Requirements:
//   2.1 — add, edit, duplicate, reorder, remove line items.
//   2.2 — recompute per-row and aggregate live as rows change.
//   2.4 — flag the specific invalid row and exclude it from aggregates until corrected.
//   10.2 — keyboard-navigable, labelled, screen-reader friendly.

import React, { useCallback, useMemo, useRef, useState } from 'react'
import type { ZodType } from 'zod'
import { Plus, Copy, Trash2, ArrowUp, ArrowDown, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  introspectObjectSchema,
  humanizeFieldName,
  type FieldDescriptor,
} from './zodFormIntrospection'

export type ScheduleRow = Record<string, unknown>

/** A column descriptor for the grid; defaults to the introspected schema fields. */
export type ScheduleColumn = FieldDescriptor

interface RowEntry {
  /** Stable per-row identity so reorder / duplicate / remove are robust. */
  id: string
  data: ScheduleRow
}

export interface ScheduleGridProps<TRow extends ScheduleRow = ScheduleRow> {
  /** Per-row schema used to derive columns and validate each row. */
  scheduleSchema: ZodType<TRow>
  /** Initial rows (e.g. restored from a saved run). */
  initialRows?: ScheduleRow[]
  /** Notified with the current rows after every mutation (drives live recompute). */
  onRowsChange?: (rows: ScheduleRow[]) => void
  /**
   * Optional live aggregate function. Receives ONLY the valid (schema-passing) rows, so
   * invalid rows are excluded from the summary (Requirement 2.4). When provided, the
   * computed aggregates are displayed beneath the grid and recomputed on every change.
   */
  computeAggregates?: (validRows: TRow[]) => Record<string, number | string>
  /** Explicit column override; defaults to fields introspected from `scheduleSchema`. */
  columns?: ScheduleColumn[]
  /** Heading / accessible label for the grid. */
  title?: string
  /** Factory for a new blank row; defaults to schema-derived defaults. */
  newRowFactory?: () => ScheduleRow
}

/** Build a blank row from column descriptors (defaults applied where declared). */
function blankRow(columns: ScheduleColumn[]): ScheduleRow {
  const row: ScheduleRow = {}
  for (const col of columns) {
    if (col.defaultValue !== undefined) {
      row[col.name] = col.defaultValue
    } else if (col.kind === 'boolean') {
      row[col.name] = false
    } else {
      row[col.name] = undefined
    }
  }
  return row
}

export default function ScheduleGrid<TRow extends ScheduleRow = ScheduleRow>(
  props: ScheduleGridProps<TRow>,
) {
  const {
    scheduleSchema,
    initialRows,
    onRowsChange,
    computeAggregates,
    columns: columnsOverride,
    title = 'Schedule',
    newRowFactory,
  } = props

  const columns = useMemo<ScheduleColumn[]>(
    () => columnsOverride ?? introspectObjectSchema(scheduleSchema as ZodType<unknown>),
    [columnsOverride, scheduleSchema],
  )

  const idSeq = useRef(0)
  const nextId = useCallback(() => {
    idSeq.current += 1
    return `srow-${idSeq.current}`
  }, [])

  const [entries, setEntries] = useState<RowEntry[]>(() =>
    (initialRows ?? []).map((data) => ({ id: nextId(), data: { ...data } })),
  )

  /** Apply a state transition then notify the parent with the resulting rows. */
  const commit = useCallback(
    (next: RowEntry[]) => {
      setEntries(next)
      onRowsChange?.(next.map((e) => ({ ...e.data })))
    },
    [onRowsChange],
  )

  const makeNewRow = useCallback(
    (): ScheduleRow => (newRowFactory ? newRowFactory() : blankRow(columns)),
    [columns, newRowFactory],
  )

  const handleAdd = useCallback(() => {
    commit([...entries, { id: nextId(), data: makeNewRow() }])
  }, [commit, entries, makeNewRow, nextId])

  const handleDuplicate = useCallback(
    (index: number) => {
      const source = entries[index]
      if (!source) return
      const copy: RowEntry = { id: nextId(), data: { ...source.data } }
      const next = [...entries.slice(0, index + 1), copy, ...entries.slice(index + 1)]
      commit(next)
    },
    [commit, entries, nextId],
  )

  const handleRemove = useCallback(
    (index: number) => {
      commit(entries.filter((_, i) => i !== index))
    },
    [commit, entries],
  )

  const handleMove = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= entries.length) return
      const next = [...entries]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      commit(next)
    },
    [commit, entries],
  )

  const handleCellChange = useCallback(
    (index: number, name: string, value: unknown) => {
      const next = entries.map((entry, i) =>
        i === index ? { ...entry, data: { ...entry.data, [name]: value } } : entry,
      )
      commit(next)
    },
    [commit, entries],
  )

  // Per-row validation + valid-row collection for aggregates (Requirements 2.2, 2.4).
  const validations = useMemo(
    () =>
      entries.map((entry) => {
        const parsed = scheduleSchema.safeParse(entry.data)
        if (parsed.success) {
          return { valid: true as const, parsed: parsed.data as TRow, messages: [] as string[] }
        }
        const messages = parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || 'row'}: ${issue.message}`,
        )
        return { valid: false as const, parsed: undefined, messages }
      }),
    [entries, scheduleSchema],
  )

  const aggregates = useMemo(() => {
    if (!computeAggregates) return null
    const validRows = validations
      .filter((v): v is { valid: true; parsed: TRow; messages: string[] } => v.valid)
      .map((v) => v.parsed)
    return computeAggregates(validRows)
  }, [computeAggregates, validations])

  const invalidCount = validations.filter((v) => !v.valid).length

  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button type="button" size="sm" variant="outline" onClick={handleAdd}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Add row
        </Button>
      </div>

      <Table>
        <caption className="sr-only">
          {title}: editable schedule of {entries.length} row(s)
          {invalidCount > 0 ? `, ${invalidCount} invalid` : ''}.
        </caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className="w-16">
              Row
            </TableHead>
            {columns.map((col) => (
              <TableHead key={col.name} scope="col">
                {col.label}
                {col.required && (
                  <span className="ml-0.5 text-destructive" aria-hidden="true">
                    *
                  </span>
                )}
              </TableHead>
            ))}
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="text-right">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length + 3} className="text-center text-muted-foreground">
                No rows yet. Use “Add row” to begin building the schedule.
              </TableCell>
            </TableRow>
          ) : (
            entries.map((entry, index) => {
              const validation = validations[index]
              const rowNumber = index + 1
              return (
                <TableRow
                  key={entry.id}
                  data-row-valid={validation.valid}
                  className={cn(!validation.valid && 'bg-destructive/5')}
                >
                  <TableCell className="font-medium tabular-nums">{rowNumber}</TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.name}>
                      <ScheduleCell
                        column={col}
                        rowNumber={rowNumber}
                        value={entry.data[col.name]}
                        invalid={!validation.valid}
                        onChange={(v) => handleCellChange(index, col.name, v)}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <RowStatusBadge valid={validation.valid} messages={validation.messages} rowNumber={rowNumber} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        label={`Move row ${rowNumber} up`}
                        disabled={index === 0}
                        onClick={() => handleMove(index, -1)}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Move row ${rowNumber} down`}
                        disabled={index === entries.length - 1}
                        onClick={() => handleMove(index, 1)}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Duplicate row ${rowNumber}`}
                        onClick={() => handleDuplicate(index)}
                      >
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={`Remove row ${rowNumber}`}
                        onClick={() => handleRemove(index)}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {aggregates && (
        <div
          className="rounded-lg border p-4"
          role="region"
          aria-label="Schedule aggregates"
        >
          <h4 className="mb-2 text-sm font-medium">Aggregates</h4>
          {invalidCount > 0 && (
            <p className="mb-2 text-xs text-amber-600" role="status">
              {invalidCount} invalid row(s) excluded from aggregates until corrected.
            </p>
          )}
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(aggregates).map(([key, val]) => (
              <div key={key} className="flex justify-between gap-2 text-sm">
                <dt className="text-muted-foreground">{humanizeFieldName(key)}</dt>
                <dd className="font-medium tabular-nums" data-aggregate={key}>
                  {String(val)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  )
}

// ----------------------------------------------------------------------------
// Cell control — one accessible input per column, labelled by column + row
// ----------------------------------------------------------------------------

interface ScheduleCellProps {
  column: ScheduleColumn
  rowNumber: number
  value: unknown
  invalid: boolean
  onChange: (value: unknown) => void
}

function ScheduleCell({ column, rowNumber, value, invalid, onChange }: ScheduleCellProps) {
  const label = `${column.label} for row ${rowNumber}`

  if (column.kind === 'boolean') {
    return (
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        aria-label={label}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
      />
    )
  }

  if (column.kind === 'enum') {
    return (
      <select
        aria-label={label}
        className={cn(
          'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          invalid && 'border-destructive',
        )}
        value={value === undefined || value === null ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
      >
        <option value="">Select…</option>
        {column.options?.map((opt) => (
          <option key={opt} value={opt}>
            {humanizeFieldName(opt)}
          </option>
        ))}
      </select>
    )
  }

  const isNumber = column.kind === 'number'
  return (
    <Input
      aria-label={label}
      type={isNumber ? 'number' : 'text'}
      inputMode={isNumber ? 'decimal' : undefined}
      className={cn('h-8 min-w-24', invalid && 'border-destructive')}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => {
        if (isNumber) {
          const raw = e.target.value
          onChange(raw === '' ? undefined : Number(raw))
        } else {
          onChange(e.target.value)
        }
      }}
    />
  )
}

// ----------------------------------------------------------------------------
// Per-row validity badge (Requirement 2.4 — flag the specific invalid row)
// ----------------------------------------------------------------------------

function RowStatusBadge({
  valid,
  messages,
  rowNumber,
}: {
  valid: boolean
  messages: string[]
  rowNumber: number
}) {
  if (valid) {
    return (
      <Badge variant="secondary" className="gap-1">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        <span>Valid</span>
        <span className="sr-only">— row {rowNumber} is valid</span>
      </Badge>
    )
  }
  const detail = messages.join('; ')
  return (
    <Badge variant="destructive" className="gap-1" title={detail}>
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
      <span>Invalid</span>
      <span className="sr-only">
        — row {rowNumber} is invalid and excluded from aggregates: {detail}
      </span>
    </Badge>
  )
}

// ----------------------------------------------------------------------------
// Small labelled icon button
// ----------------------------------------------------------------------------

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}
