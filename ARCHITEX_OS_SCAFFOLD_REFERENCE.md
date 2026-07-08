# Architex OS — Master Layout Scaffold Reference

> This document defines the structural shell, navigation architecture, module hierarchy, and design system for Architex OS. Use it as the canonical reference when building the design scaffold in Google Stitch.

---

## 1. Platform Identity

**Architex OS** is a Built Environment Operating System — a role-based, action-driven platform coordinating the complete lifecycle of construction and architectural projects in South Africa. It serves 17 user roles across an 8-stage project lifecycle (Brief → Appoint → Design → Comply → Procure → Build → Pay → Close-out).

The platform is NOT a collection of standalone tools. It is a unified OS shell with 12 primary navigation modules, each containing sub-sections and tools that load into a shared content area.

---

## 2. Master Layout Shell

The authenticated experience consists of three persistent structural layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        FULL VIEWPORT (h-dvh)                            │
├──────────────┬──────────────────────────────────────────────────────────┤
│              │  TOP HEADER BAR (sticky, glassmorphism)                  │
│              │  ┌────────────────────────────────────────────────────┐  │
│   LEFT       │  │ [☰ mobile] Breadcrumb: Architex > Section > Page  │  │
│   SIDEBAR    │  │ Page Title + Role Badge          [AI] [🔔] [Avatar]│  │
│   (glass)    │  └────────────────────────────────────────────────────┘  │
│              ├──────────────────────────────────────────────────────────┤
│   288px      │                                                          │
│   expanded   │  SCROLLABLE CONTENT AREA                                 │
│              │  (max-width: 1500px, centered, p-6 lg:p-7)              │
│   84px       │                                                          │
│   collapsed  │  ┌────────────────────────────────────────────────────┐  │
│              │  │  Module workspace loads here via lazy import       │  │
│   Sticky,    │  │  (React Suspense with loading fallback)            │  │
│   full       │  └────────────────────────────────────────────────────┘  │
│   height     │                                                          │
├──────────────┴──────────────────────────────────────────────────────────┤
│  TOASTER (bottom-right notifications via sonner)                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Overall Container

- `flex h-dvh min-h-0 flex-col md:flex-row`
- Background: `bg-background` with subtle radial gradient overlay and grid canvas texture
- Grid canvas: fine 44px lines at 5.5% opacity + radial color accents (mint top-left, purple top-right)

### 2.2 Left Sidebar

| Property | Value |
|----------|-------|
| Width (expanded) | 288px (`md:w-[288px]`) |
| Width (collapsed) | 84px (`md:w-[84px]`) |
| Mobile width | `min(86vw, 288px)` — off-canvas drawer |
| Position | `md:sticky md:top-0 md:h-dvh` |
| Surface | `beos-glass` (glassmorphism: rgba bg + backdrop-blur) |
| Border | Right border `border-r border-border/70` |
| Collapse toggle | Persisted in localStorage (`architex.sidebarCollapsed`) |
| Transition | `transition-all duration-300 ease-in-out` |

**Sidebar contents (top to bottom):**

1. **Logo + Brand** — Architex OS icon (56–64px) + "Architex OS" text + "Project Coordination" subtitle
2. **Collapse/Expand button** — `PanelLeftClose` / `PanelLeftOpen` icons (hidden on mobile)
3. **Role Card** — Rounded card with role-accent top border, role name, role description, status dot
4. **Navigation Items** — Primary nav list (see Section 3)
5. **Keyboard Shortcuts Panel** — Alt+1–9 shortcut hints (hidden when collapsed)
6. **Logout Button** — Bottom-pinned, full-width ghost button

### 2.3 Top Header Bar

| Property | Value |
|----------|-------|
| Height | `min-h-16 sm:min-h-20` (64–80px) |
| Position | `sticky top-0 z-40` |
| Surface | `beos-glass` (glassmorphism) |
| Border | Bottom border `border-b border-border/70` |

**Header contents (left to right):**

1. **Mobile menu button** — Hamburger icon (md:hidden)
2. **Breadcrumb trail** — `Architex > [Section Label] > [Page Name]` in `text-xs text-muted-foreground`
3. **Page title** — `text-xl sm:text-2xl font-black` + Role Badge pill
4. **Right actions cluster:**
   - "Ask AI" button (purple accent, visible when not on AI page)
   - Notification bell (with unread count badge)
   - User avatar circle

### 2.4 Content Area

