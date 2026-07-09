# Architex Built Environment OS — Comprehensive Gap Analysis
## July 2026

---

## 1. STRATEGIC CONTEXT

Architex is the operating system for the built environment — a single source of truth across the entire workflow: Brief → Appoint → Design → Comply → Procure → Build → Pay → Close-out → Operate.

The platform serves 18 user roles across 8 workflow modules, with AI-guided workflows, a modular toolbox architecture, and deep South African regulatory integration. Everything routes through Project Passport and SpecForge as the central spine.

Beyond the project lifecycle, there is a **professional value layer** — tools that serve the industry regardless of active project status (CPD, Remote Desktop, Practice Management). These drive daily engagement and user acquisition.

---

## 2. WHAT'S WORKING WELL

| Area | Status |
|------|--------|
| 8-stage project lifecycle engine | ✅ Fully modelled with phase definitions, blockers, and next-best actions |
| Project Passport (single source of truth) | ✅ Implemented with risk engine, inbox events, agent recommendations |
| SpecForge (specification spine) | ✅ Full workspace with own route, product schedules, approvals |
| SANS compliance toolbox | ✅ 10+ calculators (fenestration, R-value, fire, walls, energy, stormwater) |
| Municipal submission readiness | ✅ Multi-municipality profiling, readiness scoring, drawing checklists |
| Finance/payment governance | ✅ 14 services, escrow state machine, FICA, milestone releases |
| Site execution (Pack 9) | ✅ Daily logs, RFIs, NCRs, snags, site instructions, workforce/plant |
| Document control & drawing intelligence | ✅ Revision control, AI analysis, readiness checks |
| Procurement/tender workflows | ✅ RFQ builder, bid evaluation, package scoping, BoM/BoQ |
| Agent orchestration | ✅ 20+ file subsystem, multi-agent compliance, approval gates |
| CPD platform | ✅ 8 services, assessment runner, certificates, professional body mapping |
| Closeout & handover | ✅ 6 services, practical completion, defects liability, handover packs |
| P1 extensions (Insurance, Dispute, NHBRC, Survey) | ✅ Fully built feature modules with services, UI, tests |
| Contract administration | ✅ Claims, variations, notices, EoT services built |
| Analytics & reporting (Pack 15) | ✅ KPIs, alert engine, export service |
| Demo mode infrastructure | ✅ 12 projects, 19 users, per-user sandbox |

---

## 3. CRITICAL GAPS

### 3.1 Health & Safety Module (Currently: generic checklist only)

**What exists:**
- `hsCompliance.ts` — a pass/fail checklist tool running through the generic calculator engine
- `health_safety` role in site execution local types (not platform-level)
- `contractorSupplierComplianceService.ts` — H&S File tracked as mandatory contractor document
- H&S Plan listed as returnable document in tender packages

**What's critically missing:**

| Gap | Regulatory basis |
|-----|-----------------|
| Safety File Builder/Manager | Construction Regulations 2014, Reg 7 |
| Construction H&S Plan approval workflow | Reg 7(1)(a) — must be approved BEFORE work starts |
| Client H&S Specification template/workflow | Reg 5(1) — client obligation |
| Designer Risk Assessment capture | Reg 6(1) — designers must inform client of design risks |
| Hazard Identification & Risk Assessment (HIRA) | OHS Act fundamental requirement |
| Toolbox Talk / Safety Induction tracker | Daily site requirement |
| Incident/Accident Reporting | OHS Act Section 24 |
| Fall Protection Plan | Reg 10 — mandatory for work above 2m |
| Permit-to-Work system | Reg 13 (excavation), Reg 14 (scaffolding), hot work, confined space |

**Regulatory urgency:** The National Built Environment and Construction Safety Framework was launched 3 July 2026 by Minister Macpherson, introducing stricter compliance requirements, CBE Safety Regulations, and SANS 17024 certification alignment.

---

### 3.2 Tool Discoverability

