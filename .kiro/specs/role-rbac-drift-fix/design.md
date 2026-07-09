# Role RBAC Drift Fix — Bugfix Design

## Overview

The `UserRole` type union in `src/types.ts` is missing the `'cpm'` (Construction Project Manager) member. This role is already used as a key in `Record<UserRole, ...>` and `Record<NormalizedUserRole, ...>` literals across 8 files — permission maps, visibility configs, toolbox configs, and command centre configs — causing 8 TS2353 type errors. The fix adds `'cpm'` to the `UserRole` type union and synchronizes two related type artifacts: the Zod `UserRoleEnum` schema in `src/lib/schemas.ts` and the `CANONICAL_USER_ROLES` array in `src/services/permissionService.ts`.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — when `'cpm'` is used as a key in a `Record<UserRole, ...>` or `Record<NormalizedUserRole, ...>` object literal, causing TS2353 errors
- **Property (P)**: The desired behavior — TypeScript accepts `'cpm'` as a valid key without type errors
- **Preservation**: Existing 19-role type system behavior and all derived types (`NormalizedUserRole`, Zod schema, canonical array) must remain unchanged
- **UserRole**: The string literal union type in `src/types.ts` defining all valid platform user roles
- **NormalizedUserRole**: Derived type `Exclude<UserRole, 'architect'>` in `src/services/permissionService.ts` — automatically includes `'cpm'` once it is added to `UserRole`
- **CANONICAL_USER_ROLES**: Runtime array in `permissionService.ts` typed as `satisfies readonly UserRole[]` — must include every `UserRole` member
- **UserRoleEnum**: Zod enum schema in `src/lib/schemas.ts` used for runtime validation of role strings

## Bug Details

### Bug Condition

The bug manifests when `'cpm'` is used as a key in any `Record<UserRole, ...>` or `Record<NormalizedUserRole, ...>` object literal. TypeScript's structural type checking rejects `'cpm'` because it is not a member of the `UserRole` union, producing TS2353 errors across 8 files.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { file: string, key: string, recordType: string }
  OUTPUT: boolean
  
  RETURN input.key == 'cpm'
         AND input.recordType IN ['Record<UserRole, ...>', 'Record<NormalizedUserRole, ...>']
         AND 'cpm' NOT IN UserRole_union_members
END FUNCTION
```

### Examples

- `src/services/permissionService.ts` — `ROLE_PERMISSIONS` map includes `cpm: ['project:read', ...]` but `NormalizedUserRole` doesn't include `'cpm'` → TS2353
- `src/components/ProjectToolboxPage.tsx` — toolbox config object has `cpm: { title: 'Construction Project Manager Toolbox', ... }` → TS2353
- `src/components/ProjectCommandCentre.tsx` — command centre view config has `cpm: { viewLabel: 'CPM View', ... }` → TS2353
- `src/components/UserSettings.tsx` — role-specific settings fields include `cpm: [...]` → TS2353
- `src/services/platformSpineBridge.ts` — role mapping includes `cpm: 'contractor'` → TS2353
- `src/services/orchestration/hooks/useOrchestrationServices.ts` — role mapping includes `cpm: 'site_manager'` → TS2353
- `src/services/municipalTrackerWorkflowService.ts` — visibility config includes `cpm: ['public_project', 'project_team']` → TS2353
- `src/services/projectCommandCentreService.ts` — command centre config includes `cpm: {}` → TS2353

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- All 19 existing `UserRole` members (`client`, `architect`, `freelancer`, `bep`, `contractor`, `subcontractor`, `supplier`, `engineer`, `quantity_surveyor`, `town_planner`, `energy_professional`, `fire_engineer`, `site_manager`, `developer`, `firm_admin`, `platform_admin`, `admin`, `land_surveyor`, `health_safety`) must continue to be accepted without type errors
- `NormalizedUserRole` must continue to exclude `'architect'` and include all other members
- `CANONICAL_USER_ROLES` must continue to pass `satisfies readonly UserRole[]` validation
- The Zod `UserRoleEnum` schema must continue to accept all valid `UserRole` values
- Role permission maps, visibility configs, and toolbox configs for existing roles must remain unchanged
- The `permissionService.test.ts` alignment check (`UserRoleEnum.options` equals `CANONICAL_USER_ROLES`) must continue to pass

**Scope:**
All type contexts that do NOT involve the `'cpm'` literal should be completely unaffected by this fix. This includes:
- All existing role-based permission checks
- All existing role-based navigation and visibility logic
- All existing Zod schema validations for roles
- All existing `NormalizedUserRole` derived type usage

## Hypothesized Root Cause

Based on the bug description, the root cause is straightforward:

1. **Missing Union Member**: The `UserRole` type in `src/types.ts` was not updated when `'cpm'` was introduced as a role across the codebase. The type currently has 19 members but usage sites assume 20.

2. **Cascading Type Artifacts**: Two runtime artifacts derive from `UserRole` and also need updating:
   - `CANONICAL_USER_ROLES` in `permissionService.ts` — must include `'cpm'` to satisfy `readonly UserRole[]`
   - `UserRoleEnum` in `src/lib/schemas.ts` — must include `'cpm'` in the Zod enum options array

3. **Prior Precedent**: The same pattern occurred with `'admin'`, `'land_surveyor'`, and `'health_safety'` — those were previously missing from the union and have since been resolved. The fix pattern is identical.

## Correctness Properties

Property 1: Bug Condition — CPM Role Accepted in Record Types

_For any_ TypeScript source file where `'cpm'` is used as a key in a `Record<UserRole, ...>` or `Record<NormalizedUserRole, ...>` object literal, the fixed `UserRole` type SHALL include `'cpm'` as a valid union member, causing `tsc --noEmit` to produce zero TS2353 errors related to `'cpm'`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation — Existing Role Type System Unchanged

_For any_ type context using the existing 19 canonical roles, the fixed type system SHALL produce the same type-checking results as before the fix, preserving all existing role acceptance, `NormalizedUserRole` exclusion logic, `CANONICAL_USER_ROLES` array validation, and Zod schema acceptance.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/types.ts`

