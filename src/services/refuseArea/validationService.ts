/**
 * Municipal Refuse Area Calculator — Validation Service
 *
 * Provides field-level validation with inline error messages for UI display.
 * Wraps Zod schemas from ./schemas.ts but returns UI-friendly error strings.
 *
 * Requirements: 2.6, 2.7, 2.8, 2.9
 */

import type { BuildingType, BuildingInputs } from './types';

// --- Field Validation Rules ---

interface FieldRule {
  min: number;
  max: number;
  integer?: boolean;
}

const FIELD_RULES: Record<string, Record<string, FieldRule>> = {
  residential: {
    unitCount: { min: 1, max: 10_000, integer: true },
    averageOccupantsPerUnit: { min: 1, max: 20 },
  },
  commercial: {
    grossFloorArea: { min: 1, max: 500_000 },
    estimatedOccupantCount: { min: 1, max: 100_000, integer: true },
  },
  industrial: {
    grossFloorArea: { min: 1, max: 500_000 },
    numberOfEmployees: { min: 1, max: 50_000, integer: true },
    wasteGenerationCategory: { min: 0, max: 0 }, // enum — handled separately
  },
};

// --- Helpers ---

/**
 * Check that a number has at most 2 decimal places.
 */
function hasMaxTwoDecimalPlaces(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const scaled = Math.round(value * 100);
  return Math.abs(scaled - value * 100) < 1e-9;
}

const VALID_WASTE_CATEGORIES = ['light', 'medium', 'heavy'];

// --- Public API ---

/**
 * Validates a single field and returns an inline error message or null if valid.
 *
 * @param fieldName - The field name to validate (e.g. 'unitCount', 'grossFloorArea')
 * @param value - The current field value
 * @param buildingType - The building type context for looking up validation rules
 * @returns null if valid, or an error message string
 */
export function validateField(
  fieldName: string,
  value: unknown,
  buildingType: BuildingType
): string | null {
  // Handle wasteGenerationCategory as a special enum field
  if (fieldName === 'wasteGenerationCategory') {
    if (value === undefined || value === null || value === '') {
      return 'Required';
    }
    if (!VALID_WASTE_CATEGORIES.includes(value as string)) {
      return 'Required';
    }
    return null;
  }

  // Look up the field rule for the given building type
  const typeRules = FIELD_RULES[buildingType === 'mixed-use' ? 'residential' : buildingType];
  const rule = typeRules?.[fieldName];

  // If no rule found, try all types (for mixed-use component fields)
  const effectiveRule =
    rule ??
    FIELD_RULES.residential[fieldName] ??
    FIELD_RULES.commercial[fieldName] ??
    FIELD_RULES.industrial[fieldName];

  if (!effectiveRule) {
    return null; // Unknown field — no validation
  }

  // Check required
  if (value === undefined || value === null || value === '') {
    return 'Required';
  }

  const numValue = typeof value === 'string' ? Number(value) : (value as number);

  // Check it's a valid number
  if (typeof numValue !== 'number' || isNaN(numValue)) {
    return 'Required';
  }

  // Check bounds
  if (numValue < effectiveRule.min || numValue > effectiveRule.max) {
    return `Must be between ${effectiveRule.min} and ${effectiveRule.max}`;
  }

  // Check decimal places
  if (!hasMaxTwoDecimalPlaces(numValue)) {
    return 'Maximum 2 decimal places';
  }

  return null;
}

/**
 * Validates all building inputs and returns a map of field paths to error messages.
 * Returns an empty object if all fields are valid.
 *
 * @param inputs - The complete building inputs to validate
 * @returns Record of field paths to error messages (empty if valid)
 */
