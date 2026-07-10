// FullEIATracker — Full Scoping & EIA 12-phase workflow tracker
// with specialist studies panel, phase validation, and deadline tracking.
// Requirements: 5.1–5.7

import React, { useState, useMemo } from 'react';
import { AlertCircle, Plus, Clock } from 'lucide-react';
import { PhaseTimeline, DeadlineIndicator } from './shared';
import { FULL_EIA_PHASES } from '@/services/eia/eiaAssessmentService';
import type {
  AssessmentRecord,
  FullEIAPhase,
  PhaseRecord,
  SpecialistStudy,
  SpecialistStudyType,
  SpecialistStudyStatus,
} from '@/services/eia/eiaTypes';

export interface FullEIATrackerProps {
  projectId: string;
  userId: string;
}

const SPECIALIST_STUDY_TYPES: SpecialistStudyType[] = [
  'ecological',
  'heritage',
  'geotechnical',
  'traffic',
  'visual',
  'noise',
  'socio-economic',
  'agricultural',
];

const STATUS_COLORS: Record<SpecialistStudyStatus, { color: string; bg: string; border: string }> = {
  appointed: {
    color: 'var(--teal)',
    bg: 'rgba(25,183,176,.08)',
    border: 'rgba(25,183,176,.18)',
  },
  in_progress: {
    color: 'var(--amber)',
    bg: 'rgba(245,166,35,.08)',
    border: 'rgba(245,166,35,.18)',
  },
  draft_complete: {
    color: 'var(--deep)',
    bg: 'rgba(22,126,121,.08)',
    border: 'rgba(22,126,121,.18)',
  },
  final: {
    color: 'var(--green)',
    bg: 'rgba(74,222,128,.1)',
    border: 'rgba(74,222,128,.18)',
  },
};

