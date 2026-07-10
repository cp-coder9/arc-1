// ─── FormEditor Component ───────────────────────────────────────────────────
// Main form filling UI. Two-column layout: form sections on left, status sidebar
// on right. Renders collaborative presence bar, section headers with auto-fill
// count badges, and action buttons (Save Draft, Export PDF, Preview).
// Requirements: 2.4, 3.1, 3.2, 3.3, 13.1, 13.4, 14.1, 14.2, 14.4, 14.5, 15.5

import React, { useMemo, useCallback } from 'react';
import type { FormTemplate, FormFieldValue, FormSection } from '@/services/forms/formTypes';
import type { UserProfile } from '@/types';
import { useFormInstance } from '@/hooks/useFormInstance';
import FormFieldRenderer from './FormFieldRenderer';

interface FormEditorProps {
  instanceId: string;
  template: FormTemplate;
  user: UserProfile;
}

/**
 * Two-column form editor: form sections on left, status sidebar on right.
 * Manages collaboration locks via useFormInstance, renders per-section fields,
 * and shows overall progress in the sidebar.
 */
export default function FormEditor({ instanceId, template, user }: FormEditorProps) {
  const {
    instance,
    locks,
    loading,
    error,
    updateField,
    revertFieldValue,
    acquireLock,
    releaseLock,
  } = useFormInstance(instanceId);

  // ─── Derived Stats ──────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!instance) return { autoFilled: 0, overrides: 0, needsEntry: 0, total: 0, signed: 0, totalSignatures: 0 };

    const fields = instance.fields;
    let autoFilled = 0;
    let overrides = 0;
    let needsEntry = 0;

    for (const fieldValue of Object.values(fields)) {
      if (fieldValue.source === 'auto_fill' && !fieldValue.isOverridden) {
        autoFilled++;
      } else if (fieldValue.isOverridden) {
        overrides++;
      } else if (fieldValue.source === 'manual' && (fieldValue.value === null || fieldValue.value === '')) {
        needsEntry++;
      }
    }

    const total = Object.keys(fields).length;
    const signed = Object.keys(instance.signatures).length;
    const totalSignatures = template.requiredSignatures.length;

    return { autoFilled, overrides, needsEntry, total, signed, totalSignatures };
  }, [instance, template]);

  // Count auto-filled fields per section
  const sectionAutoFillCounts = useMemo(() => {
    if (!instance) return {};
    const counts: Record<string, number> = {};
    for (const section of template.schema.sections) {
      let count = 0;
      for (const fieldDef of section.fields) {
        const fv = instance.fields[fieldDef.id];
        if (fv && fv.source === 'auto_fill' && !fv.isOverridden) {
          count++;
        }
      }
      counts[section.id] = count;
    }
    return counts;
  }, [instance, template]);

  // ─── Collaborator Presence ──────────────────────────────────────────────

  const collaborators = useMemo(() => {
    if (!instance) return [];
    return instance.collaborators.filter((c) => c !== user.uid);
  }, [instance, user.uid]);

  const activeLocksByField = useMemo(() => {
    const map: Record<string, { lockedBy: string; lockedByName: string }> = {};
    for (const lock of locks) {
      if (lock.lockedBy !== user.uid) {
        map[lock.fieldId] = { lockedBy: lock.lockedBy, lockedByName: lock.lockedByName };
      }
    }
    return map;
  }, [locks, user.uid]);

  // ─── Data Sources Summary ─────────────────────────────────────────────

  const dataSources = useMemo(() => {
    const providers = new Set<string>();
    for (const mapping of template.fieldMappings) {
      providers.add(mapping.dataSource.provider);
    }
    return Array.from(providers).map((p) => {
      switch (p) {
        case 'project_passport': return 'Project Passport';
        case 'user_profile': return 'User Profile';
        case 'client_record': return 'Client Record';
        case 'firm_record': return 'Firm Record';
        default: return p;
      }
    });
  }, [template]);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleFieldChange = useCallback(
    (fieldId: string, newValue: string | string[] | boolean | null) => {
      const stringValue = typeof newValue === 'string' ? newValue : newValue === null ? null : String(newValue);
      updateField(fieldId, stringValue, user.uid, user.displayName);
    },
    [updateField, user.uid, user.displayName]
  );

  const handleFieldFocus = useCallback(
    (fieldId: string) => {
      acquireLock(fieldId, user.uid, user.displayName);
    },
    [acquireLock, user.uid, user.displayName]
  );

  const handleFieldBlur = useCallback(
    (fieldId: string) => {
      releaseLock(fieldId);
    },
    [releaseLock]
  );

  const handleRevert = useCallback(
    (fieldId: string) => {
      revertFieldValue(fieldId, user.uid, user.displayName);
    },
    [revertFieldValue, user.uid, user.displayName]
  );

  // ─── Loading / Error States ───────────────────────────────────────────

  if (loading) {
    return (
      <div className="form-editor__loading">
        <p style={{ color: 'var(--muted)' }}>Loading form...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="form-editor__error panel">
        <p style={{ color: 'var(--red)' }}>{error}</p>
      </div>
    );
  }

  if (!instance) {
    return (
      <div className="form-editor__empty panel">
        <p style={{ color: 'var(--muted)' }}>Form instance not found.</p>
      </div>
    );
  }

  // ─── Progress Percentage ──────────────────────────────────────────────

  const progressPercent = stats.total > 0
    ? Math.round(((stats.autoFilled + stats.overrides) / stats.total) * 100)
    : 0;

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div className="form-editor">
      {/* Collaborator Presence Bar */}
      {collaborators.length > 0 && (
        <div className="form-editor__presence-bar">
          <span className="form-editor__presence-label">Collaborators:</span>
          {collaborators.map((collab) => (
            <span key={collab} className="form-editor__presence-avatar" title={collab}>
              {collab.charAt(0).toUpperCase()}
            </span>
          ))}
        </div>
      )}

      <div className="form-editor__layout">
        {/* Left Column: Form Sections */}
        <div className="form-editor__sections">
          {template.schema.sections.map((section) => (
            <FormSectionPanel
              key={section.id}
              section={section}
              fields={instance.fields}
              autoFillCount={sectionAutoFillCounts[section.id] || 0}
              locks={activeLocksByField}
              onChange={handleFieldChange}
              onFocus={handleFieldFocus}
              onBlur={handleFieldBlur}
              onRevert={handleRevert}
            />
          ))}
        </div>

        {/* Right Column: Status Sidebar */}
        <div className="form-editor__sidebar">
          <div className="panel form-editor__sidebar-panel">
            <h2>Form Status</h2>

            {/* Auto-Fill Progress Bar */}
            <div className="form-editor__progress">
              <div className="form-editor__progress-header">
                <span>Auto-fill Progress</span>
                <span style={{ color: 'var(--teal)', fontWeight: 600 }}>{progressPercent}%</span>
              </div>
              <div className="form-editor__progress-bar">
                <div
                  className="form-editor__progress-fill"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Stats */}
            <div className="form-editor__stat-list">
              <div className="form-editor__stat-item">
                <span className="form-editor__stat-dot form-editor__stat-dot--auto" />
                <span>Auto-filled</span>
                <span style={{ fontWeight: 600 }}>{stats.autoFilled}</span>
              </div>
              <div className="form-editor__stat-item">
                <span className="form-editor__stat-dot form-editor__stat-dot--override" />
                <span>Manual overrides</span>
                <span style={{ fontWeight: 600 }}>{stats.overrides}</span>
              </div>
              <div className="form-editor__stat-item">
                <span className="form-editor__stat-dot form-editor__stat-dot--manual" />
                <span>Needs entry</span>
                <span style={{ fontWeight: 600 }}>{stats.needsEntry}</span>
              </div>
            </div>

            {/* Signature Status */}
            <div className="form-editor__signatures">
              <h3>Signatures</h3>
              <span>
                {stats.signed} / {stats.totalSignatures} applied
              </span>
            </div>

            {/* Data Sources Summary */}
            <div className="form-editor__data-sources">
              <h3>Data Sources</h3>
              <ul>
                {dataSources.map((ds) => (
                  <li key={ds}>{ds}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="form-editor__actions">
            <button type="button" className="btn">
              Save Draft
            </button>
            <button type="button" className="btn btn-secondary">
              Preview
            </button>
            <button type="button" className="btn btn-secondary">
              Export PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Section Panel Sub-Component ────────────────────────────────────────────

interface FormSectionPanelProps {
  section: FormSection;
  fields: Record<string, FormFieldValue>;
  autoFillCount: number;
  locks: Record<string, { lockedBy: string; lockedByName: string }>;
  onChange: (fieldId: string, value: string | string[] | boolean | null) => void;
  onFocus: (fieldId: string) => void;
  onBlur: (fieldId: string) => void;
  onRevert: (fieldId: string) => void;
}

const FormSectionPanel: React.FC<FormSectionPanelProps> = ({
  section,
  fields,
  autoFillCount,
  locks,
  onChange,
  onFocus,
  onBlur,
  onRevert,
}) => {
  return (
    <section className="panel form-editor__section">
      <div className="form-editor__section-header">
        <span className="form-editor__section-icon">{section.icon}</span>
        <h2 className="form-editor__section-title">{section.title}</h2>
        {autoFillCount > 0 && (
          <span className="form-editor__autofill-badge">
            ⚡ {autoFillCount}
          </span>
        )}
      </div>

      <div className="form-editor__section-fields">
        {section.fields.map((fieldDef) => {
          const fieldValue = fields[fieldDef.id] || {
            value: null,
            source: 'manual' as const,
            isOverridden: false,
            autoFillValue: null,
            lastModifiedBy: '',
            lastModifiedAt: null,
          };

          const lockInfo = locks[fieldDef.id];

          return (
            <div
              key={fieldDef.id}
              onFocus={() => onFocus(fieldDef.id)}
            >
              <FormFieldRenderer
                field={fieldDef}
                value={fieldValue}
                onChange={onChange}
                onBlur={onBlur}
                disabled={false}
                locked={!!lockInfo}
                lockedByName={lockInfo?.lockedByName}
                onRevert={onRevert}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