| Property | Value |
|----------|-------|
| Container | `flex-1 min-h-0 min-w-0` with `ScrollArea` wrapper |
| Inner wrapper | `mx-auto w-full max-w-[1500px] p-3 sm:p-6 lg:p-7` |
| Page transitions | Framer Motion fade+slide (`opacity: 0→1, y: 10→0`, 250ms ease-out) |
| Loading state | Suspense fallback with centered spinner |

---

## 3. Primary Navigation (Sidebar)

The sidebar renders 12 top-level navigation modules. Each module is role-filtered — only modules matching the user's role appear. Clicking a module navigates to its default page.

| # | Key | Label | Icon | Default Page | Visible To |
|---|-----|-------|------|-------------|------------|
| 1 | `command_centre` | Command Centre | `LayoutDashboard` | `command` | All roles |
| 2 | `inbox` | Inbox / Action Centre | `ClipboardCheck` | `tasks` | All roles |
| 3 | `projects` | Projects | `FileText` | `journey` | All except freelancer |
| 4 | `toolboxes` | Toolboxes | `Files` | `toolbox` | All roles |
| 5 | `cpd_learning` | CPD & Learning | `BookOpen` | `cpd-assessment` | Architect, Admin, Freelancer |
| 6 | `documents` | Documents / Knowledge Hub | `Database` | `knowledge` | All except freelancer, supplier |
| 7 | `marketplace` | Marketplace / Resource Centre | `Search` | `marketplace` | Client, Architect, Admin, BEP, Contractor, Supplier |
| 8 | `finance` | Finance & Commercial | `CreditCard` | `invoicing` | Client, Admin, Contractor, Subcontractor |
| 9 | `analytics` | Analytics & Reporting | — | `analytics` | Client, Architect, Admin, Contractor, BEP, Engineers, Developer |
| 10 | `messages` | Messages | `Mail` | `messages` | All roles |
| 11 | `settings` | Settings | `Settings2` | `admin-console` | Admin only |
| 12 | `user_settings` | My Account | — | `profile` | Non-admin roles |

### NavItem Component

Each nav item renders as a rounded button with:
- 32×32px icon container (rounded, white bg, border on active)
- Label text (bold, truncated, hidden when collapsed)
- Active indicator: blue-tinted background + green dot + shadow
- Inactive: muted text, hover reveals primary color

```
[icon-box] Label Text                    [•]  ← active dot
```

---

## 4. Module Breakdown with Sub-Sections

### 4.1 Command Centre
Personal daily cockpit. The landing page after login.

| Section | Description |
|---------|-------------|
| Today / Next Actions | Daily priorities and next-best actions |
| Active Projects | Current project responsibilities |
| CPD Status | Professional learning compliance |
| Priority Messages | Unread urgent messages |
| Agent Recommendations | AI-suggested next-best actions |

### 4.2 Inbox / Action Centre
Protected work queue for required actions.

| Section | Description |
|---------|-------------|
| Required Actions | Tasks requiring user action |
| Approvals | Items awaiting sign-off |
| Retakes & Resubmissions | Items needing correction |
| Overdue | Missed deadlines |

### 4.3 Projects
Phase-aware project workspace. Every section is project-scoped.

| Section | Description | Phase-Aware |
|---------|-------------|:-----------:|
| Project Dashboard | Overview and health | ✓ |
| Team | Members and responsibility matrix | |
| Documents | Project file store | |
| RFIs | Requests for information | ✓ |
| Instructions | Site/project instructions | ✓ |
| Snags | Defects and snagging | ✓ |
| Payments | Financial items | ✓ |
| Passport | Single project truth record | |
| Audit Trail | Complete project history | |

### 4.4 Toolboxes
Role-specific professional tools organized by workflow domain.

| Section | Description | Stage-Gated |
|---------|-------------|:-----------:|
| Proposal & Appointment | Fee calculators, proposals | |
| Design & Compliance | NBR/SANS/municipal checks | |
| Costing & Procurement | BoQ, BoM, RFQs | |
| SpecForge Specifications | Pictorial specs, product schedules, approvals | |
| Construction Admin | Site diary, RFIs, variations | Build stage |
| Health & Safety | Safety file, permits, HIRA, incidents | Build stage |
| Closeout | Snags, handover packs | Closeout stage |
| Full Tool Library | Searchable tool registry | |

### 4.5 CPD & Learning
Separate professional development platform.

| Section | Description |
|---------|-------------|
| CPD Dashboard | Role/body-aware status |
| Courses & Webinars | Learning content |
| Assessments | Test runner and attempts |
| Certificates | Issued CPD evidence |
| Manual Submissions | Professional body tracking |
| Partner Admin | Administration (admin only) |

### 4.6 Documents / Knowledge Hub
Global document and template management.

