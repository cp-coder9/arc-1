# Firm Admin Toolbox Spec

**Role key:** `firm_admin` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav modules:** Toolboxes only ⚠ (orphaned — no Command Centre, Projects, Finance, etc.)

## 1. Identity
- **Title:** Firm Admin Toolbox
- **Subtitle:** Practice operations, staff management, CPD tracking, and firm governance tools.
- **Scope:** Firm administration tools for practice management, staff coordination, and compliance tracking.
- **Primary responsibilities:** Manage firm staff and resource allocation · Track CPD compliance and professional registrations · Oversee practice governance.
- **Handoff boundaries:** Cannot sign professional outputs · Cannot override project-level roles.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Practice management | Admin Console → `admin-console` · Remote Desktop / Resources → `resource-sharing` · Staff, Wages & Plant → `contractor-staff` |
| Compliance and development | CPD Assessment → `cpd-assessment` · Resource Centre → `resource-centre` · Drawing Register → `drawing-register` |

## 3. Standalone tools (`getToolsForRole('firm_admin')` → 8)
drawing_register, technical_brief, doc_control_issue, cpd_standalone, payment_dashboard, freelancer_resource_centre, staff_cpd_tracker, firm_document_register

Categories spanned: drawing, briefing, document_control, cpd, payment, resource_centre.

## 4. Lifecycle participation
- **continuous (practice operations):** Admin Console, Staff/Wages/Plant, staff_cpd_tracker, freelancer_resource_centre → staffing and resource allocation across all phases.
- **design/comply:** drawing_register, technical_brief, doc_control_issue, firm_document_register → firm-level document and drawing governance.
- **compliance tracking:** cpd_standalone, CPD Assessment → CPD compliance and professional registration monitoring.
- **pay:** payment_dashboard → practice-level payment visibility.

## 5. Governance gates
- Firm admin coordinates staff/resources but cannot sign professional outputs (handoff boundary).
- CPD tracking is compliance monitoring only; cannot override project-level professional roles.

## 6. Workflow verification & gaps
- ⚠ **Workflow finding #1 — orphaned role.** `firm_admin` appears ONLY in the `toolboxes` navigation module. No Command Centre, Projects, or People modules route to this role; firm operations are reachable solely through the Toolboxes shell.
- ⚠ AI-guided mode surfaces 6 tools across 2 groups; tiles mode surfaces 8 standalone tools. Gap of 2 (`technical_brief`, `doc_control_issue`) reachable only via "All tools" toggle. Note guided `staff` and `cpd-assessment` routes resolve to standalone `staff_cpd_tracker` / `cpd_standalone` equivalents.
- ✅ Practice-management + compliance grouping aligns with firm-governance scope; professional sign-off correctly excluded.

## 7. Toolbox Framework Status

All firm admin tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (2)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| staff_cpd_tracker | `staff_cpd_tracker_v1` | hybrid | Multi-staff CPD monitoring, body rules |
| firm_document_register | `firm_document_register_v1` | schedule | Document categories, revision states |

### Preview-status tools (0)
All firm admin tools have reached full status.

### Framework details
- **Methods used:** hybrid, schedule
- **Versioned tables:** CPD body rules, document categories
- **Rendering:** `DefinitionToolRunner` for all tools
- **Reports:** PDF/CSV export with CPD compliance summaries, document registers, source versions
