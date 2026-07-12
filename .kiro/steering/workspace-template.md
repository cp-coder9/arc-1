# Workspace Template Pattern (SpecForge Reference)

## Rule

All workspace-style tools and modules MUST follow the SpecForge workspace layout pattern. This ensures visual consistency across the platform and leverages the shared App shell (left sidebar, header bar, breadcrumbs).

## Template Structure

Every workspace component follows this shape:

```
┌─────────────────────────────────────────────────────────────────┐
│  App Shell Header (breadcrumb: Architex > Module > Tool Name)   │
├────────┬────────────────────────────────────────────────────────┤
│  Left  │  1. Header Card (tool name, project, role badge)       │
│  Side  │  2. Project Toggles (multi-project + All + Standalone) │
│  Nav   │  3. Tab Navigation (tool-specific views)               │
│  (App  │  4. Active Tab Content (cards, tables, forms)          │
│  Shell)│                                                        │
└────────┴────────────────────────────────────────────────────────┘
```

## Component Pattern

```typescript
interface Props {
  user: UserProfile;
  projectId?: string;
}

export default function MyWorkspace({ user, projectId }: Props) {
  const [activeView, setActiveView] = useState('overview');
  const [selectedProject, setSelectedProject] = useState(projectId ?? projects[0]?.id);
  const [viewMode, setViewMode] = useState<'project' | 'all'>('project');

  return (
    <div className="space-y-6" data-testid="my-workspace">
      {/* 1. Header Card */}
      <Card>
        <CardHeader className="pb-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">Tool Name</p>
          <CardTitle className="text-2xl">{projectName}</CardTitle>
          <p className="text-sm text-muted-foreground">Context · Revision · Stage</p>
        </CardHeader>
      </Card>

      {/* 2. Project Toggles */}
      <div className="flex flex-wrap items-center gap-2">
        {projects.map(p => <Button key={p.id} ... />)}
        <Button>All Projects</Button>
        <Button>Standalone</Button>
      </div>

      {/* 3. Tab Navigation + 4. Active Content */}
      <Tabs value={activeView} onValueChange={setActiveView}>
        <TabsList className="flex-wrap">...</TabsList>
        <TabsContent value="overview">...</TabsContent>
        ...
      </Tabs>
    </div>
  );
}
```

## Required Elements

### Header Card
- `text-xs font-semibold uppercase tracking-widest text-primary` label (tool name)
- `text-2xl` title (project name or "All Projects Overview")
- Subtitle with context metadata
- Role badge on the right: `<Badge className="rounded-full border-0 bg-primary/15 text-primary">`

### Project Toggles
- Row of `<Button variant="outline" size="sm" className="rounded-full">` for each project
- Status dot: green (active), amber (pending), slate (complete)
- "All Projects" button at end
- "Standalone" button for tools that work without a project

### Tab Navigation
- shadcn `<Tabs>` with `<TabsList className="flex-wrap">`
- Each tab is a `<TabsTrigger>` + matching `<TabsContent>`
- Overview tab always first, showing stat cards and summaries

### Stat Cards
- Use `<Card><CardContent className="p-4">` with icon + value + label
- Value: `text-xl font-bold`
- Label: `text-xs text-muted-foreground`
- Destructive variant: `text-red-400`, Warning: `text-orange-400`

### Tables
- Inside `<Card>` with header and `overflow-x-auto`
- Header row: `text-xs uppercase tracking-wider text-muted-foreground`
- Mono IDs: `font-mono text-xs`
- Status badges: coloured `rounded-full px-2 py-0.5 text-xs`

## Teal Colour Scheme (CSS Tokens)

Use the platform token system — never hardcode colours:
- `text-primary` — teal accent text
- `bg-primary/15` — subtle teal background
- `border-primary/30` — teal border
- `text-muted-foreground` — subdued text
- `bg-emerald-500/20 text-emerald-400` — success/complete
- `bg-red-500/20 text-red-400` — error/critical
- `bg-orange-500/20 text-orange-400` — warning/high
- `bg-yellow-500/20 text-yellow-400` — pending/medium
- `bg-purple-500/20 text-purple-400` — info/special

## Registration Checklist

Every workspace MUST:
1. Accept `user: UserProfile` prop
2. Be lazy-loaded in App.tsx via `lazyWithChunkRetry`
3. Be added to the `pages` array with correct roles and group
4. Be excluded from the legacy dashboard fallthrough check
5. Be registered in `architexNavigationConfig.ts` under the correct module
6. Follow the Header Card → Project Toggles → Tabs → Content layout

## Reference Implementations

- `src/components/specforge/SpecForgeWorkspace.tsx` — original template
- `src/components/healthSafety/HealthSafetyWorkspace.tsx` — first follower