Multiple tools have complete service logic and UI components but are **not accessible as standalone routes**. They're buried inside parent pages or have no front door at all.

| Tool | Has service | Has UI | Has own route | Problem |
|------|:-----------:|:------:|:-------------:|---------|
| SA Council Drawing Compliance Navigator | ✅ | ✅ | ❌ | Buried inside ComplianceToolboxHub as a sub-panel |
| H&S Compliance Checklist | ✅ | Generic runner | ❌ | Runs through StandaloneToolRunner, no dedicated workspace |
| Insurance Register (P1) | ✅ | ✅ | ❌ | Feature module built, never wired into App.tsx |
| NHBRC Enrolment (P1) | ✅ | ✅ | ❌ | Feature module built, never wired into App.tsx |
| Survey & Geomatics (P1) | ✅ | ✅ | ❌ | Feature module built, never wired into App.tsx |
| Dispute Resolution (P1) | ✅ | ✅ | Partial | Shares generic `disputes` shell |
| Contract Administration | ✅ | Partial | ❌ | No dedicated entry point |
| NCR Manager | ✅ | ✅ | ❌ | Only accessible inside Site Execution |
| Site Instruction Manager | ✅ | ✅ | ❌ | Only accessible inside Site Execution |
| Contractor/Supplier Compliance | ✅ | ❌ | ❌ | Works behind the scenes as a gate only |

---

### 3.3 Role Architecture

**Current problem:** The `admin` role is used as a "god mode" shortcut — it appears in 30+ route definitions alongside professional roles, granting access to virtually every page. This conflates platform system administration with project-level elevation.

| Issue | Impact |
|-------|--------|
| `admin` in every route's roles array | An architect leading a project doesn't need a system `admin` role — they need elevated permissions on their specific project |
| Both `admin` and `platform_admin` exist | Redundant and confusing |
| No project-level permission model | There's no way for a professional to have elevated access on one project without having it globally |
| `firm_admin` correctly scoped | This one is fine — manages the practice, not the OS |

**Required restructuring:**
- `admin` → becomes exclusively Architex platform operator (user management, finance, system health, troubleshooting)
- Professional roles get project-level permissions (lead_consultant, project_administrator) that grant elevated access per project
- Remove `admin` from tool/page access lists — replace with actual professional roles that need each tool

---

### 3.4 Remote Desktop / Resource Sharing

**Current state:** A booking/billing/governance layer exists (`ResourceSharingPage.tsx`, `resourceBookingService.ts`). It handles the commercial workflow (list → book → confirm → use → log → bill) with conflict checks, audit trails, and human approval gates.

**What's missing for a proper secure platform:**

| Missing | What's needed |
|---------|---------------|
| No actual remote session technology | Need integration with RDP gateway, WebRTC, or commercial API (Parsec, Apache Guacamole) |
| No session sandboxing | Must limit access to specific software windows, not full desktop |
| No credential lifecycle | Temporary access tokens valid only for the booking window |
| No auto-disconnect at session end | Must enforce booking boundaries at connection level |
| No activity auditing | Session recording or activity logs for accountability |
| No file isolation | Restrictions on what the renter can access on host machine |
| Buried under "Governance" group | Should be its own first-class module, highly visible |

---

### 3.5 Intelligent Feedback Loop

The platform has **no structured mechanism** for users to communicate back to platform operators. No way to report issues, request features, or provide usability feedback from within the app.

**What's needed:**

| Component | Purpose |
|-----------|---------|
| Feedback Widget | Persistent button on every page. Context-aware (knows current page/tool). Categories: bug, feature request, usability, praise |
| Feedback Intelligence Layer | AI deduplication, categorisation, priority scoring, sentiment analysis, pattern clustering |
| Feedback → Roadmap Pipeline | Admin dashboard with trending requests, severity scoring, AI-generated feature brief drafts |
| Feedback Loop Closure | Users notified when their issue is addressed. Status: received → reviewing → planned → shipped |
| Implicit Friction Detection | Identify struggling users (repeated errors, abandoned workflows) and capture implicit feedback |

