import React from "react"
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react"
import { describe, expect, test, vi, beforeEach } from "vitest"

import { GlassDrawer } from "./GlassDrawer"

// ─── framer-motion mock ──────────────────────────────────────────────────────
// Render motion primitives as plain DOM elements so the drawer is testable in
// jsdom without real animation timers.  We also capture the `initial` / `animate`
// props so we can assert on slide-animation values.

const capturedMotionProps: Array<Record<string, unknown>> = []

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  motion: {
    div: React.forwardRef(function MockMotionDiv(
      { children, className, tabIndex, role, "aria-modal": ariaModal,
        "aria-label": ariaLabel, initial, animate, exit, transition,
        onClick, ...rest }: any,
      ref: any
    ) {
      capturedMotionProps.push({ initial, animate, exit, transition })
      return (
        <div
          ref={ref}
          className={className}
          tabIndex={tabIndex}
          role={role}
          aria-modal={ariaModal}
          aria-label={ariaLabel}
          onClick={onClick}
          {...rest}
        >
          {children}
        </div>
      )
    }),
  },
}))

// Control reduced-motion preference per test.
let mockReducedMotion: boolean | null = false
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// ─── helpers ──────────────────────────────────────────────────────────────────

function renderDrawer(
  props: Partial<React.ComponentProps<typeof GlassDrawer>> = {}
) {
  const onClose = vi.fn()
  const result = render(
    <GlassDrawer isOpen onClose={onClose} {...props}>
      <button>First</button>
      <button>Second</button>
    </GlassDrawer>
  )
  return { onClose, ...result }
}

