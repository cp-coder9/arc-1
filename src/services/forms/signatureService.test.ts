import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { FormInstance, FormTemplate, FormFieldValue, SignatureRecord, SignatureRequirement } from '@/services/forms/formTypes';

// Mock firebase/firestore
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    collection: vi.fn(() => 'collection-ref'),
    doc: vi.fn(() => ({ id: 'generated-id' })),
    getDoc: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    Timestamp: {
      now: () => ({ seconds: 2000, nanoseconds: 0, toMillis: () => 2000000 }),
    },
  };
});

// Mock firebase init
vi.mock('@/lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn((error: unknown) => { throw error; }),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
}));

// Mock formInstanceService
vi.mock('@/services/forms/formInstanceService', () => ({
  getFormInstance: vi.fn(),
}));

// Mock formAuditService
vi.mock('@/services/forms/formAuditService', () => ({
  recordSignatureEvent: vi.fn(),
}));

// Mock formValidationService
vi.mock('@/services/forms/formValidationService', () => ({
  validateAllFields: vi.fn(() => ({ valid: true, errors: [] })),
}));

import { updateDoc } from 'firebase/firestore';
import { getFormInstance } from '@/services/forms/formInstanceService';
import { recordSignatureEvent } from '@/services/forms/formAuditService';
import {
  applySignature,
  revokeSignature,
  validateCredentials,
  getOutstandingSignatures,
  isReadyForSignature,
} from './signatureService';

const mockGetFormInstance = getFormInstance as ReturnType<typeof vi.fn>;
const mockUpdateDoc = updateDoc as ReturnType<typeof vi.fn>;
const mockRecordSignatureEvent = recordSignatureEvent as ReturnType<typeof vi.fn>;

function makeFieldValue(value: string | null, source: 'auto_fill' | 'manual' = 'auto_fill'): FormFieldValue {
  return {
    value,
    source,
    isOverridden: false,
    autoFillValue: value,
    lastModifiedBy: source === 'auto_fill' ? 'system' : 'user-1',
    lastModifiedAt: Timestamp.now(),
  } as unknown as FormFieldValue;
}

function makeInstance(overrides?: Partial<FormInstance>): FormInstance {
  return {
    id: 'instance-1',
    templateId: 'template-1',
    templateVersion: 1,
    projectId: 'project-123',
    createdBy: 'user-1',
    status: 'draft',
    fields: {
      projectAddress: makeFieldValue('42 Oak Avenue'),
      clientName: makeFieldValue('John Smith', 'manual'),
      erfNumber: makeFieldValue('123/456'),
    },
    signatures: {},
    collaborators: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  } as unknown as FormInstance;
}

function makeTemplate(overrides?: Partial<FormTemplate>): FormTemplate {
  return {
    id: 'template-1',
    name: 'Building Plan Submission',
    category: 'municipal_submission',
    formType: 'building_plan',
    municipalities: ['johannesburg'],
    lifecycleStages: ['comply'],
    version: 1,
    isLatest: true,
    schema: { sections: [], layout: {} },
    fieldMappings: [],
    requiredSignatures: [
      { role: 'architect', credentialType: 'sacap_registration', order: 1 },
      { role: 'client', order: 2 },
    ] as SignatureRequirement[],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  } as unknown as FormTemplate;
}

