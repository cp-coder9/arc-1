/**
 * Unit tests for the Bird_Mark primitive.
 *
 * Feature: website-ui-redesign (Task 2.4)
 * Validates: Requirements 6.3, 6.4, 6.5, 4.8, 9.9
 *
 * Coverage:
 *  - 6.3  Meaningful Bird_Mark exposes the exact text alternative "Architex".
 *  - 6.4  The Wordmark "ARCHITEX" replaces the mark on a load error OR after the
 *         3-second load timeout.
 *  - 6.5  The Wordmark fallback retains the "Architex" accessible name.
 *  - 6.3  Decorative shards are aria-hidden / absent from the accessibility tree.
 *  - 4.8 / 9.9  Interactive instances are a focusable role="button" activator
 *         (accessible name "Enter Architex OS") that fires onActivate on pointer
 *         click and on the Enter and Space keys.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BirdMark } from '../BirdMark';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BirdMark — meaningful instance accessible name (Req 6.3)', () => {
  it('exposes the exact "Architex" text alternative on the PNG image', () => {
    render(<BirdMark size="hero" />);

    // The meaningful image is announced as "Architex" (alt attribute).
    const img = screen.getByRole('img', { name: 'Architex' });
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('alt', 'Architex');
  });

  it('sources the mark from public/logo.png without an SVG conversion (Req 6.1)', () => {
    render(<BirdMark size="topbar" />);

    const img = screen.getByRole('img', { name: 'Architex' });
    expect(img.getAttribute('src')).toMatch(/logo\.png$/);
  });
});

describe('BirdMark — decorative shards (Req 6.3)', () => {
  it('hides decorative instances from the accessibility tree', () => {
    const { container } = render(<BirdMark size="shard" decorative />);

    // No accessible image is exposed for a decorative shard.
    expect(screen.queryByRole('img')).toBeNull();

    // The underlying <img> carries an empty alt and is aria-hidden.
    const rawImg = container.querySelector('img');
    expect(rawImg).not.toBeNull();
    expect(rawImg).toHaveAttribute('alt', '');
    expect(rawImg).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('BirdMark — Wordmark fallback on load error (Req 6.4, 6.5)', () => {
  it('replaces the mark with the "ARCHITEX" Wordmark and retains the "Architex" name', () => {
    render(<BirdMark size="hero" />);

    const img = screen.getByRole('img', { name: 'Architex' });

    // Simulate the asset failing to load.
    fireEvent.error(img);

    // The PNG <img> is gone; the Wordmark text is shown in its place.
    expect(screen.queryByRole('img', { name: 'Architex' })?.tagName).not.toBe('IMG');
    const wordmark = screen.getByText('ARCHITEX');
    expect(wordmark).toBeInTheDocument();

    // The "Architex" accessible name is retained on the fallback (role="img").
    const fallback = screen.getByRole('img', { name: 'Architex' });
    expect(fallback).toHaveTextContent('ARCHITEX');
    expect(fallback).toHaveAttribute('aria-label', 'Architex');
  });
});

describe('BirdMark — Wordmark fallback on 3s timeout (Req 6.4, 6.5)', () => {
  it('swaps to the Wordmark when the asset does not load within 3 seconds', () => {
    vi.useFakeTimers();
    try {
      render(<BirdMark size="hero" />);

      // Initially the PNG image is rendered (asset not yet settled).
      expect(screen.getByRole('img', { name: 'Architex' }).tagName).toBe('IMG');

      // Advance past the 3-second load timeout.
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // The Wordmark fallback is now shown, retaining the "Architex" name.
      const fallback = screen.getByRole('img', { name: 'Architex' });
      expect(fallback.tagName).not.toBe('IMG');
      expect(fallback).toHaveTextContent('ARCHITEX');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not swap before the timeout elapses', () => {
    vi.useFakeTimers();
    try {
      render(<BirdMark size="hero" />);

      act(() => {
        vi.advanceTimersByTime(2999);
      });

      // Still the PNG image — the timeout has not fired yet.
      expect(screen.getByRole('img', { name: 'Architex' }).tagName).toBe('IMG');
      expect(screen.queryByText('ARCHITEX')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('BirdMark — interactive activator (Req 4.8, 9.9)', () => {
  it('renders a focusable button with the "Enter Architex OS" accessible name', () => {
    render(<BirdMark size="hero" interactive onActivate={() => {}} />);

    const button = screen.getByRole('button', { name: 'Enter Architex OS' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('tabindex', '0');

    // The control is focusable.
    button.focus();
    expect(button).toHaveFocus();
  });

  it('does not expose a duplicate "Architex" image name while interactive', () => {
    render(<BirdMark size="hero" interactive onActivate={() => {}} />);

    // The activator owns the name; the inner image is decorative/hidden.
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('fires onActivate on pointer click', async () => {
    const onActivate = vi.fn();
    const user = userEvent.setup();
    render(<BirdMark size="hero" interactive onActivate={onActivate} />);

    await user.click(screen.getByRole('button', { name: 'Enter Architex OS' }));

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('fires onActivate on the Enter key while focused', () => {
    const onActivate = vi.fn();
    render(<BirdMark size="hero" interactive onActivate={onActivate} />);

    const button = screen.getByRole('button', { name: 'Enter Architex OS' });
    button.focus();
    fireEvent.keyDown(button, { key: 'Enter' });

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('fires onActivate on the Space key while focused', () => {
    const onActivate = vi.fn();
    render(<BirdMark size="hero" interactive onActivate={onActivate} />);

    const button = screen.getByRole('button', { name: 'Enter Architex OS' });
    button.focus();
    fireEvent.keyDown(button, { key: ' ' });

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('does not fire onActivate for unrelated keys', () => {
    const onActivate = vi.fn();
    render(<BirdMark size="hero" interactive onActivate={onActivate} />);

    const button = screen.getByRole('button', { name: 'Enter Architex OS' });
    button.focus();
    fireEvent.keyDown(button, { key: 'a' });
    fireEvent.keyDown(button, { key: 'Tab' });

    expect(onActivate).not.toHaveBeenCalled();
  });
});
