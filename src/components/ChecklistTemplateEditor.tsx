import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChecklistItem, ChecklistTemplate, ResponseType, UserRole } from '@/types';
import {
  createTemplate,
  validateTemplate,
  type TemplateValidationError,
} from '@/services/checklistService';
import { EDITOR_ROLES } from '@/services/fieldAccessService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2, Plus, Trash2 } from 'lucide-react';

/**
 * Maximum number of items allowed in a checklist template (Requirement 3.1, 3.7).
 */
const MAX_ITEMS = 200;
/** Maximum prompt length per item (Requirement 3.1, 3.7). */
const MAX_PROMPT_LENGTH = 500;

/** Selectable response types and their human-readable labels. */
const RESPONSE_TYPE_OPTIONS: Array<{ value: ResponseType; label: string }> = [
  { value: 'pass_fail_na', label: 'Pass / Fail / N-A' },
  { value: 'numeric', label: 'Numeric' },
  { value: 'text', label: 'Text' },
];

/** A draft item carried in editor state before persistence. */
type DraftItem = ChecklistItem;

export interface ChecklistTemplateEditorProps {
  projectId: string;
  /** Role of the current user — authoring is gated to EDITOR_ROLES (Requirement 3.1, 6.1). */
  userRole: UserRole;
  /** Identifier of the authoring user, recorded as createdBy on save. */
  createdBy: string;
  /** Optional initial template to edit (e.g. when cloning or revising). */
  initialTemplate?: Partial<ChecklistTemplate>;
  /**
   * Invoked after the template has been validated and persisted via
   * checklistService.createTemplate, receiving the saved template (with its
   * generated id and createdAt). The component never touches Firestore directly —
   * all persistence flows through the service.
   */
  onSave?: (template: ChecklistTemplate) => void;
  onCancel?: () => void;
}

let itemSeq = 0;
function newItemId(): string {
  itemSeq += 1;
  return `item-${Date.now()}-${itemSeq}`;
}

function createBlankItem(order: number): DraftItem {
  return { id: newItemId(), prompt: '', responseType: 'pass_fail_na', order };
}

/**
 * ChecklistTemplateEditor — authors reusable inspection checklist templates.
 *
 * Task 14.1: add/remove items, edit prompts and response types, validate as the user
 * types (1–200 items, 1–500 char prompts, responseType enum), and surface rejection UI
 * naming each invalid field. Validation is delegated to checklistService.validateTemplate
 * so the editor stays consistent with server-side rules (Requirements 3.1, 3.7).
 */
