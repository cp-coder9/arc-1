// MappingRulesPanel — Rule editor for QS/admin roles, CRUD interface for custom mapping rules
// Requirements: 5.7, 5.8, 6.1, 10.3

import React, { useState } from 'react';
import { Plus, Pencil, Trash2, ShieldCheck, Settings } from 'lucide-react';

import type { UserProfile } from '@/types';
import type {
  MappingRule,
  AsaqsTradeSection,
  MeasurementUnit,
  IfcEntityType,
  RuleSpecificity,
} from '@/services/bim/types';
import { BIM_MAPPING_ROLES } from '@/services/bim/types';

export interface MappingRulesPanelProps {
  user: UserProfile;
  rules: MappingRule[];
  onCreateRule?: (rule: Omit<MappingRule, 'ruleId' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateRule?: (ruleId: string, updates: Partial<MappingRule>) => void;
  onDeleteRule?: (ruleId: string) => void;
}

const TRADE_SECTIONS: AsaqsTradeSection[] = [
  'Preliminaries', 'Earthworks', 'Concrete', 'Formwork',
  'Reinforcement', 'Masonry', 'Waterproofing', 'Roofwork',
  'Carpentry and Joinery', 'Ceilings and Partitions',
  'Floor Coverings', 'Glazing', 'Ironmongery',
  'Plumbing and Drainage', 'Electrical', 'Painting',
  'Unclassified',
];

const MEASUREMENT_UNITS: MeasurementUnit[] = ['m²', 'm³', 'm', 'nr', 'kg', 'item'];

const ENTITY_TYPES: IfcEntityType[] = [
  'IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcColumn', 'IfcBeam',
  'IfcDoor', 'IfcWindow', 'IfcRoof', 'IfcStair', 'IfcRailing',
  'IfcCurtainWall', 'IfcPlate', 'IfcMember', 'IfcPile', 'IfcFooting',
  'IfcCovering', 'IfcBuildingElementProxy',
  'IfcPipeSegment', 'IfcPipeFitting', 'IfcDuctSegment', 'IfcDuctFitting',
  'IfcCableSegment', 'IfcCableFitting', 'IfcFlowTerminal',
  'IfcEnergyConversionDevice', 'IfcFlowController', 'IfcFlowStorageDevice',
];

function calculateSpecificity(rule: MappingRule): RuleSpecificity {
  let score = 1;
  if (rule.predefinedType) score++;
  if (rule.classificationCode) score++;
  return Math.min(score, 3) as RuleSpecificity;
}

function getScopeLabel(scope: MappingRule['scope']): string {
  switch (scope) {
    case 'default': return 'Default';
    case 'firm': return 'Firm';
    case 'project': return 'Project';
    default: return scope;
  }
}

function getScopeColor(scope: MappingRule['scope']): string {
  switch (scope) {
    case 'default': return 'var(--muted)';
    case 'firm': return 'var(--teal)';
    case 'project': return 'var(--deep)';
    default: return 'var(--muted)';
  }
}

/**
 * MappingRulesPanel — Displays and manages mapping rules for IFC-to-BoQ trade section mapping.
 * Only users with BIM_MAPPING_ROLES (quantity_surveyor, platform_admin) can add/edit/delete.
 */
export function MappingRulesPanel({
  user,
  rules,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}: MappingRulesPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<MappingRule | null>(null);

  const canEdit = BIM_MAPPING_ROLES.includes(user.role);

  if (rules.length === 0 && !canEdit) {
    return (
      <section className="panel" style={{ textAlign: 'center', padding: 40 }}>
        <Settings size={32} style={{ color: 'var(--muted)', marginBottom: 10 }} aria-hidden="true" />
        <h2 style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>No Mapping Rules</h2>
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          No custom mapping rules have been configured. Default ASAQS rules are applied automatically.
        </p>
      </section>
    );
  }

  function handleEdit(rule: MappingRule) {
    setEditingRule(rule);
    setShowForm(true);
  }

  function handleDelete(ruleId: string) {
    if (onDeleteRule) onDeleteRule(ruleId);
  }

  function handleFormSubmit(formData: RuleFormData) {
    if (editingRule && onUpdateRule) {
      onUpdateRule(editingRule.ruleId, formData);
    } else if (onCreateRule) {
      onCreateRule({
        ...formData,
        scope: formData.scope || 'project',
        createdBy: user.uid,
      });
    }
    setShowForm(false);
    setEditingRule(null);
  }

  function handleFormCancel() {
    setShowForm(false);
    setEditingRule(null);
  }

  return (
    <section className="panel">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--deep)', margin: 0 }}>
            Mapping Rules
          </h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0 0' }}>
            IFC entity type → ASAQS trade section mappings
          </p>
        </div>
        {canEdit && (
          <button
            className="btn"
            onClick={() => { setEditingRule(null); setShowForm(true); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Plus size={14} aria-hidden="true" />
            Add Rule
          </button>
        )}
      </div>

      {/* Role badge */}
      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <ShieldCheck size={14} style={{ color: 'var(--teal)' }} aria-hidden="true" />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            You have edit access ({user.role.replace(/_/g, ' ')})
          </span>
        </div>
      )}

      {/* Create/Edit Form */}
      {showForm && (
        <RuleForm
          initialData={editingRule}
          onSubmit={handleFormSubmit}
          onCancel={handleFormCancel}
        />
      )}

      {/* Rules Table */}
      {rules.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>IFC Type</th>
              <th>Predefined Type</th>
              <th>Classification</th>
              <th>Trade Section</th>
              <th>Unit</th>
              <th>Scope</th>
              <th style={{ width: 50 }}>Spec.</th>
              {canEdit && <th style={{ width: 70 }}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.ruleId}>
                <td style={{ fontSize: 12, color: 'var(--ink)' }}>{rule.ifcEntityType}</td>
                <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {rule.predefinedType || '—'}
                </td>
                <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>
                  {rule.classificationCode || '—'}
                </td>
                <td style={{ fontSize: 12, color: 'var(--ink)' }}>{rule.tradeSection}</td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{rule.measurementUnit}</td>
                <td>
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: getScopeColor(rule.scope),
                    background: rule.scope === 'default' ? 'rgba(16,32,51,.04)' : 'rgba(25,183,176,.08)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}>
                    {getScopeLabel(rule.scope)}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: calculateSpecificity(rule) === 3 ? 'var(--green)' : calculateSpecificity(rule) === 2 ? 'var(--amber)' : 'var(--muted)',
                  }}>
                    {calculateSpecificity(rule)}
                  </span>
                </td>
                {canEdit && (
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {rule.scope !== 'default' && (
                        <>
                          <button
                            onClick={() => handleEdit(rule)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                            title="Edit rule"
                            aria-label={`Edit rule for ${rule.ifcEntityType}`}
                          >
                            <Pencil size={13} style={{ color: 'var(--teal)' }} />
                          </button>
                          <button
                            onClick={() => handleDelete(rule.ruleId)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                            title="Delete rule"
                            aria-label={`Delete rule for ${rule.ifcEntityType}`}
                          >
                            <Trash2 size={13} style={{ color: 'var(--red)' }} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {rules.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: 20, fontStyle: 'italic' }}>
          No mapping rules configured. Click "Add Rule" to create a custom mapping.
        </p>
      )}
    </section>
  );
}

// ─── Rule Form ───────────────────────────────────────────────────────────────

interface RuleFormData {
  ifcEntityType: IfcEntityType;
  predefinedType?: string;
  classificationCode?: string;
  tradeSection: AsaqsTradeSection;
  tradeSectionCode: string;
  measurementUnit: MeasurementUnit;
  description?: string;
  scope: 'default' | 'firm' | 'project';
  scopeId?: string;
  createdBy?: string;
}

interface RuleFormProps {
  initialData: MappingRule | null;
  onSubmit: (data: RuleFormData) => void;
  onCancel: () => void;
}

function RuleForm({ initialData, onSubmit, onCancel }: RuleFormProps) {
  const [formData, setFormData] = useState<RuleFormData>({
    ifcEntityType: initialData?.ifcEntityType || 'IfcWall',
    predefinedType: initialData?.predefinedType || '',
    classificationCode: initialData?.classificationCode || '',
    tradeSection: initialData?.tradeSection || 'Concrete',
    tradeSectionCode: initialData?.tradeSectionCode || '3',
    measurementUnit: initialData?.measurementUnit || 'm²',
    description: initialData?.description || '',
    scope: initialData?.scope || 'project',
    scopeId: initialData?.scopeId || '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(formData);
  }

  const inputStyle: React.CSSProperties = {
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
  };

  return (
    <form onSubmit={handleSubmit} style={{ margin: '0 0 16px 0', padding: 14, background: 'rgba(223,245,242,.15)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <h3 style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: '0 0 12px 0' }}>
        {initialData ? 'Edit Mapping Rule' : 'New Mapping Rule'}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {/* IFC Entity Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>IFC Entity Type</label>
          <select value={formData.ifcEntityType} onChange={(e) => setFormData({ ...formData, ifcEntityType: e.target.value as IfcEntityType })} style={inputStyle}>
            {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Predefined Type */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Predefined Type (optional)</label>
          <input type="text" value={formData.predefinedType || ''} onChange={(e) => setFormData({ ...formData, predefinedType: e.target.value || undefined })} placeholder="e.g. PARTITIONING" style={inputStyle} />
        </div>

        {/* Classification Code */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Classification Code (optional)</label>
          <input type="text" value={formData.classificationCode || ''} onChange={(e) => setFormData({ ...formData, classificationCode: e.target.value || undefined })} placeholder="e.g. Ss_25_10" style={inputStyle} />
        </div>

        {/* Trade Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Trade Section</label>
          <select value={formData.tradeSection} onChange={(e) => setFormData({ ...formData, tradeSection: e.target.value as AsaqsTradeSection })} style={inputStyle}>
            {TRADE_SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Measurement Unit */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Measurement Unit</label>
          <select value={formData.measurementUnit} onChange={(e) => setFormData({ ...formData, measurementUnit: e.target.value as MeasurementUnit })} style={inputStyle}>
            {MEASUREMENT_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {/* Section Code */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Section Code</label>
          <input type="text" value={formData.tradeSectionCode} onChange={(e) => setFormData({ ...formData, tradeSectionCode: e.target.value })} placeholder="e.g. 3" style={inputStyle} />
        </div>

        {/* Description */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, gridColumn: 'span 2' }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>Description (optional)</label>
          <input type="text" value={formData.description || ''} onChange={(e) => setFormData({ ...formData, description: e.target.value || undefined })} placeholder="Rule description" style={inputStyle} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="submit" className="btn" style={{ fontSize: 12, height: 32, padding: '0 16px' }}>
          {initialData ? 'Update Rule' : 'Create Rule'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel} style={{ fontSize: 12, height: 32, padding: '0 16px', border: '1px solid var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)', borderRadius: 8, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export default MappingRulesPanel;
