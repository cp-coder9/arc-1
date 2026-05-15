import { describe, expect, test } from 'vitest';
import {
  createCPDCertificateVerificationFields,
  hashCPDCertificate,
  planCPDStatutorySync,
  scoreCPDAttempt,
  verifyCPDCertificateHash,
  type CPDAssessment,
} from '../cpdService';

const assessment: CPDAssessment = {
  id: 'assessment-1',
  courseId: 'course-sans-10400',
  passMarkPercent: 75,
  questions: [
    {
      id: 'q1',
      prompt: 'Which form records competent person appointment?',
      type: 'single_choice',
      points: 2,
      correctOptionIds: ['a'],
    },
    {
      id: 'q2',
      prompt: 'Select required close-out evidence.',
      type: 'multiple_choice',
      points: 2,
      correctOptionIds: ['b', 'c'],
    },
  ],
};

describe('cpdService', () => {
  test('scores CPD attempts with exact multi-select matching and pass/fail logic', () => {
    const result = scoreCPDAttempt(
      assessment,
      {
        userId: 'bep-1',
        assessmentId: 'assessment-1',
        submittedAt: '2026-05-15T10:00:00.000Z',
        answers: {
          q1: ['a'],
          q2: ['c', 'b'],
        },
      },
      '2026-05-15T10:01:00.000Z'
    );

    expect(result.score).toBe(4);
    expect(result.maxScore).toBe(4);
    expect(result.scorePercent).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.questionResults).toEqual([
      { questionId: 'q1', earnedPoints: 2, maxPoints: 2, correct: true },
      { questionId: 'q2', earnedPoints: 2, maxPoints: 2, correct: true },
    ]);
  });

  test('fails attempts below the assessment pass mark', () => {
    const result = scoreCPDAttempt(assessment, {
      userId: 'bep-1',
      assessmentId: 'assessment-1',
      submittedAt: '2026-05-15T10:00:00.000Z',
      answers: {
        q1: ['a'],
        q2: ['b'],
      },
    });

    expect(result.score).toBe(2);
    expect(result.scorePercent).toBe(50);
    expect(result.passed).toBe(false);
  });

  test('creates tamper-resistant certificate verification fields', () => {
    const certificate = {
      userId: 'bep-1',
      courseId: 'course-sans-10400',
      attemptId: 'attempt-1',
      issuedAt: '2026-05-15T10:05:00.000Z',
      expiresAt: '2027-05-15T10:05:00.000Z',
      issuerKey: 'test-secret',
    };

    const fields = createCPDCertificateVerificationFields(certificate);

    expect(fields.verificationCode).toMatch(/^CPD-COURSE-S-[A-F0-9]{12}$/);
    expect(fields.verificationVersion).toBe('cpd-cert-v1');
    expect(fields.verificationHash).toHaveLength(64);
    expect(
      verifyCPDCertificateHash({
        ...certificate,
        verificationCode: fields.verificationCode,
        verificationHash: fields.verificationHash,
      })
    ).toBe(true);
    expect(
      verifyCPDCertificateHash({
        ...certificate,
        userId: 'attacker',
        verificationCode: fields.verificationCode,
        verificationHash: fields.verificationHash,
      })
    ).toBe(false);
  });

  test('hashes certificate fields deterministically for verification lookups', () => {
    const input = {
      userId: 'bep-1',
      courseId: 'course-1',
      attemptId: 'attempt-1',
      issuedAt: '2026-05-15T10:05:00.000Z',
      verificationCode: 'CPD-COURSE-ABC123',
      issuerKey: 'secret',
    };

    expect(hashCPDCertificate(input)).toBe(hashCPDCertificate(input));
  });

  test('blocks statutory CPD sync unless a real provider is configured', () => {
    const plan = planCPDStatutorySync(undefined);

    expect(plan).toEqual({
      status: 'blocked_provider_not_configured',
      canSync: false,
      reason: expect.stringContaining('No statutory CPD provider sync will be attempted'),
      requiredFields: ['enabled', 'providerName', 'endpointUrl', 'apiKey'],
    });
  });

  test('marks statutory CPD sync ready only with complete provider config', () => {
    const plan = planCPDStatutorySync({
      enabled: true,
      providerName: 'Professional Body API',
      endpointUrl: 'https://cpd.example.test/sync',
      apiKey: 'real-secret-ref',
    });

    expect(plan).toEqual({
      status: 'ready',
      canSync: true,
      providerName: 'Professional Body API',
      endpointUrl: 'https://cpd.example.test/sync',
    });
  });
});
