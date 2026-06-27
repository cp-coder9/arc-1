import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GlassPanel } from './GlassPanel';

describe('GlassPanel', () => {
  it('renders a semantic section element', () => {
    const { container } = render(<GlassPanel />);
    const section = container.querySelector('section');
    expect(section).toBeInTheDocument();
  });

  it('applies glass-panel class to the section', () => {
    const { container } = render(<GlassPanel />);
    const section = container.querySelector('section');
    expect(section).toHaveClass('glass-panel');
  });

  it('renders title as an h2 when provided', () => {
    render(<GlassPanel title="Project Overview" />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Project Overview');
  });

  it('applies font-heading class to the h2 title', () => {
    render(<GlassPanel title="Design Phase" />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('font-heading');
  });

  it('does not render an h2 when title is not provided', () => {
    render(<GlassPanel />);
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('renders children inside the section', () => {
    render(
      <GlassPanel>
        <p>Panel content here</p>
      </GlassPanel>
    );
    expect(screen.getByText('Panel content here')).toBeInTheDocument();
  });

  it('renders children alongside title when both provided', () => {
    render(
      <GlassPanel title="Summary">
        <span>Summary body</span>
      </GlassPanel>
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Summary');
    expect(screen.getByText('Summary body')).toBeInTheDocument();
  });

  it('merges custom className onto the section', () => {
    const { container } = render(<GlassPanel className="custom-class" />);
    const section = container.querySelector('section');
    expect(section).toHaveClass('custom-class');
    expect(section).toHaveClass('glass-panel');
  });

  it('forwards additional HTML attributes to the section', () => {
    render(<GlassPanel data-testid="panel-section" aria-label="Main panel" />);
    const section = screen.getByTestId('panel-section');
    expect(section.tagName).toBe('SECTION');
    expect(section).toHaveAttribute('aria-label', 'Main panel');
  });
});
