import {
  buildApprovalGateRecord,
  type ApprovalGateEvidence,
  type ApprovalGateRecord,
} from './approvalGateService';

export type SansComplianceStage = 'brief_diagnostic' | 'compliance_municipal' | 'closeout_handover';

export type SansComplianceDocumentType =
  | 'drawing_set'
  | 'title_deed'
  | 'zoning_certificate'
  | 'sans_form'
  | 'engineer_certificate'
  | 'fire_certificate'
  | 'energy_certificate'
  | 'other';

export type SansComplianceDocumentStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface SansComplianceDocument {
  id: string;
  type: SansComplianceDocumentType;
  title: string;
  status: SansComplianceDocumentStatus;
  uri?: string;
  hash?: string;
}

export interface SansComplianceCheck {
  id: string;
  label: string;
  standard: string;
  status: 'passed' | 'flagged' | 'waived';
}

export interface SansComplianceFormPackInput {
  projectId: string;
  packId: string;
  stage: SansComplianceStage;
  property: {
    erfNumber: string;
    municipality: string;
    address: string;
  };
  client: {
    uid: string;
    displayName: string;
    idNumberVerified?: boolean;
  };
  responsibleProfessional: {
    uid: string;
    role: 'bep' | 'architect' | string;
    displayName: string;
    registrationNumber: string;
    verificationStatus?: string;
  };
  documents: SansComplianceDocument[];
  complianceChecks: SansComplianceCheck[];
  generatedAt?: string;
}

export interface SansComplianceNextAction {
  label: string;
  target: 'sans-forms' | 'municipal-tracker';
  priority: 'high' | 'medium';
  requiresHumanConfirmation: true;
  detail: string;
}

export interface SansComplianceFormPackReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  missingDocumentTypes: SansComplianceDocumentType[];
  requiresBepDigitalSignature: true;
  aiMaySubmitToAuthority: false;
  nextAction: SansComplianceNextAction;
}

export interface SansComplianceFormPack {
  projectId: string;
  packId: string;
  stage: SansComplianceStage;
  readiness: SansComplianceFormPackReadiness;
  approvalGate: ApprovalGateRecord;
  autofillSummary: string;
  generatedAt: string;
}

const REQUIRED_DOCUMENT_TYPES: SansComplianceDocumentType[] = [
  'drawing_set',
  'title_deed',
  'zoning_certificate',
  'sans_form',
];

function approvedDocumentTypes(documents: SansComplianceDocument[]): Set<SansComplianceDocumentType> {
  return new Set(documents.filter((document) => document.status === 'approved').map((document) => document.type));
}

function hasDocumentType(documents: SansComplianceDocument[], type: SansComplianceDocumentType): boolean {
  return documents.some((document) => document.type === type);
}

function buildNextAction(blockers: string[]): SansComplianceNextAction {
  if (blockers.some((blocker) => blocker.includes('SANS form'))) {
    return {
      label: 'Resolve SANS form approval',
      target: 'sans-forms',
      priority: 'high',
      requiresHumanConfirmation: true,
      detail: 'BEP must approve and digitally sign the SANS form pack before municipal submission.',
    };
  }

  if (blockers.some((blocker) => blocker.includes('compliance check'))) {
    return {
      label: 'Resolve flagged compliance checks',
      target: 'sans-forms',
      priority: 'high',
      requiresHumanConfirmation: true,
      detail: 'Flagged SANS or municipal checks must be resolved by an accountable human reviewer.',
    };
  }

  if (blockers.length > 0) {
    return {
      label: 'Complete municipal evidence pack',
      target: 'municipal-tracker',
      priority: 'high',
      requiresHumanConfirmation: true,
      detail: blockers[0],
    };
  }

  return {
    label: 'Request BEP digital sign-off',
    target: 'sans-forms',
    priority: 'medium',
    requiresHumanConfirmation: true,
    detail: 'Pack is ready for verified BEP review; AI may autofill but may not submit to the authority.',
  };
}

