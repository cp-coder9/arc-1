/**
 * Contract Administration Dashboard
 *
 * Main entry component for contract administration, rendered inside
 * the Architex OS shell content area. Provides tab-based navigation
 * to all contract admin sub-views with RBAC-driven tab visibility.
 *
 * Self-contained: loads the user's projects from Firestore and provides
 * an internal project selector (same pattern as DrawingRegisterPage).
 *
 * Requirements: 9.1–9.8, 11.1, 11.5
 */

import React, { useState, useMemo, useEffect } from 'react';
import { limit, onSnapshot, query, where, type Query } from 'firebase/firestore';
import type { Project, UserProfile } from '@/types';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  FileText,
  Settings,
  ClipboardList,
  Bell,
  GitBranch,
  Clock,
  CreditCard,
  Scale,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import {
  resolveMultiRolePermissions,
  getDisclaimerBannerText,
} from '@/services/contractAdmin/client';
import type {
  ContractFeature,
  ContractProjectAssignment,
} from '@/services/contractAdmin/client';
import { getDemoCol } from '../demo-seed/demoFirestore';
import { ContractSetupWizard } from './ContractSetupWizard';
import { ContractDataSheet } from './ContractDataSheet';
import { NoticeRegister } from './NoticeRegister';
import { VariationRegister } from './VariationRegister';
import { EoTClaimManager } from './EoTClaimManager';
import { PaymentScheduleView } from './PaymentScheduleView';
import { ClaimsRegister } from './ClaimsRegister';

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ContractAdminDashboardProps {
  user: UserProfile;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  feature: ContractFeature;
}

type LoadState = 'loading' | 'ready' | 'error';

// ══════════════════════════════════════════════════════════════════════════════
// Tab Definitions
// ══════════════════════════════════════════════════════════════════════════════

const TAB_CONFIG: TabConfig[] = [
  { id: 'overview', label: 'Overview', icon: <FileText className="w-4 h-4" />, feature: 'data_sheet_view' },
  { id: 'setup', label: 'Setup', icon: <Settings className="w-4 h-4" />, feature: 'contract_setup' },
  { id: 'data-sheet', label: 'Data Sheet', icon: <ClipboardList className="w-4 h-4" />, feature: 'data_sheet_view' },
  { id: 'notices', label: 'Notices', icon: <Bell className="w-4 h-4" />, feature: 'notices' },
  { id: 'variations', label: 'Variations', icon: <GitBranch className="w-4 h-4" />, feature: 'variations' },
  { id: 'eot-claims', label: 'EoT Claims', icon: <Clock className="w-4 h-4" />, feature: 'eot' },
  { id: 'payments', label: 'Payments', icon: <CreditCard className="w-4 h-4" />, feature: 'payment_schedule' },
  { id: 'claims', label: 'Claims', icon: <Scale className="w-4 h-4" />, feature: 'claims' },
];

// ══════════════════════════════════════════════════════════════════════════════
// Disclaimer Banner (persistent, non-dismissible)
// ══════════════════════════════════════════════════════════════════════════════

function ContractDisclaimerBanner() {
  const bannerText = getDisclaimerBannerText();

  return (
    <div
      className="w-full bg-amber-900/30 border border-amber-700/50 rounded-lg px-4 py-3 flex items-start gap-3"
      role="alert"
      aria-live="polite"
    >
      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-200/90 leading-relaxed">{bannerText}</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Project Loading Helpers (same pattern as DrawingRegisterPage)
// ══════════════════════════════════════════════════════════════════════════════

function timestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime() || 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate: () => Date }).toDate().getTime();
  if (typeof value === 'object' && 'seconds' in value && typeof (value as { seconds?: unknown }).seconds === 'number') return (value as { seconds: number }).seconds * 1000;
  return 0;
}

function sortByRecent<T extends { updatedAt?: unknown; createdAt?: unknown; issuedAt?: unknown }>(items: T[]) {
  return [...items].sort((a, b) => timestampMs(b.updatedAt ?? b.issuedAt ?? b.createdAt) - timestampMs(a.updatedAt ?? a.issuedAt ?? a.createdAt));
}

