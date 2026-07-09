// ─── Form Validation Service ────────────────────────────────────────────────
// Validates form field values for the Integrated Form System.
// Covers SA ID numbers (Luhn), SACAP registration format, geographic context
// validation, required field enforcement for export, and per-field inline validation.
// Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6

import type {
  ValidationResult,
  ValidationError,
  FormFieldDefinition,
  FormSchema,
  FieldType,
} from '@/services/forms/formTypes';

// ─── Municipality Profile ───────────────────────────────────────────────────

export interface MunicipalityProfile {
  id: string;
  name: string;
  knownErfNumbers?: string[];
  knownTownships?: string[];
}

// ─── Validation Context ─────────────────────────────────────────────────────

export interface ValidationContext {
  municipalityProfile?: MunicipalityProfile;
}

// ─── SA ID Number Validation (Requirement 15.1) ─────────────────────────────
// South African ID: 13 digits, last digit is a Luhn check digit.

export function validateSAId(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false;
  return luhnCheck(value);
}

function luhnCheck(digits: string): boolean {
  let sum = 0;
  const length = digits.length;

  for (let i = 0; i < length; i++) {
    let digit = parseInt(digits[length - 1 - i], 10);

    // Double every second digit (from the right, starting at index 1)
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
  }

  return sum % 10 === 0;
}

// ─── SACAP Registration Validation (Requirement 15.2) ───────────────────────
// Format: prefix (PrArch, PrSArch, PrTechArch, SrArchTech, CandArch)
// followed by optional space and 1-10 digits.

const SACAP_PATTERN = /^(PrArch|PrSArch|PrTechArch|SrArchTech|CandArch)\s?\d{1,10}$/i;

export function validateSACAPReg(value: string): boolean {
  return SACAP_PATTERN.test(value);
}

// ─── Geographic Validation (Requirements 15.4, 15.6) ────────────────────────
// Validates erf numbers and township names against MunicipalityProfile when available.
// If no geographic context is available, accept manually entered values without validation.

function validateErfNumber(
  value: string,
  municipalityProfile?: MunicipalityProfile
): boolean {
  // Requirement 15.6: If no geographic context, accept any non-empty value
  if (!municipalityProfile) return true;

  // Requirement 15.4: Validate against known erf numbers
  if (!municipalityProfile.knownErfNumbers || municipalityProfile.knownErfNumbers.length === 0) {
    return true;
  }

  return municipalityProfile.knownErfNumbers.some(
    (known) => known.toLowerCase() === value.toLowerCase()
  );
}

function validateTownship(
  value: string,
  municipalityProfile?: MunicipalityProfile
): boolean {
  // Requirement 15.6: If no geographic context, accept any non-empty value
  if (!municipalityProfile) return true;

  // Requirement 15.4: Validate against known townships
  if (!municipalityProfile.knownTownships || municipalityProfile.knownTownships.length === 0) {
    return true;
  }

  return municipalityProfile.knownTownships.some(
    (known) => known.toLowerCase() === value.toLowerCase()
  );
}

// ─── Per-Field Inline Validation (Requirement 15.5) ─────────────────────────
// Validates a single field on blur. Returns a ValidationError or null.
// Does NOT block continued editing of other fields.

export function validateField(
  field: FormFieldDefinition,
  value: string | null,
  context?: ValidationContext
): ValidationError | null {
  const trimmedValue = value?.trim() ?? '';

  // Required field check
  if (field.required && trimmedValue === '') {
    return {
      fieldId: field.id,
      fieldLabel: field.label,
      section: '', // Section context provided by caller if needed
      rule: 'required',
      message: `${field.label} is required`,
    };
  }

  // Skip format validation for empty non-required fields
  if (trimmedValue === '') return null;

  // Dispatch validation by field type
  return validateByFieldType(field, trimmedValue, context);
}

