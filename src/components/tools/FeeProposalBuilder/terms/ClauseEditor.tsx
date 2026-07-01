// ClauseEditor — Inline clause text editing for terms templates
//
// Requirements: 7.2, 7.3

import { useState, useCallback } from 'react';
import { Edit3, Check, X, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface ClauseEditorProps {
  clauses: string[];
  templateId: string;
}

export function ClauseEditor({ clauses: initialClauses, templateId }: ClauseEditorProps) {
  const [clauses, setClauses] = useState(initialClauses);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newClause, setNewClause] = useState('');

  const startEdit = useCallback((index: number) => {
    setEditingIndex(index);
    setEditValue(clauses[index]);
  }, [clauses]);

  const saveEdit = useCallback(() => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      setClauses((prev) => prev.map((c, i) => i === editingIndex ? trimmed : c));
    }
    setEditingIndex(null);
    setEditValue('');
  }, [editingIndex, editValue]);

  const cancelEdit = useCallback(() => {
    setEditingIndex(null);
    setEditValue('');
  }, []);

  const removeClause = useCallback((index: number) => {
    setClauses((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const addClause = useCallback(() => {
    const trimmed = newClause.trim();
    if (trimmed) {
      setClauses((prev) => [...prev, trimmed]);
      setNewClause('');
    }
  }, [newClause]);

  return (
    <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">
        Clauses ({clauses.length})
      </h3>

      <div className="space-y-2">
        {clauses.map((clause, index) => (
          <div key={index} className="rounded-lg bg-surface-800/50 border border-surface-700/40 p-3">
            {editingIndex === index ? (
              <div className="space-y-2">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="min-h-[60px]"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={saveEdit}>
                    <Check className="h-3.5 w-3.5 mr-1" /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit}>
                    <X className="h-3.5 w-3.5 mr-1" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="text-xs text-surface-500 font-mono mt-0.5">{index + 1}.</span>
                <p className="flex-1 text-sm text-surface-200 leading-relaxed">{clause}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon-sm" onClick={() => startEdit(index)} className="text-surface-500 hover:text-primary-400">
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => removeClause(index)} className="text-surface-500 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add new clause */}
      <div className="border-t border-surface-700/40 pt-4 space-y-2">
        <Textarea
          value={newClause}
          onChange={(e) => setNewClause(e.target.value)}
          placeholder="Add a new clause..."
          className="min-h-[50px]"
        />
        <Button size="sm" onClick={addClause} disabled={!newClause.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Clause
        </Button>
      </div>
    </div>
  );
}
