/**
 * Unit tests for AdminConfigVersioningPanel
 *
 * Tests: Feature flag toggle + version record creation, tariff rule management
 * with effective date enforcement, version history display.
 *
 * @requirements 9.3, 9.4, 10.1, 10.2, 10.3
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import AdminConfigVersioningPanel from '../AdminConfigVersioningPanel';
import type { UserProfile } from '@/types';

// Mock configVersioningService
const mockCreateConfigVersion = vi.fn().mockResolvedValue({
  versionId: 'v-test-1',
  configKey: 'test_key',
  configType: 'feature_flag',
  previousValue: false,
  newValue: true,
  modifierUid: 'admin-uid',
  timestampIso: '2026-06-20T12:00:00.000Z',
});

const mockGetVersionHistory = vi.fn().mockResolvedValue([]);
const mockValidateTariffEffectiveDate = vi.fn().mockReturnValue(true);

vi.mock('@/services/configVersioningService', () => ({
  createConfigVersion: (...args: unknown[]) => mockCreateConfigVersion(...args),
  getVersionHistory: (...args: unknown[]) => mockGetVersionHistory(...args),
  validateTariffEffectiveDate: (...args: unknown[]) => mockValidateTariffEffectiveDate(...args),
}));

const mockUser: UserProfile = {
  uid: 'admin-uid-1',
  email: 'admin@architex.co.za',
  displayName: 'Admin User',
  role: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
} as UserProfile;

describe('AdminConfigVersioningPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateConfigVersion.mockResolvedValue({
      versionId: 'v-test-1',
      configKey: 'test_key',
      configType: 'feature_flag',
      previousValue: false,
      newValue: true,
      modifierUid: 'admin-uid-1',
      timestampIso: '2026-06-20T12:00:00.000Z',
    });
    mockGetVersionHistory.mockResolvedValue([]);
    mockValidateTariffEffectiveDate.mockReturnValue(true);
  });

  // ─── Rendering ──────────────────────────────────────────────────────────────

  it('renders feature flags tab by default', () => {
    render(<AdminConfigVersioningPanel user={mockUser} />);
    expect(screen.getByTestId('feature-flags-panel')).toBeDefined();
  });

  it('renders tariff rules tab when initialTab is tariff-rules', () => {
    render(<AdminConfigVersioningPanel user={mockUser} initialTab="tariff-rules" />);
    expect(screen.getByTestId('tariff-rules-panel')).toBeDefined();
  });

  it('displays feature flag list with status pills', () => {
    render(<AdminConfigVersioningPanel user={mockUser} />);
    expect(screen.getByText('Escrow v2 State Machine')).toBeDefined();
    expect(screen.getByText('AI Compliance Checks')).toBeDefined();
    expect(screen.getByText('FICA Threshold Reporting')).toBeDefined();
  });

  // ─── Feature Flag Toggle (Req 10.1) ────────────────────────────────────────

  it('calls createConfigVersion when toggling a feature flag', async () => {
    render(<AdminConfigVersioningPanel user={mockUser} />);
    const disableButtons = screen.getAllByText('Disable');
    fireEvent.click(disableButtons[0]);

    await waitFor(() => {
      expect(mockCreateConfigVersion).toHaveBeenCalledWith(
        'enable_escrow_v2',
        'feature_flag',
        true,
        false,
        'admin-uid-1',
      );
    });
  });

  it('displays success message after successful flag toggle', async () => {
    render(<AdminConfigVersioningPanel user={mockUser} />);
    const disableButtons = screen.getAllByText('Disable');
    fireEvent.click(disableButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/updated successfully/i)).toBeDefined();
    });
  });

  // ─── Version History (Req 9.3, 10.7) ──────────────────────────────────────

  it('loads version history when History button is clicked', async () => {
    mockGetVersionHistory.mockResolvedValue([
      {
        versionId: 'v1',
        configKey: 'enable_escrow_v2',
        configType: 'feature_flag',
        previousValue: false,
        newValue: true,
        modifierUid: 'admin-uid-1',
        timestampIso: '2026-06-20T12:00:00.000Z',
      },
    ]);

    render(<AdminConfigVersioningPanel user={mockUser} />);
    const historyButtons = screen.getAllByText('History');
    fireEvent.click(historyButtons[0]);

    await waitFor(() => {
      expect(mockGetVersionHistory).toHaveBeenCalledWith('enable_escrow_v2', 50);
    });

    await waitFor(() => {
      expect(screen.getByTestId('version-history-panel')).toBeDefined();
    });
  });

  // ─── Tab Switching ──────────────────────────────────────────────────────────

  it('switches to tariff rules tab when clicked', () => {
    render(<AdminConfigVersioningPanel user={mockUser} />);
    const tariffButton = screen.getByText('Tariff Rules');
    fireEvent.click(tariffButton);
    expect(screen.getByTestId('tariff-rules-panel')).toBeDefined();
  });

  // ─── Tariff Rule Effective Date Enforcement (Req 10.3) ─────────────────────

  it('rejects tariff rule with past effective date', async () => {
    mockValidateTariffEffectiveDate.mockReturnValue(false);

    render(<AdminConfigVersioningPanel user={mockUser} initialTab="tariff-rules" />);

    // Fill in the add form
    const keyInput = screen.getByPlaceholderText('e.g. late_payment_fee');
    const labelInput = screen.getByPlaceholderText('e.g. Late Payment Fee');
    const valueInput = screen.getByPlaceholderText('e.g. 2%');

    fireEvent.change(keyInput, { target: { value: 'test_fee' } });
    fireEvent.change(labelInput, { target: { value: 'Test Fee' } });
    fireEvent.change(valueInput, { target: { value: '1%' } });

    // Set a past date input
    const dateInputs = screen.getAllByDisplayValue('');
    const dateInput = dateInputs.find(el => el.getAttribute('type') === 'date');
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: '2020-01-01' } });
    }

    const addButton = screen.getByText('Add Rule');
    fireEvent.click(addButton);

    await waitFor(() => {
      // Use data-testid of the error message container - check within the error alert div specifically
      const errorElements = screen.getAllByText(/must be current or future/i);
      // The error alert is the one with red background styling
      const errorAlert = errorElements.find(el =>
        el.closest('[style*="rgba(217, 87, 71"]') || el.closest('[style*="rgba(217,87,71"]')
      );
      expect(errorAlert).toBeDefined();
    });

    // Verify createConfigVersion was NOT called
    expect(mockCreateConfigVersion).not.toHaveBeenCalled();
  });

  it('creates tariff rule with valid future effective date', async () => {
    mockValidateTariffEffectiveDate.mockReturnValue(true);
    mockCreateConfigVersion.mockResolvedValue({
      versionId: 'v-tariff-1',
      configKey: 'new_tariff',
      configType: 'tariff_rule',
      previousValue: null,
      newValue: '2%',
      modifierUid: 'admin-uid-1',
      timestampIso: '2026-06-20T12:00:00.000Z',
      effectiveDate: '2027-01-01',
    });

    render(<AdminConfigVersioningPanel user={mockUser} initialTab="tariff-rules" />);

    const keyInput = screen.getByPlaceholderText('e.g. late_payment_fee');
    const labelInput = screen.getByPlaceholderText('e.g. Late Payment Fee');
    const valueInput = screen.getByPlaceholderText('e.g. 2%');

    fireEvent.change(keyInput, { target: { value: 'new_tariff' } });
    fireEvent.change(labelInput, { target: { value: 'New Tariff' } });
    fireEvent.change(valueInput, { target: { value: '2%' } });

    // Set future date
    const dateInputs = screen.getAllByDisplayValue('');
    const dateInput = dateInputs.find(el => el.getAttribute('type') === 'date');
    if (dateInput) {
      fireEvent.change(dateInput, { target: { value: '2027-01-01' } });
    }

    const addButton = screen.getByText('Add Rule');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(mockCreateConfigVersion).toHaveBeenCalledWith(
        'new_tariff',
        'tariff_rule',
        null,
        '2%',
        'admin-uid-1',
        undefined,
        '2027-01-01',
      );
    });
  });

  // ─── Tariff Rule Display ──────────────────────────────────────────────────

  it('displays existing tariff rules with effective dates', () => {
    render(<AdminConfigVersioningPanel user={mockUser} initialTab="tariff-rules" />);
    expect(screen.getByText('Standard Platform Fee')).toBeDefined();
    expect(screen.getByText('5%')).toBeDefined();
    // Two rules share 2026-07-01, so use getAllByText
    const dateElements = screen.getAllByText('2026-07-01');
    expect(dateElements.length).toBeGreaterThanOrEqual(1);
  });
});