| Section | Description |
|---------|-------------|
| My Documents | Personal documents |
| Project Documents | Cross-project search |
| Templates | Reusable templates |
| Compliance References | Guides and standards |
| Version History | Audit trail |

### 4.7 Marketplace / Resource Centre
Industry network and opportunities.

| Section | Description |
|---------|-------------|
| Professionals | Find consultants |
| Contractors | Find contractors/subs |
| Suppliers | Find suppliers |
| Freelancers | Candidate professionals |
| Resource Sharing | Plant, equipment, shared resources |
| Opportunities | Project opportunities and invitations |

### 4.8 Finance & Commercial
Commercial controls and payment governance.

| Section | Description |
|---------|-------------|
| Quotes | Quote comparisons |
| Invoices | Invoice management |
| Escrow | Escrow and drawdown |
| Payment Certificates | Certificate workflow |
| Ledger | Financial audit trail |

### 4.9 Analytics & Reporting
Role-scoped KPIs and reporting.

| Section | Description |
|---------|-------------|
| KPI Overview | Schedule variance, cost-to-complete, defects, retention, compliance |
| Project Reports | Versioned report history |
| Alerts | Threshold-triggered notifications |
| Exports | CSV/JSON with audit trail |

### 4.10 Messages
Full persistent messaging centre.

| Section | Description |
|---------|-------------|
| Direct Messages | One-to-one |
| Project Groups | Team conversations |
| Phase Channels | Phase-specific threads |
| CPD Threads | Learning support |
| Agent Threads | AI agent conversations |
| Linked Tasks | Messages attached to records |

### 4.11 Settings (Admin only)
Platform configuration and governance.

| Section | Description |
|---------|-------------|
| Profile | Personal preferences |
| Professional Registrations | Body details |
| Company | Team/org settings |
| Billing | Subscription management |
| Roles & Permissions | Access control |
| Platform Admin | System config |

### 4.12 My Account (Non-admin)
User profile and professional records.

| Section | Description |
|---------|-------------|
| Profile | Personal preferences |
| Professional Registrations | Body details |

---

## 5. Global Actions (Always Present)

These elements are accessible from ANY page within the OS:

| Action | Location | Behavior |
|--------|----------|----------|
| **Ask AI** | Header bar (right) | Opens AI Co-Pilot page. Purple accent button. Hidden when already on AI page. |
| **Notification Bell** | Header bar (right) | Badge shows unread count. Opens notification dropdown. |
| **User Avatar** | Header bar (far right) | Profile indicator. |
| **Sidebar Navigation** | Left sidebar (always visible on desktop) | Module-level navigation. Collapsible. |
| **Breadcrumb** | Header bar (left) | Shows current location: `Architex > Section > Page` |
| **Keyboard Shortcuts** | Global | Alt+1–9 for first 9 pages. Alt+K=Command, Alt+A=AI, Alt+P=Profile, Alt+F=Files, Alt+I=Invoicing |
| **Role Badge** | Header bar (next to title) | Shows current role with accent color |

---

## 6. Page Content Pattern (Workspace Template)

Every module page that loads into the content area follows this consistent layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. HEADER CARD                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  [UPPERCASE LABEL]              [Role Badge]              │  │
│  │  Project/Tool Title (text-2xl font-black)                 │  │
│  │  Subtitle: context, revision, stage                       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  2. PROJECT TOGGLES (if multi-project)                           │
│  [Project A ●] [Project B ●] [All Projects] [Standalone]        │
│                                                                  │
│  3. TAB NAVIGATION                                               │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ [Overview] [Tab 2] [Tab 3] [Tab 4] ...                    │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  4. ACTIVE TAB CONTENT                                           │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Stat cards, tables, forms, visualizations                │  │
│  │  (varies per tool/module)                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

Spacing between major sections: `space-y-6`.

---

## 7. Core Modules for Initial Scaffold (Priority Order)

For the Stitch scaffold, build these 5 screens first — they cover the full structural variety:

| # | Screen | Why It's Core | Layout Notes |
|---|--------|---------------|--------------|
| 1 | **Command Centre** | Landing page for all roles. Sets the tone. | Stat cards grid + action list + project cards + agent recommendations panel |
| 2 | **Projects > Dashboard** | Most complex layout — project-scoped, phase-aware, multi-panel | Header with stage progress bar, team grid, document list, financial summary, timeline |
| 3 | **Toolboxes > SpecForge** | Full workspace template reference. Tabs + tables + forms + approvals | Header card → project toggles → 8+ tabs → rich content per tab |
| 4 | **Messages** | Messaging centre with split-pane layout | Left panel (conversation list) + right panel (active thread) + context sidebar |
| 5 | **Settings / My Account** | Form-heavy profile + registrations | Sectioned form cards with validation states |

