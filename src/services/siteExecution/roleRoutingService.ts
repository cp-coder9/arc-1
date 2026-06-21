import type { Snag, UserRole } from './types';

export const snagCreatorRoles: UserRole[] = ['architect', 'client', 'project_manager', 'contractor', 'subcontractor', 'site_manager', 'engineer', 'qs', 'health_safety'];
export const snagAssigneeRoles: UserRole[] = ['contractor', 'subcontractor', 'site_manager', 'architect', 'engineer', 'project_manager', 'supplier'];
export function canCreateSnag(role: UserRole) { return snagCreatorRoles.includes(role); }
export function canAssignSnagTo(role: UserRole) { return snagAssigneeRoles.includes(role); }
export function defaultSnagVerifier(snag: Snag): UserRole { if (['critical', 'high'].includes(snag.severity)) return snag.createdByRole === 'client' ? 'project_manager' : snag.createdByRole; return snag.createdByRole; }
export function rfiResponderFor(text: string): UserRole { if (/structural|steel|foundation|slab/i.test(text)) return 'engineer'; if (/rate|boq|cost|claim|variation/i.test(text)) return 'qs'; return 'architect'; }
