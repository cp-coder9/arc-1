# Unified Project Workflow Orchestration — Wiring Guide

This guide explains how to integrate the orchestration services into all 17 role dashboards so they share one unified project source of truth.

## Overview

The orchestration layer unifies the disparate role dashboards by:
1. **Single project source of truth** — All roles read from and write to `ProjectPassport` + `ProjectRecord` set via `projectStateService`
2. **Action Centre** — Unified inbox that drives workflow across all roles
3. **Unified Programme** — Shared timeline/Gantt visible to all appointed roles
4. **AI Guide** — Embedded recommendations at the dashboard level
5. **Cross-role handoffs** — Governed transfers with obligations and audit trails
6. **Lifecycle coordination** — Phase advancement gates and record progression

## Integration Pattern

### Step 1: Import the orchestration hook

```typescript
import { useOrchestration, ActionCentrePanel, UnifiedProgrammeView, AIGuideWidget } from '@/services/orchestration';
import type { ActionItem } from '@/services/orchestration';
```

### Step 2: Load user's projects

In your dashboard component, load the projects the user is appointed to:

```typescript
useEffect(() => {
  if (!user) return;
  
  const q = query(
    collection(db, 'projects'),
    where('roles', 'array-contains', user.role),
    where('tenantId', '==', user.tenantId),
  );
  
  const unsubscribe = onSnapshot(q, (snapshot) => {
    const projects = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Project));
    setUserProjects(projects);
  });
  
  return () => unsubscribe();
}, [user]);
```

### Step 3: Call useOrchestration hook

```typescript
const orchestration = useOrchestration({
  user,
  projects: userProjects || [],
});

if (orchestration.error) {
  console.error('Orchestration error:', orchestration.error);
}
```

### Step 4: Render orchestration UI surfaces

Add the three orchestration components to your dashboard:

```typescript
return (
  <div className="space-y-8">
    {/* Existing dashboard content */}
    
    {/* NEW: Action Centre */}
    {orchestration.ctx && orchestration.actionItems.length > 0 && (
      <ActionCentrePanel
        ctx={orchestration.ctx}
        projects={Array.from(orchestration.projectStates.values())}
        compact={true}
        onActionClick={(item: ActionItem) => {
          if (item.targetRoute) {
            navigateDashboard(item.targetRoute);
          }
        }}
      />
    )}

    {/* NEW: Unified Programme */}
    {orchestration.ctx && selectedProject && (
      <UnifiedProgrammeView
        ctx={orchestration.ctx}
        projectId={selectedProject.id}
        visibleTasks={orchestration.visibleProgrammeTasks(selectedProject.id)}
        loading={orchestration.loading}
      />
    )}

    {/* NEW: AI Guide Widget */}
    {orchestration.guidance && orchestration.ctx && (
      <AIGuideWidget
        guidance={orchestration.guidance}
        user={user}
      />
    )}
  </div>
);
```

### Step 5: Use orchestration.projectStates for reads

Instead of loading project data directly from Firestore:

**OLD WAY** (per-role silos):
```typescript
const [projectData, setProjectData] = useState<any>(null);
useEffect(() => {
  const docRef = doc(db, 'projects', projectId);
  getDoc(docRef).then(snap => setProjectData(snap.data()));
}, [projectId]);
```

**NEW WAY** (unified source of truth):
```typescript
const currentProjectState = orchestration.projectStates.get(projectId);
// currentProjectState.passport — all reconciled project data
// currentProjectState.records — all ProjectRecords
// currentProjectState.derivedSources — provenance of derived fields

// Display project phase
<p>Current Phase: {currentProjectState?.passport.currentPhase}</p>
```

### Step 6: Use orchestration.stateService for writes

Instead of writing directly to Firestore:

**OLD WAY** (per-role silos):
```typescript
await updateDoc(doc(db, 'projects', projectId), { status: 'approved' });
```

