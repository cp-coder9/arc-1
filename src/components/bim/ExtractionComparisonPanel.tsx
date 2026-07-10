// ExtractionComparisonPanel — Diff view between extractions showing added/removed/changed quantities
// Requirements: 8.5, 6.1

import React from 'react';
import { GitCompare, Plus, Minus, ArrowUpDown } from 'lucide-react';

import type { ExtractionComparison, BoqLineItem, QuantityChange } from '@/services/bim/types';

export interface ExtractionComparisonPanelProps {
  comparison: ExtractionComparison | null;
}

/**
 * ExtractionComparisonPanel — Displays a diff view between two extractions,
 * highlighting added (green), removed (red), and changed (amber) quantities.
 */
export function ExtractionComparisonPanel({ comparison }: ExtractionComparisonPanelProps) {
  if (!comparison) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <GitCompare size={32} style={{ color: 'var(--muted)', marginBottom: 10 }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>No Comparison Available</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Re-extract quantities from an updated model to see a comparison with the previous extraction.
        </p>
      </section>
    );
  }

  const totalChanges = comparison.added.length + comparison.removed.length + comparison.changed.length;

  if (totalChanges === 0) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <GitCompare size={32} style={{ color: 'var(--green)', marginBottom: 10 }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>No Differences</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          The current extraction matches the previous extraction — no changes detected.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--deep)', margin: 0 }}>
            Extraction Comparison
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0 0' }}>
            Changes between extractions
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {comparison.added.length > 0 && (
            <span className="pill" style={{ color: 'var(--green)', background: 'rgba(74,222,128,.1)', borderColor: 'rgba(74,222,128,.18)', fontSize: 10 }}>
              <span className="dot" style={{ background: 'var(--green)' }}></span>
              +{comparison.added.length} added
            </span>
          )}
          {comparison.removed.length > 0 && (
            <span className="pill" style={{ color: 'var(--red)', background: 'rgba(217,87,71,.06)', borderColor: 'rgba(217,87,71,.18)', fontSize: 10 }}>
              <span className="dot" style={{ background: 'var(--red)' }}></span>
              -{comparison.removed.length} removed
            </span>
          )}
          {comparison.changed.length > 0 && (
            <span className="pill" style={{ color: 'var(--amber)', background: 'rgba(245,166,35,.08)', borderColor: 'rgba(245,166,35,.18)', fontSize: 10 }}>
              <span className="dot" style={{ background: 'var(--amber)' }}></span>
              ~{comparison.changed.length} changed
            </span>
          )}
        </div>
      </div>

      {/* Extraction IDs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, fontSize: 11, color: 'var(--muted)' }}>
        <span>Previous: <code style={{ fontFamily: 'monospace', color: 'var(--muted)' }}>{comparison.previousExtractionId.slice(0, 12)}…</code></span>
        <span>→</span>
        <span>Current: <code style={{ fontFamily: 'monospace', color: 'var(--teal)' }}>{comparison.currentExtractionId.slice(0, 12)}…</code></span>
      </div>

      {/* Added Items */}
      {comparison.added.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Plus size={14} style={{ color: 'var(--green)' }} aria-hidden="true" />
            <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', margin: 0 }}>
              Added ({comparison.added.length})
            </h3>
          </div>
          <div style={{ border: '1px solid rgba(74,222,128,.18)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item No.</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {comparison.added.map((item: BoqLineItem) => (
                  <tr key={item.itemNumber} style={{ background: 'rgba(74,222,128,.04)' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--green)' }}>
                      {item.itemNumber}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink)' }}>{item.description}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.unit}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)', textAlign: 'right', fontFamily: 'monospace' }}>
                      +{item.quantity.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Removed Items */}
      {comparison.removed.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Minus size={14} style={{ color: 'var(--red)' }} aria-hidden="true" />
            <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', margin: 0 }}>
              Removed ({comparison.removed.length})
            </h3>
          </div>
          <div style={{ border: '1px solid rgba(217,87,71,.18)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item No.</th>
                  <th>Description</th>
                  <th>Unit</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {comparison.removed.map((item: BoqLineItem) => (
                  <tr key={item.itemNumber} style={{ background: 'rgba(217,87,71,.03)' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--red)' }}>
                      {item.itemNumber}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink)', textDecoration: 'line-through' }}>{item.description}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{item.unit}</td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', textAlign: 'right', fontFamily: 'monospace' }}>
                      -{item.quantity.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Changed Items */}
      {comparison.changed.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <ArrowUpDown size={14} style={{ color: 'var(--amber)' }} aria-hidden="true" />
            <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)', margin: 0 }}>
              Changed ({comparison.changed.length})
            </h3>
          </div>
          <div style={{ border: '1px solid rgba(245,166,35,.18)', borderRadius: 8, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Previous</th>
                  <th style={{ textAlign: 'right' }}>Current</th>
                  <th style={{ textAlign: 'right' }}>Delta</th>
                  <th style={{ textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {comparison.changed.map((change: QuantityChange) => (
                  <tr key={change.lineItemId} style={{ background: 'rgba(245,166,35,.03)' }}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--amber)' }}>
                      {change.lineItemId}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink)' }}>{change.description}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right', fontFamily: 'monospace' }}>
                      {change.previousQuantity.toFixed(2)}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textAlign: 'right', fontFamily: 'monospace' }}>
                      {change.currentQuantity.toFixed(2)}
                    </td>
                    <td style={{ fontSize: 11, textAlign: 'right', fontFamily: 'monospace', color: change.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                      {change.delta > 0 ? '+' : ''}{change.delta.toFixed(2)}
                    </td>
                    <td style={{ fontSize: 11, textAlign: 'right', fontFamily: 'monospace', color: Math.abs(change.deltaPercent) > 10 ? 'var(--red)' : 'var(--amber)' }}>
                      {change.deltaPercent > 0 ? '+' : ''}{change.deltaPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

export default ExtractionComparisonPanel;
