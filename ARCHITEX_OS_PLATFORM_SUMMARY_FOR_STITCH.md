# Architex OS — Platform Summary for Stitch

> Use this document to understand the full product so you can generate the correct screens, modules, and navigation structure for the Datum UI design scaffold.

---

## What Architex OS Is

Architex OS is the operating system for the built environment. It coordinates every person, document, decision, and payment on a building project — from the moment a client has an idea through to final handover of the completed building.

It is not a project management tool. It is not a document store. It is the single truth layer that sits above all of those things and keeps them aligned.

**One platform. Every role. Every stage. One truth.**

---

## Who Uses It

17 professional roles work inside Architex OS. Each sees a different view of the same project truth.

### Defining Roles (above the datum line)
- **Client** — The building owner. Posts briefs, approves decisions, tracks progress, governs payments.
- **Architect** — Leads design delivery, compliance, and project coordination.
- **Engineer** — Structural/civil design, calculations, compliance sign-off.
- **Quantity Surveyor** — Cost control, bills of quantities, commercial governance.
- **Town Planner** — Zoning, land use, statutory planning approvals.
- **Energy Professional** — Energy modelling, SANS 10400-XA compliance.
- **Fire Engineer** — Fire safety design, rational fire designs, SANS 10400-T.
- **BEP (Built Environment Professional)** — Coordinates professional deliverables across disciplines.

### Executing Roles (below the datum line)
- **Contractor** — Drives construction programme, manages packages, site operations.
- **Subcontractor** — Manages package scope, evidence, claims, close-out.
- **Supplier** — Tracks procurement, deliveries, warranties, product evidence.
- **Freelancer** — Completes assigned deliverables and submissions.
- **Site Manager** — Daily site operations, health & safety, programme delivery.
- **Health & Safety Officer** — Safety files, permits, inductions, incidents.

### Governing Roles
- **Developer** — Project portfolio, investment governance, programme strategy.
- **Firm Admin** — Practice operations, staff, CPD, registrations.
- **Platform Admin** — System governance, configuration, compliance oversight.

---

## The 8-Stage Project Lifecycle

Every project moves through 8 stages. The datum line maps directly to this progression.

```
● Brief → ● Appoint → ● Design → ● Comply → ● Procure → ● Build → ● Pay → ● Close-out
```

| Stage | What Happens |
|-------|--------------|
| **1. Brief** | Client describes what they want. AI-guided intake wizard. Diagnostic analysis. |
| **2. Appoint** | Find and appoint the right professionals. Proposals, contracts, escrow setup. |
| **3. Design** | Design team works. Drawings, specifications, coordination, freelancer packages. |
| **4. Comply** | Verify against regulations. SANS checks, municipal submission, compliance forms. |
| **5. Procure** | Get pricing and appoint contractors. BoQ extraction, RFQs, tender evaluation. |
| **6. Build** | Construction execution. Site diary, RFIs, variations, H&S, daily programme. |
| **7. Pay** | Financial governance. Milestone claims, payment certificates, escrow releases. |
| **8. Close-out** | Snagging, rectification, handover packs, warranties, project archive. |

Tools and features unlock based on which stage a project is in. Early stages surface design and compliance tools. Later stages surface construction and payment tools.

---

## The Three Product Pillars

The platform organizes user interaction into three modes:

### DISCOVER
Find the right people, information, and opportunities across the project ecosystem.

**Screens and tools:**
- Project Explorer — Browse, filter, and manage projects
- Professional Directory — Find verified architects, engineers, QS, specialists
- Contractor Directory — Find main contractors and subcontractors
- Supplier Catalog — Product and material catalog with specifications
- Market Insights — Industry data, benchmarks, and trends
- AI Assistant — Intelligent project guidance, compliance advice, draft suggestions
- Marketplace — Opportunities, invitations, job postings

### VERIFY
Validate information, reduce risk, and ensure compliance with confidence.

**Screens and tools:**
- AI Drawing Checker — Upload drawings, get compliance feedback
- SANS Code Compliance — Regulatory checks (walls, fire, ventilation, energy, access, water)
- Municipal Tracker — Submission status, readiness assessment, gap analysis
- Quality Control — QA workflows, evidence capture, sign-off gates
- Audit Trail — Complete verification history for every decision
- Document Check — Revision control, superseded warnings, transmittal logs
- Submission Readiness — Score-based readiness assessment for municipal submission

### COLLABORATE
Coordinate the full project team and keep everyone aligned in real time.

