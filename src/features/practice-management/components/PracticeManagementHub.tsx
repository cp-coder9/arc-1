/**
 * PracticeManagementHub — Main entry component for the Practice Management module (P2.9)
 *
 * Renders tab navigation for all practice management sub-views:
 * Pipeline | WIP | Timesheets | Billing | Profitability | Capacity | Compliance
 *
 * Gates WIP, Profitability, and Capacity tabs behind the Professional subscription tier.
 *
 * Validates: Requirements 8.1, 8.4, 8.6
 */

import React, { useState, useMemo } from 'react';
import {
  Briefcase,
  TrendingUp,
  Clock,
  Receipt,
  BarChart3,
  Users,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import type { UserProfile } from '@/types';
import type { PracticeSubscriptionTier } from '../types';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import PipelineView from './PipelineView';
import CapacityView from './CapacityView';
import ComplianceView from './ComplianceView';
import WIPDashboard from './WIPDashboard';
import TimesheetView from './TimesheetView';
import BillingView from './BillingView';
import ProfitabilityView from './ProfitabilityView';

// ─── Tab Configuration ────────────────────────────────────────────────────────

interface PracticeTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  /** If true, requires Professional tier subscription */
  requiresProfessional: boolean;
}

const PRACTICE_TABS: PracticeTab[] = [
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: Briefcase,
    description: 'Enquiry pipeline and conversion tracking',
    requiresProfessional: false,
  },
  {
    key: 'wip',
    label: 'WIP',
    icon: TrendingUp,
    description: 'Work in Progress tracking per project',
    requiresProfessional: true,
  },
  {
    key: 'timesheets',
    label: 'Timesheets',
    icon: Clock,
    description: 'Staff time recording and approval',
    requiresProfessional: false,
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: Receipt,
    description: 'Invoice generation and billing',
    requiresProfessional: false,
  },
  {
    key: 'profitability',
    label: 'Profitability',
    icon: BarChart3,
    description: 'Project and firm profitability metrics',
    requiresProfessional: true,
  },
  {
    key: 'capacity',
    label: 'Capacity',
    icon: Users,
    description: 'Staff allocation and capacity planning',
    requiresProfessional: true,
  },
  {
    key: 'compliance',
    label: 'Compliance',
    icon: ShieldCheck,
    description: 'PI insurance and registration tracking',
    requiresProfessional: false,
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PracticeManagementHubProps {
  user: UserProfile;
  firmId?: string;
  subscriptionTier?: PracticeSubscriptionTier;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PracticeManagementHub({
  user,
  firmId,
  subscriptionTier = 'essentials',
}: PracticeManagementHubProps) {
  const [activeTab, setActiveTab] = useState('pipeline');

  const resolvedFirmId = firmId || user.primaryFirmId || '';

  const accessibleTabs = useMemo(() => {
    return PRACTICE_TABS.map((tab) => ({
      ...tab,
      locked: tab.requiresProfessional && subscriptionTier !== 'professional',
    }));
  }, [subscriptionTier]);

  const handleTabChange = (value: string) => {
    const tab = accessibleTabs.find((t) => t.key === value);
    if (tab && !tab.locked) {
      setActiveTab(value);
    }
  };

  return (
    <div className="space-y-6" data-testid="practice-management-hub">
      {/* Header Card */}
      <Card className="rounded-2xl border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest text-xs">
                Practice Management
              </Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3">
                <Briefcase className="h-7 w-7 text-primary" />
                Practice Hub
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                Manage your firm&apos;s enquiry pipeline, timesheets, billing, and staff compliance from a single workspace.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {subscriptionTier}
              </Badge>
              <Badge className="capitalize w-fit">{user.role}</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabbed Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-surface-800/50 p-1 rounded-xl">
          {accessibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                disabled={tab.locked}
                className="flex items-center gap-2 px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tab.locked ? (
                  <Lock className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span>{tab.label}</span>
                {tab.locked && (
                  <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                    Pro
                  </Badge>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="pipeline" className="mt-4">
          <PipelineView
            user={user}
            firmId={resolvedFirmId}
            enquiries={[]}
            metrics={{
              totalByStage: { lead: 0, quote_sent: 0, quote_accepted: 0, appointed: 0, active: 0, complete: 0, on_hold: 0, lost: 0 },
              feeValueByStage: { lead: 0, quote_sent: 0, quote_accepted: 0, appointed: 0, active: 0, complete: 0, on_hold: 0, lost: 0 },
              conversionRate: 0,
              averageTimePerStage: { lead: 0, quote_sent: 0, quote_accepted: 0, appointed: 0, active: 0, complete: 0, on_hold: 0, lost: 0 },
              winLossRatioMonth: 0,
              winLossRatio12Month: 0,
            }}
          />
        </TabsContent>

        <TabsContent value="wip" className="mt-4">
          <WIPDashboard firmId={resolvedFirmId} />
        </TabsContent>

        <TabsContent value="timesheets" className="mt-4">
          <TimesheetView firmId={resolvedFirmId} staffId={user.uid || ''} />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingView firmId={resolvedFirmId} />
        </TabsContent>

        <TabsContent value="profitability" className="mt-4">
          <ProfitabilityView firmId={resolvedFirmId} />
        </TabsContent>

        <TabsContent value="capacity" className="mt-4">
          <CapacityView firmId={resolvedFirmId} />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <ComplianceView firmId={resolvedFirmId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Placeholder Panel ────────────────────────────────────────────────────────

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
      <CardContent className="p-8 text-center">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
        <p className="text-xs text-muted-foreground mt-4 italic">
          Component implementation pending.
        </p>
      </CardContent>
    </Card>
  );
}
