# Architex OS — Google Stitch Design Brief

> **Document type:** New project brief for Google Stitch  
> **Product:** Architex OS  
> **Design concept:** Datum UI  
> **Target output:** Complete master layout scaffold with navigation, module screens, and design system

---

## Project Overview

### What is Architex OS?

Architex OS is a **Built Environment Operating System** — a role-based, action-driven web platform that coordinates the complete lifecycle of construction and architectural projects in South Africa. It serves 17 professional roles (clients, architects, engineers, contractors, quantity surveyors, suppliers, etc.) across an 8-stage project lifecycle.

The platform is NOT a dashboard with tools bolted on. It is a unified operating system where every module connects back to a single project truth record. Think of it as the coordination layer between every stakeholder on a building project — from first brief to final handover.

### The Core Idea

> **Architex OS is the single truth line that every project layer aligns to.**

In architecture, a **datum line** is a reference point that establishes order, alignment, measurement, and control. Architex OS uses this as both a functional principle and a visual identity. The platform becomes the datum — the governing reference layer — for the entire built environment project.

### What It Should Feel Like

- Calm
- White
- Architectural
- Precise
- Premium
- Minimal
- Elemental
- Easy to use
- Comprehensive in capability, but simple at first glance

---

## Design Concept: Datum UI

### The Datum Line

The central graphic device of the interface is a horizontal **datum line** — a thin teal reference line that represents the single source of truth.

It communicates:
- Every part of the project has a place
- Every decision references one truth
- Every stakeholder works from the same line
- Project continuity from brief to handover

The datum line behaves differently depending on context:

| Context | Datum Behavior |
|---------|----------------|
| **Main Dashboard / Home** | Large, expressive hero element. Runs across the canvas as the organizing spine. Modules branch above and below. |
| **Working Module Views** | Minimized into a thin reference strip (top or bottom of page). Shows project stage, active module, connected systems. Quiet but always present. |
| **Loading / Transitions** | Draws from left to right. Nodes dock as content loads. |

### Datum Line Structure (Hero View)

The line runs horizontally across the workspace. The Architex origami bird sits at the origin point. The current project anchors to the line.

**Above the line** (defining, verifying, governing):
- Client
- Professionals
- Drawings
- Compliance
- Municipal

**Below the line** (execution, delivery, commercial):
- Contractors
- Suppliers
- Site
- Payments
- Handover

Each module connects to the line via thin vertical connectors with small node points. Floating glass cards attach to these nodes showing module name, subtitle, and alignment status.

### Minimized Datum Strip (Working Views)

When inside a module, the datum line compresses into a thin strip showing:
- Project stages as ticks/nodes along the line
- Active stage highlighted in teal
- Connected systems with status indicators
- Current module position

This provides constant orientation without distracting from the workspace content.

---

## Layout Architecture

### Global Shell Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  TOP HEADER                                                              │
│  [Logo + Wordmark]  [Global Search ⌘K]              [🔔] [Avatar ▾]    │
├──────────────┬───────────────────────────────────────────────────────────┤
│              │                                                            │
│  LEFT        │  MAIN WORKSPACE                                           │
│  SIDEBAR     │                                                            │
│              │  ┌─ Datum Line (hero or minimized) ──────────────────┐    │
│  Home        │  │                                                    │    │
│  Dashboard   │  └────────────────────────────────────────────────────┘    │
│  Activity    │                                                            │
│              │  ┌─ Module Content Area ──────────────────────────────┐    │
│  DISCOVER    │  │                                                    │    │
│  Projects    │  │  Cards, tables, forms, workflows, tools            │    │
│  Catalog     │  │                                                    │    │
│  Insights    │  └────────────────────────────────────────────────────┘    │
│              │                                                            │
│  VERIFY      │                                                            │
│  Documents   │                                                            │
│  Compliance  │                                                            │
│  Quality     │                                                            │
│              │                                                            │
│  COLLABORATE │                                                            │
│  Teams       │                                                            │
│  Issues      │                                                            │
│  RFIs        │                                                            │
│  Approvals   │                                                            │
│              │                                                            │
│  Settings    │                                                            │
├──────────────┴───────────────────────────────────────────────────────────┤
│  BOTTOM STATUS BAR                                                        │
│  ● Connected  │  Connected Data  │  Integrations  │  Users  │  Security  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Top Header

