'use client';

import type { ComponentType } from 'react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Cloud, Sun, CloudRain, Wind } from 'lucide-react';
import { useDemoMode } from '@/demo-context/DemoModeProvider';

interface SiteDiaryViewProps {
  projectId: string;
}

interface DiaryEntry {
  id: string;
  date: string;
  weather: 'sunny' | 'cloudy' | 'rainy' | 'windy';
  workforceCount: number;
  workCompleted: string;
  issues: string;
  author: string;
}

const WEATHER_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  windy: Wind,
};

export default function SiteDiaryView({ projectId }: SiteDiaryViewProps) {
  const { isDemoMode } = useDemoMode();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);

  if (!isDemoMode) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <p className="text-lg text-muted-foreground">No live data connected yet</p>
        <p className="text-sm text-muted-foreground mt-2">
          Data integration pending for project {projectId}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Site Diary</h2>
        <Button size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          New Entry
        </Button>
      </div>

      {/* Entry List */}
      {entries.length === 0 ? (
        <Card className="bg-surface-800/70 backdrop-blur border-surface-700/50">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground text-center py-8">
              No diary entries yet. Create your first daily log.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => {
            const WeatherIcon = WEATHER_ICONS[entry.weather] ?? Cloud;
            return (
              <Card key={entry.id} className="bg-surface-800/70 backdrop-blur border-surface-700/50">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString('en-ZA', { weekday: 'short' })}</p>
                        <p className="text-lg font-bold">{new Date(entry.date).getDate()}</p>
                        <p className="text-xs text-muted-foreground">{new Date(entry.date).toLocaleDateString('en-ZA', { month: 'short' })}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <WeatherIcon className="h-4 w-4 text-primary-400" />
                          <Badge variant="outline" className="text-xs">{entry.workforceCount} workers</Badge>
                        </div>
                        <p className="text-sm">{entry.workCompleted}</p>
                        {entry.issues && (
                          <p className="text-xs text-amber-400">Issues: {entry.issues}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{entry.author}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
