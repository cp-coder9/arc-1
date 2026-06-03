# Architex Navigation Framework

This directory contains the formal navigation framework for the Architex platform.

## Files

| File | Purpose |
|------|---------|
| `navTypes.ts` | TypeScript types for navigation items, sections, and contextual messaging |
| `architexNavigationConfig.ts` | The canonical navigation config — 10 top-level categories, each with role-aware sections |
| `navDashboardAdapter.ts` | Adapter that maps navigation keys to existing dashboard page IDs |
| `contextualMessagingService.ts` | Service for creating context-aware messaging drafts linked to workflow objects |
| `example.ts` | Usage examples |

## Integration

The navigation config is consumed by `App.tsx` via:
1. `architexNavigation` — the full config array
2. `getDefaultPageForNavKey()` — maps a nav key to the first dashboard page ID
3. `getNavKeyForActiveTab()` — reverse maps a dashboard page ID to its nav key (for active highlighting)

The sidebar renders `visibleNavItems` (filtered by user role) from the config, replacing the previous inline menu items.

## Navigation Structure

1. **Command Centre** — Personal daily cockpit curated by the user agent
2. **Inbox / Action Centre** — Protected action centre for required work and agent-pushed tasks  
3. **Projects** — Phase-aware project workspace
4. **Toolboxes** — Role-specific professional tools
5. **CPD & Learning** — Separate CPD platform
6. **Documents / Knowledge Hub** — Global document and knowledge hub
7. **Marketplace / Resource Centre** — Industry network and resource sharing
8. **Finance & Commercial** — Commercial controls and financial records
9. **Messages** — Full persistent messaging centre
10. **Settings** — User, company and admin configuration

## Key Principles

- **Top-level sidebar** contains only the 10 categories above
- **Within each category**: role-aware modules
- **Within each project**: phase-aware tools
- **Within each workflow**: agent-guided next actions
- **Messaging** is contextual — linked to workflow objects, not a separate silo
