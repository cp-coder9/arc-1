// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatCard } from './StatCard';

/**
 * Unit tests for StatCard component.
 * Requirements: 4.3, 4.4
 */

describe('StatCard', () => {
  // ── Req 4.3: label and value render ──────────────────────────────────────

  it('renders the label text', () => {
    render(<StatCard label="Active Projects" value={12} />);
    expect(screen.getByText('Active Projects')).toBeInTheDocument();
  });

  it('renders the value as a string', () => {
    render(<StatCard label="Status" value="Completed" />);
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders the value as a number', () => {
    render(<StatCard label="Count" value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders the value 0 correctly', () => {
    render(<StatCard label="Pending" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  // ── Req 4.3: glass-tile class applied ────────────────────────────────────

  it('applies glass-tile class to the root element', () => {
    const { container } = render(<StatCard label="Test" value="Val" />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('glass-tile');
  });

  // ── Req 4.3: icon renders when provided ──────────────────────────────────

  it('renders icon when provided', () => {
    render(
      <StatCard
        label="Projects"
        value={5}
        icon={<span data-testid="icon">📁</span>}
      />
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('does not render icon container when icon is omitted', () => {
    render(<StatCard label="Test" value="Val" />);
    // The icon container (glass-icon-box) should not contain any icon element
    // We verify by checking no data-testid is present
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  // ── Req 4.4: trend indicator ──────────────────────────────────────────────

  it('renders ↑ for trend direction="up"', () => {
    render(
      <StatCard
        label="Revenue"
        value="R1.2M"
        trend={{ direction: 'up', value: '+12%' }}
      />
    );
    const trend = screen.getByText(/↑/);
    expect(trend).toBeInTheDocument();
  });

  it('renders ↓ for trend direction="down"', () => {
    render(
      <StatCard
        label="Costs"
        value="R800k"
        trend={{ direction: 'down', value: '-5%' }}
      />
    );
    const trend = screen.getByText(/↓/);
    expect(trend).toBeInTheDocument();
  });

  it('applies text-green-400 class for up trend', () => {
    render(
      <StatCard
        label="Revenue"
        value="R1M"
        trend={{ direction: 'up', value: '+10%' }}
      />
    );
    // The trend pill includes the arrow and value text
    const trendEl = screen.getByText(/↑/).closest('div') as HTMLElement;
    expect(trendEl?.className).toContain('text-green-400');
  });

  it('applies text-red-400 class for down trend', () => {
    render(
      <StatCard
        label="Costs"
        value="R500k"
        trend={{ direction: 'down', value: '-3%' }}
      />
    );
    const trendEl = screen.getByText(/↓/).closest('div') as HTMLElement;
    expect(trendEl?.className).toContain('text-red-400');
  });

  it('renders the trend value string alongside the arrow', () => {
    render(
      <StatCard
        label="Revenue"
        value="R1M"
        trend={{ direction: 'up', value: '+7%' }}
      />
    );
    expect(screen.getByText(/↑.*\+7%/)).toBeInTheDocument();
  });

  it('does not render a trend indicator when trend prop is omitted', () => {
    render(<StatCard label="Test" value="Val" />);
    expect(screen.queryByText(/↑/)).not.toBeInTheDocument();
    expect(screen.queryByText(/↓/)).not.toBeInTheDocument();
  });

  // ── Typography classes ────────────────────────────────────────────────────

  it('applies text-sm text-foreground-muted classes to the label', () => {
    render(<StatCard label="My Label" value="X" />);
    const labelEl = screen.getByText('My Label');
    expect(labelEl.className).toContain('text-sm');
    expect(labelEl.className).toContain('text-foreground-muted');
  });

  it('applies text-2xl font-black classes to the value', () => {
    render(<StatCard label="Label" value="99" />);
    const valueEl = screen.getByText('99');
    expect(valueEl.className).toContain('text-2xl');
    expect(valueEl.className).toContain('font-black');
  });

  // ── onClick interactivity ─────────────────────────────────────────────────

  it('invokes onClick when tile is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<StatCard label="Clickable" value={1} onClick={handleClick} />);

    await user.click(screen.getByText('Clickable'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('sets role="button" when onClick is provided', () => {
    render(<StatCard label="Action" value={1} onClick={vi.fn()} />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('sets tabIndex=0 when onClick is provided', () => {
    const { container } = render(
      <StatCard label="Action" value={1} onClick={vi.fn()} />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('tabindex', '0');
  });

  it('does not set role when onClick is omitted', () => {
    const { container } = render(<StatCard label="Static" value={1} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveAttribute('role');
  });

  it('invokes onClick on Enter key press', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<StatCard label="KeyEnter" value={1} onClick={handleClick} />);

    const tile = screen.getByRole('button');
    tile.focus();
    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('invokes onClick on Space key press', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<StatCard label="KeySpace" value={1} onClick={handleClick} />);

    const tile = screen.getByRole('button');
    tile.focus();
    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  // ── Custom className ──────────────────────────────────────────────────────

  it('merges custom className with glass-tile', () => {
    const { container } = render(
      <StatCard label="Test" value="Val" className="my-extra" />
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('glass-tile');
    expect(root.className).toContain('my-extra');
  });
});
