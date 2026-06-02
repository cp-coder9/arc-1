


# Architex Strategy & Technical Implementation Plan

**Based on Founders' Strategy Meeting, Workflow Architecture, and System Documentation**

This document provides a contextualized summary of the architectural and business decisions discussed during the platform strategy meeting, followed by a comprehensive technical task list to achieve this vision using the current Architex codebase (as defined in `DOCUMENTATION.md`).

---

## Part 1: Contextual Transcription & Business Requirements

The conversation represents a strategic product design meeting between the platform's founders. They are reviewing the "Architex Ideal Built Environment Workflow" (from the provided architecture map) and finalizing how the monetization, role-based dashboards, AI agents, and new features will function.

**1. Monetization Layer**
*   **Subscriptions:** Professionals (Architects, BEPs, Contractors, Freelancers) will pay a highly accessible monthly subscription of R99/month. 
*   **Client Fees:** Clients (homeowners/developers) do *not* pay the monthly subscription. Instead, they pay a small, nominal "Project Activation Fee" to post a job to filter out spam.
*   **Transaction/Platform Fees:** The platform will charge a transparent ~1% transaction fee on payments running through the escrow system (e.g., professional fees, construction claims, freelancer payouts). At scale, this minimal fee becomes highly lucrative without burdening the users.
*   **Premium Add-ons:** Additional revenue will be generated from premium reports, AI hardware resource-sharing, or credit-based complex exports.

**2. Role-Based Dashboards & Workflows**
*   **Client Dashboard:** Focuses on project diagnostics, viewing proposals, municipal tracking, and signing digital contracts. 
*   **Professional (Architect/BEP) Dashboard:** Features the marketplace, team coordination (Team OS), documentation, AI compliance checking, and invoicing tied to the escrow system.
*   **Contractor Dashboard:** Needs specific tools for the tender process, Gantt charts, RFI (Request for Information) management, site instructions, and materials procurement. 
*   **Firm/Enterprise Workspaces:** A requirement was established for a "Firm" dashboard where multiple users (Lead Coordinators, Draughtspersons, Admins) can operate under one company umbrella.

**3. API & Ecosystem Integrations**
*   **Builders Warehouse API:** A major proposed feature is an API integration with material suppliers (specifically mentioning Builders Warehouse) so contractors can procure materials directly through the platform based on AI-generated Bills of Quantities.

**4. AI Agent Orchestration**
*   The system uses an "AI Orchestrator" that routes tasks to specialist agents: Briefing, Matching, Proposal, Design Coordination, Compliance, Municipal, Tender, Construction, and Payment.
*   The founders discussed potentially hot-swapping from OpenAI/Gemini to Anthropic's Claude in the future if Claude performs better for complex reasoning or partnering with external providers for compute.

**5. The CPD Module - *New Feature***
*   **Continuing Professional Development (CPD):** To keep professionals engaged on the platform, Architex will host native CPD-accredited webinars and short courses. Professionals can earn their required industry points directly in the app, creating massive platform stickiness. 

---

## Part 2: Technical Task List

To implement this vision using the current Express/React/Firestore stack described in the documentation, the following tasks must be executed.

### Epic 1: Monetization & Payment Infrastructure Updates
*Refers to `src/services/paymentService.ts` and `src/services/financialLedgerService.ts`*

*   [ ] **Task 1.1: Subscription Logic via PayFast**
    *   Update `paymentService.ts` to support recurring PayFast tokenization for the R99/month professional subscription.
    *   Update Firestore Security Rules (`firestore.rules`) to check for an `activeSubscription` boolean on professional user profiles.
*   [ ] **Task 1.2: Client Project Activation Fee**
    *   Modify `createProject()` in `projectLifecycleService.ts`. Add a payment gate requiring clients to pay a nominal activation fee before the Job status changes from `draft` to `open`.
