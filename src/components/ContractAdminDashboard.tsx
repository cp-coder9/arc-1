/**
 * Contract Administration Dashboard
 *
 * Main entry component for contract administration, rendered inside
 * the Architex OS shell content area. Provides tab-based navigation
 * to all contract admin sub-views with RBAC-driven tab visibility.
 *
 * Requirements: 9.1–9.8, 11.1, 11.5
 */

import React, { useState, useMemo, useEffect } from 'react';
import type { UserProfile } from '@/types';
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
} from 'lucide-react';
import {
  resolveMultiRolePermissions,
  getDisclaimerBannerText,
} from '@/services/contractAdmin/client';
import type {
  ContractFeature,
  ContractProjectAssignment,
} from '@/services/contractAdmin/client';
import { ContractSetupWizard } from './ContractSetupWizard';
import { ContractDataSheet } from './ContractDataSheet';

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ContractAdminDashboardProps {
  user: UserProfile;
  projectId?: string;
}

interface TabConfig {
  id: string;
  label: string;
  icon: React.ReactNode;
  feature: ContractFeature;
}

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
// Main Component
// ══════════════════════════════════════════════════════════════════════════════

export function ContractAdminDashboard({ user, projectId }: ContractAdminDashboardProps) {
  // If no project is selected, show a prompt
  if (!projectId) {
    return (
      <div className="space-y-4 w-full">
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-6 text-center py-16">
            <FileText className="w-12 h-12 text-surface-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">Select a project</h3>
            <p className="text-sm text-surface-400 mt-2 max-w-md mx-auto">
              Contract administration requires an active project context. Select a project from
              the Projects section to access notices, variations, claims, and payment schedules.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ContractAdminDashboardInner user={user} projectId={projectId} />;
}

function ContractAdminDashboardInner({ user, projectId }: { user: UserProfile; projectId: string }) {
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
            <Badge variant="outline" className="border-primary-500/50 text-primary-400">
              {user.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Badge>
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
            <PlaceholderPanel title="Contractual Notices" description="Notice register, deadline tracking, and deemed outcomes." />
          </TabsContent>

          <TabsContent value="variations">
            <PlaceholderPanel title="Variation Orders" description="Variation lifecycle, cost/time impact, and cumulative summary." />
          </TabsContent>

          <TabsContent value="eot-claims">
            <PlaceholderPanel title="Extension of Time Claims" description="EoT claim builder, evidence linking, and review workflow." />
          </TabsContent>

          <TabsContent value="payments">
            <PlaceholderPanel title="Payment Schedule" description="Certificate timeline, retention tracking, and overdue alerts." />
          </TabsContent>

          <TabsContent value="claims">
            <PlaceholderPanel title="Claims & Disputes" description="Claims register, dispute escalation, and cumulative summary." />
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

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
      <CardContent className="pt-6 text-center py-12">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="text-sm text-surface-400 mt-2">{description}</p>
        <p className="text-xs text-surface-500 mt-4">Component will be implemented in a subsequent task.</p>
      </CardContent>
    </Card>
  );
}

export default ContractAdminDashboard;
