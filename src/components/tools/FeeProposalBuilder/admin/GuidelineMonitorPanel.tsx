// GuidelineMonitorPanel — Watch registry + candidates for guideline updates
//
// Requirements: 11.1, 11.2, 11.3, 11.4

import { useState } from 'react';
import { Eye, RefreshCw, Check, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DemoDataNotice } from '../shared/DemoDataNotice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchEntry {
  id: string;
  body: string;
  description: string;
  lastScanned: string;
  status: 'watching' | 'candidate_found' | 'dismissed';
}

interface ChangeCandidate {
  id: string;
  watchId: string;
  title: string;
  detectedDate: string;
  sourceUrl?: string;
  summary: string;
}

const MOCK_WATCH_LIST: WatchEntry[] = [
  { id: 'w1', body: 'SACAP', description: 'SACAP fee guideline gazette notices', lastScanned: '2026-06-19', status: 'watching' },
  { id: 'w2', body: 'ECSA', description: 'ECSA guideline fee scale publications', lastScanned: '2026-06-18', status: 'candidate_found' },
  { id: 'w3', body: 'SACQSP', description: 'SACQSP tariff circulars', lastScanned: '2026-06-15', status: 'watching' },
];

const MOCK_CANDIDATES: ChangeCandidate[] = [
  {
    id: 'c1',
    watchId: 'w2',
    title: 'ECSA Circular 2026/12 — Updated fee guidance',
    detectedDate: '2026-06-18',
    summary: 'ECSA issued a new circular referencing updated fee guidance for engineering professionals effective Q3 2026.',
    sourceUrl: 'https://www.ecsa.co.za/circulars',
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GuidelineMonitorPanel() {
  const [watchList] = useState(MOCK_WATCH_LIST);
  const [candidates, setCandidates] = useState(MOCK_CANDIDATES);
  const [scanning, setScanning] = useState(false);

  const handleScan = () => {
    setScanning(true);
    setTimeout(() => setScanning(false), 2000);
  };

  const handleApprove = (candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
  };

  const handleDismiss = (candidateId: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== candidateId));
  };

  return (
    <div className="space-y-6">
      <DemoDataNotice className="mb-4" />
      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-bold text-surface-100">Guideline Monitor</h2>
          </div>
          <Button size="sm" onClick={handleScan} disabled={scanning}>
            <RefreshCw className={`h-4 w-4 mr-1 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Trigger Scan'}
          </Button>
        </div>
        <p className="text-sm text-surface-400 mt-2">
          Monitor professional body publications for fee guideline changes. Approve or dismiss detected candidates.
        </p>
      </div>

      {/* Change Candidates */}
      {candidates.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 px-1">
            Change Candidates
          </h3>
          {candidates.map((candidate) => (
            <div key={candidate.id} className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <p className="text-sm font-medium text-surface-100">{candidate.title}</p>
                  <p className="text-xs text-surface-400">{candidate.summary}</p>
                  <p className="text-[10px] text-surface-500">Detected: {candidate.detectedDate}</p>
                  {candidate.sourceUrl && (
                    <a href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300">
                      <ExternalLink className="h-3 w-3" /> View source
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => handleApprove(candidate.id)} className="text-emerald-400 hover:text-emerald-300">
                    <Check className="h-3.5 w-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDismiss(candidate.id)} className="text-surface-500 hover:text-red-400">
                    <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Watch Registry */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 px-1">
          Watch Registry
        </h3>
        {watchList.map((entry) => (
          <div key={entry.id} className="rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 p-4 flex items-center gap-4">
            <Eye className="h-4 w-4 text-surface-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-surface-100">{entry.body} — {entry.description}</p>
              <p className="text-xs text-surface-500">Last scanned: {entry.lastScanned}</p>
            </div>
            <Badge className={entry.status === 'candidate_found'
              ? 'border-amber-500/30 bg-amber-500/15 text-amber-300 text-[10px]'
              : 'border-surface-600 bg-surface-700/50 text-surface-300 text-[10px]'
            }>
              {entry.status === 'candidate_found' ? 'Update detected' : 'Watching'}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
