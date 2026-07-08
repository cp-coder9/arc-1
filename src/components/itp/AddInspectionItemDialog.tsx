import React, { useState } from 'react';
import type { UserProfile } from '@/types';
import type { InspectionType, InspectorRole } from '@/services/itpTypes';

export interface AddInspectionItemDialogProps {
  user: UserProfile;
  onSubmit?: (data: AddInspectionItemData) => void;
  onCancel?: () => void;
}

export interface AddInspectionItemData {
  title: string;
  description: string;
  inspectionType: InspectionType;
  acceptanceCriteria: string;
  responsibleInspectorRole: InspectorRole;
  specificationReference: string;
  linkedMaterialTestIds: string[];
}

const INSPECTION_TYPES: { value: InspectionType; label: string; description: string }[] = [
  { value: 'hold_point', label: 'Hold Point', description: 'Work stops until inspector sign-off' },
  { value: 'witness_point', label: 'Witness Point', description: 'Inspector may attend, work continues' },
  { value: 'surveillance', label: 'Surveillance', description: 'Routine monitoring by site team' },
];

const INSPECTOR_ROLES: { value: InspectorRole; label: string }[] = [
  { value: 'engineer', label: 'Engineer' },
  { value: 'architect', label: 'Architect' },
  { value: 'site_manager', label: 'Site Manager' },
];

/** Mock available material tests for multi-select */
const AVAILABLE_TESTS = [
  { id: 'test-001', label: 'Concrete 7-day — SANS 3001-GR1' },
  { id: 'test-002', label: 'Concrete 28-day — SANS 3001-GR1' },
  { id: 'test-003', label: 'Soil compaction — SANS 3001-GR30' },
  { id: 'test-004', label: 'Steel tensile — SANS 3001-AG1' },
  { id: 'test-005', label: 'Aggregate grading — SANS 3001-AG2' },
];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  fontSize: 13,
  fontFamily: 'var(--font)',
  color: 'var(--ink)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,.7)',
  outline: 'none',
  transition: 'border-color 0.15s ease',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--deep)',
  marginBottom: 6,
};

/**
 * AddInspectionItemDialog — Panel form for adding a new inspection item to an ITP.
 * Includes all fields: title, description, type, acceptance criteria,
 * responsible inspector, specification reference, linked material tests.
 *
 * Requirements: 2.1, 2.6, 12.4
 */
export default function AddInspectionItemDialog({ user, onSubmit, onCancel }: AddInspectionItemDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [inspectionType, setInspectionType] = useState<InspectionType>('hold_point');
  const [acceptanceCriteria, setAcceptanceCriteria] = useState('');
  const [inspectorRole, setInspectorRole] = useState<InspectorRole>('engineer');
  const [specRef, setSpecRef] = useState('');
  const [linkedTests, setLinkedTests] = useState<string[]>([]);

  const specRefValid = specRef.length === 0 || /^SANS \d{4,5} clause \d/.test(specRef) || /^NHBRC-/.test(specRef) || specRef.startsWith('SPEC-');
  const canSubmit =
    title.trim().length > 0 &&
    title.length <= 200 &&
    description.trim().length > 0 &&
    acceptanceCriteria.trim().length > 0 &&
    specRef.trim().length > 0 &&
    specRefValid &&
    linkedTests.length <= 20;

  function handleTestToggle(testId: string) {
    setLinkedTests((prev) =>
      prev.includes(testId) ? prev.filter((id) => id !== testId) : [...prev, testId]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit?.({
      title: title.trim(),
      description: description.trim(),
      inspectionType,
      acceptanceCriteria: acceptanceCriteria.trim(),
      responsibleInspectorRole: inspectorRole,
      specificationReference: specRef.trim(),
      linkedMaterialTestIds: linkedTests,
    });
  }

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', marginBottom: 16 }}>
        Add Inspection Item
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <div>
          <label style={labelStyle} htmlFor="item-title">Title</label>
          <input
            id="item-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Rebar placement inspection before pour"
            maxLength={200}
            required
            style={inputStyle}
          />
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle} htmlFor="item-description">Description</label>
          <textarea
            id="item-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what this inspection covers..."
            maxLength={2000}
            rows={3}
            required
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </div>

        {/* Inspection Type */}
        <div>
          <label style={labelStyle}>Inspection Type</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {INSPECTION_TYPES.map((type) => (
              <label
                key={type.value}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: `1px solid ${inspectionType === type.value ? 'var(--teal)' : 'var(--border)'}`,
                  background: inspectionType === type.value ? 'var(--aqua)' : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                <input
                  type="radio"
                  name="inspectionType"
                  value={type.value}
                  checked={inspectionType === type.value}
                  onChange={() => setInspectionType(type.value)}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>
                    {type.label}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>
                    {type.description}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Acceptance Criteria */}
        <div>
          <label style={labelStyle} htmlFor="item-criteria">Acceptance Criteria</label>
          <textarea
            id="item-criteria"
            value={acceptanceCriteria}
            onChange={(e) => setAcceptanceCriteria(e.target.value)}
            placeholder="Define the pass/fail criteria for this inspection..."
            maxLength={2000}
            rows={3}
            required
            style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
          />
        </div>

        {/* Inspector Role */}
        <div>
          <label style={labelStyle} htmlFor="item-inspector">Responsible Inspector Role</label>
          <select
            id="item-inspector"
            value={inspectorRole}
            onChange={(e) => setInspectorRole(e.target.value as InspectorRole)}
            style={inputStyle}
          >
            {INSPECTOR_ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>

        {/* Specification Reference */}
        <div>
          <label style={labelStyle} htmlFor="item-specref">Specification Reference</label>
          <input
            id="item-specref"
            type="text"
            value={specRef}
            onChange={(e) => setSpecRef(e.target.value)}
            placeholder="e.g. SANS 10400 clause 4.2.1 or NHBRC-2.4"
            maxLength={500}
            required
            style={{
              ...inputStyle,
              borderColor: specRef.length > 0 && !specRefValid ? 'var(--red)' : undefined,
            }}
          />
          <span style={{ fontSize: 10, color: specRef.length > 0 && !specRefValid ? 'var(--red)' : 'var(--muted)', marginTop: 2, display: 'block' }}>
            Format: SANS XXXXX clause X.X.X, NHBRC-X.X, or SPEC-XXXX
          </span>
        </div>

        {/* Linked Material Tests */}
        <div>
          <label style={labelStyle}>Linked Material Tests (max 20)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {AVAILABLE_TESTS.map((test) => (
              <label
                key={test.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: `1px solid ${linkedTests.includes(test.id) ? 'var(--teal)' : 'var(--border)'}`,
                  background: linkedTests.includes(test.id) ? 'var(--aqua)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                <input
                  type="checkbox"
                  checked={linkedTests.includes(test.id)}
                  onChange={() => handleTestToggle(test.id)}
                  style={{ accentColor: 'var(--teal)' }}
                />
                <span style={{ color: 'var(--ink)' }}>{test.label}</span>
              </label>
            ))}
          </div>
          {linkedTests.length > 20 && (
            <span style={{ fontSize: 10, color: 'var(--red)', marginTop: 4, display: 'block' }}>
              Maximum 20 linked material tests allowed.
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          {onCancel && (
            <button
              type="button"
              className="btn"
              onClick={onCancel}
              style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,.7)', color: 'var(--ink)' }}
            >
              Cancel
            </button>
          )}
          <button type="submit" className="btn" disabled={!canSubmit}>
            Add Item
          </button>
        </div>
      </form>
    </section>
  );
}