---

## 8. Design System Tokens

### 8.1 Color Palette (Dark Theme — Default)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#0d2520` | App background (deep dark teal) |
| `--foreground` | `#ffffff` | Primary text |
| `--card` | `#11302a` | Card/panel surfaces |
| `--card-foreground` | `#ffffff` | Card text |
| `--primary` | `#005b4e` | Brand teal (buttons, accents) — NOTE: in dark mode the sidebar-primary flips to mint |
| `--secondary` | `#aeefe3` | Mint green (accent highlight in dark theme) |
| `--muted` | `#123129` | Muted backgrounds |
| `--muted-foreground` | `rgba(255,255,255,0.62)` | Secondary text |
| `--accent` | `#9b7bd4` | Purple accent |
| `--border` | `rgba(174,239,227,0.16)` | Subtle mint borders |
| `--ring` | `#aeefe3` | Focus ring (mint) |
| `--destructive` | `#d95747` | Error/danger |

### 8.2 Color Palette (Light Theme)

| Token | Value | Usage |
|-------|-------|-------|
| `--background` | `#f5faf7` | Light mint-white |
| `--foreground` | `#0d1e25` | Near-black text |
| `--card` | `#ffffff` | White cards |
| `--primary` | `#005b4e` | Dark teal |
| `--secondary` | `#aeefe3` | Mint highlight |
| `--muted` | `#edf7f3` | Very light mint |
| `--accent` | `#7046a8` | Purple |
| `--border` | `#d0e3dc` | Teal-tinted grey |

### 8.3 Glassmorphism System

Four-layer glass surface definition:

```css
.glass {
  backdrop-filter: blur(20px) saturate(150%);
  background: var(--glass-bg);           /* rgba(255,255,255,0.07) dark / rgba(13,37,32,0.06) light */
  border: 1px solid var(--glass-border); /* rgba(174,239,227,0.24) dark */
  box-shadow:
    0 18px 50px rgba(0,0,0,0.32),
    0 0 28px var(--glass-glow),
    inset 0 1px 0 rgba(255,255,255,0.16);
}
```

**Glass variants** (increasing opacity/blur):
- `glass-base` — 75% card, 20px blur
- `glass-card` — 88% card, 16px blur (standard cards)
- `glass-panel` — 92% card, 24px blur (major panels)
- `glass-nav` — 70% card, 14px blur (navigation surfaces)
- `glass-modal` — 94% card, 32px blur (overlays)
- `glass-tile` — 82% card, 12px blur (interactive tiles with hover scale)

### 8.4 Typography

| Token | Font | Usage |
|-------|------|-------|
| `--font-heading` | Space Grotesk | All headings (h1–h6) |
| `--font-sans` | Inter | Body text, UI elements |
| `--font-mono` | JetBrains Mono | Code, IDs, technical data |

Key text styles:
- Page titles: `text-xl sm:text-2xl font-black tracking-[-0.045em]`
- Section labels: `text-xs font-semibold uppercase tracking-widest text-primary`
- Metric values: `text-3xl font-black leading-none tracking-[-0.055em]`
- Breadcrumb: `text-xs text-muted-foreground`
- Card titles: `text-2xl font-black`

### 8.5 Spacing & Radius

| Token | Value |
|-------|-------|
| `--radius` | `1.25rem` (20px) — base corner radius |
| `--radius-sm` | 12px |
| `--radius-md` | 16px |
| `--radius-lg` | 20px (same as base) |
| `--radius-xl` | 28px |
| Card radius | `rounded-[1.25rem]` |
| Button radius | `rounded-full` (pill shape for most buttons) |
| Nav item radius | `rounded-[1.05rem]` |
| Grid step | `clamp(38px, 3.8vw, 60px)` |

### 8.6 Shadows

- Soft: `0 16px 44px rgba(20, 71, 63, 0.12)` — cards, panels
- Button: `0 10px 24px rgba(0, 118, 102, 0.20)` — CTA buttons
- Record hover: `0 12px 30px rgba(20, 71, 63, 0.08)` — list items
- Stat card: `0 14px 34px rgba(20, 71, 63, 0.10)`

---

## 9. Responsive Behavior

