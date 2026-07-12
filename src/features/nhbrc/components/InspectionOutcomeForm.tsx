/**
 * Inspection Outcome Form Component
 *
 * Form to record an inspection: stage, date, inspector name, outcome,
 * conditions/defects (required if failed/conditional), and evidence upload refs.
 *
 * Requirements: 12.2
 */

import React, { useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { InspectionStage, InspectionOutcome, RecordInspectionInput } from '../types';

export interface InspectionOutcomeFormProps {
  projectId?: string;
  unitId?: string;
  onSubmit?: (data: RecordInspectionInput) => void;
}

const STAGES: { value: InspectionStage; label: string }[] = [
  { value: 'foundation', label: 'Foundation' },
  { value: 'wall_plate', label: 'Wall Plate' },
  { value: 'roof', label: 'Roof' },
  { value: 'completion', label: 'Completion' },
];

const OUTCOMES: { value: InspectionOutcome; label: string }[] = [
  { value: 'passed', label: 'Passed' },
  { value: 'failed', label: 'Failed' },
  { value: 'conditionally_passed', label: 'Conditionally Passed' },
];

export function InspectionOutcomeForm({ projectId, unitId, onSubmit }: InspectionOutcomeFormProps) {
  const [stage, setStage] = useState<InspectionStage>('foundation');
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [outcome, setOutcome] = useState<InspectionOutcome>('passed');
  const [conditionsOrDefects, setConditionsOrDefects] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);
  const [conditionDeadline, setConditionDeadline] = useState('');
  const [formUnitId, setFormUnitId] = useState(unitId ?? '');

  const requiresConditions = outcome === 'failed' || outcome === 'conditionally_passed';
  const isValid =
    formUnitId.trim() !== '' &&
    inspectionDate !== '' &&
    inspectorName.trim() !== '' &&
    inspectorName.length <= 200 &&
    (!requiresConditions || conditionsOrDefects.trim() !== '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const data: RecordInspectionInput = {
      unitId: formUnitId.trim(),
      stage,
      inspectionDate,
      inspectorName: inspectorName.trim(),
      outcome,
      conditionsOrDefects: requiresConditions ? conditionsOrDefects.trim() : undefined,
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
      conditionDeadline: outcome === 'conditionally_passed' && conditionDeadline ? conditionDeadline : undefined,
    };
    onSubmit?.(data);
  }

  function handleEvidenceAdd() {
    if (evidenceRefs.length >= 20) return;
    const ref = `evidence-${Date.now()}-${evidenceRefs.length + 1}`;
    setEvidenceRefs([...evidenceRefs, ref]);
  }

  return (
    <Card className="bg-slate-900/50 border-slate-700/40">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-slate-100">
          Record Inspection Outcome
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Unit ID */}
            <div className="space-y-1.5">
              <label htmlFor="insp-unit" className="text-xs uppercase tracking-wider text-slate-400">
                Unit ID
              </label>
              <input
                id="insp-unit"
                type="text"
                value={formUnitId}
                onChange={(e) => setFormUnitId(e.target.value)}
                placeholder="e.g. unit-1"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Stage */}
            <div className="space-y-1.5">
              <label htmlFor="insp-stage" className="text-xs uppercase tracking-wider text-slate-400">
                Stage
              </label>
              <select
                id="insp-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value as InspectionStage)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* Inspection Date */}
            <div className="space-y-1.5">
              <label htmlFor="insp-date" className="text-xs uppercase tracking-wider text-slate-400">
                Inspection Date
              </label>
              <input
                id="insp-date"
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Inspector Name */}
            <div className="space-y-1.5">
              <label htmlFor="insp-inspector" className="text-xs uppercase tracking-wider text-slate-400">
                Inspector Name
              </label>
              <input
                id="insp-inspector"
                type="text"
                maxLength={200}
                value={inspectorName}
                onChange={(e) => setInspectorName(e.target.value)}
                placeholder="Inspector name"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Outcome */}
          <div className="space-y-1.5">
            <label htmlFor="insp-outcome" className="text-xs uppercase tracking-wider text-slate-400">
              Outcome
            </label>
            <select
              id="insp-outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as InspectionOutcome)}
              className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Conditions / Defects (required if failed/conditional) */}
          {requiresConditions && (
            <div className="space-y-1.5">
              <label htmlFor="insp-conditions" className="text-xs uppercase tracking-wider text-slate-400">
                Conditions / Defects <span className="text-red-400">*</span>
              </label>
              <textarea
                id="insp-conditions"
                maxLength={2000}
                rows={3}
                value={conditionsOrDefects}
                onChange={(e) => setConditionsOrDefects(e.target.value)}
                placeholder="Describe conditions or defects observed..."
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
              />
              {requiresConditions && conditionsOrDefects.trim() === '' && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle className="h-3 w-3" aria-hidden="true" />
                  Required for failed or conditionally passed outcomes.
                </div>
              )}
            </div>
          )}

          {/* Condition Deadline (for conditional pass) */}
          {outcome === 'conditionally_passed' && (
            <div className="space-y-1.5">
              <label htmlFor="insp-deadline" className="text-xs uppercase tracking-wider text-slate-400">
                Condition Deadline
              </label>
              <input
                id="insp-deadline"
                type="date"
                value={conditionDeadline}
                onChange={(e) => setConditionDeadline(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Evidence Upload */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">
              Evidence ({evidenceRefs.length}/20)
            </label>
            <div className="flex flex-wrap gap-2">
              {evidenceRefs.map((ref, idx) => (
                <span key={ref} className="inline-flex items-center gap-1 rounded bg-slate-700/50 px-2 py-1 text-xs text-slate-300">
                  📎 Evidence {idx + 1}
                  <button
                    type="button"
                    onClick={() => setEvidenceRefs(evidenceRefs.filter((_, i) => i !== idx))}
                    className="text-slate-400 hover:text-red-400 ml-1"
                    aria-label={`Remove evidence ${idx + 1}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {evidenceRefs.length < 20 && (
                <Button type="button" variant="outline" size="sm" onClick={handleEvidenceAdd} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Add Evidence
                </Button>
              )}
            </div>
          </div>

          <Button type="submit" disabled={!isValid}>
            Record Inspection
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
