import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Breadcrumbs } from './Breadcrumbs';
import type { BreadcrumbItem } from '@/hooks/useBreadcrumbs';

/**
 * Unit tests for Breadcrumbs component.
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

// Mock the useBreadcrumbs hook so we control the crumb array without touching
// window.location.
vi.mock('@/hooks/useBreadcrumbs', () => ({
  useBreadcrumbs: vi.fn(),
}));

import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
const mockUseBreadcrumbs = vi.mocked(useBreadcrumbs);

/** Factory for BreadcrumbItem objects. */
function makeCrumb(overrides: Partial<BreadcrumbItem> = {}): BreadcrumbItem {
  return {
    id: 'crumb-id',
    label: 'Label',
    href: '/some-path',
    ...overrides,
  };
}

describe('Breadcrumbs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Req 6.1: Hook is called and crumbs are rendered ───────────────────────

  it('calls useBreadcrumbs hook on mount (Req 6.1)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
    ]);

    render(<Breadcrumbs />);

    expect(mockUseBreadcrumbs).toHaveBeenCalledTimes(1);
  });

  it('renders the breadcrumb label text returned by useBreadcrumbs (Req 6.1)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
      makeCrumb({ id: 'design', label: 'Design', href: '/projects/design' }),
    ]);

    render(<Breadcrumbs />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
    expect(screen.getByText('Design')).toBeInTheDocument();
  });

  it('renders a single crumb (only the current page) with no separator (Req 6.1)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
    ]);

    const { container } = render(<Breadcrumbs />);

    expect(screen.getByText('Home')).toBeInTheDocument();
    // No ChevronRight SVG when there is only one crumb
    expect(container.querySelectorAll('svg').length).toBe(0);
  });

  // ── Req 6.2: ChevronRight separator between each crumb ───────────────────

  it('renders one ChevronRight separator for two crumbs (Req 6.2)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
    ]);

    const { container } = render(<Breadcrumbs />);

    // One SVG separator between the two crumbs
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBe(1);
  });

  it('renders N-1 ChevronRight separators for N crumbs (Req 6.2)', () => {
    const crumbs: BreadcrumbItem[] = [
      { id: 'home', label: 'Home', href: '/' },
      { id: 'projects', label: 'Projects', href: '/projects' },
      { id: 'arch', label: 'Architect', href: '/projects/arch' },
      { id: 'design', label: 'Design', href: '/projects/arch/design' },
    ];
    mockUseBreadcrumbs.mockReturnValue(crumbs);

    const { container } = render(<Breadcrumbs />);

    // 4 crumbs → 3 separators
    expect(container.querySelectorAll('svg[aria-hidden="true"]').length).toBe(3);
  });

  it('separators are marked aria-hidden="true" (Req 6.2)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
    ]);

    const { container } = render(<Breadcrumbs />);

    const svgs = container.querySelectorAll('svg');
    svgs.forEach((svg) => {
      expect(svg.getAttribute('aria-hidden')).toBe('true');
    });
  });

  // ── Req 6.3: Non-current crumbs are links ─────────────────────────────────

  it('renders non-current crumbs as <a> links with correct href (Req 6.3)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
      makeCrumb({ id: 'design', label: 'Design', href: '/projects/design' }),
    ]);

    render(<Breadcrumbs />);

    // First two crumbs are links; last is plain text
    const homeLink = screen.getByRole('link', { name: 'Home' });
    const projectsLink = screen.getByRole('link', { name: 'Projects' });

    expect(homeLink).toHaveAttribute('href', '/');
    expect(projectsLink).toHaveAttribute('href', '/projects');
  });

  it('renders all crumbs except the last as links (Req 6.3)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      { id: 'home', label: 'Home', href: '/' },
      { id: 'a', label: 'Alpha', href: '/a' },
      { id: 'b', label: 'Beta', href: '/a/b' },
      { id: 'c', label: 'Gamma', href: '/a/b/c' },
    ]);

    render(<Breadcrumbs />);

    // Home, Alpha, Beta → links; Gamma → not a link
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gamma' })).not.toBeInTheDocument();
  });

  // ── Req 6.4: Non-current crumbs have text-foreground-muted style ─────────

  it('applies text-foreground-muted class to non-current crumb links (Req 6.4)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
      makeCrumb({ id: 'design', label: 'Design', href: '/projects/design' }),
    ]);

    render(<Breadcrumbs />);

    const homeLink = screen.getByRole('link', { name: 'Home' });
    const projectsLink = screen.getByRole('link', { name: 'Projects' });

    expect(homeLink.className).toContain('text-foreground-muted');
    expect(projectsLink.className).toContain('text-foreground-muted');
  });

  // ── Req 6.5: Current page crumb (last) is not a link ─────────────────────

  it('renders the last crumb as plain text, not a link (Req 6.5)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
      makeCrumb({ id: 'current', label: 'Current Page', href: '/projects/current' }),
    ]);

    render(<Breadcrumbs />);

    // "Current Page" must NOT be a link
    expect(screen.queryByRole('link', { name: 'Current Page' })).not.toBeInTheDocument();
    // It must still be visible as text
    expect(screen.getByText('Current Page')).toBeInTheDocument();
  });

  it('marks the last crumb with aria-current="page" (Req 6.5)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'current', label: 'Current Page', href: '/current' }),
    ]);

    render(<Breadcrumbs />);

    const currentEl = screen.getByText('Current Page');
    expect(currentEl).toHaveAttribute('aria-current', 'page');
  });

  it('applies text-foreground (not muted) to the last crumb (Req 6.5)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'current', label: 'Current Page', href: '/current' }),
    ]);

    render(<Breadcrumbs />);

    const currentEl = screen.getByText('Current Page');
    expect(currentEl.className).toContain('text-foreground');
    // Must not use the muted variant
    expect(currentEl.className).not.toContain('text-foreground-muted');
  });

  // ── SPA navigation via onNavigate prop ───────────────────────────────────

  it('renders non-current crumbs as <button> elements when onNavigate is provided', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
      makeCrumb({ id: 'current', label: 'Current Page', href: '/projects/current' }),
    ]);

    render(<Breadcrumbs onNavigate={() => {}} />);

    // Non-current crumbs should be buttons, not links
    expect(screen.getByRole('button', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Projects' })).toBeInTheDocument();
    // Current crumb is still plain text (not interactive)
    expect(screen.queryByRole('button', { name: 'Current Page' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Current Page' })).not.toBeInTheDocument();
  });

  it('calls onNavigate with the correct href when a crumb button is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
      makeCrumb({ id: 'projects', label: 'Projects', href: '/projects' }),
      makeCrumb({ id: 'current', label: 'Current Page', href: '/projects/current' }),
    ]);

    render(<Breadcrumbs onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: 'Projects' }));
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith('/projects');
  });

  // ── Accessibility ─────────────────────────────────────────────────────────

  it('renders a <nav> element with aria-label="Breadcrumbs" (accessibility)', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
    ]);

    render(<Breadcrumbs />);

    expect(screen.getByRole('navigation', { name: 'Breadcrumbs' })).toBeInTheDocument();
  });

  it('accepts a custom className on the nav element', () => {
    mockUseBreadcrumbs.mockReturnValue([
      makeCrumb({ id: 'home', label: 'Home', href: '/' }),
    ]);

    render(<Breadcrumbs className="my-custom-class" />);

    const nav = screen.getByRole('navigation', { name: 'Breadcrumbs' });
    expect(nav.className).toContain('my-custom-class');
  });

  // ── Edge case: empty breadcrumbs array ────────────────────────────────────

  it('renders an empty nav without crashing when hook returns []', () => {
    mockUseBreadcrumbs.mockReturnValue([]);

    render(<Breadcrumbs />);

    const nav = screen.getByRole('navigation', { name: 'Breadcrumbs' });
    expect(nav).toBeInTheDocument();
    // No links or buttons
    expect(screen.queryAllByRole('link').length).toBe(0);
    expect(screen.queryAllByRole('button').length).toBe(0);
  });
});
