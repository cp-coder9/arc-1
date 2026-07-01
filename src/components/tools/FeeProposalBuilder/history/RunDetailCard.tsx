// RunDetailCard — Full display for a saved run
//
// Requirements: 8.2

import { RotateCcw, Link2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RunHistoryItem } from './RunHistoryView';

export interface RunDetailCardProps {
  run: RunHistoryItem;
  onExport: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(value);
}

export function RunDetailCard({ run, onExport }: RunDetailCardProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <h2 className="text-lg font-bold text-surface-100 mb-2">
          Run Details — {run.projectName ?? run.profession}
        </h2>
        <p className="text-xs text-surface-400">Run ID: {run.id} · Created {run.createdAt}</p>

        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="rounded-lg bg-surface-700/30 p-3">
            <p className="text-xs text-surface-400 uppercase tracking-wider">Profession</p>
            <p className="text-sm font-medium text-surface-100 capitalize">{run.profession.replace(/([A-Z])/g, ' $1').trim()}</p>
          </div>
          <div className="rounded-lg bg-surface-700/30 p-3">
            <p className="text-xs text-surface-400 uppercase tracking-wider">Status</p>
            <p className="text-sm font-medium text-surface-100 capitalize">{run.status}</p>
          </div>
          <div className="rounded-lg bg-surface-700/30 p-3">
            <p className="text-xs text-surface-400 uppercase tracking-wider">Project Value</p>
            <p className="text-sm font-medium text-surface-100">{formatCurrency(run.projectValue)}</p>
          </div>
          <div className="rounded-lg bg-surface-700/30 p-3">
            <p className="text-xs text-surface-400 uppercase tracking-wider">Calculated Fee</p>
            <p className="text-sm font-bold text-primary-300">{formatCurrency(run.calculatedFee)}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-surface-700/40">
          <Button size="sm" variant="ghost">
            <RotateCcw className="h-4 w-4 mr-1.5" /> Reopen as New Version
          </Button>
          <Button size="sm" variant="ghost">
            <Link2 className="h-4 w-4 mr-1.5" /> Assign to Project
          </Button>
          <Button size="sm" variant="ghost" onClick={onExport}>
            <Download className="h-4 w-4 mr-1.5" /> Export
          </Button>
        </div>
      </div>
    </div>
  );
}
