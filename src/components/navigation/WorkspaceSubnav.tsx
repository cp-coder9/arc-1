/**
 * WorkspaceSubnav — Horizontal sub-navigation for the active workspace zone.
 *
 * Renders section tabs for the currently-selected top-level navigation item.
 * Supports role filtering and optional contextual messaging badge.
 */

import React from 'react';
import type { UserProfile } from '@/types';
import type { NavigationItem, WorkspaceSection } from '@/types/navigation';
import { ARCHITEX_NAVIGATION } from '@/services/architexNavigationConfig';
import { Badge } from '@/components/ui/badge';

// ── Props ------------------------------------------------------------------

export interface WorkspaceSubnavProps {
  /** The ArchitexNavKey of the active zone. */
  navKey: string;
  user: UserProfile;
  /** Currently active section key. */
  activeSection?: string;
  /** Called when a section tab is clicked. */
  onSelectSection?: (section: WorkspaceSection) => void;
  /** Optional extra actions rendered at the end of the tab bar. */
  extra?: React.ReactNode;
}

// ── Component --------------------------------------------------------------

export function WorkspaceSubnav({
  navKey,
  user,
  activeSection,
  onSelectSection,
  extra,
}: WorkspaceSubnavProps) {
  const navItem = ARCHITEX_NAVIGATION.find((item) => item.key === navKey);

  if (!navItem) {
    return null;
  }

  const visibleSections = navItem.sections.filter(
    (section) => !section.roles || section.roles.includes(user.role),
  );

  if (visibleSections.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 border-b border-border/70 px-3 py-2 overflow-x-auto">
      {visibleSections.map((section) => {
        const isActive = activeSection === section.key;
        return (
          <button
            key={section.key}
            onClick={() => onSelectSection?.(section)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ${
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-primary'
            }`}
            title={section.description}
          >
            {section.label}
            {section.supportsContextualMessaging && (
              <Badge variant="outline" className="h-3.5 px-1 text-[0.6rem] rounded-full">
                msg
              </Badge>
            )}
          </button>
        );
      })}
      {extra && <div className="ml-auto flex items-center gap-1">{extra}</div>}
    </div>
  );
}
