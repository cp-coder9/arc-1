import React, { useMemo } from 'react';
import type { UserProfile } from '@/types';
import type { ProjectScopeFacts } from '@/types/municipalSubmissionReadiness';
import { assembleSubmissionPack } from '@/services/municipal-workspace/submissionPackService';

interface Props {
  user: UserProfile;
}

/** Mock project with realistic data to demonstrate submission pack assembly */
const MOCK_PROJECT: ProjectScopeFacts = {
  projectId: 'demo-pack-project',
  projectName: 'Greenfield Mixed-Use Development',
  municipality: 'COJ',
  erfNumber: 'ERF 4521/2024',
  zoningKnown: true,
  occupancyType: 'mixed_use',
  alterationToExisting: false,
  additions: false,
  newBuild: true,
  changesLoadBearing: true,
  changesDrainageOrStormwater: true,
  publicAccessOrAssembly: true,
  envelopeEnergyImpact: true,
  coverageOrParkingRisk: true,
  boundaryOrServitudeUnclear: false,
  heritagePotential: false,
  environmentalSensitivity: false,
  trafficImpact: true,
  estimatedConstructionValueZar: 18500000,
  drawingRegister: [
    { kind: 'site_plan', revision: 'A', status: 'signed_off' },
    { kind: 'floor_plan', revision: 'B', status: 'signed_off' },
    { kind: 'elevation', revision: 'B', status: 'checked' },
    { kind: 'section', revision: 'A', status: 'draft' },
    { kind: 'fire_plan', revision: 'A', status: 'signed_off' },
    { kind: 'structural_drawing', revision: 'C', status: 'signed_off' },
    { kind: 'energy_calculation', revision: 'A', status: 'signed_off' },
  ],
  supportingDocuments: [
    { kind: 'title_deed', status: 'available' },
    { kind: 'appointment_record', status: 'available' },
  ],
};

export default function SubmissionPackTab({ user }: Props) {
  const pack = useMemo(() => assembleSubmissionPack(MOCK_PROJECT, 'COJ', 'building plan'), []);

  const sortedDocs = useMemo(
    () => [...pack.documents].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [pack.documents]
  );

  const hasMissing = pack.completeness.missing > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Completeness Score */}
      <section className="panel" style={{ textAlign: 'center', padding: '24px 22px' }}>
        <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--muted)', marginBottom: 6 }}>
          Pack Completeness
        </div>
        <div style={{ fontSize: 36, fontWeight: 700, color: hasMissing ? 'var(--amber)' : 'var(--green)', lineHeight: 1.1 }}>
          {pack.completeness.included}/{pack.completeness.total}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
          documents included
        </div>
      </section>

      {/* Document List */}
      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>Document List</h2>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>Document</th>
              <th>Source</th>
              <th style={{ width: 100 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedDocs.map((doc) => (
              <tr key={doc.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  {doc.sequenceNumber}
                </td>
                <td style={{ fontSize: 13 }}>{doc.title}</td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {doc.sourceRef ?? (doc.prePopulated ? 'auto-populated' : '—')}
                </td>
                <td>
                  <span
                    className="pill"
                    style={{
                      fontSize: 10,
                      color:
                        doc.status === 'included'
                          ? 'var(--green)'
                          : doc.status === 'draft_only'
                            ? 'var(--amber)'
                            : 'var(--red)',
                      background:
                        doc.status === 'included'
                          ? 'rgba(74,222,128,0.1)'
                          : doc.status === 'draft_only'
                            ? 'rgba(245,166,35,0.08)'
                            : 'rgba(217,87,71,0.06)',
                      borderColor:
                        doc.status === 'included'
                          ? 'rgba(74,222,128,0.18)'
                          : doc.status === 'draft_only'
                            ? 'rgba(245,166,35,0.18)'
                            : 'rgba(217,87,71,0.18)',
                    }}
                  >
                    {doc.status === 'included' ? 'Included' : doc.status === 'draft_only' ? 'Draft' : 'Missing'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Cross-Reference Validation */}
      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>Cross-Reference Validation</h2>
        {pack.crossReferenceErrors.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0' }}>
            <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>
            <span style={{ fontSize: 13, color: 'var(--ink)' }}>All cross-references validated successfully</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pack.crossReferenceErrors.map((error, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(217,87,71,0.06)',
                  border: '1px solid rgba(217,87,71,0.18)',
                }}
              >
                <span style={{ color: 'var(--red)', fontSize: 14 }}>✗</span>
                <span style={{ fontSize: 12, color: 'var(--ink)' }}>{error}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Export Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn"
          disabled={hasMissing}
          style={{
            opacity: hasMissing ? 0.5 : 1,
            cursor: hasMissing ? 'not-allowed' : 'pointer',
          }}
        >
          Export Submission Pack
        </button>
      </div>
    </div>
  );
}
