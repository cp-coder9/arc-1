import React, { useState } from 'react';
import { AlertTriangle, Flag } from 'lucide-react';
import type { UserProfile } from '@/types';

export interface MaterialTestListProps {
  user: UserProfile;
}

type TestStatus = 'scheduled' | 'sampled' | 'submitted_to_lab' | 'passed' | 'failed';

interface MockMaterialTest {
  id: string;
  sampleId: string;
  materialType: string;
  testMethod: string;
  dateSampled: string;
  dateDue: string;
  lab: string;
  status: TestStatus;
  isOverdue: boolean;
  isPriority: boolean;
}

/** Status chip styling following UI Steering Document semantic colors */
const STATUS_STYLES: Record<TestStatus, React.CSSProperties> = {
  scheduled: {
    color: 'var(--muted)',
    background: 'rgba(16,32,51,.04)',
    borderColor: 'var(--border)',
  },
  sampled: {
    color: 'var(--amber)',
    background: 'rgba(245,166,35,.08)',
    borderColor: 'rgba(245,166,35,.18)',
  },
  submitted_to_lab: {
    color: 'var(--teal)',
    background: 'rgba(25,183,176,.08)',
    borderColor: 'rgba(25,183,176,.18)',
  },
  passed: {
    color: 'var(--green)',
    background: 'rgba(74,222,128,.1)',
    borderColor: 'rgba(74,222,128,.18)',
  },
  failed: {
    color: 'var(--red)',
    background: 'rgba(217,87,71,.08)',
    borderColor: 'rgba(217,87,71,.18)',
  },
};

const STATUS_LABELS: Record<TestStatus, string> = {
  scheduled: 'Scheduled',
  sampled: 'Sampled',
  submitted_to_lab: 'Submitted to Lab',
  passed: 'Passed',
  failed: 'Failed',
};

/** Mock material tests — service wiring in task 17.1 */
const MOCK_TESTS: MockMaterialTest[] = [
  {
    id: 'mt-001',
    sampleId: 'CC-2024-0041',
    materialType: 'Concrete',
    testMethod: 'SANS 3001-GR1',
    dateSampled: '2024-11-15',
    dateDue: '2024-11-22',
    lab: 'Geolab SA',
    status: 'passed',
    isOverdue: false,
    isPriority: false,
  },
  {
    id: 'mt-002',
    sampleId: 'CC-2024-0042',
    materialType: 'Concrete',
    testMethod: 'SANS 3001-GR1',
    dateSampled: '2024-11-18',
    dateDue: '2024-11-25',
    lab: 'ConTest Labs',
    status: 'submitted_to_lab',
    isOverdue: false,
    isPriority: false,
  },
  {
    id: 'mt-003',
    sampleId: 'SC-2024-0012',
    materialType: 'Soil',
    testMethod: 'SANS 3001-GR30',
    dateSampled: '2024-11-10',
    dateDue: '2024-11-17',
    lab: 'Soiltech Testing',
    status: 'failed',
    isOverdue: true,
    isPriority: false,
  },
  {
    id: 'mt-004',
    sampleId: 'CC-2024-0043',
    materialType: 'Concrete',
    testMethod: 'SANS 3001-GR1',
    dateSampled: '2024-11-20',
    dateDue: '2024-11-27',
    lab: 'Geolab SA',
    status: 'sampled',
    isOverdue: false,
    isPriority: true,
  },
  {
    id: 'mt-005',
    sampleId: 'ST-2024-0003',
    materialType: 'Steel',
    testMethod: 'SANS 3001-AG1',
    dateSampled: '2024-11-12',
    dateDue: '2024-11-19',
    lab: 'MetaLab',
    status: 'scheduled',
    isOverdue: true,
    isPriority: false,
  },
];

/**
 * MaterialTestList — Panel listing material tests with status, due dates, and overdue flags.
 *
 * Displays material test records in a table with:
 * - Status chips colored per test lifecycle state
 * - Overdue indicator pill (red) for tests past their due date
 * - Priority flag for 7-day concrete failures
 *
 * Requirements: 5.3, 5.4, 6.4
 */
export default function MaterialTestList({ user: _user }: MaterialTestListProps) {
  const [tests] = useState(MOCK_TESTS);

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', margin: '0 0 16px 0' }}>
        Material Tests
      </h2>

      <table className="table">
        <thead>
          <tr>
            <th>Sample ID</th>
            <th>Material</th>
            <th>Test Method</th>
            <th>Date Sampled</th>
            <th>Date Due</th>
            <th>Lab</th>
            <th>Status</th>
            <th>Flags</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test) => (
            <tr key={test.id}>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {test.sampleId}
              </td>
              <td style={{ fontWeight: 500, color: 'var(--ink)' }}>{test.materialType}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                {test.testMethod}
              </td>
              <td style={{ fontSize: 12 }}>{test.dateSampled}</td>
              <td style={{ fontSize: 12 }}>{test.dateDue}</td>
              <td style={{ fontSize: 12, color: 'var(--muted)' }}>{test.lab}</td>
              <td>
                <span
                  className="pill"
                  style={{
                    ...STATUS_STYLES[test.status],
                    border: `1px solid ${STATUS_STYLES[test.status].borderColor}`,
                    fontSize: 11,
                    padding: '2px 8px',
                  }}
                >
                  {STATUS_LABELS[test.status]}
                </span>
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {test.isOverdue && (
                    <span
                      className="pill"
                      style={{
                        color: 'var(--red)',
                        background: 'rgba(217,87,71,.08)',
                        border: '1px solid rgba(217,87,71,.18)',
                        fontSize: 10,
                        padding: '2px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <AlertTriangle size={10} />
                      Overdue
                    </span>
                  )}
                  {test.isPriority && (
                    <span
                      style={{
                        color: 'var(--amber)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 2,
                      }}
                      title="Priority: 7-day concrete failure flagged"
                    >
                      <Flag size={12} />
                    </span>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {tests.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)' }}>
          <p style={{ fontSize: 13 }}>No material tests recorded yet.</p>
        </div>
      )}
    </section>
  );
}
