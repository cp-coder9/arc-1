# Architex Codebase Audit Report - July 2026

## 1. Executive Summary
This audit provides a comprehensive overview of the Architex Built Environment OS codebase as of July 1, 2026. The platform has undergone significant development across numerous parallel feature branches ("Packs"), but currently faces a major integration gap between these features and the authoritative `main` branch.

While the frontend is deployed to `test.architex.co.za`, it is currently running in a limited "Demo Mode" and lacks full linkage to the specialized API features implemented in unmerged branches.

---

## 2. Branch & PR Inventory Status

### 2.1 Complete Branch List (Unmerged)
There are **121 remote branches** currently unmerged into `main`.

#### Feature Packs & Core Modules
*   `feat/pack-1-toolbox-engine-spine`
*   `feat/pack-2-14-passport-orchestration`
*   `feat/pack-2-professional-fee-proposal-builder`
*   `feat/pack-3-compliance-calculators`
*   `feat/pack-4-document-control-core`
*   `feat/pack-5-appointment-kickoff`
*   `feat/pack-5-contractor-commercial-tools`
*   `feat/pack-6-site-execution-tools`
*   `feat/pack-6-submission-readiness`
*   `feat/pack-7-supplier-tools`
*   `feat/pack-8-admin-governance-tools`
*   `feature/pack-2-passport-lifecycle-complete`
*   `feature/pack-3-documents-drawing-intelligence`
*   `feature/pack-5-appointment-kickoff`
*   `feature/pack-8-finance-payment-escrow-commercial`
*   `feature/pack-9-site-execution-field-control`
*   `feature/pack-10-site-execution-field-control`
*   `feature/pack-11-closeout-handover-occupancy`
*   `feature/pack-12-practice-management-office-ops`
*   `feature/pack-marketplace`
*   `feat/sans-codified-compliance-engine`

#### Toolboxes (`toolbox/*`)
*   `toolbox/admin-governance`
*   `toolbox/ai-drawing-checker`
*   `toolbox/ai-review-queue`
*   `toolbox/audit-trail-viewer`
*   `toolbox/boq-takeoff`
*   `toolbox/brief-wizard`
*   `toolbox/cad-upload-check`
*   `toolbox/catalogue-manager`
*   `toolbox/cpd-standalone`
*   `toolbox/deliverable-submission`
*   `toolbox/delivery-note`
*   `toolbox/doc-control-issue`
*   `toolbox/drawing-register`
*   `toolbox/energy-certificate`
*   `toolbox/feasibility-estimator`
*   `toolbox/fee-calculator`
*   `toolbox/fee-tariff-editor`
*   `toolbox/fenestration-calc`
*   `toolbox/fire-compliance-check`
*   `toolbox/fire-rational-design`
*   `toolbox/firm-document-register`
*   `toolbox/freelancer-resource-centre`
*   `toolbox/freelancer-timesheet`
*   `toolbox/hs-compliance`
*   `toolbox/material-procurement`
*   `toolbox/package-scope-viewer`
*   `toolbox/payment-claim-builder`
*   `toolbox/payment-dashboard`
*   `toolbox/payment-rate-config`
*   `toolbox/plant-register`
*   `toolbox/platform-settings`
*   `toolbox/progress-viewer`
*   `toolbox/proposal-comparison`
*   `toolbox/quote-response`
*   `toolbox/rfi-response`
*   `toolbox/rvalue-calc-fix`
*   `toolbox/sans-forms`
*   `toolbox/shop-drawing-submission`
*   `toolbox/site-diary-entry`
*   `toolbox/snag-creator`
*   `toolbox/snag-evidence-upload`
*   `toolbox/soft-cost-estimator`
*   `toolbox/staff-cpd-tracker`
*   `toolbox/stage-gate-review`
*   `toolbox/system-health-monitor`
*   `toolbox/technical-brief`
*   `toolbox/tender-bid-bench`
*   `toolbox/user-verification-console`
*   `toolbox/valuation-cert`
*   `toolbox/warranty-upload`
*   `toolbox/workforce-timesheet`
*   `toolbox/xa-compliance-calc`
*   `toolbox/zoning-check`

#### Features & Improvements
*   `feat/landing-go-live` (Liquid Glass redesign)
*   `feat/specforge-workspace-integration`
*   `feat/sprint-1-glassmorphism-overhaul`
*   `feat-architect-profiles-and-recommendations-13202590410813343651`
*   `feature/arc-b2-clean`
*   `feature/architect-dashboard-enhancements-15735110557204953697`
*   `feature/architect-dashboard-enhancements-1704451157210965987`
*   `feature/architex-fee-calculator-pack`
*   `feature/architex-platform-spine-pack`
*   `feature/bip-role-workflow-9832944944364214636`
*   `feature/bom-builder-tool`
*   `feature/comprehensive-professional-toolboxes`
*   `feature/cpd-aesthetic-refinement`
*   `feature/cpd-assessment-platform`
*   `feature/master-product-expansion-integration`
*   `feature/navigation-framework`
*   `feature/password-and-compliance-reports-v2-6049199378968999451`
*   `feature/professional-fee-proposal-builder`
*   `feature/project-command-centre`
*   `feature/unified-municipal-tracker-aggregator-4463341113638514032`
*   `feature/website-ui-redesign-spec`
*   `feature/xa-compliance-tool`
*   `integration/all-packs`

