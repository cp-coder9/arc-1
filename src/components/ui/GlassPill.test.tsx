import React from "react"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"

import { GlassPill } from "./GlassPill"

describe("GlassPill", () => {
  // ─── glass-pill class ────────────────────────────────────────────────────

  describe("glass-pill class and border-radius", () => {
    test("renders a <span> element", () => {
      render(<GlassPill>Tag</GlassPill>)
      expect(screen.getByText("Tag").tagName).toBe("SPAN")
    })

    test("always applies the glass-pill class", () => {
      render(<GlassPill data-testid="pill">Tag</GlassPill>)
      expect(screen.getByTestId("pill")).toHaveClass("glass-pill")
    })

    test("accepts and merges additional className", () => {
      render(<GlassPill className="extra-class" data-testid="pill">Tag</GlassPill>)
      const el = screen.getByTestId("pill")
      expect(el).toHaveClass("glass-pill")
      expect(el).toHaveClass("extra-class")
    })

    test("renders children correctly", () => {
      render(<GlassPill>Status</GlassPill>)
      expect(screen.getByText("Status")).toBeInTheDocument()
    })

    test("renders without children", () => {
      render(<GlassPill data-testid="pill" />)
      expect(screen.getByTestId("pill")).toBeInTheDocument()
    })
  })

  // ─── Non-interactive (decorative) pill ──────────────────────────────────

  describe("non-interactive (decorative) pill", () => {
    test("has no role when onClick is not provided", () => {
      render(<GlassPill data-testid="pill">Tag</GlassPill>)
      expect(screen.getByTestId("pill")).not.toHaveAttribute("role")
    })

    test("has no tabIndex when onClick is not provided", () => {
      render(<GlassPill data-testid="pill">Tag</GlassPill>)
      expect(screen.getByTestId("pill")).not.toHaveAttribute("tabindex")
    })

    test("does not apply cursor-pointer when not interactive", () => {
      render(<GlassPill data-testid="pill">Tag</GlassPill>)
      expect(screen.getByTestId("pill").className).not.toContain("cursor-pointer")
    })
  })

  // ─── Interactive pill (with onClick) ────────────────────────────────────

  describe("interactive pill (with onClick)", () => {
    test("gets role='button' when onClick is provided", () => {
      render(<GlassPill onClick={() => {}}>Clickable</GlassPill>)
      expect(screen.getByRole("button", { name: "Clickable" })).toBeInTheDocument()
    })

    test("gets tabIndex=0 when onClick is provided", () => {
      render(<GlassPill onClick={() => {}}>Clickable</GlassPill>)
      expect(screen.getByRole("button", { name: "Clickable" })).toHaveAttribute(
        "tabindex",
        "0"
      )
    })

    test("applies cursor-pointer class when interactive", () => {
      render(<GlassPill onClick={() => {}}>Clickable</GlassPill>)
      expect(screen.getByRole("button", { name: "Clickable" }).className).toContain(
        "cursor-pointer"
      )
    })

    test("invokes onClick when clicked", async () => {
      const handler = vi.fn()
      const user = userEvent.setup()
      render(<GlassPill onClick={handler}>Clickable</GlassPill>)
      await user.click(screen.getByRole("button", { name: "Clickable" }))
      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("invokes onClick on Enter key", () => {
      const handler = vi.fn()
      render(<GlassPill onClick={handler}>Clickable</GlassPill>)
      const el = screen.getByRole("button", { name: "Clickable" })
      fireEvent.keyDown(el, { key: "Enter" })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("invokes onClick on Space key", () => {
      const handler = vi.fn()
      render(<GlassPill onClick={handler}>Clickable</GlassPill>)
      const el = screen.getByRole("button", { name: "Clickable" })
      fireEvent.keyDown(el, { key: " " })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    test("accepts an explicit role override", () => {
      render(
        <GlassPill onClick={() => {}} role="option" data-testid="pill">
          Option
        </GlassPill>
      )
      expect(screen.getByTestId("pill")).toHaveAttribute("role", "option")
    })

    test("accepts an explicit tabIndex override", () => {
      render(
        <GlassPill tabIndex={2} data-testid="pill">
          Tab2
        </GlassPill>
      )
      expect(screen.getByTestId("pill")).toHaveAttribute("tabindex", "2")
    })
  })

  // ─── Accessibility ────────────────────────────────────────────────────────

  describe("accessibility", () => {
    test("forwards aria-label", () => {
      render(
        <GlassPill aria-label="Active status" data-testid="pill">
          ●
        </GlassPill>
      )
      expect(screen.getByTestId("pill")).toHaveAttribute(
        "aria-label",
        "Active status"
      )
    })

    test("forwards arbitrary HTML span attributes", () => {
      render(
        <GlassPill data-testid="pill" id="my-pill">
          Data
        </GlassPill>
      )
      expect(screen.getByTestId("pill")).toHaveAttribute("id", "my-pill")
    })
  })

  // ─── Ref forwarding ───────────────────────────────────────────────────────

  describe("ref forwarding", () => {
    test("forwards ref to the underlying span", () => {
      const ref = React.createRef<HTMLSpanElement>()
      render(<GlassPill ref={ref}>Ref</GlassPill>)
      expect(ref.current).not.toBeNull()
      expect(ref.current?.tagName).toBe("SPAN")
    })
  })
})
