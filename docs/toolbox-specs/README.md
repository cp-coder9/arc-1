# Architex Toolbox Spec Sheets — Per User Role

> Authored from a fresh analysis of the live codebase (`main`), ignoring prior status docs as instructed.
> Source of truth for every claim below:
> - `src/services/tools/standaloneToolRegistry.ts` — 54 standalone tools, role-mapped
> - `src/components/ProjectToolboxPage.tsx` — per-role AI-guided toolbox config (`TOOLBOX_CONFIG`)
> - `src/navigation/architexNavigationConfig.ts` — role → navigation module visibility
> - `src/services/lifecycleDefinitions.ts` — 9-phase project lifecycle
> - `src/types.ts` — `UserRole` union (17 roles)

---

## How the toolbox actually works (verified in code)

Every role's Toolbox screen (`ProjectToolboxPage`) has **two modes**, toggled in the UI:

1. **AI-guided** (`workflow` mode, default) — curated `toolGroups` defined per role in `TOOLBOX_CONFIG`. Each group lists 2–3 named tools that deep-link to a `pageId` route.
2. **All tools** (`tiles` mode) — renders `StandaloneToolTilesPage`, which calls `getToolsForRole(user.role)` against `STANDALONE_TOOL_REGISTRY`. Tools run standalone via `StandaloneToolRunner`, with run history, export (PDF/CSV), and "assign to project".

**Key architectural fact:** the two modes are *independent data sources*. The AI-guided groups are hand-curated and do **not** automatically reflect the registry. This is the single biggest consistency risk and is flagged per role below.

---

## Baseline established this session

| Check | Result |
|-------|--------|
| `tsc --noEmit -p tsconfig.app.json` (src) | **Clean (0 errors)** after excluding local-only junk dirs (`packs/`, nested `arc-1/`, `.claude/` worktrees) and removing 2 stray HTML-as-JS root files |
| Full test suite (`npm test` + jsdom) | **181 files, 1771 tests passed, 0 failed** |
| `npm run build` | **Succeeded** (vite, ~47s) |
| Live site `test.architex.co.za` | **Live**, SPA build commit `95dd0492d0dc`, built `2026-06-23T20:29:08Z` |

See [`PACK_TEST_REPORT.md`](./PACK_TEST_REPORT.md) for the full verification report, fixes applied, and pack→test mapping.

---

## Role → Navigation module visibility (from `architexNavigationConfig.ts`)

| Module | Roles with access |
|--------|-------------------|
| Command Centre | client, architect, admin, freelancer, bep, contractor, subcontractor, supplier |
| Inbox / Action Centre | client, architect, admin, freelancer, bep, contractor, subcontractor, supplier |
| Projects | client, architect, admin, bep, contractor, subcontractor, supplier |
| **Toolboxes** | **all 17 roles** |
| CPD & Learning | architect, admin, freelancer |
| Documents / Knowledge Hub | client, architect, admin, bep, contractor, subcontractor |
| Marketplace | client, architect, admin, bep, contractor, supplier |
| Finance & Commercial | client, admin, contractor, subcontractor |
| Messages | client, architect, admin, freelancer, bep, contractor, subcontractor, supplier |
| Settings | admin |
| My Account | client, architect, freelancer, contractor, subcontractor, supplier |

### ⚠ Cross-cutting workflow finding #1 — "orphaned" professional roles
These 9 roles appear **only** in the `toolboxes` module and have **no** Command Centre, Inbox, Projects, Messages, Documents, Finance, or My Account navigation:

`engineer, quantity_surveyor, town_planner, energy_professional, fire_engineer, site_manager, developer, firm_admin, platform_admin`

They have full `TOOLBOX_CONFIG` entries and registry tools, but a user with one of these roles cannot reach a project, inbox, or messages through the nav. Either (a) these roles should be added to the relevant nav modules, or (b) they are intended to be treated as sub-types of `bep`/`architect`/`admin` at the auth layer. This must be resolved for the workflows to be "correctly followed." See `_CROSS_ROLE_FINDINGS.md`.

### ⚠ Cross-cutting workflow finding #2 — registry references undefined roles
`standaloneToolRegistry.ts` maps some tools to roles **not** in the `UserRole` union and **not** in `TOOLBOX_CONFIG`: `land_surveyor, cpm, landscape_architect, interior_designer`. These tools will never surface (no such role can log in) — dead mappings. Flagged in `_CROSS_ROLE_FINDINGS.md`.

---

## 9-Phase Lifecycle (from `lifecycleDefinitions.ts`)

`onboarding → feasibility → appointment → concept_design → design_development → municipal_submission → tender_procurement → construction_execution → closeout`

Each role spec maps its tools onto the phases the role participates in.

---

## Role index

| Role | Spec | Standalone tools | AI-guided groups |
|------|------|------------------|------------------|
| client | [client.md](./client.md) | 8 | 2 |
| architect | [architect.md](./architect.md) | 19 | 2 |
| bep | [bep.md](./bep.md) | 14 | 2 |
| engineer | [engineer.md](./engineer.md) | 14 | 2 |
| quantity_surveyor | [quantity_surveyor.md](./quantity_surveyor.md) | 7 | 2 |
| town_planner | [town_planner.md](./town_planner.md) | 6 | 2 |
| energy_professional | [energy_professional.md](./energy_professional.md) | 13 | 2 |
| fire_engineer | [fire_engineer.md](./fire_engineer.md) | 11 | 2 |
| site_manager | [site_manager.md](./site_manager.md) | 13 | 2 |
| contractor | [contractor.md](./contractor.md) | 18 | 2 |
| subcontractor | [subcontractor.md](./subcontractor.md) | 17 | 2 |
| supplier | [supplier.md](./supplier.md) | 9 | 2 |
| freelancer | [freelancer.md](./freelancer.md) | 6 | 2 |
| developer | [developer.md](./developer.md) | 10 | 2 |
| firm_admin | [firm_admin.md](./firm_admin.md) | 8 | 2 |
| admin | [admin.md](./admin.md) | 9 | 2 |
| platform_admin | [platform_admin.md](./platform_admin.md) | 4 | 2 |

See [`_CROSS_ROLE_FINDINGS.md`](./_CROSS_ROLE_FINDINGS.md) for consolidated gaps and remediation.