#### Phased Lifecycle Foundation
*   `phase-1/lifecycle-foundation`
*   `phase-2-verification-workflows`
*   `phase-2/design-team-coordination`
*   `phase-3/tender-procurement`
*   `phase-4/construction-delivery`
*   `phase-5/payments-escrow`
*   `phase-6/ai-agents-polish`

#### Fixes & Chores
*   `All-branch-fixes`
*   `chore/install-dox-framework`
*   `codex/fix-and-merge-all-branches-and-prs`
*   `deploy-restore`
*   `e2e-chromium-stabilization`
*   `fix-dashboard-coordination-4747803486613439424`
*   `fix-types-and-auth-flow-17225465659468592700`
*   `fix/b1-payfast-secret`
*   `fix/b2-finance-auth`
*   `fix/b3-milestone-auth`
*   `fix/errors-2-txt`
*   `fix/h1-routes-dir`
*   `fix/h2-strict-tsconfig`
*   `fix/h3-threejs-lazy`
*   `fix/pr-26-sans-compliance-engine`

#### Worktrees & Temporary
*   `worktree-feature+architex-navigation-framework`
*   `worktree-feature+pack-4-professional-toolboxes-proposal-builder`
*   `worktree-pack-11-closeout-handover-occupancy`
*   `worktree-pack-12-impl`
*   `worktree-pack-5-appointment-kickoff`
*   `worktree-pack-7-impl`
*   `worktree-pack-8-finance-implementation`
*   `worktree-pack-9-site-execution-field-control`

---

## 3. Feature Implementation Audit

### 3.1 Fully Implemented (In Branches)
The following modules have been identified as having "Production Ready" service-layer code in their respective branches:

*   **Pack 8 (Finance/Escrow)**: Functional PayFast integration, milestone release logic, and audit event recording.
*   **Pack 9 (Site Execution)**: State-machine driven NCR, Snag, and Site Instruction services.
*   **Pack 12 (Practice Management)**: Office operations and task management.
*   **CPD Platform**: Aesthetic refinements and assessment logic.

### 3.2 "Demo Mode" vs. Production
A critical architectural split exists:
*   **`main` Branch**: Uses a "Demo Mode" wrapper (`src/demo-seed/demoFirestore.ts`) which isolates all user data under `/demo/{uid}/` paths.
*   **Feature Branches**: Many unmerged branches were written using standard production Firestore paths.

**Risk**: Merging these branches into the current `main` without updating them to support the Demo/Production toggle will break data persistence for users in the current test environment.

---

## 4. Deployment & API Linkage Analysis

### 4.1 Frontend Status (`test.architex.co.za`)
*   **Status**: Active.
*   **Current Build**: Commit `90dda127` (Main branch).
*   **Build Date**: 2026-06-30.
*   **Issue**: The frontend is hardcoded to communicate with `https://api.architex.co.za`.

### 4.2 API Linkage (`api.architex.co.za`)
*   **Runtime**: PHP Shared Hosting Gateway (`php-gateway-v0.1.1`).
*   **Coverage**:
    *   ✅ **Working**: Health check, versioning, simple profile reads, manual verification submission.
    *   ❌ **Missing**: All advanced Pack 8 (Finance) and Pack 9 (Site Execution) routes. These routes return `501 Not Implemented` or `404 Not Found`.
    *   **Finding**: The Node.js `api-server.ts` contains the full API implementation, but the current production environment is using a limited PHP proxy that only implements a fraction of the required logic.

---

## 5. Critical Gaps & Recommendations

### G1: API Parity
The current PHP gateway does not support the advanced logic required for Escrow releases or Site Execution state machines.
*   **Recommendation**: Transition the production API from the PHP gateway to the Node.js server (`api-server.ts`) or finish the PHP parity for critical Pack routes.

### G2: Unmerged Production Code
Significant "Production Code" is trapped in branches that have diverged from the `main` branch's new "Demo Mode" architecture.
*   **Recommendation**: Perform a "Rebase and Align" sprint. Each Pack must be rebased onto `main` and updated to use the `demoFirestore.ts` wrappers where appropriate.

### G3: Broken API Linkage
The test site is currently unable to perform many actions (e.g., viewing field reports) because the API endpoints do not exist on the PHP gateway.
*   **Recommendation**: Update the PHP `index.php` or deploy the Node API bundle to resolve the 404/501 errors.

---
**Audit Performed By**: Jules (AI Software Engineer)
**Date**: July 1, 2026
