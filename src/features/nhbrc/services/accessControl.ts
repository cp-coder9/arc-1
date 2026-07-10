/**
 * NHBRC Access Control
 *
 * Module-specific permission checks using the p1-shared RBAC service.
 * Provides convenience functions for common NHBRC permission checks.
 *
 * Permitted roles: contractor, developer, site_manager, client, architect, engineer
 * - contractor/developer: read, write, create, manage
 * - site_manager: read, write
 * - client: read
 * - architect/engineer: read, write
 * - admin/platform_admin: all
 *
 * Requirements: 21.5–21.7
 */

import { createP1AccessControlService } from '@/features/p1-shared/services/accessControl';
import type { P1AccessContext, AccessCheckResult } from '@/features/p1-shared/services/accessControl';

const accessControl = createP1AccessControlService();

export function checkNHBRCAccess(ctx: P1AccessContext, action: 'read' | 'write' | 'create' | 'manage' | 'admin'): AccessCheckResult {
  return accessControl.checkAccess(ctx, 'nhbrc', action);
}

export function getNHBRCPermittedActions(ctx: P1AccessContext): string[] {
  return accessControl.getPermittedActions(ctx, 'nhbrc');
}

export function canManageEnrolment(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'nhbrc', 'manage').granted;
}

export function canRecordInspection(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'nhbrc', 'write').granted;
}

export function canViewNHBRC(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'nhbrc', 'read').granted;
}
