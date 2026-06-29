import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, XCircle, MinusCircle, Hash, Type, ListChecks, AlertTriangle, ClipboardCheck } from 'lucide-react';
import type {
  ChecklistInstance,
  ChecklistItem,
  ChecklistResponse,
  FieldIssueDraft,
  PassFailNa,
  ResponseType,
} from '@/types';
import { computeCounts, failedItemToIssue, validateResponse } from '@/services/checklistService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** Human-readable label for each response type. */
const responseTypeLabel: Record<ResponseType, string> = {
  pass_fail_na: 'Pass / Fail / N/A',
  numeric: 'Numeric',
  text: 'Text',
};

/** Maximum length for text responses (mirrors checklistService.validateResponse). */
const TEXT_RESPONSE_MAX = 1000;

/** Icon for each response type indicator. */
function ResponseTypeIcon({ type }: { type: ResponseType }) {
  switch (type) {
    case 'pass_fail_na':
      return <ListChecks size={14} aria-hidden="true" />;
    case 'numeric':
      return <Hash size={14} aria-hidden="true" />;
    case 'text':
      return <Type size={14} aria-hidden="true" />;
    default:
      return null;
  }
}

/**
 * Returns the recorded response value for an item, or undefined if none recorded yet.
 */
function responseForItem(
  responses: ChecklistResponse[],
  itemId: string,
): ChecklistResponse['value'] | undefined {
  return responses.find((r) => r.itemId === itemId)?.value;
}

/**
 * Returns the template items sorted by their defined order, preserving the
 * stored sequence so the display matches the template definition exactly.
 */
export function orderedItems(instance: ChecklistInstance): ChecklistItem[] {
  return [...instance.items].sort((a, b) => a.order - b.order);
}

/**
 * Pure: upsert a response into a responses array by itemId (replace if present,
 * append otherwise). Returns a new array; the input is not mutated.
 */
export function upsertResponse(
  responses: ChecklistResponse[],
  itemId: string,
  value: ChecklistResponse['value'],
): ChecklistResponse[] {
  const index = responses.findIndex((r) => r.itemId === itemId);
  if (index >= 0) {
    const next = [...responses];
    next[index] = { itemId, value };
    return next;
  }
  return [...responses, { itemId, value }];
}

const passFailNaBadgeClass: Record<string, string> = {
  pass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  fail: 'bg-destructive/10 text-destructive border-destructive/30',
  na: 'bg-secondary text-muted-foreground border-border',
};

const PASS_FAIL_NA_OPTIONS: PassFailNa[] = ['pass', 'fail', 'na'];

/**
 * Keyboard shortcut (when a pass_fail_na item holds focus) for each response
 * option. Alt+<key> is used so the shortcuts never collide with text entry.
 */
