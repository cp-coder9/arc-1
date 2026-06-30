# Architex Integration Notes — SpecForge

## 1. Copy code into `arc-1`

Recommended paths:

```text
src/types/specforgeTypes.ts
src/services/specforge/specforgeService.ts
src/services/specforge/openProjectSpecBridge.ts
src/components/specforge/SpecForgeWorkspace.tsx
src/components/specforge/SpecForgePictorialDocument.tsx
src/components/specforge/SpecForgeApprovalPanel.tsx
src/components/specforge/SpecForgePlanningPanel.tsx
src/components/specforge/__tests__/specforgeService.test.ts
```

## 2. Add standalone tool registry entry

Modify `src/services/tools/standaloneToolRegistry.ts` and add:

```ts
{
  id: 'specforge-specification-tool',
  label: 'SpecForge Specifications',
  description: 'Interactive pictorial specifications, product schedules, approvals, RFQs, planning and closeout evidence.',
  category: 'Design & Compliance',
  icon: 'FileText',
  tags: ['specification', 'FF&E', 'architectural schedules'],
  roles: ['architect','bep','engineer','quantity_surveyor','energy_professional','fire_engineer','freelancer','contractor','subcontractor','supplier','client','developer','admin'],
  route: 'specforge'
}
```

## 3. Add route/shell

In `src/App.tsx`, add lazy route import:

```ts
const SpecForgeWorkspace = lazyWithChunkRetry(() => import('./components/specforge/SpecForgeWorkspace'));
```

Add canonical page entry near Design & Compliance:

```ts
{ id: 'specforge', label: 'SpecForge Specifications', roles: ['client','developer','bep','architect','engineer','quantity_surveyor','energy_professional','fire_engineer','contractor','subcontractor','supplier','freelancer','admin'], group: 'BEP tools', icon: <FileText size={18} />, summary: 'Interactive pictorial specifications, product schedules, approvals, RFQs, planning and closeout evidence.', backedBy: ['SpecForgeWorkspace','specforgeService'] }
```

## 4. Firestore collections

Use these as first pass:

```text
projects/{projectId}/specWorkspaces/{workspaceId}
projects/{projectId}/specSections/{sectionId}
projects/{projectId}/specItems/{itemId}
projects/{projectId}/specIssues/{issueId}
projects/{projectId}/specApprovals/{approvalId}
projects/{projectId}/specSubstitutions/{substitutionId}
projects/{projectId}/specAuditEvents/{eventId}
```

## 5. Server-side rules/API requirements

Do not rely only on React role gating. Enforce:

- Only author roles can edit draft spec data.
- Issued snapshots are immutable.
- Clients can approve only `clientDecision=true` items.
- Contractor/supplier/subcontractor roles can only see scoped packages.
- Supplier quote data must not expose whole-project commercial data.
- Substitution requests require professional approval before they alter live spec items.

## 6. Cross-workflow speak-back

When spec state changes, write events to:

- ProjectRecords / audit trail
- Inbox / Action Centre
- Risk register for stale/superseded/long-lead items
- FileManager/drawing register for linked documents
- Procurement RFQ package when issued
- Closeout pack for warranties/manuals/O&M

## 7. OpenProject bridge

Keep OpenProject optional. Use it as planning mirror only:

- Architex source of truth: spec data and issued snapshots.
- OpenProject mirror: package task, dates, status, priority.
- Key for upsert: `architexSpecSectionId`.
- Never allow OpenProject to overwrite issued spec snapshots.