*   [ ] **Task 1.3: 1% Platform Transaction Fee**
    *   Update `approveStageRelease()` in `paymentService.ts`. Ensure the `platformFeeAmount` logic correctly deducts ~1% from the `escrow_deposit` or `milestone_release` and logs it appropriately in the `financialLedgerService.ts`.
*   [ ] **Task 1.4: Premium Credits System**
    *   Create a `credits` integer field on the `UserProfile` type in `src/types.ts`.
    *   Create a `/api/payment/credits` route to allow purchasing credits for premium AI exports.

### Epic 2: Dashboards & Firm Management
*Refers to `src/components/*Dashboard.tsx` and `src/types.ts`*

*   [ ] **Task 2.1: Implement Contractor Dashboard**
    *   Create `ContractorDashboard.tsx` (if not fully flushed out) with modules for: Tender Pack viewer, Gantt Chart Integration (`GanttChart.tsx`), RFI/Site Instruction Logs, and Payment Claim generation.
    *   Ensure `UserRole` in `src/types.ts` explicitly includes `'contractor'`.
*   [ ] **Task 2.2: Firm/Agency Accounts (Multi-User)**
    *   Update `src/types.ts` to include a new `Firm` interface and add `firmId` and `firmRole` (`admin`, `user`) to `UserProfile`.
    *   Update `firestore.rules` to allow users with the same `firmId` to read/write shared projects.
    *   Create a `FirmDashboard.tsx` to allow firm admins to invite staff, assign them to projects, and view unified firm billing.

### Epic 3: Third-Party Ecosystem Integrations
*Refers to `api/index.ts` and external services*

*   [ ] **Task 3.1: Material Supplier API Integration (Builders Warehouse)**
    *   Create `src/services/procurementService.ts` to handle external API requests.
    *   Map the AI-generated `Bill of Materials` (from `TenderAgent`) to the supplier's API payload.
    *   Create an affiliate/referral tracking mechanism in `financialLedgerService.ts` to log commissions from material orders.

### Epic 4: AI Orchestrator & Agent Refinement
*Refers to `src/services/geminiService.ts` and `src/services/agents/*`*

*   [ ] **Task 4.1: Audit Agent Triggers**
    *   Ensure the 9 orchestrator agents mapped in the visual workflow (Briefing, Matching, Proposal, Design Coordination, Compliance, Municipal, Tender, Construction, Payment) correspond to the 9 stages in `projectLifecycleService.ts`.
    *   Create missing agent wrappers (e.g., `paymentAgent.ts` to automate escrow release conditions based on digital sign-offs).
*   [ ] **Task 4.2: LLM Provider Hot-Swapping**
    *   Leverage the existing `LLMProvider` logic (`callAgentReview()` via `/api/review`) to ensure Anthropic/Claude is added as an option in `system_settings/llm_config` so admins can switch away from Gemini/GPT seamlessly if required.

### Epic 5: CPD Module (New Implementation)
*Refers to New Components and Firestore Collections*

*   [ ] **Task 5.1: CPD Data Models & Rules**
    *   Update `src/types.ts` with `CPDCourse` (title, videoUrl, credits, testQuestions) and `CPDRecord` (userId, courseId, pointsEarned, date).
    *   Update `firestore.rules` to allow users to read `cpd_courses` and write to their own `cpd_records`.
*   [ ] **Task 5.2: CPD UI Components**
    *   Create `src/components/CPDHub.tsx` featuring a video player, course list, and a quiz component.
    *   Create a tracker in `ArchitectDashboard.tsx` showing the user's current CPD points vs. annual SACAP requirements.
*   [ ] **Task 5.3: CPD Certification Engine**
    *   Create a PDF generation utility that triggers when a course is passed, saving the certificate to Vercel Blob (`VITE_BLOB_READ_WRITE_TOKEN`) and adding the link to the user's profile.

### Epic 6: Notification & Knowledge Base Expansion
*Refers to `src/services/notificationService.ts` and `src/services/knowledgeService.ts`*

