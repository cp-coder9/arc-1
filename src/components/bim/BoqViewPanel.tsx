// BoqViewPanel — Trade section accordion with ASAQS-numbered line items
// Requirements: 6.1, 6.3, 6.4, 12.1, 12.2

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';

import type { BoqDocument, BoqSection, BoqLineItem } from '@/services/bim/types';

export interface BoqViewPanelProps {
  boq: BoqDocument | null;
}

/**
 * BoqViewPanel — Renders a BoQ document as expandable trade section groups
 * with line item tables (item number, description, unit, quantity).
 * Uses ASAQS section numbering.
 */
export function BoqViewPanel({ boq }: BoqViewPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  if (!boq) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <FileText size={32} style={{ color: 'var(--muted)', marginBottom: 10 }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>No BoQ Generated</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Extract quantities from an IFC model and generate a Bill of Quantities to view it here.
        </p>
      </section>
    );
  }

  if (boq.sections.length === 0) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <FileText size={32} style={{ color: 'var(--muted)', marginBottom: 10 }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>Empty BoQ</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          The generated Bill of Quantities contains no trade sections.
        </p>
      </section>
    );
  }

  function toggleSection(sectionNumber: string) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionNumber)) {
        next.delete(sectionNumber);
      } else {
        next.add(sectionNumber);
      }
      return next;
    });
  }

  function expandAll() {
    setExpandedSections(new Set(boq!.sections.map((s) => s.sectionNumber)));
  }

  function collapseAll() {
    setExpandedSections(new Set());
  }

  return (
    <section className="panel">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--deep)', margin: 0 }}>
            Bill of Quantities
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0 0' }}>
            {boq.title} — Rev {boq.revision}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="pill" style={{ fontSize: 10 }}>
            <span className="dot"></span> {boq.status}
          </span>
          <span className="pill" style={{ fontSize: 10, color: 'var(--muted)', background: 'rgba(16,32,51,.04)', borderColor: 'var(--border)' }}>
            {boq.totals.totalSections} sections · {boq.totals.totalLineItems} items
          </span>
        </div>
      </div>

      {/* Expand/Collapse Controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn-secondary" onClick={expandAll} style={{ fontSize: 11, padding: '4px 10px', height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)', cursor: 'pointer' }}>
          Expand All
        </button>
        <button className="btn-secondary" onClick={collapseAll} style={{ fontSize: 11, padding: '4px 10px', height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)', cursor: 'pointer' }}>
          Collapse All
        </button>
      </div>

      {/* Trade Sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {boq.sections.map((section) => (
          <SectionAccordion
            key={section.sectionNumber}
            section={section}
            expanded={expandedSections.has(section.sectionNumber)}
            onToggle={() => toggleSection(section.sectionNumber)}
          />
        ))}
      </div>

      {/* Flagged Elements Summary */}
      {boq.flaggedElementsSummary.length > 0 && (
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(245,166,35,.05)', border: '1px solid rgba(245,166,35,.18)', borderRadius: 10 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--amber)', margin: '0 0 8px 0' }}>
            Flagged Elements ({boq.flaggedElementsSummary.length})
          </h3>
          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {boq.flaggedElementsSummary.slice(0, 5).map((item) => (
              <div key={item.globalId} style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', minWidth: 80 }}>{item.globalId.slice(0, 8)}…</span>
                <span>{item.elementType}</span>
                <span style={{ color: 'var(--amber)' }}>— {item.message}</span>
              </div>
            ))}
            {boq.flaggedElementsSummary.length > 5 && (
              <span style={{ fontStyle: 'italic' }}>
                + {boq.flaggedElementsSummary.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface SectionAccordionProps {
  section: BoqSection;
  expanded: boolean;
  onToggle: () => void;
}

function SectionAccordion({ section, expanded, onToggle }: SectionAccordionProps) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      {/* Section Header */}
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`section-${section.sectionNumber}`}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          background: expanded ? 'rgba(223,245,242,.3)' : 'rgba(255,255,255,.5)',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'var(--font)',
        }}
      >
        {expanded ? (
          <ChevronDown size={14} style={{ color: 'var(--teal)', flexShrink: 0 }} aria-hidden="true" />
        ) : (
          <ChevronRight size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} aria-hidden="true" />
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--deep)', minWidth: 28 }}>
          {section.sectionNumber}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
          {section.title}
        </span>
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
          {section.lineItems.length} item{section.lineItems.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Line Items Table */}
      {expanded && (
        <div id={`section-${section.sectionNumber}`} style={{ padding: '0 14px 14px' }}>
          {section.lineItems.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', margin: '10px 0 0 0' }}>
              No line items in this section.
            </p>
          ) : (
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Item No.</th>
                  <th>Description</th>
                  <th style={{ width: 60 }}>Unit</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {section.lineItems.map((item: BoqLineItem) => (
                  <tr key={item.itemNumber}>
                    <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)' }}>
                      {item.itemNumber}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--ink)' }}>
                      {item.description}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {item.unit}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textAlign: 'right', fontFamily: 'monospace' }}>
                      {item.quantity.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default BoqViewPanel;
