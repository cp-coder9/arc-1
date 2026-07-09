# Architex OS — Master Layout Scaffold Brief

> Reference document for building the design scaffold in Google Stitch.  
> Describes the platform shell, navigation, modules, and visual system.

---

## 1. Platform Identity

**Architex OS** is a role-based, action-driven Built Environment operating system that coordinates the full lifecycle of construction and architectural projects in South Africa.

- 17 user roles (client, architect, engineer, contractor, quantity surveyor, etc.)
- 8-stage project lifecycle: Brief → Appoint → Design → Comply → Procure → Build → Pay → Close-out
- Single-page application — all modules render inside one persistent shell

---

## 2. Global Shell Structure

The entire authenticated experience lives inside a fixed shell. Modules load into the content area — they never render their own chrome.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        STICKY HEADER BAR (z-40)                            │
│  [☰ mobile] Breadcrumb: Architex > Section > Page Title    [AI] [🔔] [👤] │
├──────────┬─────────────────────────────────────────────────────────────────┤
│          │                                                                 │
│  SIDE    │              SCROLLABLE CONTENT AREA                            │
│  NAV     │              (max-width: 1500px, centered)                      │
│          │                                                                 │
│  288px   │   ┌─────────────────────────────────────────────────────────┐   │
│  expanded│   │  Module content renders here                            │   │
│          │   │  (lazy-loaded React components)                         │   │
│  84px    │   │                                                         │   │
│  collapsed   │                                                         │   │
│          │   └─────────────────────────────────────────────────────────┘   │
│          │                                                                 │
└──────────┴─────────────────────────────────────────────────────────────────┘
```

### 2.1 Header Bar

- **Position**: Sticky top, z-40
- **Height**: min-h-16 (mobile), min-h-20 (desktop)
- **Background**: Glassmorphism — `rgba(245, 250, 247, 0.82)` with `backdrop-filter: blur(18px)`
- **Border**: Bottom border `border-border/70`
- **Left section**:
  - Mobile hamburger menu (md:hidden)
  - Breadcrumb trail: `Architex` (teal, bold) `>` Section Label `>` **Page Title** (bold, foreground)
  - Page title: `text-xl sm:text-2xl font-black`
  - Role badge: `rounded-full` pill with role-specific accent colour
- **Right section**:
  - "Ask AI" button (purple accent, hidden on AI page)
  - Notification bell
  - User avatar circle (40×40px, border, bg-card)

### 2.2 Sidebar Navigation

- **Position**: Sticky left, full viewport height (`h-dvh`)
- **Width**: 288px expanded / 84px collapsed (user-togglable, persisted in localStorage)
- **Mobile**: Slide-over from left, overlay with close button
- **Background**: Same glass treatment as header
- **Border**: Right border `border-border/70`

**Sidebar contents (top to bottom):**

1. **Logo block** — Architex icon (56–64px) + "Architex OS" wordmark + "Project Coordination" subtitle
2. **Collapse toggle** — `PanelLeftClose` / `PanelLeftOpen` icon button (desktop only)
3. **Role card** — Rounded card with accent top-border showing current role name, description, and status dot
4. **Navigation items** — Vertical list of module entries (see Section 3)
5. **Keyboard shortcuts card** — Small helper card (hidden when collapsed)
6. **Logout button** — Bottom, separated by border-top

**NavItem component shape:**
- Full-width button with 8×8 rounded icon container + label + active dot
- Active state: light blue background (`#dff1fa`), teal text, subtle shadow
- Inactive: muted foreground, hover → muted bg + teal text
- Icons: 18px Lucide icons inside a white 32×32px rounded container with border

---

## 3. Primary Navigation Modules

These are the top-level sidebar entries. Each module contains sub-sections accessed via internal tabs or sub-navigation once inside the content area.