*   [ ] **Task 6.1: New Notification Triggers**
    *   Update the `NotificationType` enum in `src/types.ts` to include: `firm_invite`, `firm_role_updated`, `material_order_placed`, `cpd_certificate_issued`, and `subscription_failed`.
    *   Implement trigger logic in `notificationService.ts` to dispatch push/email/in-app notifications for these new events, ensuring they respect the user's `NotificationPreferences`.
*   [ ] **Task 6.2: AI Knowledge Base Integration for CPD**
    *   Modify `knowledgeService.ts` so that when a new CPD course/webinar is published, its transcript is automatically sanitized and added to the `agent_knowledge` collection as `active`.
    *   This ensures the AI specialist agents (e.g., `fire_safety`, `architectural_completeness`) learn from the platform's own CPD content.

### Epic 7: Security Rules & Data Integrity
*Refers to `firestore.rules`*

*   [ ] **Task 7.1: Firm/Workspace Access Controls**
    *   Add a new helper function `isFirmMember(firmId)` in `firestore.rules`.
    *   Update the `projects` and `jobs` collection rules to allow read/write access if `request.auth.uid` belongs to a user who shares a `firmId` with the project's lead architect.
*   [ ] **Task 7.2: Immutable Ledger Strictness**
    *   Ensure the 1% transaction fee logic is completely tamper-proof. Write rules for the `ledger` collection that strictly enforce: `allow write: if isAdmin();` (since the Express backend using the Admin SDK will handle the PayFast ITN confirmations and ledger entries).
*   [ ] **Task 7.3: CPD Collection Rules**
    *   `cpd_courses`: `allow read: if isAuthenticated(); allow write: if isAdmin();`
    *   `cpd_records`: `allow read: if isOwner(resource.data.userId); allow create: if isAdmin();` (Prevent users from spoofing CPD points).

### Epic 8: Testing & Deployment Adjustments
*Refers to `/src/services/__tests__/`, `/e2e/`, and Environment Variables*

*   [ ] **Task 8.1: Unit Testing New Financials (Vitest)**
    *   Create/update `paymentService.test.ts` to mock the V2 stage-linked escrow.
    *   Write specific assertions to verify the `platformFeeAmount` accurately calculates the ~1% deduction and correctly splits the R99 subscription logic.
*   [ ] **Task 8.2: End-to-End Workflows (Playwright)**
    *   Write a new Playwright test (`e2e/firm-workspace.spec.ts`) simulating an Admin inviting a Draughtsperson to their Firm.
    *   Write a test (`e2e/cpd-flow.spec.ts`) simulating an architect taking a CPD quiz and verifying their `UserProfile` points increment.
*   [ ] **Task 8.3: Environment Variable Updates**
    *   Add required keys for the material supplier API (e.g., `BUILDERS_WAREHOUSE_API_KEY`, `BUILDERS_API_URL`) to `.env.example` and the Vercel production environment.

### Epic 9: Admin Dashboard & Maintenance Tools
*Refers to `src/components/AdminDashboard.tsx` and Maintenance Scripts*

*   [ ] **Task 9.1: Subscription & Firm Management View**
    *   Update `AdminDashboard.tsx` to include a "Firm Management" tab to oversee firm hierarchies, resolve disputes, and manually override `firmRole` assignments.
    *   Create a "Financials" tab to track the recurring R99 subscriptions and the accumulated 1% escrow transaction fees (querying the `ledger` collection). 
*   [ ] **Task 9.2: CPD Course Management**
    *   Build a `CPDAdminManager` component within the Admin Dashboard allowing the admins to upload new CPD videos, define quiz questions/answers, and assign SACAP credit values.
*   [ ] **Task 9.3: Agent Roster Updates**
    *   Update the `SPECIALIZED_AGENTS` array in `geminiService.ts` to explicitly define the new agents mapped in the image.
    *   Run `npx tsx list_agents.ts` and `npx tsx update_agents.ts` to seed these updated definitions into the production Firestore `agents` collection.

