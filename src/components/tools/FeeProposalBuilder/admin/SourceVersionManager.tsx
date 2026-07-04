// SourceVersionManager — CRUD with status badges for source version management
//
// Requirements: 5.1, 5.2, 5.4, 5.5, 5.6

import { useState } from 'react';
import { ShieldCheck, Plus, RotateCcw, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { DemoDataNotice } from '../shared/DemoDataNotice';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceVersionEntry {
  id: string;
  profession: string;
  body: string;
  title: string;
  gazetteRef: string;
  effectiveDate: string;
  status: 'demo-seed' | 'draft' | 'verified' | 'retired';
  contentHash: string;
}

const MOCK_VERSIONS: SourceVersionEntry[] = [
  { id: 'arch-sacap-2025', profession: 'architect', body: 'SACAP', title: 'SACAP Board Notice 120/2025 Fee Guideline', gazetteRef: 'BN 120/2025', effectiveDate: '2025-09-01', status: 'verified', contentHash: 'a3f2e8c1' },
  { id: 'eng-ecsa-2024', profession: 'civilEngineer', body: 'ECSA', title: 'ECSA Guideline Fee Scale 2024', gazetteRef: 'ECSA GFS-2024', effectiveDate: '2024-04-01', status: 'draft', contentHash: 'b7d4f9e2' },
  { id: 'qs-sacqsp-demo', profession: 'quantitySurveyor', body: 'SACQSP', title: 'QS Demo Tariff Table', gazetteRef: 'N/A', effectiveDate: '2026-01-01', status: 'demo-seed', contentHash: 'c1a2b3d4' },
  { id: 'arch-sacap-2023', profession: 'architect', body: 'SACAP', title: 'SACAP BN 98/2023 (superseded)', gazetteRef: 'BN 98/2023', effectiveDate: '2023-07-01', status: 'retired', contentHash: 'e5f6g7h8' },
];

const STATUS_COLORS: Record<string, string> = {
  'demo-seed': 'border-amber-500/30 bg-amber-500/15 text-amber-300',
  draft: 'border-surface-600 bg-surface-700/50 text-surface-300',
  verified: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
  retired: 'border-red-500/30 bg-red-500/15 text-red-300',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SourceVersionManager() {
  const [versions] = useState(MOCK_VERSIONS);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="space-y-6">
      <DemoDataNotice className="mb-4" />
      {/* Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-bold text-surface-100">Source Version Manager</h2>
          </div>
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="h-4 w-4 mr-1" /> New Version
          </Button>
        </div>
        <p className="text-sm text-surface-400 mt-2">
          Manage fee table source versions. Each version references a gazette notice or professional body publication.
        </p>
      </div>

      {/* Create form (toggle) */}
      {showCreate && (
        <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400">Create New Source Version</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Title</Label>
              <Input placeholder="e.g. SACAP BN 130/2026" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Gazette Reference</Label>
              <Input placeholder="e.g. BN 130/2026" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Profession</Label>
              <Input placeholder="e.g. architect" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wider text-surface-400">Effective Date</Label>
              <Input type="date" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm">Create as Draft</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Version list */}
      <div className="space-y-2">
        {versions.map((version) => (
          <div
            key={version.id}
            className="rounded-lg bg-surface-800/70 backdrop-blur border border-surface-700/50 p-4"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-surface-100">{version.title}</p>
                <p className="text-xs text-surface-400">
                  {version.body} · {version.gazetteRef} · Effective {version.effectiveDate}
                </p>
                <p className="text-[10px] text-surface-500 font-mono">
                  Hash: {version.contentHash} · ID: {version.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn('text-[10px]', STATUS_COLORS[version.status])}>
                  {version.status}
                </Badge>
                {version.status === 'draft' && (
                  <Button size="sm" variant="ghost" className="text-emerald-400 hover:text-emerald-300">
                    <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verify
                  </Button>
                )}
                {version.status === 'verified' && (
                  <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                    <Archive className="h-3.5 w-3.5 mr-1" /> Retire
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
