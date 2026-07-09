// GreenBuildingPanel — Green Star SA + EDGE + Net Zero tracking
// Requirements: 9.1–9.8, 10.1–10.9, 11.1–11.7

import React, { useState, useMemo } from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

import type {
  Credit,
  CreditCategory,
  RatingTool,
  EDGECategoryValue,
  EDGECategory,
  EDGEStage,
  EDGELevel,
  NetZeroTarget,
  NetZeroTargetType,
  AnnualPerformance,
} from '@/services/eia/eiaTypes';

import {
  calculateGreenStarResult,
  identifyAtRiskCredits,
} from '@/services/eia/greenBuildingService';

import {
  computeEDGEResult,
  validateEDGEInput,
} from '@/services/eia/edgeCertificationService';

import {
  computeNetZeroProgress,
} from '@/services/eia/netZeroService';

export interface GreenBuildingPanelProps {
  projectId: string;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type GreenBuildingTab = 'green-star' | 'edge' | 'net-zero';

const TAB_LABELS: Record<GreenBuildingTab, string> = {
  'green-star': 'Green Star SA',
  'edge': 'EDGE',
  'net-zero': 'Net Zero',
};

const CATEGORY_LABELS: Record<CreditCategory, string> = {
  management: 'Management',
  ieq: 'Indoor Environment Quality',
  energy: 'Energy',
  transport: 'Transport',
  water: 'Water',
  materials: 'Materials',
  land_use_ecology: 'Land Use & Ecology',
  emissions: 'Emissions',
  innovation: 'Innovation',
};

const EDGE_CATEGORY_LABELS: Record<EDGECategory, string> = {
  energy: 'Energy',
  water: 'Water',
  embodied_energy_materials: 'Embodied Energy in Materials',
};

const EDGE_STAGE_LABELS: Record<EDGEStage, string> = {
  preliminary_design: 'Preliminary Design',
  post_construction: 'Post-Construction',
  certified: 'Certified',
};

const EDGE_LEVEL_LABELS: Record<EDGELevel, string> = {
  not_eligible: 'Not Eligible',
  edge_certified: 'EDGE Certified',
  edge_advanced: 'EDGE Advanced',
  edge_zero_carbon: 'EDGE Zero Carbon',
};

const NET_ZERO_TYPE_LABELS: Record<NetZeroTargetType, string> = {
  net_zero_carbon: 'Net Zero Carbon',
  net_zero_energy: 'Net Zero Energy',
  net_zero_water: 'Net Zero Water',
};

// ─── Sample Data ─────────────────────────────────────────────────────────────

const SAMPLE_CREDITS: Credit[] = [
  { id: 'mgt-1', category: 'management', name: 'Green Star Accredited Professional', availablePoints: 2, targetedPoints: 2, achievedPoints: 2, evidenceStatus: 'verified' },
  { id: 'mgt-2', category: 'management', name: 'Commissioning Clauses', availablePoints: 2, targetedPoints: 2, achievedPoints: 1, evidenceStatus: 'in_progress' },
  { id: 'ieq-1', category: 'ieq', name: 'Ventilation Rates', availablePoints: 3, targetedPoints: 3, achievedPoints: 3, evidenceStatus: 'verified' },
  { id: 'ieq-2', category: 'ieq', name: 'Daylight', availablePoints: 3, targetedPoints: 2, achievedPoints: 0, evidenceStatus: 'not_started' },
  { id: 'ene-1', category: 'energy', name: 'Energy Use', availablePoints: 25, targetedPoints: 15, achievedPoints: 10, evidenceStatus: 'in_progress' },
  { id: 'ene-2', category: 'energy', name: 'Peak Energy Demand Reduction', availablePoints: 2, targetedPoints: 2, achievedPoints: 2, evidenceStatus: 'submitted' },
  { id: 'tra-1', category: 'transport', name: 'Provision of Car Parking', availablePoints: 2, targetedPoints: 1, achievedPoints: 1, evidenceStatus: 'verified' },
  { id: 'wat-1', category: 'water', name: 'Potable Water', availablePoints: 12, targetedPoints: 8, achievedPoints: 5, evidenceStatus: 'in_progress' },
  { id: 'mat-1', category: 'materials', name: 'Recycling Waste Storage', availablePoints: 2, targetedPoints: 2, achievedPoints: 2, evidenceStatus: 'verified' },
  { id: 'lue-1', category: 'land_use_ecology', name: 'Topsoil', availablePoints: 2, targetedPoints: 2, achievedPoints: 2, evidenceStatus: 'verified' },
  { id: 'emi-1', category: 'emissions', name: 'Refrigerant Impacts', availablePoints: 3, targetedPoints: 2, achievedPoints: 1, evidenceStatus: 'in_progress' },
  { id: 'inn-1', category: 'innovation', name: 'Innovative Technology', availablePoints: 5, targetedPoints: 3, achievedPoints: 0, evidenceStatus: 'not_started' },
];

const SAMPLE_EDGE_CATEGORIES: EDGECategoryValue[] = [
  { category: 'energy', baselineValue: 100, designedValue: 72, percentageSavings: 28, meetsThreshold: true },
  { category: 'water', baselineValue: 100, designedValue: 75, percentageSavings: 25, meetsThreshold: true },
  { category: 'embodied_energy_materials', baselineValue: 100, designedValue: 82, percentageSavings: 18, meetsThreshold: false },
];

const SAMPLE_NET_ZERO_TARGET: NetZeroTarget = {
  id: 'nz-1',
  projectId: '',
  targetType: 'net_zero_carbon',
  baselineYear: 2022,
  targetYear: 2040,
  baselineConsumption: 500000,
};

const SAMPLE_ANNUAL_DATA: AnnualPerformance[] = [
  { year: 2022, actualConsumption: 500000, baselineConsumption: 500000 },
  { year: 2023, actualConsumption: 460000, baselineConsumption: 500000 },
  { year: 2024, actualConsumption: 420000, baselineConsumption: 500000 },
  { year: 2025, actualConsumption: 395000, baselineConsumption: 500000 },
];

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * GreenBuildingPanel — Three sub-section panel for Green Star SA, EDGE, and Net Zero.
 * Uses tab navigation between the three certification systems.
 */
export function GreenBuildingPanel({ projectId }: GreenBuildingPanelProps) {
  const [activeTab, setActiveTab] = useState<GreenBuildingTab>('green-star');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Tab Navigation */}
      <div className="panel" style={{ padding: '12px 22px' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(Object.entries(TAB_LABELS) as [GreenBuildingTab, string][]).map(
            ([tab, label]) => (
              <button
                key={tab}
                className="btn"
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? 'var(--aqua)' : 'transparent',
                  borderColor: activeTab === tab ? 'var(--teal)' : 'var(--border)',
                  color: activeTab === tab ? 'var(--deep)' : 'var(--muted)',
                  fontWeight: activeTab === tab ? 700 : 500,
                  fontSize: 12,
                }}
              >
                {label}
              </button>
            )
          )}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'green-star' && <GreenStarSection projectId={projectId} />}
      {activeTab === 'edge' && <EDGESection projectId={projectId} />}
      {activeTab === 'net-zero' && <NetZeroSection projectId={projectId} />}
    </div>
  );
}

