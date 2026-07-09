/**
 * Municipal Refuse Area Calculator — Result Summary Panel
 *
 * Displays the full Refuse_Area_Result in a structured format with
 * area dimensions, bin quantities, vehicle access, ventilation/drainage,
 * pest control, advisory disclaimer, and source info.
 *
 * Requirements: 3.1, 3.2, 3.5, 3.6, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5,
 *              6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4
 */

import React from 'react';
import type { Refuse_Area_Result } from '@/services/refuseArea/types';

// ── Props ────────────────────────────────────────────────────────────────────

interface ResultSummaryPanelProps {
  result: Refuse_Area_Result;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const sectionStyles: React.CSSProperties = {
  borderTop: '1px solid var(--border)',
  paddingTop: 16,
  marginTop: 16,
};

const sectionTitleStyles: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--deep)',
  marginBottom: 10,
};

const fieldRowStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  padding: '4px 0',
  fontSize: 13,
};

const fieldLabelStyles: React.CSSProperties = {
  color: 'var(--muted)',
};

const fieldValueStyles: React.CSSProperties = {
  color: 'var(--ink)',
  fontWeight: 500,
};

const notSpecifiedStyles: React.CSSProperties = {
  color: 'var(--amber)',
  fontSize: 12,
  fontStyle: 'italic',
};

const advisoryBoxStyles: React.CSSProperties = {
  background: 'rgba(245,166,35,.08)',
  border: '1px solid rgba(245,166,35,.22)',
  borderRadius: 12,
  padding: '14px 16px',
  marginTop: 16,
};

const advisoryTextStyles: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: 'var(--ink)',
};

const advisoryLabelStyles: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--amber)',
  marginBottom: 6,
};

const sourceInfoStyles: React.CSSProperties = {
  fontSize: 12,
  color: 'var(--muted)',
  marginTop: 16,
  paddingTop: 12,
  borderTop: '1px solid var(--border)',
};

// ── Helper ───────────────────────────────────────────────────────────────────

