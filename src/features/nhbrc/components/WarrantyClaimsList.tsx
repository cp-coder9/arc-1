/**
 * Warranty Claims List Component
 *
 * Claims summary panel showing total claims by category, count by stage,
 * and a list of claims with status badges.
 *
 * Requirements: 13.10
 */

import React from 'react';
import { FileWarning } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/features/p1-shared/components/StatusBadge';
import type { StatusBadgeVariant } from '@/features/p1-shared/components/StatusBadge';
import type { WarrantyClaim, WarrantyClaimsSummary, WarrantyClaimStage, WarrantyDefectCategory } from '../types';

export interface WarrantyClaimsListProps {
  projectId?: string;
  summary?: WarrantyClaimsSummary;
  claims?: WarrantyClaim[];
}

const CATEGORY_LABELS: Record<WarrantyDefectCategory, string> = {
  structural: 'Structural',
  roof_waterproofing: 'Roof & Waterproofing',
  wall_waterproofing: 'Wall Waterproofing',
};

const STAGE_LABELS: Record<WarrantyClaimStage, string> = {
  reported: 'Reported',
  acknowledged: 'Acknowledged',
  inspection_scheduled: 'Inspection Scheduled',
  inspected: 'Inspected',
  liability_determined: 'Liability Determined',
  rectification_ordered: 'Rectification Ordered',
  rectification_in_progress: 'Rectification In Progress',
  rectification_complete: 'Rectification Complete',
  claim_closed: 'Closed',
};

function getStageVariant(stage: WarrantyClaimStage): StatusBadgeVariant {
  switch (stage) {
    case 'claim_closed':
    case 'rectification_complete':
      return 'success';
    case 'reported':
    case 'acknowledged':
      return 'warning';
    case 'rectification_ordered':
    case 'rectification_in_progress':
      return 'info';
    default:
      return 'default';
  }
}

const DEMO_SUMMARY: WarrantyClaimsSummary = {
  totalClaims: 3,
  countByStage: {
    reported: 1,
    acknowledged: 1,
    inspection_scheduled: 0,
    inspected: 0,
    liability_determined: 0,
    rectification_ordered: 1,
    rectification_in_progress: 0,
    rectification_complete: 0,
    claim_closed: 0,
  },
  countByCategory: {
    structural: 2,
    roof_waterproofing: 1,
    wall_waterproofing: 0,
  },
  overdueRectifications: 0,
};

const DEMO_CLAIMS: WarrantyClaim[] = [
  {
    id: 'wc-1',
    projectId: 'proj-1',
    unitId: 'unit-1',
    claimantName: 'John Smith',
    claimantContact: 'john@example.com',
    defectDescription: 'Crack in foundation wall extending 2m',
    defectCategory: 'structural',
    defectDiscoveredDate: '2025-11-15',
    practicalCompletionDate: '2024-06-01',
    warrantyExpiryDate: '2029-06-01',
    isOutsideWarranty: false,
    evidenceRefs: ['photo-1.jpg'],
    currentStage: 'reported',
    createdBy: 'user-1',
    createdAt: '2025-11-16T09:00:00Z',
    updatedAt: '2025-11-16T09:00:00Z',
  },
  {
    id: 'wc-2',
    projectId: 'proj-1',
    unitId: 'unit-2',
    claimantName: 'Jane Doe',
    claimantContact: '082-555-1234',
    defectDescription: 'Roof leaking in multiple locations',
    defectCategory: 'roof_waterproofing',
    defectDiscoveredDate: '2025-10-20',
    practicalCompletionDate: '2024-03-15',
    warrantyExpiryDate: '2029-03-15',
    isOutsideWarranty: false,
    evidenceRefs: ['photo-2.jpg', 'photo-3.jpg'],
    currentStage: 'rectification_ordered',
    createdBy: 'user-2',
    createdAt: '2025-10-21T14:00:00Z',
    updatedAt: '2025-11-01T10:00:00Z',
  },
];

export function WarrantyClaimsList({
  summary: externalSummary,
  claims: externalClaims,
}: WarrantyClaimsListProps) {
  const summary = externalSummary ?? DEMO_SUMMARY;
  const claims = externalClaims ?? DEMO_CLAIMS;

  return (
    <Card className="bg-slate-800/70 border-slate-700/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-100">
          <FileWarning className="h-5 w-5 text-amber-400" aria-hidden="true" />
          Warranty Claims Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-slate-700/40 bg-slate-900/50 p-3 text-center">
            <p className="text-2xl font-bold text-slate-100">{summary.totalClaims}</p>
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Claims</p>
          </div>
          {(Object.entries(summary.countByCategory) as [WarrantyDefectCategory, number][])
            .filter(([, count]) => count > 0)
            .map(([category, count]) => (
              <div key={category} className="rounded-lg border border-slate-700/40 bg-slate-900/50 p-3 text-center">
                <p className="text-2xl font-bold text-slate-100">{count}</p>
                <p className="text-xs uppercase tracking-wider text-slate-400">{CATEGORY_LABELS[category]}</p>
              </div>
            ))}
          {summary.overdueRectifications > 0 && (
            <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-center">
              <p className="text-2xl font-bold text-red-300">{summary.overdueRectifications}</p>
              <p className="text-xs uppercase tracking-wider text-red-400">Overdue</p>
            </div>
          )}
        </div>

        {/* Stage breakdown */}
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-slate-400">By Stage</p>
          <div className="flex flex-wrap gap-2">
            {(Object.entries(summary.countByStage) as [WarrantyClaimStage, number][])
              .filter(([, count]) => count > 0)
              .map(([stage, count]) => (
                <span key={stage} className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-900/50 px-2.5 py-1 text-xs text-slate-300">
                  <StatusBadge status={STAGE_LABELS[stage]} variant={getStageVariant(stage)} />
                  <span className="font-semibold">{count}</span>
                </span>
              ))}
          </div>
        </div>

        {/* Claims list */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-slate-400">Claims</p>
          {claims.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No warranty claims registered.</p>
          ) : (
            <ul className="space-y-2" role="list" aria-label="Warranty claims">
              {claims.map((claim) => (
                <li
                  key={claim.id}
                  className="flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-900/40 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {claim.unitId} — {claim.claimantName}
                      </p>
                      {claim.isOutsideWarranty && (
                        <span className="text-[10px] font-semibold uppercase text-amber-400">Outside Period</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{claim.defectDescription}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {CATEGORY_LABELS[claim.defectCategory]} · Discovered {claim.defectDiscoveredDate}
                    </p>
                  </div>
                  <StatusBadge status={STAGE_LABELS[claim.currentStage]} variant={getStageVariant(claim.currentStage)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
