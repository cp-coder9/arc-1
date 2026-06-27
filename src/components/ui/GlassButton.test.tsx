import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlassButton } from './GlassButton';

describe('GlassButton', () => {
  // ─── Variant prop ──────────────────────────────────────────────────────────

  describe('variant prop', () => {
    it('applies glass-button class for outline variant (default)', () => {
      render(<GlassButton>Click me</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Click me' });
      expect(btn.className).toContain('glass-button');
    });

    it('applies glass-button class when variant="outline" is explicit', () => {
      render(<GlassButton variant="outline">Outline</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Outline' });
      expect(btn.className).toContain('glass-button');
      expect(btn.className).not.toContain('glass-button-solid');
    });

    it('applies glass-button-solid class when variant="solid"', () => {
      render(<GlassButton variant="solid">Solid</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Solid' });
      expect(btn.className).toContain('glass-button-solid');
    });

    it('does not apply glass-button-solid for the outline variant', () => {
      render(<GlassButton variant="outline">Outline</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Outline' });
      expect(btn.className).not.toContain('glass-button-solid');
    });

    it('does not apply plain glass-button for the solid variant', () => {
      render(<GlassButton variant="solid">Solid</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Solid' });
      // glass-button-solid must be present, but the base "glass-button"
      // class (without -solid suffix) should not appear separately
      const classes = btn.className.split(/\s+/);
      expect(classes).not.toContain('glass-button');
    });
  });

  // ─── Size prop ─────────────────────────────────────────────────────────────

  describe('size prop', () => {
    it('applies sm padding classes when size="sm"', () => {
      render(<GlassButton size="sm">Small</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Small' });
      expect(btn.className).toContain('px-3');
      expect(btn.className).toContain('py-1');
      expect(btn.className).toContain('text-sm');
    });

    it('applies md padding classes when size="md" (default)', () => {
      render(<GlassButton>Medium</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Medium' });
      expect(btn.className).toContain('px-4');
      expect(btn.className).toContain('py-2');
      expect(btn.className).toContain('text-base');
    });

    it('applies lg padding classes when size="lg"', () => {
      render(<GlassButton size="lg">Large</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Large' });
      expect(btn.className).toContain('px-6');
      expect(btn.className).toContain('py-3');
      expect(btn.className).toContain('text-lg');
    });

    it('defaults to md size when size prop is omitted', () => {
      render(<GlassButton>Default Size</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Default Size' });
      expect(btn.className).toContain('px-4');
      expect(btn.className).toContain('py-2');
    });
  });

  // ─── Disabled state ────────────────────────────────────────────────────────

  describe('disabled state', () => {
    it('applies opacity-50 class when disabled', () => {
      render(<GlassButton disabled>Disabled</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Disabled' });
      expect(btn.className).toContain('opacity-50');
    });

    it('applies cursor-not-allowed class when disabled', () => {
      render(<GlassButton disabled>Disabled</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Disabled' });
      expect(btn.className).toContain('cursor-not-allowed');
    });

    it('has the disabled HTML attribute when disabled', () => {
      render(<GlassButton disabled>Disabled</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Disabled' });
      expect(btn).toBeDisabled();
    });

    it('prevents click events when disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(
        <GlassButton disabled onClick={handleClick}>
          Disabled
        </GlassButton>,
      );
      await user.click(screen.getByRole('button', { name: 'Disabled' }));
      expect(handleClick).not.toHaveBeenCalled();
    });

    it('invokes onClick when not disabled', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(<GlassButton onClick={handleClick}>Enabled</GlassButton>);
      await user.click(screen.getByRole('button', { name: 'Enabled' }));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('does not apply disabled classes when enabled', () => {
      render(<GlassButton>Enabled</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Enabled' });
      expect(btn.className).not.toContain('opacity-50');
      expect(btn.className).not.toContain('cursor-not-allowed');
    });
  });

  // ─── Focus-visible ring ────────────────────────────────────────────────────

  describe('focus-visible-ring', () => {
    it('has focus-visible-ring class applied', () => {
      render(<GlassButton>Focusable</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Focusable' });
      expect(btn.className).toContain('focus-visible-ring');
    });

    it('receives focus on keyboard Tab navigation', async () => {
      const user = userEvent.setup();
      render(<GlassButton>Tab Focus</GlassButton>);
      await user.tab();
      expect(screen.getByRole('button', { name: 'Tab Focus' })).toHaveFocus();
    });

    it('can be activated via Enter key when focused', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(<GlassButton onClick={handleClick}>Keyboard Enter</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Keyboard Enter' });
      btn.focus();
      await user.keyboard('{Enter}');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('can be activated via Space key when focused', async () => {
      const handleClick = vi.fn();
      const user = userEvent.setup();
      render(<GlassButton onClick={handleClick}>Keyboard Space</GlassButton>);
      const btn = screen.getByRole('button', { name: 'Keyboard Space' });
      btn.focus();
      await user.keyboard(' ');
      expect(handleClick).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Aria-label for icon-only buttons ─────────────────────────────────────

  describe('aria-label for icon-only buttons', () => {
    it('renders with aria-label when provided', () => {
      render(
        <GlassButton aria-label="Close dialog">
          ✕
        </GlassButton>,
      );
      expect(
        screen.getByRole('button', { name: 'Close dialog' }),
      ).toBeInTheDocument();
    });

    it('aria-label is accessible to screen readers via accessible name', () => {
      render(
        <GlassButton aria-label="Open settings menu">
          {/* icon only — no visible text */}
          <svg aria-hidden="true" />
        </GlassButton>,
      );
      const btn = screen.getByRole('button', { name: 'Open settings menu' });
      expect(btn).toBeInTheDocument();
    });

    it('renders icon-only button without visible text content', () => {
      render(
        <GlassButton aria-label="Notifications">
          🔔
        </GlassButton>,
      );
      const btn = screen.getByRole('button', { name: 'Notifications' });
      expect(btn).toBeInTheDocument();
    });
  });

  // ─── General rendering ─────────────────────────────────────────────────────

  describe('general rendering', () => {
    it('renders a <button> element', () => {
      render(<GlassButton>Hello</GlassButton>);
      expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
    });

    it('always has rounded-full class', () => {
      render(<GlassButton>Rounded</GlassButton>);
      expect(
        screen.getByRole('button', { name: 'Rounded' }).className,
      ).toContain('rounded-full');
    });

    it('accepts additional className via props', () => {
      render(<GlassButton className="my-extra-class">Extra</GlassButton>);
      expect(
        screen.getByRole('button', { name: 'Extra' }).className,
      ).toContain('my-extra-class');
    });

    it('forwards ref to the underlying button element', () => {
      const ref = { current: null } as React.RefObject<HTMLButtonElement | null>;
      render(<GlassButton ref={ref}>Ref test</GlassButton>);
      expect(ref.current).not.toBeNull();
      expect(ref.current?.tagName).toBe('BUTTON');
    });

    it('passes through arbitrary HTML button attributes', () => {
      render(
        <GlassButton type="submit" data-testid="submit-btn">
          Submit
        </GlassButton>,
      );
      const btn = screen.getByTestId('submit-btn');
      expect(btn).toHaveAttribute('type', 'submit');
    });
  });
});
