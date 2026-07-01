import { describe, it, expect, vi } from 'vitest';

// Mock the platform audit trail service
vi.mock('@/services/auditTrailService', () => ({
  createAuditEntry: vi.fn(() => ({
    auditId: 'audit-1',
    actorId: 'system',
    action: 'marketplace:certificate_generated',
    sourceObjectId: 'cert-id',
    createdAt: '2026-01-01T00:00:00.000Z',
  })),
}));

// Mock the firebase-admin module (used in persistCertificateToFirestore)
vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        create: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
      })),
    })),
  },
}));

// Mock firebase lib (prevents JSON config resolution issues)
vi.mock('@/lib/firebase', () => ({
  db: {},
  auth: {},
  handleFirestoreError: vi.fn(),
}));

import {
  validateCertificateData,
  assembleCertificateData,
  SANS_10400_VERIFICATION_STATEMENT,
} from '../../services/complianceCertificateService';
import type { CertificateAssemblyInput } from '../../services/complianceCertificateService';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function validInput(): CertificateAssemblyInput {
  return {
    projectId: 'proj-001',
    projectTitle: 'Test Project',
    clientId: 'client-001',
    professionals: [
      { userId: 'user-1', displayName: 'Alice', registrationNumber: 'SACAP-12345' },
      { userId: 'user-2', displayName: 'Bob', registrationNumber: 'ECSA-67890' },
    ],
    sansReferences: ['SANS 10400-K', 'SANS 10400-N'],
    toolsUsed: ['tool-wall-calc', 'tool-fenestration'],
    milestoneAuditResults: [
      { milestoneId: 'ms-1', title: 'Design', aiAuditStatus: 'passed', signOffBy: 'ai-audit-001' },
      { milestoneId: 'ms-2', title: 'Build', aiAuditStatus: 'passed', signOffBy: 'user-1' },
    ],
    escrowConfirmations: [
      { milestoneId: 'ms-1', amount: 50000, recipientUserId: 'user-1', releasedAt: '2026-01-15T10:00:00Z' },
      { milestoneId: 'ms-2', amount: 75000, recipientUserId: 'user-2', releasedAt: '2026-02-20T14:30:00Z' },
    ],
  };
}

// ─── validateCertificateData ──────────────────────────────────────────────────

describe('validateCertificateData', () => {
  it('returns canGenerate: true when all data is present', () => {
    const result = validateCertificateData(validInput());
    expect(result.canGenerate).toBe(true);
    expect(result.missingItems).toHaveLength(0);
  });

  it('detects missing professional registration number (empty string)', () => {
    const input = validInput();
    input.professionals[0].registrationNumber = '';
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('Missing professional registration number')
    );
  });

  it('detects missing professional registration number (whitespace)', () => {
    const input = validInput();
    input.professionals[1].registrationNumber = '   ';
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems.length).toBeGreaterThan(0);
  });

  it('detects when no milestone audit results are present', () => {
    const input = validInput();
    input.milestoneAuditResults = [];
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('No AI audit results')
    );
  });

  it('detects missing AI audit status on a specific milestone', () => {
    const input = validInput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (input.milestoneAuditResults[0] as any).aiAuditStatus = '';
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('Missing AI audit result for milestone')
    );
  });

  it('detects when no escrow confirmations are present', () => {
    const input = validInput();
    input.escrowConfirmations = [];
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('No escrow payment confirmations')
    );
  });

  it('detects incomplete escrow confirmation (missing amount)', () => {
    const input = validInput();
    input.escrowConfirmations[0].amount = 0;
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('Incomplete escrow payment confirmation')
    );
  });

  it('detects incomplete escrow confirmation (missing recipientUserId)', () => {
    const input = validInput();
    input.escrowConfirmations[1].recipientUserId = '';
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('Incomplete escrow payment confirmation')
    );
  });

  it('detects incomplete escrow confirmation (missing releasedAt)', () => {
    const input = validInput();
    input.escrowConfirmations[0].releasedAt = '';
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems).toContainEqual(
      expect.stringContaining('Incomplete escrow payment confirmation')
    );
  });

  it('accumulates multiple missing items', () => {
    const input = validInput();
    input.professionals[0].registrationNumber = '';
    input.milestoneAuditResults = [];
    input.escrowConfirmations = [];
    const result = validateCertificateData(input);
    expect(result.canGenerate).toBe(false);
    expect(result.missingItems.length).toBe(3);
  });
});

// ─── assembleCertificateData ──────────────────────────────────────────────────

describe('assembleCertificateData', () => {
  it('returns a ComplianceCertificateData with all required fields', () => {
    const input = validInput();
    const cert = assembleCertificateData(input, 'vault-file-123');

    expect(cert.certificateId).toBeDefined();
    expect(cert.certificateId.length).toBeGreaterThan(0);
    expect(cert.projectId).toBe('proj-001');
    expect(cert.projectTitle).toBe('Test Project');
    expect(cert.professionals).toEqual(input.professionals);
    expect(cert.sansReferences).toEqual(input.sansReferences);
    expect(cert.toolsUsed).toEqual(input.toolsUsed);
    expect(cert.milestoneAuditResults).toEqual(input.milestoneAuditResults);
    expect(cert.escrowConfirmations).toEqual(input.escrowConfirmations);
    expect(cert.documentVaultFileId).toBe('vault-file-123');
    expect(cert.generatedAt).toBeDefined();
  });

  it('generates a unique non-guessable certificateId (UUID format)', () => {
    const input = validInput();
    const cert1 = assembleCertificateData(input, 'vault-1');
    const cert2 = assembleCertificateData(input, 'vault-2');

    // UUIDs are unique
    expect(cert1.certificateId).not.toBe(cert2.certificateId);

    // UUID v4 format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(cert1.certificateId).toMatch(uuidRegex);
    expect(cert2.certificateId).toMatch(uuidRegex);
  });

  it('generates a valid ISO-8601 generatedAt timestamp', () => {
    const input = validInput();
    const cert = assembleCertificateData(input, 'vault-1');

    const parsed = new Date(cert.generatedAt);
    expect(parsed.toISOString()).toBe(cert.generatedAt);
  });

  it('passes through all input data unchanged', () => {
    const input = validInput();
    const cert = assembleCertificateData(input, 'vault-file-xyz');

    expect(cert.professionals).toHaveLength(2);
    expect(cert.sansReferences).toHaveLength(2);
    expect(cert.toolsUsed).toHaveLength(2);
    expect(cert.milestoneAuditResults).toHaveLength(2);
    expect(cert.escrowConfirmations).toHaveLength(2);
  });
});

// ─── SANS 10400 Verification Statement ────────────────────────────────────────

describe('SANS_10400_VERIFICATION_STATEMENT', () => {
  it('contains reference to SANS 10400', () => {
    expect(SANS_10400_VERIFICATION_STATEMENT).toContain('SANS 10400');
  });

  it('contains reference to Architex platform', () => {
    expect(SANS_10400_VERIFICATION_STATEMENT).toContain('Architex');
  });

  it('mentions design, submissions, and deliveries verification', () => {
    expect(SANS_10400_VERIFICATION_STATEMENT).toContain('design');
    expect(SANS_10400_VERIFICATION_STATEMENT).toContain('submissions');
    expect(SANS_10400_VERIFICATION_STATEMENT).toContain('deliveries');
  });
});
