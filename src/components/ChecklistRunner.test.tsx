import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ChecklistRunner, { upsertResponse, orderedItems } from './ChecklistRunner';
import type { ChecklistInstance } from '@/types';

function makeInstance(overrides: Partial<ChecklistInstance> = {}): ChecklistInstance {
  return {
    id: 'inst-1',
    templateId: 'tmpl-1',
    projectId: 'proj-1',
    location: 'Level 2 — East wing',
    status: 'in_progress',
    items: [
      { id: 'i1', prompt: 'Fire door seal intact', responseType: 'pass_fail_na', order: 0 },
      { id: 'i2', prompt: 'Slab thickness (mm)', responseType: 'numeric', order: 1 },
      { id: 'i3', prompt: 'Notes', responseType: 'text', order: 2 },
    ],
    responses: [],
    ...overrides,
  };
}

describe('ChecklistRunner — pure helpers', () => {
  it('orderedItems sorts by order ascending', () => {
    const instance = makeInstance({
      items: [
        { id: 'b', prompt: 'B', responseType: 'text', order: 2 },
        { id: 'a', prompt: 'A', responseType: 'text', order: 1 },
      ],
    });
    expect(orderedItems(instance).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('upsertResponse appends a new response without mutating the input', () => {
    const input = [{ itemId: 'i1', value: 'pass' as const }];
    const out = upsertResponse(input, 'i2', 5);
    expect(out).toHaveLength(2);
    expect(out).toContainEqual({ itemId: 'i2', value: 5 });
    expect(input).toHaveLength(1); // unchanged
  });

  it('upsertResponse replaces an existing response by itemId', () => {
    const input = [{ itemId: 'i1', value: 'pass' as const }];
    const out = upsertResponse(input, 'i1', 'fail');
    expect(out).toEqual([{ itemId: 'i1', value: 'fail' }]);
  });
});

describe('ChecklistRunner — response recording (task 13.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records a valid pass/fail/na response and surfaces it to onRecordResponse', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    fireEvent.click(within(group).getByRole('button', { name: 'Pass' }));

    expect(onRecord).toHaveBeenCalledWith('i1', 'pass');
    // Pressed state reflects the recorded value.
    expect(within(group).getByRole('button', { name: 'Pass' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('records a valid numeric response', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    fireEvent.change(screen.getByLabelText(/Numeric response for: Slab thickness/i), {
      target: { value: '170' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record numeric value for: Slab thickness/i }));

    expect(onRecord).toHaveBeenCalledWith('i2', 170);
  });

  it('rejects an empty numeric response and does not call onRecordResponse', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    // Submit numeric with no value entered.
    fireEvent.click(screen.getByRole('button', { name: /Record numeric value for: Slab thickness/i }));

    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/expected Numeric/i);
  });

  it('records a valid text response', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    fireEvent.change(screen.getByLabelText(/Text response for: Notes/i), {
      target: { value: 'All good' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record text note for: Notes/i }));

    expect(onRecord).toHaveBeenCalledWith('i3', 'All good');
  });

  it('leaves an existing valid response unchanged when a later invalid response is rejected', () => {
    const onRecord = vi.fn();
    const instance = makeInstance({
      responses: [{ itemId: 'i2', value: 42 }],
    });
    render(<ChecklistRunner instance={instance} onRecordResponse={onRecord} />);

    // Existing numeric response is shown.
    expect(screen.getByText('42')).toBeInTheDocument();

    // Clear the numeric input then submit (empty → invalid).
    fireEvent.change(screen.getByLabelText(/Numeric response for: Slab thickness/i), {
      target: { value: '' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Record numeric value for: Slab thickness/i }));

    expect(onRecord).not.toHaveBeenCalled();
    // Existing recorded value remains visible (unchanged).
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('disables response controls when the instance is completed', () => {
    render(<ChecklistRunner instance={makeInstance({ status: 'completed' })} />);

    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    expect(within(group).getByRole('button', { name: 'Pass' })).toBeDisabled();
  });
});

describe('ChecklistRunner — fail-to-issue conversion (task 13.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a convert-to-issue action only for items recorded as fail', () => {
    // Pre-recorded fail on the pass_fail_na item.
    const instance = makeInstance({ responses: [{ itemId: 'i1', value: 'fail' }] });
    render(<ChecklistRunner instance={instance} onConvertToIssue={vi.fn()} />);

    expect(
      screen.getByRole('button', { name: /Convert failed item to issue: Fire door seal intact/i }),
    ).toBeInTheDocument();
  });

  it('does not show a convert action when there is no fail response', () => {
    const instance = makeInstance({ responses: [{ itemId: 'i1', value: 'pass' }] });
    render(<ChecklistRunner instance={instance} onConvertToIssue={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Convert failed item to issue/i })).toBeNull();
  });

  it('surfaces a convert action after recording a fail response', () => {
    render(<ChecklistRunner instance={makeInstance()} onConvertToIssue={vi.fn()} />);

    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    fireEvent.click(within(group).getByRole('button', { name: 'Fail' }));

    expect(
      screen.getByRole('button', { name: /Convert failed item to issue: Fire door seal intact/i }),
    ).toBeInTheDocument();
  });

  it('builds a FieldIssueDraft carrying prompt, checklist reference, and evidence on convert', () => {
    const onConvert = vi.fn();
    const instance = makeInstance({ responses: [{ itemId: 'i1', value: 'fail' }] });
    render(<ChecklistRunner instance={instance} onConvertToIssue={onConvert} />);

    fireEvent.click(
      screen.getByRole('button', { name: /Convert failed item to issue: Fire door seal intact/i }),
    );

    expect(onConvert).toHaveBeenCalledTimes(1);
    expect(onConvert).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Fire door seal intact',
        checklistRef: { instanceId: 'inst-1', itemId: 'i1' },
        evidenceIds: [],
        location: 'Level 2 — East wing',
        severity: 'medium',
      }),
    );
  });
});

