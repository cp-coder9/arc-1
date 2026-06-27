// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlassInput } from './GlassInput';

/**
 * Unit tests for GlassInput component.
 * Requirements: 3.5, 3.6, 3.7
 */

describe('GlassInput', () => {
  // ── Req 3.5: placeholder, value, type props ──────────────────────────────

  it('renders with placeholder text', () => {
    render(<GlassInput placeholder="Enter your name" />);
    expect(screen.getByPlaceholderText('Enter your name')).toBeInTheDocument();
  });

  it('renders with a controlled value', () => {
    render(<GlassInput value="hello world" onChange={() => {}} />);
    const input = screen.getByDisplayValue('hello world');
    expect(input).toBeInTheDocument();
  });

  it('renders with correct type attribute', () => {
    render(<GlassInput type="email" placeholder="Email" />);
    const input = screen.getByPlaceholderText('Email');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('defaults to no explicit type (browser default "text" behaviour)', () => {
    render(<GlassInput placeholder="Default" />);
    const input = screen.getByPlaceholderText('Default');
    // When type is omitted the attribute is absent or "text"
    const type = input.getAttribute('type');
    expect(type === null || type === 'text').toBe(true);
  });

  it('applies the glass-input class', () => {
    render(<GlassInput placeholder="Styled" />);
    const input = screen.getByPlaceholderText('Styled');
    expect(input.className).toContain('glass-input');
  });

  it('merges additional className with glass classes', () => {
    render(<GlassInput placeholder="Extra" className="my-custom-class" />);
    const input = screen.getByPlaceholderText('Extra');
    expect(input.className).toContain('glass-input');
    expect(input.className).toContain('my-custom-class');
  });

  it('forwards arbitrary native input props (e.g. name, id)', () => {
    render(<GlassInput name="username" id="username-input" placeholder="User" />);
    const input = screen.getByPlaceholderText('User');
    expect(input).toHaveAttribute('name', 'username');
    expect(input).toHaveAttribute('id', 'username-input');
  });

  // ── Req 3.6: focus state applies ring classes ─────────────────────────────
  // CSS :focus-within effects (border-color shift + ring box-shadow) are
  // applied via the glass-input CSS class and are not inspectable through
  // jsdom's CSSOM without a full browser stylesheet.  We verify the structural
  // prerequisite: the input carries both `glass-input` (which defines the
  // :focus-within rule) and `focus-visible-ring` (the Tailwind utility that
  // provides the keyboard focus outline).

  it('carries focus-visible-ring class for keyboard focus outline (Req 3.6)', () => {
    render(<GlassInput placeholder="Focus test" />);
    const input = screen.getByPlaceholderText('Focus test');
    expect(input.className).toContain('focus-visible-ring');
  });

  it('suppresses default browser outline via focus:outline-none', () => {
    render(<GlassInput placeholder="Outline test" />);
    const input = screen.getByPlaceholderText('Outline test');
    // The raw class string produced by cn() includes the Tailwind utility
    expect(input.className).toContain('focus:outline-none');
  });

  it('input element receives focus on tab', async () => {
    const user = userEvent.setup();
    render(<GlassInput placeholder="Tab focus" />);
    const input = screen.getByPlaceholderText('Tab focus');

    await user.tab();

    expect(input).toHaveFocus();
  });

  // ── Req 3.7 / disabled state ──────────────────────────────────────────────

  it('applies opacity-50 and cursor-not-allowed classes when disabled', () => {
    render(<GlassInput placeholder="Disabled" disabled />);
    const input = screen.getByPlaceholderText('Disabled');
    expect(input.className).toContain('disabled:opacity-50');
    expect(input.className).toContain('disabled:cursor-not-allowed');
  });

  it('sets the disabled attribute on the underlying <input>', () => {
    render(<GlassInput placeholder="Disabled" disabled />);
    const input = screen.getByPlaceholderText('Disabled');
    expect(input).toBeDisabled();
  });

  it('does not fire onChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<GlassInput placeholder="Disabled" disabled onChange={handleChange} />);
    const input = screen.getByPlaceholderText('Disabled');

    await user.type(input, 'abc');

    expect(handleChange).not.toHaveBeenCalled();
  });

  // ── Req 10.1–10.3: keyboard navigation (Tab) ─────────────────────────────

  it('Tab navigates forward through multiple inputs', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GlassInput placeholder="First" />
        <GlassInput placeholder="Second" />
        <GlassInput placeholder="Third" />
      </>
    );

    const first = screen.getByPlaceholderText('First');
    const second = screen.getByPlaceholderText('Second');
    const third = screen.getByPlaceholderText('Third');

    first.focus();
    expect(first).toHaveFocus();

    await user.tab();
    expect(second).toHaveFocus();

    await user.tab();
    expect(third).toHaveFocus();
  });

  it('Shift+Tab navigates backward through multiple inputs', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GlassInput placeholder="First" />
        <GlassInput placeholder="Second" />
        <GlassInput placeholder="Third" />
      </>
    );

    const first = screen.getByPlaceholderText('First');
    const second = screen.getByPlaceholderText('Second');
    const third = screen.getByPlaceholderText('Third');

    third.focus();
    expect(third).toHaveFocus();

    await user.tab({ shift: true });
    expect(second).toHaveFocus();

    await user.tab({ shift: true });
    expect(first).toHaveFocus();
  });

  it('disabled inputs are skipped during Tab navigation', async () => {
    const user = userEvent.setup();
    render(
      <>
        <GlassInput placeholder="First" />
        <GlassInput placeholder="Skipped" disabled />
        <GlassInput placeholder="Third" />
      </>
    );

    const first = screen.getByPlaceholderText('First');
    const third = screen.getByPlaceholderText('Third');

    first.focus();
    await user.tab();

    // Disabled input should be skipped; focus should land on Third
    expect(third).toHaveFocus();
  });

  // ── onChange / uncontrolled typing ───────────────────────────────────────

  it('calls onChange handler when user types', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    render(<GlassInput placeholder="Type here" onChange={handleChange} />);

    await user.type(screen.getByPlaceholderText('Type here'), 'hi');

    expect(handleChange).toHaveBeenCalled();
  });
});
