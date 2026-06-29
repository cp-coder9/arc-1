/**
 * OrchestrationProvider — React Context provider for orchestration services.
 *
 * Wraps the App or a feature boundary with orchestration service context so that
 * role dashboards, navigation, and workflow components can consume the unified
 * project state without prop-drilling.
 *
 * Validates: Requirements 1.1, 1.3, 2.6, 5.4
 */

import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { UserProfile, Project } from '@/types';
import {
  AuthorizationContext,
  ProjectStateView,
  ActionItem,
  GuidanceResult,
  ProgrammeTask,
  UnifiedProgramme,
} from '../orchestrationTypes';
import { ProjectStateService } from '../projectStateService';
import { useOrchestrationServices } from '../hooks/useOrchestrationServices';

interface OrchestrationContextValue {
  /** Authorization context (tenantId, userId, role, now). */
  ctx: AuthorizationContext | null;
  /** Loaded project states (reconciled source of truth). */
  projectStates: Map<string, ProjectStateView>;
  /** Loading indicator. */
  loading: boolean;
  /** Error message if any load failed. */
  error: string | null;
  /** Action items aggregated and ordered across all projects. */
  actionItems: ActionItem[];
  /** AI guidance result. */
  guidance: GuidanceResult | null;
  /** Unified programme for a specific project. */
  programme: (projectId: string) => UnifiedProgramme | null;
  /** Programme tasks visible to the user's role. */
  visibleProgrammeTasks: (projectId: string) => ProgrammeTask[];
  /** Function to reload project state manually. */
  reloadProjectState: (projectId: string) => Promise<void>;
  /** Underlying project state service instance. */
  stateService: ProjectStateService | null;
}

const OrchestrationContext = createContext<OrchestrationContextValue | undefined>(undefined);

export interface OrchestrationProviderProps {
  /** User profile. */
  user: UserProfile;
  /** Active projects. */
  projects: Project[];
  /** Optional: Firestore/API repository. */
  repository?: any;
  /** Child components. */
  children: ReactNode;
}

/**
 * Provider component for orchestration services.
 * Wrap your app or feature boundary with this to enable orchestration service access throughout.
 */
export function OrchestrationProvider({
  user,
  projects,
  repository,
  children,
}: OrchestrationProviderProps) {
  const orchestration = useOrchestrationServices({ user, projects, repository });

  const value: OrchestrationContextValue = useMemo(
    () => ({
      ctx: orchestration.ctx,
      projectStates: orchestration.projectStates,
      loading: orchestration.loading,
      error: orchestration.error,
      actionItems: orchestration.actionItems,
      guidance: orchestration.guidance,
      programme: orchestration.programme,
      visibleProgrammeTasks: orchestration.visibleProgrammeTasks,
      reloadProjectState: orchestration.reloadProjectState,
      stateService: orchestration.stateService,
    }),
    [orchestration],
  );

  return (
    <OrchestrationContext.Provider value={value}>
      {children}
    </OrchestrationContext.Provider>
  );
}

/**
 * Hook to consume the orchestration context.
 * Use this in any dashboard, tool, or workflow component to access the unified project state.
 */
export function useOrchestration(): OrchestrationContextValue {
  const context = useContext(OrchestrationContext);
  if (!context) {
    throw new Error(
      'useOrchestration must be used within an OrchestrationProvider. ' +
      'Wrap your app or component tree with <OrchestrationProvider> first.',
    );
  }
  return context;
}
