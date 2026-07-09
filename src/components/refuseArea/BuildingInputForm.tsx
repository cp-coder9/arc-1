/**
 * BuildingInputForm — Building type selector with conditional input fields.
 *
 * Renders a Building_Type dropdown and corresponding input fields per type.
 * Uses validateField from validationService for inline validation on blur.
 * Disables Calculate button when required fields are empty or invalid.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9
 */

import React, { useState, useCallback } from 'react';
import type {
  BuildingType,
  BuildingInputs,
  WasteCategory,
  MixedUseComponent,
} from '@/services/refuseArea/types';
import { validateField } from '@/services/refuseArea/validationService';

// ── Props ────────────────────────────────────────────────────────────────────

export interface BuildingInputFormProps {
  buildingType: BuildingType | null;
  onBuildingTypeChange: (type: BuildingType) => void;
  onSubmit: (inputs: BuildingInputs) => void;
  disabled?: boolean;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  form: { display: 'flex', flexDirection: 'column' as const, gap: 16 },
  fieldGroup: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  fieldRow: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  label: { fontSize: 12, color: 'var(--muted)', fontWeight: 500 },
  input: {
    padding: '8px 12px',
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
    outline: 'none',
    width: '100%',
  },
  select: {
    padding: '8px 12px',
    fontSize: 13,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'rgba(255,255,255,.7)',
    color: 'var(--ink)',
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
  },
  error: { fontSize: 11, color: 'var(--red)', marginTop: 2 },
  button: {
    padding: '10px 20px',
    fontSize: 13,
    fontWeight: 600,
    border: '1px solid var(--teal)',
    borderRadius: 12,
    background: 'var(--aqua)',
    color: 'var(--deep)',
    cursor: 'pointer',
    height: 36,
  },
  buttonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  componentCard: {
    border: '1px solid var(--border)',
    borderRadius: 12,
    padding: 14,
    background: 'rgba(255,255,255,.5)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  componentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  removeBtn: {
    fontSize: 11,
    color: 'var(--red)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  addBtn: {
    fontSize: 12,
    color: 'var(--deep)',
    background: 'var(--aqua)',
    border: '1px solid var(--teal)',
    borderRadius: 8,
    padding: '6px 12px',
    cursor: 'pointer',
  },
  sectionTitle: { fontSize: 13, fontWeight: 600, color: 'var(--deep)' },
} as const;

// ── Types for internal state ─────────────────────────────────────────────────

interface ResidentialState {
  unitCount: string;
  averageOccupantsPerUnit: string;
}

interface CommercialState {
  grossFloorArea: string;
  estimatedOccupantCount: string;
}

interface IndustrialState {
  grossFloorArea: string;
  numberOfEmployees: string;
  wasteGenerationCategory: WasteCategory | '';
}

interface MixedUseComponentState {
  type: 'residential' | 'commercial' | 'industrial' | '';
  residential: ResidentialState;
  commercial: CommercialState;
  industrial: IndustrialState;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const BUILDING_TYPES: { value: BuildingType; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
  { value: 'mixed-use', label: 'Mixed-Use' },
];

const WASTE_CATEGORIES: { value: WasteCategory; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'heavy', label: 'Heavy' },
];

const COMPONENT_TYPES: { value: 'residential' | 'commercial' | 'industrial'; label: string }[] = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'industrial', label: 'Industrial' },
];

function emptyResidential(): ResidentialState {
  return { unitCount: '', averageOccupantsPerUnit: '' };
}

function emptyCommercial(): CommercialState {
  return { grossFloorArea: '', estimatedOccupantCount: '' };
}

function emptyIndustrial(): IndustrialState {
  return { grossFloorArea: '', numberOfEmployees: '', wasteGenerationCategory: '' };
}

