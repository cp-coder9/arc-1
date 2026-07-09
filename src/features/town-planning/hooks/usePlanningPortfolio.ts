/**
 * usePlanningPortfolio — Custom hook for fetching and managing the town planner's
 * portfolio-level state. Provides dashboard metrics, filter/sort state, and
 * application list management.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PlanningApplication, Deadline, Objection, Hearing } from '../types';
import type { DashboardMetrics } from '../services/planningReportingService';

interface PortfolioState {
  applications: PlanningApplication[];
  deadlines: Deadline[];
  objections: Objection[];
  hearings: Hearing[];
  metrics: DashboardMetrics | null;
  loading: boolean;
  error: string | null;
  filter: 'all' | 'active' | 'draft' | 'approved' | 'at_risk';
}

export function usePlanningPortfolio(userId: string, projectId?: string) {
  const [state, setState] = useState<PortfolioState>({
    applications: [],
    deadlines: [],
    objections: [],
    hearings: [],
    metrics: null,
    loading: true,
    error: null,
    filter: 'all',
  });

  const fetchPortfolio = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const params = projectId ? `?projectId=${projectId}` : `?townPlannerId=${userId}`;
      const res = await fetch(`/api/planning/applications${params}`);
      if (!res.ok) throw new Error('Failed to fetch applications');
      const data = await res.json();
      setState((s) => ({
        ...s,
        applications: data.applications ?? [],
        loading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [userId, projectId]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const setFilter = (filter: PortfolioState['filter']) => {
    setState((s) => ({ ...s, filter }));
  };

  const filteredApplications = state.applications.filter((app) => {
    if (state.filter === 'all') return true;
    if (state.filter === 'active') return app.status === 'active';
    if (state.filter === 'draft') return app.status === 'draft';
    if (state.filter === 'approved') return app.status === 'approved';
    return true;
  });

  return {
    ...state,
    filteredApplications,
    setFilter,
    refetch: fetchPortfolio,
  };
}
