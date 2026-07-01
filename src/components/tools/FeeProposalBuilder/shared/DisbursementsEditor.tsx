import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Receipt } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

/**
 * DisbursementsEditor — Add/edit/remove disbursement line items.
 * Each has label (string) and amount (number). Table-style layout with add button.
 * Dispatches ADD/REMOVE/UPDATE_DISBURSEMENT actions.
 *
 * Requirements: 4.4
 */
export interface DisbursementsEditorProps {
  className?: string;
}

export function DisbursementsEditor({ className }: DisbursementsEditorProps) {
  const { calculatorState, dispatch } = useFeeProposalBuilder();
  const { disbursements } = calculatorState;

  const [newLabel, setNewLabel] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const handleAdd = useCallback(() => {
    const label = newLabel.trim();
    const amount = parseFloat(newAmount);
    if (!label || isNaN(amount) || amount <= 0) return;
    dispatch({ type: 'ADD_DISBURSEMENT', disbursement: { label, amount } });
    setNewLabel('');
    setNewAmount('');
  }, [dispatch, newLabel, newAmount]);

  const handleUpdate = useCallback(
    (index: number, field: 'label' | 'amount', value: string) => {
      const item = disbursements[index];
      if (!item) return;
      const updatedLabel = field === 'label' ? value : item.label;
      const updatedAmount = field === 'amount' ? (parseFloat(value) || 0) : item.amount;
      dispatch({ type: 'UPDATE_DISBURSEMENT', index, disbursement: { label: updatedLabel, amount: updatedAmount } });
    },
    [dispatch, disbursements]
  );

  const handleRemove = useCallback(
    (index: number) => {
      dispatch({ type: 'REMOVE_DISBURSEMENT', index });
    },
    [dispatch]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd();
      }
    },
    [handleAdd]
  );

  return (
    <div
      className={cn(
        'rounded-lg border border-surface-700/50 bg-surface-800/70 p-5 backdrop-blur',
        className
      )}
    >
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-surface-400">
        <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
        Disbursements
      </h3>

      {/* Existing items */}
      {disbursements.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-[1fr_120px_36px] gap-2 text-xs uppercase tracking-wider text-surface-500">
            <span>Description</span>
            <span>Amount (R)</span>
            <span className="sr-only">Actions</span>
          </div>
          {disbursements.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_120px_36px] items-center gap-2">
              <Input
                value={item.label}
                onChange={(e) => handleUpdate(index, 'label', e.target.value)}
                aria-label={`Disbursement ${index + 1} description`}
              />
              <Input
                type="number"
                min={0}
                step={0.01}
                value={item.amount}
                onChange={(e) => handleUpdate(index, 'amount', e.target.value)}
                aria-label={`Disbursement ${index + 1} amount`}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemove(index)}
                aria-label={`Remove disbursement: ${item.label}`}
                className="text-surface-500 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Add new item */}
      <div className="grid grid-cols-[1fr_120px_36px] items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="new-disbursement-label" className="sr-only">
            New disbursement description
          </Label>
          <Input
            id="new-disbursement-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Description..."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-disbursement-amount" className="sr-only">
            New disbursement amount
          </Label>
          <Input
            id="new-disbursement-amount"
            type="number"
            min={0}
            step={0.01}
            value={newAmount}
            onChange={(e) => setNewAmount(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="0.00"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleAdd}
          disabled={!newLabel.trim() || !newAmount || parseFloat(newAmount) <= 0}
          aria-label="Add disbursement"
          className="text-surface-400 hover:text-emerald-400"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
