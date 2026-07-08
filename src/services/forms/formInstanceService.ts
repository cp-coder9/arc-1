// ─── Form Instance Service ──────────────────────────────────────────────────
// CRUD operations, status transitions, field updates, project context switching,
// and standalone form support for form instances in Firestore `form_instances`.
// Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/lib/firebase';
import type {
  FormInstance,
  FormStatus,
  FormFieldValue,
  FormTemplate,
} from '@/services/forms/formTypes';
import { resolveAutoFill } from '@/services/forms/autoFillEngine';
import { recordCreationEvent, recordFieldModification } from '@/services/forms/formAuditService';
import { getTemplate } from '@/services/forms/formTemplateService';

// ─── Constants ──────────────────────────────────────────────────────────────

const FORM_INSTANCES_COL = 'form_instances';

/**
 * Valid status transitions map.
 * Key = current status, Value = array of allowed next statuses.
 */
const VALID_TRANSITIONS: Record<FormStatus, FormStatus[]> = {
  draft: ['awaiting_approval', 'ready_for_export'],
  awaiting_approval: ['ready_for_export', 'draft'],
  ready_for_export: ['exported'],
  exported: ['signed'],
  signed: [],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function instancesRef() {
  return collection(db, FORM_INSTANCES_COL);
}

function instanceDocRef(id: string) {
  return doc(db, FORM_INSTANCES_COL, id);
}

function generateId(): string {
  return doc(instancesRef()).id;
}

// ─── Create ─────────────────────────────────────────────────────────────────

/**
 * Creates a new FormInstance from a template with auto-fill resolution.
 *
 * - Fetches the template by ID
 * - Resolves auto-fill fields using the project/user/client context
 * - Stores the instance in Firestore with denormalized template metadata
 * - Records a creation audit event
 * - Supports standalone mode (projectId = null): all fields manual
 *
 * Requirements: 3.1, 3.4, 3.5, 4.1, 4.2, 4.4
 */
export async function createFormInstance(
  templateId: string,
  projectId: string | null,
  userId: string,
  userName: string,
  clientId: string | null
): Promise<FormInstance> {
  // Fetch the template
  const template = await getTemplate(templateId);
  if (!template) {
    throw new Error(`Form template not found: ${templateId}`);
  }

  // Resolve auto-fill fields from platform data
  const resolvedFields = await resolveAutoFill(template, {
    projectId,
    userId,
    clientId,
    fieldMappings: template.fieldMappings,
  });

  const instanceId = generateId();
  const now = Timestamp.now();

  const instance: FormInstance = {
    id: instanceId,
    templateId: template.id,
    templateVersion: template.version,
    projectId,
    createdBy: userId,
    status: 'draft',
    fields: resolvedFields,
    signatures: {},
    collaborators: [],
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(instanceDocRef(instanceId), instance);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }

  // Record creation audit event (non-blocking — errors logged but don't fail creation)
  try {
    await recordCreationEvent(
      instanceId,
      userId,
      userName,
      template.id,
      projectId,
      resolvedFields
    );
  } catch {
    // Audit failure is logged by the audit service; instance creation succeeds
    console.warn(`Audit event recording failed for instance ${instanceId} creation`);
  }

  return instance;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Retrieves a single form instance by ID.
 * Returns null if the instance does not exist.
 */
export async function getFormInstance(instanceId: string): Promise<FormInstance | null> {
  try {
    const snap = await getDoc(instanceDocRef(instanceId));
    if (!snap.exists()) return null;
    return snap.data() as FormInstance;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }
}

// ─── Update Fields ──────────────────────────────────────────────────────────

/**
 * Updates one or more field values on a form instance.
 *
 * - Setting a value marks the field as source 'manual' and isOverridden: true
 *   (when an autoFillValue existed for the field)
 * - Setting value to null clears the field but retains override status
 *
 * Requirements: 3.1, 3.2
 */
export async function updateFormFields(
  instanceId: string,
  fieldUpdates: Record<string, string | null>,
  userId: string,
  userName: string
): Promise<FormInstance> {
  const instance = await getFormInstance(instanceId);
  if (!instance) {
    throw new Error(`Form instance not found: ${instanceId}`);
  }

  const now = Timestamp.now();
  const updatedFields = { ...instance.fields };

  for (const [fieldId, newValue] of Object.entries(fieldUpdates)) {
    const existingField = updatedFields[fieldId];
    const previousValue = existingField?.value ?? null;

    updatedFields[fieldId] = {
      value: newValue,
      source: 'manual',
      isOverridden: existingField?.autoFillValue != null,
      autoFillValue: existingField?.autoFillValue ?? null,
      lastModifiedBy: userId,
      lastModifiedAt: now,
    };

    // Record field modification in audit trail
    try {
      await recordFieldModification(
        instanceId,
        userId,
        userName,
        fieldId,
        fieldId, // fieldLabel — using fieldId as label since we don't have schema context here
        typeof previousValue === 'string' ? previousValue : null,
        newValue,
        updatedFields
      );
    } catch {
      console.warn(`Audit event recording failed for field ${fieldId} modification`);
    }
  }

  try {
    await updateDoc(instanceDocRef(instanceId), {
      fields: updatedFields,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }

  return {
    ...instance,
    fields: updatedFields,
    updatedAt: now,
  };
}

// ─── Revert Field ───────────────────────────────────────────────────────────

/**
 * Reverts a manually overridden field to its auto-fill value (or clears it if
 * no auto-fill source is available). Removes the user-modified indicator.
 *
 * Requirement: 3.3
 */
export async function revertField(
  instanceId: string,
  fieldId: string,
  userId: string,
  userName: string
): Promise<FormInstance> {
  const instance = await getFormInstance(instanceId);
  if (!instance) {
    throw new Error(`Form instance not found: ${instanceId}`);
  }

  const existingField = instance.fields[fieldId];
  if (!existingField) {
    throw new Error(`Field not found: ${fieldId} on instance ${instanceId}`);
  }

  const now = Timestamp.now();
  const previousValue = existingField.value;
  const revertedValue = existingField.autoFillValue;

  const updatedFields = {
    ...instance.fields,
    [fieldId]: {
      value: revertedValue,
      source: revertedValue ? 'auto_fill' as const : 'manual' as const,
      isOverridden: false,
      autoFillValue: existingField.autoFillValue,
      lastModifiedBy: revertedValue ? 'system' : userId,
      lastModifiedAt: now,
    },
  };

  // Record the revert in audit trail
  try {
    await recordFieldModification(
      instanceId,
      userId,
      userName,
      fieldId,
      fieldId,
      typeof previousValue === 'string' ? previousValue : null,
      revertedValue,
      updatedFields
    );
  } catch {
    console.warn(`Audit event recording failed for field ${fieldId} revert`);
  }

  try {
    await updateDoc(instanceDocRef(instanceId), {
      fields: updatedFields,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }

  return {
    ...instance,
    fields: updatedFields,
    updatedAt: now,
  };
}

// ─── Switch Project Context ─────────────────────────────────────────────────

/**
 * Switches the project context on a form instance.
 *
 * - Re-resolves all non-overridden fields using the new project data
 * - Preserves all fields marked as user-modified (isOverridden: true)
 * - Returns a summary of how many fields were updated
 *
 * Requirement: 4.3
 */
export async function switchProjectContext(
  instanceId: string,
  newProjectId: string,
  newClientId: string | null,
  userId: string,
  userName: string
): Promise<{ instance: FormInstance; fieldsUpdated: number }> {
  const instance = await getFormInstance(instanceId);
  if (!instance) {
    throw new Error(`Form instance not found: ${instanceId}`);
  }

  // Fetch the template to get field mappings for re-resolution
  const template = await getTemplate(instance.templateId);
  if (!template) {
    throw new Error(`Form template not found: ${instance.templateId}`);
  }

  // Re-resolve auto-fill with new project context
  const newResolvedFields = await resolveAutoFill(template, {
    projectId: newProjectId,
    userId,
    clientId: newClientId,
    fieldMappings: template.fieldMappings,
  });

  const now = Timestamp.now();
  const updatedFields = { ...instance.fields };
  let fieldsUpdated = 0;

  // Merge: preserve overridden fields, update non-overridden ones
  for (const [fieldId, newFieldValue] of Object.entries(newResolvedFields)) {
    const existingField = updatedFields[fieldId];

    // If field is overridden by the user, preserve it
    if (existingField?.isOverridden) {
      // Keep the override, but update the autoFillValue to reflect new context
      updatedFields[fieldId] = {
        ...existingField,
        autoFillValue: newFieldValue.autoFillValue,
      };
      continue;
    }

    // Non-overridden field: apply new resolved value
    const previousValue = existingField?.value ?? null;
    const newValue = newFieldValue.value;

    if (previousValue !== newValue) {
      fieldsUpdated++;
    }

    updatedFields[fieldId] = {
      ...newFieldValue,
      lastModifiedAt: now,
    };
  }

  try {
    await updateDoc(instanceDocRef(instanceId), {
      fields: updatedFields,
      projectId: newProjectId,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }

  const updatedInstance: FormInstance = {
    ...instance,
    fields: updatedFields,
    projectId: newProjectId,
    updatedAt: now,
  };

  return { instance: updatedInstance, fieldsUpdated };
}

// ─── Status Transitions ─────────────────────────────────────────────────────

/**
 * Transitions a form instance to a new status.
 *
 * Valid transitions:
 * - draft → awaiting_approval
 * - draft → ready_for_export (skip approval)
 * - awaiting_approval → ready_for_export (approved)
 * - awaiting_approval → draft (rejected)
 * - ready_for_export → exported
 * - exported → signed
 *
 * Throws if the transition is invalid.
 */
export async function updateStatus(
  instanceId: string,
  newStatus: FormStatus
): Promise<FormInstance> {
  const instance = await getFormInstance(instanceId);
  if (!instance) {
    throw new Error(`Form instance not found: ${instanceId}`);
  }

  const allowedTransitions = VALID_TRANSITIONS[instance.status];
  if (!allowedTransitions.includes(newStatus)) {
    throw new Error(
      `Invalid status transition: cannot move from '${instance.status}' to '${newStatus}'. ` +
      `Allowed transitions from '${instance.status}': [${allowedTransitions.join(', ')}]`
    );
  }

  const now = Timestamp.now();

  try {
    await updateDoc(instanceDocRef(instanceId), {
      status: newStatus,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }

  return {
    ...instance,
    status: newStatus,
    updatedAt: now,
  };
}

// ─── Delete ─────────────────────────────────────────────────────────────────

/**
 * Permanently deletes a form instance from Firestore.
 */
export async function deleteFormInstance(instanceId: string): Promise<void> {
  try {
    const snap = await getDoc(instanceDocRef(instanceId));
    if (!snap.exists()) {
      throw new Error(`Form instance not found: ${instanceId}`);
    }

    await deleteDoc(instanceDocRef(instanceId));
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.DELETE, `${FORM_INSTANCES_COL}/${instanceId}`);
    throw error;
  }
}
