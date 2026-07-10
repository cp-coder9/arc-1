'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Plus, FolderOpen } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  value: number;
  stage: string;
  lastAccessed: string;
}

interface ProjectSwitcherProps {
  activeProjectId: string;
  activeProjectName?: string;
  onProjectSelect: (projectId: string) => void;
  onNewProject?: () => void;
}

export default function ProjectSwitcher({
  activeProjectId,
  activeProjectName,
  onProjectSelect,
  onNewProject,
}: ProjectSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projects] = useState<Project[]>([]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 hover:border-surface-600/50 transition-colors"
      >
        <FolderOpen className="h-4 w-4 text-primary-400 shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium truncate">{activeProjectName ?? 'Select Project'}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-lg border border-surface-700/50 bg-surface-800/95 backdrop-blur shadow-xl overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {projects.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No projects found</p>
            ) : (
              projects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => {
                    onProjectSelect(project.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-surface-700/50 transition-colors ${
                    project.id === activeProjectId ? 'bg-primary-600/10' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-xs text-muted-foreground">R {(project.value / 1_000_000).toFixed(1)}M · {project.stage}</p>
                  </div>
                  {project.id === activeProjectId && (
                    <Badge variant="outline" className="text-[10px] shrink-0">Active</Badge>
                  )}
                </button>
              ))
            )}
          </div>
          {onNewProject && (
            <div className="border-t border-surface-700/50 p-2">
              <Button
                size="sm"
                variant="ghost"
                className="w-full gap-1 justify-start"
                onClick={() => {
                  onNewProject();
                  setIsOpen(false);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New Project
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
