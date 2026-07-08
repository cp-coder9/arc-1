# Requirements Document

## Introduction

The Architex platform currently conflates system administration with professional project-level elevation. The `admin` role appears in 30+ route definitions as a "god mode" shortcut, granting access to virtually every page. Both `admin` and `platform_admin` exist with identical permissions, yet `platform_admin` is ignored in route protection. This spec restructures the role architecture to clearly separate platform operations from project-level professional permissions, introduces a project-scoped permission model, and removes `admin` from professional tool access lists.

## Glossary

- **Permission_Service**: The centralized authorization service (`src/services/permissionService.ts`) that evaluates role-based and project-level permissions.
- **Route_Guard**: The route protection mechanism in `App.tsx` that gates dashboard page access by user role arrays.
- **Navigation_Config**: The role-aware navigation configuration (`src/navigation/architexNavigationConfig.ts`) that determines which modules a user sees.
- **Platform_Operator**: A user responsible for Architex system administration — user management, finance oversight, system health, and troubleshooting. Formerly split across `admin` and `platform_admin`.
- **Project_Permission**: A scoped permission granted to a professional user for a specific project, enabling elevated access without global privilege.
- **Lead_Consultant**: A project-level role granting a professional elevated coordination and oversight permissions on a single project.
- **Project_Administrator**: A project-level role granting a professional full administrative control over a single project (team management, settings, audit).
- **Professional_Role**: Any of the 15 domain-specific user roles (architect, bep, engineer, contractor, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, developer, freelancer, subcontractor, supplier, land_surveyor, firm_admin).
- **UserRole_Type**: The TypeScript union type defining all valid platform user roles.
- **ProjectAccessRole_Type**: The TypeScript union type defining all valid project-scoped access roles.

## Requirements

### Requirement 1: Consolidate Platform Operator Role

**User Story:** As a platform operator, I want a single clearly-defined admin role, so that there is no confusion between `admin` and `platform_admin` and I have one identity for system administration.

#### Acceptance Criteria

1. THE Permission_Service SHALL define exactly one platform operator role named `platform_admin` in the UserRole_Type.
2. THE Permission_Service SHALL reject any role assignment or role check against the literal `admin` at runtime, treating it as an invalid role value not present in the UserRole_Type union.
3. THE Permission_Service SHALL assign `platform_admin` all system-level permissions: `verification:review`, `audit:read`, `audit:write`, `admin:override`, `payment:manage`, `escrow:release`.
4. IF a user has the `platform_admin` role, THEN THE Permission_Service SHALL grant access to platform operations pages (admin console, platform settings, verification queue, system health).
5. IF a user has the `platform_admin` role, THEN THE Permission_Service SHALL NOT grant access to professional tool pages (toolboxes, design compliance, construction admin, specforge).
6. IF a legacy user record contains `role: 'admin'`, THEN THE Permission_Service SHALL normalize it to `platform_admin` at runtime before evaluating any permission checks, as specified in Requirement 8.

### Requirement 2: Remove Admin From Professional Tool Access

**User Story:** As a professional user, I want tool access determined by my professional role, so that I see only the tools relevant to my discipline without a system admin role polluting the access lists.

#### Acceptance Criteria

1. THE Navigation_Config SHALL NOT include `platform_admin` in the top-level roles array for the following professional workflow modules: toolboxes, projects, CPD & learning, documents, marketplace, finance, analytics, messages.
2. WHEN `getNavigationForRole` is called with `platform_admin`, THE Navigation_Config SHALL NOT return any of the professional workflow modules listed in criterion 1.
3. WHEN determining module visibility for a professional workflow module, THE Navigation_Config SHALL include only Professional_Role values (client, architect, engineer, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, bep, contractor, subcontractor, supplier, freelancer, developer, firm_admin) in that module's roles array.
4. THE Navigation_Config SHALL grant `platform_admin` access exclusively to platform administration modules (settings, verification queue, AI review queue, system health) and shared utility modules (command centre, inbox).
5. IF a user holding only the `platform_admin` role navigates to a URL path corresponding to a professional workflow module, THEN THE Route_Guard SHALL deny access and redirect the user to the command centre.
6. WHEN a platform operator requires access to a professional tool or project workspace, THE Permission_Service SHALL grant access only if that user also holds at least one Professional_Role value or a Project_Permission record granting explicit access to the relevant project.
7. IF a user holds both `platform_admin` and a Professional_Role, THEN THE Navigation_Config SHALL include professional modules corresponding to the held Professional_Role while continuing to include platform administration modules.

### Requirement 3: Introduce Project-Level Permission Roles