### Epic 10: Frontend UI & Framework Adherence
*Refers to `src/components/ui/` and `src/index.css`*

*   [ ] **Task 10.1: Shadcn/UI Expansion**
    *   Run `npx shadcn add` for any missing components needed for the new Contractor Dashboard and CPD Hub (e.g., `accordion`, `progress`, `radio-group` for quizzes, `data-table` for material procurement lists).
*   [ ] **Task 10.2: Tailwind v4 Styling**
    *   Ensure all new UI components adhere strictly to the Tailwind v4 specification. Remember that there is **no `tailwind.config` file**; all theme extensions must be added via the `@theme inline` directive inside `src/index.css`.
*   [ ] **Task 10.3: Route Lazy Loading**
    *   Ensure the newly created `ContractorDashboard.tsx`, `FirmDashboard.tsx`, and `CPDHub.tsx` are wrapped in `React.lazy()` in `App.tsx` to maintain fast initial load times.

---

## Part 3: Recommended Sprint 1 Implementation Plan

To prevent regression on the current stable features (AI compliance checking and basic workflows), the team should tackle these epics in the following order:

1.  **Phase 1: Foundation (Data & Auth)**
    *   Execute **Task 2.2** (Firm/Agency data models) and **Task 7.1** (Firm security rules). This is the most structural change and affects how data is queried across all dashboards.
2.  **Phase 2: Monetization Pivot**
    *   Execute **Epic 1**. Transition the PayFast sandbox logic to support the R99 recurring subscription and the 1% transaction fee ledger updates. Test this thoroughly in the PayFast sandbox environment.
3.  **Phase 3: The Stickiness Engine (CPD)**
    *   Execute **Epic 5**. Build the CPD UI and video hosting (leveraging Vercel Blob or a dedicated video hosting provider).
4.  **Phase 4: Ecosystem Expansion**
    *   Execute **Task 3.1**. The material supplier API integration is highly complex and should be treated as a standalone epic once the core app is generating revenue.

---

## Part 4: Final Deployment & Go-Live Checklist

Once the Sprints are completed, the following steps must be taken to safely promote the new workflow to the production environment hosted on Vercel and Firebase.

*   [ ] **1. Production Environment Variables Verification:**
    *   Transition PayFast from Sandbox to Production by updating Vercel environment variables (Set `VITE_PAYFAST_SANDBOX=false`).
    *   Ensure `VITE_PAYFAST_MERCHANT_ID`, `VITE_PAYFAST_MERCHANT_KEY`, and `VITE_PAYFAST_PASSPHRASE` are updated to production credentials.
    *   Verify external supplier API keys are securely added to Vercel (without the `VITE_` prefix to keep them hidden from the frontend bundle).
*   [ ] **2. Database & Storage Sanity Check:**
    *   Confirm the Vercel Blob token (`VITE_BLOB_READ_WRITE_TOKEN`) has sufficient storage limits configured for the new CPD video uploads and auto-generated PDF certificates.
    *   Ensure the Firebase project has Firestore backups enabled, as the `ledger` collection will now hold high-volume transactional data.
*   [ ] **3. Security Rules Deployment:**
    *   Run `firebase deploy --only firestore:rules --dry-run` to test the new Firm and CPD rules.
    *   If successful, run `firebase deploy --only firestore:rules` to lock down the production database.
*   [ ] **4. Build & Deployment:**
    *   Run `npm run lint && npm run test:coverage && npm run test:e2e` to verify the codebase is stable.
    *   Merge the staging branch into `main` to trigger the automated `vercel-build` script, deploying the Express adapter (`api/index.ts`) and the React SPA frontend.
*   [ ] **5. Post-Deployment Validation:**
    *   Log into the production site as an Admin.
    *   Navigate to the Admin Dashboard and verify system logs are tracking cleanly.
    *   Execute a R5 dummy transaction through the PayFast integration to ensure the 1% fee logic and webhook (`/api/payment/notify`) hit the Firestore `ledger` successfully.