| # | Module | Icon | Description |
|---|--------|------|-------------|
| 1 | **Command Centre** | `LayoutDashboard` | Personal daily cockpit — priorities, active projects, CPD, messages, agent recommendations |
| 2 | **Inbox / Action Centre** | `ClipboardCheck` | Required actions, approvals, retakes, overdue items |
| 3 | **Projects** | `FileText` | Phase-aware project workspace — dashboard, team, documents, RFIs, instructions, snags, payments, passport, audit trail |
| 4 | **Toolboxes** | `Files` | Role-specific professional tools — proposal/appointment, design/compliance, costing/procurement, SpecForge, construction admin, H&S, closeout, full library |
| 5 | **CPD & Learning** | `BookOpen` | Dashboard, courses, assessments, certificates, submissions, partner admin |
| 6 | **Documents / Knowledge Hub** | `Database` | My documents, project documents, templates, compliance references, version history |
| 7 | **Marketplace / Resource Centre** | `Search` | Professionals, contractors, suppliers, freelancers, resource sharing, opportunities |
| 8 | **Finance & Commercial** | `CreditCard` | Quotes, invoices, escrow, payment certificates, ledger |
| 9 | **Analytics & Reporting** | *(not in sidebar icon map yet)* | KPI overview, project reports, alerts, exports |
| 10 | **Messages** | `Mail` | Direct messages, project groups, phase channels, CPD threads, agent threads, linked tasks |
| 11 | **Settings** | `Settings2` | Profile, professional registrations, company, billing, roles/permissions, platform admin |
| 12 | **My Account** | *(user settings)* | Profile, professional registrations (non-admin roles) |

**Role filtering**: Each module has a `roles[]` array. The sidebar only shows modules accessible to the logged-in user's role.

---

## 4. Module Content Pattern

Once a user clicks a sidebar module, the content area loads that module's page. All workspace-style modules follow a consistent internal layout:

```
┌──────────────────────────────────────────────────────────────────┐
│  HEADER CARD                                                      │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Tool/Module name (uppercase label, text-primary)          │  │
│  │  Page Title (text-2xl font-black)                          │  │
│  │  Context subtitle (metadata, revision, stage)              │  │
│  │                                          [Role Badge]      │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  PROJECT TOGGLES (when multi-project)                              │
│  [Project A ●] [Project B ●] [All Projects] [Standalone]          │
│                                                                    │
│  TAB NAVIGATION                                                    │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [Overview] [Tab 2] [Tab 3] [Tab 4] ...                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ACTIVE TAB CONTENT                                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Stat cards, tables, forms, visualizations                 │  │
│  │  (module-specific content)                                 │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 5. Visual Design System — WHITE-DOMINANT with Teal Accents

> **CRITICAL**: The workspace is predominantly white/light with teal used sparingly as an accent. Teal is NOT the background — it's the highlight colour for active states, badges, borders, and interactive elements.

### 5.1 Colour Philosophy

| Role | Colour | Usage |
|------|--------|-------|
| **Background** | `#f5faf7` (near-white with the faintest mint tint) | Page background, workspace canvas |
| **Cards / Surfaces** | `#ffffff` (pure white) | All cards, panels, popovers, modals |
| **Foreground / Text** | `#0d1e25` (near-black) | Primary text, headings |
| **Muted text** | `#5e7478` | Subtitles, labels, secondary text |
| **Muted surface** | `#edf7f3` (very pale mint) | Hover states, inactive backgrounds, badges |
| **Primary accent (teal)** | `#005b4e` | Active nav items, links, badges, top-borders, accent text |
| **Primary light** | `#007666` | Focus rings, hover accents |
| **Secondary (mint)** | `#aeefe3` | Tags, progress indicators, light highlights |
| **Accent (purple)** | `#7046a8` | AI/agent features, special callouts |
| **Destructive (red)** | `#d95747` | Errors, destructive actions |
| **Border** | `#d0e3dc` (pale teal-grey) | Card borders, dividers, input borders |

### 5.2 Where Teal Appears (Accent Only)

- ✅ Sidebar active item text and icon
- ✅ Header breadcrumb "Architex" word
- ✅ Role badge backgrounds (role-specific accent, not full teal)
- ✅ Card top-border accent lines (4–5px)
- ✅ Active tab underlines
- ✅ Link text colour
- ✅ Status dots and indicators
- ✅ Button primary variant (teal bg, white text — used sparingly)
- ✅ Focus ring outlines
- ❌ NOT as page background
- ❌ NOT as sidebar background
- ❌ NOT as header background
- ❌ NOT as card fill colour

### 5.3 Glass Treatment

Glass surfaces (header, sidebar) use a mostly-white translucent backdrop:

```css
/* Header / Sidebar glass */
background: rgba(245, 250, 247, 0.82);
backdrop-filter: blur(18px);
```

```css
/* Card glass (elevated panels) */
background: color-mix(in srgb, #ffffff 88%, transparent);
backdrop-filter: blur(16px);
border: 1px solid color-mix(in srgb, #d0e3dc 50%, transparent);
box-shadow: 0 8px 32px rgba(20, 71, 63, 0.08);
```

