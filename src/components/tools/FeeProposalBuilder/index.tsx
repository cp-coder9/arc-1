// FeeProposalBuilder — Professional Fee Proposal Builder workspace
//
// Multi-profession fee calculator and proposal generation tool.
// Renders inside the Architex OS shell, receives `user` prop for role-based behaviour.
// Integrates with Project Passport, Action Centre, Appointment, and SpecForge.
// Responsive: two-column → single-column at 900px. SpecForge aesthetic.
//
// Requirements: 10.1, 10.2, 10.3, 12.1, 12.2, 12.4, 12.5, 4.6

import React, { Suspense, lazy } from 'react';
import type { UserProfile } from '@/types';
import { FeeProposalBuilderProvider, useFeeProposalBuilder } from './FeeProposalBuilderContext';
import ProfessionSidebar from './ProfessionSidebar';

// Lazy-loaded views to reduce initial bundle
const ArchitectCalculator = lazy(() => import('./calculators/ArchitectCalculator'));
const EngineerCalculator = lazy(() => import('./calculators/EngineerCalculator'));
const FireEngineerCalculator = lazy(() => import('./calculators/FireEngineerCalculator'));
const QuantitySurveyorCalc = lazy(() => import('./calculators/QuantitySurveyorCalc'));
const TownPlannerCalculator = lazy(() => import('./calculators/TownPlannerCalculator'));
const LandSurveyorCalculator = lazy(() => import('./calculators/LandSurveyorCalculator'));
const InteriorDesignerCalc = lazy(() => import('./calculators/InteriorDesignerCalc'));
const CPMCalculator = lazy(() => import('./calculators/CPMCalculator'));
const LandscapeArchCalc = lazy(() => import('./calculators/LandscapeArchCalc'));
const ProposalBuilderView = lazy(() => import('./proposal/ProposalBuilderView'));
const TermsLibraryView = lazy(() => import('./terms/TermsLibraryView'));
const RunHistoryView = lazy(() => import('./history/RunHistoryView'));
const ClientEstimationView = lazy(() => import('./client/ClientEstimationView'));

export interface FeeProposalBuilderProps {
  user: UserProfile;
  projectId?: string;
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-400 border-t-transparent" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calculator Resolver
// ---------------------------------------------------------------------------

function CalculatorWorkspace() {
  const { activeProfession } = useFeeProposalBuilder();

  switch (activeProfession) {
    case 'architect':
      return <ArchitectCalculator />;
    case 'civilEngineer':
    case 'structuralEngineer':
    case 'electricalEngineer':
    case 'mechanicalEngineer':
      return <EngineerCalculator discipline={activeProfession} />;
    case 'fireEngineer':
      return <FireEngineerCalculator />;
    case 'quantitySurveyor':
      return <QuantitySurveyorCalc />;
    case 'townPlanner':
      return <TownPlannerCalculator />;
    case 'landSurveyor':
      return <LandSurveyorCalculator />;
    case 'interiorDesigner':
      return <InteriorDesignerCalc />;
    case 'constructionProjectManager':
      return <CPMCalculator />;
    case 'landscapeArchitect':
      return <LandscapeArchCalc />;
    default:
      return <ArchitectCalculator />;
  }
}

// ---------------------------------------------------------------------------
// View Router
// ---------------------------------------------------------------------------

function ActiveView() {
  const { activeView } = useFeeProposalBuilder();

  return (
    <Suspense fallback={<LoadingFallback />}>
      {activeView === 'calculator' && <CalculatorWorkspace />}
      {activeView === 'proposal' && <ProposalBuilderView />}
      {activeView === 'terms' && <TermsLibraryView />}
      {activeView === 'history' && <RunHistoryView />}
      {activeView === 'client' && <ClientEstimationView />}
    </Suspense>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function FeeProposalBuilder({ user, projectId }: FeeProposalBuilderProps) {
  return (
    <FeeProposalBuilderProvider user={user}>
      <div className="flex h-full w-full bg-surface-950 text-surface-100">
        {/* Sidebar — responsive: hidden below 900px, icon-only handled by ProfessionSidebar */}
        <div className="hidden min-[900px]:flex flex-col w-64 border-r border-surface-700/50 bg-surface-900/70 backdrop-blur shrink-0">
          <div className="p-4 border-b border-surface-700/50">
            <h2 className="text-lg font-bold tracking-tight">Fee Proposal Builder</h2>
            {projectId && (
              <p className="text-xs text-surface-400 mt-1">Project linked</p>
            )}
          </div>
          <ProfessionSidebar />
        </div>

        {/* Main content area — responsive single column below 900px */}
        <main className="flex-1 overflow-y-auto p-4 min-[900px]:p-6">
          <div className="max-w-5xl mx-auto">
            <ActiveView />
          </div>
        </main>
      </div>
    </FeeProposalBuilderProvider>
  );
}
