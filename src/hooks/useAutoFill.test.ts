// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAutoFill } from './useAutoFill';
import type { FormTemplate, FormFieldValue } from '@/services/forms/formTypes';
import { Timestamp } from 'firebase/firestore';

// ── Mock auto-fill engine ────────────────────────────────────────────────────

const mockResolveAutoFill = vi.fn();

vi.mock('@/services/forms/autoFillEngine', () => ({
  resolveAutoFill: (...args: unknown[]) => mockResolveAutoFill(...args),
}));

// ── Test fixtures ────────────────────────────────────────────────────────────

function createMockTemplate(overrides: Partial<FormTemplate> = {}): FormTemplate {
  return {
    id: 'tpl-1',
    name: 'Test Template',
    category: 'municipal_submission',
    formType: 'building_plan',
    municipalities: ['jhb'],
    lifecycleStages: ['comply'],
    version: 1,
    isLatest: true,
    schema: { sections: [], layout: {} },
    fieldMappings: [
      { fieldId: 'field_1', dataSource: { provider: 'project_passport', path: 'address.street' } },
      { fieldId: 'field_2', dataSource: { provider: 'user_profile', path: 'name' } },
    ],
    requiredSignatures: [],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

function createMockFieldValue(value: string | null): FormFieldValue {
  return {
    value,
    source: value ? 'auto_fill' : 'manual',
    isOverridden: false,
    autoFillValue: value,
    lastModifiedBy: value ? 'system' : '',
    lastModifiedAt: Timestamp.now(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAutoFill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should start with empty state when template is null', () => {
    const { result } = renderHook(() =>
      useAutoFill(null, 'project-1', 'user-1', 'client-1')
    );

    expect(result.current.resolvedFields).toEqual({});
    expect(result.current.resolving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should resolve fields when template is provided', async () => {
    const mockResult: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('123 Main St'),
      field_2: createMockFieldValue('John Doe'),
    };
    mockResolveAutoFill.mockResolvedValue(mockResult);

    const template = createMockTemplate();

    const { result } = renderHook(() =>
      useAutoFill(template, 'project-1', 'user-1', 'client-1')
    );

    // Should be resolving initially
    expect(result.current.resolving).toBe(true);

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.resolvedFields).toEqual(mockResult);
    expect(result.current.error).toBeNull();
    expect(mockResolveAutoFill).toHaveBeenCalledWith(template, {
      projectId: 'project-1',
      userId: 'user-1',
      clientId: 'client-1',
      fieldMappings: template.fieldMappings,
    });
  });

  it('should set error when resolution fails', async () => {
    mockResolveAutoFill.mockRejectedValue(new Error('Firestore unavailable'));

    const template = createMockTemplate();

    const { result } = renderHook(() =>
      useAutoFill(template, 'project-1', 'user-1', null)
    );

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.error).toBe('Firestore unavailable');
    expect(result.current.resolvedFields).toEqual({});
  });

  it('should set error on timeout (3 seconds)', async () => {
    vi.useFakeTimers();

    // Never resolves
    mockResolveAutoFill.mockImplementation(
      () => new Promise(() => {})
    );

    const template = createMockTemplate();

    const { result } = renderHook(() =>
      useAutoFill(template, 'project-1', 'user-1', 'client-1')
    );

    expect(result.current.resolving).toBe(true);

    // Advance past the 3-second timeout
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.error).toBe('Auto-fill resolution timed out');

    vi.useRealTimers();
  });

  it('should re-resolve when projectId changes', async () => {
    const mockResult1: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('Original Street'),
    };
    const mockResult2: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('New Street'),
    };
    mockResolveAutoFill
      .mockResolvedValueOnce(mockResult1)
      .mockResolvedValueOnce(mockResult2);

    const template = createMockTemplate();

    const { result, rerender } = renderHook(
      ({ projectId }) => useAutoFill(template, projectId, 'user-1', 'client-1'),
      { initialProps: { projectId: 'project-1' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.resolvedFields).toEqual(mockResult1);

    // Change project
    rerender({ projectId: 'project-2' });

    await waitFor(() => {
      expect(result.current.resolvedFields).toEqual(mockResult2);
    });

    expect(mockResolveAutoFill).toHaveBeenCalledTimes(2);
  });

  it('should support reResolve for manual project switching', async () => {
    const mockResult1: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('First'),
    };
    const mockResult2: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('Second'),
    };
    mockResolveAutoFill
      .mockResolvedValueOnce(mockResult1)
      .mockResolvedValueOnce(mockResult2);

    const template = createMockTemplate();

    const { result } = renderHook(() =>
      useAutoFill(template, 'project-1', 'user-1', 'client-1')
    );

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.resolvedFields).toEqual(mockResult1);

    // Call reResolve with new context
    await act(async () => {
      await result.current.reResolve('project-2', 'client-2');
    });

    expect(result.current.resolvedFields).toEqual(mockResult2);
    expect(mockResolveAutoFill).toHaveBeenCalledTimes(2);
    expect(mockResolveAutoFill).toHaveBeenLastCalledWith(template, {
      projectId: 'project-2',
      userId: 'user-1',
      clientId: 'client-2',
      fieldMappings: template.fieldMappings,
    });
  });

  it('should reset state when template changes to null', async () => {
    const mockResult: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('Value'),
    };
    mockResolveAutoFill.mockResolvedValue(mockResult);

    const template = createMockTemplate();

    const { result, rerender } = renderHook(
      ({ tpl }) => useAutoFill(tpl, 'project-1', 'user-1', 'client-1'),
      { initialProps: { tpl: template as FormTemplate | null } }
    );

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.resolvedFields).toEqual(mockResult);

    // Set template to null
    rerender({ tpl: null });

    expect(result.current.resolvedFields).toEqual({});
    expect(result.current.resolving).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle null projectId gracefully', async () => {
    const mockResult: Record<string, FormFieldValue> = {
      field_2: createMockFieldValue('User Name'),
    };
    mockResolveAutoFill.mockResolvedValue(mockResult);

    const template = createMockTemplate();

    const { result } = renderHook(() =>
      useAutoFill(template, null, 'user-1', null)
    );

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    expect(result.current.resolvedFields).toEqual(mockResult);
    expect(mockResolveAutoFill).toHaveBeenCalledWith(template, {
      projectId: null,
      userId: 'user-1',
      clientId: null,
      fieldMappings: template.fieldMappings,
    });
  });

  it('should not apply stale results when inputs change rapidly', async () => {
    let resolveFirst: ((val: Record<string, FormFieldValue>) => void) | null = null;
    const firstPromise = new Promise<Record<string, FormFieldValue>>((resolve) => {
      resolveFirst = resolve;
    });

    const secondResult: Record<string, FormFieldValue> = {
      field_1: createMockFieldValue('Second'),
    };

    mockResolveAutoFill
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce(secondResult);

    const template = createMockTemplate();

    const { result, rerender } = renderHook(
      ({ projectId }) => useAutoFill(template, projectId, 'user-1', 'client-1'),
      { initialProps: { projectId: 'project-1' as string | null } }
    );

    // Quickly change projectId before first resolves
    rerender({ projectId: 'project-2' });

    await waitFor(() => {
      expect(result.current.resolving).toBe(false);
    });

    // Second call should be the result
    expect(result.current.resolvedFields).toEqual(secondResult);

    // Now resolve the first (stale) — should NOT override
    await act(async () => {
      resolveFirst!({ field_1: createMockFieldValue('First') });
    });

    // Result should still be from the second call
    expect(result.current.resolvedFields).toEqual(secondResult);
  });
});
