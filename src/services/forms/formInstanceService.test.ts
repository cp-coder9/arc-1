import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import type { FormTemplate, FormInstance, FormFieldValue, FieldMapping } from '@/services/forms/formTypes';

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

// Mock autoFillEngine
vi.mock('@/services/forms/autoFillEngine', () => ({
  resolveAutoFill: vi.fn(),
}));

// Mock formAuditService
vi.mock('@/services/forms/formAuditService', () => ({
  recordCreationEvent: vi.fn(),
  recordFieldModification: vi.fn(),
}));

// Mock formTemplateService
vi.mock('@/services/forms/formTemplateService', () => ({
  getTemplate: vi.fn(),
}));

import { getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { resolveAutoFill } from '@/services/forms/autoFillEngine';
import { recordCreationEvent, recordFieldModification } from '@/services/forms/formAuditService';
import { getTemplate } from '@/services/forms/formTemplateService';
import {
  createFormInstance,
  getFormInstance,
  updateFormFields,
  revertField,
  switchProjectContext,
  updateStatus,
  deleteFormInstance,
} from './formInstanceService';

const mockGetDoc = getDoc as ReturnType<typeof vi.fn>;
const mockSetDoc = setDoc as ReturnType<typeof vi.fn>;
const mockUpdateDoc = updateDoc as ReturnType<typeof vi.fn>;
const mockDeleteDoc = deleteDoc as ReturnType<typeof vi.fn>;
const mockResolveAutoFill = resolveAutoFill as ReturnType<typeof vi.fn>;
const mockRecordCreationEvent = recordCreationEvent as ReturnType<typeof vi.fn>;
const mockRecordFieldModification = recordFieldModification as ReturnType<typeof vi.fn>;
const mockGetTemplate = getTemplate as ReturnType<typeof vi.fn>;

function makeTemplate(overrides?: Partial<FormTemplate>): FormTemplate {
  return {
    id: 'template-1',
    name: 'Test Template',
    category: 'municipal_submission',
    formType: 'building_plan',
    municipalities: ['johannesburg'],
    lifecycleStages: ['comply'],
    version: 2,
    isLatest: true,
    schema: { sections: [], layout: {} },
    fieldMappings: [
      { fieldId: 'projectAddress', dataSource: { provider: 'project_passport', path: 'address.physical' } },
    ],
    requiredSignatures: [],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  } as unknown as FormTemplate;
}

function makeInstanceData(overrides?: Partial<FormInstance>): FormInstance {
  return {
    id: 'instance-1',
    templateId: 'template-1',
    templateVersion: 2,
    projectId: 'project-123',
    createdBy: 'user-456',
    status: 'draft',
    fields: {
      projectAddress: {
        value: '42 Oak Avenue',
        source: 'auto_fill',
        isOverridden: false,
        autoFillValue: '42 Oak Avenue',
        lastModifiedBy: 'system',
        lastModifiedAt: Timestamp.now(),
      } as unknown as FormFieldValue,
      clientName: {
        value: null,
        source: 'manual',
        isOverridden: false,
        autoFillValue: null,
        lastModifiedBy: '',
        lastModifiedAt: Timestamp.now(),
      } as unknown as FormFieldValue,
    },
    signatures: {},
    collaborators: [],
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  } as unknown as FormInstance;
}

describe('formInstanceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSetDoc.mockResolvedValue(undefined);
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    mockRecordCreationEvent.mockResolvedValue({ id: 'audit-1' });
    mockRecordFieldModification.mockResolvedValue({ id: 'audit-2' });
  });

  describe('createFormInstance', () => {
    it('creates an instance from a template with auto-fill', async () => {
      const template = makeTemplate();
      mockGetTemplate.mockResolvedValue(template);

      const resolvedFields: Record<string, FormFieldValue> = {
        projectAddress: {
          value: '42 Oak Avenue',
          source: 'auto_fill',
          isOverridden: false,
          autoFillValue: '42 Oak Avenue',
          lastModifiedBy: 'system',
          lastModifiedAt: Timestamp.now(),
        } as unknown as FormFieldValue,
      };
      mockResolveAutoFill.mockResolvedValue(resolvedFields);

      const result = await createFormInstance(
        'template-1',
        'project-123',
        'user-456',
        'Jane Smith',
        'client-789'
      );

      expect(result.templateId).toBe('template-1');
      expect(result.templateVersion).toBe(2);
      expect(result.projectId).toBe('project-123');
      expect(result.createdBy).toBe('user-456');
      expect(result.status).toBe('draft');
      expect(result.fields.projectAddress.value).toBe('42 Oak Avenue');
      expect(result.signatures).toEqual({});
      expect(result.collaborators).toEqual([]);

      expect(mockResolveAutoFill).toHaveBeenCalledWith(template, {
        projectId: 'project-123',
        userId: 'user-456',
        clientId: 'client-789',
        fieldMappings: template.fieldMappings,
      });
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockRecordCreationEvent).toHaveBeenCalledTimes(1);
    });

    it('creates a standalone instance with null projectId', async () => {
      const template = makeTemplate();
      mockGetTemplate.mockResolvedValue(template);
      mockResolveAutoFill.mockResolvedValue({});

      const result = await createFormInstance(
        'template-1',
        null,
        'user-456',
        'Jane Smith',
        null
      );

      expect(result.projectId).toBeNull();
      expect(mockResolveAutoFill).toHaveBeenCalledWith(template, {
        projectId: null,
        userId: 'user-456',
        clientId: null,
        fieldMappings: template.fieldMappings,
      });
    });

    it('throws when template not found', async () => {
      mockGetTemplate.mockResolvedValue(null);

      await expect(
        createFormInstance('nonexistent', 'project-1', 'user-1', 'Name', null)
      ).rejects.toThrow('Form template not found: nonexistent');
    });

    it('still creates instance if audit recording fails', async () => {
      const template = makeTemplate();
      mockGetTemplate.mockResolvedValue(template);
      mockResolveAutoFill.mockResolvedValue({});
      mockRecordCreationEvent.mockRejectedValue(new Error('Audit failure'));

      const result = await createFormInstance(
        'template-1',
        'project-123',
        'user-456',
        'Jane Smith',
        null
      );

      // Instance should still be created
      expect(result.id).toBeDefined();
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFormInstance', () => {
    it('returns instance when it exists', async () => {
      const instanceData = makeInstanceData();
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await getFormInstance('instance-1');
      expect(result).toEqual(instanceData);
    });

    it('returns null when instance does not exist', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
      });

      const result = await getFormInstance('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateFormFields', () => {
    it('updates a field and marks it as manual override', async () => {
      const instanceData = makeInstanceData();
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateFormFields(
        'instance-1',
        { projectAddress: '100 New Street' },
        'user-456',
        'Jane Smith'
      );

      expect(result.fields.projectAddress.value).toBe('100 New Street');
      expect(result.fields.projectAddress.source).toBe('manual');
      expect(result.fields.projectAddress.isOverridden).toBe(true);
      expect(result.fields.projectAddress.autoFillValue).toBe('42 Oak Avenue');
      expect(result.fields.projectAddress.lastModifiedBy).toBe('user-456');
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      expect(mockRecordFieldModification).toHaveBeenCalledTimes(1);
    });

    it('sets isOverridden to false when no autoFillValue exists', async () => {
      const instanceData = makeInstanceData();
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateFormFields(
        'instance-1',
        { clientName: 'Bob Builder' },
        'user-456',
        'Jane Smith'
      );

      expect(result.fields.clientName.value).toBe('Bob Builder');
      expect(result.fields.clientName.source).toBe('manual');
      expect(result.fields.clientName.isOverridden).toBe(false);
    });

    it('updates multiple fields at once', async () => {
      const instanceData = makeInstanceData();
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateFormFields(
        'instance-1',
        { projectAddress: 'New Addr', clientName: 'New Client' },
        'user-456',
        'Jane Smith'
      );

      expect(result.fields.projectAddress.value).toBe('New Addr');
      expect(result.fields.clientName.value).toBe('New Client');
      expect(mockRecordFieldModification).toHaveBeenCalledTimes(2);
    });

    it('throws when instance not found', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
      });

      await expect(
        updateFormFields('nonexistent', { field: 'val' }, 'user', 'Name')
      ).rejects.toThrow('Form instance not found: nonexistent');
    });
  });

  describe('revertField', () => {
    it('reverts to autoFillValue when available', async () => {
      const instanceData = makeInstanceData({
        fields: {
          projectAddress: {
            value: 'Manually typed address',
            source: 'manual',
            isOverridden: true,
            autoFillValue: '42 Oak Avenue',
            lastModifiedBy: 'user-456',
            lastModifiedAt: Timestamp.now(),
          } as unknown as FormFieldValue,
        },
      });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await revertField('instance-1', 'projectAddress', 'user-456', 'Jane Smith');

      expect(result.fields.projectAddress.value).toBe('42 Oak Avenue');
      expect(result.fields.projectAddress.source).toBe('auto_fill');
      expect(result.fields.projectAddress.isOverridden).toBe(false);
      expect(result.fields.projectAddress.lastModifiedBy).toBe('system');
    });

    it('clears to null when no autoFillValue exists', async () => {
      const instanceData = makeInstanceData({
        fields: {
          manualField: {
            value: 'Some value',
            source: 'manual',
            isOverridden: false,
            autoFillValue: null,
            lastModifiedBy: 'user-456',
            lastModifiedAt: Timestamp.now(),
          } as unknown as FormFieldValue,
        },
      });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await revertField('instance-1', 'manualField', 'user-456', 'Jane Smith');

      expect(result.fields.manualField.value).toBeNull();
      expect(result.fields.manualField.source).toBe('manual');
      expect(result.fields.manualField.isOverridden).toBe(false);
    });

    it('throws when field not found', async () => {
      const instanceData = makeInstanceData();
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      await expect(
        revertField('instance-1', 'nonexistentField', 'user-456', 'Jane Smith')
      ).rejects.toThrow('Field not found: nonexistentField on instance instance-1');
    });

    it('throws when instance not found', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => false,
      });

      await expect(
        revertField('nonexistent', 'field', 'user', 'Name')
      ).rejects.toThrow('Form instance not found: nonexistent');
    });
  });

  describe('switchProjectContext', () => {
    it('re-resolves non-overridden fields and preserves overridden ones', async () => {
      const instanceData = makeInstanceData({
        fields: {
          projectAddress: {
            value: '42 Oak Avenue',
            source: 'auto_fill',
            isOverridden: false,
            autoFillValue: '42 Oak Avenue',
            lastModifiedBy: 'system',
            lastModifiedAt: Timestamp.now(),
          } as unknown as FormFieldValue,
          clientName: {
            value: 'Manually Entered Client',
            source: 'manual',
            isOverridden: true,
            autoFillValue: 'Original Client',
            lastModifiedBy: 'user-456',
            lastModifiedAt: Timestamp.now(),
          } as unknown as FormFieldValue,
        },
      });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const template = makeTemplate({
        fieldMappings: [
          { fieldId: 'projectAddress', dataSource: { provider: 'project_passport', path: 'address.physical' } },
          { fieldId: 'clientName', dataSource: { provider: 'client_record', path: 'ownerName' } },
        ],
      });
      mockGetTemplate.mockResolvedValue(template);

      const newResolvedFields: Record<string, FormFieldValue> = {
        projectAddress: {
          value: '99 New Street',
          source: 'auto_fill',
          isOverridden: false,
          autoFillValue: '99 New Street',
          lastModifiedBy: 'system',
          lastModifiedAt: Timestamp.now(),
        } as unknown as FormFieldValue,
        clientName: {
          value: 'New Client From Project',
          source: 'auto_fill',
          isOverridden: false,
          autoFillValue: 'New Client From Project',
          lastModifiedBy: 'system',
          lastModifiedAt: Timestamp.now(),
        } as unknown as FormFieldValue,
      };
      mockResolveAutoFill.mockResolvedValue(newResolvedFields);

      const { instance, fieldsUpdated } = await switchProjectContext(
        'instance-1',
        'new-project-456',
        'new-client-001',
        'user-456',
        'Jane Smith'
      );

      // Non-overridden field should update
      expect(instance.fields.projectAddress.value).toBe('99 New Street');
      expect(instance.fields.projectAddress.source).toBe('auto_fill');

      // Overridden field should keep its manual value
      expect(instance.fields.clientName.value).toBe('Manually Entered Client');
      expect(instance.fields.clientName.isOverridden).toBe(true);
      // But autoFillValue should update to reflect new context
      expect(instance.fields.clientName.autoFillValue).toBe('New Client From Project');

      // Project ID should be updated
      expect(instance.projectId).toBe('new-project-456');

      // One field changed value
      expect(fieldsUpdated).toBe(1);
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    it('reports 0 fields updated when values are the same', async () => {
      const instanceData = makeInstanceData({
        fields: {
          projectAddress: {
            value: 'Same Address',
            source: 'auto_fill',
            isOverridden: false,
            autoFillValue: 'Same Address',
            lastModifiedBy: 'system',
            lastModifiedAt: Timestamp.now(),
          } as unknown as FormFieldValue,
        },
      });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const template = makeTemplate();
      mockGetTemplate.mockResolvedValue(template);

      mockResolveAutoFill.mockResolvedValue({
        projectAddress: {
          value: 'Same Address',
          source: 'auto_fill',
          isOverridden: false,
          autoFillValue: 'Same Address',
          lastModifiedBy: 'system',
          lastModifiedAt: Timestamp.now(),
        } as unknown as FormFieldValue,
      });

      const { fieldsUpdated } = await switchProjectContext(
        'instance-1',
        'new-project',
        null,
        'user-456',
        'Jane Smith'
      );

      expect(fieldsUpdated).toBe(0);
    });

    it('throws when instance not found', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await expect(
        switchProjectContext('nonexistent', 'project', null, 'user', 'Name')
      ).rejects.toThrow('Form instance not found: nonexistent');
    });

    it('throws when template not found', async () => {
      const instanceData = makeInstanceData();
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });
      mockGetTemplate.mockResolvedValue(null);

      await expect(
        switchProjectContext('instance-1', 'project', null, 'user', 'Name')
      ).rejects.toThrow('Form template not found: template-1');
    });
  });

  describe('updateStatus', () => {
    it('transitions from draft to awaiting_approval', async () => {
      const instanceData = makeInstanceData({ status: 'draft' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateStatus('instance-1', 'awaiting_approval');
      expect(result.status).toBe('awaiting_approval');
      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
    });

    it('transitions from draft to ready_for_export (skip approval)', async () => {
      const instanceData = makeInstanceData({ status: 'draft' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateStatus('instance-1', 'ready_for_export');
      expect(result.status).toBe('ready_for_export');
    });

    it('transitions from awaiting_approval to ready_for_export', async () => {
      const instanceData = makeInstanceData({ status: 'awaiting_approval' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateStatus('instance-1', 'ready_for_export');
      expect(result.status).toBe('ready_for_export');
    });

    it('transitions from awaiting_approval back to draft (rejected)', async () => {
      const instanceData = makeInstanceData({ status: 'awaiting_approval' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateStatus('instance-1', 'draft');
      expect(result.status).toBe('draft');
    });

    it('transitions from ready_for_export to exported', async () => {
      const instanceData = makeInstanceData({ status: 'ready_for_export' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateStatus('instance-1', 'exported');
      expect(result.status).toBe('exported');
    });

    it('transitions from exported to signed', async () => {
      const instanceData = makeInstanceData({ status: 'exported' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      const result = await updateStatus('instance-1', 'signed');
      expect(result.status).toBe('signed');
    });

    it('rejects invalid transition: exported → draft', async () => {
      const instanceData = makeInstanceData({ status: 'exported' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      await expect(updateStatus('instance-1', 'draft')).rejects.toThrow(
        "Invalid status transition: cannot move from 'exported' to 'draft'"
      );
    });

    it('rejects invalid transition: signed → any', async () => {
      const instanceData = makeInstanceData({ status: 'signed' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      await expect(updateStatus('instance-1', 'draft')).rejects.toThrow(
        "Invalid status transition: cannot move from 'signed' to 'draft'"
      );
    });

    it('rejects invalid transition: draft → exported', async () => {
      const instanceData = makeInstanceData({ status: 'draft' });
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => instanceData,
      });

      await expect(updateStatus('instance-1', 'exported')).rejects.toThrow(
        "Invalid status transition: cannot move from 'draft' to 'exported'"
      );
    });

    it('throws when instance not found', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await expect(updateStatus('nonexistent', 'draft')).rejects.toThrow(
        'Form instance not found: nonexistent'
      );
    });
  });

  describe('deleteFormInstance', () => {
    it('deletes an existing instance', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => true });

      await deleteFormInstance('instance-1');
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });

    it('throws when instance does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false });

      await expect(deleteFormInstance('nonexistent')).rejects.toThrow(
        'Form instance not found: nonexistent'
      );
    });
  });
});
