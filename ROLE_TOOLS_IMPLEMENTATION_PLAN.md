# Backend.html Role Tools Implementation Plan

Start: 2026-05-17 14:21 UTC  
Branch: phase-2-verification-workflows  
Scope: create production role tools per `backend.html` without changing unrelated site behavior. `backend.html` remains a reference only.

## Constraints
- Production code only: no mock dashboard data, placeholders, or simulated tool results.
- Do not commit user-provided/reference artifacts: `backend.html`, `BACKEND_HTML_OUTSTANDING_ITEMS.md`, `12/`, `release/`.
- Keep existing BEOS layout/theme and role navigation intact.
- Unsafe actions such as payment release, contract signature, appointment, or dispute resolution remain human-confirmed and auditable.
- Firestore reads/writes must match deployed rules or include a rules update plus validation.

## Current coverage map
Already implemented production pages from previous passes:
- Shared: Command Centre, Project Toolbox, Tasks & Approvals, AI Co-Pilot.
- Client: Guided Brief Wizard, BEP Proposal Comparison, Directory Search, Municipal Status, Progress Reports.
- BEP/Architect: Design & Compliance, AI Drawing Checker, SANS / Compliance Forms, Technical Brief Editor, Freelancer Jobs, Resource Centre, Resource Sharing, CPD Assessment.
- Contractor/Subcontractor/Supplier: Procurement and Package workspace; Contractor Staff/Wages/Plant.
- Freelancer: Assigned Work, Submissions & Feedback, Resource Centre, Resource Sharing.
- Admin: Admin Console and governance dashboard.

## Highest-impact remaining role-tool gaps in the 3-hour window
The remaining visible `backend.html` shared pages still route through the generic `ProjectWorkflowPage` with minimal/empty sections:
1. Project Messenger
2. Contracts & Signing
3. Dispute Resolution
4. Programme/Journey/Construction/Snagging resiliency for non-client/non-BEP roles

These are shared pages exposed to all roles, so improving them benefits every user role without expanding scope beyond the reference.

## Implementation slices
### Slice 1: Project Messenger tool
- Add a real `ProjectMessengerPage` backed by visible live jobs and `messages` collection records.
- Provide job selector, message thread, send form for permitted client/BEP/architect project participants, and a governed unavailable state for roles that do not yet have a live counterparty.
- Avoid composite-index requirements and avoid `orderBy` in dashboard projections.

### Slice 2: Contracts & Signing tool
- Add a real `ContractSigningPage` that reads `appointment_contracts`, related projects/jobs/escrow summaries, and exposes role-aware readiness/status panels.
- Do not perform digital signing or payment actions from the page. Show human-confirmed next actions and immutable contract scope/milestone details.
- Add Firestore rules for authenticated participants/admin to read appointment contracts if needed.

### Slice 3: Dispute Resolution tool
- Add a real `DisputeResolutionPage` backed by `disputes` records.
- Allow eligible project/job participants to file a dispute from a visible job. Admin continues to mediate/resolve in Admin Dashboard.
- Show role-visible dispute register without exposing unrelated disputes. Update Firestore rules if needed to allow participant/owner list queries.

### Slice 4: Routing, tests, validation, deploy, review
- Route `messages`, `contracts`, and `disputes` to their production components instead of empty workflow sections.
- Add static registry assertions and focused service/component tests where deterministic.
- Run `npm run lint`, focused tests, full unit regression with timeout, and Chromium Playwright where practical.
- If validation passes, build with relative base and upload to shared hosting.
- Create `ROLE_TOOLS_HUMAN_REVIEW.md` with completed work, tests, deployment state, blockers, and human follow-up.

## Swarm usage
- Role requirement auditors are mapping backend.html gaps per role.
- Implementation auditor is checking existing service/rules patterns.
- QA/deployment auditor is checking validation/deployment sequence.
- Main agent will merge findings into the implementation and review file.
