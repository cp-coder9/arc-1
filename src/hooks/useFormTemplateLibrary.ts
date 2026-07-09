/**
 * useFormTemplateLibrary — Hook for searching, filtering, and paginating
 * the Form Template Library.
 *
 * Provides debounced search (300ms delay before API call on filter change),
 * pagination controls, and municipality-priority sorting.
 *
 * Requirements validated: 1.2, 1.5, 10.1–10.6
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormTemplate, TemplateFilters } from '@/services/forms/formTypes';
import { searchTemplates } from '@/services/forms/formTemplateService';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseFormTemplateLibraryResult {
  /** Current page of templates */
  templates: FormTemplate[];
  /** Whether a search/fetch is in progress */
  loading: boolean;
  /** Total number of pages for current filter set */
  totalPages: number;
  /** Current page number (1-based) */
  currentPage: number;
  /** Error from the most recent fetch, or null */
  error: string | null;
  /** Update the text search query (debounced 300ms) */
  search: (query: string) => void;
  /** Replace the active filters (debounced 300ms, resets to page 1) */
  setFilters: (filters: Partial<TemplateFilters>) => void;
  /** Navigate to the next page */
  nextPage: () => void;
  /** Navigate to the previous page */
  prevPage: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useFormTemplateLibrary(
  initialFilters?: Partial<TemplateFilters>,
  priorityMunicipality?: string,
): UseFormTemplateLibraryResult {
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(initialFilters?.page ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFiltersState] = useState<TemplateFilters>({
    page: 1,
    pageSize: 20,
    ...initialFilters,
  });

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest fetch to discard stale responses
  const fetchIdRef = useRef<number>(0);

  // ── Fetch Logic ────────────────────────────────────────────────────────────

  const fetchTemplates = useCallback(
    async (activeFilters: TemplateFilters, page: number) => {
      const fetchId = ++fetchIdRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await searchTemplates(
          { ...activeFilters, page },
          priorityMunicipality,
        );

        // Discard if a newer fetch was triggered
        if (fetchId !== fetchIdRef.current) return;

        setTemplates(result.templates);
        setTotalPages(result.totalPages);
      } catch (err) {
        if (fetchId !== fetchIdRef.current) return;
        const message = err instanceof Error ? err.message : 'Failed to load templates';
        setError(message);
        setTemplates([]);
        setTotalPages(0);
      } finally {
        if (fetchId === fetchIdRef.current) {
          setLoading(false);
        }
      }
    },
    [priorityMunicipality],
  );

  // ── Effects ────────────────────────────────────────────────────────────────

  // Debounced fetch on filter change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchTemplates(filters, currentPage);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [filters, currentPage, fetchTemplates]);

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Update the text search query. Resets to page 1.
   */
  const search = useCallback((query: string) => {
    setCurrentPage(1);
    setFiltersState((prev) => ({ ...prev, search: query, page: 1 }));
  }, []);

  /**
   * Replace active filters (merged with existing). Resets to page 1.
   */
  const setFilters = useCallback((newFilters: Partial<TemplateFilters>) => {
    setCurrentPage(1);
    setFiltersState((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  /**
   * Navigate to the next page (clamped to totalPages).
   */
  const nextPage = useCallback(() => {
    setCurrentPage((prev) => {
      const next = prev + 1;
      return next > totalPages ? prev : next;
    });
  }, [totalPages]);

  /**
   * Navigate to the previous page (clamped to 1).
   */
  const prevPage = useCallback(() => {
    setCurrentPage((prev) => (prev <= 1 ? 1 : prev - 1));
  }, []);

  return {
    templates,
    loading,
    totalPages,
    currentPage,
    error,
    search,
    setFilters,
    nextPage,
    prevPage,
  };
}

export default useFormTemplateLibrary;
