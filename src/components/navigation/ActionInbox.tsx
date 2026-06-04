/**
 * ActionInbox — Aggregated action card inbox placeholder.
 *
 * Displays required actions, approvals, overdue items, and
 * agent-pushed tasks from across the platform. Connects with
 * the existing TasksApprovalsPage when items are selected.
 */

import React from 'react';
import type { UserProfile } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ── Props ------------------------------------------------------------------

export interface ActionInboxProps {
  user: UserProfile;
  onNavigate?: (tab: string) => void;
}

// ── Mock Section Config ----------------------------------------------------

const SECTIONS = [
  { key: 'required', label: 'Required Actions', icon: <ClipboardCheck size={16} />, count: 0, color: 'bg-blue-50 text-blue-700' },
  { key: 'approvals', label: 'Pending Approvals', icon: <CheckCircle2 size={16} />, count: 0, color: 'bg-amber-50 text-amber-700' },
  { key: 'overdue', label: 'Overdue', icon: <AlertTriangle size={16} />, count: 0, color: 'bg-destructive/10 text-destructive' },
  { key: 'retakes', label: 'Retakes / Resubmissions', icon: <Clock size={16} />, count: 0, color: 'bg-purple-50 text-purple-700' },
];

// ── Component --------------------------------------------------------------

export function ActionInbox({ user, onNavigate }: ActionInboxProps) {
  return (
    <div className="space-y-6 p-4 sm:p-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-[-0.03em] text-primary">
            Inbox
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            All action cards from agents and workflows — filtered for{' '}
            <span className="font-bold text-primary">{user.role}</span>.
          </p>
        </div>
        <Badge variant="outline" className="rounded-full">
          {SECTIONS.reduce((sum, s) => sum + s.count, 0)} items
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card
            key={section.key}
            className="beos-section-card cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => onNavigate?.('tasks')}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{section.icon}</span>
                  <CardTitle className="text-sm">{section.label}</CardTitle>
                </div>
                <Badge className={section.color}>{section.count}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription>
                {section.count === 0
                  ? 'No items waiting.'
                  : `${section.count} ${section.count === 1 ? 'item' : 'items'} require your attention.`}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
