// ─── Form Permission Service ────────────────────────────────────────────────
// Role-based access control for the Integrated Form System.
// Implements the permission matrix defined in the design document.
// Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6

import type { FormCategory } from './formTypes';
import type { UserRole } from '@/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type FormAction = 'create' | 'edit' | 'export' | 'view' | 'approve' | 'manage_templates';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Roles with full create/edit/export access on ALL form types */
const FULL_ACCESS_ROLES: UserRole[] = [
  'architect',
  'engineer',
  'quantity_surveyor',
  'town_planner',
  'energy_professional',
  'fire_engineer',
];

/** Roles restricted to construction admin forms only for create/edit/export */
const CONSTRUCTION_ADMIN_ROLES: UserRole[] = [
  'contractor',
  'subcontractor',
];

/** Roles with view-only access unless firm_admin grants elevation */
const VIEW_ONLY_ROLES: UserRole[] = [
  'freelancer',
  'developer',
  'site_manager',
  'bep',
  'supplier',
];

/** Form categories classified as construction administration */
const CONSTRUCTION_ADMIN_CATEGORIES: FormCategory[] = [
  'site_instruction',
  'variation_order',
  'payment_certificate',
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Determines whether a form category is classified as construction administration.
 * Construction admin forms include: site instructions, variation orders, and payment certificates.
 */
export function isConstructionAdminForm(category: FormCategory): boolean {
  return CONSTRUCTION_ADMIN_CATEGORIES.includes(category);
}

// ─── Core Permission Functions ──────────────────────────────────────────────

/**
 * Checks whether a user with a given role can perform a specific action,
 * optionally scoped to a form category.
 *
 * Permission matrix:
 * - architects, engineers, QS, town planners, energy pros, fire engineers: full create/edit/export on ALL forms
 * - contractor, subcontractor: create/edit/export ONLY for construction admin forms; view-only on others
 * - client: view/download exported forms ONLY for their project; NO create/edit/export
 * - freelancer, developer, site_manager, bep, supplier: view-only unless firm_admin grants elevated access
 * - firm_admin: full access + configure approval workflows (approve action)
 * - platform_admin: full access + template management (manage_templates action)
 */
export function canPerformAction(
  userRole: string,
  action: FormAction,
  formCategory?: FormCategory
): boolean {
  const role = userRole as UserRole;

  // ─── Platform Admin: full access + template management ────────────────
  if (role === 'platform_admin') {
    return true;
  }

  // ─── Firm Admin: full access + approval workflow configuration ─────────
  if (role === 'firm_admin') {
    // firm_admin can do everything except manage_templates (platform_admin only)
    if (action === 'manage_templates') {
      return false;
    }
    return true;
  }

  // ─── Full Access Roles (professionals) ────────────────────────────────
  if (FULL_ACCESS_ROLES.includes(role)) {
    // Professionals can create, edit, export, view, and approve (if designated)
    // They cannot manage templates (platform_admin only)
    if (action === 'manage_templates') {
      return false;
    }
    return true;
  }

  // ─── Construction Admin Roles (contractor, subcontractor) ─────────────
  if (CONSTRUCTION_ADMIN_ROLES.includes(role)) {
    // manage_templates and approve are not available
    if (action === 'manage_templates' || action === 'approve') {
      return false;
    }

    // View is always allowed (they can view exported forms on their projects)
    if (action === 'view') {
      return true;
    }

    // Create, edit, export only for construction admin form types
    if (action === 'create' || action === 'edit' || action === 'export') {
      if (!formCategory) {
        // No category specified — cannot determine permission, deny by default
        return false;
      }
      return isConstructionAdminForm(formCategory);
    }

    return false;
  }

  // ─── Client Role ──────────────────────────────────────────────────────
  if (role === 'client') {
    // Clients can only view/download exported forms for their project
    if (action === 'view') {
      return true;
    }
    // No create, edit, export, approve, or manage_templates
    return false;
  }

  // ─── View-Only Roles (unless elevated by firm_admin) ──────────────────
  if (VIEW_ONLY_ROLES.includes(role)) {
    // Default: view-only access
    if (action === 'view') {
      return true;
    }
    return false;
  }

  // ─── Unknown roles: deny all actions ──────────────────────────────────
  return false;
}

/**
 * Returns the list of actions permitted for a given role,
 * optionally scoped to a form category.
 */
export function getPermittedActions(
  userRole: string,
  formCategory?: FormCategory
): FormAction[] {
  const allActions: FormAction[] = ['create', 'edit', 'export', 'view', 'approve', 'manage_templates'];
  return allActions.filter(action => canPerformAction(userRole, action, formCategory));
}
