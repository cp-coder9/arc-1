# Implementation Plan: Role Architecture Refinement

## Overview

This plan restructures the Architex platform's role and permission architecture by removing the conflated `admin` role, introducing project-scoped access roles (`lead_consultant`, `project_administrator`), replacing the unconditional admin bypass with scoped permission evaluation, and auditing all route definitions. Implementation proceeds from type foundations → permission service → navigation config → route guards → API middleware → project access role service → integration wiring.

## Tasks

- [x] 1. Update type foundations and permission constants
  - [x] 1.1 Remove `admin` from `UserRole` type and add `ProjectAccessRole` type in `src/types.ts`
    - Remove `'admin'` from the `UserRole` union type
    - Add `ProjectAccessRole` type with values: `project_owner`, `lead_bep`, `lead_consultant`, `project_administrator`, `design_team_member`, `contractor`, `subcontractor_package_assignee`, `supplier_package_assignee`, `freelancer_task_assignee`
    - Remove `'admin'` from `ProjectAccessRole` if present
    - Add `AdminOverrideRequest` and `AdminOverrideAuditEntry` interfaces
    - Add `ProjectAccessRoleAssignment` interface for Firestore documents
    - _Requirements: 1.1, 1.2, 3.1, 3.2_

  - [x] 1.2 Define permission sets and compatibility matrix in `src/services/permissionService.ts`
    - Add `PLATFORM_ADMIN_PERMISSIONS` constant array: `verification:review`, `audit:read`, `audit:write`, `admin:override`, `payment:manage`, `escrow:release`, `project:read`
    - Add `LEAD_CONSULTANT_PERMISSIONS` constant array: `project:read`, `project:update`, `project:manage_members`, `compliance:sign`, `municipal:manage`, `payment:read`
    - Add `PROJECT_ADMINISTRATOR_PERMISSIONS` constant array: `project:read`, `project:update`, `project:manage_members`, `audit:read`, `payment:read`, `payment:manage`
    - Add `LEAD_CONSULTANT_COMPATIBLE_ROLES` and `PROJECT_ADMINISTRATOR_COMPATIBLE_ROLES` arrays
    - Add `isProjectAccessRoleCompatibleWithUserRole()` function
    - _Requirements: 1.3, 3.3, 3.4, 3.5, 3.6_

  - [x] 1.3 Write property tests for compatibility validation (Properties 10, 11)
    - **Property 10: Lead_consultant compatibility validation**
    - **Property 11: Project_administrator compatibility validation**
    - **Validates: Requirements 3.5, 3.6**

- [x] 2. Implement normalization layer
  - [x] 2.1 Implement `normalizeUserForAuthz()` in `src/services/permissionService.ts`
    - Create `normalizeUserForAuthz(user)` function that maps `role: 'admin'` → `platform_admin`
    - Handle `admin: true` flag without role → treat as `platform_admin`
    - Handle `admin: true` + Professional_Role → preserve role + merge platform_admin permissions
    - Ensure `firm_admin` is never normalized
    - Ensure idempotency — normalizing an already-normalized user produces no change
    - Emit structured deprecation warning (level: warn, type: role_deprecation) when legacy fields detected
    - Handle `role: 'admin'` + `admin: true` simultaneously — single normalization, no duplicate grants
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 7.5_

  - [x] 2.2 Write property tests for normalization (Properties 1, 15, 17)
    - **Property 1: Role normalization preserves platform_admin identity**
    - **Property 15: firm_admin normalization immunity**
    - **Property 17: admin:true without role normalizes to platform_admin**
    - **Validates: Requirements 1.2, 1.6, 8.1, 8.5, 8.6, 7.5, 8.2**

