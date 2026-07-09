import React from 'react';
import type { UserProfile } from '@/types';
import type { ITP, InspectionItem, ITPStatus, ConstructionStage } from '@/services/itpTypes';
import InspectionItemsTable from './InspectionItemsTable';

export interface ITPDetailViewProps {
  user: UserProfile;
}

// ── Mock data — service wiring in task 17.1 ──

const MOCK_ITP: ITP = {
  id: 'itp-001',
  projectId: 'proj-001',
  title: 'Foundation Concrete Works',
  description: 'Inspection test plan covering all concrete placement and curing activities for the foundation stage, including rebar inspection, formwork checks, and concrete strength testing.',
  constructionStage: 'foundations',
  revisionNumber: 2,
  status: 'in_progress',
  createdBy: 'user-001',
  approvedBy: 'user-002',
  approvedAt: '2026-06-20T10:00:00Z',
  createdAt: '2026-06-01T08:00:00Z',
  updatedAt: '2026-06-25T14:30:00Z',
  isDeleted: false,
};

const MOCK_ITEMS: InspectionItem[] = [
  {
    id: 'item-001',
    itpId: 'itp-001',
    projectId: 'proj-001',
    sequenceNumber: 1,
    title: 'Excavation level verification',
    description: 'Verify excavation reaches correct founding level per structural drawings.',
    inspectionType: 'hold_point',
    acceptanceCriteria: 'Founding level within ±25mm of design level across all measured points.',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 10400 clause 4.2.1',
    linkedMaterialTestIds: [],
    status: 'passed',
    createdAt: '2026-06-02T08:00:00Z',
    updatedAt: '2026-06-15T09:00:00Z',
  },
  {
    id: 'item-002',
    itpId: 'itp-001',
    projectId: 'proj-001',
    sequenceNumber: 2,
    title: 'Rebar placement inspection before pour',
    description: 'Inspect reinforcement placement, cover, and spacing prior to concrete pour.',
    inspectionType: 'hold_point',
    acceptanceCriteria: 'Rebar spacing ±10mm, cover ≥40mm, all laps and ties per drawing.',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 10100-1 clause 8.4',
    specificationCategory: 'structural',
    linkedMaterialTestIds: ['test-001'],
    status: 'in_progress',
    createdAt: '2026-06-02T08:00:00Z',
    updatedAt: '2026-06-25T14:30:00Z',
  },
  {
    id: 'item-003',
    itpId: 'itp-001',
    projectId: 'proj-001',
    sequenceNumber: 3,
    title: 'DPC membrane continuity check',
    description: 'Verify DPC membrane is continuous and properly lapped at all joints.',
    inspectionType: 'hold_point',
    acceptanceCriteria: 'DPC continuous with minimum 150mm laps, no punctures or tears.',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 10400 clause 4.3.2',
    linkedMaterialTestIds: [],
    status: 'failed',
    ncrId: 'NCR-0042',
    createdAt: '2026-06-02T08:00:00Z',
    updatedAt: '2026-06-22T11:00:00Z',
  },
  {
    id: 'item-004',
    itpId: 'itp-001',
    projectId: 'proj-001',
    sequenceNumber: 4,
    title: 'Concrete cube test at 7 days',
    description: 'Witness concrete cube sampling and verify 7-day strength results.',
    inspectionType: 'witness_point',
    acceptanceCriteria: '7-day cube strength ≥ 67% of 28-day design strength.',
    responsibleInspectorRole: 'engineer',
    specificationReference: 'SANS 3001-GR1 clause 6.1',
    linkedMaterialTestIds: ['test-002', 'test-003'],
    status: 'passed',
    createdAt: '2026-06-02T08:00:00Z',
    updatedAt: '2026-06-18T16:00:00Z',
  },
  {
    id: 'item-005',
    itpId: 'itp-001',
    projectId: 'proj-001',
    sequenceNumber: 5,
    title: 'Formwork alignment surveillance',
    description: 'Check formwork alignment, bracing, and dimensional accuracy.',
    inspectionType: 'surveillance',
    acceptanceCriteria: 'Formwork within ±5mm of design dimensions, bracing secure.',
    responsibleInspectorRole: 'site_manager',
    specificationReference: 'NHBRC-2.4',
    linkedMaterialTestIds: [],
    status: 'conditional',
    createdAt: '2026-06-02T08:00:00Z',
    updatedAt: '2026-06-20T10:00:00Z',
  },
  {
    id: 'item-006',
    itpId: 'itp-001',
    projectId: 'proj-001',
    sequenceNumber: 6,
    title: 'Concrete placement and vibration',
    description: 'Monitor concrete placement method and vibration technique.',
    inspectionType: 'surveillance',
    acceptanceCriteria: 'No cold joints, proper vibration without segregation.',
    responsibleInspectorRole: 'site_manager',
    specificationReference: 'SANS 10100-2 clause 9.2',
    linkedMaterialTestIds: [],
    status: 'pending',
    createdAt: '2026-06-02T08:00:00Z',
    updatedAt: '2026-06-02T08:00:00Z',
  },
];

// ── Helpers ──

function getStatusChipClass(status: ITPStatus): string {
  switch (status) {
    case 'approved':
    case 'completed':
      return 'chip chip-approved';
    case 'draft':
      return 'chip chip-draft';
    case 'in_progress':
      return 'chip chip-needs_decision';
    case 'superseded':
    case 'deleted':
      return 'chip chip-rejected';
    default:
      return 'chip chip-draft';
  }
}

function formatStage(stage: ConstructionStage): string {
  return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * ITPDetailView — Single ITP detail panel showing metadata, progress,
 * and the full inspection items table.
 *
 * Requirements: 1.3, 2.1, 7.5
 */
export default function ITPDetailView({ user }: ITPDetailViewProps) {
  const itp = MOCK_ITP;
  const items = MOCK_ITEMS;

  const passedCount = items.filter((i) =>
    ['passed', 'conditional_accepted', 'ncr_resolved'].includes(i.status)
  ).length;
  const progress = items.length > 0 ? Math.round((passedCount / items.length) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Metadata Panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>
              {itp.title}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, maxWidth: 600 }}>
              {itp.description}
            </p>
          </div>
          <span className={getStatusChipClass(itp.status)}>
            {itp.status.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Metadata row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em' }}>
              Stage
            </span>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: '2px 0 0' }}>
              {formatStage(itp.constructionStage)}
            </p>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em' }}>
              Revision
            </span>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: '2px 0 0', fontFamily: 'monospace' }}>
              R{itp.revisionNumber}
            </p>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em' }}>
              Approved By
            </span>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: '2px 0 0' }}>
              {itp.approvedBy ?? '—'}
            </p>
          </div>
          <div>
            <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em' }}>
              Items
            </span>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)', margin: '2px 0 0' }}>
              {items.length}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--deep)' }}>Progress</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: progress === 100 ? 'var(--green)' : 'var(--teal)' }}>
              {passedCount}/{items.length} ({progress}%)
            </span>
          </div>
          <div
            style={{
              height: 8,
              borderRadius: 4,
              background: 'var(--border)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: 4,
                background: progress === 100 ? 'var(--green)' : 'var(--teal)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </section>

      {/* Inspection Items Table */}
      <section className="panel">
        <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--deep)', marginBottom: 14 }}>
          Inspection Items
        </h2>
        <InspectionItemsTable user={user} items={items} />
      </section>
    </div>
  );
}
