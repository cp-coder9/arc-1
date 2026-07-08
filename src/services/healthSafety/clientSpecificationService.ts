/**
 * Client H&S Specification Service
 *
 * Implements the Regulation 5(1) wizard logic for Client H&S Specifications.
 * Guides Clients through creating a project Health and Safety Specification
 * before appointing contractors.
 *
 * Satisfies Requirements: 3.1, 3.2, 3.3, 3.4
 */

import type { ClientHSSpecification } from './hsTypes';
import { ADVISORY_DISCLAIMER } from './hsConstants';

/**
 * Creates a new, empty Client H&S Specification for a project.
 * All string fields initialised as empty strings, arrays as empty arrays.
 *
 * @param projectId - The project to create the specification for
 * @returns A new ClientHSSpecification with a unique ID and current timestamps
 */
export function createSpecification(projectId: string): ClientHSSpecification {
  const now = new Date().toISOString();

  return {
    id: `hs-spec-${Date.now()}`,
    projectId,
    projectDescription: '',
    scopeOfWork: '',
    knownHazards: [],
    minimumHSRequirements: [],
    complianceMonitoringArrangements: '',
    completedAt: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates a single step/field of the Client H&S Specification.
 * Updates the updatedAt timestamp on every change.
 *
 * @param spec - The current specification to update
 * @param step - The field name to update (excludes id, createdAt, updatedAt, completedAt)
 * @param value - The new value for the field
 * @returns The updated specification with new updatedAt timestamp
 */
export function updateSpecificationStep(
  spec: ClientHSSpecification,
  step: keyof Omit<ClientHSSpecification, 'id' | 'createdAt' | 'updatedAt' | 'completedAt'>,
  value: unknown
): ClientHSSpecification {
  return {
    ...spec,
    [step]: value,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Checks whether all required fields of the specification are complete.
 * A specification is complete when:
 * - projectDescription is a non-empty string
 * - scopeOfWork is a non-empty string
 * - knownHazards has at least 1 item
 * - minimumHSRequirements has at least 1 item
 * - complianceMonitoringArrangements is a non-empty string
 *
 * @param spec - The specification to check
 * @returns true if all required fields are non-empty
 */
export function isSpecificationComplete(spec: ClientHSSpecification): boolean {
  return (
    spec.projectDescription.length > 0 &&
    spec.scopeOfWork.length > 0 &&
    spec.knownHazards.length >= 1 &&
    spec.minimumHSRequirements.length >= 1 &&
    spec.complianceMonitoringArrangements.length > 0
  );
}

/**
 * Generates a formatted specification document containing ALL fields from the specification.
 * Includes section headers and the advisory disclaimer.
 *
 * @param spec - The specification to generate a document from
 * @returns A formatted string containing all specification content and advisory disclaimer
 */
export function generateSpecificationDocument(spec: ClientHSSpecification): string {
  const sections: string[] = [];

  sections.push('=== CLIENT HEALTH & SAFETY SPECIFICATION ===');
  sections.push(`Regulation 5(1) — Construction Regulations 2014`);
  sections.push('');

  sections.push('--- Project Description ---');
  sections.push(spec.projectDescription);
  sections.push('');

  sections.push('--- Scope of Work ---');
  sections.push(spec.scopeOfWork);
  sections.push('');

  sections.push('--- Known Hazards ---');
  for (const hazard of spec.knownHazards) {
    sections.push(`• ${hazard}`);
  }
  sections.push('');

  sections.push('--- Minimum Health & Safety Requirements ---');
  for (const requirement of spec.minimumHSRequirements) {
    sections.push(`• ${requirement}`);
  }
  sections.push('');

  sections.push('--- Compliance Monitoring Arrangements ---');
  sections.push(spec.complianceMonitoringArrangements);
  sections.push('');

  sections.push('--- Disclaimer ---');
  sections.push(ADVISORY_DISCLAIMER);

  return sections.join('\n');
}
