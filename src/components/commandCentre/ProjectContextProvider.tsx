'use client';

import React, { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import type { UserRole } from '@/types';
import type { ComplexityMode, CommandCentreView } from '@/services/commandCentre/types';

// ── Project Phase ────────────────────────────────────────────────────────────

export type ProjectPhase =
  | 'onboarding'
  | 'feasibility'
  | 'appointment'
  | 'concept_design'
  | 'design_development'
  | 'municipal_submission'
  | 'tender_procurement'
  | 'construction_execution'
  | 'closeout';

// ── Project Context Interface ────────────────────────────────────────────────

export interface ProjectContext {
  projectId: string;
  projectName: string;
  lifecyclePhase: ProjectPhase;
  contractValue: number;
  complexityMode: ComplexityMode;
  userRole: UserRole;
  activeFilters: Record<string, unknown>;
}

// ── Context Value (what consumers receive) ───────────────────────────────────

interface ProjectContextValue {
  /** Current project context — null when no project is active */
  context: ProjectContext | null;
  /** Active subsystem view */
  activeView: CommandCentreView;
  /** Update project context (e.g., on project switch) */
  setProjectContext: (ctx: ProjectContext) => void;
  /** Switch to a different project without page reload */
  switchProject: (projectId: string, projectName: string, lifecyclePhase: ProjectPhase, contractValue: number) => void;
  /** Update active filters */
  setActiveFilters: (filters: Record<string, unknown>) => void;
  /** Navigate to a different subsystem view (client-side, no page reload) */
  navigateToView: (view: CommandCentreView) => void;
}

// ── React Context ────────────────────────────────────────────────────────────

const ProjectCtx = createContext<ProjectContextValue>({
  context: null,
  activeView: 'dashboard',
  setProjectContext: () => {},
  switchProject: () => {},
  setActiveFilters: () => {},
  navigateToView: () => {},
});

// ── Custom Hook ──────────────────────────────────────────────────────────────

/**
 * Access the active project context from any component within the Command Centre.
 * Must be used within a `<ProjectContextProvider>`.
 */
export function useProjectContext(): ProjectContextValue {
  const value = useContext(ProjectCtx);
  return value;
}

// ── Provider Props ───────────────────────────────────────────────────────────

interface ProjectContextProviderProps {
  children: ReactNode;
  /** Initial project context (restored from URL or project selection) */
  initialContext?: ProjectContext;
  /** Initial active view (restored from URL) */
  initialView?: CommandCentreView;
  /** Callback when view changes (for parent components to sync) */
  onViewChange?: (view: CommandCentreView) => void;
  /** Callback when project switches (for parent components to sync) */
  onProjectSwitch?: (projectId: string) => void;
}

// ── Provider Component ───────────────────────────────────────────────────────

/**
 * ProjectContextProvider wraps all Command Centre views, providing:
 * - Consistent project state (ID, name, phase, contract value, user role)
 * - Context persistence across subsystem view transitions
 * - Project switching via URL update (history.pushState) without page reload
 *
 * This context does NOT reset when the user navigates between views —
 * the project state is preserved until the user explicitly switches projects.
 */
export function ProjectContextProvider({
  children,
  initialContext,
  initialView = 'dashboard',
  onViewChange,
  onProjectSwitch,
}: ProjectContextProviderProps) {
  const [context, setContext] = useState<ProjectContext | null>(initialContext ?? null);
  const [activeView, setActiveView] = useState<CommandCentreView>(initialView);

  // Track the context ref to avoid stale closures in callbacks
  const contextRef = useRef(context);
  contextRef.current = context;

  // ── Set full project context ───────────────────────────────────────────────

  const setProjectContext = useCallback((ctx: ProjectContext) => {
    setContext(ctx);
  }, []);

  // ── Switch project (update URL without page reload) ────────────────────────

  const switchProject = useCallback(
    (projectId: string, projectName: string, lifecyclePhase: ProjectPhase, contractValue: number) => {
      const currentCtx = contextRef.current;
      if (!currentCtx) return;

      const newContext: ProjectContext = {
        ...currentCtx,
        projectId,
        projectName,
        lifecyclePhase,
        contractValue,
      };

      setContext(newContext);

      // Update URL without page reload — preserve current view
      const newUrl = `/command-centre/${projectId}/${activeView}`;
      window.history.pushState({ projectId, viewId: activeView }, '', newUrl);

      onProjectSwitch?.(projectId);
    },
    [activeView, onProjectSwitch],
  );

  // ── Update active filters ──────────────────────────────────────────────────

  const setActiveFilters = useCallback((filters: Record<string, unknown>) => {
    setContext((prev) => {
      if (!prev) return prev;
      return { ...prev, activeFilters: filters };
    });
  }, []);

  // ── Navigate to view (client-side, no reload) ──────────────────────────────

  const navigateToView = useCallback(
    (view: CommandCentreView) => {
      setActiveView(view);

      // Update URL via history.pushState — no page reload
      const projectId = contextRef.current?.projectId;
      if (projectId) {
        const newUrl = `/command-centre/${projectId}/${view}`;
        window.history.pushState({ projectId, viewId: view }, '', newUrl);
      }

      onViewChange?.(view);
    },
    [onViewChange],
  );

  // ── Context value (stable references via useCallback) ──────────────────────

  const value: ProjectContextValue = {
    context,
    activeView,
    setProjectContext,
    switchProject,
    setActiveFilters,
    navigateToView,
  };

  return <ProjectCtx.Provider value={value}>{children}</ProjectCtx.Provider>;
}

export default ProjectContextProvider;
