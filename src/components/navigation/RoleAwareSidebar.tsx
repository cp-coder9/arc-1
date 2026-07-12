import * as React from 'react';
import { ChevronDown, HelpCircle, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getNavigationForRole } from '@/navigation/architexNavigationConfig';
import { getDefaultPageForNavKey } from '@/navigation/navDashboardAdapter';
import type { UserProfile } from '@/types';
import type { ArchitexNavKey } from '@/navigation/navTypes';

/**
 * RoleAwareSidebar — Glass navigation sidebar that shows only modules and
 * sections accessible to the authenticated user's role.
 *
 * Preconditions:
 *   - user.role is a valid UserRole from src/types.ts
 *   - navigation config is loaded from architexNavigationConfig.ts
 *
 * Postconditions:
 *   - renders a <nav> with glass-nav class (fixed left-0 top-0 h-screen w-64)
 *   - only modules accessible to user.role are rendered (req 5.1)
 *   - module sections are collapsible with ChevronDown rotation (req 5.2)
 *   - active section link highlighted with bg-primary/20 text-landing-accent (req 5.3)
 *   - Help & Support and Sign Out buttons at the bottom (req 5.4, 5.5)
 *   - all links are keyboard accessible with focus-visible-ring (req 5.9)
 *   - hidden on mobile, visible md:block (req 5.8)
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */
export interface RoleAwareSidebarProps {
  /** Authenticated user — role determines visible modules. */
  user: UserProfile;
  /**
   * Currently active dashboard tab / page ID.
   * Used to highlight the corresponding section link.
   */
  activeTab?: string;
  /**
   * Called when a section link is clicked, passing the target page ID.
   * When not provided the sidebar falls back to reading window.location.pathname
   * for active-link detection only.
   */
  onNavigate?: (pageId: string) => void;
  /** Called when the Sign Out button is clicked. */
  onSignOut?: () => void;
  /** Optional className overrides on the outer <nav>. */
  className?: string;
}