| Breakpoint | Sidebar | Header | Content |
|------------|---------|--------|---------|
| < 768px (mobile) | Off-canvas drawer, full-width overlay | Hamburger menu, compact height (64px) | Full-width, p-3 |
| ≥ 768px (tablet+) | Sticky, collapsible (288px/84px) | Full header (80px) with breadcrumb | max-w-1500px, p-6 |
| ≥ 1024px (desktop) | Expanded by default | Full breadcrumb + all actions | p-7 |

Mobile sidebar: slides in from left with transform transition, backdrop overlay for dismissal.

---

## 10. Role-Aware Visibility

The shell adapts per role:

| Role | Sidebar Modules Shown | Accent Color |
|------|----------------------|--------------|
| Client | Command, Inbox, Projects, Toolboxes, Documents, Marketplace, Finance, Messages, My Account | `#005b4e` (teal) |
| Architect / BEP | All except Settings | `#006b5c` / `#7046a8` (teal/purple) |
| Contractor | Command, Inbox, Projects, Toolboxes, Documents, Marketplace, Finance, Analytics, Messages, My Account | `#2f72a7` (blue) |
| Freelancer | Command, Inbox, Toolboxes, CPD, Messages, My Account | `#165a4c` (dark teal) |
| Admin | All modules including Settings | `#ba1a1a` (red) |

Each role has a distinct accent color shown in:
- Sidebar role card (top border color + status dot glow)
- Header badge pill
- Active state highlights where contextually appropriate

---

## 11. 8-Stage Project Lifecycle (Informs Phase-Aware UI)

```
[1. Brief] → [2. Appoint] → [3. Design] → [4. Comply]
    → [5. Procure] → [6. Build] → [7. Pay] → [8. Close-out]
```

The active lifecycle stage determines:
- Which Toolbox sections are unlocked (Build stage enables Construction Admin + H&S; Closeout enables Closeout tools)
- Which project sections show phase-specific content
- Stage progress indicators in the Project Dashboard
- Available actions in the Inbox/Action Centre

---

## 12. Key Interaction Patterns

### Navigation Flow
1. User clicks sidebar module → navigates to module's default page
2. Within a page, tabs provide sub-navigation (no URL routing — SPA state)
3. Breadcrumb updates to reflect: `Architex > [Group Label] > [Page Label]`
4. Page transition animates with fade+slide (respects `prefers-reduced-motion`)

### Project Context
- Many pages are project-scoped: they receive an active project ID
- Project toggles (pill buttons) let users switch between projects or view "All Projects"
- "Standalone" mode available for tools that work without a project

### Contextual Messaging
- Many sections support in-context messaging (marked `supportsContextualMessaging`)
- Messages are linked to the source object (RFI, snag, payment, etc.)
- Persistence and audit policies vary by context

---

## 13. Icon System

All icons use **Lucide React** (18–20px default). Key module icons:

| Module | Icon |
|--------|------|
| Command Centre | `LayoutDashboard` |
| Inbox | `ClipboardCheck` |
| Projects | `FileText` |
| Toolboxes | `Files` |
| CPD & Learning | `BookOpen` |
| Documents | `Database` |
| Marketplace | `Search` |
| Finance | `CreditCard` |
| Messages | `Mail` |
| Settings | `Settings2` |
| Analytics | `BarChart3` |

Status/state icons:
- Success: `CheckCircle2` (emerald)
- Warning: `Shield` (orange)
- AI: `Bot` / `Sparkles` (purple)
- Construction: `Construction` / `Hammer`
- Compliance: `ShieldCheck`

---

## 14. Summary for Stitch Scaffold

**What to build first:**

1. **Base Layout Shell** — Sidebar (288px, collapsible to 84px, glass surface) + Sticky Header (80px, glass, breadcrumb + title + actions) + Content area (1500px max, centered, scroll)
2. **Command Centre** — Grid of stat cards + action list + project cards. This is the "home screen."
3. **Project Dashboard** — Phase-aware workspace with stage progress, team, documents, financials
4. **SpecForge Workspace** — Full workspace template: header card → project toggles → tabbed content (reference for all other tools)
5. **Messages** — Split-pane messaging layout

**Design principles:**
- Dark teal background is the default (Dark_Theme)
- Glassmorphism on all elevated surfaces (sidebar, header, modals, cards)
- Mint green (`#aeefe3`) is the primary accent in dark mode
- Purple (`#9b7bd4`) is the secondary accent (AI features)
- All corners are generously rounded (20px base radius)
- Pill-shaped buttons throughout
- Space Grotesk for headings, Inter for body
- Subtle grid canvas texture behind content (44px lines at 5.5% opacity)
- Page transitions are gentle fade+slide (250ms)
- Everything is role-filtered — the shell adapts what it shows per user type
