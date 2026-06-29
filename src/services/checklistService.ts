import type { ChecklistItem, ChecklistInstance, ChecklistTemplate, ResponseType, FieldIssueDraft, Severity } from '@/types';
import { addDoc, getDoc, updateDoc } from 'firebase/firestore';
import { getDemoCol, getDemoDoc } from '@/demo-seed/demoFirestore';
import { handleFirestoreError, OperationType } from '@/lib/firebase';

/**
 * Checklist Service — Template validation, instance management, and utility functions.
 *
 * Pure functions for validation, count computation, serialization, and issue conversion.
 * I/O functions for Firestore persistence.
 */

export interface TemplateValidationError {
  field: string;        // e.g. 'items', 'items[2].prompt', 'items[0].responseType'
  code: 'required' | 'too_many' | 'too_long' | 'too_short' | 'invalid_value';
  message: string;
}

/** Valid response types for checklist items */
const VALID_RESPONSE_TYPES: ResponseType[] = ['pass_fail_na', 'numeric', 'text'];

/**
 * Pure: validate a checklist template.
 *
 * Rules:
 * - If items is undefined/null/empty → error on field 'items', code 'required'
 * - If items.length > 200 → error on field 'items', code 'too_many'
 * - For each item at index i:
 *   - If prompt is empty (length 0 or only whitespace) → error field `items[${i}].prompt`, code 'too_short'
 *   - If prompt.length > 500 → error field `items[${i}].prompt`, code 'too_long'
 *   - If responseType not in ['pass_fail_na', 'numeric', 'text'] → error field `items[${i}].responseType`, code 'invalid_value'
 */
export function validateTemplate(t: Partial<ChecklistTemplate>): TemplateValidationError[] {
  const errors: TemplateValidationError[] = [];

  // Validate items array presence
  if (!t.items || !Array.isArray(t.items) || t.items.length === 0) {
    errors.push({
      field: 'items',
      code: 'required',
      message: 'A checklist template must have at least 1 item',
    });
    return errors;
  }

  // Validate items count
  if (t.items.length > 200) {
    errors.push({
      field: 'items',
      code: 'too_many',
      message: 'A checklist template must have at most 200 items',
    });
  }

  // Validate each item
  for (let i = 0; i < t.items.length; i++) {
    const item = t.items[i];

    // Validate prompt
    if (!item.prompt || item.prompt.trim().length === 0) {
      errors.push({
        field: `items[${i}].prompt`,
        code: 'too_short',
        message: `Item ${i} prompt must not be empty`,
      });
    } else if (item.prompt.length > 500) {
      errors.push({
        field: `items[${i}].prompt`,
        code: 'too_long',
        message: `Item ${i} prompt must not exceed 500 characters`,
      });
    }

    // Validate responseType
    if (!VALID_RESPONSE_TYPES.includes(item.responseType as ResponseType)) {
      errors.push({
        field: `items[${i}].responseType`,
        code: 'invalid_value',
        message: `Item ${i} responseType must be one of: pass_fail_na, numeric, text`,
      });
    }
  }

  return errors;
}

/** Valid pass/fail/na values */
const VALID_PASS_FAIL_NA = ['pass', 'fail', 'na'] as const;

/**
 * Pure: validate a response value against a checklist item's responseType.
 *
 * Rules:
 * - If item.responseType is 'pass_fail_na': value must be one of 'pass', 'fail', 'na'
 * - If item.responseType is 'numeric': value must be a number (typeof === 'number' and not NaN)
 * - If item.responseType is 'text': value must be a string with length <= 1000
 * - Returns true if valid, false if invalid
 */
export function validateResponse(item: ChecklistItem, value: unknown): boolean {
  switch (item.responseType) {
    case 'pass_fail_na':
      return typeof value === 'string' && (VALID_PASS_FAIL_NA as readonly string[]).includes(value);
    case 'numeric':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'text':
      return typeof value === 'string' && value.length <= 1000;
    default:
      return false;
  }
}

/**
 * Pure: serialize a ChecklistTemplate to a JSON string.
 *
 * Round-trip must preserve: id, projectId, title, items (count, order, each item's id,
 * prompt, responseType, order), createdBy, createdAt.
 *
 * Validates: Requirements 3.6, 3.11
 */
export function serializeTemplate(t: ChecklistTemplate): string {
  return JSON.stringify(t);
}

/**
 * Pure: deserialize a JSON string back into a ChecklistTemplate.
 *
 * Round-trip: deserializeTemplate(serializeTemplate(t)) equals t in item count, order,
 * and definition.
 *
 * Validates: Requirements 3.6, 3.11
 */