### 5.4 Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Headings | Space Grotesk | 800–900 (black) | text-2xl to text-4xl |
| Body / UI | Inter | 400–700 | text-sm to text-base |
| Mono / IDs | JetBrains Mono | 400 | text-xs |
| Labels | Inter | 600–700, uppercase | text-xs, tracking-wider |

### 5.5 Spacing & Radius

- Section spacing: `space-y-6` (24px between major blocks)
- Card padding: `p-4` to `p-6`
- Grid gaps: `gap-4` (16px)
- Border radius: `1.25rem` (20px) — cards, panels, buttons
- Stat cards: `rounded-[1.25rem]`
- Buttons: `rounded-full` (pill shape)

### 5.6 Elevation (Shadows)

All shadows use teal-tinted rgba for cohesion with the palette:

```css
/* Standard card */    box-shadow: 0 16px 44px rgba(20, 71, 63, 0.10);
/* Stat card */        box-shadow: 0 14px 34px rgba(20, 71, 63, 0.10);
/* Record card */      box-shadow: 0 12px 30px rgba(20, 71, 63, 0.08);
/* Hover elevation */  box-shadow: 0 12px 40px rgba(20, 71, 63, 0.15);
```

---

## 6. Canonical Pages (Content Modules)

These are the actual pages that load in the content area. Grouped by audience:

### 6.1 Core Workflow (All Roles)

| Page ID | Label | Purpose |
|---------|-------|---------|
| `command` | Command Centre | Role-aware landing page — priorities, project state, decisions |
| `profile` | Profile Editor | Canonical profile for verification, contracts, invoicing |
| `toolbox` | Project Toolbox | Guided project tools and checklists |
| `toolset-review` | Toolset Review | Calculator toolbox, coverage dashboard |
| `journey` | Project Journey | Lifecycle navigation, stage progress, next actions |
| `tasks` | Tasks & Approvals | Role-filtered task and approval command surface |
| `messages` | Project Messenger | Phase-aware project chat, AI draft suggestions |
| `programme` | Programme / Gantt | Shared programme with role-specific views |
| `disputes` | Dispute Resolution | Dispute centre linked to project/job records |
| `payments` | Payments & Governance | Payment governance shell |
| `invoicing` | Invoicing | Role-gated invoice workspace |
| `contracts` | Contracts & Signing | Scopes, proposals, packages, work orders |
| `escrow` | Escrow Service | Milestone and package payment allocations |
| `ai` | AI Co-Pilot | Contextual AI workflow assistant |

### 6.2 Client Tools

| Page ID | Label | Purpose |
|---------|-------|---------|
| `client-intake` | Guided Brief Wizard | Client-friendly project intake |
| `client-proposals` | BEP Proposals | Proposal comparison for appointment decisions |
| `directory-search` | Directory Search | Verified professional directory |
| `municipal-tracker` | Municipal Status | Municipal submission status tracker |
| `submission-readiness` | Submission Readiness | Complexity, routing, evidence, readiness score |
| `client-progress` | Progress Reports | Plain-language progress for client decisions |

### 6.3 BEP / Design Team Tools

| Page ID | Label | Purpose |
|---------|-------|---------|
| `design` | Design & Compliance | Deliverables, registers, responsibility matrix |
| `drawing-register` | Drawing Register | Formal drawing numbers, revisions, transmittals |
| `drawing-checker` | AI Drawing Checker | Upload-and-check compliance |
| `sans-forms` | SANS / Compliance Forms | Autofill from project/profile data |
| `compliance` | SANS Codified Compliance | Clause search, boundary wall checker, AI bridge |
| `technical-brief` | Technical Brief Editor | Post-intake BEP brief refinement |
| `bep-marketplace` | Client Marketplace | Live opportunity marketplace |
| `bep-team` | Design Team Matrix | Discipline responsibility + consultant invitations |
| `bep-freelancers` | Freelancer Jobs | BEP-to-freelancer work packages |
| `specforge` | SpecForge Specifications | Pictorial specs, product schedules, approvals, RFQs |

### 6.4 Construction Tools

