import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FormTemplate, ResolverContext, FieldMapping, FormFieldValue } from '@/services/forms/formTypes';
import { Timestamp } from 'firebase/firestore';

// Mock firebase/firestore
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    doc: vi.fn(),
    getDoc: vi.fn(),
    Timestamp: {
      now: () => ({ seconds: 1000, nanoseconds: 0, toMillis: () => 1000000 }),
    },
  };
});

// Mock firebase init
vi.mock('@/lib/firebase', () => ({
  db: {},
}));

import { doc, getDoc } from 'firebase/firestore';
import { resolveAutoFill, getResolverForProvider, _getNestedValue } from './autoFillEngine';

const mockDoc = doc as ReturnType<typeof vi.fn>;
const mockGetDoc = getDoc as ReturnType<typeof vi.fn>;

function makeTemplate(fieldMappings: FieldMapping[]): FormTemplate {
  return {
    id: 'template-1',
    name: 'Test Template',
    category: 'municipal_submission',
    formType: 'building_plan',
    municipalities: ['johannesburg'],
    lifecycleStages: ['comply'],
    version: 1,
    isLatest: true,
    schema: { sections: [], layout: {} },
    fieldMappings,
    requiredSignatures: [],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  } as unknown as FormTemplate;
}

function makeContext(overrides?: Partial<ResolverContext>): ResolverContext {
  return {
    projectId: 'project-123',
    userId: 'user-456',
    clientId: 'client-789',
    fieldMappings: [],
    ...overrides,
  };
}

