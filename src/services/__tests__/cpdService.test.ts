import { describe, expect, test } from 'vitest';
import {
  buildCPDStatutorySyncPayload,
  createCPDCertificateVerificationFields,
  hashCPDCertificate,
  planCPDStatutorySync,
  scoreCPDAttempt,
  verifyCPDCertificateHash,
  verifyCPDCertificateRecord,
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

  test('rejects assessments with invalid pass marks before scoring', () => {
    expect(() =>
      scoreCPDAttempt(
        { ...assessment, passMarkPercent: 101 },
        {
          userId: 'bep-1',
          assessmentId: 'assessment-1',
          submittedAt: '2026-05-15T10:00:00.000Z',
          answers: {
            q1: ['a'],
            q2: ['b', 'c'],
          },
        }
      )
    ).toThrow('CPD assessment passMarkPercent must be between 0 and 100.');
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

  test('verifies certificate records before statutory sync governance decisions', () => {
    const baseCertificate = {
      userId: 'bep-1',
      courseId: 'course-sans-10400',
      attemptId: 'attempt-1',
      issuedAt: '2026-05-15T10:05:00.000Z',
      expiresAt: '2027-05-15T10:05:00.000Z',
      issuerKey: 'test-secret',
    };
    const fields = createCPDCertificateVerificationFields(baseCertificate);
    const certificate = {
      ...baseCertificate,
      ...fields,
      status: 'issued' as const,
    };

    expect(verifyCPDCertificateRecord(certificate, 'test-secret', '2026-06-01T00:00:00.000Z')).toEqual({
      valid: true,
      status: 'valid',
      warnings: [],
    });
    expect(verifyCPDCertificateRecord({ ...certificate, userId: 'attacker' }, 'test-secret')).toEqual({
      valid: false,
      status: 'hash_mismatch',
      warnings: ['Certificate hash does not match the supplied certificate fields.'],
    });
    expect(verifyCPDCertificateRecord({ ...certificate, status: 'revoked', revokedReason: 'Manual audit reversal.' }, 'test-secret')).toEqual({
      valid: false,
      status: 'revoked',
      warnings: ['Manual audit reversal.'],
    });
    expect(verifyCPDCertificateRecord({ ...certificate, status: 'expired' }, 'test-secret')).toEqual({
      valid: false,
      status: 'expired',
      warnings: ['Certificate has expired.'],
    });
    expect(verifyCPDCertificateRecord(certificate, 'test-secret', '2027-05-15T10:05:00.000Z')).toEqual({
      valid: false,
      status: 'expired',
      warnings: ['Certificate has expired.'],
    });
  });

  test('builds statutory CPD sync payload only with consent, provider config, and valid certificate', () => {
    const baseCertificate = {
      userId: 'bep-1',
      courseId: 'course-sans-10400',
      attemptId: 'attempt-1',
      issuedAt: '2026-05-15T10:05:00.000Z',
      expiresAt: '2027-05-15T10:05:00.000Z',
      issuerKey: 'test-secret',
    };
    const certificate = {
      ...baseCertificate,
      ...createCPDCertificateVerificationFields(baseCertificate),
      status: 'issued' as const,
    };
    const config = {
      enabled: true,
      providerName: 'Professional Body API',
      endpointUrl: 'https://cpd.example.test/sync',
      apiKey: 'real-secret-ref',
    };

    expect(
      buildCPDStatutorySyncPayload({
        config,
        certificate,
        issuerKey: 'test-secret',
        humanConsentRecorded: true,
      })
    ).toEqual({
      providerName: 'Professional Body API',
      endpointUrl: 'https://cpd.example.test/sync',
      userId: 'bep-1',
      courseId: 'course-sans-10400',
      attemptId: 'attempt-1',
      verificationCode: certificate.verificationCode,
      verificationHash: certificate.verificationHash,
      humanConsentRecorded: true,
      autoSyncProhibited: true,
    });

    expect(() => buildCPDStatutorySyncPayload({ config, certificate, issuerKey: 'test-secret' })).toThrow(
      'Human consent is required before statutory CPD sync.'
    );
    expect(() =>
      buildCPDStatutorySyncPayload({
        config: { ...config, apiKey: undefined },
        certificate,
        issuerKey: 'test-secret',
        humanConsentRecorded: true,
      })
    ).toThrow('No statutory CPD provider sync will be attempted');
    expect(() =>
      buildCPDStatutorySyncPayload({
        config,
        certificate: { ...certificate, status: 'revoked' },
        issuerKey: 'test-secret',
        humanConsentRecorded: true,
      })
    ).toThrow('Cannot sync invalid CPD certificate: revoked.');
  });

});
