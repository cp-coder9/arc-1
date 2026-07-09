/**
 * Project Command Centre — AuditTrailView
 *
 * Subsystem view for the Project Audit Trail, showing a chronological record
 * of all actions, status changes, and decisions made on the project.
 *
 * Reads from: projects/{projectId}/passport_audit/
 * Follows: Hero → Stat Row → Panels content pattern
 *
 * @module commandCentre/views/AuditTrailView
 * @validates Requirements 2.5, 4.1
 */

interface AuditTrailViewProps {
  projectId: string;
}

export default function AuditTrailView({ projectId }: AuditTrailViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">AUDIT TRAIL</div>
            <h1>Project Audit Log</h1>
            <p className="sub">
              Complete history · Actions · Decisions · Project {projectId}
            </p>
          </div>
        </div>
        <div className="hero-pills">
          <span className="pill">
            <span className="dot"></span> Live
          </span>
        </div>
      </div>

      {/* 2. Stat Row */}
      <div className="stat-row" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div className="stat-card">
          <div className="stat-value">156</div>
          <div className="stat-label">Total Records</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">24</div>
          <div className="stat-label">This Week</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">8</div>
          <div className="stat-label">Team Members</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">5</div>
          <div className="stat-label">Action Types</div>
        </div>
      </div>

      {/* 3. Panels */}
      <div className="panel">
        <h2>Recent Audit Entries</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Entity</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                2025-02-18 14:32
              </td>
              <td>John Smith</td>
              <td>Status Change</td>
              <td>Task #T-042</td>
              <td><span className="chip chip-approved">update</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                2025-02-18 13:15
              </td>
              <td>Sarah Chen</td>
              <td>Created</td>
              <td>NCR #NCR-007</td>
              <td><span className="chip chip-draft">create</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                2025-02-18 11:00
              </td>
              <td>Mike Wilson</td>
              <td>Certified</td>
              <td>Payment Cert #5</td>
              <td><span className="chip chip-approved">status_change</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                2025-02-17 16:45
              </td>
              <td>Amy Johnson</td>
              <td>Escalated</td>
              <td>Risk #R-012</td>
              <td><span className="chip chip-pending">escalation</span></td>
            </tr>
            <tr>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                2025-02-17 09:20
              </td>
              <td>David Lee</td>
              <td>Deleted</td>
              <td>Snag #S-089</td>
              <td><span className="chip chip-rejected">delete</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Filters</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <span className="pill">
            <span className="dot"></span> All Actions
          </span>
          <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)' }}>
            Creates
          </span>
          <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)' }}>
            Updates
          </span>
          <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)' }}>
            Deletes
          </span>
          <span className="pill" style={{ color: 'var(--muted)', background: 'rgba(16,32,51,.04)' }}>
            Escalations
          </span>
        </div>
      </div>
    </div>
  );
}