function FieldRow({ label, value, notSpecified }: { label: string; value: string | null; notSpecified?: boolean }) {
  if (notSpecified || value === null) {
    return (
      <div style={fieldRowStyles}>
        <span style={fieldLabelStyles}>{label}</span>
        <span style={notSpecifiedStyles}>Not specified — verify with local authority</span>
      </div>
    );
  }
  return (
    <div style={fieldRowStyles}>
      <span style={fieldLabelStyles}>{label}</span>
      <span style={fieldValueStyles}>{value}</span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ResultSummaryPanel({ result }: ResultSummaryPanelProps) {
  return (
    <div>
      {/* 1. Area Dimensions Card */}
      <div>
        <div style={sectionTitleStyles}>Area Dimensions</div>
        <FieldRow
          label="Total Area"
          value={`${result.area.totalAreaSqm} m²`}
        />
        <FieldRow
          label="Dimensions (L × W × H)"
          value={`${result.area.dimensions.length} m × ${result.area.dimensions.width} m × ${result.area.dimensions.height} m`}
        />
        {result.area.minimumApplied && (
          <div style={{ ...notSpecifiedStyles, color: 'var(--amber)', padding: '6px 0', fontStyle: 'normal' }}>
            Municipal minimum room size of 4.0 m² has been applied
          </div>
        )}
        {result.area.componentAreas && result.area.componentAreas.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Component breakdown:</div>
            {result.area.componentAreas.map((comp, idx) => (
              <FieldRow
                key={idx}
                label={`${comp.type.charAt(0).toUpperCase() + comp.type.slice(1)}`}
                value={`${comp.areaSqm} m²`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 2. Bin Quantity Card */}
      <div style={sectionStyles}>
        <div style={sectionTitleStyles}>Bin Quantity</div>
        <FieldRow
          label="Total Waste Volume"
          value={`${result.bins.totalWasteVolumeLitres} L`}
        />

        {/* General waste */}
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
          General Waste
        </div>
        <FieldRow
          label="Bin Type"
          value={result.bins.generalWaste.binLabel}
        />
        <FieldRow
          label="Quantity"
          value={`${result.bins.generalWaste.binCount}`}
        />
        <FieldRow
          label="Capacity per Bin"
          value={`${result.bins.generalWaste.binCapacityLitres} L`}
        />
        <FieldRow
          label="Total Volume"
          value={`${result.bins.generalWaste.totalVolumeLitres} L`}
        />

        {/* Recyclable waste (if applicable) */}
        {result.bins.recyclableWaste && (
          <>
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>
              Recyclable Waste
            </div>
            <FieldRow
              label="Bin Type"
              value={result.bins.recyclableWaste.binLabel}
            />
            <FieldRow
              label="Quantity"
              value={`${result.bins.recyclableWaste.binCount}`}
            />
            <FieldRow
              label="Capacity per Bin"
              value={`${result.bins.recyclableWaste.binCapacityLitres} L`}
            />
            <FieldRow
              label="Total Volume"
              value={`${result.bins.recyclableWaste.totalVolumeLitres} L`}
            />
          </>
        )}

        <FieldRow
          label="Total Floor Space (bins)"
          value={`${result.bins.totalFloorSpaceSqm} m²`}
        />
      </div>

      {/* 3. Vehicle Access Card */}
      <div style={sectionStyles}>
        <div style={sectionTitleStyles}>Vehicle Access</div>
        <FieldRow
          label="Minimum Road Width"
          value={result.vehicleAccess.minimumRoadWidth != null ? `${result.vehicleAccess.minimumRoadWidth} m` : null}
          notSpecified={result.vehicleAccess.minimumRoadWidth == null}
        />
        <FieldRow
          label="Turning Circle Radius"
          value={result.vehicleAccess.turningCircleRadius != null ? `${result.vehicleAccess.turningCircleRadius} m` : null}
          notSpecified={result.vehicleAccess.turningCircleRadius == null}
        />
        <FieldRow
          label="Maximum Gradient"
          value={result.vehicleAccess.maximumGradient != null ? `${result.vehicleAccess.maximumGradient}%` : null}
          notSpecified={result.vehicleAccess.maximumGradient == null}
        />
        <FieldRow
          label="Maximum Carry Distance"
          value={result.vehicleAccess.maximumCarryDistance != null ? `${result.vehicleAccess.maximumCarryDistance} m` : null}
          notSpecified={result.vehicleAccess.maximumCarryDistance == null}
        />
        <FieldRow
          label="Hardstand Required"
          value={
            result.vehicleAccess.hardstandRequired != null
              ? result.vehicleAccess.hardstandRequired ? 'Yes' : 'No'
              : null
          }
          notSpecified={result.vehicleAccess.hardstandRequired == null}
        />
        {result.vehicleAccess.hardstandRequired && result.vehicleAccess.hardstandDimensions && (
          <FieldRow
            label="Hardstand Dimensions"
            value={`${result.vehicleAccess.hardstandDimensions.length} m × ${result.vehicleAccess.hardstandDimensions.width} m`}
          />
        )}
      </div>

      {/* 4. Ventilation & Drainage Card */}
      <div style={sectionStyles}>
        <div style={sectionTitleStyles}>Ventilation & Drainage</div>

        {/* Ventilation */}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
          Ventilation
        </div>
        <FieldRow
          label="Type"
          value={
            result.ventilation.type != null
              ? result.ventilation.type === 'natural' ? 'Natural' : 'Mechanical'
              : null
          }
          notSpecified={result.ventilation.type == null}
        />
        {result.ventilation.type === 'natural' && (
          <FieldRow
            label="Minimum Opening Area"
            value={result.ventilation.naturalOpeningArea != null ? `${result.ventilation.naturalOpeningArea} m²` : null}
            notSpecified={result.ventilation.naturalOpeningArea == null}
          />
        )}
        {result.ventilation.type === 'mechanical' && (
          <FieldRow
            label="Mechanical Rate"
            value={result.ventilation.mechanicalRate != null ? `${result.ventilation.mechanicalRate} air changes/hr` : null}
            notSpecified={result.ventilation.mechanicalRate == null}
          />
        )}

        {/* Drainage */}
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginTop: 12, marginBottom: 4 }}>
          Drainage
        </div>
        <FieldRow
          label="Floor Gradient"
          value={result.drainage.floorGradient != null ? `${result.drainage.floorGradient}%` : null}
          notSpecified={result.drainage.floorGradient == null}
        />
        <FieldRow
          label="Drain Diameter"
          value={result.drainage.drainDiameter != null ? `${result.drainage.drainDiameter} mm` : null}
          notSpecified={result.drainage.drainDiameter == null}
        />
        <FieldRow
          label="Wash-Down Required"
          value={
            result.drainage.washDownRequired != null
              ? result.drainage.washDownRequired ? 'Yes' : 'No'
              : null
          }
          notSpecified={result.drainage.washDownRequired == null}
        />
        {result.drainage.washDownRequired && (
          <>
            <FieldRow
              label="Wash-Down Type"
              value={result.drainage.washDownType}
              notSpecified={result.drainage.washDownType == null}
            />
            <FieldRow
              label="Wash-Down Location"
              value={result.drainage.washDownLocation}
              notSpecified={result.drainage.washDownLocation == null}
            />
          </>
        )}
      </div>

      {/* 5. Pest Control */}
      <div style={sectionStyles}>
        <div style={sectionTitleStyles}>Pest Control</div>
        {result.pestControl ? (
          <div style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>
            {result.pestControl}
          </div>
        ) : (
          <div style={notSpecifiedStyles}>
            Not specified by this municipality
          </div>
        )}
      </div>

      {/* 6. Advisory Disclaimer */}
      <div style={advisoryBoxStyles}>
        <div style={advisoryLabelStyles}>Advisory Disclaimer</div>
        <div style={advisoryTextStyles}>
          {result.advisoryDisclaimer}
        </div>
      </div>

      {/* 7. Source Info */}
      <div style={sourceInfoStyles}>
        <span>Source: {result.municipalityName}</span>
        <span style={{ margin: '0 8px' }}>·</span>
        <span>Profile last updated: {result.profileLastUpdated}</span>
      </div>
    </div>
  );
}
