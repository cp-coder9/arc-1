/**
 * DASHBOARD WIRING GUIDE
 * 
 * This file demonstrates how to wire orchestration services into any role dashboard.
 * Follow these patterns to integrate the unified project workflow into all 17 role dashboards.
 * 
 * Validates: Requirements 1.1, 1.3, 2.6, 5.4
 */

// ============================================================================
// STEP 1: Add imports
// ============================================================================

// import { useOrchestration, ActionCentrePanel, UnifiedProgrammeView, AIGuideWidget } from '@/services/orchestration';
// import type { ActionItem } from '@/services/orchestration';

// ============================================================================
// STEP 2: Load user's projects from Firestore
// ============================================================================

// In your dashboard component useEffect:
/*
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
*/

// ============================================================================
// STEP 3: Use the orchestration hook
// ============================================================================

// In your component body:
/*
const orchestration = useOrchestration({
  user,
  projects: userProjects || [],
});

if (orchestration.error) {
  console.error('Orchestration error:', orchestration.error);
}
*/

// ============================================================================
// STEP 4: Wire the orchestration services into your dashboard
// ============================================================================

// Example integration layout:
/*
return (
  <div className="space-y-8">
    {/* EXISTING DASHBOARD CONTENT */}
    {/* ...your existing role-specific dashboard content... */}

    {/* NEW: Action Centre panel (top of dashboard or sidebar) */}
    {orchestration.actionItems.length > 0 && (
      <ActionCentrePanel
        ctx={orchestration.ctx!}
        projects={Array.from(orchestration.projectStates.values())}
        compact={true}
        onActionClick={(item: ActionItem) => {
          // Navigate to the action route
          if (item.targetRoute) {
            navigateDashboard(item.targetRoute);
          }
        }}
      />
    )}

    {/* NEW: Unified Programme (shared timeline across all roles) */}
    <UnifiedProgrammeView
      ctx={orchestration.ctx!}
      projectId={selectedProject?.id}
      visibleTasks={orchestration.visibleProgrammeTasks(selectedProject?.id || '')}
      loading={orchestration.loading}
    />

    {/* NEW: AI Guide widget (embedded guidance) */}
    {orchestration.guidance && (
      <AIGuideWidget
        guidance={orchestration.guidance}
        user={user}
      />
    )}
  </div>
);
*/

// ============================================================================
// STEP 5: Connect reads from orchestration.projectStates
// ============================================================================

// Instead of loading project data directly from Firestore:
// OLD WAY:
// const [projectData, setProjectData] = useState<any>(null);
// useEffect(() => {
//   const docRef = doc(db, 'projects', projectId);
//   getDoc(docRef).then(snap => setProjectData(snap.data()));
// }, [projectId]);

// NEW WAY (using single source of truth):
/*
const currentProjectState = orchestration.projectStates.get(projectId);
// currentProjectState.passport contains all reconciled project data
// currentProjectState.records contains all ProjectRecords
// currentProjectState.derivedSources shows provenance of derived fields
*/

// ============================================================================
// STEP 6: Connect writes to orchestration.stateService.writeRecord()
// ============================================================================

// Instead of writing directly to Firestore:
// OLD WAY:
// await updateDoc(doc(db, 'projects', projectId), { status: 'approved' });

// NEW WAY (with reconciliation):
/*
if (!orchestration.stateService) return;

const result = await orchestration.stateService.writeRecord(
  orchestration.ctx!,
  {
    record: {
      // Existing fields
      id: projectId,
      tenantId: orchestration.ctx!.tenantId,
      projectId: projectId,
      // ... other fields
      
      // Updated payload
      payload: { status: 'approved' },
    },
    baseVersion: currentProjectState.records[0]?.audit.revision || 0,
  }
);

if (result.ok) {
  toast.success('Project updated');
  orchestration.reloadProjectState(projectId);
} else {
  if (result.reason === 'conflict') {
    toast.error('Another user updated this project. Please refresh and try again.');
  } else {
    toast.error(result.reason === 'unauthorized' ? 'You are not authorized to make this change' : 'Failed to save');
  }
}
*/

// ============================================================================
// FULL EXAMPLE: Integrated Client Dashboard
// ============================================================================

/*
import React, { useState, useEffect } from 'react';
import { UserProfile, Project } from '@/types';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useOrchestration, ActionCentrePanel, UnifiedProgrammeView, AIGuideWidget } from '@/services/orchestration';
import type { ActionItem } from '@/services/orchestration';
import { toast } from 'sonner';

interface IntegratedDashboardProps {
  user: UserProfile;
  selectedProjectId?: string;
  onNavigate?: (pageId: string) => void;
}

export function IntegratedClientDashboard({ user, selectedProjectId, onNavigate }: IntegratedDashboardProps) {
  const [userProjects, setUserProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Load user's projects
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
      
      // Auto-select first or specified project
      if (selectedProjectId) {
        setSelectedProject(projects.find(p => p.id === selectedProjectId) || null);
      } else if (projects.length > 0) {
        setSelectedProject(projects[0]);
      }
    });
    
    return () => unsubscribe();
  }, [user, selectedProjectId]);

  // Use orchestration services
  const orchestration = useOrchestration({
    user,
    projects: userProjects,
  });

  if (orchestration.error) {
    console.error('Orchestration error:', orchestration.error);
  }

  const currentProjectState = selectedProject 
    ? orchestration.projectStates.get(selectedProject.id)
    : null;

  return (
    <div className="space-y-8">
      {/* Existing Client Dashboard Content */}
      <div className="dashboard-header">
        <h1>Welcome, {user.displayName}</h1>
      </div>

      {/* NEW: Action Centre */}
      {orchestration.ctx && (
        <ActionCentrePanel
          ctx={orchestration.ctx}
          projects={Array.from(orchestration.projectStates.values())}
          compact={true}
          onActionClick={(item: ActionItem) => {
            if (item.targetRoute && onNavigate) {
              onNavigate(item.targetRoute);
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

      {/* Project Summary from unified state of truth */}
      {currentProjectState && (
        <div className="project-summary">
          <h2>Project State (Unified)</h2>
          <p>Current Phase: {currentProjectState.passport.currentPhase}</p>
          <p>Risk Level: {currentProjectState.passport.riskLevel}</p>
          {/* Use currentProjectState.derivedSources to show provenance */}
        </div>
      )}
    </div>
  );
}

export default IntegratedClientDashboard;
*/

// ============================================================================
// SUMMARY
// ============================================================================

// Key integration points for all 17 role dashboards:
// 1. Import useOrchestration hook
// 2. Load user's projects using Firestore query
// 3. Call useOrchestration({ user, projects })
// 4. Add ActionCentrePanel, UnifiedProgrammeView, AIGuideWidget to your JSX
// 5. Replace direct Firestore reads with orchestration.projectStates[projectId]
// 6. Replace direct Firestore writes with orchestration.stateService.writeRecord()
// 7. Use orchestration.reloadProjectState() after writes to sync UI

// This ensures all 17 roles share one project source of truth,
// with reconciled reads, governed writes, and unified action/programme coordination.
