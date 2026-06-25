/**
 * Landing Feature — Top_Bar.
 *
 * Feature: website-ui-redesign (Task 11.1)
 *
 * The Landing_Page header. Presentational only: it renders the brand on the
 * leading edge and the account actions on the trailing edge, and delegates all
 * behavior to callbacks supplied by `LandingPage` (Task 12.1), which owns the
 * real navigation + `useFlockActivation` wiring.
 *
 * Leading edge (Req 3.1):
 *   - `BirdMark size="topbar"` + the Wordmark "ARCHITEX", both fully visible.
 *
 * Trailing edge (Req 3.2, 3.3, 14.3):
 *   - `ThemeToggle` — flips the Theme_Mode.
 *   - `Sign_Up_Action` — a distinct control that navigates to the signup page;
 *     it does NOT begin Flock_Activation (Req 3.4). Calls `onSignUp`.
 *   - `Primary_CTA` "Enter OS" — a pill-shaped `GlassSurface` that begins
 *     Flock_Activation (Req 3.5). Calls `onActivate`.
 *
 * Behavior contracts owned by the parent (kept here for traceability):
 *   - `Enter OS` begins Flock_Activation within 1000 ms (Req 3.5).
 *   - If an action fails to start within 5000 ms, the user stays on-page and an
 *     error indication is shown (Req 3.6); this component renders that error
 *     from the `actionError` prop.
 *
 * Responsive (Req 3.7, 3.8): at ≤767px all actions stay visible with no
 * horizontal scroll (the bar wraps instead of overflowing) and every action
 * meets the 44×44px minimum interactive target size.
 *
 * Styling is token-driven — every color comes from a Theme_Token (Tailwind
 * `landing-*` utilities or `tokenVar(...)`), with no inline hex literals
 * (Req 1.5), so the bar re-skins automatically on a Theme_Mode flip.
 */
import { GlassSurface } from '@/design-system/GlassSurface';
import BirdMark from '@/design-system/BirdMark';
import { ThemeToggle } from '@/design-system/theme/ThemeToggle';
import { cn } from '@/lib/utils';
import {
  DESTRUCTIVE,
  GLASS_BORDER,
  LANDING_ACCENT,
  LANDING_TEXT,
  RING,
  tokenVar,
} from '@/design-system/tokens';

/** The Wordmark text shown beside the Bird_Mark on the leading edge (Req 3.1). */
const WORDMARK_TEXT = 'ARCHITEX';

/** Accessible / visible label for the Sign_Up_Action (Req 3.4, 9.4). */
const SIGN_UP_LABEL = 'Sign up';

/** Accessible / visible label for the Primary_CTA (Req 3.5, 9.4). */
const ENTER_OS_LABEL = 'Enter OS';

/**
 * Minimum 44×44px interactive target (Req 3.8). `min-h-11`/`min-w-11` resolve to
 * 2.75rem == 44px. Applied at every width so the bar never ships an undersized
 * target, satisfying the ≤767px requirement as a subset.
 */
const TARGET_SIZE = 'min-h-11 min-w-11';

/** Shared focus-visible ring (Req 9.3), colored from the `--ring` Theme_Token. */
const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-offset-0';

export interface TopBarProps {
  /** Begin Flock_Activation — invoked by the Primary_CTA "Enter OS" (Req 3.5). */
  onActivate: () => void;
  /** Navigate to the signup page — invoked by the Sign_Up_Action (Req 3.4). */
  onSignUp: () => void;
  /**
   * When set, an error indication is shown without leaving the page (Req 3.6).
   * The parent sets this when an action fails to start within 5000 ms.
   */
  actionError?: string | null;
  /** Optional extra classes for positioning/layout by the caller. */
  className?: string;
}

/**
 * Top_Bar — brand on the leading edge, account actions on the trailing edge.
 */
export function TopBar({
  onActivate,
  onSignUp,
  actionError,
  className,
}: TopBarProps) {
  // Shared ring color for all focusable controls (token-driven).
  const ringStyle = { ['--tw-ring-color' as string]: tokenVar(RING) };

  return (
    <header
      className={cn(
        'w-full',
        // Wrap (never scroll) so all actions stay visible at ≤767px (Req 3.7).
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
        'px-4 py-3 sm:px-6',
        className,
      )}
    >
      {/* Leading edge: Bird_Mark + Wordmark (Req 3.1). */}
      <div className="flex items-center gap-2 sm:gap-3">
        <BirdMark size="topbar" />
        <span
          className="font-heading font-bold tracking-tight text-lg sm:text-xl leading-none whitespace-nowrap"
          style={{ color: tokenVar(LANDING_TEXT) }}
        >
          {WORDMARK_TEXT}
        </span>
      </div>

      {/* Trailing edge: Theme_Toggle + Sign_Up_Action + Primary_CTA (Req 3.2). */}
      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />

        {/* Sign_Up_Action — distinct destination, no Flock_Activation (Req 3.4). */}
        <button
          type="button"
          onClick={onSignUp}
          aria-label={SIGN_UP_LABEL}
          className={cn(
            'inline-flex items-center justify-center whitespace-nowrap',
            'rounded-full border px-4 font-sans text-sm font-medium',
            'cursor-pointer select-none transition-colors duration-200 ease-out',
            TARGET_SIZE,
            FOCUS_RING,
          )}
          style={{
            color: tokenVar(LANDING_TEXT),
            borderColor: tokenVar(GLASS_BORDER),
            ...ringStyle,
          }}
        >
          {SIGN_UP_LABEL}
        </button>

        {/* Primary_CTA — pill Glass_Surface that begins Flock_Activation (Req 3.3, 3.5). */}
        <GlassSurface
          as="button"
          variant="pill"
          onClick={onActivate}
          aria-label={ENTER_OS_LABEL}
          className={cn(
            'inline-flex items-center justify-center whitespace-nowrap',
            'px-5 font-heading text-sm font-semibold',
            'cursor-pointer select-none transition-transform duration-200 ease-out hover:scale-105',
            TARGET_SIZE,
            FOCUS_RING,
          )}
          style={{
            color: tokenVar(LANDING_ACCENT),
            ...ringStyle,
          }}
        >
          {ENTER_OS_LABEL}
        </GlassSurface>
      </div>

      {/* Error indication shown on action failure-to-start; keeps user on-page
          (Req 3.6). `role="alert"` announces it to assistive technologies. */}
      {actionError ? (
        <p
          role="alert"
          className="w-full font-sans text-sm"
          style={{ color: tokenVar(DESTRUCTIVE) }}
        >
          {actionError}
        </p>
      ) : null}
    </header>
  );
}

export default TopBar;
