# Bugfix Requirements Document

## Introduction

The `UserRole` type in `src/types.ts` is missing `'cpm'` (Construction Project Manager) as a union member, despite it being used across 8 files in role permission maps, visibility configs, toolbox configs, and command centre configs. This causes 8 TypeScript TS2353 errors when running `tsc --noEmit -p tsconfig.app.json` — each error is a `Record<UserRole, ...>` or `Record<NormalizedUserRole, ...>` literal that includes `'cpm'` as a key but the type doesn't recognize it.

Previously, `'admin'`, `'land_surveyor'`, and `'health_safety'` were also missing from the union — those have since been resolved. Only `'cpm'` remains as the outstanding role drift issue.

Note: There are approximately 75 other unrelated type errors in the codebase from recent feature work; those are out of scope for this bugfix.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `'cpm'` is used as a key in a `Record<UserRole, ...>` object literal THEN the system emits TS2353 error: "'cpm' does not exist in type 'Record<UserRole, ...>'"

1.2 WHEN `'cpm'` is used as a key in a `Record<NormalizedUserRole, ...>` object literal (where `NormalizedUserRole = Exclude<UserRole, 'architect'>`) THEN the system emits TS2353 error: "'cpm' does not exist in type 'Record<NormalizedUserRole, ...>'"

1.3 WHEN `tsc --noEmit -p tsconfig.app.json` is executed THEN the system reports 8 errors across 8 files related to `'cpm'` not existing in `Record<UserRole, ...>` or `Record<NormalizedUserRole, ...>`

### Expected Behavior (Correct)

2.1 WHEN `'cpm'` is used as a key in a `Record<UserRole, ...>` object literal THEN the system SHALL accept it as a valid key without type errors

2.2 WHEN `'cpm'` is used as a key in a `Record<NormalizedUserRole, ...>` object literal THEN the system SHALL accept it as a valid key without type errors (since adding `'cpm'` to `UserRole` automatically includes it in `NormalizedUserRole`)

2.3 WHEN `tsc --noEmit -p tsconfig.app.json` is executed THEN the system SHALL report zero errors related to `'cpm'` role type mismatches

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `'admin'` is used as a key in role maps or in role comparisons THEN the system SHALL CONTINUE TO accept it as a valid `UserRole` member without type errors

3.2 WHEN `'land_surveyor'` is used as a key in role maps or in role comparisons THEN the system SHALL CONTINUE TO accept it as a valid `UserRole` member without type errors

3.3 WHEN `'health_safety'` is used as a key in role maps or in role comparisons THEN the system SHALL CONTINUE TO accept it as a valid `UserRole` member without type errors

3.4 WHEN the existing 19 canonical roles (`client`, `architect`, `freelancer`, `bep`, `contractor`, `subcontractor`, `supplier`, `engineer`, `quantity_surveyor`, `town_planner`, `energy_professional`, `fire_engineer`, `site_manager`, `developer`, `firm_admin`, `platform_admin`, `admin`, `land_surveyor`, `health_safety`) are used in type contexts THEN the system SHALL CONTINUE TO accept them without type errors

3.5 WHEN `NormalizedUserRole` (defined as `Exclude<UserRole, 'architect'>`) is used in role permission maps THEN the system SHALL CONTINUE TO correctly exclude `'architect'` and include all other `UserRole` members

3.6 WHEN the `CANONICAL_USER_ROLES` array in `permissionService.ts` is checked against the `UserRole` type via `satisfies readonly UserRole[]` THEN the system SHALL CONTINUE TO pass type validation

3.7 WHEN the Zod `UserRoleEnum` schema in `src/lib/schemas.ts` validates role strings THEN the system SHALL CONTINUE TO accept all valid `UserRole` values
