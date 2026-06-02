# Phase 4 Report: Role-Scoped Profiles and Directory Projection

Date: 2026-05-15
Branch: `phase-2-verification-workflows`
Scope source: `Full_scope.md`

## Implemented

### Role-scoped profile persistence
- Added authenticated `PUT /api/profile/me` for users to update only fields permitted for their stored role.
- Added admin-only `PUT /api/admin/users/:userId/profile` for controlled profile corrections with an explicit audit reason.
- Added `GET /api/profile/me` to return the authenticated user's persisted profile.
- Expanded role field allowlists from Full_scope profile requirements:
  - Client profile and billing/contact details.
  - BEP and architect practice, statutory registration, services, region, availability, portfolio, CPD, SACAP-compatible fields, and resource owner settings.
  - Contractor company, CIDB/NHBRC-style registration, trades, regions served, capacity, insurance, health and safety, and capability details.
  - Subcontractor and supplier trade/category, service region, package type, delivery capacity, compliance and close-out requirements.
  - Freelancer skills, software, availability, portfolio, preferred task types, banking, identity, and directory visibility.
  - Admin operational profile metadata.
- Profile payloads are recursively sanitized, bounded in length, and restricted to role-approved field names.
- Existing `check-admin` profile bootstrap now sanitizes fields against the assigned role for new users and the stored role for existing users, preventing profileData role-escalation or cross-role field injection.

### Directory-safe profile projection
- Added server-maintained `directory_profiles/{userId}` projections for searchable roles only.
- Directory projections include only public/searchable data: display name, company/practice/business name, normalized directory role, discipline/trade, region, availability, portfolio thumbnails, rating summary, verification label/status, and registration number when supported by verification/profile data.
- Private fields such as billing details, banking payout details, admin flags, and internal profile data are not projected.
- Directory search now reads from `directory_profiles` rather than full `users` records.
- Unverified users remain discoverable in directory search when visible, but are labelled `unverified` and cannot be invited until verified.
- Contractor projections now prioritize Full_scope `regionsServed` over older legacy `region` values. Supplier and subcontractor projections prioritize `serviceRegion`.

### Auditing
- Added `profile` as an audit event category.
- User profile updates write immutable `profile.updated` audit events with updated field names and directory projection status.
- Admin profile updates write immutable `profile.admin_updated` audit events with target user, reason, updated field names, and directory projection status.

### Tests added/updated
- Added API coverage for users updating role-specific profile fields.
- Added API coverage for admin role-scoped profile corrections and audit logging.
- Updated check-admin sanitization test to assert cross-role SACAP fields are rejected for clients.
- Updated directory tests to use `directory_profiles` projections and verify unverified labels remain visible.

## Validation completed

- `npx vitest run src/lib/__tests__/api-router.security.test.ts`
  - 26 tests passed.
- `npm run lint`
  - TypeScript validation passed.

## Notes and limitations

- Directory projections are generated through server-side API writes and use the existing database. No placeholder or mock production data was introduced.
- Backfill of existing users into `directory_profiles` is not yet implemented. Existing users will project when they next update profile data, when an admin updates them, or through a future migration/backfill task.
- Firestore direct client reads of `directory_profiles` were not added; directory access remains through authenticated API routes.
