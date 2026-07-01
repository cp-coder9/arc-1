/**
 * MarketplaceShell — Primary Marketplace UI shell component.
 *
 * Renders inside the authenticated Architex OS content area following
 * the SpecForge workspace pattern: breadcrumb header, tabbed sections,
 * and role-based section visibility.
 *
 * Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6
 */

import { useMemo, useState, useEffect } from 'react';
import type { UserProfile, UserRole } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Store,
  Briefcase,
  ClipboardList,
  Package,
  Users,
  Search,
  Building2,
} from 'lucide-react';
import { checkMarketplacePermission } from '../services/marketplaceRbacService';

// ─── Section Configuration ────────────────────────────────────────────────────

export interface MarketplaceSection {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Roles permitted to see this section */
  roles: UserRole[];
}

/**
 * Marketplace sections (tabs) with role-based visibility.
 * Each section is only visible to users whose role is in its `roles` array.
 */
export const MARKETPLACE_SECTIONS: MarketplaceSection[] = [
  {
    key: 'projects',
    label: 'Projects',
    description: 'Post and discover project opportunities.',
    icon: Briefcase,
    roles: [
      'client', 'developer', 'architect', 'engineer', 'quantity_surveyor',
      'town_planner', 'energy_professional', 'fire_engineer', 'bep',
      'contractor', 'subcontractor',
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    description: 'Post and apply for micro-tasks.',
    icon: ClipboardList,
    roles: [
      'architect', 'engineer', 'quantity_surveyor', 'town_planner',
      'energy_professional', 'fire_engineer', 'bep', 'freelancer',
      'contractor', 'subcontractor',
    ],
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    description: 'Search and compare SANS-compliant materials.',
    icon: Package,
    roles: ['contractor', 'subcontractor', 'supplier'],
  },
  {
    key: 'freelancers',
    label: 'Freelancers',
    description: 'Discover freelancer profiles and hire.',
    icon: Users,
    roles: [
      'architect', 'engineer', 'quantity_surveyor', 'town_planner',
      'energy_professional', 'fire_engineer', 'bep', 'contractor',
      'subcontractor', 'freelancer',
    ],
  },
  {
    key: 'collaborations',
    label: 'Collaborations',
    description: 'Firm team projects and invitations.',
    icon: Building2,
    roles: ['firm_admin', 'architect', 'bep'],
  },
  {
    key: 'search',
    label: 'Search',
    description: 'Compliance-first professional search.',
    icon: Search,
    roles: ['client', 'developer'],
  },
];

// ─── Module-Level Role Access ─────────────────────────────────────────────────

/**
 * Roles permitted to access the Marketplace module at all.
 * Matches the roles list from the marketplace navigation entry.
 */
const MARKETPLACE_MODULE_ROLES: UserRole[] = [
  'client', 'architect', 'admin', 'bep', 'contractor', 'subcontractor',
  'supplier', 'engineer', 'quantity_surveyor', 'town_planner',
  'energy_professional', 'fire_engineer', 'freelancer', 'developer',
  'firm_admin',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the sections visible to a given role (accounting for architect/bep equivalence).
 */
export function getPermittedSections(role: UserRole): MarketplaceSection[] {
  // Normalize: bep and architect are equivalent per Req 12.8
  const effectiveRole: UserRole = role === 'bep' ? 'architect' : role;
  return MARKETPLACE_SECTIONS.filter(
    (section) =>
      section.roles.includes(role) || section.roles.includes(effectiveRole)
  );
}

/**
 * Checks if a role has module-level marketplace access.
 */
export function hasMarketplaceAccess(role: UserRole): boolean {
  const effectiveRole: UserRole = role === 'bep' ? 'architect' : role;
  return (
    MARKETPLACE_MODULE_ROLES.includes(role) ||
    MARKETPLACE_MODULE_ROLES.includes(effectiveRole)
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MarketplaceShellProps {
  user: UserProfile;
}

export default function MarketplaceShell({ user }: MarketplaceShellProps) {
  const permittedSections = useMemo(
    () => getPermittedSections(user.role),
    [user.role]
  );

  // Module-level role gate: redirect non-marketplace roles to Command Centre
  const hasAccess = useMemo(() => hasMarketplaceAccess(user.role), [user.role]);

  const [activeSection, setActiveSection] = useState<string>(() => {
    if (!hasAccess || permittedSections.length === 0) return '';
    return permittedSections[0].key;
  });

  // Redirect unauthorized section access to first permitted section
  useEffect(() => {
    if (!hasAccess || permittedSections.length === 0) return;
    const isCurrentPermitted = permittedSections.some(
      (s) => s.key === activeSection
    );
    if (!isCurrentPermitted) {
      setActiveSection(permittedSections[0].key);
    }
  }, [activeSection, permittedSections, hasAccess]);

  // Redirect to Command Centre for non-marketplace roles
  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <Store className="h-12 w-12 text-surface-500" />
        <p className="text-surface-400 text-sm">
          Your role does not have access to the Marketplace.
        </p>
        <p className="text-surface-500 text-xs">
          Redirecting to Command Centre…
        </p>
      </div>
    );
  }

  if (permittedSections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-4">
        <Store className="h-12 w-12 text-surface-500" />
        <p className="text-surface-400 text-sm">
          No marketplace sections are available for your role.
        </p>
      </div>
    );
  }

  const activeSectionData = permittedSections.find(
    (s) => s.key === activeSection
  );

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Breadcrumb Trail */}
      <div className="flex items-center gap-2 text-xs text-surface-400">
        <Store className="h-4 w-4" />
        <span>/</span>
        <span className="font-medium text-surface-300">Marketplace</span>
        <span>/</span>
        <span className="text-surface-200">
          {activeSectionData?.label ?? 'Unknown'}
        </span>
      </div>

      {/* Tool Header Card */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary-500/10 border border-primary-500/20">
                <Store className="h-5 w-5 text-primary-400" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold text-surface-100">
                  Marketplace
                </CardTitle>
                <p className="text-xs text-surface-400 mt-0.5">
                  Professional commerce layer — discover, transact, and collaborate
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">
              {user.role.replace(/_/g, ' ')}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Tab Navigation — role-filtered sections */}
      <Tabs
        value={activeSection}
        onValueChange={setActiveSection}
        className="flex-1 flex flex-col"
      >
        <TabsList className="bg-surface-800/50 border border-surface-700/50 h-auto flex-wrap justify-start gap-1 p-1">
          {permittedSections.map((section) => {
            const Icon = section.icon;
            return (
              <TabsTrigger
                key={section.key}
                value={section.key}
                className="flex items-center gap-1.5 text-xs data-[state=active]:bg-primary-500/15 data-[state=active]:text-primary-300"
              >
                <Icon className="h-3.5 w-3.5" />
                {section.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        {permittedSections.map((section) => {
          const Icon = section.icon;
          return (
            <TabsContent
              key={section.key}
              value={section.key}
              className="flex-1 mt-4"
            >
              <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50 h-full">
                <CardContent className="p-6">
                  <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
                    <div className="flex items-center justify-center h-16 w-16 rounded-xl bg-surface-700/50 border border-surface-600/50">
                      <Icon className="h-8 w-8 text-surface-400" />
                    </div>
                    <div className="text-center">
                      <h3 className="text-sm font-medium text-surface-200">
                        {section.label}
                      </h3>
                      <p className="text-xs text-surface-400 mt-1 max-w-sm">
                        {section.description}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Coming soon
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
