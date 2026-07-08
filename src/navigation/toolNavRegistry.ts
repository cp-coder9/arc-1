import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Layers, TrendingUp, AlertTriangle, ClipboardList, FlaskConical, ShieldAlert, FileText, Landmark, Calendar, Users, Scale, Building2, BarChart3, Monitor, Settings, Activity, Library, FileEdit, Clock, Download, CheckCircle, Shield, Leaf, Search, ShieldCheck } from 'lucide-react';

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
  'itp-workspace': {
    name: 'Inspection Test Plans',
    subtitle: 'QA/QC quality assurance during construction',
    sections: [
      {
        label: 'Views',
        items: [
          { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
          { id: 'itps', icon: ClipboardList, label: 'ITPs' },
          { id: 'material-testing', icon: FlaskConical, label: 'Material Testing' },
          { id: 'hold-points', icon: ShieldAlert, label: 'Hold Points' },
          { id: 'reports', icon: FileText, label: 'Reports' },
        ],
      },
    ],
  },
  'town-planning': {
    name: 'Town Planning',
    subtitle: 'SPLUMA application lifecycle tracker',
    sections: [
      {
        label: 'Overview',
        items: [
          { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { id: 'applications', icon: ClipboardList, label: 'Applications' },
        ],
      },
      {
        label: 'Workflow',
        items: [
          { id: 'deadlines', icon: Calendar, label: 'Deadlines' },
          { id: 'participation', icon: Users, label: 'Public Participation' },
          { id: 'conditions', icon: FileText, label: 'Conditions' },
          { id: 'hearings', icon: Scale, label: 'Appeals & Hearings' },
        ],
      },
      {
        label: 'Intelligence',
        items: [
          { id: 'municipalities', icon: Building2, label: 'Municipality Profiles' },
          { id: 'reports', icon: BarChart3, label: 'Reports & Analytics' },
        ],
      },
    ],
  },
  'form-system': {
    name: 'Form System',
    subtitle: 'Auto-fill & manage construction documents',
    sections: [
      {
        label: 'Forms',
        items: [
          { id: 'library', icon: Library, label: 'Template Library' },
          { id: 'drafts', icon: FileEdit, label: 'My Drafts' },
          { id: 'recent', icon: Clock, label: 'Recent Forms' },
        ],
      },
      {
        label: 'Management',
        items: [
          { id: 'export', icon: Download, label: 'Export Queue' },
          { id: 'approvals', icon: CheckCircle, label: 'Approvals' },
          { id: 'audit', icon: Shield, label: 'Audit Trail' },
        ],
      },
    ],
  },
  'remote-desktop': {
    name: 'Remote Desktop',
    subtitle: 'Governed remote workstation sessions',
    sections: [
      {
        label: 'Sessions',
        items: [
          { id: 'active-sessions', icon: Monitor, label: 'Active Sessions' },
          { id: 'session-history', icon: Activity, label: 'Session History' },
        ],
      },
      {
        label: 'Hosts',
        items: [
          { id: 'my-hosts', icon: LayoutDashboard, label: 'My Hosts' },
          { id: 'allowlist', icon: ClipboardList, label: 'App Allowlists' },
        ],
      },
      {
        label: 'Configuration',
        items: [
          { id: 'host-settings', icon: Settings, label: 'Host Settings' },
          { id: 'audit-log', icon: FileText, label: 'Audit Log' },
        ],
      },
    ],
  },
  'eia-workspace': {
    name: 'EIA & Environmental',
    subtitle: 'Environmental compliance & green building',
    sections: [
      {
        label: 'EIA Lifecycle',
        items: [
          { id: 'overview', icon: LayoutDashboard, label: 'EIA Overview' },
          { id: 'screening', icon: Search, label: 'Activity Screening' },
          { id: 'basic-assessment', icon: ClipboardList, label: 'Basic Assessment' },
          { id: 'full-eia', icon: FileText, label: 'Full EIA' },
        ],
      },
      {
        label: 'Compliance',
        items: [
          { id: 'authorization', icon: ShieldCheck, label: 'Authorization Register' },
          { id: 'empr', icon: Shield, label: 'EMPr Monitor' },
          { id: 'public-participation', icon: Users, label: 'Public Participation' },
        ],
      },
      {
        label: 'Green Building',
        items: [
          { id: 'green-building', icon: Leaf, label: 'Green Building' },
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
