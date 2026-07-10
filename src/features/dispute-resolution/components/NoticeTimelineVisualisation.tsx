/**
 * Notice Timeline Visualisation
 *
 * Timeline showing causative event date, notification deadline,
 * particulars deadline, and current position. Horizontal timeline with markers.
 *
 * Requirements: 6.6
 */

import React from 'react';
import { Calendar, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { FormalClaim, NoticeDeadline } from '../types';

export interface NoticeTimelineVisualisationProps {
  claims: FormalClaim[];
  deadlines: NoticeDeadline[];
}

interface TimelineMarker {
  date: string;
  label: string;
  type: 'event' | 'deadline' | 'current';
  isOverdue: boolean;
  daysRemaining?: number;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function getDeadlineMarkers(claim: FormalClaim, deadlines: NoticeDeadline[]): TimelineMarker[] {
  const markers: TimelineMarker[] = [];
  const claimDeadlines = deadlines.filter((d) => d.claimId === claim.id);

  // Causative event
  markers.push({
    date: claim.causativeEventDate,
    label: 'Causative Event',
    type: 'event',
    isOverdue: false,
  });

  // Notification date
  markers.push({
    date: claim.notificationDate,
    label: 'Notification',
    type: 'event',
    isOverdue: false,
  });

  // Deadlines from the system
  for (const deadline of claimDeadlines) {
    markers.push({
      date: deadline.dueDate,
      label: deadline.deadlineType.replace(/_/g, ' '),
      type: 'deadline',
      isOverdue: deadline.isOverdue,
      daysRemaining: deadline.daysRemaining,
    });
  }

  // Current position
  markers.push({
    date: new Date().toISOString().split('T')[0],
    label: 'Today',
    type: 'current',
    isOverdue: false,
  });

  // Sort by date
  markers.sort((a, b) => a.date.localeCompare(b.date));
  return markers;
}

function MarkerIcon({ marker }: { marker: TimelineMarker }) {
  if (marker.type === 'current') {
    return <Clock className="h-4 w-4 text-blue-400" aria-hidden="true" />;
  }
  if (marker.isOverdue) {
    return <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />;
  }
  if (marker.type === 'event') {
    return <CheckCircle className="h-4 w-4 text-green-400" aria-hidden="true" />;
  }
  return <Calendar className="h-4 w-4 text-amber-400" aria-hidden="true" />;
}

export function NoticeTimelineVisualisation({ claims, deadlines }: NoticeTimelineVisualisationProps) {
  // Find overdue or approaching deadlines
  const urgentDeadlines = deadlines.filter((d) => d.isOverdue || d.daysRemaining <= 14);

  return (
    <div className="space-y-6 pt-4">
      {/* Urgent deadlines summary */}
      {urgentDeadlines.length > 0 && (
        <Card className="bg-red-950/20 border-red-700/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />
              <CardTitle className="text-sm text-red-200">
                Urgent Deadlines ({urgentDeadlines.length})
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {urgentDeadlines.map((dl) => {
                const claim = claims.find((c) => c.id === dl.claimId);
                return (
                  <div key={`${dl.claimId}-${dl.deadlineType}`} className="flex items-center justify-between text-sm">
                    <span className="text-red-200">
                      {claim?.referenceNumber ?? dl.claimId} — {dl.deadlineType.replace(/_/g, ' ')}
                    </span>
                    <Badge
                      className={
                        dl.isOverdue
                          ? 'bg-red-950/40 text-red-300 border-red-700/50'
                          : 'bg-amber-950/40 text-amber-300 border-amber-700/50'
                      }
                    >
                      {dl.isOverdue ? `${Math.abs(dl.daysRemaining)}d overdue` : `${dl.daysRemaining}d remaining`}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline per claim */}
      {claims.length === 0 ? (
        <Card className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-500 text-center">No claims to display timeline for.</p>
          </CardContent>
        </Card>
      ) : (
        claims.map((claim) => {
          const markers = getDeadlineMarkers(claim, deadlines);
          return (
            <Card key={claim.id} className="bg-slate-800/60 border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-sm text-slate-200">
                  {claim.referenceNumber} — {claim.briefDescription}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Horizontal timeline */}
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute top-4 left-0 right-0 h-0.5 bg-slate-700" aria-hidden="true" />

                  {/* Markers */}
                  <div className="relative flex justify-between items-start min-w-0">
                    {markers.map((marker, idx) => (
                      <div
                        key={`${marker.date}-${idx}`}
                        className="flex flex-col items-center gap-1 min-w-[60px]"
                      >
                        <div
                          className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border ${
                            marker.type === 'current'
                              ? 'bg-blue-950/60 border-blue-500'
                              : marker.isOverdue
                              ? 'bg-red-950/60 border-red-500'
                              : marker.type === 'event'
                              ? 'bg-green-950/40 border-green-700/50'
                              : 'bg-amber-950/40 border-amber-700/50'
                          }`}
                        >
                          <MarkerIcon marker={marker} />
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 text-center">
                          {marker.label}
                        </span>
                        <span className="text-[10px] text-slate-500">{formatDate(marker.date)}</span>
                        {marker.daysRemaining !== undefined && (
                          <span
                            className={`text-[10px] font-medium ${
                              marker.isOverdue ? 'text-red-400' : 'text-amber-400'
                            }`}
                          >
                            {marker.isOverdue ? 'OVERDUE' : `${marker.daysRemaining}d left`}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