describe('ChecklistRunner — completion and counts (task 13.4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers a complete action while the instance is in progress', () => {
    render(<ChecklistRunner instance={makeInstance()} onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Complete checklist/i })).toBeInTheDocument();
  });

  it('computes and surfaces pass/fail/na counts over pass_fail_na items on complete', () => {
    const onComplete = vi.fn();
    // Two pass_fail_na items (one pass, one fail) plus numeric/text that must not count.
    const instance = makeInstance({
      items: [
        { id: 'i1', prompt: 'Fire door seal intact', responseType: 'pass_fail_na', order: 0 },
        { id: 'i2', prompt: 'Smoke detector present', responseType: 'pass_fail_na', order: 1 },
        { id: 'i3', prompt: 'Extinguisher tag', responseType: 'pass_fail_na', order: 2 },
        { id: 'i4', prompt: 'Slab thickness (mm)', responseType: 'numeric', order: 3 },
      ],
      responses: [
        { itemId: 'i1', value: 'pass' },
        { itemId: 'i2', value: 'fail' },
        { itemId: 'i3', value: 'na' },
        { itemId: 'i4', value: 170 },
      ],
    });
    render(<ChecklistRunner instance={instance} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: /Complete checklist/i }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith({ passCount: 1, failCount: 1, naCount: 1 });
  });

  it('includes responses recorded in-session in the computed counts on complete', () => {
    const onComplete = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onComplete={onComplete} />);

    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    fireEvent.click(within(group).getByRole('button', { name: 'Pass' }));

    fireEvent.click(screen.getByRole('button', { name: /Complete checklist/i }));

    expect(onComplete).toHaveBeenCalledWith({ passCount: 1, failCount: 0, naCount: 0 });
  });

  it('hides the complete action and shows a completed summary when the instance is completed', () => {
    const instance = makeInstance({
      status: 'completed',
      responses: [{ itemId: 'i1', value: 'pass' }],
    });
    render(<ChecklistRunner instance={instance} onComplete={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /Complete checklist/i })).toBeNull();
    expect(screen.getByText(/Checklist completed/i)).toBeInTheDocument();
  });

  it('disables the complete action when the checklist has no items', () => {
    render(<ChecklistRunner instance={makeInstance({ items: [], responses: [] })} onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Complete checklist/i })).toBeDisabled();
  });
});

