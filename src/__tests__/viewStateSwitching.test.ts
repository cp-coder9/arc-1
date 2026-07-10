/**
 * View State Switching — Unit Tests
 *
 * Validates: Requirements 6.1, 6.2, 6.6
 *
 * - Client-side view switching preserves scroll position per view
 * - Active filter/sort state is preserved across transitions
 * - Returning to a previously visited view restores prior state
 * - View state manager stores/retrieves state keyed by viewId
 */

import { describe, test, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useViewStateManager } from '@/components/commandCentre/ProjectCommandCentre';
import type { CommandCentreView } from '@/services/commandCentre/types';

describe('useViewStateManager', () => {
  test('returns undefined for a view that has never been visited', () => {
    const { result } = renderHook(() => useViewStateManager());
    const state = result.current.getViewState('tasks');
    expect(state).toBeUndefined();
  });

  test('saves and retrieves scroll position for a view', () => {
    const { result } = renderHook(() => useViewStateManager());

    // Simulate a scroll container with scrollTop = 150
    const mockContainer = { scrollTop: 150 } as HTMLElement;

    act(() => {
      result.current.saveViewState('tasks', mockContainer);
    });

    const state = result.current.getViewState('tasks');
    expect(state).toBeDefined();
    expect(state!.scrollTop).toBe(150);
  });

  test('saves and retrieves filter state for a view', () => {
    const { result } = renderHook(() => useViewStateManager());

    const mockContainer = { scrollTop: 0 } as HTMLElement;
    const filters = { status: 'active', priority: 'high' };
    const sortSelections = { column: 'dueDate', direction: 'asc' };

    act(() => {
      result.current.saveViewState('budget', mockContainer, filters, sortSelections);
    });

    const state = result.current.getViewState('budget');
    expect(state).toBeDefined();
    expect(state!.filters).toEqual(filters);
    expect(state!.sortSelections).toEqual(sortSelections);
  });

  test('preserves state independently per view', () => {
    const { result } = renderHook(() => useViewStateManager());

    // Save state for tasks view
    act(() => {
      result.current.saveViewState(
        'tasks',
        { scrollTop: 200 } as HTMLElement,
        { status: 'in_progress' },
      );
    });

    // Save state for budget view
    act(() => {
      result.current.saveViewState(
        'budget',
        { scrollTop: 500 } as HTMLElement,
        { category: 'labour' },
      );
    });

    // Each view retains its own state
    const tasksState = result.current.getViewState('tasks');
    const budgetState = result.current.getViewState('budget');

    expect(tasksState!.scrollTop).toBe(200);
    expect(tasksState!.filters).toEqual({ status: 'in_progress' });

    expect(budgetState!.scrollTop).toBe(500);
    expect(budgetState!.filters).toEqual({ category: 'labour' });
  });

  test('restores prior state when returning to a previously visited view', () => {
    const { result } = renderHook(() => useViewStateManager());

    // Visit tasks view, set scroll and filters
    act(() => {
      result.current.saveViewState(
        'tasks',
        { scrollTop: 320 } as HTMLElement,
        { assignee: 'user-1' },
        { column: 'priority', direction: 'desc' },
      );
    });

    // Visit budget view (simulates navigation away)
    act(() => {
      result.current.saveViewState(
        'budget',
        { scrollTop: 100 } as HTMLElement,
      );
    });

    // Return to tasks — state should still be preserved
    const tasksState = result.current.getViewState('tasks');
    expect(tasksState!.scrollTop).toBe(320);
    expect(tasksState!.filters).toEqual({ assignee: 'user-1' });
    expect(tasksState!.sortSelections).toEqual({ column: 'priority', direction: 'desc' });
  });

  test('updates filters without resetting scroll position', () => {
    const { result } = renderHook(() => useViewStateManager());

    // Save initial state with scroll position
    act(() => {
      result.current.saveViewState(
        'quality',
        { scrollTop: 400 } as HTMLElement,
        { severity: 'critical' },
      );
    });

    // Update filters only
    act(() => {
      result.current.updateFilters('quality', { severity: 'all' });
    });

    const state = result.current.getViewState('quality');
    expect(state!.scrollTop).toBe(400); // scroll preserved
    expect(state!.filters).toEqual({ severity: 'all' }); // filter updated
  });

  test('handles null scroll container gracefully', () => {
    const { result } = renderHook(() => useViewStateManager());

    act(() => {
      result.current.saveViewState('dashboard', null, { timeRange: '7d' });
    });

    const state = result.current.getViewState('dashboard');
    expect(state!.scrollTop).toBe(0);
    expect(state!.filters).toEqual({ timeRange: '7d' });
  });

  test('overwrites previous state when saving new state for same view', () => {
    const { result } = renderHook(() => useViewStateManager());

    act(() => {
      result.current.saveViewState(
        'programme',
        { scrollTop: 100 } as HTMLElement,
        { view: 'gantt' },
      );
    });

    act(() => {
      result.current.saveViewState(
        'programme',
        { scrollTop: 600 } as HTMLElement,
        { view: 'timeline' },
      );
    });

    const state = result.current.getViewState('programme');
    expect(state!.scrollTop).toBe(600);
    expect(state!.filters).toEqual({ view: 'timeline' });
  });

  test('supports all registered CommandCentreView types', () => {
    const { result } = renderHook(() => useViewStateManager());

    const views: CommandCentreView[] = [
      'dashboard', 'programme', 'tasks', 'milestones', 'calendar',
      'team', 'site-diary', 'rfis', 'issues', 'quality',
      'budget', 'valuations', 'procurement', 'contracts',
      'analytics', 'ai-advisor', 'documents', 'settings',
      'actions', 'notifications', 'passport', 'form-system', 'audit-trail',
    ];

    // Save state for every view
    views.forEach((view, index) => {
      act(() => {
        result.current.saveViewState(
          view,
          { scrollTop: index * 100 } as HTMLElement,
          { index },
        );
      });
    });

    // Verify all are retrievable
    views.forEach((view, index) => {
      const state = result.current.getViewState(view);
      expect(state).toBeDefined();
      expect(state!.scrollTop).toBe(index * 100);
      expect(state!.filters).toEqual({ index });
    });
  });
});
