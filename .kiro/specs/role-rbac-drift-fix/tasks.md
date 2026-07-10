# Implementation Plan

## Overview

Fix the missing `'cpm'` (Construction Project Manager) role in the `UserRole` type union. The bug causes 8 TS2353 TypeScript errors across the codebase where `'cpm'` is used as a key in `Record<UserRole, ...>` literals. The fix adds `'cpm'` to the `UserRole` union in `src/types.ts`, the `CANONICAL_USER_ROLES` array in `src/services/permissionService.ts`, and the Zod `UserRoleEnum` in `src/lib/schemas.ts`.

## Tasks

- [x] 1. Write bug condition exploration test
  - [x] 1.1 Write exploration test asserting cpm is valid
    - Write a property-based test in `src/__tests__/role-rbac-drift.test.ts` that asserts:
    - `'cpm'` is included in the `CANONICAL_USER_ROLES` array
    - `UserRoleEnum.safeParse('cpm').success` returns `true`
    - `'cpm'` is accepted as a valid key in `Record<UserRole, ...>` contexts (via type-level assertion)
    - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
    - **DO NOT attempt to fix the test or the code when it fails**
    - _Requirements: 1.1, 1.2, 1.3_
  - [x] 1.2 Run exploration test and document failure
    - Run test on UNFIXED code
    - **EXPECTED OUTCOME**: Test FAILS (proves the bug exists)
    - Document counterexamples found
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - [x] 2.1 Write preservation tests for existing 19 roles
    - Write property-based test in `src/__tests__/role-rbac-drift.test.ts` that asserts:
    - For all 19 existing canonical roles, `UserRoleEnum.safeParse(role).success === true`
    - For all 19 existing canonical roles, `CANONICAL_USER_ROLES.includes(role) === true`
    - `NormalizedUserRole` excludes `'architect'`
    - For random strings NOT in the canonical role set, `UserRoleEnum.safeParse(randomString).success === false`
    - `UserRoleEnum.options` set-equals `CANONICAL_USER_ROLES` (alignment check)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 2.2 Run preservation tests and confirm they pass on unfixed code
    - Run tests on UNFIXED code
    - **EXPECTED OUTCOME**: Tests PASS (confirms baseline behavior is intact)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Fix for missing 'cpm' role in UserRole type union
  - [x] 3.1 Add `'cpm'` to the `UserRole` type union in `src/types.ts`
    - Append `| 'cpm'` to the existing `UserRole` string literal union
    - This automatically includes `'cpm'` in `NormalizedUserRole`
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.2 Add `'cpm'` to the `CANONICAL_USER_ROLES` array in `src/services/permissionService.ts`
    - Add `'cpm'` as an element in the `CANONICAL_USER_ROLES` array
    - Array is typed `satisfies readonly UserRole[]`
    - _Requirements: 2.1, 3.6_
  - [x] 3.3 Add `'cpm'` to the Zod `UserRoleEnum` in `src/lib/schemas.ts`
    - Add `'cpm'` to the `z.enum([...])` array in the `UserRoleEnum` schema
    - _Requirements: 2.1, 3.7_
  - [x] 3.4 Verify bug condition exploration test now passes
    - Re-run the SAME test from task 1 - do NOT write a new test
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.5 Verify preservation tests still pass
    - Re-run the SAME tests from task 2 - do NOT write new tests
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 3.6 Run `tsc --noEmit -p tsconfig.app.json` and verify zero TS2353 errors for `'cpm'`
    - Execute the TypeScript compiler and grep output for `cpm`-related errors
    - **EXPECTED OUTCOME**: Zero lines matching `cpm` in TS2353 error output
    - Note: ~75 other unrelated type errors may exist — those are out of scope
    - _Requirements: 2.3_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run `npm test` to verify all unit tests pass (including the new role-rbac-drift tests)
  - Run `tsc --noEmit -p tsconfig.app.json | grep cpm` to confirm zero cpm-related type errors
  - Verify existing `permissionService.test.ts` alignment check still passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- The ~75 other unrelated type errors in the codebase are out of scope for this bugfix.
- The fix pattern is identical to the previously resolved `'admin'`, `'land_surveyor'`, and `'health_safety'` role drift issues.
- `NormalizedUserRole` (defined as `Exclude<UserRole, 'architect'>`) automatically includes `'cpm'` once it is added to `UserRole`.
- The 8 files with TS2353 errors are already correct in their usage of `'cpm'` as a key.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1"] },
    { "id": 4, "tasks": ["3.2", "3.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "3.6"] },
    { "id": 6, "tasks": ["4"] }
  ]
}
```
