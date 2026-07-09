import React, { useState, useMemo } from 'react';
import type { UserProfile } from '@/types';
import { assessWorkspaceReadiness, type WorkspaceAssessment } from '@/services/municipal-workspace/workspaceOrchestratorService';
import type { ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';
import OverviewTab from './OverviewTab';
import LandUseCheckTab from './LandUseCheckTab';
import CirculationSimulatorTab from './CirculationSimulatorTab';
import SubmissionPackTab from './SubmissionPackTab';
import CertificateTab from './CertificateTab';
import OutcomeTrackingTab from './OutcomeTrackingTab';

const ALLOWED_ROLES = ['architect', 'engineer', 'town_planner', 'energy_professional', 'fire_engineer', 'quantity_surveyor', 'platform_admin'];

interface Props {
  user: UserProfile;
  projectId?: string;
}

export default function MunicipalApprovalWorkspace({ user, projectId }: Props) {
  const [activeView, setActiveView] = useState('overview');

  // Role guard
  if (!ALLOWED_ROLES.includes(user.role)) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <h2>Access Restricted</h2>
        <p style={{ color: 'var(--muted)' }}>Your role does not have access to the Municipal Approval Workspace.</p>
      </section>
    );
  }

  // Project context — use mock for now
  const project: ProjectScopeFacts = useMemo(() => ({
    projectId: projectId ?? 'demo-project',
    projectName: 'Select a Project',
    zoningKnown: false,
    occupancyType: 'single_residential',
    alterationToExisting: false,
    additions: false,
    newBuild: false,
    changesLoadBearing: false,
    changesDrainageOrStormwater: false,
    publicAccessOrAssembly: false,
    envelopeEnergyImpact: false,
    coverageOrParkingRisk: false,
    boundaryOrServitudeUnclear: false,
    heritagePotential: false,
    environmentalSensitivity: false,
    trafficImpact: false,
    estimatedConstructionValueZar: 0,
    drawingRegister: [],
    supportingDocuments: [],
  }), [projectId]);

  const assessment = useMemo(() => assessWorkspaceReadiness(project), [project]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'landuse', label: 'Land Use' },
    { id: 'simulation', label: 'Circulation' },
    { id: 'pack', label: 'Submission Pack' },
    { id: 'certificate', label: 'Certificate' },
    { id: 'outcomes', label: 'Outcomes' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Hero Header */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">Municipal Approval Readiness</div>
            <h1>{project.projectName}</h1>
            <p className="sub">{project.municipality ?? 'No municipality'} · Advisory assessment · Professional review required</p>
          </div>
          <span className="pill"><span className="dot"></span> {user.role.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* Advisory Banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.18)', color: 'var(--amber)', fontSize: 12 }}>
        <span>⚠</span>
        <span>All assessments are indicative and advisory only. Professional review required for all regulatory outputs.</span>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 4 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className="btn"
            style={{
              background: activeView === tab.id ? 'var(--aqua)' : 'transparent',
              color: activeView === tab.id ? 'var(--deep)' : 'var(--muted)',
              borderColor: activeView === tab.id ? 'var(--teal)' : 'var(--border)',
              fontWeight: activeView === tab.id ? 600 : 400,
            }}
            onClick={() => setActiveView(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab Content */}
      {activeView === 'overview' && <OverviewTab user={user} assessment={assessment} />}
      {activeView === 'landuse' && <LandUseCheckTab user={user} />}
      {activeView === 'simulation' && <CirculationSimulatorTab user={user} />}
      {activeView === 'pack' && <SubmissionPackTab user={user} />}
      {activeView === 'certificate' && <CertificateTab user={user} />}
      {activeView === 'outcomes' && <OutcomeTrackingTab user={user} />}
    </div>
  );
}
