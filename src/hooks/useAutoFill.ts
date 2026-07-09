/**
 * useAutoFill — Hook for invoking the Auto-Fill Engine on a form template.
 *
 * Resolves field values from platform data sources (Project Passport, User Profile,
 * Client Record, Firm Record) using the chain-of-responsibility resolver pattern.
 *
 * Provides:
 * - resolvedFields: Record<string, FormFieldValue> — resolved auto-fill values
 * - resolving: boolean — whether resolution is currently in progress
 * - error: string | null — error message if resolution failed
 * - reResolve: (newProjectId, newClientId) => Promise<void> — re-run resolution with new context
 *
 * Requirements validated: 2.6, 4.2, 4.3
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { FormTemplate, FormFieldValue, ResolverContext } from '@/services/forms/formTypes';
import { resolveAutoFill } from '@/services/forms/autoFillEngine';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseAutoFillResult {
  /** Resolved field values from auto-fill engine */
  resolvedFields: Record<string, FormFieldValue>;
  /** Whether auto-fill resolution is currently in progress */
  resolving: boolean;
  /** Error message if resolution failed, null otherwise */
  error: string | null;
  /** Re-run resolution with a new project/client context (for project switching) */
  reResolve: (newProjectId: string, newClientId: string | null) => Promise<void>;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Maximum time allowed for auto-fill resolution (design requirement: 3 seconds) */
const RESOLUTION_TIMEOUT_MS = 3000;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAutoFill(
  template: FormTemplate | null,
  projectId: string | null,
  userId: string,
  clientId: string | null
): UseAutoFillResult {
  const [resolvedFields, setResolvedFields] = useState<Record<string, FormFieldValue>>({});
  const [resolving, setResolving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Track the latest invocation to prevent stale results from overwriting newer ones
  const invocationRef = useRef<number>(0);

  /**
   * Core resolution function. Invokes the auto-fill engine with the given context
   * and enforces the 3-second timeout requirement.
   */
  const performResolution = useCallback(
    async (
      currentTemplate: FormTemplate,
      currentProjectId: string | null,
      currentUserId: string,
      currentClientId: string | null
    ): Promise<void> => {
      const invocationId = ++invocationRef.current;

      setResolving(true);
      setError(null);

      const ctx: ResolverContext = {
        projectId: currentProjectId,
        userId: currentUserId,
        clientId: currentClientId,
        fieldMappings: currentTemplate.fieldMappings,
      };

      try {
        // Race the resolution against a 3-second timeout
        const result = await Promise.race([
          resolveAutoFill(currentTemplate, ctx),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Auto-fill resolution timed out')), RESOLUTION_TIMEOUT_MS)
          ),
        ]);

        // Only apply result if this is still the latest invocation
        if (invocationId === invocationRef.current) {
          setResolvedFields(result);
        }
      } catch (err) {
        if (invocationId === invocationRef.current) {
          const message = err instanceof Error ? err.message : 'Auto-fill resolution failed';
          setError(message);
        }
      } finally {
        if (invocationId === invocationRef.current) {
          setResolving(false);
        }
      }
    },
    []
  );

  /**
   * Trigger resolution when template, projectId, or clientId changes.
   */
  useEffect(() => {
    if (!template) {
      setResolvedFields({});
      setResolving(false);
      setError(null);
      return;
    }

    performResolution(template, projectId, userId, clientId);
  }, [template, projectId, userId, clientId, performResolution]);

  /**
   * Re-resolve auto-fill with a new project/client context.
   * Used when the user switches project context on a draft form.
   */
  const reResolve = useCallback(
    async (newProjectId: string, newClientId: string | null): Promise<void> => {
      if (!template) return;
      await performResolution(template, newProjectId, userId, newClientId);
    },
    [template, userId, performResolution]
  );

  return {
    resolvedFields,
    resolving,
    error,
    reResolve,
  };
}

export default useAutoFill;
