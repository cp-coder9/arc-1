import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"

/**
 * GlassModal — Frosted glass dialog with focus trap and accessible overlay.
 *
 * Preconditions:
 *   - `isOpen` controls visibility; when false nothing is rendered
 *   - `onClose` is invoked on Escape, backdrop click, and explicit dismissal
 *   - `children` is valid React content for the dialog body
 * Postconditions:
 *   - while open, renders a backdrop overlay plus a `glass-modal` surface with
 *     role="dialog" + aria-modal="true" (Req 11.5)
 *   - focus is trapped inside the dialog: Tab/Shift+Tab cycle through the
 *     focusable elements and never escape to the page (Req 10.7)
 *   - Escape invokes `onClose` (Req 3.10, 10.6)
 *   - on open the previously focused element is captured; on close focus is
 *     restored to it (Req 3.10, 10.6)
 *   - body scroll is locked while open and restored on close (Req 3.9)
 *   - when `aria-label` is omitted and a `titleId` is supplied, the dialog is
 *     labelled via aria-labelledby pointing at the modal title (Req 11.5)
 *
 * Requirements: 3.9, 3.10, 3.11, 10.6, 10.7, 11.5
 */
export interface GlassModalProps {
  /** Controls whether the modal is rendered and visible. */
  isOpen: boolean
  /** Called when the user dismisses the modal (Escape, backdrop click). */
  onClose: () => void
  /** Dialog body content. */
  children: React.ReactNode
  /** Accessible name for the dialog (used when there is no visible title). */
  "aria-label"?: string
  /**
   * Id of the element labelling the dialog. When provided (and no aria-label is
   * given) it is wired up via aria-labelledby per Req 11.5.
   */
  titleId?: string
  /** Optional className merged onto the glass-modal surface. */
  className?: string
  /** Optional className merged onto the backdrop overlay. */
  overlayClassName?: string
  /** When false the modal does not close on backdrop click. Defaults to true. */
  closeOnBackdropClick?: boolean
}

/** CSS selector matching elements that can receive keyboard focus. */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "object",
  "embed",
  "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

function getFocusableElements(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  ).filter((el) => {
    if (el.hasAttribute("disabled")) return false
    if (el.getAttribute("aria-hidden") === "true") return false
    // Skip elements explicitly hidden via CSS. getComputedStyle is reliable in
    // real browsers; jsdom returns empty strings (treated as visible), which is
    // the desired behaviour for unit tests that don't compute layout.
    if (typeof window !== "undefined") {
      const style = window.getComputedStyle(el)
      if (style.display === "none" || style.visibility === "hidden") {
        return false
      }
    }
    return true
  })
}

export const GlassModal = React.forwardRef<HTMLDivElement, GlassModalProps>(
  function GlassModal(
    {
      isOpen,
      onClose,
      children,
      "aria-label": ariaLabel,
      titleId,
      className,
      overlayClassName,
      closeOnBackdropClick = true,
    },
    forwardedRef
  ) {
    const dialogRef = React.useRef<HTMLDivElement | null>(null)
    // The element that had focus immediately before the modal opened.
    const previouslyFocused = React.useRef<HTMLElement | null>(null)

    // Merge the forwarded ref with our internal ref.
    const setDialogRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        dialogRef.current = node
        if (typeof forwardedRef === "function") {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [forwardedRef]
    )

    // Capture the active element on open, then restore focus on close/unmount.
    React.useEffect(() => {
      if (!isOpen) return

      previouslyFocused.current =
        (document.activeElement as HTMLElement | null) ?? null

      // Move focus to the first focusable element (or the dialog itself).
      const focusFirst = () => {
        const focusable = getFocusableElements(dialogRef.current)
        if (focusable.length > 0) {
          focusable[0].focus()
        } else {
          dialogRef.current?.focus()
        }
      }
      // Defer until after the dialog has mounted into the DOM.
      const raf = requestAnimationFrame(focusFirst)

      return () => {
        cancelAnimationFrame(raf)
        // Restore focus to the element that was active before opening.
        const toRestore = previouslyFocused.current
        if (toRestore && typeof toRestore.focus === "function") {
          toRestore.focus()
        }
      }
    }, [isOpen])

    // Lock body scroll while open; restore the prior value on close.
    React.useEffect(() => {
      if (!isOpen) return
      const previousOverflow = document.body.style.overflow
      document.body.style.overflow = "hidden"
      return () => {
        document.body.style.overflow = previousOverflow
      }
    }, [isOpen])

    // Keyboard handling: Escape to close, Tab/Shift+Tab to trap focus.
    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === "Escape") {
          event.stopPropagation()
          onClose()
          return
        }

        if (event.key !== "Tab") return

        const focusable = getFocusableElements(dialogRef.current)
        if (focusable.length === 0) {
          // Nothing focusable inside — keep focus on the dialog container.
          event.preventDefault()
          dialogRef.current?.focus()
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement

        if (event.shiftKey) {
          // Shift+Tab on the first element wraps to the last.
          if (active === first || active === dialogRef.current) {
            event.preventDefault()
            last.focus()
          }
        } else {
          // Tab on the last element wraps back to the first.
          if (active === last) {
            event.preventDefault()
            first.focus()
          }
        }
      },
      [onClose]
    )

    const handleBackdropClick = React.useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        // Only close when the backdrop itself (not bubbled content) is clicked.
        if (closeOnBackdropClick && event.target === event.currentTarget) {
          onClose()
        }
      },
      [closeOnBackdropClick, onClose]
    )

    if (!isOpen || typeof document === "undefined") return null

    // When an explicit aria-label is provided it takes precedence; otherwise
    // fall back to aria-labelledby pointing at the title element (Req 11.5).
    const labelledBy = !ariaLabel && titleId ? titleId : undefined

    return createPortal(
      <div
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center p-4",
          // Scrim behind the dialog so underlying content recedes.
          "bg-black/50 backdrop-blur-sm",
          overlayClassName
        )}
        onClick={handleBackdropClick}
        onKeyDown={handleKeyDown}
      >
        <div
          ref={setDialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          className={cn(
            "glass-modal relative w-full max-w-lg rounded-2xl p-6",
            "focus-visible-ring focus:outline-none",
            "max-h-[90vh] overflow-y-auto",
            className
          )}
        >
          {children}
        </div>
      </div>,
      document.body
    )
  }
)

GlassModal.displayName = "GlassModal"

export default GlassModal
