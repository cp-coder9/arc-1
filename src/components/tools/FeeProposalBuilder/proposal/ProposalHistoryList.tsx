// ProposalHistoryList — Versioned proposal list with status badges
//
// Requirements: 6.8

import { FileText, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Mock data (in production, would come from Firestore persistence)
// ---------------------------------------------------------------------------

interface ProposalHistoryItem {
  id: string;
  title: string;
  version: number;
  status: 'draft' | 'issued' | 'accepted' | 'superseded';
  createdAt: string;
  projectName: string;
}

const MOCK_HISTORY: ProposalHistoryItem[] = [
  { id: '1', title: 'Smith Residence - Architectural Fees', version: 2, status: 'issued', createdAt: '2026-06-18', projectName: 'Smith Residence' },
  { id: '2', title: 'Smith Residence - Architectural Fees', version: 1, status: 'superseded', createdAt: '2026-06-15', projectName: 'Smith Residence' },
  { id: '3', title: 'Commercial Office Block - Structural', version: 1, status: 'draft', createdAt: '2026-06-20', projectName: 'Office Block A' },
];

const STATUS_COLORS: Record<string, string> = {
  draft: 'border-surface-600 bg-surface-700/50 text-surface-300',
  issued: 'border-primary/30 bg-primary/15 text-primary-300',
  accepted: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  superseded: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProposalHistoryList() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-5 w-5 text-primary-400" />
          <h2 className="text-lg font-bold text-surface-100">Proposal History</h2>
        </div>
        <p className="text-sm text-surface-400">
          All proposals generated from this workspace, with version tracking and status.
        </p>
      </div>

      <div className="space-y-2">
        {MOCK_HISTORY.map((proposal) => (
          <div
            key={proposal.id}
            className="rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 p-4 flex items-center gap-4 hover:bg-surface-700/50 transition-colors cursor-pointer"
          >
            <FileText className="h-5 w-5 text-surface-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-100 truncate">{proposal.title}</p>
              <p className="text-xs text-surface-400">
                v{proposal.version} · {proposal.projectName} · {proposal.createdAt}
              </p>
            </div>
            <Badge className={cn('text-[10px]', STATUS_COLORS[proposal.status])}>
              {proposal.status}
            </Badge>
          </div>
        ))}
      </div>

      {MOCK_HISTORY.length === 0 && (
        <div className="rounded-lg bg-surface-800/70 border border-surface-700/50 p-8 text-center">
          <FileText className="h-8 w-8 text-surface-500 mx-auto mb-2" />
          <p className="text-sm text-surface-400">No proposals yet. Generate your first proposal above.</p>
        </div>
      )}
    </div>
  );
}
