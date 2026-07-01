# Architex Codebase Audit Report - July 2026

## 1. Executive Summary
This audit provides a comprehensive overview of the Architex Built Environment OS codebase as of July 1, 2026. The platform has undergone significant development across numerous parallel feature branches ("Packs"), but currently faces a major integration gap between these features and the authoritative `main` branch.

While the frontend is deployed to `test.architex.co.za`, it is currently running in a limited "Demo Mode" and lacks full linkage to the specialized API features implemented in unmerged branches.

---

## 2. Branch & PR Inventory Status

### 2.1 Branch Divergence
There are over **100 remote branches** currently unmerged into `main`. These branches contain the bulk of the platform's advanced features.

| Category | High-Priority Unmerged Branches |
| :--- | :--- |
| **Core Packs** | `origin/feature/pack-8-finance-payment-escrow-commercial`<br>`origin/feature/pack-9-site-execution-field-control`<br>`origin/feature/pack-11-closeout-handover-occupancy`<br>`origin/feature/pack-12-practice-management-office-ops` |
| **Toolboxes** | Over 50 branches in `origin/toolbox/*` (e.g., `ai-drawing-checker`, `fee-calculator`, `snag-creator`) |
| **Engine/Spine** | `origin/feat/pack-1-toolbox-engine-spine`<br>`origin/feature/architex-platform-spine-pack` |
| **UI/UX** | `origin/feat/landing-go-live` (Liquid Glass redesign)<br>`origin/feature/navigation-framework` |

### 2.2 Pull Request Status
Many PRs have been closed without merging (e.g., #13, #14, #20, #23), leading to "orphaned" functional code that is present in the repository but not active in the production build.

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