| Element | Description |
|---------|-------------|
| Logo | Architex origami bird + "ARCHITEX OS" wordmark (left-aligned) |
| Global Search | Center-aligned search bar with placeholder "Search projects, documents, people, or companies..." and ⌘K shortcut badge |
| Notifications | Bell icon with unread dot (right) |
| User Avatar | Profile picture with dropdown chevron (far right) |

**Style:** Clean white bar, minimal height (~64px), thin bottom border. No background color — just white with gentle shadow.

### Left Sidebar

| Section | Items |
|---------|-------|
| **Top** | Home (active state: teal pill bg), Dashboard, Activity |
| **DISCOVER** | Projects, Catalog, Insights |
| **VERIFY** | Documents, Compliance, Quality |
| **COLLABORATE** | Teams, Issues, RFIs, Approvals |
| **Bottom** | Settings |

**Style:**
- White background
- Section labels: uppercase, small, grey, tracked wide
- Nav items: medium weight, dark text, left-aligned with icon
- Active item: teal text + teal pill/highlight background
- Hover: subtle teal tint
- Width: ~220–240px
- Right border: thin, very light grey

### Bottom Status Bar

A thin status strip at the bottom showing system health:
- Connection status (green dot + "Connected")
- Connected Data count
- Active Integrations count
- Active Users count
- Security status (SOC 2 Type II)
- Uptime percentage
- System Status link

**Style:** Light grey background, small text, icon + label pairs. This is informational, not interactive.

---

## Module System

### The Three Pillars

The platform organizes around three product pillars that drive the navigation:

#### DISCOVER
Find the right people, information, and opportunities across the project ecosystem.

| Tool | Purpose |
|------|---------|
| Project Explorer | Browse and manage projects |
| Catalog | Product and material catalog |
| Market Insights | Industry data and trends |
| AI Assistant | Intelligent project guidance |

#### VERIFY
Validate information, reduce risk, and ensure compliance.

| Tool | Purpose |
|------|---------|
| Document Check | Drawing and document verification |
| Code Compliance | SANS/NBR building code checks |
| Quality Control | QA workflows and evidence |
| Audit Trail | Complete verification history |

#### COLLABORATE
Coordinate the full project team and keep everyone aligned.

| Tool | Purpose |
|------|---------|
| Team Workspace | Project team coordination |
| Issues | Issue tracking and resolution |
| Approvals | Approval workflows and sign-off |
| Communications | Project messaging and notifications |

---

## Detailed Module Inventory

Behind the three pillars, the full platform contains 8 workflow modules with deep sub-tools:

| # | Module | Purpose | Key Tools |
|---|--------|---------|-----------|
| 1 | **Project Passport** | Single source of truth per project | Facts, stage, team, compliance, decisions |
| 2 | **Brief & Appointment** | Project intake and professional appointment | Guided brief wizard, proposal comparison, contracts |
| 3 | **SpecForge** | Specification spine | Pictorial specs, product schedules, approvals, RFQs |
| 4 | **Compliance Hub** | Regulatory verification (advisory) | SANS checks, readiness gaps, submission checklists |
| 5 | **Documents & Drawing Intelligence** | Document control | Drawing register, revisions, transmittals, AI analysis |
| 6 | **Tender / Procurement** | Commercial workflows | RFQs, package scopes, quotes, delivery, warranty |
| 7 | **Site Execution** | Construction operations | Site diary, RFIs, snags, H&S, workforce, plant |
| 8 | **Closeout & Payment** | Financial governance and handover | Valuations, claims, escrow, snagging, handover |

