/**
 * Insurance Register Access Control
 *
 * Module-specific permission checks using the p1-shared RBAC service.
 * Provides convenience functions for common Insurance Register permission checks.
 *
 * Requirements: 1.9, 21.1, 21.2
 */

import { createP1AccessControlService } from '@/features/p1-shared/services/accessControl';
import type { P1AccessContext, AccessCheckResult } from '@/features/p1-shared/services/accessControl';

const accessControl = createP1AccessControlService();

export function checkInsuranceAccess(ctx: P1AccessContext, action: 'read' | 'write' | 'create' | 'manage' | 'admin'): AccessCheckResult {
  return accessControl.checkAccess(ctx, 'insurance_register', action);
}

export function getInsurancePermittedActions(ctx: P1AccessContext): string[] {
  return accessControl.getPermittedActions(ctx, 'insurance_register');
}

export function canRegisterPolicy(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'insurance_register', 'create').granted;
}

export function canUpdatePolicy(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'insurance_register', 'write').granted;
}

export function canManagePolicies(ctx: P1AccessContext): boolean {
  return accessControl.checkAccess(ctx, 'insurance_register', 'manage').granted;
}
