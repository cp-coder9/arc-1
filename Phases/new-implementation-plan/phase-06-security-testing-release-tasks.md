# Phase 6 Tasks — Security, Testing, Migration, Deployment Readiness

| Priority | Task | Complexity estimate | Dependencies | Completion criteria |
|---|---|---:|---|---|
| P0 | Build Firestore rule matrix for all new collections and fields | M | Phases 1-5 schemas | Matrix covers authenticated, owner, firm member, professional, contractor, admin, and server-only cases |
| P0 | Add rule tests for allow and deny cases | L | Rule matrix | Tests fail on user privilege escalation, spoofed CPD points, ledger writes, and firm bypass attempts |
| P0 | Plan and implement dry-run migrations | L | Stable schemas | Migrations report intended writes before mutation and are idempotent |
| P0 | Add payment and subscription release gate tests | L | Phase 2 | PayFast ITN, duplicate webhook, failed subscription, one percent fee, and activation fee paths pass |
| P0 | Add CPD and firm e2e flows | L | Phases 1 and 3 | Playwright validates invite acceptance and CPD certificate issuance paths |
| P1 | Add contractor and procurement e2e flows | L | Phases 4 and 5 | Contractor can view awarded work, manage RFI/site logs, and attempt procurement flow |
| P1 | Verify environment variable readiness | M | Deployment access | Server-only and client-exposed variables are classified and documented |
| P1 | Define release and rollback gates | M | Test results | No-go conditions include failed financial tests, insecure rules, broken auth, failed migrations, and missing secrets |
| P2 | Update developer and operations documentation | M | Final implementation | README or release docs align with current scripts and deployment flow |