---

### 3.6 AI Integration Layer

The agent infrastructure exists (20+ orchestration files, multi-agent compliance, approval gates). What's missing is the **user-facing AI surface**.

| Gap | Opportunity |
|-----|-------------|
| No AI Copilot workspace | Role-aware assistant that knows your projects, can draft RFIs, summarise status, flag risks, write proposal narratives |
| No AI Output Provenance | When AI content enters the system, it's not tagged. Matters for professional liability under SANS 17024 |
| No Bring-Your-Own-AI bridge | Professionals use external AI tools — no structured way to import those outputs into Architex |

---

## 4. SECONDARY GAPS (Important but not critical)

| # | Gap | Current State | Priority |
|---|-----|---------------|----------|
| 1 | QA/QC Inspection Test Plans | Not built (distinct from snagging — hold points, material testing, ITPs) | P1 |
| 2 | Town Planning Application Tracker | Not built (rezoning, consent use, subdivision lifecycle) | P1 |
| 3 | Environmental Authorisation tracking | Trigger flag exists, no process workflow | P2 |
| 4 | Commissioning workflow | Not built (MEP systems testing before occupation) | P2 |
| 5 | Post-occupancy / Facilities Management | Phase defined in types, zero services or UI | P2 |
| 6 | Construction Project Manager (CPM) role | Referenced in code but not a distinct platform role | P1 |
| 7 | Municipal Building Inspector (read-only) | No external reviewer portal | P2 |

---

## 5. PROFESSIONAL VALUE-ADD TOOLS (Retention features, adjacent to project spine)

| Tool | Current State | Value Proposition |
|------|---------------|-------------------|
| **CPD & Learning** | ✅ Built and working | Standalone product lane. Daily engagement between projects. |
| **Remote Desktop / Resource Sharing** | Booking layer only, no secure connection | Unique in SA built environment. Expensive software access for freelancers. Major differentiator. |
| **Practice Resource & Profitability Planner** | Concept in registry only | Firm management tool — capacity, timesheets, WIP, profitability. Daily use. Competes with Fresh Projects/Monograph. |
| **AI Copilot** | Agent infrastructure exists, no user workspace | Every professional using AI externally. In-platform AI with project context is the stickiest feature possible. |
| **Supplier Catalogue** | Registry tile, minimal implementation | Suppliers maintaining product data connected to SpecForge. Industry directory value. |
| **Professional Verification Hub** | Verification services exist | Promote to visible searchable directory. Trust layer for every transaction. |
| **Contract Template Library** | Not built | AI-assisted clause comparison, plain-language explanations. Every project needs contracts. |
| **Fee Benchmarking** | Not built (data exists in fee calculators) | Anonymous aggregated market rates. Powerful industry insight. Needs data maturity. |

---

## 6. PRIORITY MATRIX

### P0 — Critical (Blocks core workflow or regulatory requirement)

| # | Work Stream | Type | Effort |
|---|-------------|------|--------|
| 1 | H&S Module Elevation | New module build | Large |
| 2 | Tool Discoverability Wiring | Routing/navigation task | Small-Medium |
| 3 | Role Architecture Refinement | Refactoring | Medium |
| 4 | Permit-to-Work System | New feature within H&S | Medium |

### P1 — Important (Significant value, clear differentiation)

| # | Work Stream | Type | Effort |
|---|-------------|------|--------|
| 5 | Remote Desktop Secure Platform | Module rebuild + integration | Large |
| 6 | Intelligent Feedback Loop | New module build | Medium |
| 7 | AI Copilot Workspace | New module build | Medium |
| 8 | QA/QC Inspection Test Plans | New feature within Site Execution | Medium |
| 9 | Town Planning Application Tracker | New module build | Medium |

