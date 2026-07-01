'use client';

import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import type { CommandCentreView, ComplexityMode } from '@/services/commandCentre/types';
import { getViewsForRole } from '@/services/commandCentre/roleViewMatrix';
import {
  LayoutDashboard,
  CheckSquare,
  Target,
  Calendar,
  GanttChart,
  Users,
  BookOpen,
  MessageSquare,
  AlertTriangle,
  Shield,
  DollarSign,
  Receipt,
  ShoppingCart,
  FileText,
  BarChart3,
  BrainCircuit,
  FolderOpen,
  Settings,
  Bell,
  Inbox,
} from 'lucide-react';

interface CommandCentreSidebarProps {
  activeView: CommandCentreView;
  onNavigate: (view: CommandCentreView) => void;
  complexityMode: ComplexityMode;
  userRole: UserRole;
}

interface NavSection {
  label: string;
  items: Array<{
    view: CommandCentreView;
    label: string;
    icon: ComponentType<{ className?: string }>;
  }>;
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Command',
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { view: 'actions', label: 'Action Centre', icon: Inbox },
      { view: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Planning',
    items: [
      { view: 'programme', label: 'Programme', icon: GanttChart },
      { view: 'tasks', label: 'Tasks', icon: CheckSquare },
      { view: 'milestones', label: 'Milestones', icon: Target },
      { view: 'calendar', label: 'Calendar', icon: Calendar },
    ],
  },
  {
    label: 'Execution',
    items: [
      { view: 'team', label: 'Team', icon: Users },
      { view: 'site-diary', label: 'Site Diary', icon: BookOpen },
      { view: 'rfis', label: 'RFIs', icon: MessageSquare },
      { view: 'issues', label: 'Issues', icon: AlertTriangle },
      { view: 'quality', label: 'Quality', icon: Shield },
    ],
  },
  {
    label: 'Commercial',
    items: [
      { view: 'budget', label: 'Budget', icon: DollarSign },
      { view: 'valuations', label: 'Valuations', icon: Receipt },
      { view: 'procurement', label: 'Procurement', icon: ShoppingCart },
      { view: 'contracts', label: 'Contracts', icon: FileText },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { view: 'analytics', label: 'Analytics', icon: BarChart3 },
      { view: 'ai-advisor', label: 'AI Advisor', icon: BrainCircuit },
      { view: 'documents', label: 'Documents', icon: FolderOpen },
      { view: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export default function CommandCentreSidebar({
  activeView,
  onNavigate,
  complexityMode,
  userRole,
}: CommandCentreSidebarProps) {
  const allowedViews = getViewsForRole(userRole, complexityMode);

  return (
    <aside className="w-56 shrink-0 border-r border-surface-700/50 bg-surface-800/70 backdrop-blur overflow-y-auto">
      <nav className="p-3 space-y-4">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = section.items.filter((item) => allowedViews.includes(item.view));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.label}>
              <h3 className="px-2 mb-1 text-xs uppercase tracking-wider text-muted-foreground font-medium">
                {section.label}
              </h3>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeView === item.view;

                  return (
                    <li key={item.view}>
                      <button
                        type="button"
                        onClick={() => onNavigate(item.view)}
                        className={cn(
                          'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-primary-600/20 text-primary-400'
                            : 'text-muted-foreground hover:bg-surface-700/50 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