describe('autoFillEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('_getNestedValue', () => {
    it('returns top-level string values', () => {
      expect(_getNestedValue({ name: 'John' }, 'name')).toBe('John');
    });

    it('returns nested values using dot notation', () => {
      const obj = { address: { physical: '123 Main St' } };
      expect(_getNestedValue(obj, 'address.physical')).toBe('123 Main St');
    });

    it('returns null for missing paths', () => {
      expect(_getNestedValue({ name: 'John' }, 'email')).toBeNull();
    });

    it('returns null for deeply missing paths', () => {
      expect(_getNestedValue({ address: {} }, 'address.physical.line1')).toBeNull();
    });

    it('converts numbers to strings', () => {
      expect(_getNestedValue({ count: 42 }, 'count')).toBe('42');
    });

    it('converts booleans to strings', () => {
      expect(_getNestedValue({ active: true }, 'active')).toBe('true');
    });

    it('joins arrays with commas', () => {
      expect(_getNestedValue({ tags: ['a', 'b', 'c'] }, 'tags')).toBe('a, b, c');
    });

    it('returns null for objects (non-primitives)', () => {
      expect(_getNestedValue({ meta: { nested: { deep: true } } }, 'meta')).toBeNull();
    });

    it('returns null for null input', () => {
      expect(_getNestedValue({ value: null }, 'value')).toBeNull();
    });
  });

  describe('getResolverForProvider', () => {
    it('returns resolver for project_passport', () => {
      const resolver = getResolverForProvider('project_passport');
      expect(resolver.provider).toBe('project_passport');
    });

    it('returns resolver for user_profile', () => {
      const resolver = getResolverForProvider('user_profile');
      expect(resolver.provider).toBe('user_profile');
    });

    it('returns resolver for client_record', () => {
      const resolver = getResolverForProvider('client_record');
      expect(resolver.provider).toBe('client_record');
    });

    it('returns resolver for firm_record', () => {
      const resolver = getResolverForProvider('firm_record');
      expect(resolver.provider).toBe('firm_record');
    });

    it('throws for unknown provider', () => {
      expect(() => getResolverForProvider('unknown' as any)).toThrow(
        'No resolver registered for provider: unknown'
      );
    });
  });

  describe('resolveAutoFill', () => {
    it('resolves fields from project_passport', async () => {
      mockDoc.mockReturnValue('projects/project-123');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ address: { physical: '42 Oak Avenue, Sandton' }, erfNumber: 'ERF-1234' }),
      });

      const template = makeTemplate([
        { fieldId: 'projectAddress', dataSource: { provider: 'project_passport', path: 'address.physical' } },
        { fieldId: 'erfNum', dataSource: { provider: 'project_passport', path: 'erfNumber' } },
      ]);

      const result = await resolveAutoFill(template, makeContext());

      expect(result.projectAddress.value).toBe('42 Oak Avenue, Sandton');
      expect(result.projectAddress.source).toBe('auto_fill');
      expect(result.projectAddress.isOverridden).toBe(false);
      expect(result.projectAddress.autoFillValue).toBe('42 Oak Avenue, Sandton');
      expect(result.projectAddress.lastModifiedBy).toBe('system');

      expect(result.erfNum.value).toBe('ERF-1234');
      expect(result.erfNum.source).toBe('auto_fill');
    });

    it('resolves fields from user_profile', async () => {
      mockDoc.mockReturnValue('users/user-456');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ name: 'Arch. Jane Smith', sacapNumber: 'PrArch 12345' }),
      });

      const template = makeTemplate([
        { fieldId: 'architectName', dataSource: { provider: 'user_profile', path: 'name' } },
        { fieldId: 'sacapReg', dataSource: { provider: 'user_profile', path: 'sacapNumber' } },
      ]);

      const result = await resolveAutoFill(template, makeContext());

      expect(result.architectName.value).toBe('Arch. Jane Smith');
      expect(result.sacapReg.value).toBe('PrArch 12345');
    });

    it('resolves fields from client_record', async () => {
      mockDoc.mockReturnValue('projects/project-123/clients/client-789');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ ownerName: 'Bob Builder', idNumber: '8001015009087' }),
      });

      const template = makeTemplate([
        { fieldId: 'clientName', dataSource: { provider: 'client_record', path: 'ownerName' } },
        { fieldId: 'clientId', dataSource: { provider: 'client_record', path: 'idNumber' } },
      ]);

      const result = await resolveAutoFill(template, makeContext());

      expect(result.clientName.value).toBe('Bob Builder');
      expect(result.clientId.value).toBe('8001015009087');
    });

    it('resolves fields from firm_record (two-step lookup)', async () => {
      // First call: user profile (to get firmId)
      // Second call: firm document
      mockDoc.mockReturnValue('ref');
      mockGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ firmId: 'firm-001' }),
        })
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ practiceName: 'Smith & Associates', address: { physical: '10 Loop St' } }),
        });

      const template = makeTemplate([
        { fieldId: 'firmName', dataSource: { provider: 'firm_record', path: 'practiceName' } },
      ]);

      const result = await resolveAutoFill(template, makeContext());

      expect(result.firmName.value).toBe('Smith & Associates');
      expect(result.firmName.source).toBe('auto_fill');
    });

    it('marks fields as manual when data source is unavailable', async () => {
      mockDoc.mockReturnValue('ref');
      mockGetDoc.mockResolvedValue({ exists: () => false });

      const template = makeTemplate([
        { fieldId: 'missingField', dataSource: { provider: 'project_passport', path: 'nonexistent.path' } },
      ]);

      const result = await resolveAutoFill(template, makeContext());

      expect(result.missingField.value).toBeNull();
      expect(result.missingField.source).toBe('manual');
      expect(result.missingField.isOverridden).toBe(false);
      expect(result.missingField.autoFillValue).toBeNull();
      expect(result.missingField.lastModifiedBy).toBe('');
    });

    it('handles missing projectId gracefully for project_passport resolver', async () => {
      const template = makeTemplate([
        { fieldId: 'address', dataSource: { provider: 'project_passport', path: 'address.physical' } },
      ]);

      const result = await resolveAutoFill(template, makeContext({ projectId: null }));

      expect(result.address.value).toBeNull();
      expect(result.address.source).toBe('manual');
    });

    it('handles missing clientId gracefully for client_record resolver', async () => {
      const template = makeTemplate([
        { fieldId: 'clientName', dataSource: { provider: 'client_record', path: 'ownerName' } },
      ]);

      const result = await resolveAutoFill(template, makeContext({ clientId: null }));

      expect(result.clientName.value).toBeNull();
      expect(result.clientName.source).toBe('manual');
    });

    it('handles Firestore errors gracefully', async () => {
      mockDoc.mockReturnValue('ref');
      mockGetDoc.mockRejectedValue(new Error('Firestore unavailable'));

      const template = makeTemplate([
        { fieldId: 'field1', dataSource: { provider: 'project_passport', path: 'name' } },
      ]);

      const result = await resolveAutoFill(template, makeContext());

      expect(result.field1.value).toBeNull();
      expect(result.field1.source).toBe('manual');
    });

    it('is deterministic: same inputs produce same outputs', async () => {
      mockDoc.mockReturnValue('ref');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ projectName: 'Sandton Tower', address: { physical: '1 Rivonia Rd' } }),
      });

      const template = makeTemplate([
        { fieldId: 'name', dataSource: { provider: 'project_passport', path: 'projectName' } },
        { fieldId: 'addr', dataSource: { provider: 'project_passport', path: 'address.physical' } },
      ]);

      const ctx = makeContext();

      const result1 = await resolveAutoFill(template, ctx);
      const result2 = await resolveAutoFill(template, ctx);

      // Values must be identical
      expect(result1.name.value).toBe(result2.name.value);
      expect(result1.addr.value).toBe(result2.addr.value);
      expect(result1.name.source).toBe(result2.name.source);
      expect(result1.addr.source).toBe(result2.addr.source);
    });

    it('processes all field mappings in template', async () => {
      mockDoc.mockReturnValue('ref');
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ val: 'resolved' }),
      });

      const mappings: FieldMapping[] = Array.from({ length: 5 }, (_, i) => ({
        fieldId: `field_${i}`,
        dataSource: { provider: 'project_passport' as const, path: 'val' },
      }));

      const template = makeTemplate(mappings);
      const result = await resolveAutoFill(template, makeContext());

      expect(Object.keys(result)).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(result[`field_${i}`].value).toBe('resolved');
      }
    });

    it('returns empty results for template with no field mappings', async () => {
      const template = makeTemplate([]);
      const result = await resolveAutoFill(template, makeContext());

      expect(Object.keys(result)).toHaveLength(0);
    });
  });
});
