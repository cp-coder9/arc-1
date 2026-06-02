# Implementation Status Rescan

Date: 2026-05-19
Branch: phase-2-verification-workflows

## Repository status

Latest scoped commits include:
- `5e59bd9b Handle static auth API fallback`
- `a55d1f48 feat(admin): add whole-system governance console`
- `a6417135 feat(procurement): add package participant dashboard`
- `969a7589 Record contract and payment guard validation`
- `a6c3cba6 feat(workflows): surface human-gated package and payment controls`

Uncommitted generated/reference artifacts remain:
- `BACKEND_HTML_OUTSTANDING_ITEMS.md`
- `backend.html`
- `dist/index.html`

These are not scoped application-source changes.

## Implementation coverage snapshot

- Components: 78 top-level React component files in `src/components`.
- Services: 47 service/domain files plus service tests.
- Test/e2e files scanned: 55.
- Canonical dashboard pages in `src/App.tsx`: 38.
- Real workflow page IDs: 32.
- Remaining canonical pages not in `REAL_WORKFLOW_PAGE_IDS`: none requiring `DashboardPageShell`; the 6 non-real IDs are direct-render routes (`command`, `profile`, `client-intake`, `client-proposals`, `technical-brief`, `directory-search`).

## Implemented major areas

- Built Environment OS visual system and role-aware dashboard shell.
- Unified sidebar/menu groups across roles.
- Architect login merged into BEP / Design Team selection while retaining compatibility types/routes.
- Role-aware command centre with live job/package projection.
- Client intake, proposal comparison, directory search, municipal status, progress reports.
- BEP marketplace, design team matrix, technical brief, SANS forms, CPD, drawing register/checker.
- Contractor/subcontractor/supplier package/procurement/close-out/construction operations.
- Freelancer work/submission surfaces and resource sharing.
- Admin governance console and AI review queue surfaces.
- Human-gated contracts, payments, escrow, package purchase-order, and sensitive workflow guardrails.
- Firestore rules deployed through Rules API in previous passes.
- Static hosting auth fallback for non-admin users when `/api/auth/check-admin` is served by SPA fallback.
- COOP header deployed to support Firebase popup auth on the test domain.

## Remaining implementation gaps

1. **Production API hosting/proxy gap**
   - `https://test.architex.co.za/api/auth/check-admin` currently returns static SPA HTML.
   - Non-admin auth now has a safe Firestore fallback, but admin login and all secured server workflows still require real API hosting/proxy.
   - This is the biggest production-readiness gap.

2. **Sensitive execution workflows are intentionally guarded, not executable**
   - Contract acceptance/signature submission, payment initiation, escrow release, refund, and provider submission are disabled by design.
   - Next work should implement backend execution endpoints with explicit feature flags, human confirmations, audit logs, and separation-of-duty checks.

3. **Role/data model compatibility debt**
   - UI has merged architect into BEP selection, but legacy names remain in types and collections (`architectId`, `selectedArchitectId`, `ArchitectDashboard`, SACAP-specific labels).
   - Needs compatibility-safe migration plan before renaming storage fields.

4. **End-to-end seeded auth/role browser tests**
   - Sidebar/e2e harnesses pass in prior runs, but real Firebase login cannot be fully verified without controlled seeded accounts and API hosting.
   - Need seeded test users for every role against test domain plus Chrome DevTools/Playwright regression.

5. **Generated/reference artifact hygiene**
   - `backend.html`, `BACKEND_HTML_OUTSTANDING_ITEMS.md`, and `dist/index.html` remain uncommitted generated/reference artifacts.
   - Decide whether to keep ignored/generated, archive as docs, or clean before release branch.

## Recommended next implementation order

1. Stand up/proxy real API routes for `test.architex.co.za` or configure frontend API base to an existing Node/Vercel API host.
2. Add seeded role-login test accounts and run full role login Playwright/Chrome DevTools verification against production test domain.
3. Implement backend-gated contract/payment/escrow execution endpoints behind explicit feature flags and human-signoff records.
4. Complete architect-to-BEP naming/data compatibility migration.
5. Run full validation stack and refresh deployment bundle.
