/**
 * Design System — Theme_Toggle control.
 *
 * Feature: website-ui-redesign
 *
 * A small, accessible control that flips the active Theme_Mode between
 * Dark_Theme and Light_Theme (Req 14.3, 14.9). It renders a native `<button>`
 * so keyboard focus and Enter/Space activation work for free, exposes a
 * non-empty accessible name indicating it switches the color theme, and uses
 * `aria-pressed` to reflect the active mode to assistive technologies.
 *
 * The icon mirrors the current Theme_Mode using lucide-react: a Moon while
 * Dark_Theme is active, a Sun while Light_Theme is active.
 *
 * All color derives from Theme_Tokens (no literal color values), so the control
 * re-skins automatically on a Theme_Mode flip and is reusable on both the public
 * Landing_Page Top_Bar and the authenticated Workspace chrome.
 */
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from './useTheme';
import { GLASS_BORDER, LANDING_TEXT, RING, tokenVar } from '../tokens';

/** Non-empty accessible name conveying the control's purpose (Req 14.9). */
const ACCESSIBLE_NAME = 'Switch color theme';

export interface ThemeToggleProps {
  /** Optional extra classes for positioning/layout by the caller. */
  className?: string;
}

/**
 * Theme_Toggle — a keyboard-focusable button that calls `toggleTheme()`.
 *
 * - Native `<button>` → reachable via Tab/Shift+Tab and operable with
 *   Enter/Space without a custom key handler (Req 14.9).
 * - `aria-pressed` reflects whether Dark_Theme is currently active (Req 14.9).
 * - Icon (Moon/Sun) reflects the active Theme_Mode.
 * - Color comes exclusively from Theme_Tokens.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      // Reflect the active mode so assistive tech announces the toggle state.
      aria-pressed={isDark}
      aria-label={ACCESSIBLE_NAME}
      title={ACCESSIBLE_NAME}
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        // Comfortable, accessible hit target.
        'h-10 w-10 cursor-pointer select-none',
        // Token-driven border + a visible focus indicator (Req 9.3).
        'border outline-none transition-colors duration-200 ease-out',
        'focus-visible:ring-2 focus-visible:ring-offset-0',
        className,
      )}
      style={{
        color: tokenVar(LANDING_TEXT),
        borderColor: tokenVar(GLASS_BORDER),
        // `--tw-ring-color` drives the focus-visible ring above, from a token.
        ['--tw-ring-color' as string]: tokenVar(RING),
      }}
    >
      {/* Icon mirrors the current Theme_Mode; hidden from the a11y tree since the
          button already carries the accessible name. */}
      {isDark ? (
        <Moon className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Sun className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}

export default ThemeToggle;
