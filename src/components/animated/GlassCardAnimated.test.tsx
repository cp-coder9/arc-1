import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

import { GlassCardAnimated } from "./GlassCardAnimated"

// Capture the props framer-motion's motion.div receives so we can assert on
// the entrance transition (delay / reduced-motion handling) without relying on
// real animation timing in jsdom.
const motionDivProps: Array<Record<string, unknown>> = []

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, initial, animate, transition }: any) => {
      motionDivProps.push({ initial, animate, transition })
      return <div data-testid="motion-div">{children}</div>
    },
  },
}))

// Control the reduced-motion preference per test.
let mockPrefersReducedMotion: boolean | null = false
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => mockPrefersReducedMotion,
}))

describe("GlassCardAnimated", () => {
  beforeEach(() => {
    motionDivProps.length = 0
    mockPrefersReducedMotion = false
  })

  it("renders children inside a glass-card surface", () => {
    render(
      <GlassCardAnimated>
        <span>Card content</span>
      </GlassCardAnimated>
    )

    expect(screen.getByText("Card content")).toBeInTheDocument()
    expect(
      document.querySelector(".glass-card")
    ).toBeInTheDocument()
  })

  it("applies the fadeInUp entrance with default zero delay", () => {
    render(
      <GlassCardAnimated>
        <span>Animated</span>
      </GlassCardAnimated>
    )

    const props = motionDivProps[0]
    expect(props.initial).toEqual({ opacity: 0, y: 20 })
    expect(props.animate).toEqual({ opacity: 1, y: 0 })
    expect((props.transition as any).duration).toBe(0.4)
    expect((props.transition as any).delay).toBe(0)
  })

  it("applies the supplied stagger delay to the entrance transition", () => {
    render(
      <GlassCardAnimated delay={0.15}>
        <span>Delayed</span>
      </GlassCardAnimated>
    )

    expect((motionDivProps[0].transition as any).delay).toBe(0.15)
  })

  it("collapses duration and delay to 0 when reduced motion is preferred", () => {
    mockPrefersReducedMotion = true

    render(
      <GlassCardAnimated delay={0.5}>
        <span>Reduced</span>
      </GlassCardAnimated>
    )

    const transition = motionDivProps[0].transition as any
    expect(transition.duration).toBe(0)
    expect(transition.delay).toBe(0)
  })

  it("honours an explicit prefersReducedMotion prop over the hook value", () => {
    mockPrefersReducedMotion = false

    render(
      <GlassCardAnimated prefersReducedMotion delay={0.3}>
        <span>Override</span>
      </GlassCardAnimated>
    )

    const transition = motionDivProps[0].transition as any
    expect(transition.duration).toBe(0)
    expect(transition.delay).toBe(0)
  })

  it("forwards GlassCard props such as onClick and aria-label", () => {
    const onClick = vi.fn()
    render(
      <GlassCardAnimated onClick={onClick} aria-label="Clickable card">
        <span>Interactive</span>
      </GlassCardAnimated>
    )

    const card = screen.getByLabelText("Clickable card")
    expect(card).toBeInTheDocument()
    card.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
