// RunHistoryView — List with filters (profession, date, project)
//
// Requirements: 8.1, 8.2, 8.3, 8.4

import { useState } from 'react';
import { History, Search, RotateCcw, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';
import { RunDetailCard } from './RunDetailCard';
import { ExportDialog } from './ExportDialog';
import { DemoDataNotice } from '../shared/DemoDataNotice';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

export interface RunHistoryItem {
  id: string;
  profession: string;
  projectValue: number;
  calculatedFee: number;
  createdAt: string;
  projectName?: string;
  status: 'saved' | 'assigned' | 'exported';
}

const MOCK_RUNS: RunHistoryItem[] = [
  { id: 'run-1', profession: 'architect', projectValue: 5200000, calculatedFee: 392000, createdAt: '2026-06-20', projectName: 'Smith Residence', status: 'assigned' },
  { id: 'run-2', profession: 'structuralEngineer', projectValue: 5200000, calculatedFee: 156000, createdAt: '2026-06-19', status: 'saved' },
  { id: 'run-3', profession: 'quantitySurveyor', projectValue: 12000000, calculatedFee: 210000, createdAt: '2026-06-18', projectName: 'Office Block A', status: 'exported' },
  { id: 'run-4', profession: 'architect', projectValue: 3800000, calculatedFee: 295000, createdAt: '2026-06-15', status: 'saved' },
];

const STATUS_STYLES: Record<string, string> = {
  saved: 'border-surface-600 bg-surface-700/50 text-surface-300',
  assigned: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  exported: 'border-primary/30 bg-primary/15 text-primary-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RunHistoryView() {
  const { activeProfession } = useFeeProposalBuilder();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProfession, setFilterProfession] = useState<string>('all');
  const [selectedRun, setSelectedRun] = useState<RunHistoryItem | null>(null);
  const [showExport, setShowExport] = useState(false);

  const filtered = MOCK_RUNS.filter((run) => {
    const matchesProfession = filterProfession === 'all' || run.profession === filterProfession;
    const matchesSearch = !searchTerm || (run.projectName?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    return matchesProfession && matchesSearch;
  });

  if (selectedRun) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedRun(null)}>
          ← Back to History
        </Button>
        <RunDetailCard run={selectedRun} onExport={() => setShowExport(true)} />
        {showExport && <ExportDialog runId={selectedRun.id} onClose={() => setShowExport(false)} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DemoDataNotice className="mb-4" />
      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <History className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Run History</h2>
        </div>
        <p className="text-sm text-surface-400">
          All saved fee calculation runs. Reopen, export, or assign runs to projects.
        </p>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-surface-500" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by project..."
              className="pl-9"
            />
          </div>
          <select
            value={filterProfession}
            onChange={(e) => setFilterProfession(e.target.value)}
            className="h-9 rounded-md border border-surface-700 bg-surface-900 px-3 text-sm text-surface-100 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="all">All professions</option>
            <option value="architect">Architect</option>
            <option value="civilEngineer">Civil Engineer</option>
            <option value="structuralEngineer">Structural Engineer</option>
            <option value="quantitySurveyor">Quantity Surveyor</option>
          </select>
        </div>
      </div>

      {/* Run list */}
      <div className="space-y-2">
        {filtered.map((run) => (
          <div
            key={run.id}
            onClick={() => setSelectedRun(run)}
            className="rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 p-4 flex items-center gap-4 hover:bg-surface-700/50 transition-colors cursor-pointer"
          >
            <History className="h-5 w-5 text-surface-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-100">
                {run.projectName ?? `Unsaved — ${run.profession}`}
              </p>
              <p className="text-xs text-surface-400">
                R{run.calculatedFee.toLocaleString()} fee · R{run.projectValue.toLocaleString()} value · {run.createdAt}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn('text-[10px]', STATUS_STYLES[run.status])}>
                {run.status}
              </Badge>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="rounded-lg bg-surface-800/70 border border-surface-700/50 p-8 text-center">
            <History className="h-8 w-8 text-surface-500 mx-auto mb-2" />
            <p className="text-sm text-surface-400">No saved runs matching your filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}