describe('signatureService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateDoc.mockResolvedValue(undefined);
    mockRecordSignatureEvent.mockResolvedValue({ id: 'audit-1' });
  });

  describe('validateCredentials', () => {
    it('returns valid for non-SACAP roles without credential requirements', () => {
      const result = validateCredentials('client');
      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('returns valid for architect with proper SACAP number', () => {
      const result = validateCredentials('architect', 'sacap_registration', 'PrArch 12345');
      expect(result.valid).toBe(true);
    });

    it('returns invalid for architect without SACAP number', () => {
      const result = validateCredentials('architect', 'sacap_registration');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('SACAP registration number is required');
    });

    it('returns invalid for architect with empty SACAP number', () => {
      const result = validateCredentials('architect', 'sacap_registration', '   ');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('SACAP registration number is required');
    });

    it('returns invalid for architect with malformed SACAP number', () => {
      const result = validateCredentials('architect', 'sacap_registration', 'INVALID123');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Invalid SACAP registration number format');
    });

    it('validates SACAP for architect role even without explicit credentialType', () => {
      const result = validateCredentials('architect', undefined, undefined);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Architects must provide a valid SACAP registration');
    });

    it('accepts valid SACAP variants', () => {
      expect(validateCredentials('architect', 'sacap_registration', 'PrSArch 999').valid).toBe(true);
      expect(validateCredentials('architect', 'sacap_registration', 'PrTechArch1234567890').valid).toBe(true);
      expect(validateCredentials('architect', 'sacap_registration', 'CandArch 1').valid).toBe(true);
      expect(validateCredentials('architect', 'sacap_registration', 'SrArchTech 55555').valid).toBe(true);
    });

    it('returns valid for contractor role without credential requirements', () => {
      const result = validateCredentials('contractor');
      expect(result.valid).toBe(true);
    });
  });

  describe('isReadyForSignature', () => {
    it('returns true when all fields have non-null non-empty values', () => {
      const instance = makeInstance();
      expect(isReadyForSignature(instance)).toBe(true);
    });

    it('returns false when a field has null value', () => {
      const instance = makeInstance({
        fields: {
          projectAddress: makeFieldValue('42 Oak Avenue'),
          clientName: makeFieldValue(null, 'manual'),
        },
      });
      expect(isReadyForSignature(instance)).toBe(false);
    });

    it('returns false when a field has empty string value', () => {
      const instance = makeInstance({
        fields: {
          projectAddress: makeFieldValue('42 Oak Avenue'),
          clientName: makeFieldValue(''),
        },
      });
      expect(isReadyForSignature(instance)).toBe(false);
    });

    it('returns true for instance with no fields (vacuously true)', () => {
      const instance = makeInstance({ fields: {} });
      expect(isReadyForSignature(instance)).toBe(true);
    });
  });

  describe('getOutstandingSignatures', () => {
    it('returns all required signatures when none are applied', () => {
      const instance = makeInstance({ signatures: {} });
      const template = makeTemplate();

      const outstanding = getOutstandingSignatures(instance, template);
      expect(outstanding).toHaveLength(2);
      expect(outstanding[0].role).toBe('architect');
      expect(outstanding[1].role).toBe('client');
    });

    it('excludes fulfilled signatures', () => {
      const instance = makeInstance({
        signatures: {
          'user-arch': {
            signatoryId: 'user-arch',
            signatoryName: 'Jane Architect',
            signatoryRole: 'architect',
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
        },
      });
      const template = makeTemplate();

      const outstanding = getOutstandingSignatures(instance, template);
      expect(outstanding).toHaveLength(1);
      expect(outstanding[0].role).toBe('client');
    });

    it('returns empty array when all signatures are fulfilled', () => {
      const instance = makeInstance({
        signatures: {
          'user-arch': {
            signatoryId: 'user-arch',
            signatoryName: 'Jane Architect',
            signatoryRole: 'architect',
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
          'user-client': {
            signatoryId: 'user-client',
            signatoryName: 'Bob Client',
            signatoryRole: 'client',
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
        },
      });
      const template = makeTemplate();

      const outstanding = getOutstandingSignatures(instance, template);
      expect(outstanding).toHaveLength(0);
    });

    it('returns results sorted by order', () => {
      const template = makeTemplate({
        requiredSignatures: [
          { role: 'client', order: 3 },
          { role: 'architect', credentialType: 'sacap_registration', order: 1 },
          { role: 'engineer', order: 2 },
        ] as SignatureRequirement[],
      });
      const instance = makeInstance({ signatures: {} });

      const outstanding = getOutstandingSignatures(instance, template);
      expect(outstanding[0].role).toBe('architect');
      expect(outstanding[1].role).toBe('engineer');
      expect(outstanding[2].role).toBe('client');
    });

    it('handles case-insensitive role matching', () => {
      const instance = makeInstance({
        signatures: {
          'user-arch': {
            signatoryId: 'user-arch',
            signatoryName: 'Jane Architect',
            signatoryRole: 'Architect', // uppercase
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
        },
      });
      const template = makeTemplate({
        requiredSignatures: [
          { role: 'architect', credentialType: 'sacap_registration', order: 1 }, // lowercase
        ] as SignatureRequirement[],
      });

      const outstanding = getOutstandingSignatures(instance, template);
      expect(outstanding).toHaveLength(0);
    });
  });

  describe('applySignature', () => {
    it('applies a signature to a ready form instance', async () => {
      const instance = makeInstance();
      mockGetFormInstance.mockResolvedValue(instance);

      const result = await applySignature(
        'instance-1',
        'user-client',
        'Bob Client',
        'client',
        'base64-signature-data'
      );

      expect(result.signatures['user-client']).toBeDefined();
      expect(result.signatures['user-client'].signatoryId).toBe('user-client');
      expect(result.signatures['user-client'].signatoryName).toBe('Bob Client');
      expect(result.signatures['user-client'].signatoryRole).toBe('client');
      expect(result.signatures['user-client'].signatureData).toBe('base64-signature-data');
      expect(result.signatures['user-client'].credentialVerified).toBe(true);
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockRecordSignatureEvent).toHaveBeenCalledTimes(1);
    });

    it('throws when instance not found', async () => {
      mockGetFormInstance.mockResolvedValue(null);

      await expect(
        applySignature('nonexistent', 'user-1', 'Name', 'client', 'data')
      ).rejects.toThrow('Form instance not found: nonexistent');
    });

    it('throws when form is not ready (has empty fields)', async () => {
      const instance = makeInstance({
        fields: {
          projectAddress: makeFieldValue('42 Oak Avenue'),
          clientName: makeFieldValue(null, 'manual'), // not populated
        },
      });
      mockGetFormInstance.mockResolvedValue(instance);

      await expect(
        applySignature('instance-1', 'user-1', 'Name', 'client', 'data')
      ).rejects.toThrow('Form is not ready for signature');
    });

    it('throws when signatory has already signed', async () => {
      const instance = makeInstance({
        signatures: {
          'user-client': {
            signatoryId: 'user-client',
            signatoryName: 'Bob Client',
            signatoryRole: 'client',
            signedAt: Timestamp.now(),
            signatureData: 'existing-sig',
            credentialVerified: true,
          } as unknown as SignatureRecord,
        },
      });
      mockGetFormInstance.mockResolvedValue(instance);

      await expect(
        applySignature('instance-1', 'user-client', 'Bob Client', 'client', 'new-data')
      ).rejects.toThrow('has already signed this form instance');
    });

    it('succeeds even if audit recording fails', async () => {
      const instance = makeInstance();
      mockGetFormInstance.mockResolvedValue(instance);
      mockRecordSignatureEvent.mockRejectedValue(new Error('Audit failure'));

      const result = await applySignature(
        'instance-1',
        'user-client',
        'Bob Client',
        'client',
        'base64-data'
      );

      expect(result.signatures['user-client']).toBeDefined();
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('revokeSignature', () => {
    it('removes a signature from the instance', async () => {
      const instance = makeInstance({
        signatures: {
          'user-arch': {
            signatoryId: 'user-arch',
            signatoryName: 'Jane Architect',
            signatoryRole: 'architect',
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
        },
      });
      mockGetFormInstance.mockResolvedValue(instance);

      const result = await revokeSignature('instance-1', 'user-arch');

      expect(result.signatures['user-arch']).toBeUndefined();
      expect(Object.keys(result.signatures)).toHaveLength(0);
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    it('throws when instance not found', async () => {
      mockGetFormInstance.mockResolvedValue(null);

      await expect(
        revokeSignature('nonexistent', 'user-1')
      ).rejects.toThrow('Form instance not found: nonexistent');
    });

    it('throws when signatory has no active signature', async () => {
      const instance = makeInstance({ signatures: {} });
      mockGetFormInstance.mockResolvedValue(instance);

      await expect(
        revokeSignature('instance-1', 'user-unknown')
      ).rejects.toThrow('No signature found for signatory user-unknown');
    });

    it('preserves other signatures when revoking one', async () => {
      const instance = makeInstance({
        signatures: {
          'user-arch': {
            signatoryId: 'user-arch',
            signatoryName: 'Jane Architect',
            signatoryRole: 'architect',
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
          'user-client': {
            signatoryId: 'user-client',
            signatoryName: 'Bob Client',
            signatoryRole: 'client',
            signedAt: Timestamp.now(),
            signatureData: 'base64data',
            credentialVerified: true,
          } as unknown as SignatureRecord,
        },
      });
      mockGetFormInstance.mockResolvedValue(instance);

      const result = await revokeSignature('instance-1', 'user-arch');

      expect(result.signatures['user-arch']).toBeUndefined();
      expect(result.signatures['user-client']).toBeDefined();
      expect(Object.keys(result.signatures)).toHaveLength(1);
    });
  });
});