export function deserializeTemplate(raw: string): ChecklistTemplate {
  return JSON.parse(raw) as ChecklistTemplate;
}

/**
 * Pure: compute pass, fail, and na counts for a checklist instance.
 *
 * Only considers items with responseType === 'pass_fail_na'.
 * Numeric and text items are completely ignored.
 * For each pass_fail_na item, looks up the corresponding response by itemId.
 * Items without a recorded response do not increment any count.
 *
 * Validates: Requirements 3.5, 3.10
 */
export function computeCounts(instance: ChecklistInstance): { passCount: number; failCount: number; naCount: number } {
  let passCount = 0;
  let failCount = 0;
  let naCount = 0;

  for (const item of instance.items) {
    if (item.responseType !== 'pass_fail_na') {
      continue;
    }

    const response = instance.responses.find(r => r.itemId === item.id);
    if (!response) {
      continue;
    }

    switch (response.value) {
      case 'pass':
        passCount++;
        break;
      case 'fail':
        failCount++;
        break;
      case 'na':
        naCount++;
        break;
    }
  }

  return { passCount, failCount, naCount };
}

/**
 * Pure: convert a failed checklist item to a FieldIssueDraft.
 *
 * Finds the item in instance.items matching itemId, then creates a
 * FieldIssueDraft carrying the item's prompt, checklist reference,
 * empty evidence array, instance location, and 'medium' severity.
 *
 * Throws if itemId is not found in instance.items.
 *
 * Validates: Requirements 3.4, 3.9
 */
export function failedItemToIssue(instance: ChecklistInstance, itemId: string): FieldIssueDraft {
  const item = instance.items.find(i => i.id === itemId);
  if (!item) {
    throw new Error(`Checklist item "${itemId}" not found in instance "${instance.id}"`);
  }

  return {
    prompt: item.prompt,
    checklistRef: { instanceId: instance.id, itemId },
    evidenceIds: [],
    location: instance.location,
    severity: 'medium',
  };
}


/**
 * I/O: Create and persist a ChecklistTemplate to Firestore.
 *
 * - Calls validateTemplate() — if errors, throws a validation error
 * - Generates a new ID via addDoc (auto-generated)
 * - Sets createdAt to current ISO timestamp
 * - Persists to Firestore collection `projects/{template.projectId}/checklist_templates`
 * - Returns the full ChecklistTemplate with generated id and createdAt
 *
 * Validates: Requirements 3.1, 3.7
 */
export async function createTemplate(
  template: Omit<ChecklistTemplate, 'id' | 'createdAt'>
): Promise<ChecklistTemplate> {
  // Validate first — throw if invalid
  const errors = validateTemplate(template as Partial<ChecklistTemplate>);
  if (errors.length > 0) {
    throw new Error(`Template validation failed: ${errors.map(e => `${e.field} (${e.code}): ${e.message}`).join('; ')}`);
  }

  const createdAt = new Date().toISOString();
  const payload = {
    projectId: template.projectId,
    title: template.title,
    items: template.items,
    createdBy: template.createdBy,
    createdAt,
  };

  try {
    const colRef = getDemoCol('projects', template.projectId, 'checklist_templates');
    const docRef = await addDoc(colRef, payload);

    return {
      id: docRef.id,
      ...payload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${template.projectId}/checklist_templates`);
    // handleFirestoreError always throws, but TypeScript needs a return
    throw error;
  }
}


/**
 * I/O: Start a ChecklistInstance from a template.
 *
 * - Loads the template from Firestore (`projects/{projectId}/checklist_templates/{templateId}`)
 * - If not found, throws an error
 * - Creates a ChecklistInstance with:
 *   - Generated ID from addDoc
 *   - templateId, projectId, location
 *   - items: copy template.items in order
 *   - responses: [] (empty)
 *   - status: 'in_progress'
 * - Persists to `projects/{projectId}/checklist_instances`
 * - Returns the instance
 *
 * Validates: Requirements 3.2, 3.7
 */
export async function startInstance(
  templateId: string,
  projectId: string,
  location: string
): Promise<ChecklistInstance> {
  // Load the template from Firestore
  const templateRef = getDemoDoc('projects', projectId, 'checklist_templates', templateId);
  const templateSnap = await getDoc(templateRef);

  if (!templateSnap.exists()) {
    throw new Error(`Checklist template "${templateId}" not found in project "${projectId}"`);
  }

  const templateData = templateSnap.data() as Omit<ChecklistTemplate, 'id'>;

  // Copy items in their defined order
  const items: ChecklistItem[] = templateData.items.map((item, index) => ({
    id: item.id,
    prompt: item.prompt,
    responseType: item.responseType,
    order: item.order ?? index,
  }));

  const payload = {
    templateId,
    projectId,
    location,
    items,
    responses: [] as never[],
    status: 'in_progress' as const,
  };

  try {
    const colRef = getDemoCol('projects', projectId, 'checklist_instances');
    const docRef = await addDoc(colRef, payload);

    return {
      id: docRef.id,
      ...payload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}/checklist_instances`);
    throw error;
  }
}


