// ─── FormFieldRenderer Component ────────────────────────────────────────────
// Dispatches FieldType to appropriate HTML input. Renders auto-fill indicator,
// inline validation errors, and lock indicators for collaborative editing.
// Requirements: 3.1, 3.2, 3.3, 13.1, 14.1, 14.2, 15.5

import React, { useState, useCallback } from 'react';
import type { FormFieldDefinition, FormFieldValue, ValidationError } from '@/services/forms/formTypes';
import { validateField } from '@/services/forms/formValidationService';
import AutoFillIndicator, { type AutoFillStatus } from './AutoFillIndicator';

interface FormFieldRendererProps {
  field: FormFieldDefinition;
  value: FormFieldValue;
  onChange: (fieldId: string, newValue: string | string[] | boolean | null) => void;
  onBlur?: (fieldId: string) => void;
  disabled?: boolean;
  locked?: boolean;
  lockedByName?: string;
  onRevert?: (fieldId: string) => void;
}

/**
 * Renders the appropriate input element for a field type, along with:
 * - Auto-fill indicator badge (⚡ Auto / ✎ Override / ⚠ Manual)
 * - Inline validation error on blur
 * - Lock indicator when another user holds the field
 */
export default function FormFieldRenderer({
  field,
  value,
  onChange,
  onBlur,
  disabled = false,
  locked = false,
  lockedByName,
  onRevert,
}: FormFieldRendererProps) {
  const [validationError, setValidationError] = useState<ValidationError | null>(null);

  // Determine auto-fill status for badge
  const autoFillStatus: AutoFillStatus = value.isOverridden
    ? 'override'
    : value.source === 'auto_fill'
      ? 'auto_fill'
      : 'manual_required';

  const handleChange = useCallback(
    (newValue: string | string[] | boolean | null) => {
      onChange(field.id, newValue);
      // Clear validation error on edit
      if (validationError) setValidationError(null);
    },
    [field.id, onChange, validationError]
  );

  const handleBlur = useCallback(() => {
    // Inline validation on blur (Requirement 15.5)
    const stringValue = typeof value.value === 'string' ? value.value : null;
    const error = validateField(field, stringValue);
    setValidationError(error);
    onBlur?.(field.id);
  }, [field, value.value, onBlur]);

  const handleRevert = useCallback(() => {
    onRevert?.(field.id);
  }, [field.id, onRevert]);

  const isDisabled = disabled || locked;

  const currentValue = value.value;

  return (
    <div className="form-field">
      <div className="form-field__header">
        <label className="form-field__label" htmlFor={`field-${field.id}`}>
          {field.label}
          {field.required && <span className="form-field__required">*</span>}
        </label>
        <AutoFillIndicator
          status={autoFillStatus}
          onRevert={value.isOverridden ? handleRevert : undefined}
        />
      </div>

      {locked && lockedByName && (
        <div className="form-field__lock-indicator">
          🔒 Locked by {lockedByName}
        </div>
      )}

      <div className="form-field__input-wrapper">
        {renderInput(field, currentValue, handleChange, handleBlur, isDisabled)}
      </div>

      {validationError && (
        <div className="form-field__error">
          {validationError.message}
        </div>
      )}
    </div>
  );
}

// ─── Input Dispatcher ───────────────────────────────────────────────────────

function renderInput(
  field: FormFieldDefinition,
  value: string | string[] | boolean | null,
  onChange: (val: string | string[] | boolean | null) => void,
  onBlur: () => void,
  disabled: boolean
): React.ReactNode {
  const stringValue = typeof value === 'string' ? value : '';
  const inputId = `field-${field.id}`;

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          id={inputId}
          className="field-input field-input--textarea"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder}
          rows={4}
        />
      );

    case 'number':
      return (
        <input
          id={inputId}
          type="number"
          className="field-input"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      );

    case 'date':
      return (
        <input
          id={inputId}
          type="date"
          className="field-input"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
        />
      );

    case 'select':
      return (
        <select
          id={inputId}
          className="field-input field-input--select"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
        >
          <option value="">{field.placeholder || 'Select...'}</option>
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'multi_select': {
      const selectedValues = Array.isArray(value) ? value : [];
      return (
        <select
          id={inputId}
          className="field-input field-input--select"
          multiple
          value={selectedValues}
          onChange={(e) => {
            const selected = Array.from(e.target.selectedOptions, (o: HTMLOptionElement) => o.value);
            onChange(selected);
          }}
          onBlur={onBlur}
          disabled={disabled}
        >
          {field.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    case 'radio':
      return (
        <div className="field-input--radio-group" role="radiogroup" aria-labelledby={inputId}>
          {field.options?.map((opt) => (
            <label key={opt} className="field-input--radio-label">
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={stringValue === opt}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                disabled={disabled}
              />
              {opt}
            </label>
          ))}
        </div>
      );

    case 'checkbox':
      return (
        <label className="field-input--checkbox-label">
          <input
            id={inputId}
            type="checkbox"
            className="field-input--checkbox"
            checked={value === true || value === 'true'}
            onChange={(e) => onChange(e.target.checked)}
            onBlur={onBlur}
            disabled={disabled}
          />
          {field.label}
        </label>
      );

    case 'id_number':
      return (
        <input
          id={inputId}
          type="text"
          className="field-input field-input--id-number"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder || '13-digit SA ID number'}
          maxLength={13}
          inputMode="numeric"
        />
      );

    case 'sacap_reg':
      return (
        <input
          id={inputId}
          type="text"
          className="field-input field-input--sacap"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder || 'e.g. PrArch 12345'}
        />
      );

    case 'erf_number':
      return (
        <input
          id={inputId}
          type="text"
          className="field-input field-input--erf"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder || 'Erf number'}
        />
      );

    case 'address':
      return (
        <textarea
          id={inputId}
          className="field-input field-input--textarea field-input--address"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder || 'Enter full address'}
          rows={3}
        />
      );

    case 'phone':
      return (
        <input
          id={inputId}
          type="tel"
          className="field-input field-input--phone"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder || '+27...'}
        />
      );

    case 'email':
      return (
        <input
          id={inputId}
          type="email"
          className="field-input field-input--email"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder || 'email@example.com'}
        />
      );

    // Default: text input (covers 'text' and any unrecognized types)
    default:
      return (
        <input
          id={inputId}
          type="text"
          className="field-input"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          disabled={disabled}
          placeholder={field.placeholder}
        />
      );
  }
}
