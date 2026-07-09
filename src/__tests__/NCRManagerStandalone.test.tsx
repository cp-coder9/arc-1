/**
 * Unit tests for NCRManagerStandalone wrapper component.
 *
 * Validates: Requirements 2.5
 *
 * Tests:
 * - Renders project selection prompt when no projectId
 * - Renders NCRManager directly when projectId provided
 * - Passes user.uid as currentUserId to NCRManager
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';

// ─── Mock NCRManager to isolate standalone wrapper behaviour ──────────────────
vi.mock('@/components/NCRManager', () => ({
  default: ({ projectId, currentUserId }: { projectId: string; currentUserId: string }) => (
    <div data-testid="ncr-manager-inner" data-project-id={projectId} data-user-id={currentUserId} />
  ),
}));

// ─── Mock UI primitives to avoid deep rendering ───────────────────────────────
vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// ─── Import component under test ──────────────────────────────────────────────
import NCRManagerStandalone from '@/components/NCRManagerStandalone';

// ─── Test data ────────────────────────────────────────────────────────────────
const mockUser = { uid: 'user-123', role: 'architect', displayName: 'Test User' } as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NCRManagerStandalone', () => {
  test('renders project selection prompt when no projectId', () => {
    render(<NCRManagerStandalone user={mockUser} />);

    // Should show "No Project Selected" prompt
    expect(screen.getByText('No Project Selected')).toBeInTheDocument();

    // Should NOT render the inner NCRManager
    expect(screen.queryByTestId('ncr-manager-inner')).not.toBeInTheDocument();
  });

  test('renders NCRManager directly when projectId provided', () => {
    render(<NCRManagerStandalone user={mockUser} projectId="proj-1" />);

    // Should render the inner NCRManager
    expect(screen.getByTestId('ncr-manager-inner')).toBeInTheDocument();

    // Should NOT show the project selection prompt
    expect(screen.queryByText('No Project Selected')).not.toBeInTheDocument();
  });

  test('passes user.uid as currentUserId to NCRManager', () => {
    render(<NCRManagerStandalone user={mockUser} projectId="proj-1" />);

    const inner = screen.getByTestId('ncr-manager-inner');
    expect(inner).toHaveAttribute('data-user-id', 'user-123');
    expect(inner).toHaveAttribute('data-project-id', 'proj-1');
  });
});
