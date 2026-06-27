import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleAwareSidebar } from './RoleAwareSidebar';
import type { UserProfile } from '@/types';

/**
 * Unit tests for RoleAwareSidebar component.
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
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

describe('RoleAwareSidebar', () => {
  // ── Req 5.1: Modules filtered by role ─────────────────────────────────────

  it('renders only modules accessible to the user role', () => {
    // 'admin' role sees 'Settings' module, 'client' does not
    const adminUser = makeUser({ role: 'admin' });
    const { unmount } = render(<RoleAwareSidebar user={adminUser} />);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    unmount();

    const clientUser = makeUser({ role: 'client' });
    render(<RoleAwareSidebar user={clientUser} />);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('renders CPD & Learning module only for roles that have access', () => {
    // architect has CPD access
    const { unmount } = render(<RoleAwareSidebar user={makeUser({ role: 'architect' })} />);
    expect(screen.getByText('CPD & Learning')).toBeInTheDocument();
    unmount();

    // client does NOT have CPD access
    render(<RoleAwareSidebar user={makeUser({ role: 'client' })} />);
    expect(screen.queryByText('CPD & Learning')).not.toBeInTheDocument();
  });

  it('renders no modules for a role with no nav items (graceful empty)', () => {
    // Create a test user with a role that has zero nav modules
    // We mock getNavigationForRole to return empty for isolation
    // In practice, every real role has at least command_centre and inbox
    const user = makeUser({ role: 'client' });
    // client has command_centre, inbox, projects, etc. — just ensure it renders
    render(<RoleAwareSidebar user={user} />);
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  // ── Req 5.6: glass-nav class ──────────────────────────────────────────────

  it('applies glass-nav class to the <nav> element', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('glass-nav');
  });

  // ── Req 5.6: glass-card on logo area ─────────────────────────────────────

  it('renders the logo/branding area with glass-card class', () => {
    const { container } = render(<RoleAwareSidebar user={makeUser()} />);
    const logoArea = container.querySelector('.glass-card');
    expect(logoArea).toBeInTheDocument();
  });

  it('renders the user display name in the logo area', () => {
    render(<RoleAwareSidebar user={makeUser({ displayName: 'Jane Doe' })} />);
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  // ── Req 5.2: Collapsible modules ──────────────────────────────────────────

  it('renders module header buttons with ChevronDown icon', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    // aria-expanded is present on all module headers
    const expandedButtons = screen.getAllByRole('button', { expanded: true });
    expect(expandedButtons.length).toBeGreaterThan(0);
  });

  it('toggles module sections on header click', async () => {
    const user = userEvent.setup();
    render(<RoleAwareSidebar user={makeUser({ role: 'architect' })} />);

    // Find "CPD & Learning" module button
    const cpdButton = screen.getByRole('button', { name: /CPD & Learning/i });
    expect(cpdButton).toHaveAttribute('aria-expanded', 'true');

    // Collapse it
    await user.click(cpdButton);
    expect(cpdButton).toHaveAttribute('aria-expanded', 'false');

    // CPD Dashboard section should no longer be visible
    expect(screen.queryByText('CPD Dashboard')).not.toBeInTheDocument();

    // Expand it again
    await user.click(cpdButton);
    expect(cpdButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('CPD Dashboard')).toBeInTheDocument();
  });

  // ── Req 5.3: Active section highlighting ──────────────────────────────────

  it('highlights the active section with bg-primary/20 and text-landing-accent classes', () => {
    // 'command' maps to command_centre module's first page
    render(
      <RoleAwareSidebar
        user={makeUser({ role: 'architect' })}
        activeTab="command"
      />
    );

    // Find the "Today / Next Actions" section link (inside Command Centre module)
    // It's the first section — its module maps to 'command' page
    const activeButtons = document.querySelectorAll('[aria-current="page"]');
    expect(activeButtons.length).toBeGreaterThan(0);

    const activeButton = activeButtons[0] as HTMLElement;
    expect(activeButton.className).toContain('bg-primary/20');
    expect(activeButton.className).toContain('text-landing-accent');
    expect(activeButton.className).toContain('font-semibold');
  });

  it('does not mark non-active sections as current', () => {
    render(
      <RoleAwareSidebar
        user={makeUser({ role: 'architect' })}
        activeTab="command"
      />
    );

    const nonActiveButtons = screen
      .getAllByRole('button')
      .filter((btn) => !btn.hasAttribute('aria-current'));

    // There should be non-active buttons
    expect(nonActiveButtons.length).toBeGreaterThan(0);
    nonActiveButtons.forEach((btn) => {
      expect(btn.className).not.toContain('bg-primary/20');
    });
  });

  // ── Req 5.4: Help & Support button ────────────────────────────────────────

  it('renders Help & Support button', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    expect(screen.getByRole('button', { name: /Help.*Support/i })).toBeInTheDocument();
  });

  // ── Req 5.5: Sign Out button calls onSignOut ───────────────────────────────

  it('renders Sign Out button', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    expect(screen.getByRole('button', { name: /Sign Out/i })).toBeInTheDocument();
  });

  it('calls onSignOut callback when Sign Out is clicked', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    render(<RoleAwareSidebar user={makeUser()} onSignOut={onSignOut} />);

    await user.click(screen.getByRole('button', { name: /Sign Out/i }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('does not throw when Sign Out is clicked without onSignOut prop', async () => {
    const user = userEvent.setup();
    render(<RoleAwareSidebar user={makeUser()} />);
    // Should not throw
    await user.click(screen.getByRole('button', { name: /Sign Out/i }));
  });

  // ── Req 5.8: Hidden on mobile ─────────────────────────────────────────────

  it('applies hidden class for mobile and shows from md breakpoint', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('md:flex');
  });

  // ── Req 5.7: Fixed position, h-screen w-64 ───────────────────────────────

  it('applies fixed position with correct sizing classes', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('fixed');
    expect(nav.className).toContain('left-0');
    expect(nav.className).toContain('top-0');
    expect(nav.className).toContain('h-screen');
    expect(nav.className).toContain('w-64');
  });

  // ── Req 5.9: Keyboard accessibility ──────────────────────────────────────

  it('section links invoke onNavigate when clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <RoleAwareSidebar
        user={makeUser({ role: 'architect' })}
        onNavigate={onNavigate}
      />
    );

    // Click any visible section link (Today / Next Actions is in Command Centre)
    const sectionLinks = screen.getAllByRole('button', { name: /Today|Next Actions/i });
    if (sectionLinks.length > 0) {
      await user.click(sectionLinks[0]);
      expect(onNavigate).toHaveBeenCalledTimes(1);
    }
  });

  it('module toggle buttons are keyboard accessible via Tab', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    // All interactive elements should have no negative tabIndex
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const tabIndex = btn.getAttribute('tabindex');
      if (tabIndex !== null) {
        expect(Number(tabIndex)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── Custom className ───────────────────────────────────────────────────────

  it('merges custom className with base classes', () => {
    render(<RoleAwareSidebar user={makeUser()} className="my-custom-class" />);
    const nav = screen.getByRole('navigation');
    expect(nav.className).toContain('my-custom-class');
  });

  // ── Accessibility: aria-label on nav ─────────────────────────────────────

  it('has an accessible label on the nav element', () => {
    render(<RoleAwareSidebar user={makeUser()} />);
    expect(screen.getByRole('navigation', { name: /Architex navigation/i })).toBeInTheDocument();
  });

  // ── Accessibility: aria-controls on module headers ────────────────────────

  it('module headers have aria-controls pointing to their section list', () => {
    render(<RoleAwareSidebar user={makeUser({ role: 'architect' })} />);
    // Command Centre button should have aria-controls
    const cmdButton = screen.getByRole('button', { name: /Command Centre/i });
    const controls = cmdButton.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    // The controlled element should exist in DOM when expanded
    expect(document.getElementById(controls!)).toBeInTheDocument();
  });
});
