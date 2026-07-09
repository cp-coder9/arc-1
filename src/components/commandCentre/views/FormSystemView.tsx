/**
 * Project Command Centre — FormSystemView
 *
 * Subsystem view for the Form System, displaying form templates, submissions,
 * and completion status for the active project.
 *
 * Follows: Hero → Stat Row → Panels content pattern
 *
 * @module commandCentre/views/FormSystemView
 * @validates Requirements 2.5, 4.1
 */

interface FormSystemViewProps {
  projectId: string;
}

export default function FormSystemView({ projectId }: FormSystemViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 1. Hero */}
      <div className="hero">
        <div className="hero-header">
          <div>
            <div className="eyebrow">FORM SYSTEM</div>
            <h1>Project Forms</h1>
            <p className="sub">
              Submissions · Templates · Compliance forms · Project {projectId}
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
          <div className="stat-value">12</div>
          <div className="stat-label">Total Forms</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--green)' }}>8</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--amber)' }}>3</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--red)' }}>1</div>
          <div className="stat-label">Overdue</div>
        </div>
      </div>

      {/* 3. Panels */}
      <div className="panel">
        <h2>Active Form Submissions</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Form</th>
              <th>Category</th>
              <th>Assignee</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Site Safety Inspection</td>
              <td>H&amp;S</td>
              <td>Site Manager</td>
              <td>2025-02-20</td>
              <td><span className="chip chip-pending">Pending</span></td>
            </tr>
            <tr>
              <td>Material Delivery Receipt</td>
              <td>Procurement</td>
              <td>QS</td>
              <td>2025-02-18</td>
              <td><span className="chip chip-approved">Complete</span></td>
            </tr>
            <tr>
              <td>Variation Order Request</td>
              <td>Commercial</td>
              <td>Architect</td>
              <td>2025-02-15</td>
              <td><span className="chip chip-rejected">Overdue</span></td>
            </tr>
            <tr>
              <td>Concrete Test Certificate</td>
              <td>Quality</td>
              <td>Engineer</td>
              <td>2025-02-22</td>
              <td><span className="chip chip-pending">Pending</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Form Templates</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {[
            'Site Inspection',
            'Material Receipt',
            'Variation Order',
            'Test Certificate',
            'Progress Report',
            'Safety Audit',
            'Handover Checklist',
            'Defects Report',
          ].map((template) => (
            <span key={template} className="mini-tile">
              <span>◈</span> {template}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
