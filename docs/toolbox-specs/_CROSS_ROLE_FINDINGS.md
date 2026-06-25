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

## ✅ Finding 3 — AI-guided groups vs standalone registry divergence — RESOLVED
**Where:** `ProjectToolboxPage.tsx` (`TOOLBOX_CONFIG`) vs `standaloneToolRegistry.ts`
**Status:** Closed as of Toolbox Capability Framework implementation.

**Resolution:** The Toolbox Capability Framework (`CalculatorDefinition` contract) now makes every tool data-driven. All 54 tools across 17 roles are covered by the framework:
- **38 tools** at `status: 'full'` — rendered by `DefinitionToolRunner` with Zod-validated inputs, clause checks, versioned guideline tables, and report export.
- **17 tools** at `status: 'preview'` — explicitly labelled in UI and tracked (no silent placeholders).

The divergence between AI-guided tool groups and the standalone registry is structurally resolved: both modes now draw from the same `CalculatorDefinition` registry. Each tool has a `calculatorDefinitionId` linking it to its definition, and `DefinitionToolRunner` renders any tool that has one. The legacy guided-vs-registry gap no longer produces inconsistent capability surfaces — tools are either `full` (complete data-driven calculator) or `preview` (explicitly marked stub), never silently missing.

## ✅ Finding 4 — platform_admin inverted gap — RESOLVED
`platform_admin` guided groups reference governance routes (`admin-console`, `disputes`, `ai`, `payments`) that previously had **no** matching standalone registry entries. The Toolbox Capability Framework now gives `platform_admin` 8 full-status tools: `fee_tariff_editor`, `payment_rate_config`, `admin_governance`, `audit_trail_viewer`, `user_verification_console`, `platform_settings`, `system_health_monitor`, `ai_review_queue`. The inverted gap is closed — guided governance routes now map to real `CalculatorDefinition`-backed tools.

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
3. ~~Address Finding 3/4 by reconciling guided groups with the registry.~~ ✅ Resolved by Toolbox Capability Framework.
4. Smoke-test Finding 5 routes per role.

---

## Toolbox Capability Framework Summary (current state)

All 54 tools across 17 roles are now covered by the Toolbox Capability Framework:

| Status | Count | Description |
|--------|-------|-------------|
| `full` | 38 | Complete `CalculatorDefinition` with Zod schema, clause checks, versioned tables, report export |
| `preview` | 17 | Explicitly labelled stubs — tracked, never silent placeholders |

**Key contracts:**
- Every tool links to the framework via `calculatorDefinitionId` on `StandaloneToolRun`
- `DefinitionToolRunner` renders full definitions; legacy fallback handles preview stubs
- Thresholds and tariffs read from versioned `GuidelineTable` data (never hard-coded constants)
- Each full tool produces: Zod-validated inputs, clause outcomes (pass/fail/advisory), disclaimers, source version traceability
- Runs are deterministic: recomputing with pinned `guidelineVersions` reproduces identical results
