# Dashboard Visual Redesign Plan

Start: 2026-05-17 00:00 UTC
Scope owner instruction: use `12/` dashboard references to redesign role dashboards visually only. Preserve current options, workflows, data loading, and production behavior.

## Reference sources inspected
- `12/built_environment_os/DESIGN.md`
- `12/command_centre_client/code.html` and `screen.png`
- `12/command_centre_bep/code.html` and `screen.png`
- `12/command_centre_contractor/code.html` and `screen.png`
- `12/command_centre_admin/code.html` and `screen.png`

## Design system to carry into the app
- Base canvas: `#f5faf7`.
- Surface/card: `#ffffff` with soft green-tinted shadow `0 16px 44px rgba(20, 71, 63, 0.12)`.
- Primary deep teal: `#005b4e`; action teal: `#007666`; mint accent: `#98f3df` / `#7cd7c3`.
- Muted text: `#5e7478`; line/border: `#d0e3dc`; AI/technical purple: `#7046a8`.
- Typography: Inter-first, heavy dashboard headings and dense metric numerals.
- Layout: fixed 288px sidebar, fluid main content, sticky glass topbar, 28px desktop margins, single-column mobile flow.
- Shape: 20px primary radius, pill badges/buttons, icon tiles inside nav rows.
- Sidebar: same structure across every role, includes logo, role switcher/current role card, section labels, active nav styling.
- Topbar: breadcrumbs, page/context label, search/status/action chips, notification/profile controls.
- Cards: soft elevated panels, role accent top borders, role-specific tool blocks without changing available options.

## Current implementation constraints
- Shared shell lives primarily in `src/App.tsx` with `CANONICAL_DASHBOARD_PAGES`, role sidebar, topbar, and route rendering.
- Current role pages already route to production workflow components. Do not remove or rename page IDs/options.
- The `dashboard-registry.static.test.ts` checks exact routing and some string fragments, so any layout refactor must preserve static discoverability of page IDs and route strings.
- AI surfaces currently include `AI Co-Pilot`, `AICoPilotPage`, `AgentKnowledgeManager`, `ResourceCentre`, `AIDrawingChecker`, and admin LLM/knowledge routes. Preserve routing and make AI entry visible consistently.

## Implementation sequence
1. Add shared role/dashboard visual tokens/helpers in `src/App.tsx` and/or `src/index.css`:
   - role display labels, role accent colors, role descriptions.
   - OS shell utility classes for sidebar/topbar/cards.
2. Redesign the shared dashboard shell in `src/App.tsx` only:
   - 288px glass sidebar matching Built Environment OS.
   - current-role switcher card.
   - sectioned nav retaining every existing page/legacy option.
   - sticky glass topbar with breadcrumbs and current page/role context.
   - main content background grid/soft depth.
3. Redesign `NavItem`, `NavSectionLabel`, `DashboardFallback`, and `DashboardPageShell` visuals only.
4. Redesign `ProjectCommandCentre` visual hierarchy to match role examples while preserving data subscriptions and next-action behavior:
   - hero card, command view chips, metric cards, AI summary, key dates, recent activity.
   - role-specific accent and wording based on existing role/page data, not fabricated records.
5. Apply consistent card/topbar styling to high-traffic role dashboards only if necessary and low-risk:
   - prefer CSS/global utility classes over functionality edits.
   - avoid altering data queries, service calls, submit handlers, or workflow options.
6. Update AI system visual integration:
   - keep `AI Co-Pilot` navigation visible across every canonical role.
   - ensure AI/technical surfaces use purple accent and remain linked from command/AI/dashboard routes.
7. Document every change in `DASHBOARD_VISUAL_REDESIGN_LOG.md` and add unresolved human questions to `DASHBOARD_VISUAL_REDESIGN_HUMAN_QUESTIONS.md`.
8. Validate:
   - `npm run lint`
   - `npx vitest run src/lib/__tests__/dashboard-registry.static.test.ts`
   - `npm run build`
   - Chromium sidebar harness across roles
   - Playwright/DOM smoke for landing plus role dashboards where possible
   - FTP-stage asset scan before upload
9. Commit only agent changes, not user-provided `12/`, `backend.html`, or `BACKEND_HTML_OUTSTANDING_ITEMS.md` unless explicitly required.
10. Deploy clean build to the same FTPS target and verify public URL.

## Non-goals for this pass
- No Firestore schema changes.
- No route/page option changes.
- No placeholder/mock/simulated workflow data.
- No payment/submission/signature automation changes.
- No MySQL/backend runtime migration.

## Initial risks
- Reference dashboards are static HTML with hardcoded sample text. Implementation must use live app data and existing labels instead of copying fake metrics.
- Some exact string assertions may require careful preservation.
- Full `npm test` has a known suite-level timeout flake in `api-router.security`; direct rerun has passed previously.
