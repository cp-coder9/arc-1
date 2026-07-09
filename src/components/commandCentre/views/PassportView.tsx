/**
 * Project Command Centre — PassportView
 *
 * Subsystem view for the Project Passport, displaying the current project truth:
 * lifecycle phase, health indicators, team, decisions log, and compliance status.
 *
 * Reads from: projects/{projectId}/passport/
 * Follows: Hero → Stat Row → Panels content pattern
 *
 * @module commandCentre/views/PassportView
 * @validates Requirements 2.5, 4.1
 */

interface PassportViewProps {
  projectId: string;
}

export default function PassportView({ projectId }: PassportViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">PROJECT PASSPORT</div>
            <h1>Project Health &amp; Status</h1>
            <p className="sub">
              Lifecycle status · Compliance · Key decisions · Project {projectId}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> Active
          </span>
        </div>
      </div>

      {/* 2. Stat Row */}
      <div className="stat-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>On Track</div>
          <div className="stat-label">Schedule Health</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>Healthy</div>
          <div className="stat-label">Financial Health</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">85%</div>
          <div className="stat-label">Compliance Score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">Stage 5</div>
          <div className="stat-label">Lifecycle Phase</div>
        </div>
      </div>

      {/* 3. Panels */}
      <div className="panel">
        <h2>Milestones &amp; Progress</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Milestone</th>
              <th>Planned</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Foundation Complete</td>
              <td>2025-02-15</td>
              <td><span className="chip chip-approved">Complete</span></td>
            </tr>
            <tr>
              <td>Structural Frame</td>
              <td>2025-04-30</td>
              <td><span className="chip chip-pending">In Progress</span></td>
            </tr>
            <tr>
              <td>Roof Slab</td>
              <td>2025-06-15</td>
              <td><span className="chip chip-draft">Pending</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Key Decisions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Decision</th>
              <th>Date</th>
              <th>Decided By</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Appoint QS firm</td>
              <td>2025-01-10</td>
              <td>Client</td>
              <td><span className="chip chip-approved">Confirmed</span></td>
            </tr>
            <tr>
              <td>Material specification change</td>
              <td>2025-03-05</td>
              <td>Architect</td>
              <td><span className="chip chip-pending">Pending Client</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Compliance Status</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)' }}>
            <span className="dot" style={{ background: 'var(--green)' }}></span> SANS 10400-K
          </span>
          <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)' }}>
            <span className="dot" style={{ background: 'var(--green)' }}></span> SANS 10400-N
          </span>
          <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)' }}>
            <span className="dot" style={{ background: 'var(--amber)' }}></span> SANS 10400-XA
          </span>
          <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)' }}>
            <span className="dot"></span> Municipal Submission
          </span>
        </div>
      </div>
    </div>
  );
}
