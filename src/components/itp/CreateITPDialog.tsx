import React, { useState } from 'react';
import type { UserProfile } from '@/types';
import type { ConstructionStage } from '@/services/itpTypes';

export interface CreateITPDialogProps {
  user: UserProfile;
  onSubmit?: (data: { title: string; description: string; constructionStage: ConstructionStage }) => void;
  onCancel?: () => void;
}

const CONSTRUCTION_STAGES: { value: ConstructionStage; label: string }[] = [
  { value: 'site_establishment', label: 'Site Establishment' },
  { value: 'earthworks', label: 'Earthworks' },
  { value: 'foundations', label: 'Foundations' },
  { value: 'substructure', label: 'Substructure' },
  { value: 'superstructure', label: 'Superstructure' },
  { value: 'roof', label: 'Roof' },
  { value: 'external_envelope', label: 'External Envelope' },
  { value: 'internal_finishes', label: 'Internal Finishes' },
  { value: 'mechanical_electrical', label: 'Mechanical & Electrical' },
  { value: 'external_works', label: 'External Works' },
  { value: 'commissioning', label: 'Commissioning' },
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
 * CreateITPDialog — Panel form for creating a new Inspection Test Plan.
 * Fields: title, description, construction stage.
 *
 * Requirements: 1.1
 */
export default function CreateITPDialog({ user, onSubmit, onCancel }: CreateITPDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [constructionStage, setConstructionStage] = useState<ConstructionStage>('foundations');

  const canSubmit = title.trim().length > 0 && title.length <= 200;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit?.({ title: title.trim(), description: description.trim(), constructionStage });
  }

  return (
    <section className="panel">
      <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--deep)', marginBottom: 16 }}>
        Create Inspection Test Plan
      </h2>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Title */}
        <div>
          <label style={labelStyle} htmlFor="itp-title">Title</label>
          <input
            id="itp-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Foundation Concrete Works"
            maxLength={200}
            required
            style={inputStyle}
          />
          <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            {title.length}/200 characters
          </span>
        </div>

        {/* Description */}
        <div>
          <label style={labelStyle} htmlFor="itp-description">Description</label>
          <textarea
            id="itp-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the scope and purpose of this inspection test plan..."
            maxLength={2000}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
          />
          <span style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
            {description.length}/2000 characters
          </span>
        </div>

        {/* Construction Stage */}
        <div>
          <label style={labelStyle} htmlFor="itp-stage">Construction Stage</label>
          <select
            id="itp-stage"
            value={constructionStage}
            onChange={(e) => setConstructionStage(e.target.value as ConstructionStage)}
            style={inputStyle}
          >
            {CONSTRUCTION_STAGES.map((stage) => (
              <option key={stage.value} value={stage.value}>
                {stage.label}
              </option>
            ))}
          </select>
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
            Create ITP
          </button>
        </div>
      </form>
    </section>
  );
}
