import { describe, expect, it } from 'vitest';
import {
  certifyPracticalCompletion,
  evaluatePracticalCompletionPreconditions,
  evaluateSnagRegisterClosure,
  recordClientAcceptance,
  validateSignatoryRole,
  evaluateOccupationReadinessGate,
} from '../practicalCompletionService';
import type { PracticalCompletionCertificate, SnagRegisterItem } from '../practicalCompletionService';

function makeSnag(overrides: Partial<SnagRegisterItem> = {}): SnagRegisterItem {
  return { id: 'snag-1', title: 'Test snag', status: 'open', severity: 'medium', ...overrides };
}

function makeCertifiedCertificate(): PracticalCompletionCertificate {
  return {
    certificateId: 'pc-test-1',
    projectId: 'project-1',
    issuedBy: 'architect-1',
    issuedByName: 'Test Architect',
    signatoryRole: 'principal_agent',
    issuedAt: '2026-06-09T00:00:00.000Z',
    status: 'certified',
    preconditions: [],
    snagRegisterSummary: { total: 0, open: 0, closed: 0 },
    blockers: [],
  };
}

describe('practicalCompletionService', () => {
  describe('validateSignatoryRole', () => {
    it('accepts principal_agent, lead_professional, and registered_professional', () => {
      expect(validateSignatoryRole('principal_agent')).toBe(true);
      expect(validateSignatoryRole('lead_professional')).toBe(true);
      expect(validateSignatoryRole('registered_professional')).toBe(true);
    });

    it('rejects client and other roles', () => {
      expect(validateSignatoryRole('client')).toBe(false);
      expect(validateSignatoryRole('contractor')).toBe(false);
    });
  });

  describe('evaluateSnagRegisterClosure', () => {
    it('marks closed when all snags are resolved', () => {
      const result = evaluateSnagRegisterClosure([
        makeSnag({ id: '1', status: 'closed' }),
        makeSnag({ id: '2', status: 'resolved' }),
      ]);
      expect(result.closed).toBe(true);
      expect(result.summary).toEqual({ total: 2, open: 0, closed: 2 });
    });

    it('marks not closed when open snags remain', () => {
      const result = evaluateSnagRegisterClosure([
        makeSnag({ id: '1', status: 'open' }),
        makeSnag({ id: '2', status: 'closed' }),
      ]);
      expect(result.closed).toBe(false);
      expect(result.summary.open).toBe(1);
      expect(result.openSnags).toHaveLength(1);
    });

    it('handles empty snag list', () => {
      const result = evaluateSnagRegisterClosure([]);
      expect(result.closed).toBe(true);
      expect(result.summary.total).toBe(0);
    });
  });

  describe('evaluatePracticalCompletionPreconditions', () => {
    it('passes all preconditions when everything is in order', () => {
      const preconditions = evaluatePracticalCompletionPreconditions({
        snags: [makeSnag({ status: 'closed' })],
        certificates: [{ id: 'cert-1', status: 'approved', url: 'https://files/cert.pdf' }],
        statutoryApprovals: [{ type: 'municipal', status: 'approved', reference: 'REF-1' }],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      expect(preconditions.every((p) => p.met)).toBe(true);
    });

    it('fails when snags are open', () => {
      const preconditions = evaluatePracticalCompletionPreconditions({
        snags: [makeSnag({ status: 'open' })],
        certificates: [{ id: 'cert-1', status: 'approved', url: 'https://files/cert.pdf' }],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      const snagPrecondition = preconditions.find((p) => p.key === 'snag_register_closed');
      expect(snagPrecondition?.met).toBe(false);
    });

    it('fails when no certificates are recorded', () => {
      const preconditions = evaluatePracticalCompletionPreconditions({
        snags: [],
        certificates: [],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      const certPrecondition = preconditions.find((p) => p.key === 'compliance_certificates_ready');
      expect(certPrecondition?.met).toBe(false);
    });

    it('fails when insurance is not active', () => {
      const preconditions = evaluatePracticalCompletionPreconditions({
        snags: [],
        certificates: [{ id: 'cert-1', status: 'approved', url: 'https://files/cert.pdf' }],
        insuranceActive: false,
        utilitiesTransferred: true,
      });
      const insPrecondition = preconditions.find((p) => p.key === 'insurance_active');
      expect(insPrecondition?.met).toBe(false);
    });
  });

  describe('certifyPracticalCompletion', () => {
    it('certifies when all conditions are met', () => {
      const result = certifyPracticalCompletion({
        projectId: 'project-1',
        issuedBy: 'architect-1',
        signatoryRole: 'principal_agent',
        snags: [makeSnag({ status: 'closed' })],
        certificates: [{ id: 'cert-1', status: 'approved', url: 'https://files/cert.pdf' }],
        statutoryApprovals: [{ type: 'municipal', status: 'approved' }],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      expect(result.ready).toBe(true);
      expect(result.status).toBe('certified');
      expect(result.certificate).toBeDefined();
      expect(result.certificate!.signatoryRole).toBe('principal_agent');
    });

    it('blocks when snags remain open', () => {
      const result = certifyPracticalCompletion({
        projectId: 'project-1',
        issuedBy: 'architect-1',
        signatoryRole: 'principal_agent',
        snags: [makeSnag({ status: 'open' })],
        certificates: [],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      expect(result.ready).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it('blocks for unauthorised signatory role', () => {
      const result = certifyPracticalCompletion({
        projectId: 'project-1',
        issuedBy: 'client-1',
        signatoryRole: 'client' as any,
        snags: [],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      expect(result.ready).toBe(false);
      expect(result.blockers.some((b) => b.includes('not authorised'))).toBe(true);
    });

    it('blocks when issuedBy is empty', () => {
      const result = certifyPracticalCompletion({
        projectId: 'project-1',
        issuedBy: '',
        signatoryRole: 'principal_agent',
        snags: [],
        insuranceActive: true,
        utilitiesTransferred: true,
      });
      expect(result.ready).toBe(false);
    });
  });

  describe('recordClientAcceptance', () => {
    it('records acceptance on a certified certificate', () => {
      const cert = makeCertifiedCertificate();
      const accepted = recordClientAcceptance(cert, 'client-1', 'sig-ref-1');
      expect(accepted.status).toBe('client_accepted');
      expect(accepted.clientAcceptance).toEqual({
        acceptedBy: 'client-1',
        acceptedAt: expect.any(String),
        signatureRef: 'sig-ref-1',
      });
    });

    it('throws when certificate is not certified', () => {
      const cert = { ...makeCertifiedCertificate(), status: 'blocked' as const };
      expect(() => recordClientAcceptance(cert, 'client-1')).toThrow('not in certified status');
    });
  });

  describe('evaluateOccupationReadinessGate', () => {
    it('marks ready when all gates pass', () => {
      const result = evaluateOccupationReadinessGate({
        practicalCompletionCertified: true,
        clientAcceptanceRecorded: true,
        occupancyCertificateObtained: true,
        insuranceTransitioned: true,
        utilitiesHandoverComplete: true,
      });
      expect(result.ready).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('lists all unmet gates', () => {
      const result = evaluateOccupationReadinessGate({
        practicalCompletionCertified: false,
        clientAcceptanceRecorded: false,
        occupancyCertificateObtained: false,
        insuranceTransitioned: false,
        utilitiesHandoverComplete: false,
      });
      expect(result.ready).toBe(false);
      expect(result.blockers).toHaveLength(5);
    });
  });
});