| Page ID | Label | Purpose |
|---------|-------|---------|
| `health-safety` | Health & Safety | Safety file, permits, HIRA, incidents, inductions |
| `snagging` | Snagging / Close-Out | Close-out backed by package evidence records |
| `construction` | Construction OS | Site logs, RFIs, programme, delivery controls |
| `contractor-staff` | Staff, Wages & Plant | Contractor resource management |
| `procurement` | BoQ / BoM Procurement | Contractor/package/supplier procurement |
| `packages` | Subcontractor Packages | Package scope and progress |

### 6.5 Freelancer Tools

| Page ID | Label | Purpose |
|---------|-------|---------|
| `freelancer-work` | Assigned Work | Current assigned deliverables |
| `freelancer-submissions` | Submissions & Feedback | Submission/revision/feedback workflow |

### 6.6 Governance & System

| Page ID | Label | Purpose |
|---------|-------|---------|
| `knowledge` | Knowledge / CPD | Knowledge and CPD content |
| `resource-sharing` | Remote Desktop / Resources | Workstation booking, resource sharing |
| `resource-centre` | Resource Centre / Checklists | Role-based resources and checklists |
| `cpd-assessment` | CPD Assessment | Assessment workflow with certificates |
| `admin-console` | Admin Console | Whole-system governance |
| `timesheets` | Timesheets | Billable/non-billable time capture |
| `pipeline` | Pipeline | Visual kanban with win/loss tracking |
| `templates` | Templates | Document template library |
| `registrations` | Registrations | Professional registration renewal tracker |
| `marketplace` | Marketplace | Industry network shell |

---

## 7. Responsive Behaviour

| Breakpoint | Sidebar | Header | Content |
|------------|---------|--------|---------|
| < 768px (mobile) | Hidden slide-over | Hamburger icon shown | Full-width, 12px padding |
| ≥ 768px (tablet) | Collapsed 84px or expanded 288px | Full breadcrumb + actions | Centered, 24px padding |
| ≥ 1024px (desktop) | User preference (collapsed/expanded) | Full layout | max-1500px centered, 28px padding |

---

## 8. Global Actions (Always Present in Header)

1. **Ask AI** — Purple outline button, opens the AI Co-Pilot page (hidden when already on AI page)
2. **Notification Bell** — Real-time notification indicator with count badge
3. **User Avatar** — Circular avatar/icon linking to profile

---

## 9. Interaction Patterns

- **Page transitions**: Animated with `framer-motion` — opacity fade + slight Y translate (0.25s ease-out)
- **Hover cards**: Subtle `-translate-y-0.5` lift + border colour shift to `primary/30`
- **Active nav items**: Background `#dff1fa` (pale blue), green dot indicator, teal text
- **Keyboard shortcuts**: Alt+1–9 for quick page access, Alt+K (Command), Alt+A (AI), Alt+P (Profile)
- **Collapse/expand sidebar**: Animated width transition (300ms ease-in-out), labels hidden at 84px

---

## 10. Key Screens for Initial Scaffold

For Stitch, build these screens first to establish the shell and demonstrate content variation:

1. **Global Shell (Base Layout)** — Header + Sidebar + empty content area
2. **Command Centre** — Landing dashboard with stat cards, project list, action cards
3. **Project Workspace** — Example project view with tab navigation (Dashboard, Team, Documents, Payments)
4. **SpecForge Workspace** — Full workspace pattern (header card, project toggles, tabs, table content)
5. **Toolbox Library** — Grid of tool tiles with search/filter

---

## 11. What NOT To Do

- ❌ Do not use teal as a background colour — it's an accent
- ❌ Do not render dark/deep teal backgrounds (that's the Dark_Theme override, not the workspace default)
- ❌ Do not create separate app shells per module — everything lives inside one shell
- ❌ Do not use Material UI, Ant Design, or other component libraries — shadcn/ui only
- ❌ Do not create standalone pages with their own navigation — all modules render in the content area
- ❌ Do not use bright/saturated colours for large surfaces — keep surfaces white, use colour for small accents

---

## 12. Summary for Stitch

**Build the scaffold as:**
- A white/near-white workspace (`#f5faf7` bg, `#ffffff` cards)
- Glass-effect sidebar and header (translucent white, blurred)
- Teal (`#005b4e`) used only for: active states, links, top-borders, badges, focus rings
- Clean, uncluttered, generous whitespace
- Rounded corners (`1.25rem`), pill-shaped buttons, soft teal-tinted shadows
- Inter body font, Space Grotesk headings, JetBrains Mono for codes/IDs
- Content area capped at 1500px, `space-y-6` vertical rhythm