**NEW WAY** (with reconciliation + conflict detection):
```typescript
if (!orchestration.stateService || !orchestration.ctx) return;

const currentRecord = orchestration.projectStates.get(projectId)?.records[0];
if (!currentRecord) return;

const result = await orchestration.stateService.writeRecord(
  orchestration.ctx,
  {
    record: {
      ...currentRecord,
      payload: { status: 'approved' },
    },
    baseVersion: currentRecord.audit.revision,
  }
);

if (result.ok) {
  toast.success('Project updated');
  orchestration.reloadProjectState(projectId);
} else if (result.reason === 'conflict') {
  toast.error('Another user updated this project. Please refresh and try again.');
} else {
  toast.error('Failed to save');
}
```

## Dashboards to Integrate (All 17 Roles)

Update the following dashboards to use orchestration services:

1. **ClientDashboard.tsx** — Client project oversight
2. **ArchitectDashboard.tsx** — Architect design leadership
3. **BEPDashboard.tsx** — BEP multi-discipline coordination
4. **EngineerDashboard.tsx** — Structural/civil engineering
5. **QuantitySurveyorDashboard.tsx** — Cost/commercial governance
6. **TownPlannerDashboard.tsx** — Urban planning sign-off
7. **EnergyProfessionalDashboard.tsx** — SANS 10400-XA compliance
8. **FireEngineerDashboard.tsx** — Fire safety design
9. **ContractorDashboard.tsx** — Construction programme/site
10. **SubcontractorDashboard.tsx** — Package delivery/evidence
11. **SupplierDashboard.tsx** — Material/product delivery
12. **FreelancerDashboard.tsx** — Independent work assignment
13. **DeveloperDashboard.tsx** — Property development coordination
14. **FirmAdminDashboard.tsx** — Firm/organization admin
15. **AdminDashboard.tsx** — Platform governance
16. **SiteManagerDashboard.tsx** — Construction site management
17. **PlatformAdminDashboard.tsx** — System administration

## File Locations & Updates

### New Files (Already Created)
- `src/services/orchestration/index.ts` — Main export
- `src/services/orchestration/orchestrationTypes.ts` — Shared types
- `src/services/orchestration/hooks/useOrchestrationServices.ts` — React hook
- `src/services/orchestration/context/OrchestrationProvider.tsx` — React Context
- `src/components/ActionCentrePanel.tsx` — Action Centre UI
- `src/components/UnifiedProgrammeView.tsx` — Programme/Gantt UI
- `src/components/AIGuideWidget.tsx` — AI Guide UI

### Existing Files to Update
- `src/App.tsx` — Wrap dashboard area with OrchestrationProvider or use hook
- `src/components/ClientDashboard.tsx` — Add orchestration integration
- `src/components/ArchitectDashboard.tsx` — Add orchestration integration
- `src/components/BEPDashboard.tsx` — Add orchestration integration
- _...and 14 other dashboards_

## Routing & Navigation

The `ActionCentrePanel` component handles navigation via the `onActionClick` callback:

```typescript
<ActionCentrePanel
  ctx={orchestration.ctx!}
  projects={Array.from(orchestration.projectStates.values())}
  onActionClick={(item: ActionItem) => {
    if (item.targetRoute) {
      navigateDashboard(item.targetRoute);
    }
  }}
/>
```

The `targetRoute` corresponds to dashboard page IDs defined in `App.tsx`:
- `'command'` — Command Centre
- `'tasks'` — Tasks & Approvals
- `'programme'` — Programme / Gantt
- `'payments'` — Payments & Governance
- _...etc._

## Authorization & Tenant Isolation

All orchestration operations are automatically tenant-scoped and role-gated:

```typescript
// Automatically checked in all orchestration methods:
// 1. Tenant match (user.tenantId vs. record.tenantId)
// 2. Role entitlement (user.role vs. required roles for action)
// 3. HumanGate qualification (for sensitive actions)
// 4. Audit trail recording (every operation)

// On authorization failure, the operation is denied and audited:
if (!orchestration.ctx) {
  throw new Error('Authorization context not available');
}
```

## Error Handling

Orchestration methods return explicit result types, not exceptions:

