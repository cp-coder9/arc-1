/**
 * useOrchestrationServices — Custom React hook that provides orchestration service access
 * to role dashboards and components.
 *
 * This hook encapsulates authorization context setup, project state loading, and error handling
 * so that dashboards don't need to manage these details individually.
 *
 * Validates: Requirements 1.1, 1.3, 2.6, 5.4
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { UserProfile, UserRole, Project } from '@/types';
import {
  AuthorizationContext,
  ProjectStateView,
  ActionItem,
  GuidanceResult,
  ProgrammeTask,
  UnifiedProgramme,
  ArchitexRole,
} from '../orchestrationTypes';
import { createProjectStateService, ProjectStateService } from '../projectStateService';
import { buildActionCentre } from '../actionCentreService';
import { generateGuidance } from '../aiGuidanceService';
import { visibleTasks, defaultProgrammeStore } from '../programmeService';

interface UseOrchestrationServicesOptions {
  /** User profile for authorization context. */
  user: UserProfile;
  /** Active projects to load state for. */
  projects: Project[];
  /** Optional: Firestore/API repository (defaults to in-memory for demo). */
  repository?: any;
}

/**
 * Maps an app-layer `UserRole` to the orchestration-layer `ArchitexRole`.
 * The orchestration tier uses a narrower role set; UI roles that don't have a
 * direct mapping are mapped to the closest equivalent (PR #114 review comment 2).
 */
function mapUserRoleToArchitexRole(role: UserRole): ArchitexRole {
  const mapping: Record<UserRole, ArchitexRole> = {
    client: 'client_developer',
    developer: 'client_developer',
    architect: 'architect',
    engineer: 'engineer',
    quantity_surveyor: 'quantity_surveyor',
    town_planner: 'candidate_professional',
    energy_professional: 'candidate_professional',
    fire_engineer: 'engineer',
    site_manager: 'site_manager',
    contractor: 'contractor',
    subcontractor: 'contractor',
    supplier: 'supplier',
    freelancer: 'candidate_professional',
    bep: 'architect',
    firm_admin: 'admin',
    platform_admin: 'platform_admin',
    admin: 'admin',
    land_surveyor: 'candidate_professional',
    cpm: 'site_manager',
  };
  return mapping[role] ?? 'candidate_professional';
}

interface UseOrchestrationServicesResult {
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
  /** AI guidance result for current project (if available). */
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

/**
 * Custom hook providing orchestration service integration.
 * Manages authorization, project state loading, action aggregation, and guidance generation.
 */
export function useOrchestrationServices(
  options: UseOrchestrationServicesOptions,
): UseOrchestrationServicesResult {
  const { user, projects, repository } = options;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectStates, setProjectStates] = useState<Map<string, ProjectStateView>>(new Map());
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [guidance, setGuidance] = useState<GuidanceResult | null>(null);
  const [stateService, setStateService] = useState<ProjectStateService | null>(null);

  // Build authorization context
  const ctx: AuthorizationContext | null = useMemo(
    () =>
      user
        ? {
            tenantId: user.primaryFirmId || 'default-tenant',
            userId: user.uid,
            role: mapUserRoleToArchitexRole(user.role),
            now: new Date().toISOString(),
          }
        : null,
    [user],
  );

  // Initialize project state service
  useEffect(() => {
    if (!ctx || !projects) return;

    try {
      const service = createProjectStateService({
        repository,
      });
      setStateService(service);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize orchestration service';
      setError(message);
    }
  }, [ctx, projects, repository]);

  // Load project states for all active projects
  useEffect(() => {
    if (!ctx || !stateService || projects.length === 0) {
      setLoading(false);
      return;
    }

    const loadProjectStates = async () => {
      setLoading(true);
      setError(null);
      const states = new Map<string, ProjectStateView>();

      try {
        for (const project of projects) {
          try {
            const state = await stateService.loadProjectState(ctx, project.id);
            states.set(project.id, state);
          } catch (err) {
            console.warn(`Failed to load state for project ${project.id}:`, err);
            // Continue loading other projects on failure
          }
        }

        setProjectStates(states);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load project states';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    loadProjectStates();
  }, [ctx, stateService, projects]);

  // Aggregate action items across all projects (R5.2, R5.3)
  useEffect(() => {
    if (!ctx || projectStates.size === 0) {
      setActionItems([]);
      return;
    }

    try {
      const items = buildActionCentre(ctx, Array.from(projectStates.values()));
      setActionItems(items);
    } catch (err) {
      console.warn('Failed to build action centre:', err);
      setActionItems([]);
    }
  }, [ctx, projectStates]);

  // Generate AI guidance for the first/primary project (R6.1, R6.10)
  useEffect(() => {
    if (!ctx || projectStates.size === 0) {
      setGuidance(null);
      return;
    }

    const generateGuidanceAsync = async () => {
      try {
        const firstProject = Array.from(projectStates.values())[0] as ProjectStateView | undefined;
        if (!firstProject) return;

        const result = await generateGuidance({
          ctx,
          surface: 'dashboard',
          passport: firstProject.passport,
        });
        setGuidance(result);
      } catch (err) {
        console.warn('Failed to generate AI guidance:', err);
        setGuidance({ recommendations: [], status: 'unavailable' });
      }
    };

    generateGuidanceAsync();
  }, [ctx, projectStates]);

  // Get unified programme for a specific project
  const programme = useCallback(
    (projectId: string): UnifiedProgramme | null => {
      const state = projectStates.get(projectId);
      if (!state) return null;
      // In real usage, fetch from programme service
      // For now, return a placeholder
      return null;
    },
    [projectStates],
  );

  // Get programme tasks visible to the user's role
  const visibleProgrammeTasks = useCallback(
    (projectId: string): ProgrammeTask[] => {
      const prog = programme(projectId);
      if (!prog || !ctx) return [];
      return visibleTasks(prog, ctx.role);
    },
    [programme, ctx],
  );

  // Manual reload function
  const reloadProjectState = useCallback(
    async (projectId: string) => {
      if (!ctx || !stateService) return;

      try {
        const state = await stateService.loadProjectState(ctx, projectId);
        const newStates = new Map(projectStates);
        newStates.set(projectId, state);
        setProjectStates(newStates);
      } catch (err) {
        console.error(`Failed to reload state for project ${projectId}:`, err);
      }
    },
    [ctx, stateService, projectStates],
  );

  return {
    ctx,
    projectStates,
    loading,
    error,
    actionItems,
    guidance,
    programme,
    visibleProgrammeTasks,
    reloadProjectState,
    stateService,
  };
}
