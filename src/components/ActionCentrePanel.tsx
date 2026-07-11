/**
 * Action Centre Panel — displays aggregated action items with priority ordering
 * and route markers (or explicit no-route indicators when unroutable).
 *
 * Consumes `actionCentreService` to assemble user action lists across projects.
 * Every interactive control is keyboard-reachable with visible focus indicators
 * and accessible names (R5.2, R5.4, R5.7, R5.8, 10.3).
 */

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, AlertCircle, ChevronRight } from 'lucide-react';
import type { ActionItem } from '@/services/orchestration/orchestrationTypes';
import type { AuthorizationContext } from '@/services/orchestration/orchestrationTypes';
import type { ProjectStateView } from '@/services/orchestration/orchestrationTypes';
import { buildActionCentre, hasOutstandingActions, NO_OUTSTANDING_ACTIONS_MESSAGE } from '@/services/orchestration/actionCentreService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface ActionCentrePanelProps {
  /** Authorization context (tenantId, userId, role, now). */
  ctx: AuthorizationContext;
  /** Reconciled project states for all active projects. */
  projects: ProjectStateView[];
  /** Optional callback when an action item is clicked (for route navigation). */
  onActionClick?: (item: ActionItem) => void;
  /** Optional compact mode (show first N items). */
  compact?: boolean;
}

/** Priority ordering for visual emphasis. */
const PRIORITY_COLOR: Record<string, string> = {
  Critical: 'bg-destructive/10 text-destructive border-destructive/30',
  High: 'bg-amber-50 text-amber-800 border-amber-200',
  Medium: 'bg-blue-50 text-blue-800 border-blue-200',
  Low: 'bg-secondary text-muted-foreground border-border',
};

const PRIORITY_BADGE: Record<string, string> = {
  Critical: 'bg-destructive text-destructive-foreground',
  High: 'bg-amber-600 text-white',
  Medium: 'bg-blue-600 text-white',
  Low: 'bg-secondary text-secondary-foreground',
};

export function ActionCentrePanel({ ctx, projects, onActionClick, compact = false }: ActionCentrePanelProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Aggregate and order action items across all projects (R5.2, R5.3)
  useEffect(() => {
    setLoading(true);
    try {
      const actionItems = buildActionCentre(ctx, projects);
      setItems(compact ? actionItems.slice(0, 5) : actionItems);
    } finally {
      setLoading(false);
    }
  }, [ctx, projects, compact]);

  const hasActions = hasOutstandingActions(items);

  const handleClick = (item: ActionItem) => {
    if (onActionClick) {
      onActionClick(item);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, item: ActionItem) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick(item);
    }
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading">
          <AlertCircle className="text-primary" size={20} />
          <span>Action Centre</span>
        </CardTitle>
        {hasActions && (
          <Badge className={PRIORITY_BADGE['High']} aria-label={`${items.length} outstanding action${items.length !== 1 ? 's' : ''}`}>
            {items.length}
          </Badge>
        )}
      </CardHeader>

      <CardContent
        className="flex-1 p-6 space-y-3 overflow-y-auto"
        role="region"
        aria-label="Outstanding actions"
        aria-live="polite"
      >
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Loading actions…</p>
          </div>
        ) : !hasActions ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium">{NO_OUTSTANDING_ACTIONS_MESSAGE}</p>
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.event.id}
              onClick={() => handleClick(item)}
              onKeyDown={(e) => handleKeyDown(e, item)}
              className={`w-full text-left rounded-2xl border p-4 space-y-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary hover:border-primary ${PRIORITY_COLOR[item.priority]}`}
              aria-label={`${item.event.title}. Priority: ${item.priority}. ${item.hasResolvableRoute ? `Press Enter to open ${item.targetRoute}` : 'No direct action route available.'}`}
              tabIndex={0}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="font-semibold text-sm">{item.event.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.event.detail}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className={PRIORITY_BADGE[item.priority]}>
                    {item.priority}
                  </Badge>
                  {item.hasResolvableRoute ? (
                    <ChevronRight className="text-muted-foreground" size={16} aria-hidden="true" />
                  ) : (
                    <AlertCircle className="text-muted-foreground" size={16} aria-label="No direct action route" />
                  )}
                </div>
              </div>

              {!item.hasResolvableRoute && (
                <p className="text-xs text-muted-foreground italic">
                  No direct action route available. Review project details for next steps.
                </p>
              )}

              {item.dueDate && (
                <p className="text-xs text-muted-foreground">
                  Due: {new Date(item.dueDate).toLocaleDateString('en-ZA', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              )}
            </button>
          ))
        )}
      </CardContent>

      {hasActions && compact && (
        <div className="border-t border-border p-4 bg-secondary/5">
          <Button
            variant="outline"
            className="w-full rounded-xl gap-2"
            onClick={() => onActionClick && onActionClick(items[0])}
            aria-label="View all outstanding actions"
          >
            View All Actions
            <ArrowRight size={14} />
          </Button>
        </div>
      )}
    </Card>
  );
}