---

## Screens to Build

### Screen 1: Main Dashboard (Datum Hero)

This is the home screen. The datum line dominates as the hero element.

**Composition:**
1. Top header (logo, search, notifications, avatar)
2. Left sidebar (Discover/Verify/Collaborate navigation)
3. Hero area with datum line:
   - Architex origami bird at origin (left)
   - Horizontal teal line with nodes and connectors
   - Project title anchored to line: "Harborview Civic Center"
   - Subtitle: "Single source of truth"
   - Status: "● All systems aligned"
   - Glass cards floating above line: Client, Professionals, Drawings, Compliance, Municipal
   - Glass cards floating below line: Contractors, Suppliers, Site, Payments, Handover
   - Each card shows: icon, title, subtitle, "✓ Aligned ●" status
4. Below hero: Three large module cards for Discover, Verify, Collaborate
   - Each card has title, description, arrow, and 4 icon tiles for sub-tools
5. Bottom status bar

**Background:** Very faint architectural grid (pale lines, 44px spacing, ~5% opacity). Almost invisible.

### Screen 2: Working Module (Documents / Drawing Check)

**Composition:**
1. Top header (same as dashboard)
2. Left sidebar (Documents highlighted under VERIFY)
3. **Minimized datum strip** at top of workspace:
   - Thin teal line with stage nodes: `Brief — Design — Compliance — Tender — Construction — Handover`
   - Active stage (Compliance) highlighted in teal
   - Other stages in pale grey
4. Module workspace content:
   - Header card with module title, project context, role badge
   - Tab navigation (Overview, Upload, Review, History)
   - Content area with document cards, upload zone, or review interface

### Screen 3: Project Workspace (Phase-Aware)

**Composition:**
1. Same shell (header, sidebar)
2. Minimized datum strip showing lifecycle progress
3. Workspace content:
   - Header card: Project name, stage badge, team summary
   - Project toggle pills: [Active Project A] [Project B] [All Projects]
   - Tab navigation: Dashboard, Team, Documents, RFIs, Snags, Payments, Passport
   - Active tab content: stat cards grid, activity feed, action items

### Screen 4: SpecForge Workspace (Full Tool Template)

**Composition:**
1. Same shell
2. Minimized datum strip
3. Full workspace template:
   - Header card (SpecForge label, project name, revision info, role badge)
   - Project toggles
   - Tabs: Overview, Specifications, Products, Approvals, RFQs, Issues, Planning, Closeout
   - Table with specification items, status pills, actions

### Screen 5: Messages / Collaboration

**Composition:**
1. Same shell
2. Split-pane layout:
   - Left panel: conversation list (direct, project groups, phase channels)
   - Right panel: active conversation thread
   - Optional: context panel (linked tasks, files, approvals)

---

## Visual Design System

### Color Palette

#### Primary (Teal — from Architex origami bird)
| Usage | Hex | Application |
|-------|-----|-------------|
| Primary | `#005b4e` | Active states, datum line, buttons, links, selected nav |
| Primary Light | `#007666` | Hover states, focus rings |
| Primary Dark | `#00201b` | Deep accent for emphasis |

#### Supporting Colors (Sparingly)
| Category | Color | Usage |
|----------|-------|-------|
| Drawings/Data | Blue `#2f72a7` | Document-related features |
| Compliance/Approval | Green `#1d8d6f` | Verified, aligned, approved states |
| Contractors/Action | Orange `#d26a38` | Site, action needed, contractor features |
| Municipal/Formal | Purple `#7046a8` | Municipal, formal approvals, AI features |
| Risk/Warning | Red/Coral `#d95747` | Issues, risk, warnings only |

