/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MobileMenuTrigger } from './MobileMenuTrigger';
import type { UserProfile } from '@/types';

/**
 * Unit tests for MobileMenuTrigger component.
 *
 * Requirements: 5.8
 */

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'architect',
    createdAt: '2024-01-01',
    ...overrides,
  };
}

describe('MobileMenuTrigger', () => {
  // ── Hamburger button visibility ──────────────────────────────────────────

  it('renders a hamburger button with correct aria-label', () => {
    render(<MobileMenuTrigger user={makeUser()} />);
    const button = screen.getByRole('button', { name: /Open navigation menu/i });
    expect(button).toBeInTheDocument();
  });

  it('applies block md:hidden classes to hide on desktop', () => {
    render(<MobileMenuTrigger user={makeUser()} />);
    const button = screen.getByRole('button', { name: /Open navigation menu/i });
    // The button uses flex (not block) as its display utility so it can centre
    // the icon within the 44×44 touch target; md:hidden still hides it on desktop.
    expect(button.className).toMatch(/flex|block/);
    expect(button.className).toMatch(/md:hidden/);
  });

  it('button starts with aria-expanded="false"', () => {
    render(<MobileMenuTrigger user={makeUser()} />);
    const button = screen.getByRole('button', { name: /Open navigation menu/i });
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('applies custom className to the trigger button', () => {
    render(<MobileMenuTrigger user={makeUser()} className="my-custom-class" />);
    const button = screen.getByRole('button', { name: /Open navigation menu/i });
    expect(button.className).toContain('my-custom-class');
  });

  // ── Drawer open/close behaviour ──────────────────────────────────────────

  it('drawer is not visible before hamburger is clicked', () => {
    render(<MobileMenuTrigger user={makeUser()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the drawer when hamburger button is clicked', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser()} />);

    const button = screen.getByRole('button', { name: /Open navigation menu/i });
    await user.click(button);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sets aria-expanded="true" when drawer is open', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser()} />);

    const button = screen.getByRole('button', { name: /Open navigation menu/i });
    await user.click(button);

    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('drawer has aria-label="Navigation drawer"', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser()} />);

    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));

    expect(screen.getByRole('dialog', { name: /Navigation drawer/i })).toBeInTheDocument();
  });

  it('closes the drawer when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser()} />);

    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('closes the drawer when backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { container } = render(<MobileMenuTrigger user={makeUser()} />);

    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Click the backdrop (aria-hidden overlay — use fireEvent since aria-hidden
    // elements are skipped by userEvent's accessibility filter)
    const backdrop = container.querySelector('.fixed.inset-0 > [aria-hidden="true"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  // ── Drawer content ───────────────────────────────────────────────────────

  it('renders the sidebar navigation inside the drawer when open', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser({ role: 'architect' })} />);

    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));

    // The sidebar nav should be present inside the drawer
    expect(screen.getByRole('navigation', { name: /Architex navigation/i })).toBeInTheDocument();
  });

  it('shows navigation items for the user role inside the drawer', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser({ role: 'architect' })} />);

    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));

    // Architect role should have CPD & Learning
    expect(screen.getByText('CPD & Learning')).toBeInTheDocument();
  });

  // ── onSignOut callback ────────────────────────────────────────────────────

  it('calls onSignOut and closes the drawer when Sign Out is clicked', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<MobileMenuTrigger user={makeUser()} onSignOut={onSignOut} />);

    // Open drawer
    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Click Sign Out inside drawer
    await user.click(screen.getByRole('button', { name: /Sign Out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  it('does not throw when Sign Out is clicked without onSignOut prop', async () => {
    const user = userEvent.setup();
    render(<MobileMenuTrigger user={makeUser()} />);

    await user.click(screen.getByRole('button', { name: /Open navigation menu/i }));
    // Should not throw
    await user.click(screen.getByRole('button', { name: /Sign Out/i }));
  });
});