function validateByFieldType(
  field: FormFieldDefinition,
  value: string,
  context?: ValidationContext
): ValidationError | null {
  const fieldType: FieldType = field.type;

  switch (fieldType) {
    case 'id_number':
      if (!validateSAId(value)) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'sa_id_format',
          message: 'Invalid SA ID number. Must be 13 digits with a valid check digit.',
        };
      }
      break;

    case 'sacap_reg':
      if (!validateSACAPReg(value)) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'sacap_format',
          message: 'Invalid SACAP registration. Expected format: prefix (e.g., PrArch) followed by up to 10 digits.',
        };
      }
      break;

    case 'erf_number':
      if (!validateErfNumber(value, context?.municipalityProfile)) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'erf_not_found',
          message: `Erf number "${value}" not found in the municipality profile. Please verify the entry.`,
        };
      }
      // Also validate township if the field has validation rules referencing township
      break;

    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'email_format',
          message: 'Invalid email address format.',
        };
      }
      break;

    case 'phone':
      // Basic SA phone validation: 10 digits or international format
      if (!/^(\+?\d{1,4}[\s-]?)?\d{9,12}$/.test(value.replace(/[\s()-]/g, ''))) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'phone_format',
          message: 'Invalid phone number format.',
        };
      }
      break;

    default:
      break;
  }

  // Check custom validation rules from the field definition
  if (field.validation) {
    for (const rule of field.validation) {
      const error = applyValidationRule(field, value, rule);
      if (error) return error;
    }
  }

  return null;
}

function applyValidationRule(
  field: FormFieldDefinition,
  value: string,
  rule: { type: string; value?: string | number | boolean; message: string }
): ValidationError | null {
  switch (rule.type) {
    case 'min_length':
      if (typeof rule.value === 'number' && value.length < rule.value) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'min_length',
          message: rule.message,
        };
      }
      break;

    case 'max_length':
      if (typeof rule.value === 'number' && value.length > rule.value) {
        return {
          fieldId: field.id,
          fieldLabel: field.label,
          section: '',
          rule: 'max_length',
          message: rule.message,
        };
      }
      break;

    case 'pattern':
      if (typeof rule.value === 'string') {
        const regex = new RegExp(rule.value);
        if (!regex.test(value)) {
          return {
            fieldId: field.id,
            fieldLabel: field.label,
            section: '',
            rule: 'pattern',
            message: rule.message,
          };
        }
      }
      break;

    case 'township':
      // Township validation against municipality profile
      // Handled separately via context
      break;

    default:
      break;
  }

  return null;
}

// ─── Export Validation (Requirement 15.3) ────────────────────────────────────
// Validates all required fields for export. Blocks export if any required fields
// are empty. Returns full list of missing required fields with field label and section.

export function validateForExport(
  fields: Record<string, { value: string | null }>,
  fieldDefinitions: FormFieldDefinition[],
  sectionName: string
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const fieldDef of fieldDefinitions) {
    if (!fieldDef.required) continue;

    const fieldData = fields[fieldDef.id];
    const value = fieldData?.value?.trim() ?? '';

    if (value === '') {
      errors.push({
        fieldId: fieldDef.id,
        fieldLabel: fieldDef.label,
        section: sectionName,
        rule: 'required_for_export',
        message: `${fieldDef.label} is required for export`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Full Form Validation ───────────────────────────────────────────────────
// Validates all fields across all sections. Used for comprehensive validation
// before export or signature application.

export function validateAllFields(
  fields: Record<string, { value: string | null }>,
  schema: FormSchema,
  context?: ValidationContext
): ValidationResult {
  const errors: ValidationError[] = [];

  for (const section of schema.sections) {
    for (const fieldDef of section.fields) {
      const fieldData = fields[fieldDef.id];
      const value = fieldData?.value ?? null;

      const error = validateField(fieldDef, value, context);
      if (error) {
        // Enrich with section context
        errors.push({
          ...error,
          section: section.title,
        });
      }

      // Additional geographic validation for address-type fields
      // that may contain township data (handled via custom validation rules)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── Township Validation Helper ─────────────────────────────────────────────
// Exported for use by the form editor when validating township fields inline.

export function validateTownshipValue(
  value: string,
  municipalityProfile?: MunicipalityProfile
): boolean {
  return validateTownship(value, municipalityProfile);
}

// ─── Erf Number Validation Helper ───────────────────────────────────────────
// Exported for use by the form editor when validating erf number fields inline.

export function validateErfNumberValue(
  value: string,
  municipalityProfile?: MunicipalityProfile
): boolean {
  return validateErfNumber(value, municipalityProfile);
}
