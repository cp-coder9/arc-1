/**
 * Unit tests for SiteInstructionManagerStandalone component
 *
 * Validates: Requirements 3.4, 3.5
 *
 * - Renders project selection prompt when no projectId
 * - Does not render instruction data until project selected
 * - Passes correct props (projectId, currentUserId, currentUserRole) to SiteInstructionManager
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import SiteInstructionManagerStandalone from '@/components/SiteInstructionManagerStandalone';

vi.mock('@/components/SiteInstructionManager', () => ({
  default: ({ projectId, currentUserId, currentUserRole }: { projectId: string; currentUserId: string; currentUserRole: string }) => (
    <div data-testid="site-instruction-manager-inner" data-project-id={projectId} data-user-id={currentUserId} data-user-role={currentUserRole} />
  ),
}));

const mockUser = { uid: 'user-456', role: 'site_manager', displayName: 'Site Manager' } as any;

describe('SiteInstructionManagerStandalone', () => {
  test('renders project selection prompt when no projectId', () => {
    render(<SiteInstructionManagerStandalone user={mockUser} />);

    expect(screen.getByText('Select a Project')).toBeInTheDocument();
    expect(screen.getByText(/Select a project to manage site instructions/)).toBeInTheDocument();
    expect(screen.queryByTestId('site-instruction-manager-inner')).not.toBeInTheDocument();
  });

  test('does not render instruction data until project selected', () => {
    render(<SiteInstructionManagerStandalone user={mockUser} />);

    // The inner SiteInstructionManager should not render without a project
    expect(screen.queryByTestId('site-instruction-manager-inner')).not.toBeInTheDocument();
    // Project selection prompt should be visible
    expect(screen.getByText('Select a Project')).toBeInTheDocument();
  });

  test('passes correct props (projectId, currentUserId, currentUserRole) to SiteInstructionManager', () => {
    render(<SiteInstructionManagerStandalone user={mockUser} projectId="proj-789" />);

    const inner = screen.getByTestId('site-instruction-manager-inner');
    expect(inner).toBeInTheDocument();
    expect(inner).toHaveAttribute('data-project-id', 'proj-789');
    expect(inner).toHaveAttribute('data-user-id', 'user-456');
    expect(inner).toHaveAttribute('data-user-role', 'site_manager');
  });
});