#### Surfaces
| Surface | Value | Usage |
|---------|-------|-------|
| Background | `#f5faf7` (near-white with faintest mint) | Page canvas |
| Cards | `#ffffff` (pure white) | All cards, panels, popovers |
| Muted surface | `#edf7f3` (very pale mint) | Hover states, inactive areas |
| Border | `#d0e3dc` (pale teal-grey) | Card borders, dividers |
| Text primary | `#0d1e25` (near-black) | Headlines, body |
| Text muted | `#5e7478` (grey-teal) | Subtitles, labels, secondary text |

### CRITICAL: White-Dominant Design

The interface is **predominantly white** with teal as accent only.

**Teal appears as:**
- ✅ Datum line
- ✅ Active nav item text/highlight
- ✅ Primary buttons (teal fill, white text)
- ✅ Links and interactive text
- ✅ Status dots and node points
- ✅ Card top-border accents (thin 4px line)
- ✅ Focus ring outlines
- ✅ Aligned/active status indicators

**Teal does NOT appear as:**
- ❌ Page background
- ❌ Sidebar fill color
- ❌ Header background
- ❌ Large card surfaces
- ❌ Modal/dialog backgrounds

The overall impression should be: **a white architectural workspace with precise teal reference marks.**

### Glass Treatment

Restrained liquid-glass design language for elevated surfaces:

```css
/* Standard glass card */
background: rgba(255, 255, 255, 0.88);
backdrop-filter: blur(16px);
border: 1px solid rgba(208, 227, 220, 0.5);
box-shadow: 0 8px 32px rgba(20, 71, 63, 0.08);
border-radius: 20px;
```

Use glass for:
- Datum module cards (floating above/below the line)
- Modal overlays
- Dropdown menus
- Elevated panels

Do NOT use glass for:
- Standard content cards (these should be opaque white)
- Sidebar
- Tables
- Form fields

### Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Logo wordmark | Space Grotesk | 700 | 18px |
| Page titles | Space Grotesk | 800–900 | 24–32px |
| Section headings | Space Grotesk | 700 | 18–20px |
| Body text | Inter | 400 | 14–15px |
| Labels/caps | Inter | 600–700, uppercase | 11–12px, wide tracking |
| Mono/IDs | JetBrains Mono | 400 | 12px |
| Nav items | Inter | 500 | 14px |
| Status pills | Inter | 600 | 11–12px |

### Spacing & Radius

| Element | Value |
|---------|-------|
| Card border radius | 16–24px (20px default) |
| Button radius | Full pill (rounded-full) for primary; 12px for secondary |
| Nav item radius | 10–12px |
| Section spacing | 24px between major blocks |
| Card padding | 16–24px |
| Grid gaps | 16px |
| Page max-width | 1500px, centered |

### Shadows

All shadows use subtle teal-tinted values for cohesion:

```css
/* Gentle card shadow */
box-shadow: 0 8px 32px rgba(20, 71, 63, 0.08);

/* Elevated panel */
box-shadow: 0 16px 44px rgba(20, 71, 63, 0.12);

/* Hover lift */
box-shadow: 0 12px 40px rgba(20, 71, 63, 0.15);

/* Button glow */
box-shadow: 0 10px 24px rgba(0, 118, 102, 0.20);
```

### Background Treatment

A very faint architectural coordinate field behind the content:
- Pale grid lines (44px spacing, ~5% opacity)
- Color: `rgba(0, 91, 78, 0.055)` (barely visible teal)
- Subtle radial accent: mint glow at top-left, purple glow at top-right (both very faint)
- Should be almost invisible — never compete with content

---

## Component Library

### Cards

Clean, light, spacious.

| Property | Value |
|----------|-------|
| Fill | White (`#ffffff`) |
| Border | 1px `#d0e3dc` |
| Radius | 20px |
| Shadow | `0 8px 32px rgba(20, 71, 63, 0.08)` |
| Padding | 20–24px |
| Hover | Lift -2px, border shifts to teal/30 |

### Datum Module Cards (Glass)

Floating cards that attach to the datum line.

