/**
 * Unified Programme View — displays programme tasks with start/finish dates,
 * dependencies, responsible roles, and overdue indicators.
 *
 * Consumes `programmeService` to render the shared timeline that all roles view.
 * Every interactive control is keyboard-reachable with visible focus indicators
 * and accessible names (R4.2, R4.3, R4.4, R4.8, 10.3).
 */

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { ArchitexRole, ProgrammeTask, UnifiedProgramme } from '@/services/orchestration/orchestrationTypes';
import { visibleTasks, overdueEvents, recomputeSchedule } from '@/services/orchestration/programmeService';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface UnifiedProgrammeViewProps {
  /** The unified programme for a project. */
  programme: UnifiedProgramme;
  /** The current user's role (determines task visibility). */
  userRole: ArchitexRole;
  /** ISO date string for overdue evaluation. */
  currentDate: string;
  /** Optional compact mode (show first N tasks). */
  compact?: boolean;
}

/** Status display configuration. */
const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  not_started: {
    icon: <Clock size={14} />,
    color: 'bg-secondary text-secondary-foreground',
    label: 'Not Started',
  },
  in_progress: {
    icon: <ChevronDown size={14} />,
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    label: 'In Progress',
  },
  complete: {
    icon: <CheckCircle2 size={14} />,
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    label: 'Complete',
  },
};

interface TaskRowProps {
  task: ProgrammeTask;
  isOverdue: boolean;
  isExpanded: boolean;
  onToggleExpand: (id: string) => void;
}

const TaskRow: React.FC<TaskRowProps> = ({ task, isOverdue, isExpanded, onToggleExpand }) => {
  const status = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started;
  const hasDependencies = task.dependsOn.length > 0;

  const startDate = new Date(task.startDate).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const finishDate = new Date(task.finishDate).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="border border-border rounded-2xl p-4 space-y-3 hover:border-primary transition-colors">
      <div className="flex items-start gap-3">
        {/* Expand button for dependency details */}
        {hasDependencies && (
          <button
            onClick={() => onToggleExpand(task.id)}
            className="flex-shrink-0 mt-1 p-1 rounded-lg hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            aria-expanded={isExpanded}
            aria-controls={`task-deps-${task.id}`}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} dependencies for ${task.title}`}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        )}

        {/* Task details */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-sm truncate">{task.title}</h3>
            {isOverdue && task.status !== 'complete' && (
              <Badge className="bg-destructive/10 text-destructive border-destructive/30 flex items-center gap-1">
                <AlertTriangle size={12} />
                Overdue
              </Badge>
            )}
            <Badge variant="outline" className={status.color}>
              <span className="inline-flex items-center gap-1.5">
                {status.icon}
                {status.label}
              </span>
            </Badge>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground mb-2">
            <div>
              <span className="font-medium">Start:</span> {startDate}
            </div>
            <div>
              <span className="font-medium">Finish:</span> {finishDate}
            </div>
            <div>
              <span className="font-medium">Responsible:</span> {task.responsibleRole}
            </div>
          </div>
        </div>
      </div>

      {/* Dependencies section (expandable) */}
      {hasDependencies && isExpanded && (
        <div
          id={`task-deps-${task.id}`}
          className="pl-10 pt-2 border-t border-border space-y-1"
          role="region"
          aria-label={`Dependencies for ${task.title}`}
        >
          <p className="text-xs font-medium text-muted-foreground">Depends on {task.dependsOn.length} task{task.dependsOn.length !== 1 ? 's' : ''}:</p>
          <ul className="space-y-1 text-xs text-muted-foreground list-disc list-inside">
            {task.dependsOn.map((depId) => (
              <li key={depId}>{depId}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export function UnifiedProgrammeView({
  programme,
  userRole,
  currentDate,
  compact = false,
}: UnifiedProgrammeViewProps) {
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Compute visible tasks for the user's role (R4.3)
  const visibleTaskList = useMemo(() => visibleTasks(programme, userRole), [programme, userRole]);

  // Compute overdue tasks (R4.8)
  const overdueTaskIds = useMemo(() => {
    const events = overdueEvents(currentDate, programme);
    return new Set(events.map((e) => e.id.replace('task_overdue:', '')));
  }, [programme, currentDate]);

  // Apply compact limit
  const displayedTasks = useMemo(() => {
    return compact ? visibleTaskList.slice(0, 5) : visibleTaskList;
  }, [visibleTaskList, compact]);

  const handleToggleExpand = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  return (
    <Card className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading">
          <Clock className="text-primary" size={20} />
          <span>Unified Programme</span>
        </CardTitle>
        {visibleTaskList.length > 0 && (
          <Badge className="bg-primary text-primary-foreground" aria-label={`${visibleTaskList.length} task${visibleTaskList.length !== 1 ? 's' : ''}`}>
            {visibleTaskList.length}
          </Badge>
        )}
      </CardHeader>

      <CardContent
        className="flex-1 p-6 space-y-3 overflow-y-auto"
        role="region"
        aria-label="Project programme tasks"
        aria-live="polite"
      >
        {displayedTasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm font-medium">No tasks visible for your role.</p>
          </div>
        ) : (
          displayedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isOverdue={overdueTaskIds.has(task.id)}
              isExpanded={expandedTasks.has(task.id)}
              onToggleExpand={handleToggleExpand}
            />
          ))
        )}
      </CardContent>

      {compact && visibleTaskList.length > 5 && (
        <div className="border-t border-border p-4 bg-secondary/5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Showing 5 of {visibleTaskList.length} tasks
          </span>
          {/* Link to full programme view could go here */}
        </div>
      )}
    </Card>
  );
}
