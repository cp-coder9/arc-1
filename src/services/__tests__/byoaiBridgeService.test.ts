/**
 * Unit tests for BYOAIBridgeService — importContent function
 *
 * Tests validation, permission checks, provenance creation, document storage,
 * and audit logging for the BYOAI import flow.
 *
 * @requirements 11.1, 11.2, 11.4, 11.5, 11.6, 11.7, 11.8, 11.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  importContent,
  BYOAIValidationError,
  BYOAIAuthorizationError,
  BYOAIProvenanceError,
  type BYOAIServiceDeps,
  type AuditEntry,
} from '@/services/byoaiBridgeService';
import type { BYOAIImportRequest } from '@/services/copilotTypes';

// ─── Mock firebase-admin ───────────────────────────────────────────────────

const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocId = 'mock-doc-id-123';
const mockDoc = vi.fn().mockReturnValue({ id: mockDocId, set: mockDocSet });
const mockCollection = vi.fn().mockReturnValue({ doc: mockDoc });

vi.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: (...args: unknown[]) => mockCollection(...args),
  },
}));

// ─── Mock provenanceService ────────────────────────────────────────────────

const mockCreateProvenanceRecord = vi.fn();
vi.mock('@/services/provenanceService', () => ({
  createProvenanceRecord: (...args: unknown[]) => mockCreateProvenanceRecord(...args),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

function createValidRequest(overrides?: Partial<BYOAIImportRequest>): BYOAIImportRequest {
  return {
    content: 'This is AI-generated content for the project.',
    externalModelName: 'gpt-4',
    contentType: 'general',
    ...overrides,
  };
}

function createMockDeps(overrides?: Partial<BYOAIServiceDeps>): BYOAIServiceDeps {
  return {
    checkWritePermission: vi.fn().mockResolvedValue(true),
    logAuditEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('byoaiBridgeService - importContent', () => {
  const projectId = 'project-abc';
  const userId = 'user-xyz';

  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateProvenanceRecord.mockResolvedValue({
      id: 'provenance-record-001',
      projectId,
      source: 'external',
      capability: null,
    });
  });

  describe('successful import', () => {
    it('returns documentId and provenanceRecordId on success', async () => {
      const deps = createMockDeps();
      const request = createValidRequest();

      const result = await importContent(projectId, userId, request, deps);

      expect(result).toEqual({
        documentId: mockDocId,
        provenanceRecordId: 'provenance-record-001',
        status: 'imported',
      });
    });

    it('creates provenance record with source external and capability null', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ externalModelName: 'claude-3.5-sonnet' });

      await importContent(projectId, userId, request, deps);

      expect(mockCreateProvenanceRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId,
          modelId: 'claude-3.5-sonnet',
          acceptedBy: userId,
          source: 'external',
          capability: null,
          confidence: null,
        })
      );
    });

    it('stores document as draft with ai_imported flag', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ contentType: 'narrative' });

      await importContent(projectId, userId, request, deps);

      expect(mockDocSet).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockDocId,
          projectId,
          status: 'draft',
          ai_imported: true,
          contentType: 'narrative',
          importedBy: userId,
          provenanceId: 'provenance-record-001',
        })
      );
    });

    it('logs success audit event', async () => {
      const deps = createMockDeps();
      const request = createValidRequest();

      await importContent(projectId, userId, request, deps);

      expect(deps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          projectId,
          action: 'byoai_import_attempt',
          status: 'success',
          documentId: mockDocId,
          provenanceRecordId: 'provenance-record-001',
        })
      );
    });

    it('uses server time when generationTimestamp is omitted', async () => {
      const deps = createMockDeps();
      const request = createValidRequest();

      await importContent(projectId, userId, request, deps);

      const provenanceCall = mockCreateProvenanceRecord.mock.calls[0][0];
      // generatedAt should be a valid ISO timestamp (server-generated)
      expect(new Date(provenanceCall.generatedAt).getTime()).not.toBeNaN();
    });

    it('uses provided generationTimestamp when valid', async () => {
      const deps = createMockDeps();
      const pastTime = '2025-01-15T10:30:00.000Z';
      const request = createValidRequest({ generationTimestamp: pastTime });

      await importContent(projectId, userId, request, deps);

      const provenanceCall = mockCreateProvenanceRecord.mock.calls[0][0];
      expect(provenanceCall.generatedAt).toBe(pastTime);
    });
  });

  describe('validation errors', () => {
    it('rejects empty content', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ content: '' });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIValidationError
      );
    });

    it('rejects content exceeding 50000 characters', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ content: 'a'.repeat(50001) });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIValidationError
      );
    });

    it('rejects empty externalModelName', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ externalModelName: '' });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIValidationError
      );
    });

    it('rejects externalModelName exceeding 100 characters', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ externalModelName: 'x'.repeat(101) });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIValidationError
      );
    });

    it('rejects invalid contentType', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ contentType: 'invalid_type' as any });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIValidationError
      );
    });

    it('rejects future timestamp more than 5 minutes ahead', async () => {
      const deps = createMockDeps();
      const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const request = createValidRequest({ generationTimestamp: futureTime });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIValidationError
      );
    });

    it('logs validation failure to audit trail', async () => {
      const deps = createMockDeps();
      const request = createValidRequest({ content: '' });

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow();

      expect(deps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          projectId,
          status: 'failure',
          failureReason: expect.stringContaining('Validation failed'),
        })
      );
    });
  });

  describe('authorization errors', () => {
    it('rejects when user lacks write permission', async () => {
      const deps = createMockDeps({
        checkWritePermission: vi.fn().mockResolvedValue(false),
      });
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIAuthorizationError
      );
    });

    it('logs authorization failure to audit trail', async () => {
      const deps = createMockDeps({
        checkWritePermission: vi.fn().mockResolvedValue(false),
      });
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow();

      expect(deps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          projectId,
          status: 'failure',
          failureReason: 'Insufficient project permissions',
        })
      );
    });

    it('does not persist any data when permission denied', async () => {
      const deps = createMockDeps({
        checkWritePermission: vi.fn().mockResolvedValue(false),
      });
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow();

      expect(mockCreateProvenanceRecord).not.toHaveBeenCalled();
      expect(mockDocSet).not.toHaveBeenCalled();
    });
  });

  describe('provenance creation failure', () => {
    it('throws BYOAIProvenanceError when provenance creation fails', async () => {
      mockCreateProvenanceRecord.mockRejectedValue(new Error('Firestore write failed'));
      const deps = createMockDeps();
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        BYOAIProvenanceError
      );
    });

    it('does not store document when provenance creation fails', async () => {
      mockCreateProvenanceRecord.mockRejectedValue(new Error('Firestore write failed'));
      const deps = createMockDeps();
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow();

      expect(mockDocSet).not.toHaveBeenCalled();
    });

    it('logs provenance failure to audit trail', async () => {
      mockCreateProvenanceRecord.mockRejectedValue(new Error('Firestore write failed'));
      const deps = createMockDeps();
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow();

      expect(deps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
          failureReason: expect.stringContaining('Provenance creation failed'),
        })
      );
    });
  });

  describe('document storage failure', () => {
    it('throws when document storage fails', async () => {
      mockDocSet.mockRejectedValue(new Error('Firestore write quota exceeded'));
      const deps = createMockDeps();
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow(
        'Failed to store imported document'
      );
    });

    it('logs document storage failure to audit trail', async () => {
      mockDocSet.mockRejectedValue(new Error('Firestore write quota exceeded'));
      const deps = createMockDeps();
      const request = createValidRequest();

      await expect(importContent(projectId, userId, request, deps)).rejects.toThrow();

      expect(deps.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
          failureReason: expect.stringContaining('Document storage failed'),
          provenanceRecordId: 'provenance-record-001',
        })
      );
    });
  });
});
