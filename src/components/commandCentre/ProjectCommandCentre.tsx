'use client';

import { useState, useCallback, useRef, useEffect, lazy, Suspense, type ReactNode, type ComponentType, type LazyExoticComponent } from 'react';
import type { UserProfile } from '@/types';
import type { CommandCentreView, ComplexityMode } from '@/services/commandCentre/types';
import { getViewsForRole, getDefaultComplexityMode } from '@/services/commandCentre/roleViewMatrix';
import { pushCommandCentreState } from '@/navigation/commandCentreUrlUtils';
import CommandCentreSidebar from '@/components/commandCentre/CommandCentreSidebar';
import CommandCentreHeader from '@/components/commandCentre/CommandCentreHeader';

// ── Lazy Load Utility ────────────────────────────────────────────────────────

type LazyImport<T extends ComponentType<any>> = () => Promise<{ default: T }>;

function lazyWithChunkRetry<T extends ComponentType<any>>(importer: LazyImport<T>): LazyExoticComponent<T> {
  return lazy(() =>
    importer().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const isDynamic = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i.test(message);
      if (isDynamic && typeof window !== 'undefined') {
        const reloadKey = 'architex:cc-chunk-reload';
        if (window.sessionStorage.getItem(reloadKey) !== 'true') {
          window.sessionStorage.setItem(reloadKey, 'true');
          window.location.reload();
          return new Promise<never>(() => undefined);
        }
      }
      throw error;
    }),
  );
}

// ── Lazy-loaded Subsystem Views (code-split per view) ────────────────────────

const DashboardView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/DashboardView'));
const TaskBoardView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/TaskBoardView'));
const BudgetView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/BudgetView'));
const ProgrammeView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/ProgrammeView'));
const MilestoneView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/MilestoneView'));
const CalendarView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/CalendarView'));
const RiskView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/RiskView'));
const QualityView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/QualityView'));
const TeamView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/TeamView'));
const SiteDiaryView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/SiteDiaryView'));
const RFIView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/RFIView'));
const ValuationView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/ValuationView'));
const ProcurementView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/ProcurementView'));
const ContractView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/ContractView'));
const AIAdvisorView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/AIAdvisorView'));
const AnalyticsView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/AnalyticsView'));
const ActionCentreView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/ActionCentreView'));
const DocumentView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/DocumentView'));
const SettingsView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/SettingsView'));
const PassportView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/PassportView'));
const FormSystemView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/FormSystemView'));
const AuditTrailView = lazyWithChunkRetry(() => import('@/components/commandCentre/views/AuditTrailView'));
const MobileDecisionInbox = lazyWithChunkRetry(() => import('@/components/commandCentre/views/MobileDecisionInbox'));

// ── View State Manager ───────────────────────────────────────────────────────

/** Loading skeleton shown while lazy-loaded views are fetched. */
function ViewLoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 6 }}>
      {/* Hero skeleton */}
      <div style={{ height: 80, borderRadius: 16, background: 'rgba(16,32,51,.04)' }} />
      {/* Stat row skeleton */}
      <div style={{ display: 'flex', gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="stat-card" style={{ flex: 1, height: 60, background: 'rgba(16,32,51,.03)' }} />
        ))}
      </div>
      {/* Panel skeleton */}
      <div style={{ height: 200, borderRadius: 22, background: 'rgba(16,32,51,.03)' }} />
    </div>
  );
}

// ── Prefetch Map ─────────────────────────────────────────────────────────────

