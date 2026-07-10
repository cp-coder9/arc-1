// ProposalPreview — Formatted preview of the assembled proposal
//
// Requirements: 6.6, 6.7

import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFeeProposalBuilder } from '../FeeProposalBuilderContext';

export interface ProposalPreviewProps {
  projectName: string;
  projectLocation: string;
  projectDescription: string;
  clientName: string;
  professionalName: string;
  professionalCompany: string;
  assumptions: string[];
  exclusions: string[];
  notes: string[];
  validityDays: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 }).format(value);
}

export function ProposalPreview({
  projectName,
  projectLocation,
  projectDescription,
  clientName,
  professionalName,
  professionalCompany,
  assumptions,
  exclusions,
  notes,
  validityDays,
}: ProposalPreviewProps) {
  const { calculatorState, activeProfession } = useFeeProposalBuilder();
  const result = calculatorState.result;

  return (
    <div className="space-y-6">
      {/* Preview Header */}
      <div className="rounded-xl bg-surface-800/70 backdrop-blur border border-surface-700/50 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-primary-400" />
            <h2 className="text-lg font-bold text-surface-100">Proposal Preview</h2>
          </div>
          <Button variant="ghost" size="sm">
            <Download className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Formatted Document */}
      <div className="rounded-xl bg-white/5 backdrop-blur border border-surface-700/50 p-8 space-y-6 text-surface-200">
        {/* Title */}
        <div className="text-center border-b border-surface-700/40 pb-6">
          <h1 className="text-2xl font-bold text-white">Professional Fee Proposal</h1>
          <p className="text-sm text-surface-400 mt-2">{projectName}</p>
          <p className="text-xs text-surface-500 mt-1">Generated {new Date().toLocaleDateString('en-ZA')}</p>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Professional</h3>
            <p className="text-sm font-medium">{professionalName}</p>
            {professionalCompany && <p className="text-xs text-surface-400">{professionalCompany}</p>}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Client</h3>
            <p className="text-sm font-medium">{clientName}</p>
          </div>
        </div>

        {/* Project */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Project</h3>
          <p className="text-sm">{projectName}</p>
          {projectLocation && <p className="text-xs text-surface-400">{projectLocation}</p>}
          {projectDescription && <p className="text-xs text-surface-400 mt-1">{projectDescription}</p>}
        </div>

        {/* Fee Summary */}
        {result && (
          <div className="border-t border-surface-700/40 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-3">Fee Summary</h3>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>Professional Fee (after discount)</span>
                <span className="font-mono">{formatCurrency(result.professionalFeeAfterDiscount)}</span>
              </div>
              {result.disbursementsTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Disbursements</span>
                  <span className="font-mono">{formatCurrency(result.disbursementsTotal)}</span>
                </div>
              )}
              {result.statutoryFeesTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span>Statutory Fees</span>
                  <span className="font-mono">{formatCurrency(result.statutoryFeesTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>VAT (15%)</span>
                <span className="font-mono">{formatCurrency(result.vatAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-surface-700/40 pt-2">
                <span>Total (incl. VAT)</span>
                <span className="font-mono">{formatCurrency(result.totalInclVat)}</span>
              </div>
            </div>
          </div>
        )}

        {/* Assumptions */}
        {assumptions.length > 0 && (
          <div className="border-t border-surface-700/40 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Assumptions</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {assumptions.map((a, i) => <li key={i}>{a}</li>)}
            </ul>
          </div>
        )}

        {/* Exclusions */}
        {exclusions.length > 0 && (
          <div className="border-t border-surface-700/40 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Exclusions</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {exclusions.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        {/* Notes */}
        {notes.length > 0 && (
          <div className="border-t border-surface-700/40 pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-surface-400 mb-2">Notes</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm">
              {notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </div>
        )}

        {/* Validity */}
        <div className="border-t border-surface-700/40 pt-4 text-sm text-surface-400">
          <p>This proposal is valid for <strong className="text-surface-200">{validityDays} days</strong> from the date of issue.</p>
        </div>
      </div>
    </div>
  );
}
