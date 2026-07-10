/**
 * DisclaimerBanner — Reusable advisory-only disclaimer component
 *
 * Displays a prominent disclaimer banner stating that the Environmental & Heritage
 * module tools are advisory only and do not constitute environmental or legal advice.
 *
 * Requirements: 15.6
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DisclaimerBannerProps {
  /** Optional override for the disclaimer message */
  message?: string;
  /** Optional compact mode for inline usage */
  compact?: boolean;
}

// ─── Default Disclaimer Text ──────────────────────────────────────────────────

const DEFAULT_DISCLAIMER =
  'This screening tool is advisory only and does not constitute a formal determination of environmental authorisation requirements. The applicant must engage a registered Environmental Assessment Practitioner (EAP) to conduct the formal screening and lodge applications with the competent authority. Listed activity descriptions are simplified summaries — refer to the full gazetted regulations for definitive text.';

// ─── Component ────────────────────────────────────────────────────────────────

export function DisclaimerBanner({ message, compact = false }: DisclaimerBannerProps) {
  const disclaimerText = message || DEFAULT_DISCLAIMER;

  if (compact) {
    return (
      <div
        className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
        role="alert"
        aria-label="Advisory disclaimer"
      >
        <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
        <p className="text-xs text-amber-300/90 leading-relaxed">{disclaimerText}</p>
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
      role="alert"
      aria-label="Advisory disclaimer"
    >
      <AlertTriangle className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-amber-300">Advisory Only</p>
        <p className="text-xs text-amber-300/80 leading-relaxed">{disclaimerText}</p>
      </div>
    </div>
  );
}
