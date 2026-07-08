import React, { useState, useMemo } from 'react';
import type { UserProfile, MunicipalityType } from '@/types';
import type { LandUseCheckInput, LandUseCheckResult, ZoneDefinition } from '@/types/municipalWorkspace';
import { validateLandUse, listZones } from '@/services/municipal-workspace/landUseSchemeService';

interface Props {
  user: UserProfile;
}

const MUNICIPALITIES: { id: MunicipalityType; label: string }[] = [
  { id: 'COJ', label: 'City of Johannesburg' },
  { id: 'COCT', label: 'City of Cape Town' },
  { id: 'Tshwane', label: 'City of Tshwane' },
  { id: 'ETH', label: 'eThekwini' },
  { id: 'NMB', label: 'Nelson Mandela Bay' },
  { id: 'Ekurhuleni', label: 'City of Ekurhuleni' },
  { id: 'Mangaung', label: 'Mangaung Metro' },
];

const DEFAULT_INPUT: LandUseCheckInput = {
  municipalityId: 'COJ',
  zoneCode: '',
  proposedCoverage: 50,
  proposedFAR: 0.5,
  proposedHeight: 8,
  proposedSetbacks: { front: 3, rear: 3, sides: 1.5 },
  proposedParkingBays: 2,
  proposedLandUse: 'residential',
  grossFloorArea: 200,
  erfArea: 800,
};

