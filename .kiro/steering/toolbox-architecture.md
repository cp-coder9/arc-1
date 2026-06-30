# Toolbox Architecture & Product Modules

## Strategic Frame

Architex is NOT "54 standalone tools". It is **8 workflow modules** that contain sub-tools. Every tool built must serve one of these modules and integrate with the specification spine (SpecForge).

**Correct frame**: "What are the workflow objects that run a real building project?"
**Wrong frame**: "Do we have enough calculators/tools?"

The missing workflow objects that SpecForge provides:
- Specification, Selection, Product, Package, Issue, Approval, Substitution, Installed/As-built record

## 8 Website Modules

All 54+ tools are sub-tools inside these modules:

| # | Module | Core Object | Priority |
|---|--------|-------------|----------|
| 1 | **Project Passport** | Project truth: facts, stage, team, compliance, decisions | P0 |
| 2 | **Brief + Appointment** | Project intake → Passport seed, appointment scope, SpecForge seed | P0 |
| 3 | **SpecForge** | Specification spine: specs, selections, products, issues, approvals | P0 |
| 4 | **Compliance + Municipal Readiness** | SANS checks, readiness + gaps (advisory only), submission checklists | P0 |
| 5 | **Documents + Drawing Intelligence** | Drawing register, revisions, transmittals, superseded warnings | P0 |
| 6 | **Tender / Procurement / Supplier** | RFQ, package scopes, catalogue, quotes, delivery, warranty | P1 |
| 7 | **Site Execution** | Site diary, RFI, snags, H&S, workforce, plant | P1 |
| 8 | **Closeout + Payment + Audit** | Valuations, claims, escrow, snagging, handover, warranties | P1 |

## SpecForge — Central Pillar

SpecForge is the specification/workflow spine, not just another tile. It must connect to:

- Project Passport (project truth)
- Team / responsibility matrix
- Drawing register + File Manager
- RFQ / procurement (package handoff)
- Budget / QS review
- Client approvals
- Site substitutions
- Closeout / warranties
- Programme / Gantt

Every tool built must consider: "How does this write back into SpecForge or read from it?"

## Integration Contracts

### Every tool MUST:
1. Write back into Project Passport
2. Expose data to SpecForge where relevant
3. Write into the project audit trail
4. Surface actions to the Action Centre / Inbox
5. Respect role-based access scoping

### Data flow direction:
```
Brief → Project Passport ← All tools write back
         ↓
SpecForge ← Drawing Register, Catalogue, Procurement
         ↓
Procurement → Site Execution → Closeout
         ↓
Payment/Valuation ← tied to milestones + spec items
```

## Tool Registry Technical Requirements

### Known Issue: Registry Wiring Gap
- 54 tools in registry, 54 definitions exist
- 37 definitions marked full, 17 marked preview
- **Only 16 full definitions are connected via `calculatorDefinitionId`**
- 21 full definitions likely fall back to legacy runner

### Rule for new tools:
Every registry tile with a full/preview definition MUST have:
```typescript
calculatorDefinitionId: '<definition_id>'
```

### Required test coverage:
- Definition exists for toolId
- Registry tile resolves to intended definition
- Definition is reachable by the runner (not legacy fallback)

## Priority Build Sequence

### P0 — Do Now
- Integrate SpecForge properly (real route, project + standalone mode, registry tile, persistent data model, role permissions, tests)
- Fix toolbox registry wiring (all 21 unwired full definitions)
- Merge Brief Wizard + Technical Brief into one intake workflow
- Ensure Project Passport receives outputs from all major tools
- Make Drawing Register / File Manager / SpecForge interoperable
- Harden municipal/compliance source disclaimers ("advisory only" language)

### P1 — Next
- Tender/Bid Workbench (elevate from preview)
- Package Scope Viewer (essential for contractor/supplier scoping)
- Catalogue/Product Data Manager (SpecForge depends on this)
- Quote Response (supplier workflows)
- RFI/Site Instruction (core construction workflow)
- Snag/Evidence (core closeout/site workflow)
- Payment Dashboard
- Progress Viewer
- Warranty/Closeout handoff (Delivery Note → Warranty Upload)

### P2 — Later
- Freelancer tools (timesheet, deliverable submission)
- Resource centre (make knowledge/template library, not a "tool")
- CPD integration polish
- OpenProject live API bridge
- Supplier catalogue integrations
- BIM/Revit element sync

## Tools to Demote from Main Website

### Hide behind admin panel:
- Platform settings, system health monitor, fee tariff editor, payment rate config
- Audit trail viewer, AI review queue, admin governance

### Make background services (not user-facing tools):
- Audit trail, AI review queue, verification checks, source/version governance

### Make content/library (not calculators):
- Freelancer resource centre, generic resource centre/checklists

### Merge into single workflows:
- Technical Brief + Brief Wizard → "Project Intake / Brief Builder"
- Progress Viewer + Project Dashboard widgets
- Payment Dashboard + Financial Dashboard
- Catalogue Manager + SpecForge product library

## Compliance Tool Rules

All SANS/regulatory tools must:
- Clearly state mandatory/recommended/indicative source status
- Never reproduce copyrighted SANS clause text unless licensed
- Support municipality/region profile context
- Include professional sign-off gate
- Use "advisory only" language throughout
- Produce "readiness + gaps", never "certification"

## CPD — Separate Product Lane

CPD tools (standalone, staff tracker, assessment/facilitation) are a separate product lane. Do not mix into the project delivery toolbox. Build independently at P1/P2.