export function evaluateSansComplianceFormPackReadiness(input: SansComplianceFormPackInput): SansComplianceFormPackReadiness {
  const approvedTypes = approvedDocumentTypes(input.documents);
  const missingDocumentTypes = REQUIRED_DOCUMENT_TYPES.filter((type) => !hasDocumentType(input.documents, type));
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (missingDocumentTypes.length > 0) {
    blockers.push(`Missing required municipal pack documents: ${missingDocumentTypes.join(', ')}.`);
  }

  REQUIRED_DOCUMENT_TYPES
    .filter((type) => hasDocumentType(input.documents, type) && !approvedTypes.has(type))
    .forEach((type) => {
      if (type === 'sans_form') blockers.push('SANS form must be approved before BEP sign-off.');
      else blockers.push(`${type.replaceAll('_', ' ')} must be approved before municipal submission.`);
    });

  const flaggedChecks = input.complianceChecks.filter((check) => check.status === 'flagged');
  if (flaggedChecks.length > 0) {
    blockers.push(`${flaggedChecks.length} compliance check${flaggedChecks.length === 1 ? '' : 's'} remains flagged for human resolution.`);
  }

  if (input.responsibleProfessional.verificationStatus !== 'verified') {
    blockers.push('Responsible BEP/architect must have verified professional status before sign-off.');
  }

  if (!input.client.idNumberVerified) {
    warnings.push('Client identity is not verified; municipal submission may require additional manual checks.');
  }

  return {
    ready: blockers.length === 0,
    blockers,
    warnings,
    missingDocumentTypes,
    requiresBepDigitalSignature: true,
    aiMaySubmitToAuthority: false,
    nextAction: buildNextAction(blockers),
  };
}

function mapDocumentEvidenceType(type: SansComplianceDocumentType): ApprovalGateEvidence['type'] {
  if (type === 'drawing_set') return 'drawing';
  if (type === 'sans_form') return 'form';
  return 'document';
}

function buildEvidence(documents: SansComplianceDocument[]): ApprovalGateEvidence[] {
  return documents.map((document) => ({
    id: document.id,
    type: mapDocumentEvidenceType(document.type),
    label: document.title,
    uri: document.uri,
    hash: document.hash,
  }));
}

function buildAutofillSummary(input: SansComplianceFormPackInput): string {
  return [
    `Municipality: ${input.property.municipality}`,
    `Property: ${input.property.erfNumber} — ${input.property.address}`,
    `Client: ${input.client.displayName}`,
    `Responsible professional: ${input.responsibleProfessional.displayName} (${input.responsibleProfessional.registrationNumber})`,
  ].join(' | ');
}

export function buildSansComplianceFormPack(input: SansComplianceFormPackInput): SansComplianceFormPack {
  const readiness = evaluateSansComplianceFormPackReadiness(input);
  const autofillSummary = buildAutofillSummary(input);
  const evidence = buildEvidence(input.documents);

  const approvalGate = buildApprovalGateRecord({
    id: `${input.packId}-bep-signoff`,
    domain: 'compliance_signoff',
    projectId: input.projectId,
    target: { type: 'sans_compliance_form_pack', id: input.packId },
    requestedBy: {
      uid: input.responsibleProfessional.uid,
      role: input.responsibleProfessional.role,
      displayName: input.responsibleProfessional.displayName,
      verificationStatus: input.responsibleProfessional.verificationStatus,
    },
    requiredApproverRoles: ['bep'],
    risk: 'high',
    reason: 'Verified BEP digital sign-off is required before SANS compliance forms can support municipal submission.',
    evidence,
    statutoryImpact: true,
    createdAt: input.generatedAt,
    metadata: {
      stage: input.stage,
      packId: input.packId,
      municipality: input.property.municipality,
      erfNumber: input.property.erfNumber,
      autofillSummary,
      aiMaySubmitToAuthority: false,
    },
  });

  return {
    projectId: input.projectId,
    packId: input.packId,
    stage: input.stage,
    readiness,
    approvalGate,
    autofillSummary,
    generatedAt: input.generatedAt || new Date().toISOString(),
  };
}
