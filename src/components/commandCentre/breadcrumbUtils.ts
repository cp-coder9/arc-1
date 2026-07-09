/**
 * Breadcrumb Generation Utilities — Command Centre
 *
 * Pure utility functions for building Command Centre breadcrumb strings.
 * Exported for property testing (Property 10).
 *
 * Requirements: 6.4
 */

import type { CommandCentreView } from '@/services/commandCentre/types';

/**
 * Human-readable labels for each Command Centre view identifier.
 * Used by breadcrumb and header display logic.
 */
export const VIEW_LABELS: Record<CommandCentreView, string> = {
  dashboard: 'Dashboard',
  programme: 'Programme',
  tasks: 'Task Board',
  milestones: 'Milestones',
  calendar: 'Calendar',
  team: 'Team',
  'site-diary': 'Site Diary',
  rfis: 'RFIs & Instructions',
  issues: 'Issues',
  quality: 'Quality Tracker',
  budget: 'Budget Controller',
  valuations: 'Valuations',
  procurement: 'Procurement',
  contracts: 'Contracts',
  analytics: 'Analytics & KPIs',
  'ai-advisor': 'AI Advisor',
  documents: 'Documents',
  settings: 'Settings',
  actions: 'Action Centre',
  notifications: 'Notifications',
  passport: 'Passport',
  'form-system': 'Forms',
  'audit-trail': 'Audit Trail',
};

/**
 * Get the human-readable label for a Command Centre view identifier.
 */
export function getViewLabel(viewId: CommandCentreView): string {
  return VIEW_LABELS[viewId] ?? 'Command Centre';
}

/**
 * Build a breadcrumb string for the Command Centre header/Top Bar.
 *
 * **Property 10 (Breadcrumb Generation):**
 * For any non-empty projectName string and valid CommandCentreView identifier,
 * produces a string matching: "Architex › Command Centre › {projectName} › {viewLabel}"
 * where {viewLabel} is the human-readable label for the view.
 *
 * @param projectName - The active project's display name (non-empty string)
 * @param viewId - The active Command Centre view identifier
 * @returns Formatted breadcrumb string with › separators
 *
 * Validates: Requirements 6.4
 */
export function buildBreadcrumb(projectName: string, viewId: CommandCentreView): string {
  const viewLabel = getViewLabel(viewId);
  return `Architex › Command Centre › ${projectName} › ${viewLabel}`;
}