**Type**: `UserRole`

**Specific Changes**:
1. **Add `'cpm'` to the UserRole union**: Append `| 'cpm'` to the existing type union. This is a single-line change at the end of the union.

---

**File**: `src/services/permissionService.ts`

**Array**: `CANONICAL_USER_ROLES`

**Specific Changes**:
2. **Add `'cpm'` to the CANONICAL_USER_ROLES array**: Add `'cpm'` as an element in the array. Since this array uses `satisfies readonly UserRole[]`, adding `'cpm'` to `UserRole` first makes this addition type-safe.

---

**File**: `src/lib/schemas.ts`

**Schema**: `UserRoleEnum`

**Specific Changes**:
3. **Add `'cpm'` to the Zod enum options**: Add `'cpm'` to the `z.enum([...])` array in `UserRoleEnum`. This keeps the runtime validation schema in sync with the TypeScript type.

---

**No other files require changes** — the 8 files with TS2353 errors are already correct in their usage of `'cpm'` as a key; they just need the type to recognize it.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, confirm that `tsc` produces the 8 TS2353 errors on unfixed code (exploratory), then verify the fix eliminates those errors while preserving all other type-checking behavior.

### Exploratory Bug Condition Checking

**Goal**: Confirm that `tsc --noEmit -p tsconfig.app.json` produces exactly 8 TS2353 errors related to `'cpm'` on the UNFIXED code.

**Test Plan**: Run the TypeScript compiler on the unfixed codebase and grep for `cpm`-related TS2353 errors to confirm the bug condition.

**Test Cases**:
1. **Type Check Unfixed Code**: Run `tsc --noEmit -p tsconfig.app.json 2>&1 | grep "cpm"` — expect 8 error lines (will fail on unfixed code)
2. **Permission Service Error**: Confirm `permissionService.ts` reports TS2353 for `'cpm'` key (will fail on unfixed code)
3. **Toolbox Config Error**: Confirm `ProjectToolboxPage.tsx` reports TS2353 for `'cpm'` key (will fail on unfixed code)
4. **Command Centre Error**: Confirm `ProjectCommandCentre.tsx` reports TS2353 for `'cpm'` key (will fail on unfixed code)

**Expected Counterexamples**:
- TypeScript emits `TS2353: Object literal may only specify known properties, and 'cpm' does not exist in type 'Record<UserRole, ...>'`
- Root cause confirmed: `'cpm'` is simply absent from the `UserRole` type union

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed type system produces zero errors.

**Pseudocode:**
```
FOR ALL file WHERE file contains 'cpm' as Record<UserRole, ...> key DO
  result := tsc_check(file)
  ASSERT no TS2353 error for 'cpm' in result
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed type system produces the same results as the original.

**Pseudocode:**
```
FOR ALL role IN existing_19_roles DO
  ASSERT tsc_accepts(role as UserRole key) == true  // same as before
END FOR
ASSERT NormalizedUserRole excludes 'architect'
ASSERT NormalizedUserRole includes 'cpm'
ASSERT CANONICAL_USER_ROLES satisfies readonly UserRole[]
ASSERT UserRoleEnum.options contains all UserRole members
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It can generate all permutations of role usage to verify none are broken
- It catches edge cases where adding a new member might cause exhaustiveness issues
- It provides strong guarantees that the 19 existing roles remain valid

**Test Plan**: Observe behavior on UNFIXED code first for all 19 existing roles, then write tests capturing that behavior and verify it continues after the fix.

**Test Cases**:
1. **Existing Roles Preserved**: Verify all 19 existing roles are accepted in `Record<UserRole, ...>` contexts after fix
2. **NormalizedUserRole Derivation**: Verify `NormalizedUserRole` correctly excludes `'architect'` and includes all other 19 roles (18 existing + `'cpm'`)
3. **CANONICAL_USER_ROLES Alignment**: Verify the array matches `UserRoleEnum.options` (existing test in `permissionService.test.ts`)
4. **Zod Schema Validation**: Verify `UserRoleEnum.parse('cpm')` succeeds and all 19 existing roles continue to parse

### Unit Tests

- Test that `UserRoleEnum.parse('cpm')` succeeds after fix
- Test that `UserRoleEnum.parse(existingRole)` succeeds for all 19 existing roles
- Test that `CANONICAL_USER_ROLES` includes `'cpm'` and all 19 existing roles
- Test that `isCanonicalUserRole('cpm')` returns `true`
- Test that `normalizeUserRole('cpm')` returns `'cpm'` (not normalized away)

### Property-Based Tests

- Generate random strings from the set of 20 canonical roles and verify `isCanonicalUserRole` accepts all of them
- Generate random strings NOT in the canonical set and verify `isCanonicalUserRole` rejects them
- Verify `UserRoleEnum.options` set-equals `CANONICAL_USER_ROLES` set (existing test, must continue passing)

### Integration Tests

- Run `tsc --noEmit -p tsconfig.app.json` and verify zero TS2353 errors mentioning `'cpm'`
- Run existing `permissionService.test.ts` suite — the alignment check must pass
- Verify the full build (`npm run build`) succeeds without `'cpm'`-related errors
