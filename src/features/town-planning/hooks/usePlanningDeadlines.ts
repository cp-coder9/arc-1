/**
 * usePlanningDeadlines — Custom hook for fetching approaching and overdue
 * deadlines. Polls at 5-minute intervals. Provides alert count for badge display.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Deadline } from '../types';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface DeadlineState {
  approaching: Deadline[];
  overdue: Deadline[];
  alertCount: number;
  loading: boolean;
  error: string | null;
}

export function usePlanningDeadlines(userId: string) {
  const [state, setState] = useState<DeadlineState>({
    approaching: [],
    overdue: [],
    alertCount: 0,
    loading: true,
    error: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDeadlines = useCallback(async () => {
    try {
      const [approachingRes, overdueRes] = await Promise.all([
        fetch(`/api/planning/deadlines/approaching?userId=${userId}`),
        fetch(`/api/planning/deadlines/overdue?userId=${userId}`),
      ]);

      const approaching = approachingRes.ok ? (await approachingRes.json()).deadlines ?? [] : [];
      const overdue = overdueRes.ok ? (await overdueRes.json()).deadlines ?? [] : [];

      setState({
        approaching,
        overdue,
        alertCount: approaching.length + overdue.length,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }));
    }
  }, [userId]);

  useEffect(() => {
    fetchDeadlines();
    intervalRef.current = setInterval(fetchDeadlines, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchDeadlines]);

  return { ...state, refetch: fetchDeadlines };
}
