import React, { useMemo, useState } from 'react';
import type { UserProfile } from '@/types';
import type { ProfessionalSignOff } from '@/types/municipalWorkspace';
import { checkCertificatePrerequisites, generateCertificate } from '@/services/municipal-workspace/certificateService';

interface Props {
  user: UserProfile;
}

/** Mock sign-offs — 2 verified, 1 pending */
const MOCK_SIGN_OFFS: ProfessionalSignOff[] = [
  {
    discipline: 'Architect',
    professionalName: 'Thabo Mokoena',
    registrationNumber: 'SACAP-2019/04521',
    registrationBody: 'SACAP',
    signedAt: '2024-11-15T09:30:00Z',
    declaration: 'I confirm that all architectural drawings comply with SANS 10400 requirements.',
    verified: true,
  },
  {
    discipline: 'Structural Engineer',
    professionalName: 'Sarah van der Merwe',
    registrationNumber: 'ECSA-20150312',
    registrationBody: 'ECSA',
    signedAt: '2024-11-14T14:00:00Z',
    declaration: 'I confirm structural design compliance with SANS 10160 and SANS 10100.',
    verified: true,
  },
  {
    discipline: 'Town Planner',
    professionalName: 'Ahmed Patel',
    registrationNumber: 'SACPLAN-A/1087/2018',
    registrationBody: 'SACPLAN',
    signedAt: '',
    declaration: '',
    verified: false,
  },
];

/** Mock department assessments for prerequisite check */
const MOCK_DEPARTMENT_SCORES = [
  { departmentId: 'town_planning' as const, departmentName: 'Town Planning', confidenceScore: 82, status: 'pass' as const, checksTotal: 5, checksPassed: 4, dataGaps: [], actionItems: [] },
  { departmentId: 'building_control' as const, departmentName: 'Building Control', confidenceScore: 91, status: 'pass' as const, checksTotal: 8, checksPassed: 7, dataGaps: [], actionItems: [] },
  { departmentId: 'fire' as const, departmentName: 'Fire Department', confidenceScore: 75, status: 'pass' as const, checksTotal: 4, checksPassed: 3, dataGaps: [], actionItems: [] },
  { departmentId: 'water_sanitation' as const, departmentName: 'Water & Sanitation', confidenceScore: 68, status: 'attention' as const, checksTotal: 6, checksPassed: 4, dataGaps: ['Stormwater management plan'], actionItems: ['Submit drainage layout'] },
];

export default function CertificateTab({ user }: Props) {
  const [certificate, setCertificate] = useState<ReturnType<typeof generateCertificate> | null>(null);

  // Run prerequisite check
  const prerequisites = useMemo(() => {
    return checkCertificatePrerequisites(
      85, // readiness score (not 100 — to demonstrate unmet condition)
      MOCK_SIGN_OFFS,
      { total: 14, included: 12, missing: 2 },
      MOCK_DEPARTMENT_SCORES
    );
  }, []);

  // Individual prerequisite checklist items
  const checklist = useMemo(() => [
    {
      label: 'Readiness Score = 100%',
      passed: !prerequisites.unmetConditions.some(c => c.includes('Readiness score')),
    },
    {
      label: 'All Professional Sign-offs Collected',
      passed: !prerequisites.unmetConditions.some(c => c.includes('sign-off')),
    },
    {
      label: 'Submission Pack Complete (0 missing)',
      passed: !prerequisites.unmetConditions.some(c => c.includes('missing from submission')),
    },
    {
      label: 'All Department Scores ≥ 70%',
      passed: !prerequisites.unmetConditions.some(c => c.includes('below 70%')),
    },
  ], [prerequisites]);

  const handleGenerate = () => {
    if (!prerequisites.ready) return;
    const cert = generateCertificate(
      'demo-project',
      'Greenfield Mixed-Use Development',
      'ERF 4521/2024',
      'COJ',
      100,
      {
        town_planning: 82,
        building_control: 91,
        fire: 75,
        water_sanitation: 78,
        roads_transport: 72,
        electrical: 80,
        environmental: 70,
        heritage: 85,
      },
      MOCK_SIGN_OFFS.filter(s => s.verified)
    );
    setCertificate(cert);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Prerequisites Checklist */}
      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>Prerequisites Checklist</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {checklist.map((item, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                borderRadius: 10,
                background: item.passed ? 'rgba(74,222,128,0.06)' : 'rgba(217,87,71,0.04)',
                border: `1px solid ${item.passed ? 'rgba(74,222,128,0.18)' : 'rgba(217,87,71,0.14)'}`,
              }}
            >
              <span style={{ fontSize: 15, color: item.passed ? 'var(--green)' : 'var(--red)' }}>
                {item.passed ? '✓' : '✗'}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Professional Sign-off Status */}
      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>Professional Sign-offs</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MOCK_SIGN_OFFS.map((signOff, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                  {signOff.discipline}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {signOff.professionalName} · {signOff.registrationBody} {signOff.registrationNumber}
                </span>
              </div>
              <span
                className="pill"
                style={{
                  fontSize: 10,
                  color: signOff.verified ? 'var(--green)' : 'var(--amber)',
                  background: signOff.verified ? 'rgba(74,222,128,0.1)' : 'rgba(245,166,35,0.08)',
                  borderColor: signOff.verified ? 'rgba(74,222,128,0.18)' : 'rgba(245,166,35,0.18)',
                }}
              >
                {signOff.verified ? 'Signed' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Generate Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          className="btn"
          disabled={!prerequisites.ready}
          onClick={handleGenerate}
          style={{
            opacity: prerequisites.ready ? 1 : 0.5,
            cursor: prerequisites.ready ? 'pointer' : 'not-allowed',
          }}
        >
          Generate Municipal-Ready Certificate
        </button>
      </div>

      {/* Generated Certificate Display */}
      {certificate && (
        <section className="panel" style={{ borderColor: 'rgba(74,222,128,0.18)', background: 'rgba(74,222,128,0.04)' }}>
          <h2 style={{ marginBottom: 12, color: 'var(--green)' }}>Certificate Generated</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Certificate Number</div>
              <div style={{ fontSize: 14, fontWeight: 600, fontFamily: 'monospace', color: 'var(--ink)' }}>{certificate.certificateNumber}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>Issued</div>
              <div style={{ fontSize: 14, color: 'var(--ink)' }}>{new Date(certificate.issuedAt).toLocaleDateString()}</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', padding: '10px 12px', borderRadius: 8, background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.14)', marginTop: 8 }}>
            <strong style={{ color: 'var(--amber)' }}>Advisory:</strong> {certificate.advisoryDisclaimer}
          </div>
        </section>
      )}
    </div>
  );
}
