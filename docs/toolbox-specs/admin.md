# Admin Toolbox Spec

**Role key:** `admin` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav modules:** Command Centre, Inbox, Projects, Toolboxes, CPD & Learning, Documents, Marketplace, Finance, Messages, Settings (richest nav)

## 1. Identity
- **Title:** Admin Governance Toolbox
- **Subtitle:** Whole-system governance, audits, role tools, AI review, payment settings, disputes, and platform configuration.
- **Scope:** Admin tools govern the platform but still require auditable reasons for overrides and sensitive decisions.
- **Primary responsibilities:** Monitor verification, disputes, audit queues · Review AI and sensitive workflow exceptions · Configure platform governance settings.
- **Handoff boundaries:** Cannot silently override user-facing decisions · Cannot execute payments or statutory actions without recorded authorization.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Platform governance | Admin Console → `admin-console` · Audit Trail Viewer → `disputes` |
| AI and payment controls | AI Review Queue → `ai` · Payment Rate Settings → `payments` |

## 3. Standalone tools (`getToolsForRole('admin')` → 9)
admin_governance, audit_trail_viewer, ai_review_queue, payment_rate_config, user_verification_console, fee_tariff_editor, staff_cpd_tracker, platform_settings, system_health_monitor

Categories spanned: governance, audit, ai, payment, verification, fee_calculator, cpd, settings, monitoring.

## 4. Lifecycle participation (cross-cutting, all phases)
- **appointment/comply:** user_verification_console, audit_trail_viewer → verification and dispute oversight.
- **procure/pay:** payment_rate_config, fee_tariff_editor → rate and tariff governance.
- **continuous:** admin_governance, ai_review_queue, platform_settings, system_health_monitor, staff_cpd_tracker → AI review, configuration, and health monitoring spanning the whole lifecycle.

## 5. Governance gates
- Overrides and sensitive decisions require an auditable reason (`admin_governance`, `audit_trail_viewer`).
- AI exceptions routed through `ai_review_queue` — human review of AI/sensitive workflow exceptions.
- Cannot execute payments or statutory actions without recorded authorization.

## 6. Workflow verification & gaps
- ✅ Richest navigation footprint of all roles — Command Centre, Inbox, Projects, Toolboxes, CPD & Learning, Documents, Marketplace, Finance, Messages, Settings all route to `admin`. Not orphaned, unlike `developer` / `firm_admin` / `platform_admin`.
- ⚠ AI-guided mode surfaces only 4 tools across 2 groups; tiles mode surfaces 9 standalone tools. Gap of 5 (`user_verification_console`, `fee_tariff_editor`, `staff_cpd_tracker`, `platform_settings`, `system_health_monitor`) reachable only via "All tools" toggle. Recommend a "Verification & health" group to expose the verification console and system monitor in guided flow.
- ✅ Governance gates align with scope: auditable overrides, AI review queue, and recorded payment authorization all enforced.
