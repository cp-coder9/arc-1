/**
 * Evidence Schedule Panel
 *
 * Evidence list with type, date, source, description, relevance category.
 * Sorted by date. Link/unlink actions per evidence item.
 *
 * Requirements: 7.6
 */

import React from 'react';
import { FileCheck, Link2, Unlink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table';
import type { EvidenceLink, EvidenceRelevance, FormalClaim } from '../types';

export interface EvidenceSchedulePanelProps {
  evidenceItems: EvidenceLink[];
  claims: FormalClaim[];
  onLinkEvidence?: (claimId: string, evidenceId: string) => void;
  onUnlinkEvidence?: (claimId: string, evidenceId: string) => void;
}

const RELEVANCE_LABELS: Record<EvidenceRelevance, string> = {
  causation: 'Causation',
  quantum: 'Quantum',
  delay: 'Delay',
  mitigation: 'Mitigation',
};

const RELEVANCE_STYLES: Record<EvidenceRelevance, string> = {
  causation: 'bg-purple-950/40 text-purple-300 border-purple-700/50',
  quantum: 'bg-emerald-950/40 text-emerald-300 border-emerald-700/50',
  delay: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  mitigation: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function EvidenceSchedulePanel({
  evidenceItems,
  claims,
  onLinkEvidence,
  onUnlinkEvidence,
}: EvidenceSchedulePanelProps) {
  // Sort evidence by date ascending
  const sortedEvidence = [...evidenceItems].sort(
    (a, b) => a.dateOfEvidence.localeCompare(b.dateOfEvidence)
  );

  // Group by relevance category for summary
  const byRelevance = sortedEvidence.reduce<Record<string, number>>((acc, e) => {
    acc[e.relevanceCategory] = (acc[e.relevanceCategory] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6 pt-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card size="sm" className="bg-slate-800/60 border-slate-700/50">
          <CardContent className="pt-3">
            <p className="text-xs uppercase tracking-wider text-slate-400">Total Evidence</p>
            <p className="text-2xl font-bold text-slate-100">{sortedEvidence.length}</p>
          </CardContent>
        </Card>
        {(Object.entries(byRelevance) as [EvidenceRelevance, number][]).map(([category, count]) => (
          <Card key={category} size="sm" className="bg-slate-800/60 border-slate-700/50">
            <CardContent className="pt-3">
              <p className="text-xs uppercase tracking-wider text-slate-400">{RELEVANCE_LABELS[category]}</p>
              <p className="text-2xl font-bold text-slate-100">{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Evidence table */}
      <Card className="bg-slate-800/60 border-slate-700/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <CardTitle className="text-sm text-slate-200">Evidence Schedule</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {sortedEvidence.length === 0 ? (
            <p className="text-sm text-slate-500">No evidence items linked.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50">
                  <TableHead className="text-slate-400">Date</TableHead>
                  <TableHead className="text-slate-400">Type</TableHead>
                  <TableHead className="text-slate-400">Source</TableHead>
                  <TableHead className="text-slate-400">Description</TableHead>
                  <TableHead className="text-slate-400">Relevance</TableHead>
                  <TableHead className="text-slate-400">Status</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedEvidence.map((item) => {
                  const claim = claims.find((c) => c.id === item.claimId);
                  return (
                    <TableRow key={item.id} className="border-slate-700/50">
                      <TableCell className="text-slate-300 text-xs">
                        {formatDate(item.dateOfEvidence)}
                      </TableCell>
                      <TableCell className="text-slate-300 text-xs">{item.evidenceType}</TableCell>
                      <TableCell className="text-slate-300 text-xs">{item.sourceModule}</TableCell>
                      <TableCell className="text-slate-300 text-xs max-w-[180px] truncate">
                        {item.description}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${RELEVANCE_STYLES[item.relevanceCategory]}`}
                        >
                          {RELEVANCE_LABELS[item.relevanceCategory]}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            item.sourceStatus === 'available'
                              ? 'text-green-300 border-green-700/50'
                              : 'text-red-300 border-red-700/50'
                          }`}
                        >
                          {item.sourceStatus === 'available' ? 'Available' : 'Unavailable'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {onLinkEvidence && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => onLinkEvidence(item.claimId, item.id)}
                              title="Link evidence"
                              aria-label={`Link evidence ${item.description}`}
                            >
                              <Link2 className="h-3.5 w-3.5 text-slate-400 hover:text-blue-400" />
                            </Button>
                          )}
                          {onUnlinkEvidence && (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => onUnlinkEvidence(item.claimId, item.id)}
                              title="Unlink evidence"
                              aria-label={`Unlink evidence ${item.description}`}
                            >
                              <Unlink className="h-3.5 w-3.5 text-slate-400 hover:text-red-400" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