/** Format snake_case to Title Case */
function formatLabel(value: string): string {
  return value
    .split(/[_-]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Calculate days elapsed since a given ISO date */
function daysElapsed(dateStr: string): number {
  const start = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

/** Check if a study is a blocker (required but not appointed within 7 days) */
function isStudyBlocker(study: SpecialistStudy): boolean {
  if (study.appointedDate) return false;
  const required = new Date(study.requiredDate);
  const now = new Date();
  const daysSinceRequired = Math.floor(
    (now.getTime() - required.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceRequired >= 7;
}

/**
 * FullEIATracker renders the 12-phase Full Scoping & EIA workflow with
 * specialist studies management, phase transition validation, deadline
 * tracking, and blocker indicators.
 */
export function FullEIATracker({ projectId, userId }: FullEIATrackerProps) {
  // Mock AssessmentRecord for Full EIA
  const [assessment, setAssessment] = useState<AssessmentRecord>(() => {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 10);

    const phases: PhaseRecord[] = FULL_EIA_PHASES.map((def, idx) => {
      if (idx === 0) {
        return {
          phase: def.phase as FullEIAPhase,
          status: 'completed' as const,
          startDate: new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          completionDate: new Date(startDate.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString(),
          statutoryDays: def.statutoryDays ?? undefined,
        };
      }
      if (idx === 1) {
        const phaseStart = new Date(startDate.getTime() - 25 * 24 * 60 * 60 * 1000).toISOString();
        return {
          phase: def.phase as FullEIAPhase,
          status: 'completed' as const,
          startDate: phaseStart,
          completionDate: new Date(startDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          statutoryDays: def.statutoryDays ?? undefined,
          deadline: def.statutoryDays
            ? new Date(new Date(phaseStart).getTime() + def.statutoryDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
        };
      }
      if (idx === 2) {
        return {
          phase: def.phase as FullEIAPhase,
          status: 'active' as const,
          startDate: startDate.toISOString(),
          statutoryDays: def.statutoryDays ?? undefined,
          deadline: def.statutoryDays
            ? new Date(startDate.getTime() + def.statutoryDays * 24 * 60 * 60 * 1000).toISOString()
            : undefined,
        };
      }
      return {
        phase: def.phase as FullEIAPhase,
        status: 'pending' as const,
        statutoryDays: def.statutoryDays ?? undefined,
      };
    });

    return {
      id: `assessment-fulleia-${projectId}`,
      projectId,
      type: 'full_scoping_eia',
      phases,
      currentPhase: 'scoping_preparation' as FullEIAPhase,
      specialistStudies: [
        {
          id: 'ss-1',
          studyType: 'ecological',
          specialistName: 'Dr. N. Mthembu',
          registrationBody: 'SACNASP',
          registrationNumber: 'REG-2024-001',
          status: 'in_progress',
          requiredDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          appointedDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'ss-2',
          studyType: 'heritage',
          specialistName: 'Prof. J. van der Merwe',
          registrationBody: 'ASAPA',
          registrationNumber: 'HER-2024-045',
          status: 'appointed',
          requiredDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          appointedDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        },
        {
          id: 'ss-3',
          studyType: 'traffic',
          specialistName: '',
          status: 'appointed',
          requiredDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          // No appointedDate — will trigger blocker after 7 days
        },
      ],
      createdAt: startDate.toISOString(),
      updatedAt: new Date().toISOString(),
    };
  });

  // Add study form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudy, setNewStudy] = useState({
    studyType: 'ecological' as SpecialistStudyType,
    specialistName: '',
    registrationBody: '',
    registrationNumber: '',
  });

  // Check for blocker studies
  const blockerStudies = useMemo(() => {
    return (assessment.specialistStudies ?? []).filter(isStudyBlocker);
  }, [assessment.specialistStudies]);

  // Check if all specialist studies are final (for EIR phase validation)
  const allStudiesFinal = useMemo(() => {
    const studies = assessment.specialistStudies ?? [];
    return studies.length > 0 && studies.every((s) => s.status === 'final');
  }, [assessment.specialistStudies]);

  // Active phase info
  const activePhase = assessment.phases.find((p) => p.status === 'active');

  // Handle adding a new specialist study
  function handleAddStudy() {
    if (!newStudy.specialistName.trim()) return;

    const study: SpecialistStudy = {
      id: `ss-${Date.now()}`,
      studyType: newStudy.studyType,
      specialistName: newStudy.specialistName.trim(),
      registrationBody: newStudy.registrationBody.trim() || undefined,
      registrationNumber: newStudy.registrationNumber.trim() || undefined,
      status: 'appointed',
      requiredDate: new Date().toISOString(),
      appointedDate: new Date().toISOString(),
    };

    setAssessment((prev) => ({
      ...prev,
      specialistStudies: [...(prev.specialistStudies ?? []), study],
      updatedAt: new Date().toISOString(),
    }));

    setNewStudy({
      studyType: 'ecological',
      specialistName: '',
      registrationBody: '',
      registrationNumber: '',
    });
    setShowAddForm(false);
  }

  // Handle updating study status
  function handleStatusChange(studyId: string, newStatus: SpecialistStudyStatus) {
    setAssessment((prev) => ({
      ...prev,
      specialistStudies: (prev.specialistStudies ?? []).map((s) =>
        s.id === studyId ? { ...s, status: newStatus } : s
      ),
      updatedAt: new Date().toISOString(),
    }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Blocker Alert */}
      {blockerStudies.length > 0 && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 16px',
            borderRadius: 12,
            background: 'rgba(217,87,71,.06)',
            border: '1px solid rgba(217,87,71,.18)',
          }}
        >
          <AlertCircle size={16} style={{ color: 'var(--red)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
            BLOCKER: {blockerStudies.length} specialist{' '}
            {blockerStudies.length === 1 ? 'study' : 'studies'} required but not appointed within 7
            days
          </span>
          <span
            className="pill"
            style={{
              fontSize: 9,
              marginLeft: 'auto',
              color: 'var(--red)',
              background: 'rgba(217,87,71,.06)',
              borderColor: 'rgba(217,87,71,.18)',
            }}
          >
            Action Required
          </span>
        </div>
      )}

      {/* Phase Timeline Panel */}
      <section className="panel">
        <h2
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--deep)',
            marginBottom: 14,
          }}
        >
          Full EIA Workflow — 12 Phases
        </h2>
        <PhaseTimeline
          phases={assessment.phases}
          currentPhase={assessment.currentPhase}
          direction="horizontal"
        />

        {/* Deadline and elapsed time for active phase */}
        {activePhase && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginTop: 14,
              paddingTop: 14,
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={14} style={{ color: 'var(--muted)' }} aria-hidden="true" />
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Current: <strong style={{ color: 'var(--ink)' }}>{formatLabel(activePhase.phase)}</strong>
              </span>
            </div>

            {activePhase.deadline && activePhase.startDate && (
              <DeadlineIndicator
                deadline={activePhase.deadline}
                statutoryDays={activePhase.statutoryDays}
                startDate={activePhase.startDate}
              />
            )}

            {!activePhase.deadline && activePhase.startDate && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Elapsed: <strong style={{ color: 'var(--ink)' }}>{daysElapsed(activePhase.startDate)} days</strong>{' '}
                (no statutory timeframe)
              </span>
            )}
          </div>
        )}

        {/* Phase transition validation notice */}
        {assessment.currentPhase === 'eir_preparation' && !allStudiesFinal && (
          <div
            style={{
              marginTop: 10,
              padding: '8px 12px',
              borderRadius: 8,
              background: 'rgba(245,166,35,.06)',
              border: '1px solid rgba(245,166,35,.18)',
              fontSize: 11,
              color: 'var(--amber)',
            }}
          >
            ⚠ All specialist studies must have status "final" before advancing to EIR Public
            Participation.
          </div>
        )}
      </section>

      {/* Specialist Studies Panel */}
      <section className="panel">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              color: 'var(--deep)',
            }}
          >
            Specialist Studies
          </h2>
          <button
            className="btn"
            onClick={() => setShowAddForm(!showAddForm)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={14} aria-hidden="true" />
            Add Study
          </button>
        </div>

        {/* Add Study Form */}
        {showAddForm && (
          <div
            style={{
              padding: 14,
              marginBottom: 14,
              borderRadius: 12,
              background: 'rgba(223,245,242,.3)',
              border: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                marginBottom: 10,
              }}
            >
              <div>
                <label
                  style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}
                >
                  Study Type
                </label>
                <select
                  value={newStudy.studyType}
                  onChange={(e) =>
                    setNewStudy((prev) => ({
                      ...prev,
                      studyType: e.target.value as SpecialistStudyType,
                    }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontFamily: 'var(--font)',
                    color: 'var(--ink)',
                    background: 'var(--white)',
                  }}
                >
                  {SPECIALIST_STUDY_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {formatLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}
                >
                  Specialist Name
                </label>
                <input
                  type="text"
                  value={newStudy.specialistName}
                  onChange={(e) =>
                    setNewStudy((prev) => ({ ...prev, specialistName: e.target.value }))
                  }
                  placeholder="Dr. A. Specialist"
                  maxLength={200}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontFamily: 'var(--font)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}
                >
                  Registration Body
                </label>
                <input
                  type="text"
                  value={newStudy.registrationBody}
                  onChange={(e) =>
                    setNewStudy((prev) => ({ ...prev, registrationBody: e.target.value }))
                  }
                  placeholder="e.g. SACNASP"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontFamily: 'var(--font)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}
                >
                  Registration Number
                </label>
                <input
                  type="text"
                  value={newStudy.registrationNumber}
                  onChange={(e) =>
                    setNewStudy((prev) => ({ ...prev, registrationNumber: e.target.value }))
                  }
                  placeholder="e.g. REG-2024-001"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontFamily: 'var(--font)',
                    color: 'var(--ink)',
                  }}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={handleAddStudy}>
                Save Study
              </button>
              <button
                className="btn"
                onClick={() => setShowAddForm(false)}
                style={{
                  borderColor: 'var(--border)',
                  background: 'rgba(255,255,255,.7)',
                  color: 'var(--ink)',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Studies Table */}
        {(assessment.specialistStudies ?? []).length > 0 ? (
          <table className="table">
            <thead>
              <tr>
                <th>Study Type</th>
                <th>Specialist</th>
                <th>Registration</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(assessment.specialistStudies ?? []).map((study) => {
                const statusStyle = STATUS_COLORS[study.status];
                const blocker = isStudyBlocker(study);

                return (
                  <tr key={study.id}>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 500 }}>
                        {formatLabel(study.studyType)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: study.specialistName ? 'var(--ink)' : 'var(--muted)' }}>
                        {study.specialistName || '— Unassigned'}
                      </span>
                    </td>
                    <td>
                      {study.registrationBody ? (
                        <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)' }}>
                          {study.registrationBody} / {study.registrationNumber ?? '—'}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="pill"
                        style={{
                          fontSize: 9,
                          color: blocker ? 'var(--red)' : statusStyle.color,
                          background: blocker ? 'rgba(217,87,71,.06)' : statusStyle.bg,
                          borderColor: blocker ? 'rgba(217,87,71,.18)' : statusStyle.border,
                        }}
                      >
                        {blocker ? 'BLOCKER' : formatLabel(study.status)}
                      </span>
                    </td>
                    <td>
                      {study.status !== 'final' && (
                        <select
                          value={study.status}
                          onChange={(e) =>
                            handleStatusChange(study.id, e.target.value as SpecialistStudyStatus)
                          }
                          style={{
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            fontSize: 11,
                            fontFamily: 'var(--font)',
                            color: 'var(--ink)',
                            background: 'var(--white)',
                          }}
                        >
                          <option value="appointed">Appointed</option>
                          <option value="in_progress">In Progress</option>
                          <option value="draft_complete">Draft Complete</option>
                          <option value="final">Final</option>
                        </select>
                      )}
                      {study.status === 'final' && (
                        <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
                          ✓ Complete
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div
            style={{
              textAlign: 'center',
              padding: '24px 14px',
              color: 'var(--muted)',
              fontSize: 12,
            }}
          >
            No specialist studies recorded. Add a study to begin tracking.
          </div>
        )}
      </section>
    </div>
  );
}

export default FullEIATracker;
