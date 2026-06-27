/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { GlassKanbanBoard, type KanbanColumn } from "./GlassKanbanBoard"

// ── Fixtures ───────────────────────────────────────────────────────────────────

const makeColumns = (): KanbanColumn[] => [
  {
    id: "todo",
    title: "To Do",
    items: [
      {
        id: "item-1",
        title: "Design review",
        description: "Review the latest mockups",
        tag: "Design",
      },
      {
        id: "item-2",
        title: "Write tests",
      },
    ],
  },
  {
    id: "in-progress",
    title: "In Progress",
    items: [
      {
        id: "item-3",
        title: "Implement API",
        tag: "Backend",
      },
    ],
  },
  {
    id: "done",
    title: "Done",
    items: [],
  },
]

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("GlassKanbanBoard", () => {
  it("renders the board region with aria-label", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(
      screen.getByRole("region", { name: "Kanban board" })
    ).toBeInTheDocument()
  })

  it("renders each column heading as h3 with font-heading", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    const todoHeading = screen.getByRole("heading", { name: "To Do", level: 3 })
    expect(todoHeading).toBeInTheDocument()
    expect(todoHeading.className).toContain("font-heading")
    expect(todoHeading.className).toContain("font-bold")
  })

  it("renders all three column headings", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(screen.getByRole("heading", { name: "To Do", level: 3 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "In Progress", level: 3 })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Done", level: 3 })).toBeInTheDocument()
  })

  it("renders item titles inside each column", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(screen.getByText("Design review")).toBeInTheDocument()
    expect(screen.getByText("Write tests")).toBeInTheDocument()
    expect(screen.getByText("Implement API")).toBeInTheDocument()
  })

  it("renders item descriptions when provided", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(screen.getByText("Review the latest mockups")).toBeInTheDocument()
  })

  it("renders tag pills for items that have a tag", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(screen.getByText("Design")).toBeInTheDocument()
    expect(screen.getByText("Backend")).toBeInTheDocument()
  })

  it("applies glass-pill class to tag elements", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    const tag = screen.getByText("Design")
    expect(tag.className).toContain("glass-pill")
  })

  it("renders column item count badge", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    // "To Do" column has 2 items
    expect(screen.getByLabelText("2 items")).toBeInTheDocument()
    // "In Progress" column has 1 item
    expect(screen.getByLabelText("1 item")).toBeInTheDocument()
    // "Done" column has 0 items
    expect(screen.getByLabelText("0 items")).toBeInTheDocument()
  })

  it("renders 'No items' placeholder in empty columns", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(screen.getByText("No items")).toBeInTheDocument()
  })

  it("renders 'No columns configured' when columns is empty", () => {
    render(<GlassKanbanBoard columns={[]} />)
    expect(screen.getByText("No columns configured.")).toBeInTheDocument()
  })

  it("applies glass-panel class to each column section", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    const columnSections = screen.getAllByRole("region")
    // The outer board region + 3 column sections
    const columnPanels = columnSections.filter((el) =>
      el.getAttribute("aria-label")?.includes("column")
    )
    expect(columnPanels).toHaveLength(3)
    columnPanels.forEach((panel) => {
      expect(panel.className).toContain("glass-panel")
    })
  })

  it("applies glass-tile class to card articles", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    const card = screen.getByRole("article", { name: "Design review" })
    expect(card.className).toContain("glass-tile")
  })

  it("renders cards as focusable articles with tabIndex 0", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    const card = screen.getByRole("article", { name: "Design review" })
    expect(card).toHaveAttribute("tabindex", "0")
  })

  it("accepts an onDragEnd prop without throwing", () => {
    const onDragEnd = vi.fn()
    expect(() =>
      render(<GlassKanbanBoard columns={makeColumns()} onDragEnd={onDragEnd} />)
    ).not.toThrow()
    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it("accepts an additional className and applies it to the wrapper", () => {
    const { container } = render(
      <GlassKanbanBoard columns={makeColumns()} className="custom-board-class" />
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className).toContain("custom-board-class")
  })

  it("renders items in a list with role='list'", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    const lists = screen.getAllByRole("list")
    // Each column has a list of items
    expect(lists.length).toBeGreaterThanOrEqual(3)
  })

  it("renders single item column with singular 'item' aria-label", () => {
    render(<GlassKanbanBoard columns={makeColumns()} />)
    expect(screen.getByLabelText("1 item")).toBeInTheDocument()
  })
})
