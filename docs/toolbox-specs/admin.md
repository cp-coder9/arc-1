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

## 7. Toolbox Framework Status

All admin tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract). Admin role shares the same full-status tools as `platform_admin`.

### Full-status tools (8)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| admin_governance | `admin_governance_v1` | schedule | Policy status tracking, auditable overrides |
| audit_trail_viewer | `audit_trail_viewer_v1` | schedule | Audit event filtering and export |
| ai_review_queue | `ai_review_queue_v1` | schedule | AI output review, approve/reject |
| payment_rate_config | `payment_rate_config_v1` | schedule | Rate unit config, version control |
| user_verification_console | `user_verification_console_v1` | schedule | Verification status management |
| fee_tariff_editor | `fee_tariff_editor_v1` | schedule | Tariff version CRUD, lock issued |
| staff_cpd_tracker | `staff_cpd_tracker_v1` | hybrid | Multi-staff CPD monitoring |
| platform_settings | `platform_settings_v1` | schedule | Platform configuration CRUD |

### Preview-status tools (0)
All admin tools have reached full status.

### Framework details
- **Methods used:** schedule (table-CRUD/views), hybrid
- **Versioned tables:** Fee tariffs, payment rates, governance policies, CPD body rules
- **Rendering:** `DefinitionToolRunner` for all tools
- **Reports:** PDF/CSV export with audit trails, version history, configuration snapshots
