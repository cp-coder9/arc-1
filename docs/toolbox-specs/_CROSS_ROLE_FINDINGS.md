# Cross-Role Toolbox Findings & Remediation

Consolidated workflow/consistency findings from the 17 per-role spec sheets. Severity: 🔴 blocks correct workflow · 🟡 UX/coverage gap · 🟢 confirmed correct.

## 🔴 Finding 1 — 9 professional roles are "orphaned" in navigation
**Where:** `src/navigation/architexNavigationConfig.ts`
**Roles:** `engineer, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, developer, firm_admin, platform_admin`

These roles have full `TOOLBOX_CONFIG` entries and registry tools, but the navigation config lists them **only** in the `toolboxes` module. They have no Command Centre, Inbox, Projects, Messages, Documents, Finance, or My Account entry. A logged-in user with one of these roles cannot reach a project, action queue, or messaging surface through navigation.

This directly contradicts "ensure the workflows are correctly being followed": site_manager (inherently project-bound), developer (portfolio oversight), and platform_admin (platform-wide governance) especially need more than a Toolboxes shell.

**Remediation options:**
- (A) Add these roles to the `roles` arrays of the relevant nav modules (`command_centre`, `inbox`, `projects`, `messages`, etc.). Lowest-risk, most explicit.
- (B) Confirm the auth layer maps them to a parent role (`engineer/qs/planner/energy/fire → bep`; `developer → client`; `firm_admin/platform_admin → admin`) — if so, the orphaned nav is intentional and the standalone `TOOLBOX_CONFIG`/registry entries are the only role-specific surface. **This must be verified in `src/App.tsx` role resolution before deciding.**

**✅ Verified + partially fixed this session.** `App.tsx` `visibleNavItems` filters strictly by `item.roles.includes(user.role)` with **no** role normalization — so the orphaned nav is a real bug, not masked by a parent-role alias. Applied option (A) for the universal workflow spine: all 9 roles were added to `command_centre`, `inbox`, `projects`, and `messages`; the 9 document-producing/governance roles were added to `documents`. **Deliberately left for product confirmation:** `marketplace`, `finance`, `cpd_learning`, `settings`, and `user_settings` (My Account) — these carry permission/billing implications and a blanket grant could be wrong. Decide per role before granting.

## 🔴 Finding 2 — Registry maps tools to non-existent roles
**Where:** `standaloneToolRegistry.ts` (`fee_calculator`, `cpd_standalone`)
Roles referenced that are **not** in the `UserRole` union and have **no** `TOOLBOX_CONFIG`: `land_surveyor, cpm, landscape_architect, interior_designer`. These mappings are dead — no such user can log in, so the tools never surface for them. Either add the roles to `UserRole` + `TOOLBOX_CONFIG` + navigation, or remove the dead role strings.

## 🟡 Finding 3 — AI-guided groups vs standalone registry are independent and diverge
**Where:** `ProjectToolboxPage.tsx` (`TOOLBOX_CONFIG`) vs `standaloneToolRegistry.ts`
The two toolbox modes draw from separate hand-maintained data. Every role surfaces far fewer tools in "AI-guided" mode than in "All tools":

| Role | AI-guided tools | Standalone tools |
|------|-----------------|------------------|
| client | 4 | 8 |
| architect | ~4 | 19 |
| bep | 4 | 14 |
| engineer | 6 | 14 |
| quantity_surveyor | 5 | 7 |
| town_planner | 5 | 6 |
| energy_professional | 5 | 13 |
| fire_engineer | 6 | 11 |
| site_manager | 6 | 13 |
| contractor | 4 | 18 |
| subcontractor | 4 | 17 |
| supplier | 4 | 9 |
| freelancer | 4 | 6 |
| developer | 6 | 10 |
| firm_admin | 6 | 8 |
| admin | 4 | 9 |
| platform_admin | 6 | 4 (inverted) |

The biggest coverage gaps (contractor 4/18, subcontractor 4/17, architect 4/19) mean a role's core deliverables are reachable only via the "All tools" toggle. **Recommendation:** derive the guided groups from the registry (group by `category`) or add missing high-value tools to each role's `toolGroups`.

## 🟡 Finding 4 — platform_admin inverted gap
`platform_admin` guided groups reference governance routes (`admin-console`, `disputes`, `ai`, `payments`) that have **no** matching standalone registry entries for the role (registry gives it only 4 tools: `cpd_standalone`, `freelancer_resource_centre`, `platform_settings`, `system_health_monitor`). The guided flow promises more than the registry backs. Reconcile the two.

## 🟡 Finding 5 — pageId routes to verify in `App.tsx`
Guided groups deep-link to `pageId`s that must each resolve to a real route. Highest risk:
- `freelancer-work` (freelancer) — registry's `deliverable_submission` uses `freelancer-submissions` instead; possible drift.
- Orphaned-role guided routes (`design`, `procurement`, `packages`, `programme`, `construction`, `snagging`, `contractor-staff`, `resource-sharing`, `admin-console`, `disputes`, `ai`) — confirm they resolve when the only nav entry is Toolboxes.

## 🟢 Confirmed correct
- `client` AI-guided routes all map cleanly to standalone tools.
- Scope/handoff boundaries in `TOOLBOX_CONFIG` are consistent with registry tool sets (e.g., supplier omits execution tools; freelancer omits project authority).
- `admin` has the correct richest navigation footprint; lifecycle tool mapping matches `lifecycleDefinitions`.

## Suggested remediation order
1. Verify role resolution in `App.tsx` → decide Finding 1 (A) vs (B).
2. Fix Finding 2 (dead role strings) — trivial, safe.
3. Address Finding 3/4 by reconciling guided groups with the registry.
4. Smoke-test Finding 5 routes per role.
