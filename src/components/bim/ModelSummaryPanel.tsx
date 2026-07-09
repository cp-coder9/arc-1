import React, { useState } from 'react';
import { FileText, ChevronRight, ChevronDown } from 'lucide-react';
import type { ParsedIfcModel, SpatialNode } from '@/services/bim/types';

// ─── Props ───────────────────────────────────────────────────────────────────

interface ModelSummaryPanelProps {
  model: ParsedIfcModel | null;
}

// ─── Spatial Tree Node Component ─────────────────────────────────────────────

function SpatialTreeNode({ node, depth = 0 }: { key?: React.Key; node: SpatialNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2); // auto-expand first 2 levels
  const hasChildren = node.children.length > 0;
  const elementCount = node.elementIds.length;

  return (
    <div style={{ marginLeft: depth * 16 }}>
      <div
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={() => hasChildren && setExpanded(!expanded)}
        onKeyDown={(e) => { if (hasChildren && (e.key === 'Enter' || e.key === ' ')) setExpanded(!expanded); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '3px 0',
          cursor: hasChildren ? 'pointer' : 'default',
          userSelect: 'none',
        }}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown size={12} style={{ color: 'var(--muted)' }} />
            : <ChevronRight size={12} style={{ color: 'var(--muted)' }} />
        ) : (
          <span style={{ width: 12, display: 'inline-block' }} />
        )}
        <span style={{
          fontSize: 12,
          color: 'var(--deep)',
          fontWeight: depth === 0 ? 600 : 400,
        }}>
          {node.name || node.type}
        </span>
        <span style={{
          fontSize: 10,
          color: 'var(--muted)',
          fontFamily: 'monospace',
        }}>
          {node.type.replace('Ifc', '')}
        </span>
        {elementCount > 0 && (
          <span style={{
            fontSize: 10,
            color: 'var(--teal)',
            background: 'var(--aqua)',
            borderRadius: 8,
            padding: '1px 6px',
          }}>
            {elementCount} el.
          </span>
        )}
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <SpatialTreeNode key={child.globalId} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Parsed model overview: spatial hierarchy tree, element counts by type,
 * schema version, coverage stats.
 *
 * Requirements: 7.6
 */
export default function ModelSummaryPanel({ model }: ModelSummaryPanelProps) {
  // ─── Empty State ────────────────────────────────────────────────────────

  if (!model) {
    return (
      <section className="panel">
        <h2 style={{ color: 'var(--ink)', fontSize: 14, marginBottom: 12 }}>Model Summary</h2>
        <div style={{ textAlign: 'center', padding: '24px 16px' }}>
          <FileText size={28} style={{ color: 'var(--muted)', marginBottom: 8 }} />
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>
            No model loaded. Upload an IFC file to see model details.
          </p>
        </div>
      </section>
    );
  }

  // ─── Compute element type counts ────────────────────────────────────────

  const elementsByType: Record<string, number> = {};
  for (const el of model.elements) {
    elementsByType[el.entityType] = (elementsByType[el.entityType] || 0) + 1;
  }

  const sortedTypes = Object.entries(elementsByType)
    .sort(([, a], [, b]) => b - a);

  const elementsWithQuantities = model.elements.filter(
    (el) => el.quantitySets.length > 0
  ).length;

  const coveragePercent = model.elementCount > 0
    ? Math.round((elementsWithQuantities / model.elementCount) * 100)
    : 0;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <section className="panel">
      <h2 style={{ color: 'var(--ink)', fontSize: 14, marginBottom: 12 }}>Model Summary</h2>

      {/* Header info */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{
          background: 'var(--aqua)',
          borderRadius: 10,
          padding: '6px 12px',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--muted)' }}>File: </span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{model.fileName}</span>
        </div>
        <div style={{
          background: 'var(--aqua)',
          borderRadius: 10,
          padding: '6px 12px',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--muted)' }}>Schema: </span>
          <span style={{ color: 'var(--deep)', fontWeight: 600 }}>{model.schemaVersion}</span>
        </div>
        <div style={{
          background: 'var(--aqua)',
          borderRadius: 10,
          padding: '6px 12px',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--muted)' }}>Elements: </span>
          <span style={{ color: 'var(--ink)', fontWeight: 500 }}>{model.elementCount.toLocaleString()}</span>
        </div>
        <div style={{
          background: coveragePercent >= 80 ? 'rgba(74,222,128,.1)' : coveragePercent >= 50 ? 'rgba(245,166,35,.08)' : 'rgba(217,87,71,.06)',
          borderRadius: 10,
          padding: '6px 12px',
          fontSize: 12,
        }}>
          <span style={{ color: 'var(--muted)' }}>Coverage: </span>
          <span style={{
            color: coveragePercent >= 80 ? 'var(--green)' : coveragePercent >= 50 ? 'var(--amber)' : 'var(--red)',
            fontWeight: 600,
          }}>
            {coveragePercent}%
          </span>
        </div>
      </div>

      {/* Spatial Hierarchy */}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
          Spatial Hierarchy
        </h3>
        <div style={{
          background: 'rgba(255,255,255,.6)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '10px 14px',
          maxHeight: 200,
          overflowY: 'auto',
        }}>
          <SpatialTreeNode node={model.spatialHierarchy} />
        </div>
      </div>

      {/* Element Counts by Type */}
      <div>
        <h3 style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
          Elements by Type
        </h3>
        <table className="table" style={{ fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Entity Type</th>
              <th style={{ textAlign: 'right' }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {sortedTypes.map(([type, count]) => (
              <tr key={type}>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--ink)' }}>
                  {type}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--deep)' }}>
                  {count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
