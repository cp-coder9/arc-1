/**
 * MainSidebar — Config-driven top-level navigation sidebar.
 *
 * Reads the ARCHITEX_NAVIGATION config and renders role-filtered
 * navigation items with workspace sections. Replaces the inline
 * sidebar previously defined in App.tsx.
 */

import React from 'react';
import type { UserProfile } from '@/types';
import { NavItem, NavSectionLabel } from '@/components/ui/nav-item';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  LogOut,
  X,
  CreditCard,
  HardDrive,
  UserCircle,
} from 'lucide-react';
import { ARCHITEX_NAVIGATION, navigationForRole } from '@/services/architexNavigationConfig';
import type { NavigationItem } from '@/types/navigation';

// ── Props ------------------------------------------------------------------

export interface MainSidebarProps {
  user: UserProfile;
  activeTab: string;
  onNavigate: (tab: string, source: string) => void;
  isSidebarOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  /** Optional override — maps ArchitexNavKey to existing page IDs. */
  navKeyToPageId?: Record<string, string>;
  /** Extra nav items rendered after the config-driven items. */
  extraItems?: React.ReactNode;
}

// ── Role Visuals (mirrors App.tsx ROLE_VISUALS) ---------------------------

const ROLE_VISUALS: Record<string, { label: string; accent: string; description: string }> = {
  client: { label: 'Client', accent: '#005b4e', description: 'Brief, approve, track progress, and govern payments.' },
  architect: { label: 'Architect', accent: '#006b5c', description: 'Lead design delivery, compliance, and project coordination.' },
  bep: { label: 'BEP / Design Team', accent: '#7046a8', description: 'Coordinate professional deliverables and technical governance.' },
  contractor: { label: 'Main Contractor', accent: '#2f72a7', description: 'Drive construction programme, packages, RFIs, and site evidence.' },
  subcontractor: { label: 'Subcontractor', accent: '#d26a38', description: 'Manage package scope, evidence, claims, and close-out records.' },
  supplier: { label: 'Supplier', accent: '#1d8d6f', description: 'Track procurement, deliveries, warranties, and product evidence.' },
  freelancer: { label: 'Freelancer', accent: '#165a4c', description: 'Complete assigned deliverables, submissions, and resource bookings.' },
  admin: { label: 'Platform Admin', accent: '#ba1a1a', description: 'Oversee governance, system health, disputes, and platform controls.' },
  developer: { label: 'Developer', accent: '#5b3a9e', description: 'Property development portfolio, funding, and project coordination.' },
  engineer: { label: 'Engineer', accent: '#0066a1', description: 'Structural, civil, and specialist engineering design and compliance.' },
  quantity_surveyor: { label: 'Quantity Surveyor', accent: '#8b5e00', description: 'Cost planning, BoQ/BoM, tender analysis, and commercial control.' },
  planner: { label: 'Town Planner', accent: '#3a7d5a', description: 'Statutory planning, municipal submissions, and land-use applications.' },
  project_manager: { label: 'Project Manager', accent: '#4a6fa1', description: 'Programme management, team coordination, and project delivery oversight.' },
};

const DEFAULT_NAV_MAPPING: Record<string, string> = {
  command_centre: 'command',
  inbox: 'tasks',
  projects: 'journey',
  toolboxes: 'toolbox',
  cpd_learning: 'cpd-assessment',
  documents: 'files',
  marketplace: 'directory-search',
  finance: 'payments',
  messages: 'messages',
  settings: 'profile-settings',
};

// ── Component --------------------------------------------------------------

