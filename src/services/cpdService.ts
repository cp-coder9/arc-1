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
