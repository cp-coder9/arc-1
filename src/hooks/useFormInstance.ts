// ─── useFormInstance Hook ────────────────────────────────────────────────────
// Manages a single form instance: field state, real-time collaboration locks,
// field updates with atomic audit trail writes, and field revert support.
// Requirements: 3.1, 3.2, 8.2, 8.5

import { useState, useEffect, useCallback } from 'react';
import type { FormInstance, FieldLock } from '@/services/forms/formTypes';
import {
  getFormInstance,
  updateFormFields,
  revertField,
} from '@/services/forms/formInstanceService';
import {
  subscribeToFieldLocks,
  acquireFieldLock,
  releaseFieldLock,
} from '@/services/forms/collaborationService';

// ─── Hook Return Type ───────────────────────────────────────────────────────

export interface UseFormInstanceResult {
  /** The loaded form instance, or null if not yet loaded / not found. */
  instance: FormInstance | null;
  /** Active field locks from other collaborators (real-time via Firestore listener). */
  locks: FieldLock[];
  /** Whether the instance is currently being loaded. */
  loading: boolean;
  /** Error message if loading or operations fail. */
  error: string | null;
  /** Update a single field value on the instance. */
  updateField: (
    fieldId: string,
    value: string | null,
    userId: string,
    userName: string
  ) => Promise<void>;
  /** Revert a manually overridden field to its auto-fill value. */
  revertFieldValue: (
    fieldId: string,
    userId: string,
    userName: string
  ) => Promise<void>;
  /** Acquire a field lock (on focus). Returns true if lock was granted. */
  acquireLock: (
    fieldId: string,
    userId: string,
    userName: string
  ) => Promise<boolean>;
  /** Release a field lock (on blur). */
  releaseLock: (fieldId: string) => Promise<void>;
  /** Reload the instance from Firestore. */
  refresh: () => Promise<void>;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook to manage a form instance with real-time collaboration state.
 *
 * - Loads the instance on mount or when instanceId changes.
 * - Subscribes to field locks via Firestore onSnapshot for real-time collaboration.
 * - Exposes field update, revert, lock acquire/release, and refresh actions.
 *
 * @param instanceId - The form instance ID to load, or null to skip loading.
 */
export function useFormInstance(instanceId: string | null): UseFormInstanceResult {
  const [instance, setInstance] = useState<FormInstance | null>(null);
  const [locks, setLocks] = useState<FieldLock[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Load Instance ──────────────────────────────────────────────────────

  const loadInstance = useCallback(async () => {
    if (!instanceId) {
      setInstance(null);
      setLocks([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const loaded = await getFormInstance(instanceId);
      setInstance(loaded);
      if (!loaded) {
        setError(`Form instance not found: ${instanceId}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load form instance';
      setError(message);
      setInstance(null);
    } finally {
      setLoading(false);
    }
  }, [instanceId]);

  // Load on mount / instanceId change
  useEffect(() => {
    loadInstance();
  }, [loadInstance]);

  // ─── Subscribe to Field Locks ───────────────────────────────────────────

  useEffect(() => {
    if (!instanceId) {
      setLocks([]);
      return;
    }

    const unsubscribe = subscribeToFieldLocks(instanceId, (activeLocks) => {
      setLocks(activeLocks);
    });

    return () => {
      unsubscribe();
    };
  }, [instanceId]);

  // ─── Update Field ───────────────────────────────────────────────────────

  const updateField = useCallback(
    async (
      fieldId: string,
      value: string | null,
      userId: string,
      userName: string
    ): Promise<void> => {
      if (!instanceId) {
        throw new Error('No instance loaded');
      }

      try {
        const updated = await updateFormFields(
          instanceId,
          { [fieldId]: value },
          userId,
          userName
        );
        setInstance(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update field';
        setError(message);
        throw err;
      }
    },
    [instanceId]
  );

  // ─── Revert Field ──────────────────────────────────────────────────────

  const revertFieldValue = useCallback(
    async (
      fieldId: string,
      userId: string,
      userName: string
    ): Promise<void> => {
      if (!instanceId) {
        throw new Error('No instance loaded');
      }

      try {
        const updated = await revertField(instanceId, fieldId, userId, userName);
        setInstance(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to revert field';
        setError(message);
        throw err;
      }
    },
    [instanceId]
  );

  // ─── Acquire Lock ──────────────────────────────────────────────────────

  const acquireLock = useCallback(
    async (
      fieldId: string,
      userId: string,
      userName: string
    ): Promise<boolean> => {
      if (!instanceId) {
        return false;
      }

      try {
        return await acquireFieldLock(instanceId, fieldId, userId, userName);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to acquire lock';
        setError(message);
        return false;
      }
    },
    [instanceId]
  );

  // ─── Release Lock ─────────────────────────────────────────────────────

  const releaseLock = useCallback(
    async (fieldId: string): Promise<void> => {
      if (!instanceId) {
        return;
      }

      try {
        await releaseFieldLock(instanceId, fieldId);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to release lock';
        setError(message);
      }
    },
    [instanceId]
  );

  // ─── Refresh ──────────────────────────────────────────────────────────

  const refresh = useCallback(async (): Promise<void> => {
    await loadInstance();
  }, [loadInstance]);

  return {
    instance,
    locks,
    loading,
    error,
    updateField,
    revertFieldValue,
    acquireLock,
    releaseLock,
    refresh,
  };
}

export default useFormInstance;
