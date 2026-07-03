/**
 * Warranty Claim Form Component
 *
 * Form to register a warranty claim: unit, claimant details, defect
 * description/category, dates, and evidence (min 1). Includes period
 * validation warning when claim may be outside warranty.
 *
 * Requirements: 13.1, 13.10
 */

import React, { useState, useMemo } from 'react';
import { Upload, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { WarrantyDefectCategory, CreateWarrantyClaimInput } from '../types';

export interface WarrantyClaimFormProps {
  projectId?: string;
  onSubmit?: (data: CreateWarrantyClaimInput) => void;
}

const DEFECT_CATEGORIES: { value: WarrantyDefectCategory; label: string }[] = [
  { value: 'structural', label: 'Structural' },
  { value: 'roof_waterproofing', label: 'Roof & Waterproofing' },
  { value: 'wall_waterproofing', label: 'Wall Waterproofing' },
];

const WARRANTY_YEARS = 5;

function isOutsideWarranty(practicalCompletionDate: string, defectDiscoveredDate: string): boolean {
  if (!practicalCompletionDate || !defectDiscoveredDate) return false;
  const completion = new Date(practicalCompletionDate);
  const discovered = new Date(defectDiscoveredDate);
  const expiryDate = new Date(completion);
  expiryDate.setFullYear(expiryDate.getFullYear() + WARRANTY_YEARS);
  return discovered > expiryDate;
}

export function WarrantyClaimForm({ projectId, onSubmit }: WarrantyClaimFormProps) {
  const [unitId, setUnitId] = useState('');
  const [claimantName, setClaimantName] = useState('');
  const [claimantContact, setClaimantContact] = useState('');
  const [defectDescription, setDefectDescription] = useState('');
  const [defectCategory, setDefectCategory] = useState<WarrantyDefectCategory>('structural');
  const [defectDiscoveredDate, setDefectDiscoveredDate] = useState('');
  const [practicalCompletionDate, setPracticalCompletionDate] = useState('');
  const [evidenceRefs, setEvidenceRefs] = useState<string[]>([]);

  const outsideWarranty = useMemo(
    () => isOutsideWarranty(practicalCompletionDate, defectDiscoveredDate),
    [practicalCompletionDate, defectDiscoveredDate]
  );

  const isValid =
    unitId.trim() !== '' &&
    claimantName.trim() !== '' &&
    claimantContact.trim() !== '' &&
    defectDescription.trim() !== '' &&
    defectDescription.length <= 2000 &&
    defectDiscoveredDate !== '' &&
    practicalCompletionDate !== '' &&
    evidenceRefs.length >= 1;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;

    const data: CreateWarrantyClaimInput = {
      unitId: unitId.trim(),
      claimantName: claimantName.trim(),
      claimantContact: claimantContact.trim(),
      defectDescription: defectDescription.trim(),
      defectCategory,
      defectDiscoveredDate,
      practicalCompletionDate,
      evidenceRefs,
    };
    onSubmit?.(data);
  }

  function handleEvidenceAdd() {
    if (evidenceRefs.length >= 20) return;
    const ref = `warranty-evidence-${Date.now()}-${evidenceRefs.length + 1}`;
    setEvidenceRefs([...evidenceRefs, ref]);
  }

  return (
    <Card className="bg-slate-800/70 border-slate-700/50">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-100">
          Register Warranty Claim
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Unit */}
            <div className="space-y-1.5">
              <label htmlFor="wc-unit" className="text-xs uppercase tracking-wider text-slate-400">
                Unit ID
              </label>
              <input
                id="wc-unit"
                type="text"
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                placeholder="e.g. unit-1"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Defect Category */}
            <div className="space-y-1.5">
              <label htmlFor="wc-category" className="text-xs uppercase tracking-wider text-slate-400">
                Defect Category
              </label>
              <select
                id="wc-category"
                value={defectCategory}
                onChange={(e) => setDefectCategory(e.target.value as WarrantyDefectCategory)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {DEFECT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>

            {/* Claimant Name */}
            <div className="space-y-1.5">
              <label htmlFor="wc-name" className="text-xs uppercase tracking-wider text-slate-400">
                Claimant Name
              </label>
              <input
                id="wc-name"
                type="text"
                value={claimantName}
                onChange={(e) => setClaimantName(e.target.value)}
                placeholder="Full name"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Claimant Contact */}
            <div className="space-y-1.5">
              <label htmlFor="wc-contact" className="text-xs uppercase tracking-wider text-slate-400">
                Claimant Contact
              </label>
              <input
                id="wc-contact"
                type="text"
                value={claimantContact}
                onChange={(e) => setClaimantContact(e.target.value)}
                placeholder="Phone or email"
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Practical Completion Date */}
            <div className="space-y-1.5">
              <label htmlFor="wc-completion" className="text-xs uppercase tracking-wider text-slate-400">
                Practical Completion Date
              </label>
              <input
                id="wc-completion"
                type="date"
                value={practicalCompletionDate}
                onChange={(e) => setPracticalCompletionDate(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Defect Discovered Date */}
            <div className="space-y-1.5">
              <label htmlFor="wc-discovered" className="text-xs uppercase tracking-wider text-slate-400">
                Defect Discovered Date
              </label>
              <input
                id="wc-discovered"
                type="date"
                value={defectDiscoveredDate}
                onChange={(e) => setDefectDiscoveredDate(e.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Warranty period warning */}
          {outsideWarranty && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-700/50 bg-amber-950/30 px-4 py-3">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-amber-200">Outside Warranty Period</p>
                <p className="text-xs text-amber-300/80">
                  The defect discovery date exceeds the {WARRANTY_YEARS}-year warranty period from practical completion.
                  This claim may not be eligible for NHBRC warranty coverage.
                </p>
              </div>
            </div>
          )}

          {/* Defect Description */}
          <div className="space-y-1.5">
            <label htmlFor="wc-description" className="text-xs uppercase tracking-wider text-slate-400">
              Defect Description <span className="text-red-400">*</span>
            </label>
            <textarea
              id="wc-description"
              maxLength={2000}
              rows={3}
              value={defectDescription}
              onChange={(e) => setDefectDescription(e.target.value)}
              placeholder="Describe the defect in detail..."
              className="w-full rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-slate-500">{defectDescription.length}/2000</p>
          </div>

          {/* Evidence Upload (min 1) */}
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-wider text-slate-400">
              Evidence <span className="text-red-400">*</span> ({evidenceRefs.length}/20, min 1)
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
            {evidenceRefs.length === 0 && (
              <p className="text-xs text-red-400">At least 1 piece of evidence is required.</p>
            )}
          </div>

          <Button type="submit" disabled={!isValid}>
            Submit Warranty Claim
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
