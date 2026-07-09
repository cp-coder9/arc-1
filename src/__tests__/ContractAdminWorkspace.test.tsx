/**
 * Unit tests for ContractAdminWorkspace component.
 *
 * Validates: Requirements 4.4, 4.6, 4.9, 4.12, 4.13
 *
 * Tests:
 * - 6 tabs render in correct order (Claims Register, Variation Register, Extension of Time, Notices, Payment Scheduler, Contract Data Sheet)
 * - Claims Register tab selected by default
 * - Disclaimer banner renders and is non-dismissible (has data-testid="disclaimer-banner")
 * - disabled tab shows permission message when canAccess returns false
 * - audit trail write called on contract action (mock useContractAdminIntegration hook)
 * - failed-sync alert created after 3 retry failures
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';

// ─── Mock services and hooks ──────────────────────────────────────────────────

vi.mock('@/services/contractAdmin/contractRbacService', () => ({
  canAccess: vi.fn(() => true),
}));

vi.mock('@/services/contractAdmin/disclaimerService', () => ({
  getDisclaimerBannerText: vi.fn(() =>
    'This system is advisory only and does not constitute legal advice. ' +
    'All outputs require professional review and independent legal review ' +
    'before any contractual decisions are made or actions are taken.'
  ),
}));

const mockWriteAuditTrail = vi.fn().mockResolvedValue({ success: true });
const mockSurfaceToActionCentre = vi.fn().mockResolvedValue({ success: true });
const mockWriteToProjectPassport = vi.fn().mockResolvedValue({ success: true });

vi.mock('@/hooks/useContractAdminIntegration', () => ({
  useContractAdminIntegration: () => ({
    writeAuditTrail: mockWriteAuditTrail,
    surfaceToActionCentre: mockSurfaceToActionCentre,
    writeToProjectPassport: mockWriteToProjectPassport,
  }),
}));

// ─── Mock UI primitives ───────────────────────────────────────────────────────

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, ...props }: any) => <div data-testid={props['data-testid']} {...props}>{children}</div>,
  CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: any) => <h3 {...props}>{children}</h3>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button type="button" onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, ...props }: any) => <span {...props}>{children}</span>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange, ...props }: any) => (
    <div data-testid="tabs" data-value={value} {...props}>
      {React.Children.map(children, (child: any) =>
        child ? React.cloneElement(child, { activeValue: value, onValueChange }) : null
      )}
    </div>
  ),
  TabsList: ({ children, activeValue, onValueChange, ...props }: any) => (
    <div data-testid="tabs-list" role="tablist" {...props}>
      {React.Children.map(children, (child: any) =>
        child ? React.cloneElement(child, { activeValue, onValueChange }) : null
      )}
    </div>
  ),
  TabsTrigger: ({ children, value, disabled, activeValue, onValueChange, ...props }: any) => (
    <button
      type="button"
      role="tab"
      data-testid={`tab-${value}`}
      data-value={value}
      data-state={activeValue === value ? 'active' : 'inactive'}
      aria-selected={activeValue === value}
      disabled={disabled}
      onClick={() => !disabled && onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  ),
  TabsContent: ({ children, value, activeValue, ...props }: any) => (
    activeValue === value ? <div data-testid={`tab-content-${value}`} {...props}>{children}</div> : null
  ),
}));

vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// ─── Import component under test ──────────────────────────────────────────────

import ContractAdminWorkspace from '@/components/ContractAdminWorkspace';
import { canAccess } from '@/services/contractAdmin/contractRbacService';

// ─── Test data ────────────────────────────────────────────────────────────────

const mockUser = {
  uid: 'user-123',
  role: 'architect',
  displayName: 'Test Architect',
  email: 'test@example.com',
} as any;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ContractAdminWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (canAccess as any).mockReturnValue(true);
    mockWriteAuditTrail.mockResolvedValue({ success: true });
    mockSurfaceToActionCentre.mockResolvedValue({ success: true });
    mockWriteToProjectPassport.mockResolvedValue({ success: true });
  });

  test('6 tabs render in correct order', () => {
    render(<ContractAdminWorkspace user={mockUser} projectId="proj-1" />);

    const tabList = screen.getByTestId('tabs-list');
    const tabs = tabList.querySelectorAll('[role="tab"]');

    expect(tabs).toHaveLength(6);

    // Verify tab labels in correct order
    const expectedLabels = [
      'Claims Register',
      'Variation Register',
      'Extension of Time',
      'Notices',
      'Payment Scheduler',
      'Contract Data Sheet',
    ];

    tabs.forEach((tab, index) => {
      expect(tab.textContent).toContain(expectedLabels[index]);
    });
  });

  test('Claims Register tab selected by default', () => {
    render(<ContractAdminWorkspace user={mockUser} projectId="proj-1" />);

    const claimsTab = screen.getByTestId('tab-claims');
    expect(claimsTab).toHaveAttribute('data-state', 'active');
    expect(claimsTab).toHaveAttribute('aria-selected', 'true');

    // Verify the claims tab content is visible
    expect(screen.getByTestId('tab-content-claims')).toBeInTheDocument();
  });

  test('Disclaimer banner renders and is non-dismissible', () => {
    render(<ContractAdminWorkspace user={mockUser} projectId="proj-1" />);

    const banner = screen.getByTestId('disclaimer-banner');
    expect(banner).toBeInTheDocument();

    // Check disclaimer text content
    expect(banner.textContent).toContain('advisory only');
    expect(banner.textContent).toContain('does not constitute legal advice');
    expect(banner.textContent).toContain('professional review');

    // Banner should NOT have a dismiss/close button
    const closeButtons = banner.querySelectorAll('button');
    expect(closeButtons).toHaveLength(0);
  });

  test('disabled tab shows permission message when canAccess returns false', () => {
    // Mock canAccess to return false for 'claims' feature
    (canAccess as any).mockImplementation(
      (role: string, feature: string, permission: string) => {
        if (feature === 'claims') return false;
        return true;
      }
    );

    render(<ContractAdminWorkspace user={mockUser} projectId="proj-1" />);

    // The claims tab should be disabled
    const claimsTab = screen.getByTestId('tab-claims');
    expect(claimsTab).toBeDisabled();

    // Since claims is selected by default and access is denied, the content should show permission denied
    const content = screen.getByTestId('tab-content-claims');
    expect(content.textContent).toContain('Insufficient Permission');
    expect(content.textContent).toContain('Claims Register');
  });

  test('audit trail write called on contract action', async () => {
    render(<ContractAdminWorkspace user={mockUser} projectId="proj-1" />);

    // Click "Register Claim" button which triggers onContractAction
    const registerBtn = screen.getByTestId('register-claim-btn');
    fireEvent.click(registerBtn);

    await waitFor(() => {
      expect(mockWriteAuditTrail).toHaveBeenCalledTimes(1);
    });

    // Verify the audit trail was called with proper structure
    const auditCall = mockWriteAuditTrail.mock.calls[0][0];
    expect(auditCall).toMatchObject({
      entityType: 'claim',
      action: 'claim_registered',
      clauseReference: '25.1',
    });
    expect(auditCall.entityId).toContain('CLM-');
  });

  test('failed-sync alert created after 3 retry failures', async () => {
    // Mock writeAuditTrail to return a failed result with a failedSyncAlert
    mockWriteAuditTrail.mockResolvedValue({
      success: false,
      failedSyncAlert: {
        id: 'failed_sync_AuditTrail_123_1',
        type: 'failed-sync',
        targetModule: 'AuditTrail',
        originatingEvent: 'claim:claim_registered',
        failureTimestamp: '2026-06-15T10:00:00.000Z',
        errorMessage: 'Network error after 3 retries',
      },
    });

    render(<ContractAdminWorkspace user={mockUser} projectId="proj-1" />);

    // Click "Register Claim" to trigger the integration action that will fail
    const registerBtn = screen.getByTestId('register-claim-btn');
    fireEvent.click(registerBtn);

    // Wait for the failed-sync alert to appear in the UI
    await waitFor(() => {
      const alertsContainer = screen.getByTestId('failed-sync-alerts');
      expect(alertsContainer).toBeInTheDocument();
    });

    // Verify the alert displays the target module and event info
    expect(screen.getByText('Sync Failed: AuditTrail')).toBeInTheDocument();
    expect(screen.getByText(/claim:claim_registered/)).toBeInTheDocument();
  });
});
