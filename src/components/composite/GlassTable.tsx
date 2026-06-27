import * as React from "react"

import { cn } from "@/lib/utils"
import { SkeletonTableRow } from "@/components/ui/LoadingSkeleton"

/**
 * Column descriptor for GlassTable.
 *
 * @template T — The row data type.
 */
export interface Column<T> {
  /** Property key to read from each row object. */
  key: keyof T
  /** Header label displayed in the <th> cell. */
  label: string
  /**
   * Optional custom renderer.
   * When omitted the value is coerced to a string via String().
   */
  render?: (value: T[keyof T], row: T) => React.ReactNode
}

/**
 * Props for GlassTable.
 *
 * @template T — The row data type.
 */
export interface GlassTableProps<T> {
  /** Column definitions. */
  columns: Column<T>[]
  /** Rows to display. */
  rows: T[]
  /** Property key whose value uniquely identifies each row. */
  rowKey: keyof T
  /** Called when the user clicks a row. */
  onRowClick?: (row: T) => void
  /** When true, renders a loading indicator instead of the table. */
  isLoading?: boolean
  /** Rendered when `rows` is empty and `isLoading` is false. */
  emptyState?: React.ReactNode
  /** Additional class names applied to the outermost wrapper. */
  className?: string
}

/**
 * GlassTable — Generic data table with frosted glass record rows.
 *
 * Preconditions:
 *   - columns.length > 0
 *   - rows is an array (may be empty)
 *   - rowKey refers to a property that uniquely identifies each row
 *
 * Postconditions:
 *   - When isLoading is true, renders "Loading..." centred below the wrapper.
 *   - When rows is empty (and not loading), renders emptyState prop or the
 *     default "No records found" message.
 *   - Otherwise renders an accessible <table> with:
 *       • <thead> containing <th scope="col"> cells (font-semibold, text-foreground-muted)
 *       • <tbody> containing <tr class="glass-record"> rows
 *   - onRowClick is called with the clicked row when provided.
 *   - Rows are keyboard-navigable: Enter/Space fires onRowClick.
 *
 * Requirements: 4.5, 4.6, 4.7, 4.8
 */
export function GlassTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  isLoading = false,
  emptyState,
  className,
}: GlassTableProps<T>) {
  // ── Loading state (Req 4.7, 7.7) ───────────────────────────────────────────
  // Render a stack of skeleton rows instead of plain "Loading…" text so the
  // user receives visual feedback about the shape of the incoming content.
  if (isLoading) {
    return (
      <div
        className={cn("space-y-2 py-2", className)}
        aria-live="polite"
        aria-busy="true"
        aria-label="Loading table data"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <SkeletonTableRow key={i} />
        ))}
      </div>
    )
  }

  // ── Empty state (Req 4.8) ───────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "py-12 text-center text-foreground-muted",
          className
        )}
      >
        {emptyState ?? "No records found"}
      </div>
    )
  }

  // ── Table (Req 4.5, 4.6) ────────────────────────────────────────────────────
  return (
    <div className={cn("overflow-x-auto rounded-lg", className)}>
      <table className="w-full text-sm">
        {/* thead — font-semibold, text-foreground-muted (Req 4.5, 11.6) */}
        <thead>
          <tr className="border-b border-border">
            {columns.map((col) => (
              <th
                key={String(col.key)}
                scope="col"
                className="px-4 py-3 text-left font-semibold text-foreground-muted"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* tbody — glass-record rows (Req 4.5) */}
        <tbody>
          {rows.map((row) => {
            const key = String(row[rowKey])
            const isClickable = typeof onRowClick === "function"

            return (
              <tr
                key={key}
                className={cn(
                  "glass-record rounded-lg transition-all",
                  isClickable &&
                    "cursor-pointer hover:-translate-y-0.5 focus-visible-ring focus:outline-none"
                )}
                onClick={isClickable ? () => onRowClick(row) : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          onRowClick(row)
                        }
                      }
                    : undefined
                }
                tabIndex={isClickable ? 0 : undefined}
                role={isClickable ? "button" : undefined}
                aria-label={isClickable ? `Row ${key}` : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={String(col.key)}
                    className="px-4 py-3 text-foreground"
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : String(row[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default GlassTable
