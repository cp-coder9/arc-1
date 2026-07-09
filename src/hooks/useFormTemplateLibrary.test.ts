// @vitest-environment jsdom
/**
 * Unit tests for useFormTemplateLibrary hook.
 * Validates: Requirements 1.2, 1.5, 10.1–10.6
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useFormTemplateLibrary } from './useFormTemplateLibrary';
import { searchTemplates } from '@/services/forms/formTemplateService';
import type { FormTemplate } from '@/services/forms/formTypes';
import { Timestamp } from 'firebase/firestore';

// Mock the service layer
vi.mock('@/services/forms/formTemplateService', () => ({
  searchTemplates: vi.fn(),
}));

const mockedSearchTemplates = vi.mocked(searchTemplates);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTemplate(overrides: Partial<FormTemplate> = {}): FormTemplate {
  return {
    id: 'tpl-1',
    name: 'Test Template',
    category: 'municipal_submission',
    formType: 'building_plan',
    municipalities: ['city_of_johannesburg'],
    lifecycleStages: ['comply'],
    version: 1,
    isLatest: true,
    schema: { sections: [], layout: {} },
    fieldMappings: [],
    requiredSignatures: [],
    createdBy: 'admin',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...overrides,
  };
}

describe('useFormTemplateLibrary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedSearchTemplates.mockResolvedValue({
      templates: [makeTemplate()],
      totalPages: 1,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('fetches templates on initial mount after 300ms debounce', async () => {
    const { result } = renderHook(() => useFormTemplateLibrary());

    // Initially loading should be false (debounce hasn't fired yet)
    expect(result.current.loading).toBe(false);
    expect(result.current.templates).toEqual([]);

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.templates).toHaveLength(1);
      expect(result.current.templates[0].id).toBe('tpl-1');
    });

    expect(mockedSearchTemplates).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 20 }),
      undefined,
    );
  });

  it('passes priorityMunicipality to searchTemplates', async () => {
    renderHook(() => useFormTemplateLibrary(undefined, 'city_of_cape_town'));

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockedSearchTemplates).toHaveBeenCalledWith(
        expect.any(Object),
        'city_of_cape_town',
      );
    });
  });

  it('applies initial filters', async () => {
    renderHook(() =>
      useFormTemplateLibrary({ category: 'contract', municipality: 'city_of_tshwane' }),
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(mockedSearchTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'contract',
          municipality: 'city_of_tshwane',
          page: 1,
          pageSize: 20,
        }),
        undefined,
      );
    });
  });

  it('debounces search calls (300ms)', async () => {
    const { result } = renderHook(() => useFormTemplateLibrary());

    // Trigger initial debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(mockedSearchTemplates).toHaveBeenCalledTimes(1));

    // Rapid search calls should be debounced
    act(() => {
      result.current.search('mun');
    });
    act(() => {
      result.current.search('muni');
    });
    act(() => {
      result.current.search('munic');
    });

    // Only the last one should fire after 300ms
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      // 1 initial + 1 debounced = 2 total
      expect(mockedSearchTemplates).toHaveBeenCalledTimes(2);
      expect(mockedSearchTemplates).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'munic', page: 1 }),
        undefined,
      );
    });
  });

  it('resets to page 1 when search is called', async () => {
    mockedSearchTemplates.mockResolvedValue({
      templates: [makeTemplate(), makeTemplate({ id: 'tpl-2', name: 'Template 2' })],
      totalPages: 3,
    });

    const { result } = renderHook(() => useFormTemplateLibrary());

    // Initial fetch
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current.totalPages).toBe(3));

    // Go to page 2
    act(() => {
      result.current.nextPage();
    });
    expect(result.current.currentPage).toBe(2);

    // Search resets to page 1
    act(() => {
      result.current.search('test');
    });
    expect(result.current.currentPage).toBe(1);
  });

  it('resets to page 1 when setFilters is called', async () => {
    mockedSearchTemplates.mockResolvedValue({
      templates: [makeTemplate()],
      totalPages: 5,
    });

    const { result } = renderHook(() => useFormTemplateLibrary());

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current.totalPages).toBe(5));

    // Navigate to page 3
    act(() => { result.current.nextPage(); });
    act(() => { result.current.nextPage(); });
    expect(result.current.currentPage).toBe(3);

    // setFilters resets to page 1
    act(() => {
      result.current.setFilters({ category: 'sacap' });
    });
    expect(result.current.currentPage).toBe(1);
  });

  it('nextPage increments page and does not exceed totalPages', async () => {
    mockedSearchTemplates.mockResolvedValue({
      templates: [makeTemplate()],
      totalPages: 2,
    });

    const { result } = renderHook(() => useFormTemplateLibrary());

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current.totalPages).toBe(2));

    act(() => { result.current.nextPage(); });
    expect(result.current.currentPage).toBe(2);

    // Should not exceed totalPages
    act(() => { result.current.nextPage(); });
    expect(result.current.currentPage).toBe(2);
  });

  it('prevPage decrements page and does not go below 1', async () => {
    mockedSearchTemplates.mockResolvedValue({
      templates: [makeTemplate()],
      totalPages: 3,
    });

    const { result } = renderHook(() => useFormTemplateLibrary());

    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current.totalPages).toBe(3));

    // Go to page 2, then back
    act(() => { result.current.nextPage(); });
    expect(result.current.currentPage).toBe(2);

    act(() => { result.current.prevPage(); });
    expect(result.current.currentPage).toBe(1);

    // Should not go below 1
    act(() => { result.current.prevPage(); });
    expect(result.current.currentPage).toBe(1);
  });

  it('sets error state when searchTemplates throws', async () => {
    mockedSearchTemplates.mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useFormTemplateLibrary());

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Network error');
      expect(result.current.templates).toEqual([]);
      expect(result.current.loading).toBe(false);
    });
  });

  it('clears error on subsequent successful fetch', async () => {
    mockedSearchTemplates.mockRejectedValueOnce(new Error('Oops'));

    const { result } = renderHook(() => useFormTemplateLibrary());

    // First fetch fails
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await waitFor(() => expect(result.current.error).toBe('Oops'));

    // Fix the mock for next call
    mockedSearchTemplates.mockResolvedValueOnce({
      templates: [makeTemplate()],
      totalPages: 1,
    });

    // Trigger new search
    act(() => {
      result.current.search('retry');
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.templates).toHaveLength(1);
    });
  });
});