| Property | Value |
|----------|-------|
| Fill | Frosted white (88% opacity + blur) |
| Border | 1px teal-tinted |
| Radius | 16px |
| Shadow | Soft 8px spread |
| Content | Icon (centered, 32px), Title, Subtitle, Status pill |
| Connection | Thin vertical line to datum with small node dot |

### Status Pills

Small, calm, rounded indicators.

| Status | Style |
|--------|-------|
| Aligned | Green text + green dot, light green bg |
| Verified | Blue text, light blue bg |
| In Review | Orange text, light orange bg |
| Pending | Grey text, light grey bg |
| At Risk | Red text, light red bg |
| Synced | Teal text, light teal bg |

Format: `✓ Status ●` or just `Status`

### Buttons

| Type | Style |
|------|-------|
| Primary | Teal fill, white text, pill shape, gentle shadow |
| Secondary | White fill, light border, dark text, pill shape, teal hover |
| Ghost | No fill/border, teal text, teal hover bg at 5% |
| Icon | 40px circle, light bg, icon centered |

### Navigation Items

| State | Style |
|-------|-------|
| Default | Dark text, no background |
| Hover | Subtle teal tint background |
| Active | Teal text, light teal pill/highlight background |
| Section label | Uppercase, 11px, grey, wide letter-spacing |

### Datum Nodes

Small precision marks on the datum line:
- Active: Solid teal circle (8px) with soft glow
- Connected: Solid teal dot (6px)
- Inactive: Hollow circle with pale border (6px)
- Current: Larger dot (10px) with pulse/glow animation
- Stage ticks: Small vertical marks (4px) at even intervals

---

## Motion & Interaction

### Dashboard Load Sequence
1. White canvas appears
2. Faint grid background fades in (200ms)
3. Datum line draws from left to right (600ms, ease-out)
4. Origami bird fades in at origin (300ms)
5. Project title fades in (200ms)
6. Module cards dock to the line (staggered, 100ms each)
7. Bottom pillar cards fade up (200ms)

### Module Navigation
1. User clicks sidebar item
2. Datum line compresses into minimized strip (300ms)
3. Module workspace slides in from bottom (250ms, opacity + Y)
4. Active segment of datum strip highlights

### Card Interactions
- Hover: Card rises 2px, border shifts to teal at 30% opacity
- Click: Subtle press (scale 0.98) then navigate
- Status pills: No animation (static, calm)

### Page Transitions
- Fade + slide: opacity 0→1, Y 10→0 (250ms ease-out)
- Respect prefers-reduced-motion

---

## Responsive Considerations

| Viewport | Sidebar | Datum | Content |
|----------|---------|-------|---------|
| Desktop (≥1200px) | Full sidebar visible | Full hero or minimized strip | Max 1500px centered |
| Tablet (768–1199px) | Collapsed to icons only | Minimized strip only | Full width with padding |
| Mobile (<768px) | Hidden drawer (hamburger trigger) | Hidden or very minimal | Full width, compact cards |

---

## 8-Stage Project Lifecycle

The datum line maps directly to the project lifecycle:

```
● Brief → ● Appoint → ● Design → ● Comply → ● Procure → ● Build → ● Pay → ● Close-out
```

In the minimized datum strip, these appear as evenly-spaced nodes. The active stage gets the teal highlight. Completed stages show solid dots. Future stages show hollow circles.

---

## User Roles (17 Total)

The interface adapts per role. Key roles for initial design:

| Role | Primary Modules | Accent |
|------|----------------|--------|
| Client | Brief, Proposals, Progress, Payments | Teal |
| Architect | Design, Compliance, Documents, Specifications | Teal |
| Contractor | Site, Procurement, Packages, Staff | Blue |
| Engineer | Design, Calculations, Compliance | Blue |
| Quantity Surveyor | Costing, Procurement, Payments | Teal-blue |
| Supplier | Quotes, Delivery, Warranty | Green |
| Freelancer | Assigned Work, Submissions, CPD | Teal |
| Admin | All modules + Governance | Red |

