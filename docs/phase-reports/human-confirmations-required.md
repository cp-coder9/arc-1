# Human Confirmations Required Consolidation

Date: 2026-05-15  
Branch: `phase-2-verification-workflows`  
Scope: consolidated human blockers and confirmation points from `docs/phase-reports/*`, `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md`, `Full_scope.md`, and `docs/phase-reports/backend-html-dashboard-alignment.md`.

## Summary

The implementation reports consistently separate production-safe backend progress from decisions that require a human product, legal, operational, provider, or compliance owner. These items should be resolved before final production sign-off for the affected workflows. AI and automated services remain advisory or gated where confirmations are outstanding. Sensitive workflow launch flags and dry-run defaults are documented in `docs/backend/sensitive-workflow-feature-flags.md`. The latest API contract coverage wave added deterministic mock/dev examples for documented non-legacy routes; this improves integration clarity but does not resolve any production legal, provider, municipal, payment, privacy, or statutory blocker below.

## Immediate Production Sign-Off Blockers

| Area | Confirmation required | Source |
|---|---|---|
| Professional verification | Confirm authoritative providers, API agreements, manual verification SLA, accepted evidence, override policy, and exact rejection policy for no-record results. | `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md`, `phase-1-security-rbac-audit.md`, `phase-2-automated-verification-workflows.md` |
| Contractor/subcontractor/supplier verification | Confirm CIDB, NHBRC, CIPC, tax clearance, B-BBEE, supplier credential requirements, role-specific expiry windows, and manual override policy. | `phase-1-2-gap-closure.md`, `phase-1-security-rbac-audit.md`, `phase-2-automated-verification-workflows.md` |
| Escrow and payments | Confirm gateway, escrow/legal model, settlement timing, refund rules, fee rates, chargeback policy, and whether funds are held by a licensed provider or trust/escrow partner before production escrow release. | `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` |
| Municipal integrations | Confirm launch municipality list, portal access terms, whether automation is permitted, API agreements, and manual evidence standards. | `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` |
| POPIA/privacy/security | Confirm retention periods, operator/responsible-party allocation, privacy policy, data subject request handling, audit/search-term retention, and breach-response ownership. | `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md`, `phase-1-2-gap-closure.md` |
| CPD statutory sync | Confirm whether Architex will become or acquire an accredited CPD provider, which councils must sync, certificate rules, provider credentials, endpoint ownership, and statutory submission authority. | `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md`, `phase-7-cpd-service-slice.md` |
| Appointment legal gate | Confirm whether platform-generated appointment contracts are drafts until external e-signature/human acceptance, or whether in-app acceptance can bind parties. | `phase-1-2-gap-closure.md` |

## Data Model and Workflow Confirmations

| Area | Confirmation required | Source |
|---|---|---|
| Phase 2 canonical collections | Confirm whether to keep current `jobs`, `technical_briefs`, and `appointment_contracts` as compatibility stores, or migrate/dual-write to canonical plan collections such as `project_briefs`, `project_attachments`, `proposals`, and `appointments`. | `phase-1-2-gap-closure.md` |
| Proposal schema | Confirm marketplace fee proposal schema and whether `jobs/*/fee_proposals` should become top-level `proposals`. | `phase-1-2-gap-closure.md` |
| Directory search exposure | Confirm whether directory search should expose unverified profiles with warnings or only verified profiles by default. | `phase-1-2-gap-closure.md` |
| Directory invitations email | Confirm whether directory invitations should generate outbound email via a transactional email provider once configured. Current implementation persists onboarding invitations and in-app notifications. | `phase-3-directory-and-invitations.md` |
| Invitation expiry | Product decision already recorded: pending registration and acceptance invitations do not expire. They persist with `expiryPolicy: none` and reminder metadata. | `phase-3-directory-and-invitations.md` |
| Admin override dual approval | Confirm whether any admin override scenarios require dual approval despite admin override authority. Current Phase 1 decision permits admin override with auditable reason and `admin_override` events. | `phase-1-security-rbac-audit.md` |
| High-risk verification actions | Confirm whether admin rejection or expiry requires a second admin for high-risk roles. | `phase-2-automated-verification-workflows.md` |

## Construction, Package, Procurement, and Resource Confirmations