### P2 — Valuable (Future revenue, retention)

| # | Work Stream | Type | Effort |
|---|-------------|------|--------|
| 10 | Practice Resource & Profitability Planner | New product lane | Large |
| 11 | Contract Template Library + AI | New module | Medium |
| 12 | Professional Verification Hub (promote) | Promotion of existing | Small |
| 13 | Project Portfolio Dashboard | Composition of existing | Small |
| 14 | Supplier Catalogue (SpecForge connection) | New module | Medium |
| 15 | AI Output Provenance | Cross-cutting concern | Small |

### Park (Not needed now)

- Full EIA workflow
- Green Building/EDGE certification
- Post-occupancy / Facilities Management
- Fee Benchmarking (needs data maturity)

---

## 7. WORK STREAM DEFINITIONS (For separate development sessions)

### WS-1: H&S Module Elevation
**Scope:** Transform the generic H&S checklist into a proper Construction Regulations 2014 workflow module. Safety File builder, H&S Plan approval, Client H&S Spec, HIRA, Permit-to-Work, Incident Reporting, Toolbox Talks, Fall Protection Plans. Promote `health_safety` to platform-level role with dedicated dashboard.

### WS-2: Tool Discoverability & Routing
**Scope:** Wire all buried tools into App.tsx as discoverable routes. SA Council Drawing Compliance Navigator, P1 modules (Insurance, NHBRC, Survey, Dispute), Contract Admin, NCR Manager, Site Instruction Manager. Register in standalone tool registry where appropriate. Update navigation config.

### WS-3: Role Architecture Refinement
**Scope:** Clarify `admin` as platform operator only. Remove `admin` from professional tool access lists. Introduce project-level permission model (lead_consultant, project_administrator). Clean up `admin` vs `platform_admin` redundancy. Audit all route definitions.

### WS-4: Remote Desktop Secure Platform
**Scope:** Separate from Governance into own first-class module. Integrate secure session technology (Apache Guacamole or commercial API). Application sandboxing, credential lifecycle, time-bounded sessions, auto-disconnect, activity auditing, file isolation. Own route, own navigation group, high visibility.

### WS-5: Intelligent Feedback Loop
**Scope:** Feedback widget (context-aware, persistent). AI intelligence layer (deduplication, categorisation, clustering, priority scoring). Admin dashboard (trending requests, pattern detection, AI feature brief drafts). Loop closure (user notifications when issues addressed). Implicit friction detection.

### WS-6: AI Copilot Workspace
**Scope:** User-facing AI assistant panel in Command Centre. Role-aware, project-context-aware. Can draft RFIs, summarise status, flag compliance gaps, generate proposal narratives, explain contract clauses. AI Output Provenance tagging. Bring-Your-Own-AI import endpoints.

### WS-7: QA/QC & Inspection Test Plans
**Scope:** Inspection Test Plans (ITPs), hold points, material testing schedules (SANS 3001), lab results tracking, non-conformance linkage. Distinct from snagging — this is pre-completion quality assurance during construction.

### WS-8: Town Planning Application Tracker
**Scope:** Application lifecycle from pre-consultation through Record of Decision. Rezoning, consent use, subdivision, site development plan applications. Objection/comment tracking, hearing scheduling, appeal management, condition fulfilment. Links to Survey module post-approval.

---

## 8. KEY PRINCIPLE

The platform already has ~190 service files and 54+ tool tiles. The risk is not missing features — it's features that exist but aren't accessible, discoverable, or properly integrated. Priority order:

1. **Surface what's built** — the routing/wiring task
2. **Deepen what matters** — H&S, Remote Desktop, AI Copilot, Feedback Loop
3. **Keep add-ons tight** — CPD, Practice Manager, Contract Library are clean modules that attach to the spine without cluttering the core workflow

The OS stays focused on the 8-stage project lifecycle. Everything else is a professional tool in the same ecosystem — same platform, different entry point, shared account.
