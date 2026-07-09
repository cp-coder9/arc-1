// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormProjectSelector, type ProjectOption } from './FormProjectSelector';

const mockProjects: ProjectOption[] = [
  { id: 'p1', name: '45 Kloof St', address: '45 Kloof Street, Cape Town', status: 'active' },
  { id: 'p2', name: '12 Riverside Ave', address: '12 Riverside Avenue, Johannesburg', status: 'active' },
  { id: 'p3', name: 'Sunset Views Ph2', address: '88 Sunset Drive, Durban', status: 'on_hold' },
  { id: 'p4', name: 'Mountain View Estate', address: '1 Mountain Rd, Pretoria', status: 'completed' },
];

// Generate >10 projects for search test
const manyProjects: ProjectOption[] = Array.from({ length: 12 }, (_, i) => ({
  id: `proj-${i}`,
  name: `Project ${i}`,
  address: `${i} Test Street, City ${i}`,
  status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'on_hold' : 'completed',
}));

describe('FormProjectSelector', () => {
  it('renders project toggle buttons for each project', () => {
    const onSelect = vi.fn();
    const onStandalone = vi.fn();
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p2"
        onSelect={onSelect}
        onStandalone={onStandalone}
      />
    );

    expect(screen.getByTestId('project-toggle-p1')).toBeInTheDocument();
    expect(screen.getByTestId('project-toggle-p2')).toBeInTheDocument();
    expect(screen.getByTestId('project-toggle-p3')).toBeInTheDocument();
    expect(screen.getByTestId('project-toggle-p4')).toBeInTheDocument();
    expect(screen.getByTestId('project-toggle-standalone')).toBeInTheDocument();
  });

  it('marks the selected project as active', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p2"
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    const selectedBtn = screen.getByTestId('project-toggle-p2');
    expect(selectedBtn.className).toContain('active');

    const otherBtn = screen.getByTestId('project-toggle-p1');
    expect(otherBtn.className).not.toContain('active');
  });

  it('shows active styling with green dot for active projects', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    const activeToggle = screen.getByTestId('project-toggle-p1');
    const dot = activeToggle.querySelector('.dot');
    expect(dot).toHaveClass('green');
  });

  it('shows amber dot for on_hold projects', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    const holdToggle = screen.getByTestId('project-toggle-p3');
    const dot = holdToggle.querySelector('.dot');
    expect(dot).toHaveClass('amber');
  });

  it('calls onSelect when a project toggle is clicked', () => {
    const onSelect = vi.fn();
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p1"
        onSelect={onSelect}
        onStandalone={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('project-toggle-p3'));
    expect(onSelect).toHaveBeenCalledWith('p3');
  });

  it('calls onStandalone when standalone button is clicked', () => {
    const onStandalone = vi.fn();
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p1"
        onSelect={vi.fn()}
        onStandalone={onStandalone}
      />
    );

    fireEvent.click(screen.getByTestId('project-toggle-standalone'));
    expect(onStandalone).toHaveBeenCalled();
  });

  it('marks standalone as active when selectedProjectId is null', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    const standalone = screen.getByTestId('project-toggle-standalone');
    expect(standalone.className).toContain('active');
  });

  it('shows search field when projects exceed 10', () => {
    render(
      <FormProjectSelector
        projects={manyProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    expect(screen.getByTestId('project-search-input')).toBeInTheDocument();
  });

  it('does not show search field when projects are 10 or fewer', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    expect(screen.queryByTestId('project-search-input')).not.toBeInTheDocument();
  });

  it('filters projects by name when search is typed', () => {
    render(
      <FormProjectSelector
        projects={manyProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('project-search-input');
    fireEvent.change(searchInput, { target: { value: 'Project 5' } });

    // Only "Project 5" should match
    expect(screen.getByTestId('project-toggle-proj-5')).toBeInTheDocument();
    expect(screen.queryByTestId('project-toggle-proj-0')).not.toBeInTheDocument();
  });

  it('filters projects by address', () => {
    render(
      <FormProjectSelector
        projects={manyProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    const searchInput = screen.getByTestId('project-search-input');
    fireEvent.change(searchInput, { target: { value: 'City 3' } });

    expect(screen.getByTestId('project-toggle-proj-3')).toBeInTheDocument();
    expect(screen.queryByTestId('project-toggle-proj-0')).not.toBeInTheDocument();
  });

  it('shows disabled state with message when no projects available', () => {
    render(
      <FormProjectSelector
        projects={[]}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
      />
    );

    expect(screen.getByText(/No projects available/)).toBeInTheDocument();
    // Only standalone should be visible
    expect(screen.getByTestId('project-toggle-standalone')).toBeInTheDocument();
  });

  it('shows disabled state when disabled prop is true', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId={null}
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
        disabled
      />
    );

    expect(screen.getByText(/No projects available/)).toBeInTheDocument();
  });

  it('displays re-resolution summary when fieldsToResolve is provided', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p2"
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
        fieldsToResolve={5}
      />
    );

    expect(screen.getByTestId('resolve-summary')).toHaveTextContent(
      '5 fields will be re-resolved with the new project data.'
    );
  });

  it('does not display re-resolution summary when fieldsToResolve is 0', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p2"
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
        fieldsToResolve={0}
      />
    );

    expect(screen.queryByTestId('resolve-summary')).not.toBeInTheDocument();
  });

  it('shows singular field text for fieldsToResolve = 1', () => {
    render(
      <FormProjectSelector
        projects={mockProjects}
        selectedProjectId="p2"
        onSelect={vi.fn()}
        onStandalone={vi.fn()}
        fieldsToResolve={1}
      />
    );

    expect(screen.getByTestId('resolve-summary')).toHaveTextContent(
      '1 field will be re-resolved with the new project data.'
    );
  });
});
