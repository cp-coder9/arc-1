'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Filter, AlertTriangle } from 'lucide-react';
import type { TaskBoardItem } from '@/services/commandCentre/types';
import { LinkChip } from '@/components/commandCentre/LinkChip';

interface TaskBoardViewProps {
  projectId: string;
}

type ColumnStatus = TaskBoardItem['status'];

const COLUMNS: Array<{ status: ColumnStatus; label: string }> = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'in_review', label: 'In Review' },
  { status: 'done', label: 'Done' },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/50',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/50',
  medium: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  low: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
};

export default function TaskBoardView({ projectId }: TaskBoardViewProps) {
  const [tasks, setTasks] = useState<TaskBoardItem[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    void projectId;
  }, [projectId]);

  const getTasksForColumn = (status: ColumnStatus) =>
    tasks.filter((t) => t.status === status);

  const isOverdue = (task: TaskBoardItem) => {
    const today = new Date().toISOString().slice(0, 10);
    return task.dueDate < today && task.status !== 'done';
  };

  return (
    <div className="space-y-4">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Task Board</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </Button>
          <Button size="sm" className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            New Task
          </Button>
        </div>
      </div>

      {/* Filter panel placeholder */}
      {showFilters && (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Assignee:</span>
                <span className="text-foreground">All</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Priority:</span>
                <span className="text-foreground">All</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Due date:</span>
                <span className="text-foreground">Any</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => {
          const columnTasks = getTasksForColumn(col.status);
          return (
            <div key={col.status} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {col.label}
                </h3>
                <Badge variant="outline" className="text-xs">{columnTasks.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[200px] rounded-lg border border-dashed border-surface-700/50 p-2">
                {columnTasks.map((task) => (
                  <Card key={task.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                    <CardContent className="p-3">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium leading-tight">{task.title}</p>
                          {isOverdue(task) && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{task.assigneeName}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority] ?? ''}`}
                          >
                            {task.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">Due: {task.dueDate}</p>
                        {task.linkedActivityId && (
                          <LinkChip
                            link={{
                              linkedEntityId: task.linkedActivityId,
                              linkedEntityType: 'programme',
                              label: task.linkedActivityName ?? `Activity ${task.linkedActivityId.slice(0, 8)}`,
                            }}
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {columnTasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-8">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