- [x] 3. Refactor permission evaluation
  - [x] 3.1 Update `isAdminUser()` in `src/services/permissionService.ts`
    - Change check from `role === 'admin'` to `role === 'platform_admin'`
    - Retain `user.admin === true` boolean flag check
    - Return `false` for null or undefined user argument
    - _Requirements: 5.1, 5.2, 5.6_

  - [x] 3.2 Refactor `canUserPerform()` to use scoped permission evaluation
    - Remove the early-return `true` bypass for admin users
    - Evaluate `platform_admin` against its defined permission set
    - For project-scoped actions (`project:*`, `municipal:*`, `payment:*`, `compliance:sign`), require active `ProjectAccessRole` membership — except for `project:read`
    - Grant `platform_admin` implicit `project:read` on all projects without membership
    - Deny project-scoped writes if no `ProjectAccessRole` exists on the target project
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.3 Refactor `getActiveProjectAccessRoles()` to return actual memberships
    - Remove the unconditional `['admin']` return for admin users
    - Return actual project memberships from Firestore
    - `platform_admin` gets implicit `project:read` only (not full access role)
    - _Requirements: 4.2_

  - [x] 3.4 Implement `canAdminOverrideSeparationOfDuty()` with audit logging
    - Accept `AdminOverrideRequest` with reason field
    - Validate reason: `reason.trim().length >= 10`, reject otherwise
    - Verify requesting user passes `isAdminUser()`
    - Write `AdminOverrideAuditRecord` to `projects/{projectId}/auditTrail/{eventId}`
    - _Requirements: 4.6, 4.7, 4.8_

  - [x] 3.5 Write property tests for permission evaluation (Properties 3, 4, 5, 6, 14, 16)
    - **Property 3: Platform_admin denied for actions outside permission set**
    - **Property 4: Platform_admin project-scoped writes require membership**
    - **Property 5: Platform_admin retains cross-project read visibility**
    - **Property 6: Admin override requires reason of at least 10 characters**
    - **Property 14: firm_admin excluded from platform permissions**
    - **Property 16: Professional_Role with admin flag grants union permissions**
    - **Validates: Requirements 1.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 5.3, 5.4, 5.5, 7.4, 8.4**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Update navigation configuration
  - [x] 5.1 Remove `admin` and `platform_admin` from professional module role arrays in `src/navigation/architexNavigationConfig.ts`
    - Remove `'admin'` from all module role arrays
    - Remove `'platform_admin'` from professional workflow modules: toolboxes, projects, CPD & learning, documents, marketplace, finance, analytics, messages
    - Ensure professional modules contain only Professional_Role values
    - _Requirements: 2.1, 2.3_

  - [x] 5.2 Configure `platform_admin` access to platform-only modules
    - Add `'platform_admin'` only to: command centre, inbox, settings, verification queue, AI review queue, system health
    - Ensure `getNavigationForRole('platform_admin')` returns only platform admin + shared utility modules
    - _Requirements: 2.2, 2.4_

  - [x] 5.3 Implement dual-role navigation union for users with `admin: true` + Professional_Role
    - When a user holds both a Professional_Role and `platform_admin` privileges, return union of both module sets
    - _Requirements: 2.7_

  - [x] 5.4 Write property tests for navigation config (Properties 2, 7, 20)
    - **Property 2: Professional modules exclude platform_admin**
    - **Property 7: Dual-role user sees union of professional and platform modules**
    - **Property 20: Platform_admin denied access to professional module routes**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.5, 2.6, 2.7**

