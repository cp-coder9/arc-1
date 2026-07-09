import React, { useState } from 'react';
import { Plus, Edit, Eye } from 'lucide-react';
import type { UserProfile } from '@/types';

export interface TestingScheduleTabProps {
  user: UserProfile;
}

/** Mock testing schedule data — service wiring in task 17.1 */
const MOCK_SCHEDULES = [
  {
    id: 'sched-001',
    materialType: 'Concrete',
    sansTestMethod: 'SANS 3001-GR1',
    frequency: '1 per 50m³',
    threshold: '≥ 25 MPa',
    stage: 'Foundations',
    approvedLabs: 'Geolab SA, ConTest Labs',
  },
  {
    id: 'sched-002',
    materialType: 'Soil',
    sansTestMethod: 'SANS 3001-GR30',
    frequency: '1 per 500m²',
    threshold: '≥ 93%',
    stage: 'Earthworks',
    approvedLabs: 'Soiltech Testing',
  },
  {
    id: 'sched-003',
    materialType: 'Steel',
    sansTestMethod: 'SANS 3001-AG1',
    frequency: '1 per 20 tonnes',
    threshold: '≥ 450 MPa',
    stage: 'Superstructure',
    approvedLabs: 'MetaLab, SA Steel Testing',
  },
  {
    id: 'sched-004',
    materialType: 'Aggregate',
    sansTestMethod: 'SANS 3001-AG2',
    frequency: '1 per 100m³',
    threshold: '≤ 12%',
    stage: 'Foundations',
    approvedLabs: 'Geolab SA',
  },
];

/**
 * TestingScheduleTab — Material testing schedule management panel.
 *
 * Displays schedules in a table with SANS test methods, thresholds,
 * and approved laboratories. Supports create/edit/view actions.
 *
 * Requirements: 5.1, 5.2
 */
export default function TestingScheduleTab({ user }: TestingScheduleTabProps) {
  const [schedules] = useState(MOCK_SCHEDULES);

  const canCreate = user.role === 'engineer' || user.role === 'architect';

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', margin: 0 }}>
          Testing Schedules
        </h2>
        {canCreate && (
          <button className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} />
            Create Schedule
          </button>
        )}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Material Type</th>
            <th>SANS Test Method</th>
            <th>Frequency</th>
            <th>Threshold</th>
            <th>Stage</th>
            <th>Approved Labs</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {schedules.map((schedule) => (
            <tr key={schedule.id}>
              <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{schedule.materialType}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {schedule.sansTestMethod}
              </td>
              <td>{schedule.frequency}</td>
              <td style={{ fontWeight: 500 }}>{schedule.threshold}</td>
              <td>{schedule.stage}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{schedule.approvedLabs}</td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  {canCreate && (
                    <button
                      className="btn"
                      style={{ padding: '4px 8px', height: 28, fontSize: 11 }}
                      title="Edit schedule"
                    >
                      <Edit size={12} />
                    </button>
                  )}
                  <button
                    className="btn"
                    style={{ padding: '4px 8px', height: 28, fontSize: 11 }}
                    title="View schedule"
                  >
                    <Eye size={12} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {schedules.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          <p style={{ fontSize: 13 }}>No testing schedules defined yet.</p>
          {canCreate && (
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Click &quot;Create Schedule&quot; to add the first SANS 3001 testing schedule.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
