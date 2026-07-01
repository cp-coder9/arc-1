'use client';

import { Badge } from '@/components/ui/badge';
import type { CommandCentreView } from '@/services/commandCentre/types';
import { Compass, Link2, FileSearch } from 'lucide-react';

interface CommandCentreHeaderProps {
  activeView: CommandCentreView;
  projectId: string;
}

const VIEW_LABELS: Record<CommandCentreView, string> = {
  dashboard: 'Dashboard',
  programme: 'Programme',
  tasks: 'Task Board',
  milestones: 'Milestones',
  calendar: 'Calendar',
  team: 'Team',
  'site-diary': 'Site Diary',
  rfis: 'RFIs & Instructions',
  issues: 'Issues',
  quality: 'Quality Tracker',
  budget: 'Budget Controller',
  valuations: 'Valuations',
  procurement: 'Procurement',
  contracts: 'Contracts',
  analytics: 'Analytics & KPIs',
  'ai-advisor': 'AI Advisor',
  documents: 'Documents',
  settings: 'Settings',
  actions: 'Action Centre',
  notifications: 'Notifications',
};

export default function CommandCentreHeader({ activeView, projectId }: CommandCentreHeaderProps) {
  const viewLabel = VIEW_LABELS[activeView] ?? 'Command Centre';

  return (
    <header className="shrink-0 border-b border-surface-700/50 bg-surface-800/70 backdrop-blur px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <nav className="text-sm text-muted-foreground">
            <span>Command Centre</span>
            <span className="mx-2">/</span>
            <span className="text-foreground font-medium">{viewLabel}</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1 text-xs">
            <Compass className="h-3 w-3" />
            Synced with Project Passport
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <Link2 className="h-3 w-3" />
            SpecForge Active
          </Badge>
          <Badge variant="outline" className="gap-1 text-xs">
            <FileSearch className="h-3 w-3" />
            Document Intelligence
          </Badge>
        </div>
      </div>
    </header>
  );
}
