# Project Structure

```
├── index.html                    # SPA entry point
├── server.ts                     # Dev server (Express + Vite middleware)
├── api-server.ts                 # Production API server
├── vite.config.ts                # Build config with manual chunk splitting
├── firebase-applet-config.json   # Firebase client config
├── src/
│   ├── main.tsx                  # React entry
│   ├── App.tsx                   # App shell, routing, role-based auth
│   ├── types.ts                  # Shared TypeScript types (UserRole, Firm, Project, etc.)
│   ├── index.css                 # Tailwind v4 theme + customizations
│   ├── lib/                      # Core libraries
│   │   ├── api-router.ts         # Express API router (~6.4K lines, lazy-loaded)
│   │   ├── finance-api-router.ts # Finance API endpoints (~20 routes)
│   │   ├── firebase.ts           # Client Firebase init
│   │   ├── firebase-admin.ts     # Server Admin SDK
│   │   ├── apiClient.ts          # Client-side fetch wrapper
│   │   └── schemas.ts            # Zod validation schemas
│   ├── components/               # UI components + role-specific dashboards
│   │   ├── ui/                   # shadcn/ui primitives (button, card, dialog, etc.)
│   │   ├── *Dashboard.tsx        # 39 canonical dashboard pages
│   │   └── cpd/                  # CPD Assessment UI
│   ├── features/                 # Bounded feature modules
│   │   └── project-communications/
│   ├── services/                 # Business logic (~190 top-level .ts files)
│   │   ├── agents/               # AI agent implementations
│   │   ├── agentWorkflow/        # Agent orchestration core (20+ files)
│   │   ├── finance/              # Financial domain (escrow, payments, certificates)
│   │   └── masterExpansion/      # Product expansion (modules, lifecycle, risk)
│   ├── cpd/                      # CPD Assessment Platform (8 services)
│   ├── navigation/               # Role-aware navigation config
│   ├── hooks/                    # Custom React hooks
│   ├── design-system/            # Theme provider
│   ├── demo-context/             # Demo mode React context
│   ├── demo-seed/                # Demo mock data (12 projects, 19 users)
│   └── __tests__/                # Test files
├── scripts/                      # Build, deploy, smoke-test scripts
├── api/                          # Vercel serverless functions
├── api-php/                      # Legacy PHP API layer
├── e2e/                          # Playwright E2E tests
└── docs/                         # Reference documentation
```

## Key Architectural Patterns

- **Services layer** (`src/services/`): Pure business logic, no UI dependencies. Each service is a standalone module.
- **Components** (`src/components/`): React UI. Role-specific dashboards at top level, shared primitives in `ui/`.
- **Features** (`src/features/`): Bounded modules with their own components, services, and types.
- **Navigation** (`src/navigation/`): Centralized role-aware routing config consumed by App.tsx.
- **API Router**: Single large router file (`src/lib/api-router.ts`) with all backend endpoints. Finance routes split to `finance-api-router.ts`.
- **DOX hierarchy**: `AGENTS.md` files at folder boundaries define ownership and contracts (see root `AGENTS.md` for the full tree).
