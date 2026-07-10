import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ProjectOption {
  id: string;
  name: string;
  address: string;
  status: 'active' | 'on_hold' | 'completed' | 'archived' | string;
}

export interface FormProjectSelectorProps {
  /** Array of projects the user is a team member of */
  projects: ProjectOption[];
  /** Currently selected project ID (null for standalone) */
  selectedProjectId: string | null;
  /** Callback when a project is selected */
  onSelect: (projectId: string) => void;
  /** Callback when standalone mode is chosen (no project context) */
  onStandalone: () => void;
  /** Number of fields that will be re-resolved on project switch (shown as summary) */
  fieldsToResolve?: number;
  /** Whether the selector is disabled */
  disabled?: boolean;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  toggleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  searchContainer: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchInput: {
    padding: '5px 12px 5px 30px',
    borderRadius: 9999,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--foreground)',
    fontSize: 12,
    fontWeight: 500,
    outline: 'none',
    width: 180,
    transition: 'border-color 0.12s',
  },
  searchIcon: {
    position: 'absolute',
    left: 10,
    width: 14,
    height: 14,
    color: 'var(--muted-foreground)',
    pointerEvents: 'none',
  },
  disabledMessage: {
    fontSize: 12,
    color: 'var(--muted-foreground)',
    fontStyle: 'italic',
    padding: '6px 0',
  },
  resolveSummary: {
    fontSize: 11,
    color: 'var(--muted-foreground)',
    padding: '4px 0',
  },
};

// ─── Component ──────────────────────────────────────────────────────────────

/**
 * FormProjectSelector — compact horizontal project toggle selector.
 *
 * Uses CSS class-based styling (.p-toggle pattern) matching the project-toggles
 * pattern from the platform HTML samples.
 */
export function FormProjectSelector({
  projects,
  selectedProjectId,
  onSelect,
  onStandalone,
  fieldsToResolve,
  disabled = false,
}: FormProjectSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const showSearch = projects.length > 10;

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.address.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  // Disabled state: no projects available
  if (disabled || projects.length === 0) {
    return (
      <div style={styles.container} className="project-toggles" data-testid="form-project-selector">
        <div style={styles.disabledMessage}>
          No projects available. You can proceed with manual-only form filling.
        </div>
        <div style={styles.toggleRow}>
          <button
            className="p-toggle active"
            onClick={onStandalone}
            type="button"
            aria-label="Standalone mode"
            data-testid="project-toggle-standalone"
          >
            Standalone
          </button>
        </div>
      </div>
    );
  }

  const getDotClass = (status: string): string => {
    switch (status) {
      case 'active':
        return 'dot green';
      case 'on_hold':
        return 'dot amber';
      default:
        return 'dot slate';
    }
  };

  const isStandalone = selectedProjectId === null;

  return (
    <div style={styles.container} className="project-toggles" data-testid="form-project-selector">
      {showSearch && (
        <div style={styles.searchContainer}>
          <Search style={styles.searchIcon as React.CSSProperties} />
          <input
            type="text"
            placeholder="Filter projects…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
            aria-label="Search projects"
            data-testid="project-search-input"
          />
        </div>
      )}

      <div style={styles.toggleRow}>
        {filteredProjects.map((project) => {
          const isSelected = project.id === selectedProjectId;
          return (
            <button
              key={project.id}
              className={`p-toggle${isSelected ? ' active' : ''}`}
              onClick={() => onSelect(project.id)}
              type="button"
              title={`${project.name} — ${project.address}`}
              aria-pressed={isSelected}
              data-testid={`project-toggle-${project.id}`}
            >
              <span className={getDotClass(project.status)} />
              {project.name}
            </button>
          );
        })}

        {/* Standalone button at end */}
        <button
          className={`p-toggle${isStandalone ? ' active' : ''}`}
          onClick={onStandalone}
          type="button"
          aria-pressed={isStandalone}
          data-testid="project-toggle-standalone"
        >
          Standalone
        </button>
      </div>

      {/* Re-resolution summary shown when switching projects */}
      {fieldsToResolve != null && fieldsToResolve > 0 && (
        <div style={styles.resolveSummary} data-testid="resolve-summary">
          {fieldsToResolve} field{fieldsToResolve !== 1 ? 's' : ''} will be re-resolved with the new project data.
        </div>
      )}
    </div>
  );
}

export default FormProjectSelector;
