import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlassCard } from './GlassCard';

/**
 * Unit tests for GlassCard component.
 * Requirements: 3.8, 3.9
 */

describe('GlassCard', () => {
  // ── Req 3.8: children render inside glass-card ────────────────────────────

  it('renders children inside the card', () => {
    render(
      <GlassCard>
        <p>Card content</p>
      </GlassCard>
    );
    expect(screen.getByText('Card content')).toBeInTheDocument();
  });

  it('applies the glass-card class to the wrapper div', () => {
    const { container } = render(<GlassCard>Content</GlassCard>);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('glass-card');
  });

  it('renders multiple children inside the card', () => {
    render(
      <GlassCard>
        <span>First</span>
        <span>Second</span>
      </GlassCard>
    );
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('merges custom className with glass-card class', () => {
    const { container } = render(
      <GlassCard className="custom-class">Content</GlassCard>
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('glass-card');
    expect(div.className).toContain('custom-class');
  });

  // ── Req 3.9: onClick handler and stopPropagation ──────────────────────────

  it('invokes onClick handler when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<GlassCard onClick={handleClick}>Clickable</GlassCard>);
    await user.click(screen.getByText('Clickable'));

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('does not invoke onClick when no handler is provided', async () => {
    // Should render and be clickable without throwing
    render(<GlassCard>No handler</GlassCard>);
    await userEvent.click(screen.getByText('No handler'));
    // No error means pass
  });

  it('stopPropagation prevents click from bubbling to parent', async () => {
    const user = userEvent.setup();
    const parentHandler = vi.fn();
    const cardHandler = vi.fn();

    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div onClick={parentHandler}>
        <GlassCard onClick={cardHandler}>Inner card</GlassCard>
      </div>
    );

    await user.click(screen.getByText('Inner card'));

    expect(cardHandler).toHaveBeenCalledTimes(1);
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('invokes onClick handler on Enter key press', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<GlassCard onClick={handleClick}>Keyboard card</GlassCard>);
    const card = screen.getByRole('button', { name: 'Keyboard card' });
    card.focus();
    await user.keyboard('{Enter}');

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('invokes onClick handler on Space key press', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();

    render(<GlassCard onClick={handleClick}>Space card</GlassCard>);
    const card = screen.getByRole('button', { name: 'Space card' });
    card.focus();
    await user.keyboard(' ');

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  // ── Interactive state: role and tabIndex ──────────────────────────────────

  it('renders with role="button" when onClick is provided', () => {
    render(<GlassCard onClick={vi.fn()}>Interactive</GlassCard>);
    expect(screen.getByRole('button', { name: 'Interactive' })).toBeInTheDocument();
  });

  it('sets tabIndex=0 when onClick is provided', () => {
    const { container } = render(
      <GlassCard onClick={vi.fn()}>Focusable</GlassCard>
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div).toHaveAttribute('tabindex', '0');
  });

  it('does not set tabIndex when onClick is not provided', () => {
    const { container } = render(<GlassCard>Static</GlassCard>);
    const div = container.firstElementChild as HTMLElement;
    expect(div).not.toHaveAttribute('tabindex');
  });

  it('does not set role when onClick is not provided', () => {
    const { container } = render(<GlassCard>Static</GlassCard>);
    const div = container.firstElementChild as HTMLElement;
    expect(div).not.toHaveAttribute('role');
  });

  // ── Req 3.9: role and aria-label props ───────────────────────────────────

  it('applies custom role prop to the card element', () => {
    const { container } = render(
      <GlassCard role="article">Article card</GlassCard>
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div).toHaveAttribute('role', 'article');
  });

  it('applies aria-label prop to the card element', () => {
    render(
      <GlassCard aria-label="Project summary card">Content</GlassCard>
    );
    expect(
      screen.getByLabelText('Project summary card')
    ).toBeInTheDocument();
  });

  it('applies both role and aria-label when provided together', () => {
    const { container } = render(
      <GlassCard role="region" aria-label="Main project details">
        Details
      </GlassCard>
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div).toHaveAttribute('role', 'region');
    expect(div).toHaveAttribute('aria-label', 'Main project details');
  });

  it('custom role overrides the default interactive role', () => {
    const { container } = render(
      <GlassCard onClick={vi.fn()} role="link">
        Link-like card
      </GlassCard>
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div).toHaveAttribute('role', 'link');
  });

  // ── ref forwarding ────────────────────────────────────────────────────────

  it('forwards ref to the underlying div element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<GlassCard ref={ref}>Ref card</GlassCard>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
