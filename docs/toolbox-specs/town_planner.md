# Planner Toolbox Spec

**Role key:** `town_planner` · **UserRole:** ✅ · **TOOLBOX_CONFIG:** ✅ · **Nav:** Toolboxes only ⚠

## 1. Identity
- **Title:** Planner Toolbox
- **Subtitle:** Zoning, land use, and statutory planning tools for municipal submissions.
- **Scope:** Town planning approval tools. Statutory submissions require registered professional sign-off.
- **Responsibilities:** Prepare zoning and land-use applications · Coordinate municipal submissions · Manage public participation.
- **Handoff boundaries:** Cannot certify building compliance · Land-use decisions require council approval.

## 2. AI-guided toolbox groups
| Group | Tools (→ pageId) |
|-------|------------------|
| Planning applications | SANS / Compliance Forms → `sans-forms` · Design & Compliance → `design` · Technical Brief Editor → `technical-brief` |
| Professional resources | Remote Desktop / Resources → `resource-sharing` · CPD Assessment → `cpd-assessment` |

## 3. Standalone tools (`getToolsForRole('town_planner')` → 6)
fee_calculator, sans_forms, drawing_register, doc_control_issue, cpd_standalone, zoning_check

Categories spanned: fee_calculator, compliance, drawing, document_control, cpd, planning.

## 4. Lifecycle participation
- **feasibility:** zoning_check, fee_calculator → establishes land-use viability.
- **concept_design:** zoning_check, drawing_register.
- **municipal_submission:** sans_forms, doc_control_issue, zoning_check (zoning/land-use applications, public participation).
- **continuous:** cpd_standalone.

## 5. Governance gates
- Statutory/land-use submissions (`sans_forms`, `zoning_check`) require registered professional sign-off and council approval.
- Cannot certify building compliance — planning evidence prepared only.

## 6. Workflow verification & gaps
- ⚠ **Workflow finding #1 — orphaned role:** `town_planner` appears **only** in the `toolboxes` nav module — no Command Centre, Inbox, Projects, or Messages. The role has full `TOOLBOX_CONFIG` and 6 registry tools but cannot reach a project, inbox, or messages through nav. Either add `town_planner` to the relevant nav modules or treat it as a `bep`/`admin` subtype at the auth layer. See `_CROSS_ROLE_FINDINGS.md`.
- ⚠ AI-guided mode exposes 5 curated tools across 2 groups; tiles mode surfaces 6. `fee_calculator` (the only standalone-distinct costing tool) is reachable only via the "All tools" toggle.
- ⚠ AI-guided group routes (`sans-forms`, `design`, `technical-brief`, `resource-sharing`, `cpd-assessment`) — verify each pageId resolves, especially given the orphaned nav.

## 7. Toolbox Framework Status

All town planner tools now participate in the Toolbox Capability Framework (`CalculatorDefinition` contract).

### Full-status tools (2)
| Tool | Definition ID | Method | Key clause coverage |
|------|---------------|--------|-------------------|
| zoning_check | `zoning_check_v1` | clauseSet + area | Coverage/FAR/height, zoning scheme rules |
| fee_calculator | `fee_calculator_v1` | bracket | SACPLAN fee brackets, stage apportionment |

### Preview-status tools (0)
All town planner tools have reached full status.

### Framework details
- **Methods used:** clauseSet, area, bracket
- **Versioned tables:** Zoning schemes (coverage/FAR/height), SACPLAN fee brackets
- **Rendering:** `DefinitionToolRunner` for all tools
- **Reports:** PDF/CSV export with clause outcomes, source versions, disclaimers
