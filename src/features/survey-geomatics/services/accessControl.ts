/**
 * Survey & Geomatics Access Control
 *
 * Module-specific permission checks using the p1-shared RBAC service.
 * Provides convenience functions for common Survey & Geomatics permission checks.
 *
 * Requirements: 21.8, 21.9
 */

import { createP1AccessControlService } from '@/features/p1-shared/services/accessControl';
import type { P1AccessContext, AccessCheckResult } from '@/features/p1-shared/services/accessControl';

const accessControl = createP1AccessControlService();

export function checkSurveyAccess(ctx: P1AccessContext, action: 'read' | 'write' | 'create' | 'manage' | 'admin'): AccessCheckResult {
  return accessControl.checkAccess(ctx, 'survey_geomatics', action);
}

export function getSurveyPermittedActions(ctx: P1AccessContext): string[] {
  return accessControl.getPermittedActions(ctx, 'survey_geomatics');
}

export function canCreateInstruction(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'survey_geomatics', 'create').granted;
}

export function canManageSurvey(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'survey_geomatics', 'manage').granted;
}

export function canViewSurvey(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'survey_geomatics', 'read').granted;
}
