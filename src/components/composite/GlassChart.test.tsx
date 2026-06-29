/**
 * GlassChart unit tests
 *
 * Requirements: 4.9, 4.10
 */
import * as React from "react"
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { GlassChart } from "./GlassChart"

const sampleData = [
  { name: "Jan", value: 100 },
  { name: "Feb", value: 200 },
  { name: "Mar", value: 150 },
]

// ── Title rendering ──────────────────────────────────────────────────────────

describe("GlassChart — title", () => {
  it("renders the title as an h3 element", () => {
    render(
      <GlassChart title="Monthly Revenue" chartType="line" data={sampleData} />
    )
    const heading = screen.getByRole("heading", { level: 3, name: "Monthly Revenue" })
    expect(heading).toBeDefined()
  })

  it("applies font-heading class to the title", () => {
    render(
      <GlassChart title="My Chart" chartType="bar" data={sampleData} />
    )
    const heading = screen.getByRole("heading", { level: 3 })
    expect(heading.className).toContain("font-heading")
  })
})

// ── glass-panel wrapper ──────────────────────────────────────────────────────

describe("GlassChart — glass-panel", () => {
  it("wraps content in a glass-panel container", () => {
    const { container } = render(
      <GlassChart title="Test" chartType="area" data={sampleData} />
    )
    const panel = container.firstElementChild as HTMLElement
    expect(panel.className).toContain("glass-panel")
  })

  it("accepts and applies an additional className", () => {
    const { container } = render(
      <GlassChart title="Test" chartType="line" data={sampleData} className="custom-class" />
    )
    expect(container.firstElementChild?.className).toContain("custom-class")
  })
})

// ── Chart type / aria label ──────────────────────────────────────────────────

describe("GlassChart — chart area accessibility", () => {
  const types = ["line", "bar", "pie", "area"] as const

  types.forEach((chartType) => {
    it(`renders an accessible chart region for chartType="${chartType}"`, () => {
      render(
        <GlassChart title="Chart Title" chartType={chartType} data={sampleData} />
      )
      const chartRegion = screen.getByRole("img")
      expect(chartRegion.getAttribute("aria-label")).toContain("Chart Title")
      expect(chartRegion.getAttribute("aria-label")).toContain(chartType)
    })
  })
})

// ── Height prop ──────────────────────────────────────────────────────────────

describe("GlassChart — height prop", () => {
  it("applies the provided height to the chart area container", () => {
    render(
      <GlassChart title="Tall Chart" chartType="line" data={sampleData} height={400} />
    )
    const region = screen.getByRole("img")
    expect(region.getAttribute("style")).toContain("400px")
  })

  it("uses 300px default height when height prop is omitted", () => {
    render(
      <GlassChart title="Default Height" chartType="bar" data={sampleData} />
    )
    const region = screen.getByRole("img")
    expect(region.getAttribute("style")).toContain("300px")
  })
})

// ── Empty data state ─────────────────────────────────────────────────────────

describe("GlassChart — empty data", () => {
  it("shows a 'No data available' message when data is empty", () => {
    render(<GlassChart title="Empty" chartType="line" data={[]} />)
    expect(screen.getByText("No data available")).toBeDefined()
  })

  it("does not render a legend when data is empty", () => {
    render(<GlassChart title="Empty" chartType="bar" data={[]} />)
    expect(screen.queryByRole("list", { name: "Chart legend" })).toBeNull()
  })
})

// ── Legend — glass-pill styling (Req 4.10) ───────────────────────────────────

describe("GlassChart — legend", () => {
  it("renders a legend with glass-pill items for a line chart (default 'value' key)", () => {
    render(
      <GlassChart title="Legend Test" chartType="line" data={sampleData} />
    )
    const legend = screen.getByRole("list", { name: "Chart legend" })
    expect(legend).toBeDefined()

    const items = screen.getAllByRole("listitem")
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].className).toContain("glass-pill")
  })

  it("renders one legend pill per data point for a pie chart", () => {
    render(
      <GlassChart title="Pie Legend" chartType="pie" data={sampleData} />
    )
    const items = screen.getAllByRole("listitem")
    expect(items.length).toBe(sampleData.length)
  })

  it("renders one legend pill per series key when keys prop is provided", () => {
    const multiData = [
      { name: "Q1", value: 100, cost: 80 },
      { name: "Q2", value: 200, cost: 150 },
    ]
    render(
      <GlassChart
        title="Multi-series"
        chartType="bar"
        data={multiData}
        keys={["value", "cost"]}
      />
    )
    const items = screen.getAllByRole("listitem")
    expect(items.length).toBe(2)
    expect(items[0].textContent).toContain("value")
    expect(items[1].textContent).toContain("cost")
  })

  it("each legend pill contains a colour swatch and label", () => {
    render(
      <GlassChart title="Swatch test" chartType="bar" data={sampleData} />
    )
    const items = screen.getAllByRole("listitem")
    items.forEach((item) => {
      // colour swatch is a span inside the pill
      const swatch = item.querySelector("span")
      expect(swatch).not.toBeNull()
      // The swatch has an inline background style
      expect(swatch?.getAttribute("style")).toContain("background")
    })
  })
})

// ── CSS custom properties for colors (Req 4.9) ──────────────────────────────

describe("GlassChart — CSS custom properties", () => {
  it("uses CSS custom property references in the SVG for line/bar/area charts", () => {
    const { container } = render(
      <GlassChart title="Color Test" chartType="line" data={sampleData} />
    )
    // The SVG text elements reference var(--foreground, ...)
    const svgText = container.querySelector("svg text")
    expect(svgText).not.toBeNull()
    // Grid lines reference var(--glass-border, ...)
    const gridLine = container.querySelector("svg line")
    expect(gridLine?.getAttribute("stroke")).toContain("var(")
  })

  it("uses CSS custom property for the glass-panel outer wrapper background (via class)", () => {
    const { container } = render(
      <GlassChart title="Glass props" chartType="bar" data={sampleData} />
    )
    // glass-panel class carries the CSS custom property styling from index.css
    expect(container.firstElementChild?.className).toContain("glass-panel")
  })
})