export function validateBuildingInputs(inputs: BuildingInputs): Record<string, string> {
  const errors: Record<string, string> = {};

  switch (inputs.type) {
    case 'residential': {
      const unitCountErr = validateField('unitCount', inputs.data.unitCount, 'residential');
      if (unitCountErr) errors['unitCount'] = unitCountErr;

      const occupantsErr = validateField(
        'averageOccupantsPerUnit',
        inputs.data.averageOccupantsPerUnit,
        'residential'
      );
      if (occupantsErr) errors['averageOccupantsPerUnit'] = occupantsErr;
      break;
    }

    case 'commercial': {
      const floorAreaErr = validateField('grossFloorArea', inputs.data.grossFloorArea, 'commercial');
      if (floorAreaErr) errors['grossFloorArea'] = floorAreaErr;

      const occupantErr = validateField(
        'estimatedOccupantCount',
        inputs.data.estimatedOccupantCount,
        'commercial'
      );
      if (occupantErr) errors['estimatedOccupantCount'] = occupantErr;
      break;
    }

    case 'industrial': {
      const floorAreaErr = validateField(
        'grossFloorArea',
        inputs.data.grossFloorArea,
        'industrial'
      );
      if (floorAreaErr) errors['grossFloorArea'] = floorAreaErr;

      const employeesErr = validateField(
        'numberOfEmployees',
        inputs.data.numberOfEmployees,
        'industrial'
      );
      if (employeesErr) errors['numberOfEmployees'] = employeesErr;

      const categoryErr = validateField(
        'wasteGenerationCategory',
        inputs.data.wasteGenerationCategory,
        'industrial'
      );
      if (categoryErr) errors['wasteGenerationCategory'] = categoryErr;
      break;
    }

    case 'mixed-use': {
      // Validate component count
      if (!inputs.data.components || inputs.data.components.length < 2) {
        errors['components'] = 'At least two usage components required';
      }

      // Validate each component's fields
      if (inputs.data.components) {
        for (let i = 0; i < inputs.data.components.length; i++) {
          const component = inputs.data.components[i];
          const prefix = `components[${i}]`;

          switch (component.type) {
            case 'residential': {
              const res = component.inputs as { unitCount: number; averageOccupantsPerUnit: number };
              const unitErr = validateField('unitCount', res.unitCount, 'residential');
              if (unitErr) errors[`${prefix}.unitCount`] = unitErr;

              const occErr = validateField(
                'averageOccupantsPerUnit',
                res.averageOccupantsPerUnit,
                'residential'
              );
              if (occErr) errors[`${prefix}.averageOccupantsPerUnit`] = occErr;
              break;
            }

            case 'commercial': {
              const com = component.inputs as {
                grossFloorArea: number;
                estimatedOccupantCount: number;
              };
              const faErr = validateField('grossFloorArea', com.grossFloorArea, 'commercial');
              if (faErr) errors[`${prefix}.grossFloorArea`] = faErr;

              const ocErr = validateField(
                'estimatedOccupantCount',
                com.estimatedOccupantCount,
                'commercial'
              );
              if (ocErr) errors[`${prefix}.estimatedOccupantCount`] = ocErr;
              break;
            }

            case 'industrial': {
              const ind = component.inputs as {
                grossFloorArea: number;
                numberOfEmployees: number;
                wasteGenerationCategory: string;
              };
              const faErr = validateField('grossFloorArea', ind.grossFloorArea, 'industrial');
              if (faErr) errors[`${prefix}.grossFloorArea`] = faErr;

              const empErr = validateField(
                'numberOfEmployees',
                ind.numberOfEmployees,
                'industrial'
              );
              if (empErr) errors[`${prefix}.numberOfEmployees`] = empErr;

              const catErr = validateField(
                'wasteGenerationCategory',
                ind.wasteGenerationCategory,
                'industrial'
              );
              if (catErr) errors[`${prefix}.wasteGenerationCategory`] = catErr;
              break;
            }
          }
        }
      }
      break;
    }
  }

  return errors;
}

/**
 * Returns true if all fields in the building inputs are valid (empty error map).
 *
 * @param inputs - The complete building inputs to validate
 * @returns true if all fields pass validation
 */
export function isFormValid(inputs: BuildingInputs): boolean {
  const errors = validateBuildingInputs(inputs);
  return Object.keys(errors).length === 0;
}
