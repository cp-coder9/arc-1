// ExportPanel — Export format selection, download trigger, and procurement package creation
// Requirements: 6.5, 6.6, 6.7, 8.5, 9.1–9.4

import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileJson, FileText, Package, CheckSquare } from 'lucide-react';

import type { BoqDocument, AsaqsTradeSection } from '@/services/bim/types';

export type ExportFormat = 'csv' | 'excel' | 'json';

export interface ExportPanelProps {
  boq: BoqDocument | null;
  onExport?: (format: ExportFormat) => void;
  onCreateProcurementPackage?: (selectedSections: AsaqsTradeSection[], title: string) => void;
}

/**
 * ExportPanel — Provides export format buttons (CSV, Excel, JSON) and
 * procurement package creation with trade section selection.
 */
export function ExportPanel({ boq, onExport, onCreateProcurementPackage }: ExportPanelProps) {
  const [selectedSections, setSelectedSections] = useState<Set<AsaqsTradeSection>>(new Set());
  const [packageTitle, setPackageTitle] = useState('');
  const [showPackageForm, setShowPackageForm] = useState(false);

  if (!boq) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <Download size={32} style={{ color: 'var(--muted)', marginBottom: 10 }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>No BoQ to Export</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Generate a Bill of Quantities first, then export it in your preferred format.
        </p>
      </section>
    );
  }

  function handleExport(format: ExportFormat) {
    if (onExport) onExport(format);
  }

  function toggleSection(section: AsaqsTradeSection) {
    setSelectedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }

  function selectAllSections() {
    setSelectedSections(new Set(boq!.sections.map((s) => s.tradeSection)));
  }

  function clearSelection() {
    setSelectedSections(new Set());
  }

  function handleCreatePackage(e: React.FormEvent) {
    e.preventDefault();
    if (selectedSections.size === 0) return;
    if (onCreateProcurementPackage) {
      onCreateProcurementPackage(Array.from(selectedSections), packageTitle || 'Procurement Package');
    }
    setShowPackageForm(false);
    setSelectedSections(new Set());
    setPackageTitle('');
  }

  return (
    <section className="panel">
      {/* Header */}
      <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--deep)', margin: '0 0 6px 0' }}>
        Export &amp; Procurement
      </h2>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 16px 0' }}>
        Export the BoQ or create procurement packages for tender distribution.
      </p>

      {/* BoQ Export Formats */}
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: '0 0 10px 0' }}>
          Export BoQ
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            className="btn"
            onClick={() => handleExport('csv')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <FileText size={14} aria-hidden="true" />
            CSV
          </button>
          <button
            className="btn"
            onClick={() => handleExport('excel')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <FileSpreadsheet size={14} aria-hidden="true" />
            Excel (.xlsx)
          </button>
          <button
            className="btn"
            onClick={() => handleExport('json')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <FileJson size={14} aria-hidden="true" />
            JSON
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0 0' }}>
          {boq.title} — {boq.totals.totalSections} sections, {boq.totals.totalLineItems} line items
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', margin: '0 0 16px 0' }} />

      {/* Procurement Package */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>
            Procurement Packages
          </h3>
          {!showPackageForm && (
            <button
              className="btn"
              onClick={() => setShowPackageForm(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
            >
              <Package size={14} aria-hidden="true" />
              Create Package
            </button>
          )}
        </div>

        {showPackageForm && (
          <form onSubmit={handleCreatePackage} style={{ padding: 14, background: 'rgba(223,245,242,.15)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12 }}>
            {/* Package Title */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                Package Title
              </label>
              <input
                type="text"
                value={packageTitle}
                onChange={(e) => setPackageTitle(e.target.value)}
                placeholder="e.g. Concrete Works Package"
                style={{
                  width: '100%',
                  height: 36,
                  padding: '0 12px',
                  fontSize: 13,
                  fontFamily: 'var(--font)',
                  color: 'var(--ink)',
                  background: 'rgba(255,255,255,.7)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  outline: 'none',
                }}
              />
            </div>

            {/* Trade Section Selection */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                  Select Trade Sections ({selectedSections.size} selected)
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="button" onClick={selectAllSections} style={{ fontSize: 10, color: 'var(--teal)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    Select All
                  </button>
                  <button type="button" onClick={clearSelection} style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                    Clear
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {boq.sections.map((section) => {
                  const isSelected = selectedSections.has(section.tradeSection);
                  return (
                    <button
                      key={section.sectionNumber}
                      type="button"
                      onClick={() => toggleSection(section.tradeSection)}
                      aria-pressed={isSelected}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px 10px',
                        fontSize: 11,
                        fontFamily: 'var(--font)',
                        border: `1px solid ${isSelected ? 'var(--teal)' : 'var(--border)'}`,
                        borderRadius: 6,
                        background: isSelected ? 'rgba(25,183,176,.08)' : 'rgba(255,255,255,.7)',
                        color: isSelected ? 'var(--deep)' : 'var(--ink)',
                        cursor: 'pointer',
                        fontWeight: isSelected ? 600 : 400,
                      }}
                    >
                      {isSelected && <CheckSquare size={12} style={{ color: 'var(--teal)' }} aria-hidden="true" />}
                      {section.sectionNumber}. {section.tradeSection}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="submit"
                className="btn"
                disabled={selectedSections.size === 0}
                style={{
                  fontSize: 12,
                  height: 32,
                  padding: '0 16px',
                  opacity: selectedSections.size === 0 ? 0.5 : 1,
                  cursor: selectedSections.size === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Create Package
              </button>
              <button
                type="button"
                onClick={() => { setShowPackageForm(false); setSelectedSections(new Set()); setPackageTitle(''); }}
                style={{ fontSize: 12, height: 32, padding: '0 16px', border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)', borderRadius: 8, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {!showPackageForm && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Create procurement packages from selected trade sections for tender distribution.
            Packages include supplier-facing descriptions without internal model references.
          </p>
        )}
      </div>
    </section>
  );
}

export default ExportPanel;
