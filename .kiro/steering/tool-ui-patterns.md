# Tool UI Integration Patterns

## Core Principle

Every tool in Architex is **deeply integrated into the OS shell** — never a separate instance, standalone page, or external app. Tools are React components rendered inside the Architex OS layout, receiving the same `user` prop, sharing the same navigation context, and writing back into the platform spine (SpecForge, Project Passport, Audit Trail).

## Shell Integration

Tools render inside `App.tsx`'s authenticated content area. The Architex OS provides:

- **Top header bar** — Architex OS branding, breadcrumb trail (`/ Module / Tool Name`), project context, user avatar
- **Primary navigation** — Collapsed/minimised sidebar showing the module the tool belongs to
- **Content area** — Where the tool component renders, filling the available space

Tools do NOT render their own shell, header, or standalone navigation. They inherit the OS frame.

## Layout Pattern (SpecForge Reference)

All workspace-style tools follow the SpecForge pattern:

```
┌─────────────────────────────────────────────────────────────────┐
│  Architex OS Header (sticky, breadcrumb shows module > tool)    │
├────────┬────────────────────────────────────────────────────────┤
│  Mini  │  Tool Content Area                                     │
│  Nav   │  ┌──────────────────────────────────────────────────┐  │
│  (mod- │  │  Tool Header (Card: title, context, revision)    │  │
│  ule   │  ├──────────────────────────────────────────────────┤  │
│  scop- │  │  Tab Navigation (tool-specific views/sections)   │  │
│  ed)   │  ├──────────────────────────────────────────────────┤  │
│        │  │  Active Tab Content                              │  │
│        │  │  (cards, tables, forms, visualisations)          │  │
│        │  └──────────────────────────────────────────────────┘  │
└────────┴────────────────────────────────────────────────────────┘
```

- The **minimised primary navigation** stays visible, showing the parent module's tools
- The **tool header** is a Card with the tool's name, project context, and relevant metadata
- **Internal navigation** uses shadcn `Tabs` / `TabsList` / `TabsTrigger` for tool sub-views

## Module Belonging

Every tool belongs to one of the 8 workflow modules. It must:

1. Be accessible from its parent module's navigation section
2. Show the module breadcrumb path in the OS header (e.g., `/ Compliance Hub / SANS 10400-XA`)
3. Read from and write back to the module's shared data layer
4. Surface relevant actions to the Action Centre / Inbox
5. Respect role-based visibility — only roles granted access to the module see the tool

## Integration Requirements

Tools are not isolated calculators. Every tool must:

- **Accept `user: UserProfile` prop** — for role-based behaviour and permissions
- **Operate within project context** — when project-scoped, receive/read the active project
- **Write to Project Passport** — results, status changes, and outputs feed the central project record
- **Expose to SpecForge** — where the tool produces specifications, selections, or products
- **Emit audit events** — all meaningful actions are logged to the project audit trail
- **Generate inbox actions** — approvals, reviews, and follow-ups surface in the Action Centre
- **Use shared UI primitives** — shadcn/ui components (`Card`, `Tabs`, `Button`, `Badge`, `Dialog`, etc.)

## Visual Conventions

- **Dark theme** — all tool UIs use the app-wide dark theme (surface-900/950 backgrounds)
- **Glass cards** — use `bg-surface-800/70 backdrop-blur border-surface-700/50` for elevated panels
- **Color tokens** — `primary-*` (blue), `surface-*` (slate), status colours (green/pass, red/fail, amber/pending, slate/n-a)
- **Typography** — Inter font, `text-xs uppercase tracking-wider` for labels, `text-2xl font-bold` for titles
- **Icons** — `lucide-react` exclusively, 16–20px, matching the module's icon set
- **Spacing** — consistent `space-y-6` between major sections, `gap-4` in grids

## Component Structure

```typescript
// Every tool follows this shape:
interface ToolProps {
  user: UserProfile;
  projectId?: string;  // when project-scoped
}

export default function MyTool({ user }: ToolProps) {
  // 1. Derive role permissions
  // 2. Load project/tool state
  // 3. Render: Header Card → Tabs → Active content
}
```

## Registration

Tools must be registered in the toolbox registry with:
- `calculatorDefinitionId` linking to their full definition
- Correct module grouping
- Role access list
- Summary description for the toolbox tile

## What Tools Must NOT Do

- Render their own full-page shell or standalone header
- Import their own font or colour system
- Create separate routing outside App.tsx's tab system
- Bypass role checks or show content to unauthorised roles
- Store data in isolation without writing back to Project Passport or SpecForge
- Use UI libraries outside the established stack (no Material UI, no Ant Design, etc.)