const VIEW_IMPORTERS: Partial<Record<CommandCentreView, () => Promise<unknown>>> = {
  dashboard: () => import('@/components/commandCentre/views/DashboardView'),
  tasks: () => import('@/components/commandCentre/views/TaskBoardView'),
  budget: () => import('@/components/commandCentre/views/BudgetView'),
  programme: () => import('@/components/commandCentre/views/ProgrammeView'),
  milestones: () => import('@/components/commandCentre/views/MilestoneView'),
  calendar: () => import('@/components/commandCentre/views/CalendarView'),
  quality: () => import('@/components/commandCentre/views/QualityView'),
  team: () => import('@/components/commandCentre/views/TeamView'),
  'site-diary': () => import('@/components/commandCentre/views/SiteDiaryView'),
  rfis: () => import('@/components/commandCentre/views/RFIView'),
  valuations: () => import('@/components/commandCentre/views/ValuationView'),
  procurement: () => import('@/components/commandCentre/views/ProcurementView'),
  contracts: () => import('@/components/commandCentre/views/ContractView'),
  'ai-advisor': () => import('@/components/commandCentre/views/AIAdvisorView'),
  analytics: () => import('@/components/commandCentre/views/AnalyticsView'),
  actions: () => import('@/components/commandCentre/views/ActionCentreView'),
  documents: () => import('@/components/commandCentre/views/DocumentView'),
  settings: () => import('@/components/commandCentre/views/SettingsView'),
  passport: () => import('@/components/commandCentre/views/PassportView'),
  'form-system': () => import('@/components/commandCentre/views/FormSystemView'),
  'audit-trail': () => import('@/components/commandCentre/views/AuditTrailView'),
};

/**
 * Per-view state preserved across subsystem transitions.
 * Stored in a ref-backed Map keyed by viewId for the browser session.
 */
export interface ViewState {
  scrollTop: number;
  filters: Record<string, unknown>;
  sortSelections: Record<string, unknown>;
}

/**
 * Custom hook that manages per-view state preservation across transitions.
 * Uses a useRef-backed Map keyed by viewId — state persists for the browser session
 * without triggering re-renders on every scroll position capture.
 */
export function useViewStateManager() {
  const stateMap = useRef<Map<CommandCentreView, ViewState>>(new Map());

  /** Save the current scroll position and filter state for a view */
  const saveViewState = useCallback(
    (viewId: CommandCentreView, scrollContainer: HTMLElement | null, filters?: Record<string, unknown>, sortSelections?: Record<string, unknown>) => {
      const scrollTop = scrollContainer?.scrollTop ?? 0;
      const existing = stateMap.current.get(viewId);
      stateMap.current.set(viewId, {
        scrollTop,
        filters: filters ?? existing?.filters ?? {},
        sortSelections: sortSelections ?? existing?.sortSelections ?? {},
      });
    },
    [],
  );

  /** Retrieve previously saved state for a view (returns undefined if never visited) */
  const getViewState = useCallback((viewId: CommandCentreView): ViewState | undefined => {
    return stateMap.current.get(viewId);
  }, []);

  /** Update only filter/sort state without touching scroll position */
  const updateFilters = useCallback(
    (viewId: CommandCentreView, filters: Record<string, unknown>, sortSelections?: Record<string, unknown>) => {
      const existing = stateMap.current.get(viewId);
      stateMap.current.set(viewId, {
        scrollTop: existing?.scrollTop ?? 0,
        filters,
        sortSelections: sortSelections ?? existing?.sortSelections ?? {},
      });
    },
    [],
  );

  return { saveViewState, getViewState, updateFilters };
}

// ── View Error Boundary ──────────────────────────────────────────────────────

interface ViewErrorFallbackProps {
  viewId: CommandCentreView;
  error: Error | null;
  onRetry: () => void;
}