function emptyComponent(): MixedUseComponentState {
  return {
    type: '',
    residential: emptyResidential(),
    commercial: emptyCommercial(),
    industrial: emptyIndustrial(),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export default function BuildingInputForm({
  buildingType,
  onBuildingTypeChange,
  onSubmit,
  disabled = false,
}: BuildingInputFormProps) {
  // Field state per type
  const [residential, setResidential] = useState<ResidentialState>(emptyResidential());
  const [commercial, setCommercial] = useState<CommercialState>(emptyCommercial());
  const [industrial, setIndustrial] = useState<IndustrialState>(emptyIndustrial());
  const [mixedComponents, setMixedComponents] = useState<MixedUseComponentState[]>([
    emptyComponent(),
    emptyComponent(),
  ]);

  // Validation errors: keyed by field path
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Validation on blur ─────────────────────────────────────────────────────

  const handleBlur = useCallback(
    (fieldName: string, value: string, type: BuildingType, errorKey?: string) => {
      const key = errorKey ?? fieldName;
      const error = validateField(fieldName, value === '' ? '' : value, type);
      setErrors((prev) => {
        const next = { ...prev };
        if (error) {
          next[key] = error;
        } else {
          delete next[key];
        }
        return next;
      });
    },
    []
  );

  // ── Form validity check ────────────────────────────────────────────────────

  const isFormValid = useCallback((): boolean => {
    if (!buildingType) return false;

    switch (buildingType) {
      case 'residential':
        return (
          residential.unitCount !== '' &&
          residential.averageOccupantsPerUnit !== '' &&
          !validateField('unitCount', residential.unitCount, 'residential') &&
          !validateField('averageOccupantsPerUnit', residential.averageOccupantsPerUnit, 'residential')
        );

      case 'commercial':
        return (
          commercial.grossFloorArea !== '' &&
          commercial.estimatedOccupantCount !== '' &&
          !validateField('grossFloorArea', commercial.grossFloorArea, 'commercial') &&
          !validateField('estimatedOccupantCount', commercial.estimatedOccupantCount, 'commercial')
        );

      case 'industrial':
        return (
          industrial.grossFloorArea !== '' &&
          industrial.numberOfEmployees !== '' &&
          industrial.wasteGenerationCategory !== '' &&
          !validateField('grossFloorArea', industrial.grossFloorArea, 'industrial') &&
          !validateField('numberOfEmployees', industrial.numberOfEmployees, 'industrial') &&
          !validateField('wasteGenerationCategory', industrial.wasteGenerationCategory, 'industrial')
        );

      case 'mixed-use': {
        if (mixedComponents.length < 2) return false;
        return mixedComponents.every((comp) => {
          if (!comp.type) return false;
          switch (comp.type) {
            case 'residential':
              return (
                comp.residential.unitCount !== '' &&
                comp.residential.averageOccupantsPerUnit !== '' &&
                !validateField('unitCount', comp.residential.unitCount, 'residential') &&
                !validateField('averageOccupantsPerUnit', comp.residential.averageOccupantsPerUnit, 'residential')
              );
            case 'commercial':
              return (
                comp.commercial.grossFloorArea !== '' &&
                comp.commercial.estimatedOccupantCount !== '' &&
                !validateField('grossFloorArea', comp.commercial.grossFloorArea, 'commercial') &&
                !validateField('estimatedOccupantCount', comp.commercial.estimatedOccupantCount, 'commercial')
              );
            case 'industrial':
              return (
                comp.industrial.grossFloorArea !== '' &&
                comp.industrial.numberOfEmployees !== '' &&
                comp.industrial.wasteGenerationCategory !== '' &&
                !validateField('grossFloorArea', comp.industrial.grossFloorArea, 'industrial') &&
                !validateField('numberOfEmployees', comp.industrial.numberOfEmployees, 'industrial') &&
                !validateField('wasteGenerationCategory', comp.industrial.wasteGenerationCategory, 'industrial')
              );
            default:
              return false;
          }
        });
      }

      default:
        return false;
    }
  }, [buildingType, residential, commercial, industrial, mixedComponents]);

  // ── Submit handler ─────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!buildingType || !isFormValid()) return;

      let inputs: BuildingInputs;

      switch (buildingType) {
        case 'residential':
          inputs = {
            type: 'residential',
            data: {
              unitCount: Number(residential.unitCount),
              averageOccupantsPerUnit: Number(residential.averageOccupantsPerUnit),
            },
          };
          break;
        case 'commercial':
          inputs = {
            type: 'commercial',
            data: {
              grossFloorArea: Number(commercial.grossFloorArea),
              estimatedOccupantCount: Number(commercial.estimatedOccupantCount),
            },
          };
          break;
        case 'industrial':
          inputs = {
            type: 'industrial',
            data: {
              grossFloorArea: Number(industrial.grossFloorArea),
              numberOfEmployees: Number(industrial.numberOfEmployees),
              wasteGenerationCategory: industrial.wasteGenerationCategory as WasteCategory,
            },
          };
          break;
        case 'mixed-use': {
          const components: MixedUseComponent[] = mixedComponents.map((comp) => {
            switch (comp.type) {
              case 'residential':
                return {
                  type: 'residential' as const,
                  inputs: {
                    unitCount: Number(comp.residential.unitCount),
                    averageOccupantsPerUnit: Number(comp.residential.averageOccupantsPerUnit),
                  },
                };
              case 'commercial':
                return {
                  type: 'commercial' as const,
                  inputs: {
                    grossFloorArea: Number(comp.commercial.grossFloorArea),
                    estimatedOccupantCount: Number(comp.commercial.estimatedOccupantCount),
                  },
                };
              case 'industrial':
                return {
                  type: 'industrial' as const,
                  inputs: {
                    grossFloorArea: Number(comp.industrial.grossFloorArea),
                    numberOfEmployees: Number(comp.industrial.numberOfEmployees),
                    wasteGenerationCategory: comp.industrial.wasteGenerationCategory as WasteCategory,
                  },
                };
              default:
                // Should not happen given isFormValid check
                return {
                  type: 'residential' as const,
                  inputs: { unitCount: 0, averageOccupantsPerUnit: 0 },
                };
            }
          });
          inputs = { type: 'mixed-use', data: { components } };
          break;
        }
      }

      onSubmit(inputs);
    },
    [buildingType, residential, commercial, industrial, mixedComponents, isFormValid, onSubmit]
  );

  // ── Building type change handler ───────────────────────────────────────────

  const handleBuildingTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value as BuildingType;
      setErrors({});
      onBuildingTypeChange(value);
    },
    [onBuildingTypeChange]
  );

  // ── Mixed-use component handlers ───────────────────────────────────────────

  const addComponent = useCallback(() => {
    setMixedComponents((prev) => [...prev, emptyComponent()]);
  }, []);

  const removeComponent = useCallback((index: number) => {
    setMixedComponents((prev) => {
      if (prev.length <= 2) return prev; // minimum 2 components
      return prev.filter((_, i) => i !== index);
    });
    // Clean up errors for removed component
    setErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(`components[${index}]`)) {
          delete next[key];
        }
      });
      return next;
    });
  }, []);

  const updateComponentType = useCallback(
    (index: number, type: 'residential' | 'commercial' | 'industrial' | '') => {
      setMixedComponents((prev) =>
        prev.map((comp, i) => (i === index ? { ...comp, type } : comp))
      );
      // Clear errors for this component
      setErrors((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((key) => {
          if (key.startsWith(`components[${index}]`)) {
            delete next[key];
          }
        });
        return next;
      });
    },
    []
  );

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderField = (
    label: string,
    fieldName: string,
    value: string,
    onChange: (val: string) => void,
    onBlurFn: () => void,
    errorKey: string,
    type: 'number' | 'text' = 'number',
    placeholder?: string
  ) => (
    <div style={styles.fieldRow}>
      <label style={styles.label}>{label}</label>
      <input
        type={type}
        style={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlurFn}
        placeholder={placeholder}
        disabled={disabled}
      />
      {errors[errorKey] && <span style={styles.error}>{errors[errorKey]}</span>}
    </div>
  );

  const renderResidentialFields = (
    state: ResidentialState,
    setState: (fn: (s: ResidentialState) => ResidentialState) => void,
    keyPrefix = ''
  ) => (
    <div style={styles.fieldGroup}>
      {renderField(
        'Unit Count',
        'unitCount',
        state.unitCount,
        (val) => setState((s) => ({ ...s, unitCount: val })),
        () => handleBlur('unitCount', state.unitCount, 'residential', `${keyPrefix}unitCount`),
        `${keyPrefix}unitCount`,
        'number',
        '1–10,000'
      )}
      {renderField(
        'Average Occupants per Unit',
        'averageOccupantsPerUnit',
        state.averageOccupantsPerUnit,
        (val) => setState((s) => ({ ...s, averageOccupantsPerUnit: val })),
        () =>
          handleBlur(
            'averageOccupantsPerUnit',
            state.averageOccupantsPerUnit,
            'residential',
            `${keyPrefix}averageOccupantsPerUnit`
          ),
        `${keyPrefix}averageOccupantsPerUnit`,
        'number',
        '1–20'
      )}
    </div>
  );

  const renderCommercialFields = (
    state: CommercialState,
    setState: (fn: (s: CommercialState) => CommercialState) => void,
    keyPrefix = ''
  ) => (
    <div style={styles.fieldGroup}>
      {renderField(
        'Gross Floor Area (m²)',
        'grossFloorArea',
        state.grossFloorArea,
        (val) => setState((s) => ({ ...s, grossFloorArea: val })),
        () => handleBlur('grossFloorArea', state.grossFloorArea, 'commercial', `${keyPrefix}grossFloorArea`),
        `${keyPrefix}grossFloorArea`,
        'number',
        '1–500,000'
      )}
      {renderField(
        'Estimated Occupant Count',
        'estimatedOccupantCount',
        state.estimatedOccupantCount,
        (val) => setState((s) => ({ ...s, estimatedOccupantCount: val })),
        () =>
          handleBlur(
            'estimatedOccupantCount',
            state.estimatedOccupantCount,
            'commercial',
            `${keyPrefix}estimatedOccupantCount`
          ),
        `${keyPrefix}estimatedOccupantCount`,
        'number',
        '1–100,000'
      )}
    </div>
  );

  const renderIndustrialFields = (
    state: IndustrialState,
    setState: (fn: (s: IndustrialState) => IndustrialState) => void,
    keyPrefix = ''
  ) => (
    <div style={styles.fieldGroup}>
      {renderField(
        'Gross Floor Area (m²)',
        'grossFloorArea',
        state.grossFloorArea,
        (val) => setState((s) => ({ ...s, grossFloorArea: val })),
        () => handleBlur('grossFloorArea', state.grossFloorArea, 'industrial', `${keyPrefix}grossFloorArea`),
        `${keyPrefix}grossFloorArea`,
        'number',
        '1–500,000'
      )}
      {renderField(
        'Number of Employees',
        'numberOfEmployees',
        state.numberOfEmployees,
        (val) => setState((s) => ({ ...s, numberOfEmployees: val })),
        () =>
          handleBlur('numberOfEmployees', state.numberOfEmployees, 'industrial', `${keyPrefix}numberOfEmployees`),
        `${keyPrefix}numberOfEmployees`,
        'number',
        '1–50,000'
      )}
      <div style={styles.fieldRow}>
        <label style={styles.label}>Waste Generation Category</label>
        <select
          style={styles.select}
          value={state.wasteGenerationCategory}
          onChange={(e) => setState((s) => ({ ...s, wasteGenerationCategory: e.target.value as WasteCategory | '' }))}
          onBlur={() =>
            handleBlur(
              'wasteGenerationCategory',
              state.wasteGenerationCategory,
              'industrial',
              `${keyPrefix}wasteGenerationCategory`
            )
          }
          disabled={disabled}
        >
          <option value="">Select category…</option>
          {WASTE_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
        {errors[`${keyPrefix}wasteGenerationCategory`] && (
          <span style={styles.error}>{errors[`${keyPrefix}wasteGenerationCategory`]}</span>
        )}
      </div>
    </div>
  );

  const renderMixedUseFields = () => (
    <div style={styles.fieldGroup}>
      {mixedComponents.map((comp, index) => (
        <div key={index} style={styles.componentCard}>
          <div style={styles.componentHeader}>
            <span style={styles.sectionTitle}>Component {index + 1}</span>
            {mixedComponents.length > 2 && (
              <button
                type="button"
                style={styles.removeBtn}
                onClick={() => removeComponent(index)}
                disabled={disabled}
              >
                Remove
              </button>
            )}
          </div>
          <div style={styles.fieldRow}>
            <label style={styles.label}>Usage Type</label>
            <select
              style={styles.select}
              value={comp.type}
              onChange={(e) =>
                updateComponentType(
                  index,
                  e.target.value as 'residential' | 'commercial' | 'industrial' | ''
                )
              }
              disabled={disabled}
            >
              <option value="">Select type…</option>
              {COMPONENT_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </div>

          {comp.type === 'residential' &&
            renderResidentialFields(
              comp.residential,
              (fn) => {
                setMixedComponents((prev) =>
                  prev.map((c, i) =>
                    i === index ? { ...c, residential: fn(c.residential) } : c
                  )
                );
              },
              `components[${index}].`
            )}

          {comp.type === 'commercial' &&
            renderCommercialFields(
              comp.commercial,
              (fn) => {
                setMixedComponents((prev) =>
                  prev.map((c, i) =>
                    i === index ? { ...c, commercial: fn(c.commercial) } : c
                  )
                );
              },
              `components[${index}].`
            )}

          {comp.type === 'industrial' &&
            renderIndustrialFields(
              comp.industrial,
              (fn) => {
                setMixedComponents((prev) =>
                  prev.map((c, i) =>
                    i === index ? { ...c, industrial: fn(c.industrial) } : c
                  )
                );
              },
              `components[${index}].`
            )}
        </div>
      ))}

      <button type="button" style={styles.addBtn} onClick={addComponent} disabled={disabled}>
        + Add Component
      </button>

      {mixedComponents.length < 2 && (
        <span style={styles.error}>At least two usage components required</span>
      )}
    </div>
  );

  // ── Main render ────────────────────────────────────────────────────────────

  const valid = isFormValid();

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      {/* Building Type selector */}
      <div style={styles.fieldRow}>
        <label style={styles.label}>Building Type</label>
        <select
          style={styles.select}
          value={buildingType ?? ''}
          onChange={handleBuildingTypeChange}
          disabled={disabled}
        >
          <option value="">Select building type…</option>
          {BUILDING_TYPES.map((bt) => (
            <option key={bt.value} value={bt.value}>
              {bt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Conditional field groups */}
      {buildingType === 'residential' &&
        renderResidentialFields(residential, (fn) => setResidential(fn))}

      {buildingType === 'commercial' &&
        renderCommercialFields(commercial, (fn) => setCommercial(fn))}

      {buildingType === 'industrial' &&
        renderIndustrialFields(industrial, (fn) => setIndustrial(fn))}

      {buildingType === 'mixed-use' && renderMixedUseFields()}

      {/* Calculate button */}
      {buildingType && (
        <button
          type="submit"
          className="btn"
          style={{
            ...styles.button,
            ...((!valid || disabled) ? styles.buttonDisabled : {}),
          }}
          disabled={!valid || disabled}
        >
          Calculate
        </button>
      )}
    </form>
  );
}
