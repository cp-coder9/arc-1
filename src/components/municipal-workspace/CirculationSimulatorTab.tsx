import React, { useState, useMemo } from 'react';
import type { UserProfile } from '@/types';
import type { DepartmentAssessment, CirculationSimulationResult } from '@/types/municipalWorkspace';
import type { ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';
import { simulateCirculation } from '@/services/municipal-workspace/circulationSimulatorService';
import { validateLandUse } from '@/services/municipal-workspace/landUseSchemeService';

interface Props {
  user: UserProfile;
}

// Sample project data for demonstration
const SAMPLE_PROJECT: ProjectScopeFacts = {
  projectId: 'demo-circulation',
  projectName: 'Mixed-Use Development',
  municipality: 'COJ',
  zoningKnown: true,
  occupancyType: 'mixed_use',
  alterationToExisting: false,
  additions: false,
  newBuild: true,
  changesLoadBearing: true,
  changesDrainageOrStormwater: true,
  publicAccessOrAssembly: true,
  envelopeEnergyImpact: true,
  coverageOrParkingRisk: true,
  boundaryOrServitudeUnclear: false,
  heritagePotential: false,
  environmentalSensitivity: false,
  trafficImpact: true,
  estimatedConstructionValueZar: 12_000_000,
  drawingRegister: [
    { kind: 'site_plan', revision: 'A', status: 'signed_off' },
    { kind: 'floor_plan', revision: 'B', status: 'checked' },
    { kind: 'elevation', revision: 'A', status: 'signed_off' },
    { kind: 'section', revision: 'A', status: 'draft' },
    { kind: 'fire_plan', revision: 'A', status: 'checked' },
    { kind: 'structural_drawing', revision: 'C', status: 'signed_off' },
    { kind: 'drainage_layout', revision: 'A', status: 'signed_off' },
    { kind: 'energy_calculation', revision: 'A', status: 'draft' },
  ],
  supportingDocuments: [
    { kind: 'title_deed', status: 'available' },
    { kind: 'zoning_certificate', status: 'available' },
    { kind: 'client_authority', status: 'available' },
    { kind: 'appointment_record', status: 'available' },
    { kind: 'traffic_comment', status: 'missing' },
  ],
};

export default function CirculationSimulatorTab({ user }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Run simulation with sample project
  const simulation: CirculationSimulationResult = useMemo(() => {
    const landUseResult = validateLandUse({
      municipalityId: 'COJ',
      zoneCode: 'GB1',
      proposedCoverage: 70,
      proposedFAR: 2.5,
      proposedHeight: 18,
      proposedSetbacks: { front: 4, rear: 3, sides: 0 },
      proposedParkingBays: 40,
      proposedLandUse: 'office',
      grossFloorArea: 3000,
      erfArea: 2000,
    });

    return simulateCirculation(
      SAMPLE_PROJECT,
      landUseResult,
      { score: 62, readyForProfessionalSubmissionReview: false, blockers: [], checks: [], categoryScores: {} as any }
    );
  }, []);

  const toggleExpanded = (deptId: string) => {
    setExpanded(prev => prev === deptId ? null : deptId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Overall Confidence Header */}
      <section className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px' }}>
        <div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Overall Circulation Confidence</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: getScoreColor(simulation.overallConfidence), lineHeight: 1.2 }}>
            {simulation.overallConfidence}%
          </div>
        </div>
        <span
          className="pill"
          style={{
            color: getScoreColor(simulation.overallConfidence),
            background: getScoreBg(simulation.overallConfidence),
            borderColor: getScoreBorder(simulation.overallConfidence),
          }}
        >
          <span className="dot"></span>
          {simulation.overallConfidence >= 70 ? 'Ready' : simulation.overallConfidence >= 40 ? 'Attention Needed' : 'Not Ready'}
        </span>
      </section>

      {/* Department Bars */}
      <section className="panel">
        <h2 style={{ marginBottom: 14 }}>Department Assessments</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {simulation.departments.map(dept => (
            <DepartmentBar
              key={dept.departmentId}
              department={dept}
              isExpanded={expanded === dept.departmentId}
              onToggle={() => toggleExpanded(dept.departmentId)}
            />
          ))}
        </div>
      </section>

      {/* Advisory Disclaimer */}
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '10px 14px', borderRadius: 8, background: 'rgba(16,32,51,0.02)', border: '1px solid var(--border)' }}>
        {simulation.advisoryNotice}
      </div>
    </div>
  );
}

// ── Department Bar Component ───────────────────────────────────────────────────

interface DepartmentBarProps {
  key?: React.Key;
  department: DepartmentAssessment;
  isExpanded: boolean;
  onToggle: () => void;
}

function DepartmentBar({ department, isExpanded, onToggle }: DepartmentBarProps) {
  const score = department.confidenceScore;
  const color = getScoreColor(score);
  const hasActions = department.actionItems.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Bar Row */}
      <div
        style={{ display: 'grid', gridTemplateColumns: '140px 1fr 50px 90px', alignItems: 'center', gap: 10, padding: '8px 0', cursor: hasActions ? 'pointer' : 'default' }}
        onClick={hasActions ? onToggle : undefined}
      >
        {/* Department Name */}
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {department.departmentName}
        </span>

        {/* Horizontal Bar */}
        <div style={{ position: 'relative', height: 20, borderRadius: 10, background: 'rgba(16,32,51,0.04)', overflow: 'hidden' }}>
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.min(score, 100)}%`,
              borderRadius: 10,
              background: color,
              opacity: 0.7,
              transition: 'width 0.3s ease',
            }}
          />
        </div>

        {/* Score Text */}
        <span style={{ fontSize: 13, fontWeight: 600, color, textAlign: 'right' }}>
          {score}%
        </span>

        {/* Status Badge */}
        <span
          className="pill"
          style={{
            fontSize: 10,
            color,
            background: getScoreBg(score),
            borderColor: getScoreBorder(score),
          }}
        >
          {getStatusLabel(department.status)}
        </span>
      </div>

      {/* Expandable Action Items */}
      {isExpanded && hasActions && (
        <div style={{ marginLeft: 150, marginBottom: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(16,32,51,0.02)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 6 }}>Action Items</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {department.actionItems.map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: 'var(--ink)' }}>
                <span style={{ color: 'var(--amber)', lineHeight: 1.4 }}>→</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
          {department.dataGaps.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)', marginBottom: 4 }}>Data Gaps</div>
              {department.dataGaps.map((gap, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 11, color: 'var(--muted)' }}>
                  <span>○</span>
                  <span>{gap}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 70) return 'var(--green)';
  if (score >= 40) return 'var(--amber)';
  return 'var(--red)';
}

function getScoreBg(score: number): string {
  if (score >= 70) return 'rgba(74,222,128,0.1)';
  if (score >= 40) return 'rgba(245,166,35,0.08)';
  return 'rgba(217,87,71,0.06)';
}

function getScoreBorder(score: number): string {
  if (score >= 70) return 'rgba(74,222,128,0.18)';
  if (score >= 40) return 'rgba(245,166,35,0.18)';
  return 'rgba(217,87,71,0.18)';
}

function getStatusLabel(status: DepartmentAssessment['status']): string {
  switch (status) {
    case 'pass': return 'Pass';
    case 'attention': return 'Attention';
    case 'fail': return 'Fail';
    case 'insufficient_data': return 'No Data';
    default: return status;
  }
}