function ViewErrorFallback({ viewId, error, onRetry }: ViewErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
      <div className="text-center space-y-2">
        <p className="text-sm font-medium text-red-400">
          Failed to load view: {viewId}
        </p>
        {error && (
          <p className="text-xs text-muted-foreground max-w-md">
            {error.message}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium rounded-md bg-primary-600/20 text-primary-400 hover:bg-primary-600/30 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ── Props ────────────────────────────────────────────────────────────────────

interface ProjectCommandCentreProps {
  user: UserProfile;
  projectId: string;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ProjectCommandCentre({ user, projectId }: ProjectCommandCentreProps) {
  const [activeView, setActiveView] = useState<CommandCentreView>('dashboard');
  const [complexityMode, setComplexityMode] = useState<ComplexityMode>(() =>
    getDefaultComplexityMode(5_000_000),
  );
  const [viewError, setViewError] = useState<{ viewId: CommandCentreView; error: Error } | null>(null);

  // Ref for the scroll container (main content area)
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // View state manager for preserving scroll/filter state across transitions
  const { saveViewState, getViewState } = useViewStateManager();

  const allowedViews = getViewsForRole(user.role, complexityMode);

  // ── Browser back/forward navigation handler ──────────────────────────────

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { projectId?: string; viewId?: CommandCentreView } | null;
      if (state?.viewId && allowedViews.includes(state.viewId)) {
        // Save current view state before navigating back/forward
        saveViewState(activeView, scrollContainerRef.current);
        setActiveView(state.viewId);
        setViewError(null);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [activeView, allowedViews, saveViewState]);

  // ── Restore scroll position when active view changes ─────────────────────

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Restore scroll position from saved state (use requestAnimationFrame to ensure DOM is painted)
    const savedState = getViewState(activeView);
    if (savedState) {
      requestAnimationFrame(() => {
        container.scrollTop = savedState.scrollTop;
      });
    } else {
      // New view — scroll to top
      container.scrollTop = 0;
    }
  }, [activeView, getViewState]);

  // ── Navigate to a new view with state preservation ───────────────────────

  const handleNavigate = useCallback(
    (view: CommandCentreView) => {
      if (!allowedViews.includes(view)) return;
      if (view === activeView) return;

      // Save current view's scroll position and state before leaving
      saveViewState(activeView, scrollContainerRef.current);

      // Clear any previous error state
      setViewError(null);

      // Update the active view (React state — no page reload)
      setActiveView(view);

      // Push new URL state via history.pushState (no reload)
      pushCommandCentreState(projectId, view);
    },
    [activeView, allowedViews, projectId, saveViewState],
  );

  // ── Prefetch recently visited views ──────────────────────────────────────

  const recentViewsRef = useRef<CommandCentreView[]>([]);

  useEffect(() => {
    // Track the 2 most recently visited views (excluding current)
    const recents = recentViewsRef.current;
    if (!recents.includes(activeView)) {
      recents.unshift(activeView);
      if (recents.length > 3) recents.pop();
    }

    // Prefetch the 2 most recent views (not the current one)
    const toPrefetch = recents.filter((v) => v !== activeView).slice(0, 2);
    for (const viewId of toPrefetch) {
      const importer = VIEW_IMPORTERS[viewId];
      if (importer) {
        importer().catch(() => {});
      }
    }
  }, [activeView]);

  // ── View load error handler ──────────────────────────────────────────────

  const handleViewError = useCallback(
    (error: Error) => {
      setViewError({ viewId: activeView, error });
    },
    [activeView],
  );

  const handleRetry = useCallback(() => {
    setViewError(null);
  }, []);

  // ── Render the active subsystem view ─────────────────────────────────────

  const renderActiveView = (): ReactNode => {
    // If there's an error for the current view, show the error fallback
    if (viewError && viewError.viewId === activeView) {
      return (
        <ViewErrorFallback
          viewId={activeView}
          error={viewError.error}
          onRetry={handleRetry}
        />
      );
    }

    try {
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
        case 'passport':
          return <PassportView projectId={projectId} />;
        case 'form-system':
          return <FormSystemView projectId={projectId} />;
        case 'audit-trail':
          return <AuditTrailView projectId={projectId} />;
        case 'notifications':
          return <ActionCentreView projectId={projectId} />;
        case 'issues':
          return <RiskView projectId={projectId} />;
        default:
          return <DashboardView projectId={projectId} />;
      }
    } catch (err) {
      // Handle synchronous render errors (e.g., lazy import failures)
      const error = err instanceof Error ? err : new Error('Unknown view load error');
      // Use setTimeout to avoid setState during render
      setTimeout(() => handleViewError(error), 0);
      return null;
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
        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto p-6"
        >
          <Suspense fallback={<ViewLoadingSkeleton />}>
            {renderActiveView()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
