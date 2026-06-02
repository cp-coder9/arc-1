import { createHash, randomUUID } from 'node:crypto';
export { scoreCPDAttempt, type CPDAssessment, type CPDAssessmentQuestion, type CPDAttemptResult, type CPDAttemptSubmission, type CPDQuestionType } from './cpdScoring';

export interface CPDCertificateInput {
  userId: string;
  courseId: string;
  attemptId: string;
  issuedAt: string;
  expiresAt?: string;
  issuerKey: string;
}

export interface CPDCertificateVerificationFields {
  verificationCode: string;
  verificationHash: string;
  verificationVersion: 'cpd-cert-v1';
}

export interface CPDSyncProviderConfig {
  providerName?: string;
  endpointUrl?: string;
  apiKey?: string;
  enabled?: boolean;
}

export interface CPDCertificateRecord extends CPDCertificateInput, CPDCertificateVerificationFields {
  status: 'issued' | 'expired' | 'revoked';
  revokedReason?: string;
}

export interface CPDCertificateVerificationResult {
  valid: boolean;
  status: 'valid' | 'expired' | 'revoked' | 'hash_mismatch';
  warnings: string[];
}

export interface CPDStatutorySyncPayload {
  providerName: string;
  endpointUrl: string;
  userId: string;
  courseId: string;
  attemptId: string;
  verificationCode: string;
  verificationHash: string;
  humanConsentRecorded: true;
  autoSyncProhibited: true;
}

export type CPDSyncPlan =
  | {
      status: 'blocked_provider_not_configured';
      canSync: false;
      reason: string;
      requiredFields: Array<keyof CPDSyncProviderConfig>;
    }
  | {
      status: 'ready';
      canSync: true;
      providerName: string;
      endpointUrl: string;
    };

export const createCPDCertificateVerificationFields = ({
  userId,
  courseId,
  attemptId,
  issuedAt,
  expiresAt,
  issuerKey,
}: CPDCertificateInput): CPDCertificateVerificationFields => {
  const randomPart = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  const verificationCode = `CPD-${courseId.slice(0, 8).toUpperCase()}-${randomPart}`;
  const verificationHash = hashCPDCertificate({
    userId,
    courseId,
    attemptId,
    issuedAt,
    expiresAt,
    verificationCode,
    issuerKey,
  });

  return {
    verificationCode,
    verificationHash,
    verificationVersion: 'cpd-cert-v1',
  };
};

export const hashCPDCertificate = (input: {
  userId: string;
  courseId: string;
  attemptId: string;
  issuedAt: string;
  expiresAt?: string;
  verificationCode: string;
  issuerKey: string;
}): string => {
  const payload = [
    input.userId,
    input.courseId,
    input.attemptId,
    input.issuedAt,
    input.expiresAt ?? '',
    input.verificationCode,
    input.issuerKey,
  ].join('|');

  return createHash('sha256').update(payload).digest('hex');
};

export const verifyCPDCertificateHash = (input: {
  userId: string;
  courseId: string;
  attemptId: string;
  issuedAt: string;
  expiresAt?: string;
  verificationCode: string;
  issuerKey: string;
  verificationHash: string;
}): boolean => {
  const expectedHash = hashCPDCertificate(input);
  return expectedHash === input.verificationHash;
};

export const verifyCPDCertificateRecord = (certificate: CPDCertificateRecord, issuerKey: string, asOf = new Date().toISOString()): CPDCertificateVerificationResult => {
  const hashValid = verifyCPDCertificateHash({ ...certificate, issuerKey });
  if (!hashValid) return { valid: false, status: 'hash_mismatch', warnings: ['Certificate hash does not match the supplied certificate fields.'] };
  if (certificate.status === 'revoked') return { valid: false, status: 'revoked', warnings: [certificate.revokedReason || 'Certificate has been revoked.'] };
  if (certificate.status === 'expired' || (certificate.expiresAt && Date.parse(certificate.expiresAt) <= Date.parse(asOf))) return { valid: false, status: 'expired', warnings: ['Certificate has expired.'] };
  return { valid: true, status: 'valid', warnings: [] };
};

export const planCPDStatutorySync = (config: CPDSyncProviderConfig | undefined): CPDSyncPlan => {
  const requiredFields: Array<keyof CPDSyncProviderConfig> = [];

  if (!config?.enabled) requiredFields.push('enabled');
  if (!config?.providerName) requiredFields.push('providerName');
  if (!config?.endpointUrl) requiredFields.push('endpointUrl');
  if (!config?.apiKey) requiredFields.push('apiKey');

  if (requiredFields.length > 0) {
    return {
      status: 'blocked_provider_not_configured',
      canSync: false,
      reason: 'No statutory CPD provider sync will be attempted until a real provider endpoint, API key, provider name, and enabled flag are configured.',
      requiredFields,
    };
  }

  return {
    status: 'ready',
    canSync: true,
    providerName: config.providerName,
    endpointUrl: config.endpointUrl,
  };
};

export const buildCPDStatutorySyncPayload = (input: { config: CPDSyncProviderConfig; certificate: CPDCertificateRecord; issuerKey: string; humanConsentRecorded?: boolean }): CPDStatutorySyncPayload => {
  const plan = planCPDStatutorySync(input.config);
  if (plan.canSync === false) throw new Error(plan.reason);
  if (!input.humanConsentRecorded) throw new Error('Human consent is required before statutory CPD sync.');
  const verification = verifyCPDCertificateRecord(input.certificate, input.issuerKey);
  if (!verification.valid) throw new Error(`Cannot sync invalid CPD certificate: ${verification.status}.`);
  return {
    providerName: plan.providerName,
    endpointUrl: plan.endpointUrl,
    userId: input.certificate.userId,
    courseId: input.certificate.courseId,
    attemptId: input.certificate.attemptId,
    verificationCode: input.certificate.verificationCode,
    verificationHash: input.certificate.verificationHash,
    humanConsentRecorded: true,
    autoSyncProhibited: true,
  };
};