describe("GlassDrawer", () => {
  beforeEach(() => {
    capturedMotionProps.length = 0
    mockReducedMotion = false
  })

  // ─── Rendering ────────────────────────────────────────────────────────────

  describe("rendering", () => {
    test("renders nothing when isOpen=false", () => {
      render(
        <GlassDrawer isOpen={false} onClose={() => {}}>
          <button>Inside</button>
        </GlassDrawer>
      )
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    test("renders dialog with role='dialog' when open", () => {
      renderDrawer()
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })

    test("sets aria-modal='true' on the panel", () => {
      renderDrawer()
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true")
    })

    test("applies the default aria-label 'Navigation drawer'", () => {
      renderDrawer()
      expect(screen.getByRole("dialog")).toHaveAttribute(
        "aria-label",
        "Navigation drawer"
      )
    })

    test("uses a custom aria-label when provided", () => {
      renderDrawer({ "aria-label": "Mobile menu" })
      expect(screen.getByRole("dialog")).toHaveAttribute(
        "aria-label",
        "Mobile menu"
      )
    })

    test("applies glass-drawer class to the panel", () => {
      renderDrawer()
      expect(screen.getByRole("dialog")).toHaveClass("glass-drawer")
    })

    test("renders children inside the drawer panel", () => {
      renderDrawer()
      expect(screen.getByText("First")).toBeInTheDocument()
      expect(screen.getByText("Second")).toBeInTheDocument()
    })

    test("renders a backdrop element alongside the panel", () => {
      renderDrawer()
      // The backdrop is a sibling of the dialog inside the fixed container.
      const dialog = screen.getByRole("dialog")
      const container = dialog.parentElement!
      expect(container.children.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ─── Escape key closes the drawer ────────────────────────────────────────

  describe("Escape key closes the drawer", () => {
    test("calls onClose when Escape is pressed", () => {
      const { onClose } = renderDrawer()
      fireEvent.keyDown(document, { key: "Escape" })
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    test("does not call onClose for other keys", () => {
      const { onClose } = renderDrawer()
      fireEvent.keyDown(document, { key: "Tab" })
      fireEvent.keyDown(document, { key: "Enter" })
      expect(onClose).not.toHaveBeenCalled()
    })

    test("Escape listener is removed when drawer closes", () => {
      const { onClose, rerender } = renderDrawer()
      // Close the drawer by re-rendering with isOpen=false.
      rerender(
        <GlassDrawer isOpen={false} onClose={onClose}>
          <button>Inside</button>
        </GlassDrawer>
      )
      // A keydown after close should NOT call onClose.
      onClose.mockClear()
      fireEvent.keyDown(document, { key: "Escape" })
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ─── Backdrop click closes the drawer ────────────────────────────────────

  describe("backdrop click closes the drawer", () => {
    test("calls onClose when the backdrop is clicked", () => {
      const { onClose } = renderDrawer()
      const dialog = screen.getByRole("dialog")
      const backdrop = dialog.previousSibling as HTMLElement
      fireEvent.click(backdrop)
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    test("does not call onClose when drawer content is clicked", () => {
      const { onClose } = renderDrawer()
      fireEvent.click(screen.getByText("First"))
      expect(onClose).not.toHaveBeenCalled()
    })
  })

  // ─── Focus trap ───────────────────────────────────────────────────────────
  //
  // jsdom sets offsetParent = null on all elements, so the drawer's visibility
  // filter would only ever include document.activeElement in the focusable list.
  // We work around this by making offsetParent non-null on the buttons so the
  // full focus-wrap logic executes as it would in a real browser.

  describe("focus trap", () => {
    function makeVisible(el: HTMLElement) {
      Object.defineProperty(el, "offsetParent", {
        configurable: true,
        get: () => document.body,
      })
    }

    test("Tab from the last focusable element wraps to the first", () => {
      renderDrawer()
      const first = screen.getByText("First")
      const last = screen.getByText("Second")
      makeVisible(first)
      makeVisible(last)

      act(() => { last.focus() })
      fireEvent.keyDown(document, { key: "Tab" })
      expect(document.activeElement).toBe(first)
    })

    test("Shift+Tab from the first focusable element wraps to the last", () => {
      renderDrawer()
      const first = screen.getByText("First")
      const last = screen.getByText("Second")
      makeVisible(first)
      makeVisible(last)

      act(() => { first.focus() })
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true })
      expect(document.activeElement).toBe(last)
    })

    test("Tab does not move focus outside the drawer", () => {
      renderDrawer()
      const first = screen.getByText("First")
      const last = screen.getByText("Second")
      makeVisible(first)
      makeVisible(last)

      act(() => { last.focus() })
      fireEvent.keyDown(document, { key: "Tab" })
      // Focus should have cycled back inside — not escaped to document.body.
      expect(document.activeElement).not.toBe(document.body)
    })
  })

  // ─── Focus restoration ────────────────────────────────────────────────────

  describe("focus restoration on close", () => {
    test("restores focus to the trigger element when the drawer closes", async () => {
      function Harness() {
        const [open, setOpen] = React.useState(false)
        return (
          <>
            <button id="trigger" onClick={() => setOpen(true)}>
              Open Drawer
            </button>
            <GlassDrawer isOpen={open} onClose={() => setOpen(false)}>
              <button>Inside</button>
            </GlassDrawer>
          </>
        )
      }

      render(<Harness />)
      const trigger = screen.getByText("Open Drawer")
      act(() => { trigger.focus() })
      expect(document.activeElement).toBe(trigger)

      fireEvent.click(trigger) // open drawer
      expect(screen.getByRole("dialog")).toBeInTheDocument()

      // Close via Escape
      fireEvent.keyDown(document, { key: "Escape" })

      await waitFor(() => {
        expect(document.activeElement).toBe(trigger)
      })
    })
  })

  // ─── Slide animation ──────────────────────────────────────────────────────

  describe("slide animation", () => {
    test("panel starts at x='-100%' (off-screen left) when motion is enabled", () => {
      mockReducedMotion = false
      renderDrawer()
      // The second motion.div captured is the panel (first is the backdrop).
      const panelProps = capturedMotionProps.find(
        (p) => p.initial && typeof (p.initial as any).x !== "undefined"
      )
      expect(panelProps).toBeDefined()
      expect((panelProps!.initial as any).x).toBe("-100%")
    })

    test("panel animates to x=0 (fully visible)", () => {
      mockReducedMotion = false
      renderDrawer()
      const panelProps = capturedMotionProps.find(
        (p) => p.animate && typeof (p.animate as any).x !== "undefined"
      )
      expect(panelProps).toBeDefined()
      expect((panelProps!.animate as any).x).toBe(0)
    })

    test("exit animation slides the panel back to x='-100%'", () => {
      mockReducedMotion = false
      renderDrawer()
      const panelProps = capturedMotionProps.find(
        (p) => p.exit && typeof (p.exit as any).x !== "undefined"
      )
      expect(panelProps).toBeDefined()
      expect((panelProps!.exit as any).x).toBe("-100%")
    })

    test("initial x is 0 when reduced motion is preferred", () => {
      mockReducedMotion = true
      renderDrawer()
      const panelProps = capturedMotionProps.find(
        (p) => p.initial && typeof (p.initial as any).x !== "undefined"
      )
      expect(panelProps).toBeDefined()
      // With reduced motion the panel doesn't slide — it starts at 0.
      expect((panelProps!.initial as any).x).toBe(0)
    })

    test("transition duration is 0 when reduced motion is preferred", () => {
      mockReducedMotion = true
      renderDrawer()
      const panelProps = capturedMotionProps.find(
        (p) => p.transition && typeof (p.transition as any).duration !== "undefined"
      )
      expect(panelProps).toBeDefined()
      expect((panelProps!.transition as any).duration).toBe(0)
    })

    test("transition duration is 0.3s when motion is not reduced", () => {
      mockReducedMotion = false
      renderDrawer()
      const panelProps = capturedMotionProps.find(
        (p) =>
          p.transition &&
          typeof (p.transition as any).duration !== "undefined" &&
          (p.initial as any)?.x !== undefined
      )
      expect(panelProps).toBeDefined()
      expect((panelProps!.transition as any).duration).toBe(0.3)
    })
  })

  // ─── Accessibility attributes ─────────────────────────────────────────────

  describe("accessibility", () => {
    test("panel has tabIndex=-1 so it can receive programmatic focus", () => {
      renderDrawer()
      expect(screen.getByRole("dialog")).toHaveAttribute("tabindex", "-1")
    })

    test("backdrop has aria-hidden='true'", () => {
      renderDrawer()
      const dialog = screen.getByRole("dialog")
      const backdrop = dialog.previousSibling as HTMLElement
      expect(backdrop).toHaveAttribute("aria-hidden", "true")
    })

    test("accepts and applies a custom className to the drawer panel", () => {
      renderDrawer({ className: "my-custom-class" })
      expect(screen.getByRole("dialog")).toHaveClass("my-custom-class")
    })
  })
})