const PASS_FAIL_NA_SHORTCUT: Record<PassFailNa, string> = {
  pass: 'Alt+P',
  fail: 'Alt+F',
  na: 'Alt+N',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Props = {
  /** The checklist instance to display. */
  instance: ChecklistInstance;
  /**
   * Called when a valid response is recorded for an item. The component
   * validates the value before invoking this, so handlers only ever receive
   * values that pass `validateResponse`. Persistence (Firestore via
   * `checklistService.recordResponse`) is the caller's responsibility — the
   * component never touches Firestore directly.
   */
  onRecordResponse?: (itemId: string, value: ChecklistResponse['value']) => void | Promise<unknown>;
  /**
   * Called when the user converts a failed checklist item into a field issue.
   * The component builds the {@link FieldIssueDraft} via
   * `checklistService.failedItemToIssue` (carrying the item prompt, checklist
   * reference, evidence, location, and severity) and hands it to the caller,
   * who is responsible for persisting it. The action is only offered for items
   * with a recorded `fail` response; the component never touches Firestore
   * directly.
   */
  onConvertToIssue?: (draft: FieldIssueDraft) => void | Promise<unknown>;
  /**
   * Called when the user completes the checklist. The component computes the
   * pass/fail/na counts over the current responses via
   * `checklistService.computeCounts` and hands them to the caller, who is
   * responsible for persisting completion (Firestore via
   * `checklistService.completeInstance`) — the component never touches
   * Firestore directly. The action is only offered while the instance is
   * still in progress.
   */
  onComplete?: (counts: ChecklistCounts) => void | Promise<unknown>;
};

/** Pass/fail/na counts computed across an instance's pass_fail_na items. */
type ChecklistCounts = { passCount: number; failCount: number; naCount: number };

/**
 * ChecklistRunner — displays a checklist instance and records responses.
 *
 * Task 13.1 covered the ordered display with live pass/fail/na counts.
 * Task 13.2 adds response recording: per item-type input controls that accept
 * pass/fail/na, numeric, or text responses, validate them against the item's
 * response type via `checklistService.validateResponse`, reject invalid input
 * (leaving any existing response unchanged), and store the value against the
 * item. Recording is surfaced to the caller through `onRecordResponse` rather
 * than writing to Firestore from the component.
 */
export default function ChecklistRunner({ instance, onRecordResponse, onConvertToIssue, onComplete }: Props) {
  const items = useMemo(() => orderedItems(instance), [instance]);

  // Local overlay of responses so the UI reflects recorded values immediately
  // while the caller persists them. Reset whenever the underlying instance
  // (or its persisted responses) changes.
  const [responses, setResponses] = useState<ChecklistResponse[]>(instance.responses);
  useEffect(() => {
    setResponses(instance.responses);
  }, [instance.id, instance.responses]);

  // Per-item validation errors, keyed by item id. Set when an invalid value is
  // submitted; cleared on a subsequent valid response.
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Draft (uncommitted) text/numeric input values, keyed by item id.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // The item whose response controls currently hold keyboard focus. Drives the
  // response-option shortcuts (Alt+P/F/N) so they act on the item the user is
  // editing (Requirement 9.4).
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  const isCompleted = instance.status === 'completed';

  // Lookup of items by id for the keyboard-shortcut handler.
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  // Live counts over pass_fail_na items only, recomputed as responses change.
  const counts = useMemo(
    () => computeCounts({ ...instance, responses }),
    [instance, responses],
  );

  /**
   * Validate a value against an item's response type and, on success, store it
   * locally and surface it to the caller. On failure, record a field-naming
   * error and leave the existing response unchanged.
   */
  const record = useCallback(
    (item: ChecklistItem, value: ChecklistResponse['value']) => {
      if (!validateResponse(item, value)) {
        setErrors((prev) => ({
          ...prev,
          [item.id]: `Invalid response — expected ${responseTypeLabel[item.responseType]}.`,
        }));
        return; // leave existing response unchanged
      }
      setErrors((prev) => {
        if (!(item.id in prev)) return prev;
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      setResponses((prev) => upsertResponse(prev, item.id, value));
      void onRecordResponse?.(item.id, value);
    },
    [onRecordResponse],
  );

  const handlePassFailNa = useCallback(
    (item: ChecklistItem, value: PassFailNa) => record(item, value),
    [record],
  );

  const handleNumericSubmit = useCallback(
    (item: ChecklistItem) => {
      const raw = (drafts[item.id] ?? '').trim();
      // Reject empty or non-numeric input via validateResponse (NaN fails).
      const parsed = raw === '' ? Number.NaN : Number(raw);
      record(item, parsed);
    },
    [drafts, record],
  );

  const handleTextSubmit = useCallback(
    (item: ChecklistItem) => {
      record(item, drafts[item.id] ?? '');
    },
    [drafts, record],
  );

  /**
   * Convert a failed checklist item into a field issue draft. Builds the draft
   * through `checklistService.failedItemToIssue` against the instance with the
   * current (local-overlay) responses so the checklist reference and context
   * are accurate, then surfaces it to the caller for persistence.
   */
  const handleConvertToIssue = useCallback(
    (item: ChecklistItem) => {
      const draft = failedItemToIssue({ ...instance, responses }, item.id);
      void onConvertToIssue?.(draft);
    },
    [instance, responses, onConvertToIssue],
  );

  /**
   * Complete the checklist. Recomputes the pass/fail/na counts over the current
   * (local-overlay) responses via `checklistService.computeCounts` so the
   * persisted counts match what the user sees, then surfaces both the
   * completion and the computed counts to the caller. Persistence (marking the
   * instance completed and storing the counts via
   * `checklistService.completeInstance`) is the caller's responsibility — the
   * component never writes to Firestore.
   */
  const handleComplete = useCallback(() => {
    const finalCounts = computeCounts({ ...instance, responses });
    void onComplete?.(finalCounts);
  }, [instance, responses, onComplete]);

  /**
   * Keyboard shortcuts for the runner (Requirement 9.4, 9.5). Handled at the
   * region container so they fire wherever focus sits inside the checklist:
   *   Alt+P / Alt+F / Alt+N → record pass / fail / N-A for the focused
   *                           pass_fail_na item
   *   Ctrl/Cmd+Enter        → complete the checklist when in progress
   * Plain typing (including into numeric/text fields) passes through untouched.
   */
  const handleShortcuts = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isCompleted) return;

      const isMeta = event.ctrlKey || event.metaKey;
      if (isMeta && event.key === 'Enter') {
        if (items.length > 0) {
          event.preventDefault();
          handleComplete();
        }
        return;
      }

      if (event.altKey && !isMeta && focusedItemId) {
        const item = itemsById.get(focusedItemId);
        if (item && item.responseType === 'pass_fail_na') {
          const key = event.key.toLowerCase();
          const option: PassFailNa | null =
            key === 'p' ? 'pass' : key === 'f' ? 'fail' : key === 'n' ? 'na' : null;
          if (option) {
            event.preventDefault();
            record(item, option);
          }
        }
      }
    },
    [isCompleted, items.length, focusedItemId, itemsById, record, handleComplete],
  );

  return (
    <Card
      className="rounded-3xl border-border bg-white shadow-sm overflow-hidden h-full"
      role="region"
      aria-label="Checklist runner"
      aria-describedby="clr-shortcuts"
      onKeyDown={handleShortcuts}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-4 bg-primary/5 border-b border-border p-6">
        <CardTitle className="flex items-center gap-2 text-xl font-heading">
          <ListChecks className="text-primary" /> Checklist
        </CardTitle>
        <Badge
          variant="outline"
          className={
            isCompleted
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-blue-50 text-blue-700 border-blue-200'
          }
        >
          {isCompleted ? 'Completed' : 'In progress'}
        </Badge>
      </CardHeader>

      <CardContent className="p-6 space-y-6">
        {/* Keyboard shortcut reference — also serves as an accessible description
            for the runner's interactive controls (Requirement 9.5). */}
        <p id="clr-shortcuts" className="text-xs text-muted-foreground">
          Keyboard shortcuts:{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Alt+P</kbd> /{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Alt+F</kbd> /{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Alt+N</kbd> record pass / fail / N-A
          on the focused item ·{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Ctrl+Enter</kbd> complete. Use{' '}
          <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Tab</kbd> to move between controls.
        </p>

        {/* Location */}
        {instance.location && (
          <p className="text-sm text-muted-foreground">
            Location: <span className="font-medium text-foreground">{instance.location}</span>
          </p>
        )}

        {/* Live pass/fail/na counts */}
        <div
          className="grid grid-cols-3 gap-3"
          role="status"
          aria-label="Checklist pass, fail, and not-applicable counts"
        >
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-emerald-700">
              <CheckCircle2 size={16} aria-hidden="true" />
              <p className="text-2xl font-bold">{counts.passCount}</p>
            </div>
            <p className="text-xs text-emerald-700/80 mt-1">Pass</p>
          </div>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-destructive">
              <XCircle size={16} aria-hidden="true" />
              <p className="text-2xl font-bold">{counts.failCount}</p>
            </div>
            <p className="text-xs text-destructive/80 mt-1">Fail</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/20 p-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground">
              <MinusCircle size={16} aria-hidden="true" />
              <p className="text-2xl font-bold">{counts.naCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-1">N/A</p>
          </div>
        </div>

        {/* Ordered checklist items */}
        <ol className="space-y-3" aria-label="Checklist items">
          {items.length === 0 && (
            <li className="py-14 text-center rounded-3xl border-2 border-dashed border-border text-sm text-muted-foreground">
              This checklist has no items.
            </li>
          )}
          {items.map((item, index) => {
            const value = responseForItem(responses, item.id);
            const error = errors[item.id];
            return (
              <li
                key={item.id}
                className="rounded-2xl border border-border bg-secondary/10 p-4 space-y-3"
                onFocus={() => setFocusedItemId(item.id)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <p className="font-medium">{item.prompt}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1.5 bg-white text-muted-foreground border-border"
                  >
                    <ResponseTypeIcon type={item.responseType} />
                    {responseTypeLabel[item.responseType]}
                  </Badge>
                </div>

                {/* Response entry controls (per response type) */}
                <div className="pl-9 space-y-2">
                  {item.responseType === 'pass_fail_na' && (
                    <div
                      className="flex flex-wrap gap-2"
                      role="group"
                      aria-label={`Record pass, fail, or not applicable for: ${item.prompt}`}
                    >
                      {PASS_FAIL_NA_OPTIONS.map((option) => {
                        const selected = value === option;
                        return (
                          <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant={selected ? 'default' : 'outline'}
                            aria-pressed={selected}
                            aria-keyshortcuts={PASS_FAIL_NA_SHORTCUT[option]}
                            title={`${option === 'na' ? 'N/A' : option.charAt(0).toUpperCase() + option.slice(1)} (${PASS_FAIL_NA_SHORTCUT[option]} when focused)`}
                            disabled={isCompleted}
                            onClick={() => handlePassFailNa(item, option)}
                          >
                            {option === 'na' ? 'N/A' : option.charAt(0).toUpperCase() + option.slice(1)}
                          </Button>
                        );
                      })}
                    </div>
                  )}

                  {item.responseType === 'numeric' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="max-w-[12rem]"
                        aria-label={`Numeric response for: ${item.prompt}`}
                        value={drafts[item.id] ?? (typeof value === 'number' ? String(value) : '')}
                        disabled={isCompleted}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleNumericSubmit(item);
                          }
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isCompleted}
                        aria-label={`Record numeric value for: ${item.prompt}`}
                        onClick={() => handleNumericSubmit(item)}
                      >
                        Record
                      </Button>
                    </div>
                  )}

                  {item.responseType === 'text' && (
                    <div className="space-y-1.5">
                      <Textarea
                        rows={2}
                        maxLength={TEXT_RESPONSE_MAX}
                        aria-label={`Text response for: ${item.prompt}`}
                        value={drafts[item.id] ?? (typeof value === 'string' ? value : '')}
                        disabled={isCompleted}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                            e.preventDefault();
                            handleTextSubmit(item);
                          }
                        }}
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {(drafts[item.id] ?? (typeof value === 'string' ? value : '')).length}/
                          {TEXT_RESPONSE_MAX}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isCompleted}
                          aria-label={`Record text note for: ${item.prompt}`}
                          onClick={() => handleTextSubmit(item)}
                        >
                          Record
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Validation error (invalid response rejected) */}
                  {error && (
                    <p className="text-xs font-medium text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  {/* Recorded response indicator */}
                  <div className="text-xs">
                    {value === undefined ? (
                      <span className="text-muted-foreground">No response recorded</span>
                    ) : item.responseType === 'pass_fail_na' ? (
                      <Badge
                        variant="outline"
                        className={passFailNaBadgeClass[String(value)] || 'bg-secondary text-muted-foreground'}
                      >
                        {String(value).toUpperCase()}
                      </Badge>
                    ) : (
                      <span className="text-foreground">
                        Recorded: <span className="font-medium">{String(value)}</span>
                      </span>
                    )}
                  </div>

                  {/* Fail-to-issue conversion — only for items recorded as fail */}
                  {item.responseType === 'pass_fail_na' && value === 'fail' && (
                    <div className="pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                        aria-label={`Convert failed item to issue: ${item.prompt}`}
                        onClick={() => handleConvertToIssue(item)}
                      >
                        <AlertTriangle size={14} aria-hidden="true" />
                        Convert to issue
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Completion action — compute and persist counts via the caller. */}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          {isCompleted ? (
            <p
              className="flex items-center gap-2 text-sm font-medium text-emerald-700"
              role="status"
            >
              <ClipboardCheck size={16} aria-hidden="true" />
              Checklist completed — {counts.passCount} pass, {counts.failCount} fail, {counts.naCount} N/A.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Completing records the pass, fail, and N/A counts for this checklist.
              </p>
              <Button
                type="button"
                className="gap-1.5"
                aria-label="Complete checklist"
                disabled={items.length === 0}
                onClick={handleComplete}
              >
                <ClipboardCheck size={16} aria-hidden="true" />
                Complete checklist
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
