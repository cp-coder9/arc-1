import { createHash, randomUUID } from 'node:crypto';

export type CPDQuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export interface CPDAssessmentQuestion {
  id: string;
  prompt: string;
  type: CPDQuestionType;
  points: number;
  correctOptionIds: string[];
}

export interface CPDAssessment {
  id: string;
  courseId: string;
  passMarkPercent: number;
  questions: CPDAssessmentQuestion[];
}

export interface CPDAttemptSubmission {
  userId: string;
  assessmentId: string;
  answers: Record<string, string[]>;
  submittedAt: string;
}

export interface CPDAttemptResult {
  userId: string;
  assessmentId: string;
  score: number;
  maxScore: number;
  scorePercent: number;
  passed: boolean;
  submittedAt: string;
  gradedAt: string;
  questionResults: Array<{
    questionId: string;
    earnedPoints: number;
    maxPoints: number;
    correct: boolean;
  }>;
}

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

const normaliseAnswers = (answers: string[] | undefined): string[] =>
  Array.from(new Set(answers ?? [])).sort();

const answersMatch = (actual: string[], expected: string[]): boolean =>
  actual.length === expected.length && actual.every((value, index) => value === expected[index]);

const assertAssessment = (assessment: CPDAssessment): void => {
  if (assessment.passMarkPercent < 0 || assessment.passMarkPercent > 100) {
    throw new Error('CPD assessment passMarkPercent must be between 0 and 100.');
  }

  if (assessment.questions.length === 0) {
    throw new Error('CPD assessment must contain at least one question.');
  }

  for (const question of assessment.questions) {
    if (question.points <= 0) {
      throw new Error(`CPD question ${question.id} must have positive points.`);
    }
    if (question.correctOptionIds.length === 0) {
      throw new Error(`CPD question ${question.id} must define at least one correct option.`);
    }
  }
};

export const scoreCPDAttempt = (
  assessment: CPDAssessment,
  submission: CPDAttemptSubmission,
  gradedAt = new Date().toISOString()
): CPDAttemptResult => {
  assertAssessment(assessment);

  if (submission.assessmentId !== assessment.id) {
    throw new Error('CPD submission assessmentId does not match assessment.');
  }

  const questionResults = assessment.questions.map((question) => {
    const actual = normaliseAnswers(submission.answers[question.id]);
    const expected = normaliseAnswers(question.correctOptionIds);
    const correct = answersMatch(actual, expected);

    return {
      questionId: question.id,
      earnedPoints: correct ? question.points : 0,
      maxPoints: question.points,
      correct,
    };
  });

  const score = questionResults.reduce((total, result) => total + result.earnedPoints, 0);
  const maxScore = questionResults.reduce((total, result) => total + result.maxPoints, 0);
  const scorePercent = Math.round((score / maxScore) * 10000) / 100;

  return {
    userId: submission.userId,
    assessmentId: assessment.id,
    score,
    maxScore,
    scorePercent,
    passed: scorePercent >= assessment.passMarkPercent,
    submittedAt: submission.submittedAt,
    gradedAt,
    questionResults,
  };
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
