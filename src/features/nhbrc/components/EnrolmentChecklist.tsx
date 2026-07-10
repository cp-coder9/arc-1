/**
 * Enrolment Checklist Component
 *
 * Displays checklist items with status toggles (not_started, in_progress,
 * completed, not_applicable) and shows readiness percentage as a progress bar.
 *
 * Requirements: 11.1, 11.5
 */

import React, { useState } from 'react';
import { CheckCircle2, Circle, Clock, MinusCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import type { ChecklistItem, ChecklistItemStatus } from '../types';

export interface EnrolmentChecklistProps {
  projectId?: string;
  items?: ChecklistItem[];
  readinessPercentage?: number;
  onStatusChange?: (itemId: string, status: ChecklistItemStatus) => void;
}

const STATUS_CYCLE: ChecklistItemStatus[] = ['not_started', 'in_progress', 'completed', 'not_applicable'];

const STATUS_CONFIG: Record<ChecklistItemStatus, { label: string; icon: React.ReactNode; color: string }> = {
  not_started: {
    label: 'Not Started',
    icon: <Circle className="h-4 w-4" />,
    color: 'text-slate-400',
  },
  in_progress: {
    label: 'In Progress',
    icon: <Clock className="h-4 w-4" />,
    color: 'text-amber-400',
  },
  completed: {
    label: 'Completed',
    icon: <CheckCircle2 className="h-4 w-4" />,
    color: 'text-green-400',
  },
  not_applicable: {
    label: 'N/A',
    icon: <MinusCircle className="h-4 w-4" />,
    color: 'text-slate-500',
  },
};

const DEFAULT_ITEMS: ChecklistItem[] = [
  { id: 'chk-1', label: 'Builder NHBRC Registration', description: 'Verified active builder registration number', status: 'not_started', isApplicable: true },
  { id: 'chk-2', label: 'Approved Building Plans', description: 'Council-approved building plans submitted', status: 'not_started', isApplicable: true },
  { id: 'chk-3', label: 'Proof of Ownership', description: 'Title deed or consent from property owner', status: 'not_started', isApplicable: true },
  { id: 'chk-4', label: 'Project Details', description: 'Number of units, types, and estimated values captured', status: 'not_started', isApplicable: true },
  { id: 'chk-5', label: 'Site Address', description: 'Full physical address of construction site', status: 'not_started', isApplicable: true },
  { id: 'chk-6', label: 'Enrolment Fee Payment', description: 'NHBRC enrolment fee paid or proof of payment', status: 'not_started', isApplicable: true },
];

function calculateReadiness(items: ChecklistItem[]): number {
  const applicable = items.filter((i) => i.isApplicable && i.status !== 'not_applicable');
  if (applicable.length === 0) return 0;
  const completed = applicable.filter((i) => i.status === 'completed').length;
  return Math.floor((completed / applicable.length) * 100);
}

export function EnrolmentChecklist({
  items: externalItems,
  readinessPercentage: externalReadiness,
  onStatusChange,
}: EnrolmentChecklistProps) {
  const [internalItems, setInternalItems] = useState<ChecklistItem[]>(DEFAULT_ITEMS);
  const items = externalItems ?? internalItems;
  const readiness = externalReadiness ?? calculateReadiness(items);

  function cycleStatus(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const currentIdx = STATUS_CYCLE.indexOf(item.status);
    const nextStatus = STATUS_CYCLE[(currentIdx + 1) % STATUS_CYCLE.length];

    if (onStatusChange) {
      onStatusChange(itemId, nextStatus);
    } else {
      setInternalItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: nextStatus } : i))
      );
    }
  }

  return (
    <Card className="bg-slate-800/70 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-100">
          Enrolment Readiness Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Readiness progress bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-slate-400">Readiness</span>
            <span className="text-sm font-semibold text-slate-200">{readiness}%</span>
          </div>
          <Progress value={readiness} max={100} className="h-2.5" />
        </div>

        {/* Checklist items */}
        <ul className="space-y-2" role="list" aria-label="Enrolment checklist items">
          {items.map((item) => {
            const config = STATUS_CONFIG[item.status];
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2.5"
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className={config.color}
                  onClick={() => cycleStatus(item.id)}
                  aria-label={`Toggle status for ${item.label}, currently ${config.label}`}
                >
                  {config.icon}
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{item.label}</p>
                  <p className="text-xs text-slate-400 truncate">{item.description}</p>
                </div>
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
                  {config.label}
                </span>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
