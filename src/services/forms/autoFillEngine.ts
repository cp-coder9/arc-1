// ─── Auto-Fill Engine ────────────────────────────────────────────────────────
// Chain-of-responsibility resolver pattern that populates form fields from
// platform data sources: Project Passport, User Profile, Client Record, Firm Record.
// Each resolver queries its respective Firestore collection and returns values
// using dot-notation paths. Deterministic: same context always → same output.

import { doc, getDoc } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type {
  ResolverContext,
  DataResolver,
  FieldMapping,
  FormFieldValue,
  FormTemplate,
  DataSourceRef,
} from '@/services/forms/formTypes';

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Safely retrieves a nested value from an object using a dot-separated path.
 * Returns null if any segment along the path is undefined/null.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | null {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return null;
    if (typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[part];
  }

  if (current === null || current === undefined) return null;
  if (typeof current === 'string') return current;
  if (typeof current === 'number' || typeof current === 'boolean') return String(current);
  // Arrays and objects are stringified for simple display
  if (Array.isArray(current)) return current.join(', ');
  return null;
}

// ─── Resolvers ──────────────────────────────────────────────────────────────

/**
 * Resolves field values from the Project Passport document.
 * Reads from: projects/{projectId}
 */
class ProjectPassportResolver implements DataResolver {
  provider: DataSourceRef['provider'] = 'project_passport';

  async resolve(path: string, ctx: ResolverContext): Promise<string | null> {
    if (!ctx.projectId) return null;

    try {
      const docRef = doc(db, 'projects', ctx.projectId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;

      const data = snapshot.data() as Record<string, unknown>;
      return getNestedValue(data, path);
    } catch {
      // Data source unavailable — graceful fallback
      return null;
    }
  }
}

/**
 * Resolves field values from the User Profile document.
 * Reads from: users/{userId}
 */
class UserProfileResolver implements DataResolver {
  provider: DataSourceRef['provider'] = 'user_profile';

  async resolve(path: string, ctx: ResolverContext): Promise<string | null> {
    if (!ctx.userId) return null;

    try {
      const docRef = doc(db, 'users', ctx.userId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;

      const data = snapshot.data() as Record<string, unknown>;
      return getNestedValue(data, path);
    } catch {
      return null;
    }
  }
}

/**
 * Resolves field values from the Client Record document.
 * Reads from: projects/{projectId}/clients/{clientId}
 * If no clientId is provided, returns null (user must select a client first).
 */
class ClientRecordResolver implements DataResolver {
  provider: DataSourceRef['provider'] = 'client_record';

  async resolve(path: string, ctx: ResolverContext): Promise<string | null> {
    if (!ctx.projectId || !ctx.clientId) return null;

    try {
      const docRef = doc(db, 'projects', ctx.projectId, 'clients', ctx.clientId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return null;

      const data = snapshot.data() as Record<string, unknown>;
      return getNestedValue(data, path);
    } catch {
      return null;
    }
  }
}

/**
 * Resolves field values from the Firm Record document.
 * Reads from: firms/{firmId} where firmId is derived from the user profile.
 */
class FirmRecordResolver implements DataResolver {
  provider: DataSourceRef['provider'] = 'firm_record';

  async resolve(path: string, ctx: ResolverContext): Promise<string | null> {
    if (!ctx.userId) return null;

    try {
      // First, look up the user's firmId from their profile
      const userDocRef = doc(db, 'users', ctx.userId);
      const userSnapshot = await getDoc(userDocRef);
      if (!userSnapshot.exists()) return null;

      const userData = userSnapshot.data() as Record<string, unknown>;
      const firmId = userData.firmId as string | undefined;
      if (!firmId) return null;

      // Then read the firm document
      const firmDocRef = doc(db, 'firms', firmId);
      const firmSnapshot = await getDoc(firmDocRef);
      if (!firmSnapshot.exists()) return null;

      const firmData = firmSnapshot.data() as Record<string, unknown>;
      return getNestedValue(firmData, path);
    } catch {
      return null;
    }
  }
}

// ─── Resolver Registry ──────────────────────────────────────────────────────

const resolverInstances: DataResolver[] = [
  new ProjectPassportResolver(),
  new UserProfileResolver(),
  new ClientRecordResolver(),
  new FirmRecordResolver(),
];

/**
 * Returns the appropriate resolver for a given data source provider.
 * Useful for external callers that need to resolve a single field.
 */
export function getResolverForProvider(provider: DataSourceRef['provider']): DataResolver {
  const resolver = resolverInstances.find(r => r.provider === provider);
  if (!resolver) {
    throw new Error(`No resolver registered for provider: ${provider}`);
  }
  return resolver;
}

// ─── Main Resolution Function ───────────────────────────────────────────────

/**
 * Resolves all auto-fill field values for a form template given a resolver context.
 *
 * Iterates the template's field mappings and invokes the appropriate resolver
 * for each mapping's data source provider. Produces a deterministic output:
 * same template + same context → same field values.
 *
 * Fields that cannot be resolved (data source unavailable, path not found, or
 * missing context like projectId/clientId) are marked with source: 'manual'
 * and empty value, indicating manual entry is required.
 *
 * Must complete within 3 seconds (design requirement).
 */
export async function resolveAutoFill(
  template: FormTemplate,
  ctx: ResolverContext
): Promise<Record<string, FormFieldValue>> {
  const results: Record<string, FormFieldValue> = {};
  const now = Timestamp.now();

  // Process field mappings deterministically (in array order)
  for (const mapping of template.fieldMappings) {
    const resolver = resolverInstances.find(r => r.provider === mapping.dataSource.provider);

    let value: string | null = null;
    if (resolver) {
      value = await resolver.resolve(mapping.dataSource.path, ctx);
    }

    results[mapping.fieldId] = {
      value: value,
      source: value ? 'auto_fill' : 'manual',
      isOverridden: false,
      autoFillValue: value,
      lastModifiedBy: value ? 'system' : '',
      lastModifiedAt: now,
    };
  }

  return results;
}

// ─── Exports for Testing ────────────────────────────────────────────────────

export { getNestedValue as _getNestedValue };
export {
  ProjectPassportResolver,
  UserProfileResolver,
  ClientRecordResolver,
  FirmRecordResolver,
};
