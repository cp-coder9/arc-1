import React, { useMemo, useState } from 'react';
import type { UserProfile } from '@/types';
import type { SubmissionOutcome } from '@/types/municipalWorkspace';
import { calculateApprovalRate } from '@/services/municipal-workspace/outcomeTrackingService';

interface Props {
  user: UserProfile;
}

/** Mock outcomes for demonstration */
const MOCK_OUTCOMES: SubmissionOutcome[] = [
  {
    id: 'outcome-001',
    projectId: 'demo-project',
    municipality: 'COJ',
    submissionType: 'building plan',
    referenceNumber: 'BP/2024/04521',
    submissionDate: '2024-08-12',
    readinessScoreAtSubmission: 94,
    departmentScoresAtSubmission: {
      town_planning: 88,
      building_control: 92,
      fire: 78,
      water_sanitation: 82,
      roads_transport: 75,
      electrical: 80,
      environmental: 70,
      heritage: 85,
    },
    outcome: 'approved_first_time',
    timeToDecision: 42,
    updatedAt: '2024-09-23T10:00:00Z',
  },
  {
    id: 'outcome-002',
    projectId: 'demo-project',
    municipality: 'COJ',
    submissionType: 'building plan',
    referenceNumber: 'BP/2024/03102',
    submissionDate: '2024-05-20',
    readinessScoreAtSubmission: 78,
    departmentScoresAtSubmission: {
      town_planning: 72,
      building_control: 85,
      fire: 65,
      water_sanitation: 60,
      roads_transport: 70,
      electrical: 75,
      environmental: 68,
      heritage: 80,
    },
    outcome: 'returned_for_amendments',
    returnReasons: [
      { department: 'fire', reason: 'Fire escape route width non-compliant with SANS 10400-T' },
      { department: 'water_sanitation', reason: 'Stormwater management plan incomplete' },
    ],
    timeToDecision: 35,
    updatedAt: '2024-06-24T14:30:00Z',
  },
];

const STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  approved_first_time: 'Approved (1st)',
  approved_with_conditions: 'Approved (conditions)',
  returned_for_amendments: 'Returned',
  refused: 'Refused',
};

export default function OutcomeTrackingTab({ user }: Props) {
  const [showForm, setShowForm] = useState(false);

  const stats = useMemo(() => calculateApprovalRate(MOCK_OUTCOMES), []);

  // Compute additional statistics
  const totalSubmissions = MOCK_OUTCOMES.length;
  const returned = MOCK_OUTCOMES.filter(o => o.outcome === 'returned_for_amendments').length;
  const avgTime = MOCK_OUTCOMES.reduce((sum, o) => sum + (o.timeToDecision ?? 0), 0) / (totalSubmissions || 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* First-Time Approval Rate */}
      <section className="panel" style={{ textAlign: 'center', padding: '28px 22px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>
          First-Time Approval Rate
        </div>
        <div style={{ fontSize: 48, fontWeight: 700, color: stats.rate >= 50 ? 'var(--green)' : 'var(--amber)', lineHeight: 1.1 }}>
          {stats.rate}%
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          {stats.firstTime} of {stats.total} terminal submissions approved first time
        </div>
      </section>

      {/* Statistics Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div className="stat-card">
          <div className="stat-value">{totalSubmissions}</div>
          <div className="stat-label">Total Submissions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>{stats.firstTime}</div>
          <div className="stat-label">Approved First Time</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>{returned}</div>
          <div className="stat-label">Returned</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Math.round(avgTime)}</div>
          <div className="stat-label">Avg. Days to Decision</div>
        </div>
      </div>

      {/* Submission Timeline */}
      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>Submission Timeline</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MOCK_OUTCOMES.map((outcome) => (
            <div
              key={outcome.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                    {outcome.referenceNumber}
                  </span>
                  <span
                    className="pill"
                    style={{
                      fontSize: 10,
                      color:
                        outcome.outcome === 'approved_first_time'
                          ? 'var(--green)'
                          : outcome.outcome === 'returned_for_amendments'
                            ? 'var(--amber)'
                            : outcome.outcome === 'refused'
                              ? 'var(--red)'
                              : 'var(--muted)',
                      background:
                        outcome.outcome === 'approved_first_time'
                          ? 'rgba(74,222,128,0.1)'
                          : outcome.outcome === 'returned_for_amendments'
                            ? 'rgba(245,166,35,0.08)'
                            : outcome.outcome === 'refused'
                              ? 'rgba(217,87,71,0.06)'
                              : 'rgba(16,32,51,0.04)',
                      borderColor:
                        outcome.outcome === 'approved_first_time'
                          ? 'rgba(74,222,128,0.18)'
                          : outcome.outcome === 'returned_for_amendments'
                            ? 'rgba(245,166,35,0.18)'
                            : outcome.outcome === 'refused'
                              ? 'rgba(217,87,71,0.18)'
                              : 'var(--border)',
                    }}
                  >
                    {STATUS_LABELS[outcome.outcome] ?? outcome.outcome}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {outcome.submissionType} · Submitted {outcome.submissionDate}
                  {outcome.timeToDecision ? ` · ${outcome.timeToDecision} days to decision` : ''}
                </span>
                {outcome.returnReasons && outcome.returnReasons.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {outcome.returnReasons.map((reason, i) => (
                      <div key={i} style={{ fontSize: 11, color: 'var(--red)', marginTop: 2 }}>
                        • {reason.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                Score: {outcome.readinessScoreAtSubmission}%
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Record Submission Button / Form Concept */}
      {!showForm ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={() => setShowForm(true)}>
            Record Submission
          </button>
        </div>
      ) : (
        <section className="panel">
          <h2 style={{ marginBottom: 12 }}>Record New Submission</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Reference Number</label>
              <input
                type="text"
                placeholder="e.g. BP/2024/05100"
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,0.7)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Submission Date</label>
              <input
                type="date"
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,0.7)',
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Submission Type</label>
              <select
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,0.7)',
                }}
              >
                <option value="building plan">Building Plan</option>
                <option value="occupancy certificate">Occupancy Certificate</option>
                <option value="rezoning">Rezoning</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Municipality</label>
              <select
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,0.7)',
                }}
              >
                <option value="COJ">City of Johannesburg</option>
                <option value="COCT">City of Cape Town</option>
                <option value="Tshwane">City of Tshwane</option>
                <option value="ETH">eThekwini</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button
              className="btn"
              style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.7)', color: 'var(--ink)' }}
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
            <button className="btn" onClick={() => setShowForm(false)}>
              Submit
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