| Area | Confirmation required | Source |
|---|---|---|
| Package close-out evidence | Confirm final close-out evidence checklist per package type and trade. | `phase-6-package-readiness-service.md` |
| Procurement records | Confirm supplier/procurement document naming and retention requirements. | `phase-6-package-readiness-service.md` |
| Contractor records | Confirm whether wage and plant records are mandatory for all contractor packages or only specific package types. | `phase-6-package-readiness-service.md` |
| Phase 6 Firestore/API design | Confirm Firestore collection, rule, and index design once Phase 6 ownership of rules/API is free. | `phase-6-package-readiness-service.md` |
| QS BoQ/BoM vetting | If a QS is added to a project team, confirm operational responsibility for human-in-the-loop vetting of BoQ/BoM. | `Full_scope.md` |
| Supplier API/provider access | Confirm real supplier API/provider contracts for catalogue, availability, pricing, lead times, alternatives, delivery windows, order status, and delivery tracking. | `Full_scope.md` |
| Resource booking providers | Confirm remote/access-session providers, payment gateway handling, payout provider, real credentials, and operational policies before live resource bookings can provision sessions or simulate payouts. | `phase-7-resource-booking-service-slice.md` |

## AI and Human Approval Gates

| Gate | Required human confirmation or operating rule | Source |
|---|---|---|
| AI procurement/material ordering | AI may compare options, flag risks, prompt purchase orders, and suggest substitutions, but must request human approval and never auto-purchase. Confirm approval workflow owner and thresholds before live purchasing. | `Full_scope.md` |
| AI professional/compliance authority | AI must not auto-certify professional compliance, auto-sign contracts, auto-release escrow, auto-purchase materials, replace professional judgment, or bypass human approval. Human approval gates remain essential. | `Full_scope.md`, `FULL_SCOPE_PHASED_IMPLEMENTATION_PLAN.md` |
| Package readiness service | Service is decision support only. It may return blockers, warnings, scores, required evidence, missing evidence, and summaries, but must not certify work, award packages, close RFIs, approve inspections, release payments, or override human/professional responsibility. | `phase-6-package-readiness-service.md` |
| Verification automation | Browser/register verification may mark results pending with `requiresHumanReview: true` when official pages change, fail, block automation, or cannot be conclusively parsed. Confirm production review queue SLA and evidence standards. | `phase-2-automated-verification-workflows.md` |

## Dashboard/Product Surface Confirmations

The backend dashboard alignment report did not edit code and found broad gaps between `backend.html` and the React dashboard implementation. These are product/frontend alignment confirmations rather than backend blockers.

| Area | Confirmation required | Source |
|---|---|---|
| Canonical dashboard page matrix | Confirm whether `backend.html` remains the canonical role/page matrix for shared pages: Command Centre, Project Toolbox, Project Journey, Tasks & Approvals, Project Messenger, Programme/Gantt, Dispute Resolution, Payments, Contracts, Escrow, and AI Co-Pilot. | `backend-html-dashboard-alignment.md` |
| Role naming alignment | Confirm final role naming and routing strategy for `architect` versus `bep`, since `backend.html` uses `bep` while current React dashboards still use both. | `backend-html-dashboard-alignment.md`, `phase-1-security-rbac-audit.md` |
| Client dashboard scope | Confirm priority for missing/partial client pages: guided brief wizard, proposal comparison, manual directory search, read-only municipal status, progress reports, messenger, programme, disputes, payments/contracts/escrow, and AI Co-Pilot. | `backend-html-dashboard-alignment.md` |
| Browser validation limitation | Confirm whether source-level extraction of `backend.html` is sufficient for this report, or rerun visual validation when browser automation is available. | `backend-html-dashboard-alignment.md` |

## Decisions Already Recorded

- `architect` is a BEP subtype, and the permission layer normalizes `architect` to `bep`.
- Admins may override the separation-of-duty policy.
- Admin override requires an auditable reason, and high-value override actions persist `admin_override` audit events.
- Pending registration and acceptance invitations do not expire, using `expiryPolicy: none` plus reminder metadata.

## Recommended Resolution Order

1. Resolve legal/commercial gates for escrow, appointment acceptance, payment provider, and POPIA retention before enabling binding money or contract flows.
2. Resolve verification source policy and provider credentials before final production verification sign-off.
3. Resolve canonical Phase 2 collection migration/dual-write strategy before expanding proposal, appointment, and marketplace APIs further.
4. Resolve CPD/statutory sync and municipal provider agreements before enabling any external submission/sync jobs.
5. Resolve dashboard role/page canonical matrix before major frontend dashboard expansion.
