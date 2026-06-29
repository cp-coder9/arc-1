import * as React from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useReducedMotion } from "@/hooks/useReducedMotion"

/**
 * GlassDrawer — Slide-in drawer panel anchored to the left edge.
 *
 * Behaviour:
 *   - Slides in from the left with a frosted `glass-drawer` surface.
 *   - Renders a dimmed backdrop; clicking it (or pressing Escape) calls onClose.
 *   - Traps focus within the drawer while open (Tab/Shift+Tab cycle).
 *   - Restores focus to the previously focused element on close.
 *   - Respects prefers-reduced-motion (slide distance/duration collapse to 0).
 *
 * Accessibility:
 *   - role="dialog" + aria-modal="true" on the panel.
 *   - aria-label describes the drawer for assistive tech.
 *
 * Requirements: 2.10, 3.11
 */
export interface GlassDrawerProps {
  /** Whether the drawer is currently open. */
  isOpen: boolean
  /** Invoked when the drawer requests to close (backdrop click or Escape). */
  onClose: () => void
  /** Drawer content. */
  children: React.ReactNode
  /** Accessible label for the dialog. */
  "aria-label"?: string
  /** Optional className overrides for the drawer panel. */
  className?: string
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

export function GlassDrawer({
  isOpen,
  onClose,
  children,
  "aria-label": ariaLabel = "Navigation drawer",
  className,
}: GlassDrawerProps) {
  const prefersReducedMotion = useReducedMotion() ?? false
  const panelRef = React.useRef<HTMLDivElement>(null)
  const previouslyFocused = React.useRef<HTMLElement | null>(null)

  // Capture the element focused before opening so we can restore it on close.
  React.useEffect(() => {
    if (isOpen) {
      previouslyFocused.current = document.activeElement as HTMLElement | null
      // Move focus into the drawer once it mounts.
      const id = window.requestAnimationFrame(() => {
        const panel = panelRef.current
        if (!panel) return
        const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
        ;(focusable ?? panel).focus()
      })
      return () => window.cancelAnimationFrame(id)
    }

    // On close, restore focus to the previously active element.
    previouslyFocused.current?.focus?.()
    return undefined
  }, [isOpen])

  // Escape-to-close + focus trap (Tab cycling) handled at the document level.
  React.useEffect(() => {
    if (!isOpen) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key !== "Tab") return

      const panel = panelRef.current
      if (!panel) return

      const nodeList = panel.querySelectorAll(FOCUSABLE_SELECTOR)
      const focusable: HTMLElement[] = []
      nodeList.forEach((node) => {
        const el = node as HTMLElement
        if (el.offsetParent !== null || el === document.activeElement) {
          focusable.push(el)
        }
      })

      if (focusable.length === 0) {
        // Keep focus on the panel itself when nothing else is focusable.
        event.preventDefault()
        panel.focus()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || active === panel) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            tabIndex={-1}
            className={cn(
              "glass-drawer absolute left-0 top-0 h-full w-72 max-w-[80vw] p-6",
              "overflow-y-auto focus:outline-none",
              className
            )}
            initial={{ x: prefersReducedMotion ? 0 : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: prefersReducedMotion ? 0 : "-100%" }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.3,
              ease: [0.2, 0.8, 0.2, 1],
            }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export default GlassDrawer
