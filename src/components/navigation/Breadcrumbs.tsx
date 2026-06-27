import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
import type { BreadcrumbItem } from '@/hooks/useBreadcrumbs';

/**
 * Props for the Breadcrumbs component.
 *
 * @property onNavigate - Optional SPA navigation handler. When provided, non-current
 *   crumbs render as `<button>` elements calling this callback instead of performing
 *   a full page reload via `<a href>`.
 * @property className  - Additional classes applied to the `<nav>` wrapper.
 */
export interface BreadcrumbsProps {
  /**
   * SPA navigation callback. Receives `crumb.href` when the user clicks a
   * non-current crumb. When omitted, crumbs fall back to standard `<a>` links.
   */
  onNavigate?: (href: string) => void;
  /** Additional Tailwind classes on the wrapping `<nav>` element. */
  className?: string;
}

/**
 * Breadcrumbs — Context navigation showing the current page hierarchy.
 *
 * Calls `useBreadcrumbs()` internally to derive the crumb array from
 * `window.location.pathname`.
 *
 * Rendering rules (Requirements 6.1–6.5):
 *   - Renders a `<nav aria-label="Breadcrumbs">` containing a flex list.
 *   - A `ChevronRight` icon is rendered between each crumb (req 6.2).
 *   - Non-current crumbs (all except the last) are rendered as clickable
 *     `<a>` links (or `<button>` when `onNavigate` is provided) with
 *     `text-foreground-muted` styling (req 6.3, 6.4).
 *   - The last crumb (current page) is plain, non-interactive text with
 *     `text-foreground` styling (req 6.5).
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export function Breadcrumbs({ onNavigate, className }: BreadcrumbsProps) {
  const breadcrumbs = useBreadcrumbs();

  return (
    <nav
      aria-label="Breadcrumbs"
      className={cn('flex items-center gap-1 text-sm mt-2', className)}
    >
      <ol className="flex items-center gap-1 flex-wrap">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={crumb.id} className="flex items-center gap-1">
              {/* ChevronRight separator — rendered before every crumb except the first (req 6.2) */}
              {index > 0 && (
                <ChevronRight
                  className="w-3.5 h-3.5 text-foreground-muted shrink-0"
                  aria-hidden="true"
                />
              )}

              {isLast ? (
                /* Current page crumb — plain text, not a link (req 6.5) */
                <span
                  className="text-foreground font-medium"
                  aria-current="page"
                >
                  {crumb.label}
                </span>
              ) : onNavigate ? (
                /* SPA navigation via button (req 6.3) */
                <CrumbButton crumb={crumb} onNavigate={onNavigate} />
              ) : (
                /* Standard anchor link (req 6.3, 6.4) */
                <CrumbLink crumb={crumb} />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ---------------------------------------------------------------------------
 * Internal sub-components
 * --------------------------------------------------------------------------- */

/** Standard `<a>` breadcrumb link for non-SPA navigation. */
function CrumbLink({ crumb }: { crumb: BreadcrumbItem }) {
  return (
    <a
      href={crumb.href}
      className={cn(
        'text-foreground-muted transition-colors duration-150',
        'hover:text-landing-accent',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--landing-accent)] focus-visible:rounded-sm'
      )}
    >
      {crumb.label}
    </a>
  );
}

/** `<button>`-based breadcrumb link for SPA navigation. */
function CrumbButton({
  crumb,
  onNavigate,
}: {
  crumb: BreadcrumbItem;
  onNavigate: (href: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(crumb.href)}
      className={cn(
        'text-foreground-muted transition-colors duration-150',
        'hover:text-landing-accent',
        'focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-[var(--landing-accent)] focus-visible:rounded-sm',
        'cursor-pointer'
      )}
    >
      {crumb.label}
    </button>
  );
}

export default Breadcrumbs;