export default function LandUseCheckTab({ user }: Props) {
  const [input, setInput] = useState<LandUseCheckInput>(DEFAULT_INPUT);
  const [result, setResult] = useState<LandUseCheckResult | null>(null);

  // Get zones for the selected municipality
  const availableZones: ZoneDefinition[] = useMemo(
    () => listZones(input.municipalityId),
    [input.municipalityId]
  );

  const handleMunicipalityChange = (municipalityId: MunicipalityType) => {
    setInput(prev => ({ ...prev, municipalityId, zoneCode: '' }));
    setResult(null);
  };

  const handleZoneChange = (zoneCode: string) => {
    setInput(prev => ({ ...prev, zoneCode }));
    setResult(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const checkResult = validateLandUse(input);
    setResult(checkResult);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, alignItems: 'start' }}>
      {/* Left Panel: Input Form */}
      <section className="panel">
        <h2 style={{ marginBottom: 14 }}>Land Use Parameters</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Municipality Select */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Municipality</span>
            <select
              value={input.municipalityId}
              onChange={e => handleMunicipalityChange(e.target.value as MunicipalityType)}
              style={selectStyle}
            >
              {MUNICIPALITIES.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </label>

          {/* Zone Code Select */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Zone Code</span>
            <select
              value={input.zoneCode}
              onChange={e => handleZoneChange(e.target.value)}
              style={selectStyle}
            >
              <option value="">Select a zone…</option>
              {availableZones.map(z => (
                <option key={z.id} value={z.zoneCode}>{z.zoneCode} — {z.zoneName}</option>
              ))}
            </select>
          </label>

          {/* Proposed Land Use */}
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Proposed Land Use</span>
            <input
              type="text"
              value={input.proposedLandUse}
              onChange={e => setInput(prev => ({ ...prev, proposedLandUse: e.target.value }))}
              style={inputStyle}
              placeholder="e.g. residential, office, retail"
            />
          </label>

          {/* Coverage & FAR Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Coverage (%)</span>
              <input
                type="number"
                value={input.proposedCoverage}
                onChange={e => setInput(prev => ({ ...prev, proposedCoverage: Number(e.target.value) }))}
                style={inputStyle}
                min={0}
                max={100}
                step={1}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>FAR</span>
              <input
                type="number"
                value={input.proposedFAR}
                onChange={e => setInput(prev => ({ ...prev, proposedFAR: Number(e.target.value) }))}
                style={inputStyle}
                min={0}
                step={0.1}
              />
            </label>
          </div>

          {/* Height & Parking Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Height (m)</span>
              <input
                type="number"
                value={input.proposedHeight}
                onChange={e => setInput(prev => ({ ...prev, proposedHeight: Number(e.target.value) }))}
                style={inputStyle}
                min={0}
                step={0.5}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Parking Bays</span>
              <input
                type="number"
                value={input.proposedParkingBays}
                onChange={e => setInput(prev => ({ ...prev, proposedParkingBays: Number(e.target.value) }))}
                style={inputStyle}
                min={0}
                step={1}
              />
            </label>
          </div>

          {/* Setbacks */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Front BL (m)</span>
              <input
                type="number"
                value={input.proposedSetbacks.front}
                onChange={e => setInput(prev => ({ ...prev, proposedSetbacks: { ...prev.proposedSetbacks, front: Number(e.target.value) } }))}
                style={inputStyle}
                min={0}
                step={0.5}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Rear BL (m)</span>
              <input
                type="number"
                value={input.proposedSetbacks.rear}
                onChange={e => setInput(prev => ({ ...prev, proposedSetbacks: { ...prev.proposedSetbacks, rear: Number(e.target.value) } }))}
                style={inputStyle}
                min={0}
                step={0.5}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Side BL (m)</span>
              <input
                type="number"
                value={input.proposedSetbacks.sides}
                onChange={e => setInput(prev => ({ ...prev, proposedSetbacks: { ...prev.proposedSetbacks, sides: Number(e.target.value) } }))}
                style={inputStyle}
                min={0}
                step={0.5}
              />
            </label>
          </div>

          {/* GFA & Erf Area */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>GFA (m²)</span>
              <input
                type="number"
                value={input.grossFloorArea ?? 0}
                onChange={e => setInput(prev => ({ ...prev, grossFloorArea: Number(e.target.value) }))}
                style={inputStyle}
                min={0}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted)' }}>Erf Area (m²)</span>
              <input
                type="number"
                value={input.erfArea}
                onChange={e => setInput(prev => ({ ...prev, erfArea: Number(e.target.value) }))}
                style={inputStyle}
                min={0}
              />
            </label>
          </div>

          <button
            type="submit"
            className="btn"
            disabled={!input.zoneCode}
            style={{ marginTop: 6, opacity: !input.zoneCode ? 0.5 : 1, cursor: !input.zoneCode ? 'not-allowed' : 'pointer' }}
          >
            Validate Land Use
          </button>
        </form>
      </section>

      {/* Right Panel: Results */}
      <section className="panel">
        <h2 style={{ marginBottom: 14 }}>Check Results</h2>

        {!result && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Select a municipality and zone, then run the validation to see results.</p>
        )}

        {result && result.status === 'zone_not_found' && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.18)' }}>
            <span style={{ color: 'var(--amber)', fontSize: 13 }}>Zone not found. Please verify the zone code against the published scheme document.</span>
          </div>
        )}

        {result && result.status !== 'zone_not_found' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Overall Status Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="pill"
                style={{
                  color: result.status === 'pass' ? 'var(--green)' : 'var(--red)',
                  background: result.status === 'pass' ? 'rgba(74,222,128,0.1)' : 'rgba(217,87,71,0.06)',
                  borderColor: result.status === 'pass' ? 'rgba(74,222,128,0.18)' : 'rgba(217,87,71,0.18)',
                }}
              >
                <span className="dot"></span> {result.status === 'pass' ? 'All Parameters Pass' : 'Non-Compliance Detected'}
              </span>
            </div>

            {/* Zone Info */}
            {result.zone && (
              <div style={{ fontSize: 12, color: 'var(--muted)', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                {result.zone.zoneName} ({result.zone.zoneCode}) — {result.zone.schemeName}
              </div>
            )}

            {/* Parameter Check Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {result.checks.map((check, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '20px 1fr auto',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: check.status === 'pass' ? 'rgba(74,222,128,0.04)' : 'rgba(217,87,71,0.04)',
                    border: `1px solid ${check.status === 'pass' ? 'rgba(74,222,128,0.12)' : 'rgba(217,87,71,0.12)'}`,
                  }}
                >
                  {/* Status Indicator */}
                  <span style={{ color: check.status === 'pass' ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>●</span>

                  {/* Parameter Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{check.parameter}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      Proposed: {check.proposedValue} {check.unit} · Permitted: {check.permittedMax} {check.unit}
                    </span>
                  </div>

                  {/* Excess Badge (if fail) */}
                  {check.status === 'fail' && check.excess != null && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--red)', whiteSpace: 'nowrap' }}>
                      +{check.excess.toFixed(1)} {check.unit} excess
                    </span>
                  )}
                  {check.status === 'pass' && (
                    <span style={{ fontSize: 11, color: 'var(--green)' }}>OK</span>
                  )}
                </div>
              ))}
            </div>

            {/* Consent Uses */}
            {result.consentRequired && (
              <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(245,166,35,0.06)', border: '1px solid rgba(245,166,35,0.14)' }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--amber)', marginBottom: 4 }}>Consent Use Required</div>
                <div style={{ fontSize: 12, color: 'var(--ink)' }}>
                  The proposed use requires special consent for this zone: {result.consentUses.join(', ')}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Shared Inline Styles ───────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'rgba(255,255,255,0.7)',
  fontSize: 13,
  color: 'var(--ink)',
  fontFamily: 'var(--font)',
  outline: 'none',
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23657287' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 28,
};