```typescript
interface WriteResult<T> {
  ok: true;
  record: ProjectRecord<T>;
  version: number;
}
| {
  ok: false;
  reason: 'conflict' | 'save_failed' | 'unauthorized';
  currentValue?: ProjectRecord;
  retainedInput?: any;
}

// Always check result.ok before proceeding:
const result = await orchestration.stateService.writeRecord(...);
if (!result.ok) {
  switch (result.reason) {
    case 'conflict':
      // Another user modified the record
      break;
    case 'save_failed':
      // Network or Firestore error
      break;
    case 'unauthorized':
      // User not qualified for this action
      break;
  }
}
```

## Performance & Resilience

### 3-Second Load Budget (R1.1)
- `projectStateService.loadProjectState()` returns within 3 seconds at 95th percentile
- Falls back to cached/stale data on timeout
- Surfaces clear "data loading" or "data stale" indicators

### 5-Second Propagation Budget (R2.1)
- Derived field updates propagate across dashboards within 5 seconds
- Marks fields as stale if propagation exceeds budget
- Continues rendering with stale indicators rather than blocking

### 10-Second AI Timeout (R6.10)
- AI guidance generation times out after 10 seconds
- Dashboard renders without guidance rather than blocking
- Shows "guidance temporarily unavailable" instead of error

### Graceful Degradation
- Action Centre renders even if AI is slow
- Programme renders even if propagation lags
- Each surface can degrade independently

## Testing & Verification

### Property-Based Tests
All orchestration services are tested with fast-check property-based tests:
- `npm test -- src/services/orchestration/` — Run all orchestration tests
- Tests validate 34 properties across 42 scenarios
- ≥100 iterations per property

### Integration Tests
- `npm test -- src/components/__tests__/` — Dashboard component tests
- Verify ActionCentrePanel, UnifiedProgrammeView, AIGuideWidget render correctly
- Verify orchestration context is properly provided and consumed

### End-to-End Tests
- `npm run test:e2e` — Playwright E2E tests
- Verify cross-role workflows work end-to-end
- Verify reconciliation works across multiple users

## Deployment Checklist

- [ ] All 17 dashboards updated with orchestration integration
- [ ] ActionCentrePanel renders in each dashboard
- [ ] UnifiedProgrammeView renders in each dashboard
- [ ] AIGuideWidget renders in each dashboard
- [ ] All reads use `orchestration.projectStates`
- [ ] All writes use `orchestration.stateService.writeRecord()`
- [ ] Navigation callbacks properly wired
- [ ] Authorization context properly set
- [ ] Tenant isolation verified (Firestore rules + accessControlService)
- [ ] `npm run lint` passes (zero tsc errors)
- [ ] `npm test` passes (all tests green)
- [ ] `npm run build` passes (zero build errors)

## Troubleshooting

### "Authorization context not available"
- Ensure user is authenticated
- Ensure user.tenantId is set
- Check OrchestrationProvider is wrapping your dashboard

### "Another user updated this project"
- This is a concurrency conflict (expected behavior)
- Call `orchestration.reloadProjectState(projectId)` to get latest
- Prompt user to review and resubmit

### Action items not appearing
- Check `orchestration.actionItems` is populated
- Verify `projectStates` has records (not empty)
- Check browser console for errors in `actionCentreService`

### Programme tasks not visible
- Check `orchestration.visibleProgrammeTasks(projectId)` returns items
- Verify user's role is included in task.responsibleRole
- Check Firestore rules allow role-based visibility

## Questions?

Refer to the design document:
- `src/.kiro/specs/unified-project-workflow-orchestration/design.md`
- `src/.kiro/specs/unified-project-workflow-orchestration/requirements.md`

Or check the implementation examples:
- `src/components/dashboard-wiring-guide.tsx` — Full code example
- `src/components/ActionCentrePanel.tsx` — Action Centre implementation
- `src/components/UnifiedProgrammeView.tsx` — Programme implementation
- `src/components/AIGuideWidget.tsx` — AI Guide implementation