// ─── GREEN STAR SA Section ───────────────────────────────────────────────────

function GreenStarSection({ projectId }: { projectId: string }) {
  const [ratingTool] = useState<RatingTool>('office_v1');
  const [credits] = useState<Credit[]>(SAMPLE_CREDITS);
  const [reviewDate] = useState<string>('2025-08-15');

  const result = useMemo(
    () => calculateGreenStarResult(credits, ratingTool),
    [credits, ratingTool]
  );

  const atRiskCredits = useMemo(
    () => identifyAtRiskCredits(credits, reviewDate, 30),
    [credits, reviewDate]
  );

  // Group credits by category
  const creditsByCategory = useMemo(() => {
    const grouped: Partial<Record<CreditCategory, Credit[]>> = {};
    for (const credit of credits) {
      if (!grouped[credit.category]) {
        grouped[credit.category] = [];
      }
      grouped[credit.category]!.push(credit);
    }
    return grouped;
  }, [credits]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Star Rating + Summary Stats */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>Green Star SA Rating</h2>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Star Rating Display */}
          <div style={{ textAlign: 'center', minWidth: 100 }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: 'var(--teal)', lineHeight: 1 }}>
              {result.starRating}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4, textTransform: 'uppercase' }}>
              Star{result.starRating !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Stat Cards */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--teal)' }}>
                {result.totalTargeted}
              </div>
              <div className="stat-label">Targeted</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--green)' }}>
                {result.totalAchieved}
              </div>
              <div className="stat-label">Achieved</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: result.categoryMinimumsMet ? 'var(--green)' : 'var(--amber)' }}>
                {result.categoryMinimumsMet ? 'Met' : 'Unmet'}
              </div>
              <div className="stat-label">Minimums</div>
            </div>
          </div>
        </div>
      </div>

      {/* Category Minimum Warnings */}
      {result.unmetMinimums.length > 0 && (
        <div
          className="panel"
          style={{
            background: 'rgba(245,166,35,.04)',
            borderColor: 'rgba(245,166,35,.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} style={{ color: 'var(--amber)' }} aria-hidden="true" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>
              Category Minimum Warnings
            </span>
          </div>
          {result.unmetMinimums.map((um) => (
            <div key={um.category} style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 4 }}>
              <strong>{CATEGORY_LABELS[um.category]}</strong>: {um.achieved} / {um.required} points required
            </div>
          ))}
        </div>
      )}

      {/* At-Risk Credits */}
      {atRiskCredits.length > 0 && (
        <div
          className="panel"
          style={{
            background: 'rgba(217,87,71,.03)',
            borderColor: 'rgba(217,87,71,.18)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} style={{ color: 'var(--red)' }} aria-hidden="true" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
              At-Risk Credits (within 30 days of review)
            </span>
          </div>
          {atRiskCredits.map((credit) => (
            <div key={credit.id} style={{ fontSize: 12, color: 'var(--ink)', marginBottom: 4 }}>
              <strong>{credit.name}</strong> — {CATEGORY_LABELS[credit.category]} ({credit.evidenceStatus.replace('_', ' ')})
            </div>
          ))}
        </div>
      )}

      {/* Credits Table by Category */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>Credits by Category</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Credit</th>
              <th>Available</th>
              <th>Targeted</th>
              <th>Achieved</th>
              <th>Progress</th>
              <th>Evidence</th>
            </tr>
          </thead>
          <tbody>
            {(Object.entries(creditsByCategory) as [CreditCategory, Credit[]][]).map(
              ([category, catCredits]) =>
                catCredits.map((credit, idx) => (
                  <tr key={credit.id}>
                    {idx === 0 && (
                      <td
                        rowSpan={catCredits.length}
                        style={{ fontWeight: 600, fontSize: 11, color: 'var(--deep)', verticalAlign: 'top' }}
                      >
                        {CATEGORY_LABELS[category]}
                      </td>
                    )}
                    <td style={{ fontSize: 12 }}>{credit.name}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>{credit.availablePoints}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{credit.targetedPoints}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{credit.achievedPoints}</td>
                    <td style={{ minWidth: 100 }}>
                      <ProgressBar targeted={credit.targetedPoints} achieved={credit.achievedPoints} />
                    </td>
                    <td>
                      <EvidenceChip status={credit.evidenceStatus} />
                    </td>
                  </tr>
                ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── EDGE Section ────────────────────────────────────────────────────────────

function EDGESection({ projectId }: { projectId: string }) {
  const [categories, setCategories] = useState<EDGECategoryValue[]>(SAMPLE_EDGE_CATEGORIES);
  const [stage, setStage] = useState<EDGEStage>('preliminary_design');
  const [inputErrors, setInputErrors] = useState<Partial<Record<EDGECategory, string>>>({});

  const edgeResult = useMemo(
    () => computeEDGEResult(categories, stage),
    [categories, stage]
  );

  function handleSavingsChange(category: EDGECategory, value: string) {
    const numValue = parseFloat(value);
    // Clear error
    setInputErrors((prev) => {
      const next = { ...prev };
      delete next[category];
      return next;
    });

    if (value === '') {
      setInputErrors((prev) => ({ ...prev, [category]: 'Value required' }));
      return;
    }

    if (!validateEDGEInput(numValue)) {
      setInputErrors((prev) => ({ ...prev, [category]: 'Must be 0–100%' }));
      return;
    }

    setCategories((prev) =>
      prev.map((c) =>
        c.category === category
          ? { ...c, percentageSavings: numValue, meetsThreshold: numValue >= 20 }
          : c
      )
    );
  }

  function getLevelColor(level: EDGELevel): string {
    switch (level) {
      case 'edge_zero_carbon': return 'var(--green)';
      case 'edge_advanced': return 'var(--teal)';
      case 'edge_certified': return 'var(--jade)';
      default: return 'var(--red)';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Level Display + Stage */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>EDGE Certification</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span
            className="pill"
            style={{
              color: getLevelColor(edgeResult.level),
              background: edgeResult.level === 'not_eligible'
                ? 'rgba(217,87,71,.06)' : 'rgba(74,222,128,.1)',
              borderColor: edgeResult.level === 'not_eligible'
                ? 'rgba(217,87,71,.18)' : 'rgba(74,222,128,.18)',
              fontSize: 13,
              fontWeight: 700,
              padding: '8px 16px',
            }}
          >
            <span className="dot" style={{ background: getLevelColor(edgeResult.level) }}></span>
            {EDGE_LEVEL_LABELS[edgeResult.level]}
          </span>

          {/* Stage Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
              Stage:
            </label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as EDGEStage)}
              style={selectStyle}
            >
              {(Object.entries(EDGE_STAGE_LABELS) as [EDGEStage, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                )
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Category Inputs + Pass/Fail */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>Resource Category Savings</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Savings (%)</th>
              <th>Threshold (≥20%)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((cat) => (
              <tr key={cat.category}>
                <td style={{ fontWeight: 600, fontSize: 12, color: 'var(--deep)' }}>
                  {EDGE_CATEGORY_LABELS[cat.category]}
                </td>
                <td>
                  <input
                    type="number"
                    value={cat.percentageSavings}
                    onChange={(e) => handleSavingsChange(cat.category, e.target.value)}
                    min={0}
                    max={100}
                    step={1}
                    style={{
                      ...inputStyle(!!inputErrors[cat.category]),
                      width: 80,
                      textAlign: 'center',
                    }}
                    aria-label={`${EDGE_CATEGORY_LABELS[cat.category]} savings percentage`}
                    aria-invalid={!!inputErrors[cat.category]}
                  />
                  {inputErrors[cat.category] && (
                    <span style={{ fontSize: 10, color: 'var(--red)', display: 'block', marginTop: 2 }}>
                      {inputErrors[cat.category]}
                    </span>
                  )}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                  20%
                </td>
                <td>
                  {cat.percentageSavings >= 20 ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}>
                      <CheckCircle size={16} aria-hidden="true" /> Pass
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}>
                      <XCircle size={16} aria-hidden="true" /> Fail
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── NET ZERO Section ────────────────────────────────────────────────────────

function NetZeroSection({ projectId }: { projectId: string }) {
  const [target, setTarget] = useState<NetZeroTarget>(SAMPLE_NET_ZERO_TARGET);
  const [annualData] = useState<AnnualPerformance[]>(SAMPLE_ANNUAL_DATA);

  const currentYear = new Date().getFullYear();

  const progress = useMemo(
    () => computeNetZeroProgress(target, annualData, currentYear),
    [target, annualData, currentYear]
  );

  function handleTargetChange(field: keyof NetZeroTarget, value: string | number) {
    setTarget((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Target Definition Form */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>Net Zero Target Definition</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelStyle}>Target Type</label>
            <select
              value={target.targetType}
              onChange={(e) => handleTargetChange('targetType', e.target.value)}
              style={selectStyle}
            >
              {(Object.entries(NET_ZERO_TYPE_LABELS) as [NetZeroTargetType, string][]).map(
                ([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                )
              )}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelStyle}>Baseline Year</label>
            <input
              type="number"
              value={target.baselineYear}
              onChange={(e) => handleTargetChange('baselineYear', parseInt(e.target.value) || 0)}
              style={inputStyle(false)}
              min={2000}
              max={2100}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelStyle}>Target Year</label>
            <input
              type="number"
              value={target.targetYear}
              onChange={(e) => handleTargetChange('targetYear', parseInt(e.target.value) || 0)}
              style={inputStyle(false)}
              min={target.baselineYear + 1}
              max={target.baselineYear + 30}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={fieldLabelStyle}>Baseline Consumption</label>
            <input
              type="number"
              value={target.baselineConsumption}
              onChange={(e) => handleTargetChange('baselineConsumption', parseFloat(e.target.value) || 0)}
              style={inputStyle(false)}
              min={0}
              max={999999999.99}
              step={0.01}
            />
          </div>
        </div>
      </div>

      {/* On-Track Status + Deviation */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>Performance Status</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <span
            className="pill"
            style={{
              color: progress.onTrack ? 'var(--green)' : 'var(--red)',
              background: progress.onTrack ? 'rgba(74,222,128,.1)' : 'rgba(217,87,71,.06)',
              borderColor: progress.onTrack ? 'rgba(74,222,128,.18)' : 'rgba(217,87,71,.18)',
              fontSize: 13,
              fontWeight: 700,
              padding: '8px 16px',
            }}
          >
            <span className="dot" style={{ background: progress.onTrack ? 'var(--green)' : 'var(--red)' }}></span>
            {progress.onTrack ? 'On Track' : 'Off Track'}
          </span>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--teal)' }}>
                {progress.percentageReduction.toFixed(1)}%
              </div>
              <div className="stat-label">Reduction</div>
            </div>
            <div className="stat-card">
              <div className="stat-value" style={{ color: 'var(--muted)' }}>
                {progress.trajectoryTarget.toFixed(1)}%
              </div>
              <div className="stat-label">Target</div>
            </div>
            <div className="stat-card">
              <div
                className="stat-value"
                style={{
                  color: progress.deviationPercentagePoints >= 0 ? 'var(--green)' : 'var(--red)',
                }}
              >
                {progress.deviationPercentagePoints >= 0 ? '+' : ''}
                {progress.deviationPercentagePoints.toFixed(1)}pp
              </div>
              <div className="stat-label">Deviation</div>
            </div>
          </div>
        </div>
      </div>

      {/* Annual Performance Table */}
      <div className="panel">
        <h2 style={sectionHeadingStyle}>Annual Performance Data</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Actual Consumption</th>
              <th>Baseline</th>
              <th>Reduction (%)</th>
            </tr>
          </thead>
          <tbody>
            {annualData.map((entry) => {
              const reduction =
                entry.baselineConsumption > 0
                  ? ((entry.baselineConsumption - entry.actualConsumption) / entry.baselineConsumption) * 100
                  : 0;
              return (
                <tr key={entry.year}>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.year}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {entry.actualConsumption.toLocaleString()}
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                    {entry.baselineConsumption.toLocaleString()}
                  </td>
                  <td>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 12,
                        color: reduction > 0 ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {reduction.toFixed(1)}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Shared Sub-Components ───────────────────────────────────────────────────

function ProgressBar({ targeted, achieved }: { targeted: number; achieved: number }) {
  if (targeted === 0) {
    return (
      <div
        style={{
          height: 8,
          background: 'var(--border)',
          borderRadius: 4,
          width: '100%',
        }}
        aria-label="No target set"
      />
    );
  }
  const pct = Math.min((achieved / targeted) * 100, 100);
  return (
    <div
      style={{
        height: 8,
        background: 'var(--border)',
        borderRadius: 4,
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
      role="progressbar"
      aria-valuenow={achieved}
      aria-valuemin={0}
      aria-valuemax={targeted}
      aria-label={`${achieved} of ${targeted} points`}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          background: pct >= 100 ? 'var(--green)' : 'var(--teal)',
          borderRadius: 4,
          transition: 'width .3s ease',
        }}
      />
    </div>
  );
}

function EvidenceChip({ status }: { status: string }) {
  const styles: Record<string, { color: string; bg: string; border: string }> = {
    not_started: { color: 'var(--muted)', bg: 'rgba(16,32,51,.04)', border: 'var(--border)' },
    in_progress: { color: 'var(--amber)', bg: 'rgba(245,166,35,.08)', border: 'rgba(245,166,35,.18)' },
    submitted: { color: 'var(--teal)', bg: 'var(--aqua)', border: 'rgba(25,183,176,.18)' },
    verified: { color: 'var(--green)', bg: 'rgba(74,222,128,.1)', border: 'rgba(74,222,128,.18)' },
  };
  const s = styles[status] || styles.not_started;
  const label = status.replace(/_/g, ' ');

  return (
    <span
      className="pill"
      style={{
        color: s.color,
        background: s.bg,
        borderColor: s.border,
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'capitalize',
      }}
    >
      {label}
    </span>
  );
}

// ─── Shared Styles ───────────────────────────────────────────────────────────

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '.5px',
  color: 'var(--deep)',
  margin: '0 0 16px 0',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '.3px',
};

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: '0 12px',
  fontSize: 13,
  fontFamily: 'var(--font)',
  color: 'var(--ink)',
  background: 'rgba(255,255,255,.7)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
};

function inputStyle(hasError: boolean): React.CSSProperties {
  return {
    width: '100%',
    height: 36,
    padding: '0 12px',
    fontSize: 13,
    fontFamily: 'var(--font)',
    color: 'var(--ink)',
    background: hasError ? 'rgba(217,87,71,.03)' : 'rgba(255,255,255,.7)',
    border: `1px solid ${hasError ? 'rgba(217,87,71,.4)' : 'var(--border)'}`,
    borderRadius: 8,
    outline: 'none',
    transition: 'border-color .15s',
  };
}

export default GreenBuildingPanel;