export function MainSidebar({
  user,
  activeTab,
  onNavigate,
  isSidebarOpen,
  onClose,
  onLogout,
  navKeyToPageId,
  extraItems,
}: MainSidebarProps) {
  const mapping = navKeyToPageId ?? DEFAULT_NAV_MAPPING;
  const roleVisual = ROLE_VISUALS[user.role] ?? ROLE_VISUALS.client;
  const visibleItems = navigationForRole(user.role);

  // Group items by a label for sectioning
  const sections = groupNavigationItems(visibleItems);

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[min(86vw,288px)] flex-col border-r border-border/70 beos-glass transform transition-transform duration-300 ease-in-out md:sticky md:top-0 md:h-dvh md:w-[288px] md:shrink-0 md:translate-x-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="h-full flex flex-col gap-y-4 p-7 overflow-y-auto">
        {/* Brand header */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <Logo iconClassName="h-14 w-14 object-contain sm:h-16 sm:w-16" textClassName="hidden" />
            <div>
              <p className="font-sans text-[1.35rem] font-black tracking-[-0.055em] text-primary">Architex OS</p>
              <p className="beos-label-caps text-muted-foreground">Project Coordination</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full hover:bg-primary/10"
            onClick={onClose}
            aria-label="Close navigation menu"
            aria-expanded={isSidebarOpen}
          >
            <X size={20} />
          </Button>
        </div>

        {/* Role card */}
        <div
          className="rounded-[1.25rem] border border-border/70 bg-muted/70 p-4 shadow-[0_10px_26px_rgba(20,71,63,0.06)]"
          style={{ borderTop: `4px solid ${roleVisual.accent}` }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="beos-label-caps text-muted-foreground">Current Role</span>
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: roleVisual.accent,
                boxShadow: `0 0 18px ${roleVisual.accent}`,
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-primary">{roleVisual.label}</p>
              <p className="mt-1 text-[0.72rem] leading-snug text-muted-foreground">
                {roleVisual.description}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1.5" aria-label="Role workspace navigation">
          {sections.map((section) => (
            <React.Fragment key={section.label}>
              <NavSectionLabel>{section.label}</NavSectionLabel>
              {section.items.map((item) => {
                const pageId = mapping[item.key] ?? item.key;
                return (
                  <NavItem
                    key={item.key}
                    icon={<NavIcon hint={item.iconHint} />}
                    label={item.label}
                    active={activeTab === pageId}
                    onClick={() => onNavigate(pageId, 'sidebar')}
                    data-testid={`nav-page-${pageId}`}
                  />
                );
              })}
            </React.Fragment>
          ))}

          {extraItems}
        </nav>

        {/* Keyboard shortcuts */}
        <div
          className="mt-4 rounded-[1rem] border border-border/70 bg-card/70 p-3 text-xs text-muted-foreground"
          data-testid="dashboard-keyboard-shortcuts"
        >
          <p className="font-bold text-foreground">Keyboard shortcuts</p>
          <p className="mt-1">
            Alt+1–9 opens your first visible pages. Alt+K Command, Alt+A AI, Alt+P Profile, Alt+F
            Files, Alt+I Invoicing.
          </p>
        </div>

        {/* Logout */}
        <div className="pt-5 mt-auto border-t border-border/70 shrink-0">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive hover:bg-destructive/5 rounded-full h-12 font-bold"
            onClick={onLogout}
          >
            <LogOut size={20} /> <span className="font-bold">Logout</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

// ── Helpers ----------------------------------------------------------------

interface NavSection {
  label: string;
  items: NavigationItem[];
}

function groupNavigationItems(items: NavigationItem[]): NavSection[] {
  // Simple grouping: first item = "Workspace", rest = "Zones"
  // For a more sophisticated grouping, extend the config
  if (items.length <= 1) {
    return [{ label: 'Workspace', items }];
  }

  const primary = items[0];
  const rest = items.slice(1);

  const sections: NavSection[] = [
    { label: 'Workspace', items: [primary] },
    { label: 'Zones', items: rest },
  ];

  return sections;
}

// ── Icon Resolver ----------------------------------------------------------

function NavIcon({ hint }: { hint: string }): React.ReactNode {
  const iconMap: Record<string, React.ReactNode> = {
    'home/dashboard': <LayoutDashboard size={18} />,
    'inbox/checklist': <LayoutDashboard size={18} />,
    'folder/building': <LayoutDashboard size={18} />,
    tools: <LayoutDashboard size={18} />,
    'graduation-cap/certificate': <LayoutDashboard size={18} />,
    'file/search': <HardDrive size={18} />,
    'users/store': <HardDrive size={18} />,
    'wallet/ledger': <CreditCard size={18} />,
    'message-circle': <CreditCard size={18} />,
    settings: <UserCircle size={18} />,
  };
  return iconMap[hint] ?? <LayoutDashboard size={18} />;
}
