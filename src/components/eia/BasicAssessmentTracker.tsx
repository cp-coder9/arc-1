// BasicAssessmentTracker — 8-phase BA workflow tracker
// Requirements: 4.1–4.7

import React, { useState } from 'react';
import { Calendar, Hash, AlertTriangle } from 'lucide-react';
import { PhaseTimeline, DeadlineIndicator } from './shared';
import { BA_PHASES, calculateDeadline, calculateElapsedPercentage } from '@/services/eia/eiaAssessmentService';
import type { AssessmentRecord, PhaseRecord, BAPhase } from '@/services/eia/eiaTypes';

export interface BasicAssessmentTrackerProps {
  projectId: string;
  userId: string;
}

/** Formats a phase name for display (snake_case → Title Case) */
function formatPhaseName(phase: string): string {
  return phase
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Creates a mock initial assessment record for BA workflow */
function createInitialAssessment(projectId: string): AssessmentRecord {
  const now = new Date().toISOString();
  const phases: PhaseRecord[] = BA_PHASES.map((def, index) => ({
    phase: def.phase as BAPhase,
    status: index === 0 ? 'active' : 'pending',
    startDate: index === 0 ? now : undefined,
    statutoryDays: def.statutoryDays ?? undefined,
    deadline:
      index === 0 && def.statutoryDays
        ? calculateDeadline(now, def.statutoryDays)
        : undefined,
  }));

  return {
    id: `ba-${projectId}-${Date.now()}`,
    projectId,
    type: 'basic_assessment',
    phases,
    currentPhase: 'application_submission' as BAPhase,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * BasicAssessmentTracker displays the 8-phase Basic Assessment workflow,
 * regulatory deadlines, elapsed percentage for statutory phases, and a
 * form to advance to the next phase.
 */
export function BasicAssessmentTracker({ projectId, userId }: BasicAssessmentTrackerProps) {
  const [assessment, setAssessment] = useState<AssessmentRecord>(() =>
    createInitialAssessment(projectId)
  );
  const [completionDate, setCompletionDate] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const activePhase = assessment.phases.find((p) => p.status === 'active');
  const activePhaseIndex = assessment.phases.findIndex((p) => p.status === 'active');
  const isLastPhase = activePhaseIndex === assessment.phases.length - 1;
  const allComplete = assessment.phases.every((p) => p.status === 'completed');

  // Calculate elapsed info for the active phase
  const elapsedPercentage =
    activePhase?.startDate && activePhase?.statutoryDays
      ? calculateElapsedPercentage(activePhase.startDate, activePhase.statutoryDays)
      : null;

  const elapsedDays =
    activePhase?.startDate && !activePhase?.statutoryDays
      ? Math.max(
          0,
          Math.floor(
            (new Date().getTime() - new Date(activePhase.startDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;

  const isOverdue = elapsedPercentage !== null && elapsedPercentage > 100;

  /** Handles phase completion form submission */
  function handleAdvancePhase(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!completionDate) {
      setError('Completion date is required.');
      return;
    }

    if (!activePhase) {
      setError('No active phase to advance.');
      return;
    }

    // Validate completion date is not before phase start
    if (activePhase.startDate && completionDate < activePhase.startDate.split('T')[0]) {
      setError('Completion date cannot be before the phase start date.');
      return;
    }

    // Validate completion date is not in the future
    const today = new Date().toISOString().split('T')[0];
    if (completionDate > today) {
      setError('Completion date cannot be in the future.');
      return;
    }

    // Complete current phase and activate next
    const updatedPhases = [...assessment.phases];
    updatedPhases[activePhaseIndex] = {
      ...activePhase,
      status: 'completed',
      completionDate,
      referenceNumber: referenceNumber || undefined,
      completedBy: userId,
    };

    // Activate next phase if not last
    if (!isLastPhase) {
      const nextIndex = activePhaseIndex + 1;
      const nextDef = BA_PHASES[nextIndex];
      const nextStartDate = completionDate;
      const deadline = nextDef.statutoryDays
        ? calculateDeadline(nextStartDate, nextDef.statutoryDays)
        : undefined;

      updatedPhases[nextIndex] = {
        ...updatedPhases[nextIndex],
        status: 'active',
        startDate: nextStartDate,
        statutoryDays: nextDef.statutoryDays ?? undefined,
        deadline,
      };
    }

    setAssessment({
      ...assessment,
      phases: updatedPhases,
      currentPhase: isLastPhase
        ? activePhase.phase
        : (updatedPhases[activePhaseIndex + 1].phase as BAPhase),
      updatedAt: new Date().toISOString(),
    });

    // Reset form
    setCompletionDate('');
    setReferenceNumber('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Phase Timeline */}
      <div className="panel">
        <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Basic Assessment Workflow
        </h2>
        <PhaseTimeline
          phases={assessment.phases}
          currentPhase={assessment.currentPhase}
          direction="horizontal"
        />
      </div>

      {/* Active Phase Details */}
      {activePhase && (
        <div className="panel" style={isOverdue ? { borderColor: 'rgba(217,87,71,.18)' } : undefined}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 4 }}>
                Active Phase
              </h2>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', fontFamily: 'var(--font)' }}>
                {formatPhaseName(activePhase.phase)}
              </div>
              {activePhase.startDate && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  Started: {new Date(activePhase.startDate).toLocaleDateString()}
                </div>
              )}
            </div>

            {/* Deadline Indicator */}
            {activePhase.deadline && activePhase.startDate && (
              <DeadlineIndicator
                deadline={activePhase.deadline}
                statutoryDays={activePhase.statutoryDays}
                startDate={activePhase.startDate}
              />
            )}
          </div>

          {/* Elapsed Percentage / Days */}
          <div style={{ marginTop: 14 }}>
            {elapsedPercentage !== null && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font)' }}>
                    Statutory time elapsed
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isOverdue ? 'var(--red)' : elapsedPercentage > 75 ? 'var(--amber)' : 'var(--teal)',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {Math.round(elapsedPercentage)}%
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuenow={Math.min(Math.round(elapsedPercentage), 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${Math.round(elapsedPercentage)}% of statutory time elapsed`}
                  style={{
                    width: '100%',
                    height: 6,
                    borderRadius: 3,
                    background: 'var(--border)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(elapsedPercentage, 100)}%`,
                      height: '100%',
                      borderRadius: 3,
                      background: isOverdue ? 'var(--red)' : elapsedPercentage > 75 ? 'var(--amber)' : 'var(--teal)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
                {isOverdue && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <AlertTriangle size={14} style={{ color: 'var(--red)' }} aria-hidden="true" />
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', fontFamily: 'var(--font)' }}>
                      Phase is overdue — {Math.round(elapsedPercentage - 100)}% past statutory deadline
                    </span>
                  </div>
                )}
              </div>
            )}

            {elapsedDays !== null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calendar size={14} style={{ color: 'var(--muted)' }} aria-hidden="true" />
                <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: 'var(--font)' }}>
                  {elapsedDays} day{elapsedDays === 1 ? '' : 's'} elapsed (no statutory timeframe)
                </span>
              </div>
            )}
          </div>

          {/* Phase Completion Form */}
          {!allComplete && (
            <form onSubmit={handleAdvancePhase} style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <h3 style={{ fontSize: 11, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 10 }}>
                Record Phase Completion
              </h3>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                {/* Date Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label
                    htmlFor="ba-completion-date"
                    style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font)' }}
                  >
                    Completion Date *
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} style={{ color: 'var(--muted)' }} aria-hidden="true" />
                    <input
                      id="ba-completion-date"
                      type="date"
                      value={completionDate}
                      onChange={(e) => setCompletionDate(e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      required
                      style={{
                        fontSize: 13,
                        fontFamily: 'var(--font)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,.7)',
                      }}
                    />
                  </div>
                </div>

                {/* Reference Number Input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label
                    htmlFor="ba-reference-number"
                    style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'var(--font)' }}
                  >
                    Reference Number
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Hash size={14} style={{ color: 'var(--muted)' }} aria-hidden="true" />
                    <input
                      id="ba-reference-number"
                      type="text"
                      value={referenceNumber}
                      onChange={(e) => setReferenceNumber(e.target.value)}
                      maxLength={50}
                      placeholder="e.g. DEA/REF/2024/001"
                      style={{
                        fontSize: 13,
                        fontFamily: 'var(--font)',
                        color: 'var(--ink)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,.7)',
                        minWidth: 180,
                      }}
                    />
                  </div>
                </div>

                <button type="submit" className="btn">
                  Complete Phase
                </button>
              </div>

              {error && (
                <div
                  role="alert"
                  style={{
                    marginTop: 10,
                    fontSize: 12,
                    color: 'var(--red)',
                    fontFamily: 'var(--font)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <AlertTriangle size={13} style={{ color: 'var(--red)' }} aria-hidden="true" />
                  {error}
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {/* All phases complete message */}
      {allComplete && (
        <div className="panel" style={{ borderColor: 'rgba(74,222,128,.18)', background: 'rgba(74,222,128,.04)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)', fontFamily: 'var(--font)' }}>
              ✓ Basic Assessment Complete
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6, fontFamily: 'var(--font)' }}>
            All 8 phases have been completed. The assessment record has been finalized.
          </p>
        </div>
      )}
    </div>
  );
}

export default BasicAssessmentTracker;