For the scaffold, design for the **Architect** role as the default view (most comprehensive access).

---

## Logo Integration

The Architex origami bird is integrated into the concept, not just decoration:

1. **Header brand mark** — Top-left with "ARCHITEX OS" wordmark
2. **Datum origin marker** — The bird sits at the origin point of the project truth line on the dashboard
3. **Micro-brand moments** — Small bird mark in empty states, loading spinners, project cards

The logo should feel like the pin that anchors the project ecosystem to a single reference point.

---

## What Makes This Different

This is NOT a generic SaaS dashboard. Key differentiators:

1. **The Datum Line** — A unique, ownable UI device that communicates the product's core value (single source of truth)
2. **Architectural precision** — The UI borrows visual language from technical drawings without being technical itself
3. **White-space dominance** — Comprehensive platform, but calm and uncluttered at every level
4. **Connected system awareness** — Every module shows its connection to the whole project
5. **Role-aware adaptation** — The shell adapts what it shows per user type
6. **Phase-gated tools** — Tools unlock based on project stage (brief → handover)

---

## Summary Prompt for Stitch

```
Create a clean desktop web app UI for ARCHITEX OS using a "Datum UI" design concept.

The product is an operating system for the built environment — coordinating construction and architectural projects from brief to handover. The interface should communicate a single source of truth for every project.

VISUAL LANGUAGE:
- Predominantly white workspace with teal as the primary accent colour (from the Architex origami bird logo)
- Soft frosted-glass cards, subtle blur, gentle shadows, thin borders
- 20px rounded corners on cards, pill-shaped buttons
- Inter body font, Space Grotesk for headings
- Faint architectural grid background (barely visible)
- Clean, calm, precise, minimal, architectural, premium

MAIN DASHBOARD:
- Top header: Architex OS logo + wordmark, centered global search (⌘K), notifications bell, user avatar
- Left sidebar: Home/Dashboard/Activity, then grouped sections: DISCOVER (Projects, Catalog, Insights), VERIFY (Documents, Compliance, Quality), COLLABORATE (Teams, Issues, RFIs, Approvals), Settings
- Hero area: Horizontal teal datum line running across the workspace. Architex origami bird at the origin point (left). Current project "Harborview Civic Center" anchored to the line. Subtitle "Single source of truth". Status "● All systems aligned".
- Glass cards floating ABOVE the datum line via vertical connectors: Client, Professionals, Drawings, Compliance, Municipal
- Glass cards floating BELOW the datum line via vertical connectors: Contractors, Suppliers, Site, Payments, Handover
- Each card: centered icon, title, subtitle, green "✓ Aligned ●" status pill
- Below hero: Three large cards for DISCOVER, VERIFY, COLLABORATE with descriptions and 4 icon-tiles each
- Bottom status bar: Connection status, data count, integrations, active users, security, uptime

WORKING MODULE VIEW:
- Same header and sidebar
- Datum line MINIMIZED into a thin reference strip at the top showing project stages as nodes
- Active stage highlighted in teal, other stages in grey
- Module content below: header card with title + project context + role badge, tab navigation, content area

The overall feel should be: a white architectural workspace with precise teal reference marks. Calm, ordered, premium, and effortless to use. The platform is comprehensive but the UI should feel simple at first glance.
```

---

## Files to Reference

- `ARCHITEX_OS_SCAFFOLD_BRIEF.md` — Previous technical scaffold document with exact CSS tokens and component patterns
- `ARCHITEX_OS_SCAFFOLD_REFERENCE.md` — Full module breakdown and navigation architecture
- Attached mockup image — Reference composition for datum line hero layout
- `src/index.css` — Live design tokens (CSS custom properties)
- `src/navigation/architexNavigationConfig.ts` — Full navigation structure
- `src/App.tsx` — Shell implementation (sidebar, header, content routing)
