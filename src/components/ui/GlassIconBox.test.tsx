import React from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"

import { GlassIconBox } from "./GlassIconBox"

describe("GlassIconBox", () => {
  // ─── glass-icon-box class ────────────────────────────────────────────────

  describe("glass-icon-box class", () => {
    test("renders a <div> element", () => {
      render(<GlassIconBox data-testid="box" />)
      expect(screen.getByTestId("box").tagName).toBe("DIV")
    })

    test("always applies the glass-icon-box class", () => {
      render(<GlassIconBox data-testid="box" />)
      expect(screen.getByTestId("box")).toHaveClass("glass-icon-box")
    })

    test("merges additional className while keeping glass-icon-box", () => {
      render(<GlassIconBox className="extra" data-testid="box" />)
      const el = screen.getByTestId("box")
      expect(el).toHaveClass("glass-icon-box")
      expect(el).toHaveClass("extra")
    })

    test("renders children inside the box", () => {
      render(
        <GlassIconBox>
          <svg data-testid="icon" />
        </GlassIconBox>
      )
      expect(screen.getByTestId("icon")).toBeInTheDocument()
    })

    test("renders without children", () => {
      render(<GlassIconBox data-testid="box" />)
      expect(screen.getByTestId("box")).toBeInTheDocument()
    })
  })

  // ─── Square / decorative behaviour ──────────────────────────────────────

  describe("decorative (no aria-label)", () => {
    test("is aria-hidden by default when no aria-label is given", () => {
      render(<GlassIconBox data-testid="box" />)
      expect(screen.getByTestId("box")).toHaveAttribute("aria-hidden", "true")
    })

    test("has no role attribute when no aria-label is provided", () => {
      render(<GlassIconBox data-testid="box" />)
      expect(screen.getByTestId("box")).not.toHaveAttribute("role")
    })
  })

  // ─── Accessible image behaviour ──────────────────────────────────────────

  describe("accessible image (with aria-label)", () => {
    test("removes aria-hidden when aria-label is provided", () => {
      render(
        <GlassIconBox aria-label="Active projects" data-testid="box" />
      )
      expect(screen.getByTestId("box")).not.toHaveAttribute("aria-hidden")
    })

    test("gets role='img' when aria-label is provided", () => {
      render(
        <GlassIconBox aria-label="Active projects">
          <svg />
        </GlassIconBox>
      )
      expect(screen.getByRole("img", { name: "Active projects" })).toBeInTheDocument()
    })

    test("aria-label is attached to the div element", () => {
      render(
        <GlassIconBox aria-label="Team members" data-testid="box" />
      )
      expect(screen.getByTestId("box")).toHaveAttribute(
        "aria-label",
        "Team members"
      )
    })

    test("empty string aria-label still renders as decorative", () => {
      render(<GlassIconBox aria-label="" data-testid="box" />)
      // An empty string is treated as no-label — remains decorative.
      expect(screen.getByTestId("box")).toHaveAttribute("aria-hidden", "true")
    })
  })

  // ─── Ref forwarding ───────────────────────────────────────────────────────

  describe("ref forwarding", () => {
    test("forwards ref to the underlying div", () => {
      const ref = React.createRef<HTMLDivElement>()
      render(<GlassIconBox ref={ref} />)
      expect(ref.current).not.toBeNull()
      expect(ref.current?.tagName).toBe("DIV")
    })
  })

  // ─── Arbitrary HTML props ─────────────────────────────────────────────────

  describe("arbitrary props", () => {
    test("forwards id and other native div attributes", () => {
      render(<GlassIconBox id="icon-001" data-testid="box" />)
      expect(screen.getByTestId("box")).toHaveAttribute("id", "icon-001")
    })

    test("forwards style prop", () => {
      render(
        <GlassIconBox style={{ width: 48, height: 48 }} data-testid="box" />
      )
      const el = screen.getByTestId("box")
      expect(el).toHaveStyle({ width: "48px", height: "48px" })
    })
  })
})
