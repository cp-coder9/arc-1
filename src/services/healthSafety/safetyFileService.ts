/**
 * Safety File Builder — Core Logic
 *
 * Manages Safety File composition, section versioning, compliance score calculation,
 * and compliance event generation per Construction Regulations 2014 (Regulation 7).
 */

import type { SafetyFile, SafetyFileSection } from './hsTypes';
import type { WorkflowEvent } from '../lifecycleTypes';
import { MANDATORY_SAFETY_FILE_SECTIONS, ADVISORY_DISCLAIMER } from './hsConstants';
import { NotFoundError } from './hsErrors';

/**
 * Initialises a new Safety File for a project with all mandatory Regulation 7 sections.
 * Each section starts as 'incomplete' with version 0.
 */
export function initialiseSafetyFile(projectId: string, tenantId: string): SafetyFile {
  const now = new Date().toISOString();

  const sections: SafetyFileSection[] = MANDATORY_SAFETY_FILE_SECTIONS.map((s) => ({
    sectionId: s.sectionId,
    title: s.title,
    regulationRef: s.regulationRef,
    status: 'incomplete' as const,
    version: 0,
    linkedRecordIds: [],
  }));

  return {
    id: `hs-sf-${Date.now()}`,
    projectId,
    tenantId,
    sections,
    complianceScore: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Updates a specific section within the Safety File.
 * Increments the section version by 1, records actor and timestamp.
 *
 * @throws NotFoundError if the sectionId does not exist in the file.
 */
export function updateSection(
  file: SafetyFile,
  sectionId: string,
  update: Partial<SafetyFileSection>,
  actorId: string
): SafetyFile {
  const sectionIndex = file.sections.findIndex((s) => s.sectionId === sectionId);

  if (sectionIndex === -1) {
    throw new NotFoundError('SafetyFileSection', sectionId);
  }

  const existingSection = file.sections[sectionIndex];
  const now = new Date().toISOString();

  const updatedSection: SafetyFileSection = {
    ...existingSection,
    ...update,
    version: existingSection.version + 1,
    updatedBy: actorId,
    lastUpdated: now,
  };

  const updatedSections = [...file.sections];
  updatedSections[sectionIndex] = updatedSection;

  return {
    ...file,
    sections: updatedSections,
    updatedAt: now,
  };
}

/**
 * Calculates the compliance score as a percentage of complete mandatory sections.
 * Sections marked 'not_applicable' are excluded from the total.
 * Returns 100 if all applicable sections are excluded (N = 0).
 */
export function calculateComplianceScore(file: SafetyFile): number {
  const applicableSections = file.sections.filter((s) => s.status !== 'not_applicable');
  const totalMandatory = applicableSections.length;

  if (totalMandatory === 0) {
    return 100;
  }

  const completeSections = applicableSections.filter((s) => s.status === 'complete').length;
  return Math.round((completeSections / totalMandatory) * 100);
}

/**
 * Returns sections that are 'incomplete' or 'expired'.
 * Sections marked 'not_applicable' are excluded.
 */
export function getMissingSections(file: SafetyFile): SafetyFileSection[] {
  return file.sections.filter(
    (s) => s.status === 'incomplete' || s.status === 'expired'
  );
}

/**
 * Generates compliance workflow events when the score changes.
 * Returns an array with one event if the score changed, or an empty array if unchanged.
 * Includes ADVISORY_DISCLAIMER in the event detail.
 */
export function generateComplianceEvents(
  file: SafetyFile,
  previousScore: number
): WorkflowEvent[] {
  const currentScore = calculateComplianceScore(file);

  if (currentScore === previousScore) {
    return [];
  }

  const event: WorkflowEvent = {
    id: `evt-compliance-${file.id}-${Date.now()}`,
    type: 'risk_detected' as WorkflowEvent['type'],
    projectId: file.projectId,
    title: `Safety File compliance score changed: ${previousScore}% → ${currentScore}%`,
    detail: `Compliance score updated from ${previousScore}% to ${currentScore}%. ${ADVISORY_DISCLAIMER}`,
    priority: currentScore < 50 ? 'high' : 'medium',
    sourceModule: 'health_safety',
    assignedRoles: ['contractor'],
    createdAt: new Date().toISOString(),
  };

  return [event];
}

/**
 * Returns a contractor H&S profile summary for procurement integration.
 */
export function getContractorHSProfile(file: SafetyFile): {
  submissionStatus: string;
  complianceScore: number;
  completeSections: number;
  totalSections: number;
} {
  const applicableSections = file.sections.filter((s) => s.status !== 'not_applicable');
  const completeSections = applicableSections.filter((s) => s.status === 'complete').length;
  const totalSections = applicableSections.length;
  const complianceScore = calculateComplianceScore(file);

  let submissionStatus: string;
  if (complianceScore === 100) {
    submissionStatus = 'complete';
  } else if (complianceScore > 0) {
    submissionStatus = 'partial';
  } else {
    submissionStatus = 'not_started';
  }

  return {
    submissionStatus,
    complianceScore,
    completeSections,
    totalSections,
  };
}
