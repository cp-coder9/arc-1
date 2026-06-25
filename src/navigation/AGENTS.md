# AGENTS.md — Role-Aware Navigation

## Purpose

Central navigation configuration and routing infrastructure that determines what each user role sees, which modules are available per project phase, and how the app shell renders sidebar, workspace, and contextual messaging. This is the single source of truth for the platform's information architecture.

## Ownership

- **Path:** `src/navigation/`
- **Owner:** Frontend / UX Architecture Team
- **Key files:** `architexNavigationConfig.ts`, `navTypes.ts`, `navDashboardAdapter.ts`, `contextualMessagingService.ts`, `example.ts`

## Local Contracts

### Navigation Type System (`navTypes.ts`)
| Type | Purpose |
|------|---------|
| `ArchitexNavKey` | Enumerated module keys: command_centre, inbox, projects, toolboxes, cpd_learning, documents, marketplace, finance, messages, settings, user_settings |
| `WorkspaceSection` | Section definition with key, label, description, role filter, phase awareness, project scope, contextual messaging support |
| `NavigationItem` | Module-level navigation entry with role filtering and icon |
| `RoleBasedFilter` | Filter function type for role-aware navigation queries |

### Navigation Config (`architexNavigationConfig.ts`)
- Defines 11 top-level navigation modules
- Each module specifies: role access list, key sections, phase awareness
- Modules include: Command Centre, Inbox/Action Centre, Projects, Toolboxes, CPD & Learning, Documents/Knowledge Hub, People, Marketplace, Payments/Finance, Compliance Hub, Admin/Governance
- Navigation is consumed by `src/App.tsx` for sidebar rendering
- **Role visibility contract:** `App.tsx` `visibleNavItems` filters strictly by `item.roles.includes(user.role)` with **no** role normalization. Every `UserRole` that should reach a surface must be listed explicitly in that module's `roles` array. All 17 roles now share the workflow spine (`command_centre`, `inbox`, `projects`, `messages`); `documents` is granted to all design/governance roles. `finance`, `settings`, `cpd_learning`, `marketplace`, `user_settings` remain intentionally role-restricted — extend deliberately, not by default.

### Dashboard Adapter (`navDashboardAdapter.ts`)
- Maps navigation modules to their corresponding dashboard components
- Provides `getDashboardForRole()` — returns the correct dashboard component for a given user role
- Supports role-specific dashboards: Client, Architect, Admin, Contractor, BEP, Freelancer, Subcontractor, Supplier

### Toolbox Framework Integration
- Tools in the Toolboxes module now link to the Toolbox Capability Framework via `calculatorDefinitionId`
- When a tool has a `CalculatorDefinition` (`status: 'full'`), `DefinitionToolRunner` renders it with Zod-validated forms, live recomputation, clause panels, and report export
- When a tool is `status: 'preview'`, the legacy `StandaloneToolRunner` fallback renders it
- Navigation does not gate tool status — all 54 tools remain routable; the runner determines rendering mode at runtime
- Tool registry entries carry `calculatorDefinitionId` linking them to their definition in `src/services/toolbox/definitions/`

### Contextual Messaging (`contextualMessagingService.ts`)
- Determines when contextual messaging UI surfaces based on navigation context
- Integrates with `src/features/project-communications/` for project-scoped threads

## Work Guidance

- New navigation modules must: (1) add key to `ArchitexNavKey`, (2) define sections in `architexNavigationConfig.ts`, (3) add role filter, (4) register dashboard in `navDashboardAdapter.ts`
- Role filters must use `UserRole` from `src/types.ts`
- Phase-aware navigation entries must specify which project lifecycle stages they apply to
- Navigation changes must be reflected in `src/App.tsx` routing
- All navigation data is static/config-driven — no runtime permission checks in navigation

## Verification

- `npm test` covers navigation integration through dashboard tests
- `npm test -- src/components/__tests__/*Dashboard.test.tsx` — validates role-specific dashboards render correct navigation
- `npm run lint` for type safety across navigation types

## Child DOX Index

No child AGENTS.md files exist below this directory.
