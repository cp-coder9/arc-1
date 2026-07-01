import React, { useState, useCallback } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

/**
 * StatutoryFeesEditor — Add/edit/remove statutory fee line items.
 * Same pattern as DisbursementsEditor but for statutory fees.
 * Dispatches ADD/REMOVE/UPDATE_STATUTORY_FEE actions.
 *
 * Requirements: 4.5
 */
export interface StatutoryFeesEditorProps {
  className?: string;
}

export function StatutoryFeesEditor({ className }: StatutoryFeesEditorProps) {
  const { calculatorState, dispatch } = useFeeProposalBuilder();
  const { statutoryFees } = calculatorState;

  const [newLabel, setNewLabel] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const handleAdd = useCallback(() => {
    const label = newLabel.trim();
    const amount = parseFloat(newAmount);
    if (!label || isNaN(amount) || amount <= 0) return;
    dispatch({ type: 'ADD_STATUTORY_FEE', fee: { label, amount } });
    setNewLabel('');
    setNewAmount('');
  }, [dispatch, newLabel, newAmount]);

  const handleUpdate = useCallback(
    (index: number, field: 'label' | 'amount', value: string) => {
      const item = statutoryFees[index];
      if (!item) return;
      const updatedLabel = field === 'label' ? value : item.label;
      const updatedAmount = field === 'amount' ? (parseFloat(value) || 0) : item.amount;
      dispatch({ type: 'UPDATE_STATUTORY_FEE', index, fee: { label: updatedLabel, amount: updatedAmount } });
    },
    [dispatch, statutoryFees]
  );

  const handleRemove = useCallback(
    (index: number) => {
      dispatch({ type: 'REMOVE_STATUTORY_FEE', index });
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
        <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        Statutory Fees
      </h3>

      {/* Existing items */}
      {statutoryFees.length > 0 && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-[1fr_120px_36px] gap-2 text-xs uppercase tracking-wider text-surface-500">
            <span>Description</span>
            <span>Amount (R)</span>
            <span className="sr-only">Actions</span>
          </div>
          {statutoryFees.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_120px_36px] items-center gap-2">
              <Input
                value={item.label}
                onChange={(e) => handleUpdate(index, 'label', e.target.value)}
                aria-label={`Statutory fee ${index + 1} description`}
              />
              <Input
                type="number"
                min={0}
                step={0.01}
                value={item.amount}
                onChange={(e) => handleUpdate(index, 'amount', e.target.value)}
                aria-label={`Statutory fee ${index + 1} amount`}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleRemove(index)}
                aria-label={`Remove statutory fee: ${item.label}`}
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
          <Label htmlFor="new-statutory-fee-label" className="sr-only">
            New statutory fee description
          </Label>
          <Input
            id="new-statutory-fee-label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Description..."
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-statutory-fee-amount" className="sr-only">
            New statutory fee amount
          </Label>
          <Input
            id="new-statutory-fee-amount"
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
          aria-label="Add statutory fee"
          className="text-surface-400 hover:text-emerald-400"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
