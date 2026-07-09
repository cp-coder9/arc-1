/**
 * ProjectContextProvider — Unit Tests
 *
 * Validates: Requirements 1.5, 6.2, 7.7, 8.5
 *
 * - Context persists across subsystem view transitions
 * - Project switching updates URL without page reload
 * - useProjectContext hook returns correct context values
 * - navigateToView updates URL via history.pushState
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { ProjectContextProvider, useProjectContext, type ProjectContext } from '@/components/commandCentre/ProjectContextProvider';

// ── Mock window.history.pushState ────────────────────────────────────────────

const pushStateSpy = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  pushStateSpy.mockReset();
  Object.defineProperty(window, 'history', {
    writable: true,
    value: { ...window.history, pushState: pushStateSpy },
  });
});

// ── Test Helper: Renders a consumer that displays context state ───────────────

function ContextConsumer() {
  const { context, activeView, navigateToView, switchProject, setActiveFilters } = useProjectContext();

  return (
    <div>
      <span data-testid="project-id">{context?.projectId ?? 'none'}</span>
      <span data-testid="project-name">{context?.projectName ?? 'none'}</span>
      <span data-testid="lifecycle-phase">{context?.lifecyclePhase ?? 'none'}</span>
      <span data-testid="contract-value">{context?.contractValue ?? 0}</span>
      <span data-testid="complexity-mode">{context?.complexityMode ?? 'none'}</span>
      <span data-testid="user-role">{context?.userRole ?? 'none'}</span>
      <span data-testid="active-view">{activeView}</span>
      <button data-testid="navigate-budget" onClick={() => navigateToView('budget')}>
        Go Budget
      </button>
      <button data-testid="navigate-tasks" onClick={() => navigateToView('tasks')}>
        Go Tasks
      </button>
      <button
        data-testid="switch-project"
        onClick={() => switchProject('proj-456', 'New Project', 'construction_execution', 15_000_000)}
      >
        Switch
      </button>
      <button
        data-testid="set-filters"
        onClick={() => setActiveFilters({ status: 'active', category: 'quality' })}
      >
        Filter
      </button>
    </div>
  );
}

// ── Test Fixtures ────────────────────────────────────────────────────────────

const mockContext: ProjectContext = {
  projectId: 'proj-123',
  projectName: 'Test Project',
  lifecyclePhase: 'concept_design',
  contractValue: 8_000_000,
  complexityMode: 'full',
  userRole: 'architect',
  activeFilters: {},
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ProjectContextProvider', () => {
  test('provides initial context to consumers', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    expect(screen.getByTestId('project-id').textContent).toBe('proj-123');
    expect(screen.getByTestId('project-name').textContent).toBe('Test Project');
    expect(screen.getByTestId('lifecycle-phase').textContent).toBe('concept_design');
    expect(screen.getByTestId('contract-value').textContent).toBe('8000000');
    expect(screen.getByTestId('complexity-mode').textContent).toBe('full');
    expect(screen.getByTestId('user-role').textContent).toBe('architect');
    expect(screen.getByTestId('active-view').textContent).toBe('dashboard');
  });

  test('context persists when navigating to a different view', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    // Navigate to budget
    act(() => {
      screen.getByTestId('navigate-budget').click();
    });

    // Active view changed
    expect(screen.getByTestId('active-view').textContent).toBe('budget');

    // Project context remains unchanged
    expect(screen.getByTestId('project-id').textContent).toBe('proj-123');
    expect(screen.getByTestId('project-name').textContent).toBe('Test Project');
    expect(screen.getByTestId('lifecycle-phase').textContent).toBe('concept_design');
    expect(screen.getByTestId('user-role').textContent).toBe('architect');
  });

  test('navigateToView updates URL via history.pushState without page reload', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    act(() => {
      screen.getByTestId('navigate-budget').click();
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      { projectId: 'proj-123', viewId: 'budget' },
      '',
      '/command-centre/proj-123/budget',
    );
  });

  test('switchProject updates context and URL without page reload', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    act(() => {
      screen.getByTestId('switch-project').click();
    });

    // Context is updated to new project
    expect(screen.getByTestId('project-id').textContent).toBe('proj-456');
    expect(screen.getByTestId('project-name').textContent).toBe('New Project');
    expect(screen.getByTestId('lifecycle-phase').textContent).toBe('construction_execution');
    expect(screen.getByTestId('contract-value').textContent).toBe('15000000');

    // URL updated with new project, maintaining current view
    expect(pushStateSpy).toHaveBeenCalledWith(
      { projectId: 'proj-456', viewId: 'dashboard' },
      '',
      '/command-centre/proj-456/dashboard',
    );
  });

  test('switchProject preserves user role and complexity mode', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    act(() => {
      screen.getByTestId('switch-project').click();
    });

    // Role and complexity mode preserved from original context
    expect(screen.getByTestId('user-role').textContent).toBe('architect');
    expect(screen.getByTestId('complexity-mode').textContent).toBe('full');
  });

  test('setActiveFilters updates filters without resetting other context', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    act(() => {
      screen.getByTestId('set-filters').click();
    });

    // Context still intact
    expect(screen.getByTestId('project-id').textContent).toBe('proj-123');
    expect(screen.getByTestId('project-name').textContent).toBe('Test Project');
  });

  test('context persists through multiple view transitions', () => {
    render(
      <ProjectContextProvider initialContext={mockContext} initialView="dashboard">
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    // Navigate dashboard → budget → tasks
    act(() => {
      screen.getByTestId('navigate-budget').click();
    });
    act(() => {
      screen.getByTestId('navigate-tasks').click();
    });

    // Project context unchanged after two transitions
    expect(screen.getByTestId('project-id').textContent).toBe('proj-123');
    expect(screen.getByTestId('project-name').textContent).toBe('Test Project');
    expect(screen.getByTestId('lifecycle-phase').textContent).toBe('concept_design');
    expect(screen.getByTestId('active-view').textContent).toBe('tasks');

    // history.pushState called for each transition
    expect(pushStateSpy).toHaveBeenCalledTimes(2);
  });

  test('calls onViewChange callback when navigating views', () => {
    const onViewChange = vi.fn();

    render(
      <ProjectContextProvider
        initialContext={mockContext}
        initialView="dashboard"
        onViewChange={onViewChange}
      >
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    act(() => {
      screen.getByTestId('navigate-budget').click();
    });

    expect(onViewChange).toHaveBeenCalledWith('budget');
  });

  test('calls onProjectSwitch callback when switching projects', () => {
    const onProjectSwitch = vi.fn();

    render(
      <ProjectContextProvider
        initialContext={mockContext}
        initialView="dashboard"
        onProjectSwitch={onProjectSwitch}
      >
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    act(() => {
      screen.getByTestId('switch-project').click();
    });

    expect(onProjectSwitch).toHaveBeenCalledWith('proj-456');
  });

  test('returns null context when no initial context is provided', () => {
    render(
      <ProjectContextProvider>
        <ContextConsumer />
      </ProjectContextProvider>,
    );

    expect(screen.getByTestId('project-id').textContent).toBe('none');
    expect(screen.getByTestId('project-name').textContent).toBe('none');
  });
});
