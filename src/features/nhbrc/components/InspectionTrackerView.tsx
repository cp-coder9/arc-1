/**
 * Inspection Tracker View Component
 *
 * Unit inspection grid showing 4 stages per unit (foundation, wall_plate,
 * roof, completion) with pass/fail/conditional indicators and hold point warnings.
 *
 * Requirements: 12.2
 */

import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, MinusCircle, Clock } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/features/p1-shared/components/StatusBadge';
import type { StatusBadgeVariant } from '@/features/p1-shared/components/StatusBadge';
import type { InspectionStage, InspectionOutcome, UnitInspectionStatus } from '../types';
import { InspectionOutcomeForm } from './InspectionOutcomeForm';

export interface InspectionTrackerViewProps {
  projectId?: string;
  units?: UnitInspectionStatus[];
  onRecordInspection?: (unitId: string, stage: InspectionStage) => void;
}

const STAGES: { key: InspectionStage; label: string }[] = [
  { key: 'foundation', label: 'Foundation' },
  { key: 'wall_plate', label: 'Wall Plate' },
  { key: 'roof', label: 'Roof' },
  { key: 'completion', label: 'Completion' },
];

const DEMO_UNITS: UnitInspectionStatus[] = [
  { unitId: 'unit-1', currentStage: 'wall_plate', stagesCompleted: ['foundation'], hasFailed: false, failedStages: [] },
  { unitId: 'unit-2', currentStage: 'foundation', stagesCompleted: [], hasFailed: false, failedStages: [] },
  { unitId: 'unit-3', currentStage: 'roof', stagesCompleted: ['foundation', 'wall_plate'], hasFailed: true, failedStages: ['roof'] },
];

function getStageStatus(
  unit: UnitInspectionStatus,
  stage: InspectionStage
): { variant: StatusBadgeVariant; label: string; icon: React.ReactNode } {
  if (unit.failedStages.includes(stage)) {
    return { variant: 'danger', label: 'Failed', icon: <XCircle className="h-3.5 w-3.5 text-red-400" /> };
  }
  if (unit.stagesCompleted.includes(stage)) {
    return { variant: 'success', label: 'Passed', icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> };
  }
  if (unit.currentStage === stage) {
    return { variant: 'warning', label: 'Pending', icon: <Clock className="h-3.5 w-3.5 text-amber-400" /> };
  }
  return { variant: 'default', label: 'Not Due', icon: <MinusCircle className="h-3.5 w-3.5 text-slate-500" /> };
}

export function InspectionTrackerView({
  projectId,
  units: externalUnits,
  onRecordInspection,
}: InspectionTrackerViewProps) {
  const units = externalUnits ?? DEMO_UNITS;
  const [showForm, setShowForm] = useState(false);
  const hasFailures = units.some((u) => u.hasFailed);

  return (
    <div className="space-y-4">
      {/* Hold point warning */}
      {hasFailures && (
        <div className="flex items-start gap-3 rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-red-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-red-200">Hold Point Warning</p>
            <p className="text-xs text-red-300/80">
              One or more units have failed inspections. Construction may not proceed past the failed stage until re-inspection passes.
            </p>
          </div>
        </div>
      )}

      <Card className="bg-slate-800/70 border-slate-700/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-100">
            Inspection Grid
          </CardTitle>
          <button
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-blue-400 hover:text-blue-300 underline-offset-2 hover:underline"
          >
            {showForm ? 'Hide Form' : 'Record Inspection'}
          </button>
        </CardHeader>
        <CardContent>
          {showForm && (
            <div className="mb-4">
              <InspectionOutcomeForm projectId={projectId} onSubmit={() => setShowForm(false)} />
            </div>
          )}

          {/* Grid table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="grid" aria-label="Unit inspection stages">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-3 py-2 text-left text-xs uppercase tracking-wider text-slate-400 font-medium">
                    Unit
                  </th>
                  {STAGES.map((stage) => (
                    <th
                      key={stage.key}
                      className="px-3 py-2 text-center text-xs uppercase tracking-wider text-slate-400 font-medium"
                    >
                      {stage.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => (
                  <tr key={unit.unitId} className="border-b border-slate-700/30 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-slate-200">{unit.unitId}</td>
                    {STAGES.map((stage) => {
                      const status = getStageStatus(unit, stage.key);
                      return (
                        <td key={stage.key} className="px-3 py-2.5 text-center">
                          <button
                            className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-slate-700/30 transition-colors"
                            onClick={() => onRecordInspection?.(unit.unitId, stage.key)}
                            aria-label={`${unit.unitId} ${stage.label}: ${status.label}`}
                          >
                            {status.icon}
                            <StatusBadge status={status.label} variant={status.variant} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {units.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-6">
              No units registered. Add units to begin tracking inspections.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
