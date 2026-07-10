/**
 * Dispute Resolution Access Control
 *
 * Module-specific permission checks using the p1-shared RBAC service.
 * Provides convenience functions for common Dispute Resolution permission checks.
 *
 * Requirements: 21.3, 21.4
 */

import { createP1AccessControlService } from '@/features/p1-shared/services/accessControl';
import type { P1AccessContext, AccessCheckResult } from '@/features/p1-shared/services/accessControl';

const accessControl = createP1AccessControlService();

export function checkDisputeAccess(ctx: P1AccessContext, action: 'read' | 'write' | 'create' | 'manage' | 'admin'): AccessCheckResult {
  return accessControl.checkAccess(ctx, 'dispute_resolution', action);
}

export function getDisputePermittedActions(ctx: P1AccessContext): string[] {
  return accessControl.getPermittedActions(ctx, 'dispute_resolution');
}

export function canRegisterClaim(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'dispute_resolution', 'create').granted;
}

export function canManageClaims(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'dispute_resolution', 'manage').granted;
}

export function canViewClaims(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'dispute_resolution', 'read').granted;
}
