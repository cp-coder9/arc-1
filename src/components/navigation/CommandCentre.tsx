/**
 * CommandCentre — Daily cockpit placeholder.
 *
 * Eventually this will be the personalised landing page per the
 * Architex Navigation Framework spec. For now it provides a
 * structured placeholder showing the intended sections.
 */

import React from 'react';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LayoutDashboard, Clock, BookOpen, Bell, Sparkles } from 'lucide-react';

// ── Props ------------------------------------------------------------------

export interface CommandCentreProps {
  user: UserProfile;
}

// ── Section Config ---------------------------------------------------------

const SECTIONS = [
  { key: 'today', label: 'Today / Next Actions', icon: <Clock size={16} />, description: 'Your daily priorities and pending decisions.' },
  { key: 'active_projects', label: 'Active Projects', icon: <LayoutDashboard size={16} />, description: 'Current project responsibilities and status.' },
  { key: 'cpd_status', label: 'CPD Status', icon: <BookOpen size={16} />, description: 'Professional learning and compliance summary.' },
  { key: 'pending_approvals', label: 'Pending Approvals', icon: <Bell size={16} />, description: 'Items waiting for your sign-off.' },
  { key: 'agent_recommendations', label: 'Agent Recommendations', icon: <Sparkles size={16} />, description: 'Next-best actions suggested by your agents.' },
];

// ── Component --------------------------------------------------------------

export function CommandCentre({ user }: CommandCentreProps) {
  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div>
        <h2 className="text-2xl font-black tracking-[-0.03em] text-primary">
          Command Centre
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Your personalised daily cockpit — curated by your user agent.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => (
          <Card key={section.key} className="beos-section-card">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{section.icon}</span>
                <CardTitle className="text-sm">{section.label}</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>{section.description}</CardDescription>
              <Badge variant="secondary" className="mt-3">
                Coming soon
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
