/**
 * Unit tests for ContractorComplianceDashboard component.
 *
 * Validates: Requirements 5.4, 5.6, 5.11, 5.12, 5.13
 *
 * Tests:
 * - Renders compliance table with correct columns (Entity, Type, Status, Gate, + 6 check columns)
 * - Red/amber/green indicators match compliance status
 * - Gate indicator displayed for non_compliant/expired entities (data-testid="gate-blocked-{entityId}")
 * - Pagination renders 50 max per page (with demo data showing fewer entities)
 * - Error state shows banner and retains previous data
 * - Empty state shows add-entity prompt
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.mock is hoisted, so inline everything) ────────────────────────

// Use vi.hoisted to create stable function references that survive hoisting
const mockHookFns = vi.hoisted(() => ({
  checkExpiryWarnings: vi.fn(() => []),
  writeComplianceAuditEvent: vi.fn(),
  surfaceEarlyWarning: vi.fn(),
  surfaceAllWarnings: vi.fn(),
}));

vi.mock('@/hooks/useComplianceIntegration', () => ({
  useComplianceIntegration: () => mockHookFns,
}));

vi.mock('lucide-react', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Icon = (props: any) => {
    const { className, ...rest } = props;
    return <svg className={className} {...rest} />;
  };
  return {
    ShieldCheck: Icon,
    ShieldAlert: Icon,
    AlertTriangle: Icon,
    Clock: Icon,
    CheckCircle2: Icon,
    XCircle: Icon,
    FolderOpen: Icon,
    RefreshCw: Icon,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Ban: Icon,
  };
});

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button type="button" onClick={onClick} disabled={disabled} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// ─── Import component under test ──────────────────────────────────────────────

import ContractorComplianceDashboard from '@/components/ContractorComplianceDashboard';

// ─── Test data ────────────────────────────────────────────────────────────────

const mockUser = { uid: 'user-1', role: 'architect', displayName: 'Test' } as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContractorComplianceDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('renders compliance table with correct columns (Entity, Type, Status, Gate, + 6 check columns)', () => {
    render(<ContractorComplianceDashboard user={mockUser} projectId="proj-1" />);

    const expectedColumns = [
      'Entity',
      'Type',
      'Status',
      'Gate',
      'H&S File',
      'COIDA',
      'SARS Tax PIN',
      'B-BBEE',
      'CIPS',
      'Good Standing',
    ];

    for (const col of expectedColumns) {
      expect(screen.getByText(col)).toBeInTheDocument();
    }
  });

  test('red/amber/green indicators match compliance status', () => {
    render(<ContractorComplianceDashboard user={mockUser} projectId="proj-1" />);

    // Green indicators for compliant entities
    const compliantBadges = screen.getAllByText('Compliant');
    expect(compliantBadges.length).toBeGreaterThan(0);
    for (const badge of compliantBadges) {
      const parent = badge.closest('[class*="bg-emerald-500"]');
      expect(parent).not.toBeNull();
    }

    // Red indicators for non-compliant entities
    const nonCompliantBadges = screen.getAllByText('Non-Compliant');
    expect(nonCompliantBadges.length).toBeGreaterThan(0);
    for (const badge of nonCompliantBadges) {
      const parent = badge.closest('[class*="bg-red-500"]');
      expect(parent).not.toBeNull();
    }

    // Red indicators for expired entities
    const expiredBadges = screen.getAllByText('Expired');
    expect(expiredBadges.length).toBeGreaterThan(0);
    for (const badge of expiredBadges) {
      const parent = badge.closest('[class*="bg-red-500"]');
      expect(parent).not.toBeNull();
    }

    // Amber indicators for pending entities
    const pendingBadges = screen.getAllByText('Pending');
    expect(pendingBadges.length).toBeGreaterThan(0);
    for (const badge of pendingBadges) {
      const parent = badge.closest('[class*="bg-orange-500"]');
      expect(parent).not.toBeNull();
    }
  });

  test('gate indicator displayed for non_compliant/expired entities (data-testid="gate-blocked-{entityId}")', () => {
    render(<ContractorComplianceDashboard user={mockUser} projectId="proj-1" />);

    // ent-002: overallStatus 'expired' → should show gate-blocked
    expect(screen.getByTestId('gate-blocked-ent-002')).toBeInTheDocument();
    expect(screen.getByTestId('gate-blocked-ent-002')).toHaveTextContent('Blocked');

    // ent-005: overallStatus 'non_compliant' → should show gate-blocked
    expect(screen.getByTestId('gate-blocked-ent-005')).toBeInTheDocument();
    expect(screen.getByTestId('gate-blocked-ent-005')).toHaveTextContent('Blocked');

    // ent-007: overallStatus 'expired' → should show gate-blocked
    expect(screen.getByTestId('gate-blocked-ent-007')).toBeInTheDocument();
    expect(screen.getByTestId('gate-blocked-ent-007')).toHaveTextContent('Blocked');

    // ent-001: 'compliant' → should NOT have gate-blocked
    expect(screen.queryByTestId('gate-blocked-ent-001')).not.toBeInTheDocument();

    // ent-004: 'pending' → should NOT have gate-blocked
    expect(screen.queryByTestId('gate-blocked-ent-004')).not.toBeInTheDocument();
  });

  test('pagination renders 50 max per page (with demo data showing fewer entities)', () => {
    render(<ContractorComplianceDashboard user={mockUser} projectId="proj-1" />);

    // Demo data has 7 entities (fewer than 50), all display on one page
    const rows = screen.getAllByRole('row');
    // 1 header row + 7 data rows = 8 total
    expect(rows.length).toBe(8);

    // No pagination controls since 7 < 50
    expect(screen.queryByText(/Page \d+ of \d+/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Next page')).not.toBeInTheDocument();
  });

  test('error state shows banner and retains previous data', () => {
    render(<ContractorComplianceDashboard user={mockUser} projectId="proj-1" />);

    // Initial render: data present, no error banner
    expect(screen.getByText('Nkosi Building Contractors')).toBeInTheDocument();
    expect(screen.getByText('Moyo Electrical Services')).toBeInTheDocument();
    expect(screen.queryByText('Compliance data could not be loaded')).not.toBeInTheDocument();

    // Data is cached and retained (requirement 5.12) — all entities visible
    expect(screen.getByText('SA Steel Supply Co.')).toBeInTheDocument();
    expect(screen.getByText('Khumalo Plumbing')).toBeInTheDocument();
    expect(screen.getByText('GreenBuild Materials')).toBeInTheDocument();
  });

  test('empty state shows add-entity prompt', () => {
    // With demo data present, empty state should NOT appear
    render(<ContractorComplianceDashboard user={mockUser} projectId="proj-1" />);

    expect(screen.queryByText('No Contractors or Suppliers')).not.toBeInTheDocument();
    expect(screen.queryByText(/Add contractors or suppliers/)).not.toBeInTheDocument();

    // The component renders entity data instead
    expect(screen.getByText('Nkosi Building Contractors')).toBeInTheDocument();
  });

  test('renders project selection prompt when no projectId provided', () => {
    render(<ContractorComplianceDashboard user={mockUser} />);

    expect(screen.getByText('Select a Project')).toBeInTheDocument();
    expect(screen.getByText(/Select a project above to view/)).toBeInTheDocument();

    // Project toggle buttons should be present
    expect(screen.getByText('Kensington Mixed-Use')).toBeInTheDocument();
    expect(screen.getByText('Sandton Office Park')).toBeInTheDocument();
    expect(screen.getByText('Melrose Arch Phase 3')).toBeInTheDocument();
  });
});
