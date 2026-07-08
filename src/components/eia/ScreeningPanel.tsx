// ScreeningPanel — NEMA Listed Activity Screening form + results display
// Requirements: 2.1–2.9, 14.5, 14.7

import React, { useState } from 'react';
import { Search } from 'lucide-react';

import { ScreeningInputSchema } from '@/lib/eiaSchemas';
import type {
  ScreeningInput,
  ScreeningResult,
  TriggeredActivity,
} from '@/services/eia/eiaTypes';
import { runScreening } from '@/services/eia/screeningService';

import { AdvisoryNotice } from './shared/AdvisoryNotice';

export interface ScreeningPanelProps {
  projectId: string;
  userId: string;
}

type FieldErrors = Partial<Record<keyof ScreeningInput, string>>;

const ACTIVITY_TYPES = [
  { value: '', label: '— Select activity type —' },
  { value: 'residential', label: 'Residential Development' },
  { value: 'commercial', label: 'Commercial Development' },
  { value: 'industrial', label: 'Industrial Development' },
  { value: 'infrastructure', label: 'Infrastructure (roads, pipelines, powerlines)' },
  { value: 'mining', label: 'Mining / Quarrying' },
  { value: 'agriculture', label: 'Agricultural Change of Use' },
  { value: 'waste_management', label: 'Waste Management Facility' },
  { value: 'water_use', label: 'Water Use / Abstraction' },
  { value: 'coastal', label: 'Coastal Development' },
  { value: 'tourism', label: 'Tourism / Hospitality' },
  { value: 'mixed_use', label: 'Mixed-Use Development' },
];

const INITIAL_FORM: ScreeningInput = {
  activityType: '',
  totalSiteArea: 0,
  developmentFootprint: 0,
  province: '',
  municipality: '',
  proximityWatercourse: 0,
  proximityCoastal: 0,
  proximityProtectedArea: 0,
  landUseZone: '',
  withinListedGeographicArea: false,
};

function getRecommendationColor(recommendation: string): string {
  switch (recommendation) {
    case 'no_eia_required':
      return 'var(--green)';
    case 'basic_assessment':
      return 'var(--amber)';
    case 'full_scoping_eia':
      return 'var(--red)';
    default:
      return 'var(--muted)';
  }
}

function getRecommendationLabel(recommendation: string): string {
  switch (recommendation) {
    case 'no_eia_required':
      return 'No EIA Required';
    case 'basic_assessment':
      return 'Basic Assessment Required';
    case 'full_scoping_eia':
      return 'Full Scoping & EIA Required';
    default:
      return recommendation;
  }
}

function getRecommendationBg(recommendation: string): string {
  switch (recommendation) {
    case 'no_eia_required':
      return 'rgba(74,222,128,.1)';
    case 'basic_assessment':
      return 'rgba(245,166,35,.08)';
    case 'full_scoping_eia':
      return 'rgba(217,87,71,.06)';
    default:
      return 'rgba(16,32,51,.04)';
  }
}

function getRecommendationBorder(recommendation: string): string {
  switch (recommendation) {
    case 'no_eia_required':
      return 'rgba(74,222,128,.18)';
    case 'basic_assessment':
      return 'rgba(245,166,35,.18)';
    case 'full_scoping_eia':
      return 'rgba(217,87,71,.18)';
    default:
      return 'var(--border)';
  }
}

/**
 * ScreeningPanel — NEMA Listed Activity Screening
 * Input form for all mandatory screening parameters with client-side validation.
 * On submit, runs the screening engine and displays triggered activities + recommendation.
 */
