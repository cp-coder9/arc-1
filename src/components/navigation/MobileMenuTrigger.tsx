import * as React from 'react';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassDrawer } from '@/components/ui/GlassDrawer';
import { RoleAwareSidebar } from '@/components/navigation/RoleAwareSidebar';
import type { UserProfile } from '@/types';

/**
 * MobileMenuTrigger — Hamburger button that opens a slide-in drawer containing
 * the full role-aware sidebar navigation. Visible only on mobile (<md breakpoint).
 *
 * Behaviour:
 *   - Renders a hamburger (Menu) icon button, hidden on md+ screens.
 *   - On click, opens a GlassDrawer that slides in from the left.
 *   - Pressing Escape or clicking the backdrop closes the drawer.
 *   - Manages its own isOpen state internally.
 *
 * Accessibility:
 *   - aria-label="Open navigation menu" on the trigger button.
 *   - GlassDrawer provides role="dialog" + aria-modal + focus trap.
 *
 * Requirements: 5.8
 */
export interface MobileMenuTriggerProps {
  /** Authenticated user — passed through to RoleAwareSidebar. */
  user: UserProfile;
  /** Called when the Sign Out button inside the drawer is clicked. */
  onSignOut?: () => void;
  /** Optional className overrides for the trigger button. */
  className?: string;
}

export function MobileMenuTrigger({
  user,
  onSignOut,
  className,
}: MobileMenuTriggerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  function openDrawer() {
    setIsOpen(true);
  }

  function closeDrawer() {
    setIsOpen(false);
  }

  return (
    <>
      {/* Hamburger button — only visible on mobile (below md breakpoint) */}
      <button
        type="button"
        aria-label="Open navigation menu"
        aria-expanded={isOpen}
        aria-controls="mobile-navigation-drawer"
        onClick={openDrawer}
        className={cn(
          // Requirement 5.8 — visible on mobile, hidden from md upward
          'block md:hidden',
          'glass-button p-2 rounded-lg',
          // Req 8.9 — minimum 44×44px touch target on mobile.
          // p-2 (16px pad) + icon 20px = 36px → min-h/w-[44px] closes the 8px gap.
          // flex + items-center + justify-center centre the icon within the larger hit area.
          'min-h-[44px] min-w-[44px] flex items-center justify-center',
          'focus-visible:outline-none focus-visible:ring-2',
          'focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-1',
          'focus-visible:ring-offset-transparent',
          className
        )}
      >
        <Menu
          className="w-5 h-5"
          aria-hidden="true"
        />
      </button>

      {/* Slide-in drawer containing the sidebar navigation */}
      <GlassDrawer
        isOpen={isOpen}
        onClose={closeDrawer}
        aria-label="Navigation drawer"
      >
        {/*
         * Render a compact version of RoleAwareSidebar inside the drawer.
         * We override the fixed-positioning classes so the sidebar fills
         * the drawer panel naturally (drawer itself handles positioning).
         */}
        <div id="mobile-navigation-drawer" className="-m-6">
          <RoleAwareSidebar
            user={user}
            onSignOut={() => {
              closeDrawer();
              onSignOut?.();
            }}
            /*
             * Override the sidebar's layout classes so it flows naturally
             * inside the drawer panel (which already handles fixed positioning).
             * tailwind-merge resolves the conflicts — later classes win.
             */
            className="!static !relative !h-full !w-full !z-auto !border-0 !flex !max-h-none"
          />
        </div>
      </GlassDrawer>
    </>
  );
}

export default MobileMenuTrigger;
