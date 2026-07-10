/**
 * EnvironmentalHub — Main entry component for the Environmental & Heritage module (P2.10)
 *
 * Renders tab navigation across all environmental & heritage sub-views:
 * EIA Screening | EA Tracker | Heritage | ROD Register | EMPr
 *
 * Accepts user and projectId props; integrates the DisclaimerBanner throughout.
 *
 * Requirements: 15.1, 15.3, 15.6
 */

import React, { useState } from 'react';
import {
  Leaf,
  ClipboardCheck,
  FileSearch,
  Landmark,
  ScrollText,
  HardHat,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { UserProfile } from '@/types';
import { EIACheckerView } from './EIACheckerView';
import { DisclaimerBanner } from './DisclaimerBanner';

// ─── Tab Configuration ────────────────────────────────────────────────────────

interface EnvironmentalTab {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}

const ENVIRONMENTAL_TABS: EnvironmentalTab[] = [
  {
    key: 'eia-screening',
    label: 'EIA Screening',
    icon: ClipboardCheck,
    description: 'Screen project against NEMA Listed Activities',
  },
  {
    key: 'ea-tracker',
    label: 'EA Tracker',
    icon: FileSearch,
    description: 'Track Environmental Authorisation applications',
  },
  {
    key: 'heritage',
    label: 'Heritage',
    icon: Landmark,
    description: 'NHRA Section 38 heritage impact workflows',
  },
  {
    key: 'rod-register',
    label: 'ROD Register',
    icon: ScrollText,
    description: 'Record of Decision conditions compliance',
  },
  {
    key: 'empr',
    label: 'EMPr',
    icon: HardHat,
    description: 'Environmental Management Programme compliance',
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface EnvironmentalHubProps {
  user: UserProfile;
  projectId: string;
  projectName?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvironmentalHub({ user, projectId, projectName }: EnvironmentalHubProps) {
  const [activeTab, setActiveTab] = useState('eia-screening');

  return (
    <div className="space-y-6" data-testid="environmental-hub">
      {/* Header Card */}
      <Card className="rounded-2xl border-border bg-card/95 shadow-sm overflow-hidden">
        <CardHeader className="bg-primary/5 border-b border-border">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <Badge variant="secondary" className="uppercase tracking-widest text-xs">
                Environmental & Heritage
              </Badge>
              <CardTitle className="font-heading text-3xl mt-3 flex items-center gap-3">
                <Leaf className="h-7 w-7 text-emerald-400" aria-hidden="true" />
                Environmental & Heritage Impact
              </CardTitle>
              <CardDescription className="mt-2 max-w-3xl text-base">
                EIA screening, Environmental Authorisation tracking, heritage impact workflows,
                ROD conditions register, and EMPr compliance for project {projectId}.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="capitalize w-fit">{user.role}</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Tabbed Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-surface-800/50 p-1 rounded-xl">
          {ENVIRONMENTAL_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                className="flex items-center gap-2 px-3 py-2 text-sm data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Tab Content */}
        <TabsContent value="eia-screening" className="mt-4">
          <EIACheckerView user={user} projectId={projectId} projectName={projectName} />
        </TabsContent>

        <TabsContent value="ea-tracker" className="mt-4">
          <PlaceholderPanel
            title="EA Tracker"
            description="Track Environmental Authorisation applications through regulatory stages with deadline monitoring."
          />
        </TabsContent>

        <TabsContent value="heritage" className="mt-4">
          <PlaceholderPanel
            title="Heritage Impact Assessment"
            description="Manage NHRA Section 38 heritage impact workflows from notification to permit."
          />
        </TabsContent>

        <TabsContent value="rod-register" className="mt-4">
          <PlaceholderPanel
            title="ROD Conditions Register"
            description="Track Environmental Authorisation and heritage permit conditions compliance."
          />
        </TabsContent>

        <TabsContent value="empr" className="mt-4">
          <PlaceholderPanel
            title="EMPr Compliance"
            description="Environmental Management Programme audits, incidents, and corrective action tracking."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Placeholder Panel ────────────────────────────────────────────────────────

function PlaceholderPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-4">
      <DisclaimerBanner compact />
      <Card className="rounded-2xl border-border bg-card/90 shadow-sm">
        <CardContent className="p-8 text-center">
          <p className="text-lg font-semibold text-foreground">{title}</p>
          <p className="text-sm text-muted-foreground mt-2">{description}</p>
          <p className="text-xs text-muted-foreground mt-4 italic">
            Component implementation pending.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