export function ScreeningPanel({ projectId, userId }: ScreeningPanelProps) {
  const [form, setForm] = useState<ScreeningInput>(INITIAL_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<ScreeningResult | null>(null);
  const [submitError, setSubmitError] = useState<string>('');

  function updateField<K extends keyof ScreeningInput>(
    field: K,
    value: ScreeningInput[K]
  ) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear field error on edit
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  function validateForm(): boolean {
    const parseResult = ScreeningInputSchema.safeParse(form);
    if (parseResult.success) {
      setErrors({});
      return true;
    }
    const fieldErrors: FieldErrors = {};
    const flat = parseResult.error.flatten().fieldErrors;
    for (const [key, msgs] of Object.entries(flat)) {
      if (msgs && msgs.length > 0) {
        fieldErrors[key as keyof ScreeningInput] = msgs[0];
      }
    }
    setErrors(fieldErrors);
    return false;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    setResult(null);

    if (!validateForm()) return;

    try {
      const screeningResult = runScreening(form, {
        projectId,
        screenedBy: userId,
      });
      setResult(screeningResult);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError('An unexpected error occurred during screening.');
      }
    }
  }

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Screening Form */}
      <section className="panel">
        <h2
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.5px',
            color: 'var(--deep)',
            margin: '0 0 16px 0',
          }}
        >
          NEMA Listed Activity Screening
        </h2>
        <p
          style={{
            fontSize: 13,
            color: 'var(--muted)',
            margin: '0 0 18px 0',
            lineHeight: 1.5,
          }}
        >
          Enter project parameters to determine whether any NEMA listed activities
          are triggered under GN R.983, R.984, or R.985.
        </p>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 14,
            }}
          >
            {/* Activity Type */}
            <FieldGroup label="Activity Type" error={errors.activityType}>
              <select
                value={form.activityType}
                onChange={(e) => updateField('activityType', e.target.value)}
                style={inputStyle(!!errors.activityType)}
                aria-invalid={!!errors.activityType}
              >
                {ACTIVITY_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FieldGroup>

            {/* Total Site Area */}
            <FieldGroup label="Total Site Area (m²)" error={errors.totalSiteArea}>
              <input
                type="number"
                value={form.totalSiteArea || ''}
                onChange={(e) =>
                  updateField('totalSiteArea', parseInt(e.target.value) || 0)
                }
                placeholder="1 – 999,999,999"
                style={inputStyle(!!errors.totalSiteArea)}
                aria-invalid={!!errors.totalSiteArea}
                min={1}
                max={999999999}
              />
            </FieldGroup>

            {/* Development Footprint */}
            <FieldGroup
              label="Development Footprint (m²)"
              error={errors.developmentFootprint}
            >
              <input
                type="number"
                value={form.developmentFootprint || ''}
                onChange={(e) =>
                  updateField(
                    'developmentFootprint',
                    parseInt(e.target.value) || 0
                  )
                }
                placeholder="1 – 999,999,999"
                style={inputStyle(!!errors.developmentFootprint)}
                aria-invalid={!!errors.developmentFootprint}
                min={1}
                max={999999999}
              />
            </FieldGroup>

            {/* Province */}
            <FieldGroup label="Province" error={errors.province}>
              <input
                type="text"
                value={form.province}
                onChange={(e) => updateField('province', e.target.value)}
                placeholder="e.g. Western Cape"
                style={inputStyle(!!errors.province)}
                aria-invalid={!!errors.province}
              />
            </FieldGroup>

            {/* Municipality */}
            <FieldGroup label="Municipality" error={errors.municipality}>
              <input
                type="text"
                value={form.municipality}
                onChange={(e) => updateField('municipality', e.target.value)}
                placeholder="e.g. City of Cape Town"
                style={inputStyle(!!errors.municipality)}
                aria-invalid={!!errors.municipality}
              />
            </FieldGroup>

            {/* Proximity Watercourse */}
            <FieldGroup
              label="Proximity to Watercourse (m)"
              error={errors.proximityWatercourse}
            >
              <input
                type="number"
                value={form.proximityWatercourse || ''}
                onChange={(e) =>
                  updateField(
                    'proximityWatercourse',
                    parseFloat(e.target.value) || 0
                  )
                }
                placeholder="0 – 99,999"
                style={inputStyle(!!errors.proximityWatercourse)}
                aria-invalid={!!errors.proximityWatercourse}
                min={0}
                max={99999}
              />
            </FieldGroup>

            {/* Proximity Coastal */}
            <FieldGroup
              label="Proximity to Coastal Area (m)"
              error={errors.proximityCoastal}
            >
              <input
                type="number"
                value={form.proximityCoastal || ''}
                onChange={(e) =>
                  updateField(
                    'proximityCoastal',
                    parseFloat(e.target.value) || 0
                  )
                }
                placeholder="0 – 99,999"
                style={inputStyle(!!errors.proximityCoastal)}
                aria-invalid={!!errors.proximityCoastal}
                min={0}
                max={99999}
              />
            </FieldGroup>

            {/* Proximity Protected Area */}
            <FieldGroup
              label="Proximity to Protected Area (m)"
              error={errors.proximityProtectedArea}
            >
              <input
                type="number"
                value={form.proximityProtectedArea || ''}
                onChange={(e) =>
                  updateField(
                    'proximityProtectedArea',
                    parseFloat(e.target.value) || 0
                  )
                }
                placeholder="0 – 99,999"
                style={inputStyle(!!errors.proximityProtectedArea)}
                aria-invalid={!!errors.proximityProtectedArea}
                min={0}
                max={99999}
              />
            </FieldGroup>

            {/* Land Use Zone */}
            <FieldGroup label="Land Use Zone" error={errors.landUseZone}>
              <input
                type="text"
                value={form.landUseZone}
                onChange={(e) => updateField('landUseZone', e.target.value)}
                placeholder="e.g. Residential, Industrial, Agricultural"
                style={inputStyle(!!errors.landUseZone)}
                aria-invalid={!!errors.landUseZone}
              />
            </FieldGroup>

            {/* Within Listed Geographic Area */}
            <FieldGroup label="Within Listed Geographic Area">
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 13,
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={form.withinListedGeographicArea}
                  onChange={(e) =>
                    updateField('withinListedGeographicArea', e.target.checked)
                  }
                  style={{ width: 16, height: 16, accentColor: 'var(--teal)' }}
                />
                Site is within a GN R.985 listed geographic area
              </label>
            </FieldGroup>
          </div>

          {/* Submit Button */}
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              className="btn"
              disabled={hasErrors}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: hasErrors ? 0.5 : 1,
                cursor: hasErrors ? 'not-allowed' : 'pointer',
              }}
            >
              <Search size={14} aria-hidden="true" />
              Run Screening
            </button>
            {hasErrors && (
              <span style={{ fontSize: 12, color: 'var(--red)' }}>
                Please correct the highlighted fields before screening.
              </span>
            )}
          </div>
        </form>

        {submitError && (
          <div
            style={{
              marginTop: 14,
              padding: '10px 14px',
              background: 'rgba(217,87,71,.06)',
              border: '1px solid rgba(217,87,71,.18)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--red)',
            }}
            role="alert"
          >
            {submitError}
          </div>
        )}
      </section>

      {/* Screening Results */}
      {result && (
        <section className="panel" aria-label="Screening Results">
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.5px',
              color: 'var(--deep)',
              margin: '0 0 16px 0',
            }}
          >
            Screening Result
          </h2>

          {/* Recommendation Pill */}
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="pill"
              style={{
                color: getRecommendationColor(result.recommendation),
                background: getRecommendationBg(result.recommendation),
                borderColor: getRecommendationBorder(result.recommendation),
                fontSize: 12,
                fontWeight: 600,
                padding: '6px 14px',
              }}
            >
              <span
                className="dot"
                style={{
                  background: getRecommendationColor(result.recommendation),
                }}
              ></span>
              {getRecommendationLabel(result.recommendation)}
            </span>
            <span
              className="pill"
              style={{
                color: 'var(--amber)',
                background: 'rgba(245,166,35,.08)',
                borderColor: 'rgba(245,166,35,.18)',
                fontSize: 10,
                fontWeight: 600,
              }}
            >
              <span className="dot" style={{ background: 'var(--amber)' }}></span>
              Professional review required
            </span>
          </div>

          {/* Triggered Activities Table */}
          {result.triggeredActivities.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  margin: '0 0 10px 0',
                }}
              >
                Triggered Activities ({result.triggeredActivities.length})
              </h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Listing Reference</th>
                    <th>Activity</th>
                    <th>Description</th>
                    <th>Triggering Attribute</th>
                    <th>Value</th>
                    <th>Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {result.triggeredActivities.map(
                    (activity: TriggeredActivity, idx: number) => (
                      <tr key={`${activity.listingNotice}-${activity.activityNumber}-${idx}`}>
                        <td
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: 'var(--muted)',
                          }}
                        >
                          {activity.listingNotice}
                        </td>
                        <td>{activity.activityNumber}</td>
                        <td>{activity.description}</td>
                        <td>{activity.triggeringAttribute}</td>
                        <td>{String(activity.triggeringValue)}</td>
                        <td>{String(activity.thresholdValue)}</td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}

          {result.triggeredActivities.length === 0 && (
            <p
              style={{
                fontSize: 13,
                color: 'var(--muted)',
                margin: '0 0 16px 0',
                fontStyle: 'italic',
              }}
            >
              No listed activities triggered based on the provided project
              parameters.
            </p>
          )}

          {/* Advisory Notice */}
          <AdvisoryNotice text={result.advisoryText} />
        </section>
      )}
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface FieldGroupProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

function FieldGroup({ label, error, children }: FieldGroupProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '.3px',
        }}
      >
        {label}
      </label>
      {children}
      {error && (
        <span
          style={{ fontSize: 11, color: 'var(--red)', lineHeight: 1.3 }}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

export default ScreeningPanel;