describe('ChecklistRunner — keyboard navigation and accessibility (task 13.5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes accessible names for every interactive control', () => {
    const instance = makeInstance({ responses: [{ itemId: 'i1', value: 'fail' }] });
    render(
      <ChecklistRunner
        instance={instance}
        onRecordResponse={vi.fn()}
        onConvertToIssue={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    // pass_fail_na option buttons, scoped to their labelled group.
    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    expect(within(group).getByRole('button', { name: 'Pass' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Fail' })).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'N/A' })).toBeInTheDocument();

    // Numeric + text controls and their Record buttons have distinct names.
    expect(screen.getByLabelText(/Numeric response for: Slab thickness/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Text response for: Notes/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Record numeric value for: Slab thickness/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Record text note for: Notes/i }),
    ).toBeInTheDocument();

    // Convert-to-issue and complete actions are named.
    expect(
      screen.getByRole('button', { name: /Convert failed item to issue: Fire door seal intact/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Complete checklist/i })).toBeInTheDocument();
  });

  it('advertises keyboard shortcuts on the pass/fail/na option buttons', () => {
    render(<ChecklistRunner instance={makeInstance()} />);
    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    expect(within(group).getByRole('button', { name: 'Pass' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+P',
    );
    expect(within(group).getByRole('button', { name: 'Fail' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+F',
    );
    expect(within(group).getByRole('button', { name: 'N/A' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Alt+N',
    );
  });

  it('records a pass/fail/na response via the Alt+key shortcut on the focused item', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    // Focus a control inside the first (pass_fail_na) item, then press Alt+F.
    const group = screen.getByRole('group', {
      name: /Record pass, fail, or not applicable for: Fire door seal intact/i,
    });
    const passButton = within(group).getByRole('button', { name: 'Pass' });
    fireEvent.focus(passButton);
    fireEvent.keyDown(passButton, { key: 'f', altKey: true });

    expect(onRecord).toHaveBeenCalledWith('i1', 'fail');
  });

  it('does not trigger response shortcuts for a focused non-pass_fail_na item', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    // Focus the numeric item, then press Alt+P — must not record anything.
    const numeric = screen.getByLabelText(/Numeric response for: Slab thickness/i);
    fireEvent.focus(numeric);
    fireEvent.keyDown(numeric, { key: 'p', altKey: true });

    expect(onRecord).not.toHaveBeenCalled();
  });

  it('completes the checklist via Ctrl+Enter', () => {
    const onComplete = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onComplete={onComplete} />);

    const region = screen.getByRole('region', { name: /Checklist runner/i });
    fireEvent.keyDown(region, { key: 'Enter', ctrlKey: true });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('records a text response via Ctrl+Enter inside the textarea', () => {
    const onRecord = vi.fn();
    render(<ChecklistRunner instance={makeInstance()} onRecordResponse={onRecord} />);

    const textarea = screen.getByLabelText(/Text response for: Notes/i);
    fireEvent.change(textarea, { target: { value: 'Sealed and signed off' } });
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    expect(onRecord).toHaveBeenCalledWith('i3', 'Sealed and signed off');
  });

  it('ignores response shortcuts once the instance is completed', () => {
    const onRecord = vi.fn();
    const onComplete = vi.fn();
    render(
      <ChecklistRunner
        instance={makeInstance({ status: 'completed', responses: [{ itemId: 'i1', value: 'pass' }] })}
        onRecordResponse={onRecord}
        onComplete={onComplete}
      />,
    );

    const region = screen.getByRole('region', { name: /Checklist runner/i });
    fireEvent.keyDown(region, { key: 'p', altKey: true });
    fireEvent.keyDown(region, { key: 'Enter', ctrlKey: true });

    expect(onRecord).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });
});
