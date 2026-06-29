import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatCardAnimated } from './StatCardAnimated';

describe('StatCardAnimated', () => {
  it('renders the label and value', () => {
    render(<StatCardAnimated label="Active Projects" value={12} />);

    expect(screen.getByText('Active Projects')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders string values as-is', () => {
    render(<StatCardAnimated label="Status" value="On Track" />);

    expect(screen.getByText('On Track')).toBeInTheDocument();
  });

  it('applies the glass-tile class', () => {
    const { container } = render(<StatCardAnimated label="Due" value="3" />);

    const tile = container.querySelector('.glass-tile');
    expect(tile).not.toBeNull();
  });

  it('renders an icon when provided', () => {
    render(
      <StatCardAnimated
        label="Team"
        value={5}
        icon={<span data-testid="stat-icon">★</span>}
      />,
    );

    expect(screen.getByTestId('stat-icon')).toBeInTheDocument();
  });

  it('renders an upward trend with ↑ and green styling', () => {
    render(
      <StatCardAnimated
        label="Revenue"
        value="R1.2M"
        trend={{ direction: 'up', value: '+8%' }}
      />,
    );

    const pill = screen.getByText(/\+8%/);
    expect(pill.textContent).toContain('↑');
    expect(pill.className).toContain('text-green-400');
  });

  it('renders a downward trend with ↓ and red styling', () => {
    render(
      <StatCardAnimated
        label="Defects"
        value={4}
        trend={{ direction: 'down', value: '-2' }}
      />,
    );

    const pill = screen.getByText(/-2/);
    expect(pill.textContent).toContain('↓');
    expect(pill.className).toContain('text-red-400');
  });

  it('does not render a trend pill when trend is omitted', () => {
    render(<StatCardAnimated label="Members" value={10} />);

    expect(screen.queryByText('↑')).toBeNull();
    expect(screen.queryByText('↓')).toBeNull();
  });

  it('invokes onClick and exposes button affordances when clickable', () => {
    const onClick = vi.fn();
    render(<StatCardAnimated label="Tasks" value={7} onClick={onClick} />);

    const card = screen.getByRole('button');
    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not expose a button role when not clickable', () => {
    render(<StatCardAnimated label="Tasks" value={7} />);

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders with reduced motion preference without error', () => {
    render(
      <StatCardAnimated label="Tasks" value={7} prefersReducedMotion />,
    );

    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });
});