export function RoleAwareSidebar({
  user,
  activeTab,
  onNavigate,
  onSignOut,
  className,
}: RoleAwareSidebarProps) {
  const modules = getNavigationForRole(user.role === 'admin' ? 'platform_admin' : user.role);

  // Initialise all modules as expanded for first-time render so users see
  // content immediately. Per-module state is toggled on header click.
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const m of modules) {
      initial[m.key] = true;
    }
    return initial;
  });

  function toggleModule(key: string) {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  /**
   * Resolves the page ID for a given nav key + section key combo.
   * We map at the module level via the adapter; the section key is used
   * for visual highlighting only (sidebar doesn't have per-section routing yet).
   */
  function pageIdForSection(moduleKey: ArchitexNavKey, _sectionKey: string): string {
    return getDefaultPageForNavKey(moduleKey);
  }

  /**
   * A section link is "active" when its resolved page ID matches the
   * currently active tab, or (fallback) the section key appears in the
   * current window pathname.
   */
  function isSectionActive(moduleKey: ArchitexNavKey, sectionKey: string): boolean {
    const pageId = pageIdForSection(moduleKey, sectionKey);
    if (activeTab !== undefined) {
      return activeTab === pageId;
    }
    // Fallback to pathname matching when no activeTab is provided (e.g. tests)
    const pathname =
      typeof window !== 'undefined' ? window.location.pathname : '';
    return pathname.includes(sectionKey) || pathname.includes(pageId);
  }

  function handleSectionClick(moduleKey: ArchitexNavKey, sectionKey: string) {
    const pageId = pageIdForSection(moduleKey, sectionKey);
    onNavigate?.(pageId);
  }

  function handleHelpSupport() {
    if (typeof window !== 'undefined') {
      window.location.assign('/help');
    }
  }

  return (
    <nav
      aria-label="Architex navigation"
      className={cn(
        // Requirement 5.7 — fixed position, full height, 64-unit width on desktop
        // Requirement 5.8 — hidden on mobile, visible from md breakpoint up
        'glass-nav hidden md:flex flex-col',
        'fixed left-0 top-0 h-screen w-64 z-40',
        'border-r border-border/70',
        className
      )}
    >
      {/* Logo / branding area — uses glass-card (req 5.6) */}
      <div className="glass-card rounded-none border-0 border-b border-border/70 p-4 shrink-0">
        <p className="font-heading font-bold text-lg text-foreground leading-tight">
          Architex
        </p>
        <p className="text-xs text-foreground-muted mt-0.5 capitalize">
          {user.displayName || user.email}
          {' · '}
          <span className="opacity-70">{user.role.replace(/_/g, ' ')}</span>
        </p>
      </div>

      {/* Scrollable module list */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1 min-h-0">
        {modules.map((module) => {
          const isExpanded = expanded[module.key] ?? false;

          return (
            <div key={module.key}>
              {/* Module header — collapsible button (req 5.2) */}
              <button
                type="button"
                aria-expanded={isExpanded}
                aria-controls={`module-sections-${module.key}`}
                onClick={() => toggleModule(module.key)}
                className={cn(
                  'w-full flex items-center justify-between',
                  'px-4 py-2 text-left',
                  // Req 8.9 — minimum 44px touch target: py-2 (16px) + text-xs lh (16px) = 32px
                  // → min-h-[44px] closes the 12px gap on mobile.
                  'min-h-[44px]',
                  'rounded-lg mx-2',
                  'hover:bg-muted/40 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2',
                  'focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-1',
                  'focus-visible:ring-offset-transparent',
                  'w-[calc(100%-1rem)]'
                )}
              >
                <span className="text-xs font-semibold text-foreground-muted uppercase tracking-wide truncate">
                  {module.label}
                </span>
                {/* Chevron rotates 180° when expanded (req 5.2) */}
                <ChevronDown
                  className={cn(
                    'shrink-0 w-4 h-4 text-foreground-muted transition-transform duration-200',
                    isExpanded && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </button>

              {/* Section links — collapsible (req 5.2) */}
              {isExpanded && (
                <div
                  id={`module-sections-${module.key}`}
                  className="mt-1 mb-2 ml-4 mr-2 space-y-0.5 border-l-2 border-border/40 pl-3"
                >
                  {module.sections.map((section) => {
                    const active = isSectionActive(module.key as ArchitexNavKey, section.key);

                    return (
                      <button
                        key={section.key}
                        type="button"
                        onClick={() => handleSectionClick(module.key as ArchitexNavKey, section.key)}
                        className={cn(
                          'w-full text-left block px-3 py-2 text-sm rounded-lg transition-all duration-150',
                          // Req 8.9 — minimum 44px touch target: py-2 (16px) + text-sm lh (20px) = 36px
                          // → min-h-[44px] closes the 8px gap on mobile.
                          'min-h-[44px] flex items-center',
                          'focus-visible:outline-none focus-visible:ring-2',
                          'focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-1',
                          'focus-visible:ring-offset-transparent',
                          // Requirement 5.3 — active state highlighting
                          active
                            ? 'bg-primary/20 text-landing-accent font-semibold'
                            : 'text-foreground-muted hover:text-foreground hover:bg-muted/30'
                        )}
                        aria-current={active ? 'page' : undefined}
                        title={section.description}
                      >
                        {section.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom actions — Help & Support and Sign Out (req 5.4, 5.5) */}
      <div className="shrink-0 p-4 border-t border-border/70 space-y-2">
        {/* Requirement 5.4 — Help & Support navigates to /help */}
        <button
          type="button"
          onClick={handleHelpSupport}
          className={cn(
            'w-full glass-button px-4 py-2 text-sm rounded-lg text-left',
            // Req 8.9 — minimum 44px touch target: py-2 (16px) + text-sm lh (20px) = 36px
            // → min-h-[44px] closes the 8px gap on mobile.
            'min-h-[44px] flex items-center gap-2',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-1',
            'focus-visible:ring-offset-transparent'
          )}
        >
          <HelpCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          Help &amp; Support
        </button>

        {/* Requirement 5.5 — Sign Out calls onSignOut callback */}
        <button
          type="button"
          onClick={onSignOut}
          className={cn(
            'w-full glass-button px-4 py-2 text-sm rounded-lg text-left',
            // Req 8.9 — minimum 44px touch target (same as Help button above).
            'min-h-[44px] flex items-center gap-2 text-destructive/80 hover:text-destructive',
            'focus-visible:outline-none focus-visible:ring-2',
            'focus-visible:ring-[var(--landing-accent)] focus-visible:ring-offset-1',
            'focus-visible:ring-offset-transparent'
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
          Sign Out
        </button>
      </div>
    </nav>
  );
}

export default RoleAwareSidebar;