**Screens and tools:**
- Team Workspace — Project team matrix, responsibility assignments, invitations
- Issues / RFIs — Request for information workflow with tracking
- Approvals — Multi-party approval workflows with audit trail
- Communications — Project messaging, phase-aware chat, AI-suggested drafts
- Tasks & Actions — Role-filtered task queue, required actions, overdue items
- Contracts & Signing — Scope documents, proposals, work orders
- Payments & Escrow — Payment governance, milestone releases, certificate workflows
- Handover — Snagging, rectification, handover evidence packs

---

## Module Map (What Stitch Needs to Design)

These are the actual product modules. Each one becomes a screen or set of screens.

### Tier 1 — Core Shell (always present)

| Module | Purpose | Datum Position |
|--------|---------|----------------|
| **Command Centre** | Personal landing page. Priorities, active projects, next actions, agent recommendations. | Center — the user's position on the datum |
| **Inbox / Action Centre** | Required work queue. Approvals, retakes, overdue items. | Center |
| **Global Search** | Search projects, documents, people, companies. (⌘K) | Header |
| **Notifications** | Real-time alerts, status changes, mentions. | Header |
| **User Profile / Settings** | Professional profile, registrations, preferences. | Header dropdown |

### Tier 2 — Project Layer (project-scoped)

| Module | Purpose | Datum Position |
|--------|---------|----------------|
| **Project Passport** | Single source of truth per project. Health, risks, stage, team, decisions. | The datum line itself |
| **Project Dashboard** | Phase-aware overview. Stat cards, team, documents, financials, timeline. | On the datum |
| **Project Journey** | Lifecycle navigation. Stage progress bar, advance/retreat, next actions. | Along the datum |
| **Programme / Gantt** | Schedule management with role-specific views. | Below datum |

### Tier 3 — Defining Modules (above the datum line)

| Module | Purpose | Connected To |
|--------|---------|--------------|
| **Brief & Intake** | Guided client wizard, AI analysis, technical brief refinement. | Client card |
| **Professionals / Team** | Find, invite, appoint professionals. Design team matrix. | Professionals card |
| **Documents & Drawings** | Drawing register, revisions, transmittals, AI analysis. | Drawings card |
| **SpecForge** | Specification spine. Pictorial specs, product schedules, approvals, RFQs. | Drawings + Compliance |
| **Compliance Hub** | SANS checks, readiness gaps, submission checklists. Advisory only. | Compliance card |
| **Municipal Tracker** | Submission status, routing, evidence packs, readiness scores. | Municipal card |

### Tier 4 — Executing Modules (below the datum line)

| Module | Purpose | Connected To |
|--------|---------|--------------|
| **Tender / Procurement** | RFQs, BoQ/BoM, package scopes, quote comparison, award. | Contractors + Suppliers |
| **Construction OS** | Site diary, daily logs, RFIs, variations, site instructions. | Site card |
| **Health & Safety** | Safety file, permits, HIRA, inductions, incidents, fall protection. | Site card |
| **Staff, Wages & Plant** | Contractor resource management. | Contractors card |
| **Subcontractor Packages** | Package scope, progress, evidence, claims. | Contractors card |
| **Payments & Finance** | Invoices, payment certificates, escrow, milestone releases. | Payments card |
| **Snagging / Close-out** | Defect lists, rectification tracking, handover packs, warranties. | Handover card |

### Tier 5 — Support Modules

| Module | Purpose |
|--------|---------|
| **CPD & Learning** | Professional development. Courses, assessments, certificates, tracking. |
| **Knowledge Hub** | Templates, checklists, reference materials, compliance guides. |
| **Timesheets** | Billable/non-billable time capture with fee reconciliation. |
| **Pipeline** | Business development kanban with win/loss tracking. |
| **Templates** | Document template library with versioning. |
| **Registrations** | Professional registration renewal tracker. |
| **Marketplace** | Industry network — find people, resources, opportunities. |
| **Analytics & Reporting** | KPIs, project reports, alerts, data exports. |
| **Admin Console** | Platform governance, verification queue, system health. |

---

## How Modules Map to the Datum Line

This is the key connection between the product architecture and the Datum UI concept.

### Dashboard (Hero Datum View)

The datum line IS the project. Modules attach to it:

```
                    ┌─────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐  ┌───────────┐
                    │  Client │  │Professionals │  │ Drawings │  │ Compliance │  │ Municipal │
                    └────┬────┘  └──────┬───────┘  └────┬─────┘  └─────┬──────┘  └─────┬─────┘
                         │              │               │              │               │
═══🐦═══════════════════●══════════════●═══════════════●══════════════●═══════════════●═══════
         Architex    Harborview Civic Center
         Origin      "Single source of truth"
                     ● All systems aligned
                         │              │               │              │               │
                    ┌────┴────┐  ┌──────┴───────┐  ┌───┴────┐  ┌─────┴──────┐  ┌─────┴─────┐
                    │Contract-│  │  Suppliers   │  │  Site  │  │  Payments  │  │ Handover  │
                    │  ors    │  │              │  │        │  │            │  │           │
                    └─────────┘  └──────────────┘  └────────┘  └────────────┘  └───────────┘
```

