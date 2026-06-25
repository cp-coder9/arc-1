// ─── Quick Navigation Row ────────────────────────────────────────────────────
// Feature: website-ui-redesign (Task 11.3)
//
// The bottom row of exactly four icon-and-label navigation items on the
// Landing_Page: People, Projects, Approvals, Payments (Req 5.1). Each item is a
// lucide-react icon paired with its label (Req 5.2), rendered as a native
// keyboard-operable <button> so pointer click and Enter/Space all invoke
// activation (Req 5.3). Activation calls `onNavigate(route)`; the LandingPage
// owns the actual navigation and, on a failed/unavailable route, retains the
// current view and feeds an `error` back in for display (Req 5.4).
//
// QuickNav is intentionally **presentational**: it does not perform routing or
// own error state. It derives all color from Theme_Tokens (no literal hex), and
// lays the four items out so they all stay fully visible with no overlap and no
// label truncation down to the 320px mobile floor (Req 5.5).

import * as React from 'react';
import { Users, Boxes, Building2, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  LANDING_ACCENT,
  LANDING_TEXT,
  LANDING_TEXT_MUTED,
  DESTRUCTIVE,
  tokenVar,
} from '@/design-system/tokens';

/**
 * A single Quick_Nav entry: a stable id, a visible label, the lucide-react icon
 * component to render, and the destination route activated on selection.
 */
export interface QuickNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number | string; className?: string; 'aria-hidden'?: boolean }>;
  route: string;
}

/**
 * The exactly-four Quick_Nav items (Req 5.1), each pairing a lucide-react icon
 * with its label (Req 5.2). Declared `as const` so the tuple length and member
 * shapes are fixed. Verified present in lucide-react: Users, Boxes, Building2,
 * CreditCard.
 */
export const QUICK_NAV_ITEMS = [
  { id: 'people', label: 'People', icon: Users, route: '/people' },
  { id: 'projects', label: 'Projects', icon: Boxes, route: '/projects' },
  { id: 'approvals', label: 'Approvals', icon: Building2, route: '/approvals' },
  { id: 'payments', label: 'Payments', icon: CreditCard, route: '/payments' },
] as const satisfies readonly QuickNavItem[];

export interface QuickNavProps {
  /**
   * Invoked with the activated item's route on pointer click or Enter/Space
   * (Req 5.3). The LandingPage performs the navigation and reports failures
   * back via `error` (Req 5.4).
   */
  onNavigate: (route: string) => void;
  /**
   * Error indication to display when a destination could not be opened
   * (Req 5.4). When set, an assertive alert is rendered beneath the items while
   * the current view is retained. `null`/`undefined` renders no error.
   */
  error?: string | null;
  className?: string;
}

/** Icon size (px) for each Quick_Nav item. */
const ICON_SIZE_PX = 22;

/**
 * QuickNav — the four-item Landing_Page navigation row.
 *
 * Renders a 4-column grid so every item stays visible in a single row with no
 * overlap at every Viewport width (Req 5.5); labels use `whitespace-nowrap` to
 * stay un-truncated, and the compact icon+label sizing fits the four short
 * labels down to 320px.
 */
export function QuickNav({ onNavigate, error, className }: QuickNavProps) {
  return (
    <nav
      aria-label="Quick navigation"
      className={cn('w-full', className)}
    >
      <ul className="grid grid-cols-4 gap-2 sm:gap-4">
        {QUICK_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onNavigate(item.route)}
                className={cn(
                  'group flex w-full flex-col items-center justify-center gap-1.5',
                  'rounded-2xl px-1 py-3 sm:px-3 sm:py-4',
                  'cursor-pointer select-none',
                  'transition-colors duration-200 ease-out',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                )}
                style={{
                  color: tokenVar(LANDING_TEXT),
                  // Focus ring + offset colors from tokens (no literal hex).
                  '--tw-ring-color': tokenVar(LANDING_ACCENT),
                  '--tw-ring-offset-color': 'transparent',
                } as React.CSSProperties}
              >
                <Icon
                  size={ICON_SIZE_PX}
                  aria-hidden={true}
                  className="shrink-0 transition-transform duration-200 ease-out group-hover:scale-110"
                />
                <span
                  className="text-xs font-medium leading-none whitespace-nowrap sm:text-sm"
                  style={{ color: tokenVar(LANDING_TEXT_MUTED) }}
                >
                  {item.label}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p
          role="alert"
          className="mt-3 text-center text-xs sm:text-sm"
          style={{ color: tokenVar(DESTRUCTIVE) }}
        >
          {error}
        </p>
      ) : null}
    </nav>
  );
}

export default QuickNav;
