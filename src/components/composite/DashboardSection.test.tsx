import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DashboardSection } from './DashboardSection';

describe('DashboardSection', () => {
  it('renders a semantic <section> element', () => {
    const { container } = render(
      <DashboardSection title="Overview">
        <p>Content</p>
      </DashboardSection>
    );
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('renders title as h2 with font-heading and font-bold', () => {
    render(
      <DashboardSection title="Active Projects">
        <p>Content</p>
      </DashboardSection>
    );
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('Active Projects');
    expect(heading).toHaveClass('font-heading');
    expect(heading).toHaveClass('font-bold');
  });

  it('wraps children in a glass-panel container', () => {
    const { container } = render(
      <DashboardSection title="Section">
        <span data-testid="child">Hello</span>
      </DashboardSection>
    );
    const child = screen.getByTestId('child');
    const glassPanel = child.closest('.glass-panel');
    expect(glassPanel).toBeInTheDocument();
  });

  it('renders description below the title when provided', () => {
    render(
      <DashboardSection title="Team" description="Your assigned team members">
        <p>Content</p>
      </DashboardSection>
    );
    expect(screen.getByText('Your assigned team members')).toBeInTheDocument();
  });

  it('does not render description element when not provided', () => {
    render(
      <DashboardSection title="Team">
        <p>Content</p>
      </DashboardSection>
    );
    // Only the heading and the child should exist — no description paragraph
    expect(screen.queryByText(/assigned/i)).not.toBeInTheDocument();
  });

  it('renders icon inside glass-icon-box when provided', () => {
    const { container } = render(
      <DashboardSection title="Documents" icon={<span data-testid="icon">📄</span>}>
        <p>Content</p>
      </DashboardSection>
    );
    const icon = screen.getByTestId('icon');
    expect(icon).toBeInTheDocument();
    // The icon should be inside a glass-icon-box container
    const iconBox = container.querySelector('.glass-icon-box');
    expect(iconBox).toBeInTheDocument();
    expect(iconBox).toContainElement(icon);
  });

  it('does not render glass-icon-box when icon is not provided', () => {
    const { container } = render(
      <DashboardSection title="Documents">
        <p>Content</p>
      </DashboardSection>
    );
    expect(container.querySelector('.glass-icon-box')).not.toBeInTheDocument();
  });

  it('renders action element when provided', () => {
    render(
      <DashboardSection
        title="Projects"
        action={<button data-testid="action-btn">Add Project</button>}
      >
        <p>Content</p>
      </DashboardSection>
    );
    expect(screen.getByTestId('action-btn')).toBeInTheDocument();
    expect(screen.getByText('Add Project')).toBeInTheDocument();
  });

  it('does not render an action wrapper when action is not provided', () => {
    const { container } = render(
      <DashboardSection title="Projects">
        <p>Content</p>
      </DashboardSection>
    );
    // The header flex row should only have the title div, no trailing action div
    const headerRow = container.querySelector('.flex.items-center.justify-between');
    // Action element itself is absent — title heading is present but no button
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(headerRow).toBeInTheDocument();
  });

  it('action element is aligned to the right of the header row', () => {
    const { container } = render(
      <DashboardSection
        title="Projects"
        action={<button>View All</button>}
      >
        <p>Content</p>
      </DashboardSection>
    );
    const headerRow = container.querySelector('.flex.items-center.justify-between');
    expect(headerRow).toBeInTheDocument();
    // The action button should be a child of the header row
    const btn = screen.getByRole('button', { name: 'View All' });
    expect(headerRow).toContainElement(btn);
  });

  it('merges custom className onto the outer section', () => {
    const { container } = render(
      <DashboardSection title="Custom" className="my-custom-class">
        <p>Content</p>
      </DashboardSection>
    );
    const section = container.querySelector('section');
    expect(section).toHaveClass('my-custom-class');
  });

  it('renders icon, description, and action together', () => {
    render(
      <DashboardSection
        title="Full Section"
        description="A complete section with all props"
        icon={<span data-testid="full-icon">🏗️</span>}
        action={<button data-testid="full-action">Action</button>}
      >
        <p data-testid="full-content">Body content</p>
      </DashboardSection>
    );
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Full Section');
    expect(screen.getByText('A complete section with all props')).toBeInTheDocument();
    expect(screen.getByTestId('full-icon')).toBeInTheDocument();
    expect(screen.getByTestId('full-action')).toBeInTheDocument();
    expect(screen.getByTestId('full-content')).toBeInTheDocument();
  });
});
