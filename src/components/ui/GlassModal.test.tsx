import React from "react"
import { render, screen, fireEvent, act } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

import { GlassModal } from "./GlassModal"

describe("GlassModal", () => {
  test("renders nothing when closed", () => {
    render(
      <GlassModal isOpen={false} onClose={() => {}} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("renders a dialog with glass-modal class and accessible name when open", () => {
    render(
      <GlassModal isOpen onClose={() => {}} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    const dialog = screen.getByRole("dialog")
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAttribute("aria-label", "Settings")
    expect(dialog).toHaveClass("glass-modal")
  })

  test("wires aria-labelledby to titleId when no aria-label is provided", () => {
    render(
      <GlassModal isOpen onClose={() => {}} titleId="modal-title">
        <h2 id="modal-title">Title</h2>
      </GlassModal>
    )
    expect(screen.getByRole("dialog")).toHaveAttribute(
      "aria-labelledby",
      "modal-title"
    )
  })

  test("invokes onClose when Escape is pressed", () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("invokes onClose when the backdrop is clicked", () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    // The backdrop is the dialog's parent overlay element.
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("does not close when content inside the dialog is clicked", () => {
    const onClose = vi.fn()
    render(
      <GlassModal isOpen onClose={onClose} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    fireEvent.click(screen.getByText("Inside"))
    expect(onClose).not.toHaveBeenCalled()
  })

  test("locks body scroll while open and restores it on close", () => {
    const { rerender } = render(
      <GlassModal isOpen onClose={() => {}} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    expect(document.body.style.overflow).toBe("hidden")

    rerender(
      <GlassModal isOpen={false} onClose={() => {}} aria-label="Settings">
        <button>Inside</button>
      </GlassModal>
    )
    expect(document.body.style.overflow).not.toBe("hidden")
  })

  test("traps focus: Shift+Tab on the first element wraps to the last", () => {
    render(
      <GlassModal isOpen onClose={() => {}} aria-label="Settings">
        <button>First</button>
        <button>Last</button>
      </GlassModal>
    )
    const first = screen.getByText("First")
    const last = screen.getByText("Last")

    act(() => {
      first.focus()
    })
    fireEvent.keyDown(screen.getByRole("dialog"), {
      key: "Tab",
      shiftKey: true,
    })
    expect(document.activeElement).toBe(last)
  })

  test("traps focus: Tab on the last element wraps to the first", () => {
    render(
      <GlassModal isOpen onClose={() => {}} aria-label="Settings">
        <button>First</button>
        <button>Last</button>
      </GlassModal>
    )
    const first = screen.getByText("First")
    const last = screen.getByText("Last")

    act(() => {
      last.focus()
    })
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" })
    expect(document.activeElement).toBe(first)
  })

  test("restores focus to the previously active element on close", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false)
      return (
        <div>
          <button onClick={() => setOpen(true)}>Trigger</button>
          <GlassModal
            isOpen={open}
            onClose={() => setOpen(false)}
            aria-label="Settings"
          >
            <button>Inside</button>
          </GlassModal>
        </div>
      )
    }

    render(<Harness />)
    const trigger = screen.getByText("Trigger")
    act(() => {
      trigger.focus()
    })
    expect(document.activeElement).toBe(trigger)

    fireEvent.click(trigger)
    // Close via Escape.
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })

    expect(document.activeElement).toBe(trigger)
  })
})
