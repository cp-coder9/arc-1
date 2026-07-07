import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Layers, TrendingUp, AlertTriangle } from 'lucide-react';

/**
 * Tool Nav configuration registry.
 *
 * Each workspace tool can register a sidebar configuration here that
 * describes sections and items shown in the 200px Tool Nav column when
 * the tool is active.
 */

export interface ToolNavItem {
  id: string;
  icon: LucideIcon;
  label: string;
}

export interface ToolNavSection {
  label: string;
  items: ToolNavItem[];
}

export interface ToolNavConfig {
  name: string;
  subtitle: string;
  sections: ToolNavSection[];
}

export const TOOL_NAV_CONFIGS: Record<string, ToolNavConfig> = {
  'wingman': {
    name: 'Wingman',
    subtitle: 'AI Copilot Workspace',
    sections: [
      {
        label: 'Conversations',
        items: [
          { id: 'threads', icon: LayoutDashboard, label: 'Threads' },
          { id: 'capabilities', icon: Layers, label: 'Capabilities' },
        ],
      },
      {
        label: 'Intelligence',
        items: [
          { id: 'provenance', icon: TrendingUp, label: 'Provenance' },
          { id: 'imports', icon: AlertTriangle, label: 'AI Imports' },
        ],
      },
    ],
  },
  'feedback-roadmap': {
    name: 'Feedback Intelligence',
    subtitle: 'AI-powered feedback pipeline',
    sections: [
      {
        label: 'Dashboard',
        items: [
          { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
          { id: 'clusters', icon: Layers, label: 'Clusters' },
          { id: 'trends', icon: TrendingUp, label: 'Trends' },
          { id: 'friction-signals', icon: AlertTriangle, label: 'Friction Signals' },
        ],
      },
    ],
  },
};

/**
 * Retrieves the Tool Nav config for a given active tab/tool.
 * Returns undefined if no config is registered for the tab.
 */
export function getToolNavConfig(activeTab: string): ToolNavConfig | undefined {
  return TOOL_NAV_CONFIGS[activeTab];
}
