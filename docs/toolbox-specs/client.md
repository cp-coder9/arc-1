# Client Toolbox Spec

**Role key:** `client` · **UserRole:** ✅ defined · **TOOLBOX_CONFIG:** ✅ · **Nav modules:** Command Centre, Inbox, Projects, Toolboxes, Documents, Marketplace, Finance, Messages, My Account

## 1. Identity (from `TOOLBOX_CONFIG.client`)
- **Title:** Client Project Toolbox
- **Subtitle:** Brief, approval, payment, progress, and handover tools for the project owner.
- **Scope:** Client-facing decisions only. Professional sign-off, statutory submissions, and payment releases stay human-confirmed.
- **Primary responsibilities:** Create/clarify project brief · Review proposals and appointments · Approve milestones and payment evidence.
- **Handoff boundaries:** Cannot certify professional compliance · Cannot submit statutory forms without accountable professional review.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Brief and appointment | Guided Brief Wizard → `client-intake` · BEP Proposals → `client-proposals` |
| Approvals and progress | Client Approval Centre → `tasks` · Progress Reports → `client-progress` |

## 3. Standalone tools (`getToolsForRole('client')` → 8)
| Tool | Category | Route | Standalone-only |
|------|----------|-------|-----------------|
| Guided Brief Wizard | briefing | `client-intake` | no |
| BEP Proposal Comparison | proposal | `client-proposals` | no |
| Progress Report Viewer | general | `client-progress` | no |
| Payment Status Dashboard | payment | `payments` | no |
| Soft Cost Estimator | fee_calculator | `standalone/soft-cost` | yes |
| Snag List Creator | site_management | `standalone/snag-list` | yes |
| Project Feasibility & Budget Estimator | fee_calculator | `client-intake` | no |
| Stage Gate Review & Decision Log | general | `client-progress` | no |

## 4. Lifecycle participation
- **onboarding / feasibility:** Brief Wizard, Soft Cost Estimator, Feasibility Estimator → produces `project_brief`, planning budget.
- **appointment:** Proposal Comparison → selects BEP, leads to `professional_appointment`.
- **construction_execution → closeout:** Approval Centre, Progress Reports, Payment Dashboard, Snag List Creator, Stage Gate Review.

## 5. Governance gates
- Approvals routed through `tasks` (Inbox/Approvals) — client approves but cannot self-certify compliance.
- Payment view-only (`payment_dashboard`); release requires escrow/admin gate (Pack 8).

## 6. Workflow verification & gaps
- ✅ AI-guided group tools (`client-intake`, `client-proposals`, `tasks`, `client-progress`) all map to standalone registry tools — **consistent**.
- ⚠ AI-guided mode surfaces 4 tools; tiles mode surfaces 8. `soft_cost_estimator`, `snag_creator`, `feasibility_estimator`, `stage_gate_review` are only reachable via "All tools" toggle. Acceptable, but the guided flow omits feasibility/cost-estimation that the brief stage needs — consider adding a "Feasibility & cost" group.
- ✅ Lifecycle alignment: client owns onboarding/feasibility/appointment entry and closeout approvals — matches `lifecycleDefinitions`.

## 7. Toolbox Framework Status

All client tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (0)
Client tools are primarily wizard/dashboard surfaces without calculator logic.

### Preview-status tools (3)
| Tool | Status | Notes |
|------|--------|-------|
| brief_wizard | `preview` | Guided AI wizard — no calculator definition |
| progress_viewer | `preview` | Read-only dashboard — no calculation path |
| payment_dashboard | `preview` | Read-only payment view — no calculation path |

### Framework details
- **Methods used:** N/A (client tools are consumption/approval surfaces)
- **Versioned tables:** N/A
- **Rendering:** Legacy fallback for all preview stubs
- **Notes:** Client interacts with framework outputs (reports, clause results) produced by professional roles; does not run calculators directly
