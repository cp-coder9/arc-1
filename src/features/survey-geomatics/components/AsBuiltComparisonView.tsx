/**
 * As-Built Comparison View
 *
 * Measurement pairs entry with dimension description, approved value,
 * as-built value, tolerance threshold, and live deviation calculation.
 * Shows within/outside tolerance indicator per measurement.
 *
 * Requirements: 19.2, 19.4, 22.8
 */

import React, { useState, useMemo } from 'react';
import { Ruler, Plus, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ComparisonSummaryPanel } from './ComparisonSummaryPanel';
import type { MeasurementPair } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MeasurementEntry {
  id: string;
  dimensionDescription: string;
  approvedDimension: string;
  asBuiltDimension: string;
  toleranceThreshold: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calculateMeasurement(entry: MeasurementEntry): MeasurementPair | null {
  const approved = parseFloat(entry.approvedDimension);
  const asBuilt = parseFloat(entry.asBuiltDimension);
  const tolerance = parseFloat(entry.toleranceThreshold);

  if (isNaN(approved) || isNaN(asBuilt) || isNaN(tolerance)) return null;
  if (approved < 0.001 || asBuilt < 0.001 || tolerance < 0.001) return null;

  const deviation = Math.round((asBuilt - approved) * 1000) / 1000;
  const absoluteDeviation = Math.abs(deviation);
  const isWithinTolerance = absoluteDeviation <= tolerance;

  return {
    id: entry.id,
    comparisonId: 'current',
    dimensionDescription: entry.dimensionDescription,
    approvedDimension: approved,
    asBuiltDimension: asBuilt,
    toleranceThreshold: tolerance,
    deviation,
    absoluteDeviation,
    isWithinTolerance,
  };
}

function generateId(): string {
  return `mp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AsBuiltComparisonView() {
  const [entries, setEntries] = useState<MeasurementEntry[]>([
    {
      id: generateId(),
      dimensionDescription: '',
      approvedDimension: '',
      asBuiltDimension: '',
      toleranceThreshold: '0.050',
    },
  ]);

  const measurements = useMemo(() => {
    return entries
      .map(calculateMeasurement)
      .filter((m): m is MeasurementPair => m !== null);
  }, [entries]);

  const handleAdd = () => {
    setEntries((prev) => [
      ...prev,
      {
        id: generateId(),
        dimensionDescription: '',
        approvedDimension: '',
        asBuiltDimension: '',
        toleranceThreshold: '0.050',
      },
    ]);
  };

  const handleRemove = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleChange = (id: string, field: keyof MeasurementEntry, value: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e)),
    );
  };

  return (
    <div className="mt-4 space-y-4">
      {/* Measurement Entry */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-blue-400" aria-hidden="true" />
              <CardTitle className="text-base">Measurement Pairs</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Measurement
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Column Headers */}
            <div className="hidden grid-cols-[1fr_100px_100px_80px_80px_40px] items-end gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground md:grid">
              <span>Description</span>
              <span>Approved (m)</span>
              <span>As-Built (m)</span>
              <span>Tolerance</span>
              <span>Deviation</span>
              <span />
            </div>

            {entries.map((entry) => {
              const measurement = calculateMeasurement(entry);
              const hasValues = entry.approvedDimension !== '' && entry.asBuiltDimension !== '';

              return (
                <div
                  key={entry.id}
                  className="grid grid-cols-1 gap-2 rounded-lg border border-slate-700/40 bg-slate-800/20 p-3 md:grid-cols-[1fr_100px_100px_80px_80px_40px] md:items-center md:border-0 md:bg-transparent md:p-0"
                >
                  {/* Dimension Description */}
                  <div>
                    <Label className="text-xs md:hidden">Description</Label>
                    <Input
                      value={entry.dimensionDescription}
                      onChange={(e) => handleChange(entry.id, 'dimensionDescription', e.target.value)}
                      placeholder="e.g. North wall length"
                      maxLength={200}
                    />
                  </div>

                  {/* Approved Dimension */}
                  <div>
                    <Label className="text-xs md:hidden">Approved (m)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="99999.999"
                      value={entry.approvedDimension}
                      onChange={(e) => handleChange(entry.id, 'approvedDimension', e.target.value)}
                      placeholder="0.000"
                    />
                  </div>

                  {/* As-Built Dimension */}
                  <div>
                    <Label className="text-xs md:hidden">As-Built (m)</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="99999.999"
                      value={entry.asBuiltDimension}
                      onChange={(e) => handleChange(entry.id, 'asBuiltDimension', e.target.value)}
                      placeholder="0.000"
                    />
                  </div>

                  {/* Tolerance */}
                  <div>
                    <Label className="text-xs md:hidden">Tolerance</Label>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      max="1.000"
                      value={entry.toleranceThreshold}
                      onChange={(e) => handleChange(entry.id, 'toleranceThreshold', e.target.value)}
                      placeholder="0.050"
                    />
                  </div>

                  {/* Live Deviation */}
                  <div className="flex items-center gap-1">
                    {hasValues && measurement ? (
                      <>
                        {measurement.isWithinTolerance ? (
                          <CheckCircle2 className="h-4 w-4 text-green-400" aria-label="Within tolerance" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-400" aria-label="Outside tolerance" />
                        )}
                        <span
                          className={`text-xs font-mono font-semibold ${
                            measurement.isWithinTolerance ? 'text-green-300' : 'text-red-300'
                          }`}
                        >
                          {measurement.deviation >= 0 ? '+' : ''}{measurement.deviation.toFixed(3)}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </div>

                  {/* Remove */}
                  <div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(entry.id)}
                      disabled={entries.length <= 1}
                      aria-label={`Remove measurement ${entry.dimensionDescription || 'row'}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Summary Panel */}
      <ComparisonSummaryPanel measurements={measurements} />
    </div>
  );
}
