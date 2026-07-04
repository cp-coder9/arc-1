/**
 * Unit tests for valuationService
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const handleFirestoreErrorMock = vi.fn((error: unknown) => { throw error; });

vi.mock('@/lib/firebase', () => ({
  db: { name: 'test-db' },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: (...args: unknown[]) => handleFirestoreErrorMock(...args),
}));

vi.mock('@/demo-seed/demoFirestore', () => ({
  getDemoDoc: (...segments: string[]) => ({ path: segments.join('/'), type: 'doc' }),
  getDemoCol: (...segments: string[]) => ({ path: segments.join('/'), type: 'col' }),
}));

vi.mock('@/services/commandCentre/commandCentreService', () => ({
  recordAudit: vi.fn(),
}));

const getDocMock = vi.mocked(firestore.getDoc);
const addDocMock = vi.mocked(firestore.addDoc);
const getDocsMock = vi.mocked(firestore.getDocs);
const updateDocMock = vi.mocked(firestore.updateDoc);

import {
  createCertificate,
  updateCertificate,
  getCertificates,
  linkCertificateToMilestone,
  calculateRetention,
} from './valuationService';

describe('valuationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Pure Computation: calculateRetention ─────────────────────────────────

  describe('calculateRetention', () => {
    it('calculates retention amount correctly', () => {
      const result = calculateRetention(1_000_000, 10);
      expect(result.retentionAmount).toBe(100_000);
      expect(result.netCertifiedAmount).toBe(900_000);
    });

    it('satisfies invariant: netCertifiedAmount + retentionAmount === grossValue', () => {
      const grossValue = 2_500_000;
      const retentionPercent = 7.5;
      const result = calculateRetention(grossValue, retentionPercent);
      expect(result.netCertifiedAmount + result.retentionAmount).toBe(grossValue);
    });

    it('handles 0% retention (no retention)', () => {
      const result = calculateRetention(500_000, 0);
      expect(result.retentionAmount).toBe(0);
      expect(result.netCertifiedAmount).toBe(500_000);
    });

    it('handles 100% retention (full retention)', () => {
      const result = calculateRetention(500_000, 100);
      expect(result.retentionAmount).toBe(500_000);
      expect(result.netCertifiedAmount).toBe(0);
    });

    it('handles zero gross value', () => {
      const result = calculateRetention(0, 10);
      expect(result.retentionAmount).toBe(0);
      expect(result.netCertifiedAmount).toBe(0);
    });

    it('handles fractional retention percentages', () => {
      const result = calculateRetention(1_000_000, 5.5);
      expect(result.retentionAmount).toBe(55_000);
      expect(result.netCertifiedAmount).toBe(945_000);
    });

    it('handles large values accurately', () => {
      const result = calculateRetention(220_000_000, 10);
      expect(result.retentionAmount).toBe(22_000_000);
      expect(result.netCertifiedAmount).toBe(198_000_000);
      expect(result.netCertifiedAmount + result.retentionAmount).toBe(220_000_000);
    });
  });

  // ── createCertificate ────────────────────────────────────────────────────

  describe('createCertificate', () => {
    beforeEach(() => {
      // Mock getCertificates call inside createCertificate (for certificate number)
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      addDocMock.mockResolvedValue({ id: 'cert-1' } as any);
    });

    it('creates a certificate with auto-calculated retention', async () => {
      const result = await createCertificate('proj-1', {
        grossValue: 1_000_000,
        retentionPercent: 10,
        period: '2026-01',
        createdBy: 'user-qs-1',
      });

      expect(result.certificate.id).toBe('cert-1');
      expect(result.certificate.grossValue).toBe(1_000_000);
      expect(result.certificate.retentionAmount).toBe(100_000);
      expect(result.certificate.netCertifiedAmount).toBe(900_000);
      expect(result.certificate.retentionPercent).toBe(10);
      expect(result.certificate.period).toBe('2026-01');
      expect(result.certificate.status).toBe('draft');
      expect(result.certificate.certificateNumber).toBe(1);
      expect(result.certificate.projectId).toBe('proj-1');
      expect(result.certificate.createdBy).toBe('user-qs-1');
      expect(result.actionEvent).toBeUndefined();
    });

    it('assigns sequential certificate numbers', async () => {
      // Mock existing certificates
      getDocsMock.mockResolvedValue({
        docs: [
          { id: 'cert-existing-1', data: () => ({ certificateNumber: 1 }) },
          { id: 'cert-existing-2', data: () => ({ certificateNumber: 2 }) },
        ],
      } as any);
      addDocMock.mockResolvedValue({ id: 'cert-3' } as any);

      const result = await createCertificate('proj-1', {
        grossValue: 500_000,
        retentionPercent: 5,
        period: '2026-03',
        createdBy: 'user-qs-1',
      });

      expect(result.certificate.certificateNumber).toBe(3);
    });

    it('creates Action Centre event when status is awaiting_signature', async () => {
      const result = await createCertificate('proj-1', {
        grossValue: 1_000_000,
        retentionPercent: 10,
        period: '2026-01',
        createdBy: 'user-qs-1',
        status: 'awaiting_signature',
      });

      expect(result.actionEvent).toBeDefined();
      expect(result.actionEvent!.type).toBe('financial');
      expect(result.actionEvent!.title).toContain('requires signature');
      expect(result.actionEvent!.priority).toBe('high');
      expect(result.actionEvent!.sourceSubsystem).toBe('valuations');
      expect(result.actionEvent!.status).toBe('pending');
    });

    it('does not create Action Centre event for draft status', async () => {
      const result = await createCertificate('proj-1', {
        grossValue: 1_000_000,
        retentionPercent: 10,
        period: '2026-01',
        createdBy: 'user-qs-1',
        status: 'draft',
      });

      expect(result.actionEvent).toBeUndefined();
    });

    it('rejects invalid input (grossValue must be positive)', async () => {
      await expect(
        createCertificate('proj-1', {
          grossValue: 0,
          retentionPercent: 10,
          period: '2026-01',
          createdBy: 'user-qs-1',
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid input (retentionPercent cannot exceed 100)', async () => {
      await expect(
        createCertificate('proj-1', {
          grossValue: 1_000_000,
          retentionPercent: 101,
          period: '2026-01',
          createdBy: 'user-qs-1',
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid input (retentionPercent cannot be negative)', async () => {
      await expect(
        createCertificate('proj-1', {
          grossValue: 1_000_000,
          retentionPercent: -5,
          period: '2026-01',
          createdBy: 'user-qs-1',
        }),
      ).rejects.toThrow();
    });

    it('rejects invalid input (period is required)', async () => {
      await expect(
        createCertificate('proj-1', {
          grossValue: 1_000_000,
          retentionPercent: 10,
          period: '',
          createdBy: 'user-qs-1',
        }),
      ).rejects.toThrow();
    });

    it('throws when projectId is empty', async () => {
      await expect(
        createCertificate('', {
          grossValue: 1_000_000,
          retentionPercent: 10,
          period: '2026-01',
          createdBy: 'user-qs-1',
        }),
      ).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on persistence failure', async () => {
      const error = new Error('Write failed');
      addDocMock.mockRejectedValue(error);

      await expect(
        createCertificate('proj-1', {
          grossValue: 1_000_000,
          retentionPercent: 10,
          period: '2026-01',
          createdBy: 'user-qs-1',
        }),
      ).rejects.toThrow('Write failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'create',
        'projects/proj-1/payment_certificates',
      );
    });
  });

  // ── updateCertificate ────────────────────────────────────────────────────

  describe('updateCertificate', () => {
    const existingCert = {
      id: 'cert-1',
      projectId: 'proj-1',
      certificateNumber: 1,
      period: '2026-01',
      grossValue: 1_000_000,
      retentionAmount: 100_000,
      retentionPercent: 10,
      netCertifiedAmount: 900_000,
      status: 'draft' as const,
      createdBy: 'user-qs-1',
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-15T10:00:00.000Z',
    };

    it('updates certificate status', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateCertificate('proj-1', 'cert-1', { status: 'certified' });

      expect(result.certificate.status).toBe('certified');
      expect(updateDocMock).toHaveBeenCalled();
    });

    it('recalculates retention when grossValue changes', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateCertificate('proj-1', 'cert-1', { grossValue: 2_000_000 });

      // Retention at 10% of 2M = 200k
      expect(result.certificate.retentionAmount).toBe(200_000);
      expect(result.certificate.netCertifiedAmount).toBe(1_800_000);
      expect(result.certificate.grossValue).toBe(2_000_000);
    });

    it('recalculates retention when retentionPercent changes', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateCertificate('proj-1', 'cert-1', { retentionPercent: 5 });

      // Retention at 5% of 1M = 50k
      expect(result.certificate.retentionAmount).toBe(50_000);
      expect(result.certificate.netCertifiedAmount).toBe(950_000);
    });

    it('creates Action Centre event when status changes to awaiting_signature', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateCertificate('proj-1', 'cert-1', { status: 'awaiting_signature' });

      expect(result.actionEvent).toBeDefined();
      expect(result.actionEvent!.type).toBe('financial');
      expect(result.actionEvent!.title).toContain('requires signature');
    });

    it('does not create Action Centre event when already awaiting_signature', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => ({ ...existingCert, status: 'awaiting_signature' }),
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await updateCertificate('proj-1', 'cert-1', { status: 'awaiting_signature' });

      expect(result.actionEvent).toBeUndefined();
    });

    it('throws when certificate not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        updateCertificate('proj-1', 'cert-missing', { status: 'certified' }),
      ).rejects.toThrow("Payment certificate 'cert-missing' not found");
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(
        updateCertificate('proj-1', 'cert-1', { status: 'certified' }),
      ).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/payment_certificates/cert-1',
      );
    });
  });

  // ── getCertificates ──────────────────────────────────────────────────────

  describe('getCertificates', () => {
    it('returns all certificates for a project ordered by certificate number', async () => {
      const mockCerts = [
        { id: 'cert-1', certificateNumber: 1, period: '2026-01', grossValue: 500_000 },
        { id: 'cert-2', certificateNumber: 2, period: '2026-02', grossValue: 750_000 },
      ];
      getDocsMock.mockResolvedValue({
        docs: mockCerts.map((c) => ({ id: c.id, data: () => c })),
      } as any);

      const result = await getCertificates('proj-1');
      expect(result).toHaveLength(2);
      expect(result[0].certificateNumber).toBe(1);
      expect(result[1].certificateNumber).toBe(2);
    });

    it('returns empty array when no certificates exist', async () => {
      getDocsMock.mockResolvedValue({ docs: [] } as any);
      const result = await getCertificates('proj-1');
      expect(result).toEqual([]);
    });

    it('throws when projectId is empty', async () => {
      await expect(getCertificates('')).rejects.toThrow('projectId is required');
    });

    it('calls handleFirestoreError on failure', async () => {
      const error = new Error('Query failed');
      getDocsMock.mockRejectedValue(error);

      await expect(getCertificates('proj-1')).rejects.toThrow('Query failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'list',
        'projects/proj-1/payment_certificates',
      );
    });
  });

  // ── linkCertificateToMilestone ───────────────────────────────────────────

  describe('linkCertificateToMilestone', () => {
    const existingCert = {
      id: 'cert-1',
      projectId: 'proj-1',
      certificateNumber: 1,
      period: '2026-01',
      grossValue: 1_000_000,
      retentionAmount: 100_000,
      retentionPercent: 10,
      netCertifiedAmount: 900_000,
      status: 'draft' as const,
      createdBy: 'user-qs-1',
      createdAt: '2026-01-15T10:00:00.000Z',
      updatedAt: '2026-01-15T10:00:00.000Z',
    };

    it('links a certificate to a milestone', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      updateDocMock.mockResolvedValue(undefined as any);

      const result = await linkCertificateToMilestone('proj-1', 'cert-1', 'milestone-1');

      expect(result.linkedMilestoneId).toBe('milestone-1');
      expect(updateDocMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ linkedMilestoneId: 'milestone-1' }),
      );
    });

    it('throws when certificate not found', async () => {
      getDocMock.mockResolvedValue({ exists: () => false } as any);

      await expect(
        linkCertificateToMilestone('proj-1', 'cert-missing', 'milestone-1'),
      ).rejects.toThrow("Payment certificate 'cert-missing' not found");
    });

    it('throws when certId is empty', async () => {
      await expect(
        linkCertificateToMilestone('proj-1', '', 'milestone-1'),
      ).rejects.toThrow('certId is required');
    });

    it('calls handleFirestoreError on update failure', async () => {
      getDocMock.mockResolvedValue({
        exists: () => true,
        id: 'cert-1',
        data: () => existingCert,
      } as any);
      const error = new Error('Update failed');
      updateDocMock.mockRejectedValue(error);

      await expect(
        linkCertificateToMilestone('proj-1', 'cert-1', 'milestone-1'),
      ).rejects.toThrow('Update failed');
      expect(handleFirestoreErrorMock).toHaveBeenCalledWith(
        error,
        'update',
        'projects/proj-1/payment_certificates/cert-1',
      );
    });
  });
});