function projectQueriesForUser(user: UserProfile): Query[] {
  const projects = getDemoCol('projects');
  if (user.role === 'admin') return [query(projects, limit(40))];
  if (user.role === 'client' || user.role === 'developer') return [query(projects, where('clientId', '==', user.uid), limit(25))];
  if (user.role === 'architect' || user.role === 'bep') {
    return [
      query(projects, where('leadProfessionalId', '==', user.uid), limit(25)),
      query(projects, where('leadBepId', '==', user.uid), limit(25)),
      query(projects, where('leadArchitectId', '==', user.uid), limit(25)),
    ];
  }
  if (user.role === 'contractor' || user.role === 'subcontractor' || user.role === 'quantity_surveyor' || user.role === 'engineer' || user.role === 'site_manager') {
    return [query(projects, where('teamMemberIds', 'array-contains', user.uid), limit(25))];
  }
  return [];
}

function mergeProjectSnapshots(snapshotGroups: Project[][]) {
  const byId = new Map<string, Project>();
  for (const projects of snapshotGroups) {
    for (const project of projects) {
      byId.set(project.id, { ...byId.get(project.id), ...project });
    }
  }
  return sortByRecent(Array.from(byId.values()));
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function ContractAdminDashboard({ user }: ContractAdminDashboardProps) {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  // Load user's projects from Firestore
  useEffect(() => {
    const projectQueries = projectQueriesForUser(user);
    if (projectQueries.length === 0) {
      setProjects([]);
      setLoadState('ready');
      return undefined;
    }

    let cancelled = false;
    const snapshotGroups = projectQueries.map(() => [] as Project[]);
    const loadedGroups = new Set<number>();
    const unsubscribers = projectQueries.map((projectQuery, index) => onSnapshot(projectQuery, (snapshot) => {
      if (cancelled) return;
      snapshotGroups[index] = snapshot.docs.map((projectDoc) => ({ id: projectDoc.id, ...projectDoc.data() } as Project));
      loadedGroups.add(index);
      const nextProjects = mergeProjectSnapshots(snapshotGroups);
      setProjects(nextProjects);
      setSelectedProjectId((current) => current && nextProjects.some((project) => project.id === current) ? current : nextProjects[0]?.id || '');
      if (loadedGroups.size === projectQueries.length) setLoadState('ready');
    }, (error) => {
      console.warn('Contract admin project projection unavailable:', error);
      if (cancelled) return;
      loadedGroups.add(index);
      if (loadedGroups.size === projectQueries.length) {
        setProjects(mergeProjectSnapshots(snapshotGroups));
        setLoadState('ready');
      }
    }));

    return () => {
      cancelled = true;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user]);

  // Loading state
  if (loadState === 'loading') {
    return (
      <div className="space-y-4 w-full">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-6 text-center py-16">
            <Loader2 className="w-8 h-8 text-primary-400 mx-auto mb-4 animate-spin" />
            <p className="text-sm text-surface-400">Loading projects...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No projects available
  if (projects.length === 0) {
    return (
      <div className="space-y-4 w-full">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-6 text-center py-16">
            <FileText className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">No projects found</h3>
            <p className="text-sm text-surface-400 mt-2 max-w-md mx-auto">
              Contract administration requires an active project. Create a project first or
              ensure you are assigned to one.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Multiple projects — show selector; auto-select if only one
  if (!selectedProjectId) {
    return (
      <div className="space-y-4 w-full">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-6 text-center py-16">
            <FileText className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">Select a project</h3>
            <p className="text-sm text-surface-400 mt-2 max-w-md mx-auto">
              Contract administration requires an active project context. Select a project
              to access notices, variations, claims, and payment schedules.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ContractAdminDashboardInner
      user={user}
      projectId={selectedProjectId}
      projects={projects}
      selectedProjectId={selectedProjectId}
      onProjectChange={setSelectedProjectId}
    />
  );
}

function ContractAdminDashboardInner({ user, projectId, projects, selectedProjectId, onProjectChange }: {
  user: UserProfile;
  projectId: string;
  projects: Project[];
  selectedProjectId: string;
  onProjectChange: (id: string) => void;
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [disclaimerVisible, setDisclaimerVisible] = useState(false);

  // Build the project assignment for RBAC resolution
  const projectAssignment: ContractProjectAssignment = useMemo(() => ({
    projectId,
    userId: user.uid,
    roles: [user.role],
    isAssignedTeamMember: ['architect', 'bep', 'quantity_surveyor', 'engineer'].includes(user.role),
    isAssignedContractor: user.role === 'contractor',
    isAssignedSubcontractor: user.role === 'subcontractor',
    isProjectOwner: ['client', 'developer'].includes(user.role),
    isAssignedSiteManager: user.role === 'site_manager',
  }), [user, projectId]);

  // Derive visible tabs based on user permissions
  const visibleTabs = useMemo(() => {
    return TAB_CONFIG.filter((tab) => {
      const permissions = resolveMultiRolePermissions([user.role], tab.feature, projectAssignment);
      return permissions.length > 0;
    });
  }, [user.role, projectAssignment]);

  // Track disclaimer visibility for blocking interaction (Req 11.5)
  useEffect(() => {
    setDisclaimerVisible(true);
  }, []);

  // If disclaimer has not rendered, block interaction
  if (!disclaimerVisible) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-surface-400 text-sm">Loading contract administration...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full">
      {/* Persistent Disclaimer Banner */}
      <ContractDisclaimerBanner />

      {/* Dashboard Header */}
      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-white">
                Contract Administration
              </CardTitle>
              <p className="text-sm text-surface-400 mt-1">
                Manage contractual obligations, notices, variations, and claims
              </p>
            </div>
            <div className="flex items-center gap-3">
              {projects.length > 1 && (
                <select
                  className="rounded-lg border border-surface-600 bg-surface-900/80 px-3 py-2 text-sm text-white"
                  value={selectedProjectId}
                  onChange={(e) => onProjectChange(e.target.value)}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.id} · {project.currentStage}
                    </option>
                  ))}
                </select>
              )}
              <Badge variant="outline" className="border-primary-500/50 text-primary-400">
                {user.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-surface-800/50 border border-surface-700/50 w-full justify-start overflow-x-auto">
          {visibleTabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex items-center gap-2 data-[state=active]:bg-primary-600/20 data-[state=active]:text-primary-300"
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab Content */}
        <div className="mt-4">
          <TabsContent value="overview">
            <OverviewPanel projectId={projectId} />
          </TabsContent>

          <TabsContent value="setup">
            <ContractSetupWizard user={user} projectId={projectId} />
          </TabsContent>

          <TabsContent value="data-sheet">
            <ContractDataSheet user={user} projectId={projectId} />
          </TabsContent>

          <TabsContent value="notices">
            <NoticeRegister user={user} projectId={projectId} />
          </TabsContent>

          <TabsContent value="variations">
            <VariationRegister user={user} projectId={projectId} />
          </TabsContent>

          <TabsContent value="eot-claims">
            <EoTClaimManager user={user} projectId={projectId} />
          </TabsContent>

          <TabsContent value="payments">
            <PaymentScheduleView user={user} projectId={projectId} />
          </TabsContent>

          <TabsContent value="claims">
            <ClaimsRegister user={user} projectId={projectId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-Components
// ══════════════════════════════════════════════════════════════════════════════

function OverviewPanel({ projectId }: { projectId: string }) {
  return (
    <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
      <CardContent className="pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Active Notices" value="—" icon={<Bell className="w-5 h-5 text-blue-400" />} />
          <StatCard label="Open Variations" value="—" icon={<GitBranch className="w-5 h-5 text-purple-400" />} />
          <StatCard label="Pending EoT Claims" value="—" icon={<Clock className="w-5 h-5 text-amber-400" />} />
          <StatCard label="Outstanding Claims" value="—" icon={<Scale className="w-5 h-5 text-red-400" />} />
        </div>
        <div className="mt-6 text-center text-surface-400 text-sm">
          <p>Select a tab above to manage contract administration for this project.</p>
          <p className="mt-1 text-xs text-surface-500">Project: {projectId}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface-900/50 rounded-lg border border-surface-700/30 p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className="text-xs text-surface-400 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

export default ContractAdminDashboard;
