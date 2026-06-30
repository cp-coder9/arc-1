import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChecklistTemplateEditor } from './ChecklistTemplateEditor';
import * as checklistService from '@/services/checklistService';

const baseProps = {
  projectId: 'project-1',
  userRole: 'site_manager' as const,
  createdBy: 'user-1',
};

describe('ChecklistTemplateEditor', () => {
  it('renders an authoring form for editor roles with one blank item by default', () => {
    render(<ChecklistTemplateEditor {...baseProps} />);
    expect(screen.getByText('Checklist Template Editor')).toBeInTheDocument();
    expect(screen.getByText('(1 / 200)')).toBeInTheDocument();
    expect(screen.getByLabelText('Prompt for item 1')).toBeInTheDocument();
  });

  it('blocks authoring for non-editor roles (client is view-only)', () => {
    render(<ChecklistTemplateEditor {...baseProps} userRole="client" />);
    expect(screen.getByText('Not authorized')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add checklist item')).not.toBeInTheDocument();
  });

  it('adds and removes items, keeping at least one item', () => {
    render(<ChecklistTemplateEditor {...baseProps} />);
    fireEvent.click(screen.getByLabelText('Add checklist item'));
    expect(screen.getByText('(2 / 200)')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Remove item 2'));
    expect(screen.getByText('(1 / 200)')).toBeInTheDocument();

    // Last remaining item cannot be removed.
    expect(screen.getByLabelText('Remove item 1')).toBeDisabled();
  });

  it('shows a field-named validation error for an empty prompt and disables save', () => {
    render(<ChecklistTemplateEditor {...baseProps} />);
    // Default item prompt is empty → invalid.
    expect(screen.getByText(/items\[0\]\.prompt/)).toBeInTheDocument();
    expect(screen.getByLabelText('Save checklist template')).toBeDisabled();
  });

  it('rejects a prompt exceeding 500 characters with a field-named error', () => {
    render(<ChecklistTemplateEditor {...baseProps} />);
    const promptInput = screen.getByLabelText('Prompt for item 1');
    fireEvent.change(promptInput, { target: { value: 'a'.repeat(501) } });
    expect(screen.getByText(/items\[0\]\.prompt/)).toBeInTheDocument();
    expect(screen.getByLabelText('Save checklist template')).toBeDisabled();
  });

  it('becomes valid and persists via checklistService.createTemplate, then calls onSave with the saved template', async () => {
    const saved = {
      id: 'tmpl-1',
      projectId: 'project-1',
      title: 'Pre-pour',
      createdBy: 'user-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      items: [
        { id: 'item-1', prompt: 'Rebar spacing correct?', responseType: 'pass_fail_na' as const, order: 0 },
      ],
    };
    const createSpy = vi
      .spyOn(checklistService, 'createTemplate')
      .mockResolvedValue(saved);
    const onSave = vi.fn();
    render(<ChecklistTemplateEditor {...baseProps} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Checklist template title'), {
      target: { value: 'Pre-pour' },
    });
    fireEvent.change(screen.getByLabelText('Prompt for item 1'), {
      target: { value: 'Rebar spacing correct?' },
    });

    expect(screen.getByText('Template is valid')).toBeInTheDocument();
    const saveBtn = screen.getByLabelText('Save checklist template');
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    expect(createSpy).toHaveBeenCalledWith({
      projectId: 'project-1',
      title: 'Pre-pour',
      createdBy: 'user-1',
      items: [
        expect.objectContaining({
          prompt: 'Rebar spacing correct?',
          responseType: 'pass_fail_na',
          order: 0,
        }),
      ],
    });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(saved));
    createSpy.mockRestore();
  });

  it('surfaces a save error and does not call onSave when persistence fails', async () => {
    const createSpy = vi
      .spyOn(checklistService, 'createTemplate')
      .mockRejectedValue(new Error('Firestore unavailable'));
    const onSave = vi.fn();
    render(<ChecklistTemplateEditor {...baseProps} onSave={onSave} />);

    fireEvent.change(screen.getByLabelText('Checklist template title'), {
      target: { value: 'Pre-pour' },
    });
    fireEvent.change(screen.getByLabelText('Prompt for item 1'), {
      target: { value: 'Rebar spacing correct?' },
    });
    fireEvent.click(screen.getByLabelText('Save checklist template'));

    await waitFor(() => expect(screen.getByText('Could not save template')).toBeInTheDocument());
    expect(screen.getByText('Firestore unavailable')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('does not persist an invalid template (save disabled until valid)', () => {
    const createSpy = vi.spyOn(checklistService, 'createTemplate');
    render(<ChecklistTemplateEditor {...baseProps} />);
    // Default item prompt is empty → invalid → save disabled, no persistence.
    expect(screen.getByLabelText('Save checklist template')).toBeDisabled();
    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  it('lets the user change an item response type', () => {
    render(<ChecklistTemplateEditor {...baseProps} />);
    const select = screen.getByLabelText('Response type for item 1') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'numeric' } });
    expect(select.value).toBe('numeric');
  });

  describe('keyboard navigation (Requirement 9.4, 9.5)', () => {
    it('exposes accessible names and keyboard-shortcut hints on the primary controls', () => {
      render(<ChecklistTemplateEditor {...baseProps} />);

      const addBtn = screen.getByLabelText('Add checklist item');
      expect(addBtn).toHaveAttribute('aria-keyshortcuts', 'Alt+A');

      const saveBtn = screen.getByLabelText('Save checklist template');
      expect(saveBtn).toHaveAttribute('aria-keyshortcuts', 'Control+Enter');

      const removeBtn = screen.getByLabelText('Remove item 1');
      expect(removeBtn).toHaveAttribute('aria-keyshortcuts', 'Alt+R');

      // A visible, programmatically-referenced shortcut description is present.
      expect(screen.getByText(/remove the item you are editing/i)).toBeInTheDocument();
      expect(screen.getByLabelText('Checklist template title')).toHaveAttribute(
        'aria-describedby',
        'cte-shortcuts',
      );
    });

    it('adds an item with the Alt+A shortcut and moves focus to the new prompt', async () => {
      render(<ChecklistTemplateEditor {...baseProps} />);
      const firstPrompt = screen.getByLabelText('Prompt for item 1');

      fireEvent.keyDown(firstPrompt, { key: 'a', altKey: true });

      expect(screen.getByText('(2 / 200)')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Prompt for item 2')).toHaveFocus());
    });

    it('removes the focused item with the Alt+R shortcut', () => {
      render(<ChecklistTemplateEditor {...baseProps} />);
      // Need at least two items before removal is allowed.
      fireEvent.keyDown(screen.getByLabelText('Prompt for item 1'), { key: 'a', altKey: true });
      expect(screen.getByText('(2 / 200)')).toBeInTheDocument();

      const secondPrompt = screen.getByLabelText('Prompt for item 2');
      fireEvent.focus(secondPrompt);
      fireEvent.keyDown(secondPrompt, { key: 'r', altKey: true });

      expect(screen.getByText('(1 / 200)')).toBeInTheDocument();
    });

    it('does not remove the last remaining item via Alt+R', () => {
      render(<ChecklistTemplateEditor {...baseProps} />);
      const prompt = screen.getByLabelText('Prompt for item 1');
      fireEvent.focus(prompt);
      fireEvent.keyDown(prompt, { key: 'r', altKey: true });
      expect(screen.getByText('(1 / 200)')).toBeInTheDocument();
    });

    it('saves with the Ctrl+Enter shortcut when the template is valid', async () => {
      const saved = {
        id: 'tmpl-kbd',
        projectId: 'project-1',
        title: 'Pre-pour',
        createdBy: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        items: [
          { id: 'item-1', prompt: 'Rebar spacing correct?', responseType: 'pass_fail_na' as const, order: 0 },
        ],
      };
      const createSpy = vi.spyOn(checklistService, 'createTemplate').mockResolvedValue(saved);
      const onSave = vi.fn();
      render(<ChecklistTemplateEditor {...baseProps} onSave={onSave} />);

      fireEvent.change(screen.getByLabelText('Checklist template title'), {
        target: { value: 'Pre-pour' },
      });
      const prompt = screen.getByLabelText('Prompt for item 1');
      fireEvent.change(prompt, { target: { value: 'Rebar spacing correct?' } });

      fireEvent.keyDown(prompt, { key: 'Enter', ctrlKey: true });

      await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(onSave).toHaveBeenCalledWith(saved));
      createSpy.mockRestore();
    });

    it('does not save with Ctrl+Enter while the template is invalid', () => {
      const createSpy = vi.spyOn(checklistService, 'createTemplate');
      render(<ChecklistTemplateEditor {...baseProps} />);
      // Default prompt is empty → invalid.
      fireEvent.keyDown(screen.getByLabelText('Prompt for item 1'), { key: 'Enter', ctrlKey: true });
      expect(createSpy).not.toHaveBeenCalled();
      createSpy.mockRestore();
    });
  });
});