**User Story:** As an architect leading a project, I want elevated permissions scoped to my specific project, so that I can manage the team and settings without needing global admin access.

#### Acceptance Criteria

1. THE Permission_Service SHALL define `lead_consultant` as a valid ProjectAccessRole_Type value.
2. THE Permission_Service SHALL define `project_administrator` as a valid ProjectAccessRole_Type value.
3. WHEN a user holds the `lead_consultant` role on a project, THE Permission_Service SHALL grant `project:read`, `project:update`, `project:manage_members`, `compliance:sign`, `municipal:manage`, and `payment:read` for that project.
4. WHEN a user holds the `project_administrator` role on a project, THE Permission_Service SHALL grant `project:read`, `project:update`, `project:manage_members`, `audit:read`, `payment:read`, and `payment:manage` for that project.
5. THE Permission_Service SHALL validate that `lead_consultant` is compatible with Professional_Role values: `bep`, `architect`, `engineer`, `quantity_surveyor`, `town_planner`, `energy_professional`, `fire_engineer`.
6. THE Permission_Service SHALL validate that `project_administrator` is compatible with Professional_Role values: `bep`, `architect`, `engineer`, `quantity_surveyor`, `contractor`, `firm_admin`.
7. IF a user does NOT hold a compatible Professional_Role for the target ProjectAccessRole_Type, THEN THE Permission_Service SHALL deny the assignment request, return a permission error indicating the incompatible role combination, and leave the user's existing project memberships unchanged.
8. WHEN a user with `project:manage_members` permission on a project assigns a `lead_consultant` or `project_administrator` role to another user, THE Permission_Service SHALL verify the target user's Professional_Role compatibility before persisting the assignment.
9. THE Permission_Service SHALL allow a single user to hold at most one of `lead_consultant` or `project_administrator` on the same project at any given time.

### Requirement 4: Refactor Admin Bypass in Permission Checks

**User Story:** As a security-conscious platform owner, I want the admin bypass removed from permission checks, so that platform operators are governed by explicit permissions rather than blanket overrides.

#### Acceptance Criteria

1. WHEN `canUserPerform()` is called for a `platform_admin` user, THE Permission_Service SHALL evaluate permissions against the `platform_admin` role's defined permission set rather than returning `true` unconditionally.
2. THE Permission_Service SHALL remove the early-return bypass for admin users in `canUserPerform()` and the unconditional `['admin']` return in `getActiveProjectAccessRoles()`.
3. WHEN a `platform_admin` user attempts a project-scoped action (any action prefixed with `project:`, `municipal:`, or `payment:`, or the action `compliance:sign`), THE Permission_Service SHALL require that user to have an active ProjectAccessRole on the target project, except for `project:read`.
4. THE Permission_Service SHALL grant `platform_admin` users `project:read` on all projects without requiring a ProjectAccessRole, so that platform operators retain read-only cross-project visibility for oversight and troubleshooting.
5. IF a `platform_admin` user has no ProjectAccessRole on a project, THEN THE Permission_Service SHALL deny project-scoped write actions (`project:update`, `project:manage_members`, `compliance:sign`, `municipal:manage`, `payment:manage`, `escrow:release`) for that project.
6. THE Permission_Service SHALL retain `admin:override` as a permission that allows a `platform_admin` user to escalate access to any single project-scoped action by providing an audit-logged reason of at least 10 characters explaining the operational necessity.
7. WHEN a `platform_admin` invokes `admin:override`, THE Permission_Service SHALL record the override in the project audit trail including the admin's UID, the action being escalated, the target project ID, a timestamp, and the provided reason.
8. IF the reason provided to `admin:override` is fewer than 10 characters or empty, THEN THE Permission_Service SHALL reject the override request and deny the escalated action.

### Requirement 5: Update isAdminUser Recognition

**User Story:** As a developer, I want admin detection to be consistent and recognize only `platform_admin`, so that there are no dead code paths checking for the removed `admin` role.

#### Acceptance Criteria

1. THE Permission_Service SHALL update `isAdminUser()` to check `user.role === 'platform_admin'` instead of `user.role === 'admin'`.
2. THE Permission_Service SHALL retain the `user.admin === true` boolean flag check in `isAdminUser()` so that legacy user records lacking the `platform_admin` role value but carrying the boolean flag are still recognized as admin users.
3. WHEN `isAdminUser()` returns true, THE Permission_Service SHALL use this result exclusively for platform-level feature gates (admin console access, system settings, verification queues, platform governance views) and SHALL NOT use it to bypass project-scoped permission evaluation.
4. WHEN a platform_admin user attempts a project-scoped action, THE Permission_Service SHALL evaluate that user against the same role-permission and project-membership checks applied to non-admin users, falling through to normal `getRolePermissions` and `getActiveProjectAccessRoles` logic.
5. THE Permission_Service SHALL NOT use `isAdminUser()` as an early-return bypass in `canUserPerform()` or any other permission evaluation function, except for `canAdminOverrideSeparationOfDuty()` where the override is already guarded by a mandatory audit reason of at least 10 characters.
6. IF `isAdminUser()` is invoked with a null or undefined user argument, THEN THE Permission_Service SHALL return false.

