/**
 * Certificate Service
 *
 * Generates Municipal-Ready Certificates when all prerequisites are met.
 * Checks readiness score, professional sign-offs, pack completeness,
 * and department confidence scores before generating.
 */

import type {
  MunicipalReadyCertificate,
  ProfessionalSignOff,
  DepartmentAssessment,
  SubmissionPack,
  DepartmentId,
} from '@/types/municipalWorkspace';
import type { MunicipalityType } from '@/types';

/**
 * Checks whether all prerequisites for certificate generation are met:
 * - Readiness score equals 100
 * - All required sign-offs collected
 * - Pack has zero missing documents
 * - All department confidence scores ≥ 70
 *
 * Returns ready status and a list of unmet conditions.
 */
export function checkCertificatePrerequisites(
  readinessScore: number,
  signOffs: ProfessionalSignOff[],
  packCompleteness: SubmissionPack['completeness'],
  departmentScores: DepartmentAssessment[]
): { ready: boolean; unmetConditions: string[] } {
  const unmetConditions: string[] = [];

  // Gate 1: Readiness score must equal 100
  if (readinessScore !== 100) {
    unmetConditions.push(`Readiness score is ${readinessScore}%, must be 100%`);
  }

  // Gate 2: All required sign-offs must be collected (all must have verified: true)
  const unsignedCount = signOffs.filter(s => !s.verified || !s.signedAt).length;
  if (unsignedCount > 0) {
    unmetConditions.push(`${unsignedCount} professional sign-off(s) still pending`);
  }

  // Gate 3: Submission pack must have zero missing documents
  if (packCompleteness.missing > 0) {
    unmetConditions.push(`${packCompleteness.missing} document(s) still missing from submission pack`);
  }

  // Gate 4: All department confidence scores must be ≥ 70
  const lowDepts = departmentScores.filter(d => d.confidenceScore < 70);
  if (lowDepts.length > 0) {
    const names = lowDepts.map(d => `${d.departmentName} (${d.confidenceScore}%)`).join(', ');
    unmetConditions.push(`Department(s) below 70% confidence: ${names}`);
  }

  return {
    ready: unmetConditions.length === 0,
    unmetConditions,
  };
}

/**
 * Generates a Municipal-Ready Certificate with a unique certificate number,
 * project identification, readiness scores, professional sign-offs,
 * and the required advisory disclaimer.
 */
export function generateCertificate(
  projectId: string,
  projectName: string,
  erfNumber: string,
  municipality: MunicipalityType,
  readinessScore: number,
  departmentScores: Record<DepartmentId, number>,
  signOffs: ProfessionalSignOff[]
): MunicipalReadyCertificate {
  // Generate unique certificate number: ARC-{MUNICIPALITY}-{YEAR}-{RANDOM}
  const year = new Date().getFullYear();
  const random = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
  const certificateNumber = `ARC-${municipality}-${year}-${random}`;

  return {
    certificateNumber,
    projectId,
    projectName,
    erfNumber,
    municipality,
    issuedAt: new Date().toISOString(),
    overallReadinessScore: readinessScore,
    departmentScores,
    professionalSignOffs: signOffs,
    completenessStatement: `All ${signOffs.length} required professional sign-offs collected. Submission pack complete. All 8 departmental pre-checks at or above 70% confidence.`,
    advisoryDisclaimer:
      'This certificate confirms algorithmic assessment of submission readiness. It does not constitute professional certification of compliance and does not replace official municipal plan examination.',
  };
}
