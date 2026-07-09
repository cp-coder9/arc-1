import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle, Info, ShieldAlert } from 'lucide-react';
import type { ValidationReport, ValidationFinding, ValidationSeverity } from '@/services/bim/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ValidationReportPanelProps {
  report: ValidationReport | null;
}

// ─── Severity Helpers ────────────────────────────────────────────────────────

const SEVERITY_CONFIG: Record<ValidationSeverity, {
  icon: React.ElementType;
  color: string;
  bgColor: string;
  label: string;
}> = {
  error: {
    icon: ShieldAlert,
    color: 'var(--red)',
    bgColor: 'rgba(217,87,71,.06)',
    label: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    color: 'var(--amber)',
    bgColor: 'rgba(245,166,35,.08)',
    label: 'Warning',
  },
  info: {
    icon: Info,
    color: 'var(--teal)',
    bgColor: 'var(--aqua)',
    label: 'Info',
  },
};

// ─── Finding Row Component ───────────────────────────────────────────────────

function FindingRow({ finding }: { finding: ValidationFinding }) {
  const config = SEVERITY_CONFIG[finding.severity];
  const Icon = config.icon;

  return (
    <tr>
      <td style={{ width: 32, verticalAlign: 'top', padding: '8px 4px' }}>
        <Icon size={14} style={{ color: config.color }} />
      </td>
      <td style={{ verticalAlign: 'top', padding: '8px 4px' }}>
        <span style={{
          display: 'inline-block',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          color: config.color,
          background: config.bgColor,
          borderRadius: 6,
          padding: '2px 6px',
          marginBottom: 2,
        }}>
          {config.label}
        </span>
      </td>
      <td style={{ verticalAlign: 'top', padding: '8px 4px' }}>
        <span style={{
          fontSize: 10,
          fontFamily: 'monospace',
          color: 'var(--muted)',
          background: 'rgba(16,32,51,.04)',
          borderRadius: 4,
          padding: '2px 5px',
        }}>
          {finding.type.replace(/_/g, ' ')}
        </span>
      </td>
      <td style={{ verticalAlign: 'top', padding: '8px 4px', fontSize: 12, color: 'var(--ink)' }}>
        {finding.message}
      </td>
      <td style={{ verticalAlign: 'top', padding: '8px 4px' }}>
        {finding.elementGlobalId && (
          <span style={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: 'var(--muted)',
          }}>
            {finding.elementGlobalId.substring(0, 12)}…
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Validation findings table with severity icons (error/warning/info),
 * blocked/allowed status indicator, and element links.
 *
 * Requirements: 7.1, 7.7
 */
export default function ValidationReportPanel({ report }: ValidationReportPanelProps) {
  const [filterSeverity, setFilterSeverity] = useState<ValidationSeverity | 'all'>('all');

  // ─── Empty State ────────────────────────────────────────────────────────

  if (!report) {
    return (
      <section className="panel">
        <h2 style={{ color: 'var(--ink)', fontSize: 14, marginBottom: 12 }}>Validation Report</h2>
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <CheckCircle size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No validation report available. Upload and parse a model to generate findings.
          </p>
        </div>
      </section>
    );
  }

  // ─── Computed Values ────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const result = { error: 0, warning: 0, info: 0 };
    for (const f of report.findings) {
      result[f.severity]++;
    }
    return result;
  }, [report.findings]);

  const filteredFindings = useMemo(() => {
    if (filterSeverity === 'all') return report.findings;
    return report.findings.filter((f) => f.severity === filterSeverity);
  }, [report.findings, filterSeverity]);

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <section className="panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ color: 'var(--ink)', fontSize: 14 }}>Validation Report</h2>

        {/* BoQ Blocked/Allowed indicator */}
        <span className="pill" style={{
          color: report.boqBlocked ? 'var(--red)' : 'var(--green)',
          background: report.boqBlocked ? 'rgba(217,87,71,.08)' : 'rgba(74,222,128,.1)',
          borderColor: report.boqBlocked ? 'rgba(217,87,71,.18)' : 'rgba(74,222,128,.18)',
        }}>
          <span className="dot" style={{
            background: report.boqBlocked ? 'var(--red)' : 'var(--green)',
          }} />
          {report.boqBlocked ? 'BoQ Blocked' : 'BoQ Allowed'}
        </span>
      </div>

      {/* Severity summary row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          className={filterSeverity === 'all' ? 'btn' : 'btn btn-secondary'}
          onClick={() => setFilterSeverity('all')}
          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
        >
          All ({report.findings.length})
        </button>
        <button
          className={filterSeverity === 'error' ? 'btn' : 'btn btn-secondary'}
          onClick={() => setFilterSeverity('error')}
          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
        >
          <ShieldAlert size={12} style={{ marginRight: 4, color: 'var(--red)' }} />
          Errors ({counts.error})
        </button>
        <button
          className={filterSeverity === 'warning' ? 'btn' : 'btn btn-secondary'}
          onClick={() => setFilterSeverity('warning')}
          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
        >
          <AlertTriangle size={12} style={{ marginRight: 4, color: 'var(--amber)' }} />
          Warnings ({counts.warning})
        </button>
        <button
          className={filterSeverity === 'info' ? 'btn' : 'btn btn-secondary'}
          onClick={() => setFilterSeverity('info')}
          style={{ fontSize: 11, padding: '4px 10px', height: 28 }}
        >
          <Info size={12} style={{ marginRight: 4, color: 'var(--teal)' }} />
          Info ({counts.info})
        </button>
      </div>

      {/* Findings table */}
      {filteredFindings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px 16px' }}>
          <CheckCircle size={24} style={{ color: 'var(--green)', marginBottom: 6 }} />
          <p style={{ color: 'var(--muted)', fontSize: 12 }}>
            {filterSeverity === 'all'
              ? 'No findings — model passed all checks.'
              : `No ${filterSeverity}-level findings.`}
          </p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: 12, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th style={{ textAlign: 'left' }}>Severity</th>
                <th style={{ textAlign: 'left' }}>Type</th>
                <th style={{ textAlign: 'left' }}>Message</th>
                <th style={{ textAlign: 'left' }}>Element</th>
              </tr>
            </thead>
            <tbody>
              {filteredFindings.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Statistics summary */}
      {report.statistics && (
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'rgba(255,255,255,.5)',
          border: '1px solid var(--border)',
          borderRadius: 12,
        }}>
          <h3 style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
            Model Statistics
          </h3>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
            <div>
              <span style={{ color: 'var(--muted)' }}>Total: </span>
              <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{report.statistics.totalElements.toLocaleString()}</span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>With quantities: </span>
              <span style={{ color: 'var(--green)', fontWeight: 500 }}>{report.statistics.elementsWithQuantities.toLocaleString()}</span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Without quantities: </span>
              <span style={{ color: 'var(--amber)', fontWeight: 500 }}>{report.statistics.elementsWithoutQuantities.toLocaleString()}</span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Unclassified: </span>
              <span style={{ color: report.statistics.unclassifiedElements > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>
                {report.statistics.unclassifiedElements}
              </span>
            </div>
            <div>
              <span style={{ color: 'var(--muted)' }}>Coverage: </span>
              <span style={{
                color: report.statistics.quantityCoveragePercent >= 80 ? 'var(--green)' : report.statistics.quantityCoveragePercent >= 50 ? 'var(--amber)' : 'var(--red)',
                fontWeight: 600,
              }}>
                {report.statistics.quantityCoveragePercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
