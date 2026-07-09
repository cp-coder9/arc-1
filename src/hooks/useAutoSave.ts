/**
 * useAutoSave — Reusable hook for 30-second debounced auto-save of form drafts.
 *
 * Behavior:
 * - Auto-saves after 30 seconds of no field edits
 * - On navigate-away (beforeunload): persists draft
 * - On save failure: retains data in localStorage, shows notification, retries in 60s
 *
 * Exposes state:
 * - lastSaved: timestamp of last successful save
 * - saving: whether a save is in progress
 * - saveError: error message from the most recent failed save, or null
 *
 * Requirements validated: 7.1, 7.2, 7.5
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormFieldValue } from '@/services/forms/formTypes';
import { apiFetch } from '@/lib/apiClient';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseAutoSaveResult {
  /** Timestamp of last successful save (ms since epoch), or null if never saved */
  lastSaved: number | null;
  /** Whether a save is currently in progress */
  saving: boolean;
  /** Error message from last failed save, or null */
  saveError: string | null;
  /** Force an immediate save (bypasses debounce) */
  saveNow: () => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Debounce delay: 30 seconds after last field edit */
const AUTO_SAVE_DELAY_MS = 30_000;

/** Retry delay after a failed save: 60 seconds */
const RETRY_DELAY_MS = 60_000;

/** localStorage key prefix for offline fallback */
const LS_PREFIX = 'form_draft_';

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAutoSave(
  instanceId: string | null,
  fields: Record<string, FormFieldValue>,
): UseAutoSaveResult {
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldsRef = useRef<Record<string, FormFieldValue>>(fields);
  const instanceIdRef = useRef<string | null>(instanceId);

  // Keep refs in sync
  fieldsRef.current = fields;
  instanceIdRef.current = instanceId;

  // ── Core Save Function ─────────────────────────────────────────────────────

  const performSave = useCallback(async (): Promise<void> => {
    const currentInstanceId = instanceIdRef.current;
    const currentFields = fieldsRef.current;

    if (!currentInstanceId) return;

    setSaving(true);
    setSaveError(null);

    try {
      // Convert fields to the update payload expected by the API
      const fieldUpdates: Record<string, string | null> = {};
      for (const [fieldId, fieldValue] of Object.entries(currentFields)) {
        if (fieldValue.source === 'manual' || fieldValue.isOverridden) {
          fieldUpdates[fieldId] = typeof fieldValue.value === 'string'
            ? fieldValue.value
            : fieldValue.value != null
              ? String(fieldValue.value)
              : null;
        }
      }

      const response = await apiFetch(`/api/forms/instances/${currentInstanceId}/fields`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: fieldUpdates }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Auto-save failed (HTTP ${response.status})`);
      }

      // Success — clear any localStorage fallback and update state
      try {
        localStorage.removeItem(`${LS_PREFIX}${currentInstanceId}`);
      } catch {
        // localStorage may be unavailable (private browsing)
      }

      setLastSaved(Date.now());
      setSaveError(null);

      // Clear retry timer on success
      if (retryRef.current) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Auto-save failed';
      setSaveError(message);

      // Fallback: persist to localStorage
      try {
        localStorage.setItem(
          `${LS_PREFIX}${currentInstanceId}`,
          JSON.stringify(currentFields),
        );
      } catch {
        // localStorage may be unavailable
      }

      // Schedule retry in 60 seconds
      if (retryRef.current) {
        clearTimeout(retryRef.current);
      }
      retryRef.current = setTimeout(() => {
        performSave();
      }, RETRY_DELAY_MS);
    } finally {
      setSaving(false);
    }
  }, []);

  // ── Debounced Auto-Save on Field Changes ───────────────────────────────────

  useEffect(() => {
    if (!instanceId) return;

    // Reset debounce timer on every field change
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSave();
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [instanceId, fields, performSave]);

  // ── Persist on Navigate-Away (beforeunload) ────────────────────────────────

  useEffect(() => {
    if (!instanceId) return;

    const handleBeforeUnload = () => {
      // Synchronous fallback: persist to localStorage on tab close
      try {
        localStorage.setItem(
          `${LS_PREFIX}${instanceId}`,
          JSON.stringify(fieldsRef.current),
        );
      } catch {
        // Best effort
      }

      // Attempt a synchronous save via sendBeacon
      try {
        const fieldUpdates: Record<string, string | null> = {};
        for (const [fieldId, fieldValue] of Object.entries(fieldsRef.current)) {
          if (fieldValue.source === 'manual' || fieldValue.isOverridden) {
            fieldUpdates[fieldId] = typeof fieldValue.value === 'string'
              ? fieldValue.value
              : fieldValue.value != null
                ? String(fieldValue.value)
                : null;
          }
        }

        const payload = JSON.stringify({ fields: fieldUpdates });
        navigator.sendBeacon(
          `/api/forms/instances/${instanceId}/fields`,
          new Blob([payload], { type: 'application/json' }),
        );
      } catch {
        // sendBeacon may not be available in all environments
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [instanceId]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, []);

  // ── Force Save (bypass debounce) ───────────────────────────────────────────

  const saveNow = useCallback(async (): Promise<void> => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    await performSave();
  }, [performSave]);

  return {
    lastSaved,
    saving,
    saveError,
    saveNow,
  };
}

export default useAutoSave;