- [x] 6. Audit and correct route definitions in App.tsx
  - [x] 6.1 Replace `admin` in all professional module route roles arrays
    - Audit all 30+ route definitions in `CANONICAL_DASHBOARD_PAGES`
    - Replace every `'admin'` entry with the correct Professional_Role values for that page
    - Platform-only pages get `roles: ['platform_admin']`
    - Universal pages get all 15 professional roles + `'platform_admin'` (16 entries)
    - Professional module pages exclude `'platform_admin'`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 6.2 Add compile-time guard for empty or invalid role arrays
    - Add `NonEmptyArray<UserRole>` type constraint for route role definitions
    - Ensure TypeScript error on empty roles arrays
    - Add runtime check: if a route contains literal `'admin'` in roles, deny access
    - _Requirements: 6.6, 6.7_

  - [x] 6.3 Write property tests for route guard correctness (Properties 18, 19)
    - **Property 18: Route guard professional pages contain only valid Professional_Role values**
    - **Property 19: Route guard rejects literal 'admin' in roles**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.7**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement API normalization and project access role service
  - [x] 8.1 Update role middleware to normalize before permission checks in `src/lib/roleMiddleware.ts`
    - Call `normalizeUserForAuthz()` on the user profile before any permission evaluation
    - Ensure legacy `role: 'admin'` records are handled identically at the API layer as the client layer
    - _Requirements: 8.1, 8.5_

  - [x] 8.2 Implement project access role assignment and revocation in `src/services/adminRoleService.ts`
    - Implement `assignProjectAccessRole(targetUser, projectAccessRole, projectId, assignedBy)`
    - Validate Professional_Role compatibility before persisting
    - Enforce mutual exclusivity: user cannot hold both `lead_consultant` and `project_administrator` on the same project
    - Return permission error with descriptive message for incompatible assignments
    - Implement `revokeProjectAccessRole(targetUser, projectAccessRole, projectId, revokedBy)`
    - Write assignment to `projects/{projectId}/accessRoles/{userId}` in Firestore
    - _Requirements: 3.7, 3.8, 3.9_

  - [x] 8.3 Write property tests for project access roles (Properties 8, 9, 12, 13)
    - **Property 8: Lead_consultant grants correct project-scoped permissions**
    - **Property 9: Project_administrator grants correct project-scoped permissions**
    - **Property 12: Incompatible role assignment denial**
    - **Property 13: Mutual exclusivity of project access roles**
    - **Validates: Requirements 3.3, 3.4, 3.7, 3.8, 3.9**

- [x] 9. Integration wiring and firm_admin preservation
  - [x] 9.1 Wire route guard to use updated `canUserPerform()` for access decisions
    - Route guard in App.tsx should call the updated permission service for access evaluation
    - Platform_admin denied professional module routes → redirect to command centre
    - _Requirements: 2.5, 2.6_

  - [x] 9.2 Verify firm_admin scope is preserved unchanged
    - Confirm `firm_admin` retains its permission set: `project:read`, `profile:read`, `profile:update`, `audit:read`
    - Confirm `firm_admin` navigation access: command centre, inbox, projects, toolboxes, documents, analytics, messages
    - Confirm `firm_admin` is eligible for `project_administrator` assignment
    - Confirm `firm_admin` has no platform-level permissions
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 9.3 Write unit tests for firm_admin scope and integration scenarios
    - Test `getRolePermissions('firm_admin')` returns correct permission set
    - Test `getNavigationForRole('firm_admin')` returns correct modules
    - Test `isProjectAccessRoleCompatibleWithUserRole('project_administrator', 'firm_admin')` → true
    - Test platform_admin redirect to command centre on professional module URL
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check` (20 properties total)
- Unit tests validate specific examples and edge cases
- The design specifies TypeScript throughout; all implementations use the existing Vitest + fast-check ecosystem
- No Firestore migration is required at deploy time — normalization is in-memory only
- Test file locations follow the design: `src/__tests__/permissionService.property.test.ts`, `src/__tests__/navigationConfig.property.test.ts`, `src/__tests__/routeGuard.property.test.ts`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "3.1"] },
    { "id": 3, "tasks": ["2.2", "3.2", "3.3"] },
    { "id": 4, "tasks": ["3.4", "3.5"] },
    { "id": 5, "tasks": ["5.1", "5.2"] },
    { "id": 6, "tasks": ["5.3", "5.4", "6.1"] },
    { "id": 7, "tasks": ["6.2", "6.3"] },
    { "id": 8, "tasks": ["8.1", "8.2"] },
    { "id": 9, "tasks": ["8.3", "9.1"] },
    { "id": 10, "tasks": ["9.2", "9.3"] }
  ]
}
```
