/**
 * usePlanningApplication — Custom hook for fetching and managing a single
 * planning application's state including deadlines, conditions, and objections.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PlanningApplication, Deadline, Condition, Objection } from '../types';

interface ApplicationState {
  application: PlanningApplication | null;
  deadlines: Deadline[];
  conditions: Condition[];
  objections: Objection[];
  loading: boolean;
  error: string | null;
}

export function usePlanningApplication(applicationId: string | null) {
  const [state, setState] = useState<ApplicationState>({
    application: null,
    deadlines: [],
    conditions: [],
    objections: [],
    loading: !!applicationId,
    error: null,
  });

  const fetchApplication = useCallback(async () => {
    if (!applicationId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(`/api/planning/applications/${applicationId}`);
      if (!res.ok) throw new Error('Failed to fetch application');
      const data = await res.json();
      setState((s) => ({
        ...s,
        application: data.application ?? data,
        loading: false,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [applicationId]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  return {
    ...state,
    refetch: fetchApplication,
  };
}