### Requirement 6: Audit All Route Definitions

**User Story:** As a platform architect, I want every route definition to declare the correct professional roles, so that access control is explicit and auditable rather than relying on an overloaded admin role.

#### Acceptance Criteria

1. THE Route_Guard SHALL declare a non-empty roles array containing only Professional_Role values for each professional module page (projects, toolboxes, CPD & learning, documents, marketplace, finance, analytics).
2. THE Route_Guard SHALL NOT include `admin` or `platform_admin` in the roles array for any professional module page.
3. WHEN a dashboard page is used by more than one professional discipline, THE Route_Guard SHALL list each applicable Professional_Role individually in the roles array (no wildcard or group shorthand).
4. THE Route_Guard SHALL define platform-only pages (admin console, platform settings, verification queue, AI review queue, system health) with a roles array containing exclusively `platform_admin`.
5. THE Route_Guard SHALL define universal pages (command centre, inbox, messages) with a roles array containing all 15 Professional_Role values plus `platform_admin` (16 entries total).
6. WHEN a new dashboard page is added, THE Route_Guard SHALL reject the route definition at compile time if its roles array is empty or contains zero valid UserRole_Type values.
7. IF a route definition's roles array contains the literal `admin`, THEN THE Route_Guard SHALL treat the route as misconfigured and deny access until the role is replaced with the correct Professional_Role or `platform_admin` value.

### Requirement 7: Preserve Firm Admin Scope

**User Story:** As a firm administrator, I want my role unchanged by this restructuring, so that I can continue managing my practice without disruption.

#### Acceptance Criteria

1. THE Permission_Service SHALL retain `firm_admin` as a distinct Professional_Role with the permission set: `project:read`, `profile:read`, `profile:update`, `audit:read`.
2. THE Navigation_Config SHALL retain `firm_admin` access to the following modules: command centre, inbox, projects, toolboxes, documents, analytics, messages.
3. THE Permission_Service SHALL validate that `firm_admin` is eligible for assignment of the `project_administrator` ProjectAccessRole_Type, such that a user holding `firm_admin` as their Professional_Role may be granted `project_administrator` on any project.
4. THE Permission_Service SHALL NOT grant `firm_admin` any platform-level system administration permissions (`admin:override`, `verification:review`, `escrow:release`, `payment:manage`).
5. IF the `admin`-to-`platform_admin` migration logic encounters a user with `role: 'firm_admin'`, THEN THE Permission_Service SHALL leave that user's role unchanged and SHALL NOT normalize it to `platform_admin`.

### Requirement 8: Migration Path for Existing Admin Users

**User Story:** As a platform operator currently using the `admin` role, I want a seamless migration to `platform_admin`, so that I retain my access without manual intervention.

#### Acceptance Criteria

1. WHEN the application loads a user profile with `role: 'admin'`, THE Permission_Service SHALL normalize it to `platform_admin` in memory before any permission evaluation, without writing the change back to the Firestore document.
2. WHEN the application loads a user profile with `admin: true` boolean flag and no `role` field (or `role` is undefined), THE Permission_Service SHALL treat that user as holding the `platform_admin` role for all permission evaluations.
3. WHEN the Permission_Service normalizes `admin` to `platform_admin` (via `role: 'admin'` or `admin: true` without a Professional_Role), THE Permission_Service SHALL emit a structured deprecation warning to the server-side application log containing the user's UID and the legacy field detected.
4. WHEN a user has both a Professional_Role value in their `role` field and `admin: true` boolean flag, THE Permission_Service SHALL grant that user the union of their Professional_Role permissions and `platform_admin` platform-level permissions, preserving both role scopes.
5. IF a user's Firestore document contains `role: 'admin'`, THEN THE Permission_Service SHALL resolve permissions identically to a document containing `role: 'platform_admin'`, requiring no Firestore document migration at deploy time.
6. IF the Permission_Service encounters a user profile where both `role: 'admin'` and `admin: true` are present simultaneously, THEN THE Permission_Service SHALL normalize once to `platform_admin` and SHALL NOT duplicate permission grants.
