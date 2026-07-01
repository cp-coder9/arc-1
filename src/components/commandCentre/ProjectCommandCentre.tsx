'use client';

import { useState, useCallback } from 'react';
import type { UserProfile } from '@/types';
import type { CommandCentreView, ComplexityMode } from '@/services/commandCentre/types';
import { getViewsForRole, getDefaultComplexityMode } from '@/services/commandCentre/roleViewMatrix';
import CommandCentreSidebar from '@/components/commandCentre/CommandCentreSidebar';
import CommandCentreHeader from '@/components/commandCentre/CommandCentreHeader';
import DashboardView from '@/components/commandCentre/views/DashboardView';
import TaskBoardView from '@/components/commandCentre/views/TaskBoardView';
import BudgetView from '@/components/commandCentre/views/BudgetView';
import ProgrammeView from '@/components/commandCentre/views/ProgrammeView';
import MilestoneView from '@/components/commandCentre/views/MilestoneView';
import CalendarView from '@/components/commandCentre/views/CalendarView';
import RiskView from '@/components/commandCentre/views/RiskView';
import QualityView from '@/components/commandCentre/views/QualityView';
import TeamView from '@/components/commandCentre/views/TeamView';
import SiteDiaryView from '@/components/commandCentre/views/SiteDiaryView';
import RFIView from '@/components/commandCentre/views/RFIView';
import ValuationView from '@/components/commandCentre/views/ValuationView';
import ProcurementView from '@/components/commandCentre/views/ProcurementView';
import ContractView from '@/components/commandCentre/views/ContractView';
import AIAdvisorView from '@/components/commandCentre/views/AIAdvisorView';
import AnalyticsView from '@/components/commandCentre/views/AnalyticsView';
import ActionCentreView from '@/components/commandCentre/views/ActionCentreView';
import DocumentView from '@/components/commandCentre/views/DocumentView';
import SettingsView from '@/components/commandCentre/views/SettingsView';

interface ProjectCommandCentreProps {
  user: UserProfile;
  projectId: string;
}

export default function ProjectCommandCentre({ user, projectId }: ProjectCommandCentreProps) {
  const [activeView, setActiveView] = useState<CommandCentreView>('dashboard');
  const [complexityMode, setComplexityMode] = useState<ComplexityMode>(() =>
    getDefaultComplexityMode(5_000_000),
  );

  const allowedViews = getViewsForRole(user.role, complexityMode);

  const handleNavigate = useCallback((view: CommandCentreView) => {
    if (allowedViews.includes(view)) {
      setActiveView(view);
    }
  }, [allowedViews]);

  const renderActiveView = () => {
    switch (activeView) {
      case 'dashboard':
        return <DashboardView projectId={projectId} />;
      case 'tasks':
        return <TaskBoardView projectId={projectId} />;
      case 'budget':
        return <BudgetView projectId={projectId} />;
      case 'programme':
        return <ProgrammeView projectId={projectId} />;
      case 'milestones':
        return <MilestoneView projectId={projectId} />;
      case 'calendar':
        return <CalendarView projectId={projectId} />;
      case 'rfis':
        return <RFIView projectId={projectId} />;
      case 'quality':
        return <QualityView projectId={projectId} />;
      case 'team':
        return <TeamView projectId={projectId} />;
      case 'site-diary':
        return <SiteDiaryView projectId={projectId} />;
      case 'valuations':
        return <ValuationView projectId={projectId} />;
      case 'procurement':
        return <ProcurementView projectId={projectId} />;
      case 'contracts':
        return <ContractView projectId={projectId} />;
      case 'analytics':
        return <AnalyticsView projectId={projectId} />;
      case 'ai-advisor':
        return <AIAdvisorView projectId={projectId} />;
      case 'actions':
        return <ActionCentreView projectId={projectId} />;
      case 'documents':
        return <DocumentView projectId={projectId} />;
      case 'settings':
        return <SettingsView projectId={projectId} complexityMode={complexityMode} onComplexityChange={setComplexityMode} />;
      case 'notifications':
        return <ActionCentreView projectId={projectId} />;
      case 'issues':
        return <RiskView projectId={projectId} />;
      default:
        return <DashboardView projectId={projectId} />;
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <CommandCentreSidebar
        activeView={activeView}
        onNavigate={handleNavigate}
        complexityMode={complexityMode}
        userRole={user.role}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <CommandCentreHeader
          activeView={activeView}
          projectId={projectId}
        />
        <main className="flex-1 overflow-y-auto p-6">
          {renderActiveView()}
        </main>
      </div>
    </div>
  );
}
