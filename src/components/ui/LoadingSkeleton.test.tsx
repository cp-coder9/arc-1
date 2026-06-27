// @vitest-environment jsdom
/**
 * Unit tests for LoadingSkeleton, SkeletonCard, and SkeletonTableRow.
 * Requirements: 7.7, 12.1
 */

import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"

import {
  LoadingSkeleton,
  SkeletonCard,
  SkeletonTableRow,
} from "./LoadingSkeleton"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSkeleton(container: HTMLElement): HTMLElement {
  return container.firstElementChild as HTMLElement
}

// ── LoadingSkeleton (base) ────────────────────────────────────────────────────

describe("LoadingSkeleton", () => {
  it("renders a single element", () => {
    const { container } = render(<LoadingSkeleton />)
    expect(container.childElementCount).toBe(1)
  })

  it("applies glass-tile class", () => {
    const { container } = render(<LoadingSkeleton />)
    expect(getSkeleton(container).className).toContain("glass-tile")
  })

  it("applies rounded-lg class", () => {
    const { container } = render(<LoadingSkeleton />)
    expect(getSkeleton(container).className).toContain("rounded-lg")
  })

  it("applies default width class w-full", () => {
    const { container } = render(<LoadingSkeleton />)
    expect(getSkeleton(container).className).toContain("w-full")
  })

  it("applies default height class h-6", () => {
    const { container } = render(<LoadingSkeleton />)
    expect(getSkeleton(container).className).toContain("h-6")
  })

  it("accepts a custom width class", () => {
    const { container } = render(<LoadingSkeleton width="w-48" />)
    expect(getSkeleton(container).className).toContain("w-48")
  })

  it("accepts a custom height class", () => {
    const { container } = render(<LoadingSkeleton height="h-16" />)
    expect(getSkeleton(container).className).toContain("h-16")
  })

  it("merges custom className", () => {
    const { container } = render(<LoadingSkeleton className="my-custom" />)
    expect(getSkeleton(container).className).toContain("my-custom")
    expect(getSkeleton(container).className).toContain("glass-tile")
  })

  it("has aria-hidden=true so screen readers skip it", () => {
    const { container } = render(<LoadingSkeleton />)
    expect(getSkeleton(container)).toHaveAttribute("aria-hidden", "true")
  })
})

// ── SkeletonCard ──────────────────────────────────────────────────────────────

describe("SkeletonCard", () => {
  it("renders with glass-tile class", () => {
    const { container } = render(<SkeletonCard />)
    expect(getSkeleton(container).className).toContain("glass-tile")
  })

  it("renders with h-28 height class matching StatCard dimensions", () => {
    const { container } = render(<SkeletonCard />)
    expect(getSkeleton(container).className).toContain("h-28")
  })

  it("renders full-width (w-full)", () => {
    const { container } = render(<SkeletonCard />)
    expect(getSkeleton(container).className).toContain("w-full")
  })

  it("accepts additional className", () => {
    const { container } = render(<SkeletonCard className="extra" />)
    expect(getSkeleton(container).className).toContain("extra")
  })
})

// ── SkeletonTableRow ──────────────────────────────────────────────────────────

describe("SkeletonTableRow", () => {
  it("renders with glass-tile class", () => {
    const { container } = render(<SkeletonTableRow />)
    expect(getSkeleton(container).className).toContain("glass-tile")
  })

  it("renders with h-12 height class matching GlassTable row height", () => {
    const { container } = render(<SkeletonTableRow />)
    expect(getSkeleton(container).className).toContain("h-12")
  })

  it("renders full-width (w-full)", () => {
    const { container } = render(<SkeletonTableRow />)
    expect(getSkeleton(container).className).toContain("w-full")
  })

  it("accepts additional className", () => {
    const { container } = render(<SkeletonTableRow className="row-override" />)
    expect(getSkeleton(container).className).toContain("row-override")
  })
})

// ── Reduced-motion prop ───────────────────────────────────────────────────────

describe("LoadingSkeleton — reduced motion", () => {
  it("still renders when prefersReducedMotion=true", () => {
    const { container } = render(
      <LoadingSkeleton prefersReducedMotion={true} />
    )
    expect(getSkeleton(container)).toBeInTheDocument()
  })

  it("still renders when prefersReducedMotion=false", () => {
    const { container } = render(
      <LoadingSkeleton prefersReducedMotion={false} />
    )
    expect(getSkeleton(container)).toBeInTheDocument()
  })
})
