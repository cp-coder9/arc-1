// Feature: website-ui-redesign (Task 11.3)
//
// Unit tests for the QuickNav Landing_Page navigation row. Covers the
// exactly-four item set + labels (Req 5.1), icon-per-item rendering (Req 5.2),
// pointer and Enter/Space activation calling onNavigate with the item's route
// (Req 5.3), and the error indication branch (Req 5.4).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QuickNav, QUICK_NAV_ITEMS } from '../QuickNav';

describe('QuickNav', () => {
  it('declares exactly four items labeled People, Projects, Approvals, Payments (Req 5.1)', () => {
    expect(QUICK_NAV_ITEMS).toHaveLength(4);
    expect(QUICK_NAV_ITEMS.map((i) => i.label)).toEqual([
      'People',
      'Projects',
      'Approvals',
      'Payments',
    ]);
  });

  it('renders exactly four buttons, each with its label and an icon (Req 5.1, 5.2)', () => {
    render(<QuickNav onNavigate={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);

    for (const item of QUICK_NAV_ITEMS) {
      const btn = screen.getByRole('button', { name: new RegExp(item.label, 'i') });
      // Visible label.
      expect(btn).toHaveTextContent(item.label);
      // lucide-react renders an <svg> icon inside the button.
      expect(btn.querySelector('svg')).not.toBeNull();
    }
  });

  it('calls onNavigate with the item route on pointer click (Req 5.3)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<QuickNav onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /projects/i }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('/projects');
  });

  it('calls onNavigate when activating with Enter and Space keys (Req 5.3)', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<QuickNav onNavigate={onNavigate} />);

    const payments = screen.getByRole('button', { name: /payments/i });
    payments.focus();
    expect(payments).toHaveFocus();

    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect(onNavigate).toHaveBeenNthCalledWith(1, '/payments');
    expect(onNavigate).toHaveBeenNthCalledWith(2, '/payments');
  });

  it('shows an error alert and retains the items when error is provided (Req 5.4)', () => {
    render(<QuickNav onNavigate={() => {}} error="Could not open People" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Could not open People');
    // The four items remain rendered alongside the error (view retained).
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('renders no error alert when error is absent', () => {
    render(<QuickNav onNavigate={() => {}} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
