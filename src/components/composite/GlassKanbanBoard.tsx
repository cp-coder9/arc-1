import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * GlassKanbanBoard — Horizontal kanban board with glass-styled columns and cards.
 *
 * Preconditions:
 *   - columns is an array of KanbanColumn objects with unique ids
 *   - Each KanbanItem within a column has a unique id
 *   - onDragEnd callback is optional; called when a card is moved
 *
 * Postconditions:
 *   - Renders columns horizontally, each as a glass-panel
 *   - Cards inside columns are styled with glass-tile
 *   - Optional tag is rendered as a glass-pill
 *   - Column header renders as h3 with font-heading font-bold
 *   - Component is keyboard navigable and accessible
 *
 * DnD NOTE:
 *   Drag-and-drop is NOT currently active. Neither react-beautiful-dnd nor
 *   @dnd-kit is present in package.json. To enable drag-and-drop:
 *
 *   Option A — @dnd-kit (recommended):
 *     1. npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
 *     2. Wrap board in <DndContext onDragEnd={handleDragEnd}>
 *     3. Wrap each column in <SortableContext items={column.items.map(i => i.id)}>
 *     4. Make each card a <SortableItem> using useSortable hook
 *     5. Map the DragEndEvent to the onDragEnd callback shape defined below
 *
 *   Option B — react-beautiful-dnd:
 *     1. npm install react-beautiful-dnd @types/react-beautiful-dnd
 *     2. Wrap board in <DragDropContext onDragEnd={...}>
 *     3. Wrap each column in <Droppable droppableId={column.id}>
 *     4. Wrap each card in <Draggable draggableId={item.id} index={i}>
 *     5. Map DropResult to the onDragEnd callback shape defined below
 *
 * Requirements: 4.10
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KanbanItem {
  /** Unique identifier for this item. */
  id: string
  /** Primary title displayed on the card. */
  title: string
  /** Optional longer description rendered below the title. */
  description?: string
  /** Optional tag label rendered as a glass-pill. */
  tag?: string
}

export interface KanbanColumn {
  /** Unique identifier for this column. */
  id: string
  /** Column header title. */
  title: string
  /** Items contained in this column. */
  items: KanbanItem[]
}

/** Result payload passed to `onDragEnd` after a successful drag operation. */
export interface KanbanDragResult {
  /** Id of the card that was dragged. */
  itemId: string
  /** Id of the column the card was dragged from. */
  fromColumnId: string
  /** Id of the column the card was dropped into. */
  toColumnId: string
  /** Zero-based index at which the card was inserted in the target column. */
  newIndex: number
}

export interface GlassKanbanBoardProps {
  /** Column definitions including their items. */
  columns: KanbanColumn[]
  /**
   * Called after a successful drag operation.
   * The consumer is responsible for updating state with the new column order.
   * (No-op in the current non-DnD implementation — reserved for DnD wiring.)
   */
  onDragEnd?: (result: KanbanDragResult) => void
  /** Additional class names applied to the board wrapper. */
  className?: string
}

// ── KanbanCard ─────────────────────────────────────────────────────────────────

function KanbanCard({ item }: { item: KanbanItem; columnId: string }) {
  return (
    <article
      className="glass-tile rounded-xl p-4 flex flex-col gap-2 focus-visible-ring focus:outline-none"
      aria-label={item.title}
      /*
       * tabIndex is set so keyboard users can focus individual cards.
       * Once DnD is wired, replace this with the DnD library's drag handle props.
       */
      tabIndex={0}
    >
      {/* Tag pill (optional) */}
      {item.tag && (
        <span
          className="glass-pill text-xs font-medium px-2 py-0.5 rounded-full w-fit text-foreground-muted"
          aria-label={`Tag: ${item.tag}`}
        >
          {item.tag}
        </span>
      )}

      {/* Title */}
      <p className="text-sm font-semibold text-foreground leading-snug">
        {item.title}
      </p>

      {/* Description (optional) */}
      {item.description && (
        <p className="text-xs text-foreground-muted leading-relaxed">
          {item.description}
        </p>
      )}
    </article>
  )
}

// ── KanbanColumn ───────────────────────────────────────────────────────────────

function KanbanColumnPanel({ column }: { column: KanbanColumn }) {
  return (
    <section
      className="glass-panel rounded-2xl p-4 flex flex-col gap-3 min-w-[260px] w-[280px] flex-shrink-0"
      aria-label={`${column.title} column`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h3 className="text-sm font-heading font-bold text-foreground">
          {column.title}
        </h3>
        {/* Item count badge */}
        <span
          className="glass-pill text-xs font-medium px-2 py-0.5 rounded-full text-foreground-muted tabular-nums"
          aria-label={`${column.items.length} item${column.items.length === 1 ? "" : "s"}`}
        >
          {column.items.length}
        </span>
      </div>

      {/* Cards */}
      <div
        className="flex flex-col gap-3 min-h-[80px]"
        /*
         * role="list" exposes this as a list of cards for screen readers.
         * When DnD is wired, this becomes the Droppable / SortableContext target.
         */
        role="list"
        aria-label={`${column.title} items`}
      >
        {column.items.length === 0 ? (
          <p className="text-xs text-foreground-muted text-center py-4 opacity-60">
            No items
          </p>
        ) : (
          column.items.map((item) => (
            <div key={item.id} role="listitem">
              <KanbanCard item={item} columnId={column.id} />
            </div>
          ))
        )}
      </div>
    </section>
  )
}

// ── GlassKanbanBoard ───────────────────────────────────────────────────────────

/**
 * GlassKanbanBoard — Horizontal kanban board with glass-styled columns and cards.
 *
 * This component renders all columns and cards correctly without drag-and-drop.
 * See the DnD NOTE at the top of this file for wiring instructions once a DnD
 * library is installed.
 *
 * Requirements: 4.10
 */
export function GlassKanbanBoard({
  columns,
  // onDragEnd is intentionally unused in this non-DnD implementation.
  // It will be wired once @dnd-kit or react-beautiful-dnd is installed.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDragEnd: _onDragEnd,
  className,
}: GlassKanbanBoardProps) {
  return (
    <div
      className={cn(
        "w-full overflow-x-auto pb-4",
        className
      )}
      role="region"
      aria-label="Kanban board"
    >
      {/* Horizontal column strip */}
      <div className="flex gap-4 min-w-max">
        {columns.length === 0 ? (
          <p className="text-sm text-foreground-muted py-12 px-6">
            No columns configured.
          </p>
        ) : (
          columns.map((column) => (
            <div key={column.id}>
              <KanbanColumnPanel column={column} />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default GlassKanbanBoard
