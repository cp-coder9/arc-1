'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '@/services/commandCentre/types';

interface CalendarViewProps {
  projectId: string;
}

type ViewMode = 'month' | 'week' | 'day';

const EVENT_TYPE_COLORS: Record<string, string> = {
  milestone: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  inspection: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  delivery: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  meeting: 'bg-green-500/20 text-green-400 border-green-500/50',
  task_due: 'bg-red-500/20 text-red-400 border-red-500/50',
};

export default function CalendarView({ projectId }: CalendarViewProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    void projectId;
  }, [projectId]);

  const monthLabel = currentDate.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });

  const navigateDate = (direction: number) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'month') newDate.setMonth(newDate.getMonth() + direction);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + direction * 7);
    else newDate.setDate(newDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Calendar</h2>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-surface-700/50 overflow-hidden">
            {(['month', 'week', 'day'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-primary-600/20 text-primary-400'
                    : 'text-muted-foreground hover:bg-surface-700/50'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <Button size="sm" variant="ghost" onClick={() => navigateDate(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <CardTitle className="text-sm font-medium">{monthLabel}</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigateDate(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground opacity-40 mb-3" />
              <p className="text-sm text-muted-foreground">No events scheduled</p>
              <p className="text-xs text-muted-foreground mt-1">Events from milestones, inspections, and tasks will appear here</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {events.map((event) => (
                <li key={event.id} className="flex items-center gap-3 p-2 rounded bg-surface-700/30">
                  <div className="w-20 shrink-0 text-xs text-muted-foreground">{event.date}</div>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${EVENT_TYPE_COLORS[event.type] ?? ''}`}>
                    {event.type.replace(/_/g, ' ')}
                  </Badge>
                  <p className="text-sm font-medium flex-1 truncate">{event.title}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
