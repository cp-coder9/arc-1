/**
 * HIRARegister — Hazard Identification & Risk Assessment Register
 *
 * Displays a table of hazards with risk ratings, a 5×5 risk matrix visualisation,
 * and filtering by risk level. Used as the HIRA tab content within
 * the HealthSafetyWorkspace.
 */

import React, { useState, useMemo } from 'react';
import type { HazardEntry, RiskLevel } from '@/services/healthSafety/hsTypes';
import { RISK_MATRIX_THRESHOLDS } from '@/services/healthSafety/hsConstants';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, Shield, Activity } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface HIRARegisterProps {
  hazards: HazardEntry[];
  onAddHazard?: () => void;
}

type RiskFilter = 'all' | 'high_critical';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getRiskLevel(rating: number): RiskLevel {
  if (rating >= RISK_MATRIX_THRESHOLDS.critical.min) return 'critical';
  if (rating >= RISK_MATRIX_THRESHOLDS.high.min) return 'high';
  if (rating >= RISK_MATRIX_THRESHOLDS.medium.min) return 'medium';
  return 'low';
}

function riskBadgeClassName(level: RiskLevel): string {
  switch (level) {
    case 'critical': return 'bg-red-500/20 text-red-400 border-red-500/30';
    case 'high': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
    case 'medium': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'low': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
  }
}

function riskMatrixCellColor(rating: number): string {
  const level = getRiskLevel(rating);
  switch (level) {
    case 'critical': return 'bg-red-500/60 text-red-100';
    case 'high': return 'bg-orange-500/60 text-orange-100';
    case 'medium': return 'bg-yellow-500/60 text-yellow-100';
    case 'low': return 'bg-emerald-500/60 text-emerald-100';
  }
}

// ── Risk Matrix Component ────────────────────────────────────────────────────

function RiskMatrix() {
  const severityLabels = ['Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
  const likelihoodLabels = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">5×5 Risk Matrix</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Risk assessment matrix">
            <thead>
              <tr>
                <th className="pb-1 pr-1 text-left text-muted-foreground font-normal">L \ S</th>
                {severityLabels.map((label, i) => (
                  <th key={i} className="pb-1 px-1 text-center font-normal text-muted-foreground min-w-[52px]">
                    {i + 1}<br /><span className="text-[10px]">{label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[5, 4, 3, 2, 1].map((likelihood) => (
                <tr key={likelihood}>
                  <td className="py-1 pr-1 text-muted-foreground whitespace-nowrap">
                    {likelihood} <span className="text-[10px]">{likelihoodLabels[likelihood - 1]}</span>
                  </td>
                  {[1, 2, 3, 4, 5].map((severity) => {
                    const rating = likelihood * severity;
                    return (
                      <td key={severity} className="p-0.5">
                        <div
                          className={cn(
                            'flex h-8 w-full items-center justify-center rounded text-xs font-bold',
                            riskMatrixCellColor(rating),
                          )}
                          aria-label={`Likelihood ${likelihood}, Severity ${severity}, Rating ${rating}`}
                        >
                          {rating}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-emerald-500/60" /> Low (1–4)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-yellow-500/60" /> Medium (5–9)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-orange-500/60" /> High (10–15)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-500/60" /> Critical (16–25)
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function HIRARegister({ hazards, onAddHazard }: HIRARegisterProps) {
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');

  const filteredHazards = useMemo(() => {
    if (riskFilter === 'high_critical') {
      return hazards.filter(
        (h) => h.residualRisk === 'high' || h.residualRisk === 'critical',
      );
    }
    return hazards;
  }, [hazards, riskFilter]);

  return (
    <div className="space-y-4" data-testid="hira-register">
      {/* Header Row: Title + Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-400" />
          <h2 className="text-lg font-semibold">Hazard Register</h2>
          <Badge variant="outline" className="rounded-full text-xs">
            {filteredHazards.length} hazard{filteredHazards.length !== 1 ? 's' : ''}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter Buttons */}
          <Button
            variant={riskFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setRiskFilter('all')}
          >
            All
          </Button>
          <Button
            variant={riskFilter === 'high_critical' ? 'default' : 'outline'}
            size="sm"
            className="rounded-full text-xs"
            onClick={() => setRiskFilter('high_critical')}
          >
            <Shield className="mr-1 h-3 w-3" />
            High/Critical Only
          </Button>
          {/* Add Hazard */}
          {onAddHazard && (
            <Button size="sm" className="rounded-full" onClick={onAddHazard}>
              <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />
              Add Hazard
            </Button>
          )}
        </div>
      </div>

      {/* Hazard Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Hazard</th>
                  <th className="px-4 py-3">Activity</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-center">L</th>
                  <th className="px-4 py-3 text-center">S</th>
                  <th className="px-4 py-3 text-center">Rating</th>
                  <th className="px-4 py-3">Residual Risk</th>
                  <th className="px-4 py-3">Controls</th>
                </tr>
              </thead>
              <tbody>
                {filteredHazards.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                      No hazards recorded{riskFilter === 'high_critical' ? ' at high/critical level' : ''}.
                    </td>
                  </tr>
                ) : (
                  filteredHazards.map((hazard) => (
                    <tr key={hazard.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs">{hazard.id}</td>
                      <td className="px-4 py-3 font-medium">{hazard.description}</td>
                      <td className="px-4 py-3 text-muted-foreground">{hazard.activity}</td>
                      <td className="px-4 py-3 text-muted-foreground">{hazard.location}</td>
                      <td className="px-4 py-3 text-center">{hazard.likelihood}</td>
                      <td className="px-4 py-3 text-center">{hazard.severity}</td>
                      <td className="px-4 py-3 text-center font-bold">{hazard.riskRating}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                            riskBadgeClassName(hazard.residualRisk),
                          )}
                        >
                          {hazard.residualRisk}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-[200px]">
                          {hazard.existingControls.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {hazard.existingControls.join(', ')}
                            </span>
                          ) : (
                            <span className="text-xs italic text-muted-foreground/60">None</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 5×5 Risk Matrix Visualisation */}
      <RiskMatrix />
    </div>
  );
}
