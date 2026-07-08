import React from 'react';
import type { UserProfile } from '@/types';
import type { WorkspaceAssessment } from '@/services/municipal-workspace/workspaceOrchestratorService';

interface Props {
  user: UserProfile;
  assessment: WorkspaceAssessment;
}

export default function OverviewTab({ user, assessment }: Props) {
  const { readiness, circulation, pack } = assessment;
  const score = readiness.readiness.score;
  const blockers = readiness.readiness.blockers;
  const complexity = readiness.complexity.complexity;
  const departments = circulation.departments;
  const packCompleteness = pack.completeness;

  // Determine score color
  const scoreColor = score >= 70 ? 'var(--green)' : score >= 40 ? 'var(--amber)' : 'var(--red)';

  // Department sign-off count
  const passingDepts = departments.filter(d => d.status === 'pass').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Readiness Score Hero */}
      <section className="panel" style={{ textAlign: 'center', padding: '28px 22px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>Overall Readiness Score</div>
        <div style={{ fontSize: 48, fontWeight: 700, color: scoreColor, lineHeight: 1.1 }}>{score}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>out of 100</div>
      </section>

      {/* Stat Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: packCompleteness.missing === 0 ? 'var(--green)' : 'var(--amber)' }}>
            {packCompleteness.included}/{packCompleteness.total}
          </div>
          <div className="stat-label">Pack Completeness</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: circulation.overallConfidence >= 70 ? 'var(--green)' : circulation.overallConfidence >= 40 ? 'var(--amber)' : 'var(--red)' }}>
            {circulation.overallConfidence}%
          </div>
          <div className="stat-label">Circulation Confidence</div>
        </div>

        <div className="stat-card">
          <div className="stat-value">{departments.length}</div>
          <div className="stat-label">Departments</div>
        </div>

        <div className="stat-card">
          <div className="stat-value" style={{ color: blockers.length > 0 ? 'var(--red)' : 'var(--green)' }}>
            {blockers.length}
          </div>
          <div className="stat-label">Blockers</div>
        </div>
      </div>

      {/* Blockers List */}
      {blockers.length > 0 && (
        <section className="panel">
          <h2 style={{ marginBottom: 10 }}>Blockers</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {blockers.map((blocker, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(217,87,71,0.06)', border: '1px solid rgba(217,87,71,0.18)' }}>
                <span style={{ color: 'var(--red)', fontSize: 14 }}>●</span>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{blocker}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Complexity & Team Routing */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Complexity Classification */}
        <section className="panel">
          <h2 style={{ marginBottom: 10 }}>Complexity</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="pill"
              style={{
                color: complexity === 'high' ? 'var(--red)' : complexity === 'medium' ? 'var(--amber)' : 'var(--green)',
                background: complexity === 'high' ? 'rgba(217,87,71,0.08)' : complexity === 'medium' ? 'rgba(245,166,35,0.08)' : 'rgba(74,222,128,0.1)',
                borderColor: complexity === 'high' ? 'rgba(217,87,71,0.18)' : complexity === 'medium' ? 'rgba(245,166,35,0.18)' : 'rgba(74,222,128,0.18)',
              }}
            >
              <span className="dot"></span> {complexity}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>classification</span>
          </div>
        </section>

        {/* Team Routing */}
        <section className="panel">
          <h2 style={{ marginBottom: 10 }}>Department Sign-offs</h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: passingDepts === departments.length ? 'var(--green)' : 'var(--amber)' }}>
              {passingDepts}
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>/ {departments.length} passing</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {departments.map(dept => (
              <span
                key={dept.departmentId}
                className="pill"
                style={{
                  fontSize: 10,
                  color: dept.status === 'pass' ? 'var(--green)' : dept.status === 'attention' ? 'var(--amber)' : dept.status === 'fail' ? 'var(--red)' : 'var(--muted)',
                  background: dept.status === 'pass' ? 'rgba(74,222,128,0.1)' : dept.status === 'attention' ? 'rgba(245,166,35,0.08)' : dept.status === 'fail' ? 'rgba(217,87,71,0.06)' : 'rgba(16,32,51,0.04)',
                  borderColor: dept.status === 'pass' ? 'rgba(74,222,128,0.18)' : dept.status === 'attention' ? 'rgba(245,166,35,0.18)' : dept.status === 'fail' ? 'rgba(217,87,71,0.18)' : 'var(--border)',
                }}
              >
                {dept.departmentName}
              </span>
            ))}
          </div>
        </section>
      </div>

      {/* Advisory Footer */}
      <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>
        This assessment is indicative only. All outputs require professional review before submission to any authority.
      </div>
    </div>
  );
}