/**
 * I/O: Complete a checklist instance.
 *
 * - Loads the checklist instance from Firestore (`projects/{projectId}/checklist_instances/{instanceId}`)
 * - If not found, throws an error
 * - Calls computeCounts(instance) to get { passCount, failCount, naCount }
 * - Updates the instance with status='completed', passCount, failCount, naCount
 * - Persists the computed fields to Firestore using updateDoc
 * - Returns the updated instance
 *
 * Validates: Requirements 3.5
 */
export async function completeInstance(
  projectId: string,
  instanceId: string,
): Promise<ChecklistInstance> {
  // Load the instance from Firestore
  const instanceRef = getDemoDoc('projects', projectId, 'checklist_instances', instanceId);
  const instanceSnap = await getDoc(instanceRef);

  if (!instanceSnap.exists()) {
    throw new Error(`Checklist instance "${instanceId}" not found in project "${projectId}"`);
  }

  const instanceData = instanceSnap.data() as Omit<ChecklistInstance, 'id'>;

  // Build the full instance for computeCounts
  const instance: ChecklistInstance = {
    id: instanceId,
    ...instanceData,
  };

  // Compute pass/fail/na counts
  const { passCount, failCount, naCount } = computeCounts(instance);

  // Persist to Firestore
  try {
    await updateDoc(instanceRef, {
      status: 'completed',
      passCount,
      failCount,
      naCount,
    });

    return {
      ...instance,
      status: 'completed',
      passCount,
      failCount,
      naCount,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/checklist_instances/${instanceId}`);
    throw error;
  }
}


/**
 * I/O: Record a response for a checklist item in an instance.
 *
 * - Loads the checklist instance from Firestore (`projects/{projectId}/checklist_instances/{instanceId}`)
 * - Finds the item in instance.items by itemId — throws if not found
 * - Calls validateResponse(item, value) — if invalid, throws with error naming expected response type
 * - Updates the instance: adds/replaces the response in responses array (upsert by itemId)
 * - Persists the updated responses array to Firestore using updateDoc
 * - Returns the updated instance
 *
 * Validates: Requirements 3.3, 3.8
 */
export async function recordResponse(
  projectId: string,
  instanceId: string,
  itemId: string,
  value: unknown
): Promise<ChecklistInstance> {
  // Load the instance from Firestore
  const instanceRef = getDemoDoc('projects', projectId, 'checklist_instances', instanceId);
  const instanceSnap = await getDoc(instanceRef);

  if (!instanceSnap.exists()) {
    throw new Error(`Checklist instance "${instanceId}" not found in project "${projectId}"`);
  }

  const instanceData = instanceSnap.data() as Omit<ChecklistInstance, 'id'>;

  // Find the item by itemId
  const item = instanceData.items.find(i => i.id === itemId);
  if (!item) {
    throw new Error(`Checklist item "${itemId}" not found in instance "${instanceId}"`);
  }

  // Validate the response against the item's response type
  if (!validateResponse(item, value)) {
    throw new Error(
      `Invalid response for item "${itemId}": expected response type "${item.responseType}"`
    );
  }

  // Upsert the response in the responses array (replace if exists, add if not)
  const existingResponses = instanceData.responses || [];
  const existingIndex = existingResponses.findIndex(r => r.itemId === itemId);
  const updatedResponses = [...existingResponses];

  if (existingIndex >= 0) {
    updatedResponses[existingIndex] = { itemId, value: value as ChecklistInstance['responses'][number]['value'] };
  } else {
    updatedResponses.push({ itemId, value: value as ChecklistInstance['responses'][number]['value'] });
  }

  // Persist to Firestore
  try {
    await updateDoc(instanceRef, { responses: updatedResponses });

    return {
      id: instanceId,
      ...instanceData,
      responses: updatedResponses,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}/checklist_instances/${instanceId}`);
    throw error;
  }
}