export function ChecklistTemplateEditor({
  projectId,
  userRole,
  createdBy,
  initialTemplate,
  onSave,
  onCancel,
}: ChecklistTemplateEditorProps) {
  const canAuthor = EDITOR_ROLES.includes(userRole);

  const [title, setTitle] = useState<string>(initialTemplate?.title ?? '');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Tracks which item row currently holds focus so keyboard shortcuts (e.g. remove)
  // can operate on the item the user is editing.
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  // When set, the matching prompt input is focused on the next render (used after
  // add/remove so keyboard users keep an unbroken focus path — Requirement 9.4).
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  // Map of item id → its prompt input element, for programmatic focus management.
  const promptRefs = useRef<Map<string, HTMLInputElement | null>>(new Map());
  const [items, setItems] = useState<DraftItem[]>(() => {
    const initial = initialTemplate?.items;
    if (initial && initial.length > 0) {
      return initial.map((item, index) => ({
        id: item.id ?? newItemId(),
        prompt: item.prompt ?? '',
        responseType: item.responseType ?? 'pass_fail_na',
        order: item.order ?? index,
      }));
    }
    return [createBlankItem(0)];
  });

  // Live validation — recomputed on every render so errors update as the user types.
  const errors: TemplateValidationError[] = useMemo(
    () => validateTemplate({ projectId, title, items }),
    [projectId, title, items],
  );

  // Index errors by field so each control can show its own message.
  const errorsByField = useMemo(() => {
    const map = new Map<string, TemplateValidationError[]>();
    for (const err of errors) {
      const list = map.get(err.field) ?? [];
      list.push(err);
      map.set(err.field, list);
    }
    return map;
  }, [errors]);

  const isValid = errors.length === 0;

  const addItem = useCallback(() => {
    setItems(prev => {
      if (prev.length >= MAX_ITEMS) {
        return prev;
      }
      const item = createBlankItem(prev.length);
      // Move keyboard focus to the freshly added item's prompt (Requirement 9.4).
      setPendingFocusId(item.id);
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => {
      if (prev.length <= 1) {
        return prev;
      }
      const removedIndex = prev.findIndex(item => item.id === id);
      const next = prev
        .filter(item => item.id !== id)
        // Re-sequence order to stay contiguous after removal.
        .map((item, index) => ({ ...item, order: index }));
      // Keep focus on a neighbouring item so keyboard users are not stranded.
      const focusTarget = next[Math.min(removedIndex, next.length - 1)];
      if (focusTarget) {
        setPendingFocusId(focusTarget.id);
      }
      promptRefs.current.delete(id);
      return next;
    });
  }, []);

  const updatePrompt = useCallback((id: string, prompt: string) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, prompt } : item)));
  }, []);

  const updateResponseType = useCallback((id: string, responseType: ResponseType) => {
    setItems(prev => prev.map(item => (item.id === id ? { ...item, responseType } : item)));
  }, []);

  const handleSave = useCallback(async () => {
    if (!canAuthor || !isValid || saving) {
      return;
    }
    const normalized: DraftItem[] = items.map((item, index) => ({
      id: item.id,
      prompt: item.prompt,
      responseType: item.responseType,
      order: index,
    }));
    setSaving(true);
    setSaveError(null);
    try {
      // checklistService.createTemplate re-validates before persisting, so the
      // component never writes to Firestore directly (validation-before-save).
      const saved = await createTemplate({ projectId, title, items: normalized, createdBy });
      onSave?.(saved);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [canAuthor, isValid, saving, items, onSave, projectId, title, createdBy]);

  // Apply pending focus once the corresponding input has rendered (Requirement 9.4).
  useEffect(() => {
    if (!pendingFocusId) {
      return;
    }
    const input = promptRefs.current.get(pendingFocusId);
    if (input) {
      input.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, items]);

  /**
   * Keyboard shortcuts for the editor (Requirement 9.4, 9.5). Handled at the form
   * container so they fire even while focus is inside a prompt input:
   *   Alt+A          → add a checklist item
   *   Alt+R          → remove the item currently being edited
   *   Ctrl/Cmd+Enter → save the template when valid
   * Other keys (including plain typing) pass through untouched.
   */
  const handleShortcuts = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const isMeta = event.ctrlKey || event.metaKey;

      if (event.altKey && (event.key === 'a' || event.key === 'A')) {
        if (items.length < MAX_ITEMS) {
          event.preventDefault();
          addItem();
        }
        return;
      }

      if (event.altKey && (event.key === 'r' || event.key === 'R')) {
        if (focusedItemId && items.length > 1) {
          event.preventDefault();
          removeItem(focusedItemId);
        }
        return;
      }

      if (isMeta && event.key === 'Enter') {
        if (isValid && !saving) {
          event.preventDefault();
          void handleSave();
        }
      }
    },
    [items.length, focusedItemId, isValid, saving, addItem, removeItem, handleSave],
  );

  if (!canAuthor) {
    return (
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Checklist Template Editor</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Not authorized</AlertTitle>
            <AlertDescription>
              Your role ({userRole}) cannot author checklist templates. Authoring is limited to
              site managers, contractors, subcontractors, architects, engineers, and BEPs.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Template-level (items array) errors, e.g. required / too_many.
  const itemsLevelErrors = errorsByField.get('items') ?? [];

  return (
    <Card className="w-full max-w-3xl">
      <CardHeader>
        <CardTitle>Checklist Template Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6" onKeyDown={handleShortcuts}>
        {/* Keyboard shortcut reference — also serves as an accessible description
            for the editor's interactive controls (Requirement 9.5). */}
        <p id="cte-shortcuts" className="text-xs text-muted-foreground">
          Keyboard shortcuts:{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Alt+A</kbd> add item ·{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Alt+R</kbd> remove the item you are editing ·{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl+Enter</kbd> save. Use{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Tab</kbd> to move between fields.
        </p>

        {/* Title */}
        <div className="space-y-2">
          <Label htmlFor="template-title">Template title</Label>
          <Input
            id="template-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Foundation pre-pour inspection"
            aria-label="Checklist template title"
            aria-describedby="cte-shortcuts"
          />
        </div>

        {/* Validation summary — names each invalid field (Requirement 3.7) */}
        {!isValid && (
          <Alert variant="destructive" role="alert" aria-live="polite">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>
              {errors.length} validation {errors.length === 1 ? 'issue' : 'issues'} — fix before saving
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {errors.map((err, i) => (
                  <li key={`${err.field}-${err.code}-${i}`}>
                    <span className="font-medium">{err.field}</span>: {err.message}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>
              Checklist items{' '}
              <span className="text-muted-foreground font-normal">
                {`(${items.length} / ${MAX_ITEMS})`}
              </span>
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={items.length >= MAX_ITEMS}
              aria-label="Add checklist item"
              aria-keyshortcuts="Alt+A"
              title="Add item (Alt+A)"
            >
              <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
              Add item
            </Button>
          </div>

          {itemsLevelErrors.length > 0 && (
            <p className="text-sm text-destructive" role="alert">
              {itemsLevelErrors.map(e => e.message).join('; ')}
            </p>
          )}

          <ul className="space-y-3">
            {items.map((item, index) => {
              const promptField = `items[${index}].prompt`;
              const typeField = `items[${index}].responseType`;
              const promptErrors = errorsByField.get(promptField) ?? [];
              const typeErrors = errorsByField.get(typeField) ?? [];
              const promptInvalid = promptErrors.length > 0;
              const typeInvalid = typeErrors.length > 0;
              const promptErrorId = `${item.id}-prompt-error`;
              const typeErrorId = `${item.id}-type-error`;

              return (
                <li key={item.id} className="rounded-lg border border-input p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-2 text-sm text-muted-foreground tabular-nums w-6 shrink-0"
                      aria-hidden="true"
                    >
                      {index + 1}.
                    </span>

                    <div className="flex-1 space-y-1">
                      <Label htmlFor={`${item.id}-prompt`} className="sr-only">
                        Item {index + 1} prompt
                      </Label>
                      <Input
                        id={`${item.id}-prompt`}
                        ref={el => {
                          promptRefs.current.set(item.id, el);
                        }}
                        value={item.prompt}
                        onChange={e => updatePrompt(item.id, e.target.value)}
                        onFocus={() => setFocusedItemId(item.id)}
                        placeholder="Inspection prompt"
                        maxLength={MAX_PROMPT_LENGTH + 50 /* allow over-typing so error surfaces */}
                        aria-label={`Prompt for item ${index + 1}`}
                        aria-invalid={promptInvalid}
                        aria-describedby={
                          promptInvalid ? `${promptErrorId} cte-shortcuts` : 'cte-shortcuts'
                        }
                      />
                      <div className="flex items-center justify-between">
                        {promptInvalid ? (
                          <span id={promptErrorId} className="text-xs text-destructive" role="alert">
                            {promptErrors.map(e => e.message).join('; ')}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span
                          className={
                            item.prompt.length > MAX_PROMPT_LENGTH
                              ? 'text-xs text-destructive tabular-nums'
                              : 'text-xs text-muted-foreground tabular-nums'
                          }
                        >
                          {item.prompt.length} / {MAX_PROMPT_LENGTH}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor={`${item.id}-type`} className="sr-only">
                        Response type for item {index + 1}
                      </Label>
                      <select
                        id={`${item.id}-type`}
                        value={item.responseType}
                        onChange={e => updateResponseType(item.id, e.target.value as ResponseType)}
                        onFocus={() => setFocusedItemId(item.id)}
                        aria-label={`Response type for item ${index + 1}`}
                        aria-invalid={typeInvalid}
                        aria-describedby={typeInvalid ? typeErrorId : undefined}
                        className="h-8 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive dark:bg-input/30"
                      >
                        {RESPONSE_TYPE_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {typeInvalid && (
                        <span id={typeErrorId} className="block text-xs text-destructive" role="alert">
                          {typeErrors.map(e => e.message).join('; ')}
                        </span>
                      )}
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(item.id)}
                      onFocus={() => setFocusedItemId(item.id)}
                      disabled={items.length <= 1}
                      aria-label={`Remove item ${index + 1}`}
                      aria-keyshortcuts="Alt+R"
                      title={items.length <= 1 ? 'A template must keep at least one item' : 'Remove item (Alt+R)'}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Save failure surfaced separately from validation issues. */}
        {saveError && (
          <Alert variant="destructive" role="alert" aria-live="assertive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>Could not save template</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 pt-2">
          <div className="text-sm" aria-live="polite">
            {isValid ? (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Template is valid
              </span>
            ) : (
              <span className="text-muted-foreground">Resolve validation issues to save</span>
            )}
          </div>
          <div className="flex gap-2">
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={saving}
                aria-label="Cancel editing"
              >
                Cancel
              </Button>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={!isValid || saving}
              aria-label="Save checklist template"
              aria-keyshortcuts="Control+Enter"
              title="Save template (Ctrl+Enter)"
            >
              {saving ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ChecklistTemplateEditor;
