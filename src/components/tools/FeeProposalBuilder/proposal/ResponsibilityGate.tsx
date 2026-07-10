// ResponsibilityGate — Modal requiring acknowledgement before proposal issue
//
// Requirements: 13.3, 13.4

import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ResponsibilityGateProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ResponsibilityGate({ onConfirm, onCancel }: ResponsibilityGateProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="max-w-md w-full mx-4 rounded-xl bg-surface-900 border border-surface-700/50 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <ShieldAlert className="h-6 w-6 text-amber-400" />
          <h2 className="text-lg font-bold text-surface-100">Professional Responsibility</h2>
        </div>

        <div className="space-y-3 text-sm text-surface-300">
          <p>
            By issuing this proposal, you confirm that:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>The fee calculations have been reviewed and are appropriate for the scope of work.</li>
            <li>The proposal accurately reflects your intended professional service offering.</li>
            <li>You accept responsibility for the correctness of the fee basis, assumptions, and exclusions stated.</li>
            <li>This tool provides guideline calculations only — you remain professionally responsible for the final proposal content.</li>
          </ul>
        </div>

        <label className="flex items-start gap-3 mt-5 cursor-pointer">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 rounded border-surface-600 bg-surface-800 text-primary-500 focus:ring-primary-500/50"
          />
          <span className="text-sm text-surface-200">
            I acknowledge my professional responsibility for this proposal and confirm it has been reviewed.
          </span>
        </label>

        <div className="flex gap-3 mt-6">
          <Button variant="ghost" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!acknowledged} className="flex-1">
            Confirm & Preview
          </Button>
        </div>
      </div>
    </div>
  );
}