### Working Module (Minimized Datum Strip)

When inside any module, the datum becomes a thin progress bar:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ○ Brief ─── ○ Appoint ─── ○ Design ─── ● Comply ─── ○ Procure ─── ○ Build    │
│                                          ▲ active                              │
└────────────────────────────────────────────────────────────────────────────────┘
```

The active stage is teal. Completed stages are solid dots. Future stages are hollow circles.

---

## Navigation Structure

### Left Sidebar (Primary Navigation)

The sidebar groups modules under the three pillars plus system:

```
HOME
  Home (active = teal highlight)
  Dashboard
  Activity

DISCOVER
  Projects
  Catalog
  Insights

VERIFY
  Documents
  Compliance
  Quality

COLLABORATE
  Teams
  Issues
  RFIs
  Approvals

─────────────
Settings
```

### What Happens When You Click Each Nav Item

| Nav Item | Loads In Content Area |
|----------|----------------------|
| Home | Dashboard with datum hero view |
| Dashboard | Project-specific dashboard (if project selected) |
| Activity | Activity feed / timeline |
| Projects | Project list / explorer |
| Catalog | Product/material catalog |
| Insights | Market data + AI insights |
| Documents | Drawing register + file manager |
| Compliance | SANS compliance hub |
| Quality | Quality control / QA workflows |
| Teams | Team matrix + directory |
| Issues | RFI + issue tracker |
| RFIs | Request for information list |
| Approvals | Approval queue |
| Settings | Profile, company, billing, permissions |

---

## Screen Inventory for Stitch

Build these screens in priority order:

### Priority 1 — Establish the Shell

1. **Main Dashboard (Datum Hero)** — The flagship screen. Datum line, floating cards, pillar modules.
2. **Working Module Shell** — Header + sidebar + minimized datum strip + content placeholder.

### Priority 2 — Core Workflows

3. **Project Dashboard** — Phase-aware project overview with stats, team, documents, timeline.
4. **Document / Drawing View** — File list, upload, revision history, compliance status.
5. **Compliance Check** — SANS regulation check interface with pass/fail/advisory results.

### Priority 3 — Collaboration

6. **Team Workspace** — Responsibility matrix, invite flows, role assignments.
7. **Issues / RFI List** — Table view with status pills, filters, detail panel.
8. **Approvals Queue** — Cards requiring sign-off with context and action buttons.

### Priority 4 — Execution

9. **Construction OS** — Site diary view with daily logs, weather, labour, equipment.
10. **Payments Dashboard** — Milestone tracker, certificate workflow, escrow status.
11. **Snagging List** — Defect cards with photos, status, assignment, rectification tracking.

### Priority 5 — Discovery

12. **Professional Directory** — Search/filter grid of verified professionals.
13. **Marketplace** — Opportunity cards, invitations, proposals.
14. **AI Assistant** — Chat interface with project context sidebar.

---

## Key Design Rules for Stitch

1. **White workspace, teal accents only.** The interface is predominantly white. Teal marks active states, the datum line, links, and small indicators. Never as background fill.

2. **The datum line is the hero.** On the dashboard it's large and expressive. In working views it's a quiet thin strip. It's always present somewhere.

3. **Glass is restrained.** Frosted-white cards for the datum module cards and overlays. Standard cards are opaque white with thin borders. Don't overdo transparency.

4. **Cards are clean and spacious.** White fill, 20px radius, thin pale border, gentle shadow, generous padding. Content breathes.

5. **Status is calm.** Small pills with soft colors. "Aligned", "Verified", "In Review", "Pending", "At Risk". No screaming alerts.

6. **Navigation is grouped by purpose.** Discover / Verify / Collaborate. Not a flat list of 50 tools.

7. **Every screen connects to the datum.** Either via the hero view (dashboard) or via the minimized strip (working modules). The user always knows where they are in the project truth.

8. **Precision over decoration.** The aesthetic is architectural — clean lines, precise spacing, purposeful marks. Not playful, not corporate-generic. Think technical drawing meets premium SaaS.

9. **Icons are simple and consistent.** Line-weight icons (Lucide style), 18–20px, always in a consistent container or aligned to text.

10. **The origami bird is the origin marker.** It pins the datum to a reference point. Use it at the line origin on the dashboard, and subtly in loading/empty states elsewhere.
