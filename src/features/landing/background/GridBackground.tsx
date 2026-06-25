// ─── Grid Background ─────────────────────────────────────────────────────────
// Feature: website-ui-redesign
//
// The checkered square grid texture rendered across the Landing_Page background
// (Req 13.1). It is painted with two layered linear-gradients sized to the
// theme-invariant `--grid-step` token, so the grid scales cleanly across all
// viewports without any per-cell DOM. The grid stays visible after
// Flock_Activation but at a reduced (dimmer) opacity (Req 13.3) — driven by the
// `dimmed` prop, which the LandingPage flips once activation begins.
//
// This is a purely decorative layer: it is `aria-hidden`, ignores pointer
// events, and derives every color from Theme_Tokens (no literal hex in markup).

import { GLASS_BORDER, GRID_STEP, tokenVar } from '@/design-system/tokens';

export interface GridBackgroundProps {
  /**
   * When true, the grid renders at a reduced opacity to recede behind the
   * OS_Reveal card after Flock_Activation (Req 13.3). Defaults to false.
   */
  dimmed?: boolean;
  className?: string;
}

/** Full-strength opacity on the initial Landing_Page. */
const GRID_OPACITY = 1;
/** Dimmer opacity once activation completes — strictly lower (Req 13.3). */
const GRID_OPACITY_DIMMED = 0.4;

/**
 * Renders the checkered Grid_Background.
 *
 * The grid is two superimposed linear-gradients (vertical + horizontal lines)
 * tiled at `--grid-step`. Dimming is a simple opacity transition so it is
 * unaffected by motion preferences (it is a state change, not looping motion).
 */
export function GridBackground({ dimmed = false, className }: GridBackgroundProps) {
  const lineColor = tokenVar(GLASS_BORDER);
  const step = tokenVar(GRID_STEP);

  return (
    <div
      aria-hidden="true"
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        opacity: dimmed ? GRID_OPACITY_DIMMED : GRID_OPACITY,
        transition: 'opacity 600ms ease',
        backgroundImage: `linear-gradient(to right, ${lineColor} 1px, transparent 1px), linear-gradient(to bottom, ${lineColor} 1px, transparent 1px)`,
        backgroundSize: `${step} ${step}`,
      }}
    />
  );
}

export default GridBackground;
