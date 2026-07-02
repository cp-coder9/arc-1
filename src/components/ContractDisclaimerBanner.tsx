/**
 * Contract Disclaimer Banner & Footer Components
 *
 * Provides persistent, non-dismissible advisory disclaimer elements for all
 * contract administration views. Includes:
 * - ContractDisclaimerBanner: Fixed banner at top of contract admin views
 * - ContractDisclaimerFooter: Footer block for generated output documents
 * - DeemedOutcomeDisclaimer: Notice for deemed acceptance/rejection outcomes
 *
 * If the banner fails to render, user interaction is blocked via an overlay.
 *
 * Requirements: 11.1, 11.2, 11.4, 11.5
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Shield, FileWarning } from 'lucide-react';
import {
  getDisclaimerBannerText,
  getDocumentDisclaimerFooter,
  isDeemedOutcomeDisclaimer,
} from '@/services/contractAdmin';

// ══════════════════════════════════════════════════════════════════════════════
// ContractDisclaimerBanner
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Persistent, non-dismissible banner rendered at the top of every contract
 * administration view. Fixed position so it does not scroll away.
 *
 * If the banner fails to render (catches render error), it displays an
 * error overlay that blocks all user interaction with the view.
 *
 * Requirements: 11.1, 11.5
 */
export function ContractDisclaimerBanner() {
  const [renderError, setRenderError] = useState(false);
  const [bannerText, setBannerText] = useState<string | null>(null);

  useEffect(() => {
    try {
      const text = getDisclaimerBannerText();
      if (!text) {
        setRenderError(true);
      } else {
        setBannerText(text);
      }
    } catch {
      setRenderError(true);
    }
  }, []);

  // If banner fails to render, block all user interaction with an overlay
  if (renderError) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-950/95 backdrop-blur-sm"
        aria-live="assertive"
        role="alert"
      >
        <Card className="bg-red-950/80 border-red-700/60 max-w-md mx-4">
          <CardContent className="py-6 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-red-200 mb-2">
              Disclaimer Unavailable
            </h2>
            <p className="text-sm text-red-300">
              The contract administration disclaimer failed to load. Access to
              contract administration features is blocked until the disclaimer
              can be displayed. Please refresh the page or contact support.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!bannerText) {
    return null;
  }

  return (
    <div
      className="sticky top-0 z-50 w-full"
      role="banner"
      aria-label="Legal disclaimer"
    >
      <div className="bg-amber-950/80 backdrop-blur border-b border-amber-700/50 px-4 py-2.5">
        <div className="flex items-start gap-2.5 max-w-7xl mx-auto">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200 leading-relaxed">
            <span className="font-semibold text-amber-100">Advisory Notice:</span>{' '}
            {bannerText}
          </p>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ContractDisclaimerFooter
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Disclaimer footer component rendered at the bottom of generated output
 * documents (payment schedules, deadline calculations, claim summaries,
 * notices, etc.).
 *
 * Requirements: 11.2, 11.4
 */
export function ContractDisclaimerFooter() {
  const footerText = getDocumentDisclaimerFooter();

  return (
    <div
      className="mt-6 pt-4 border-t border-surface-700/50"
      role="contentinfo"
      aria-label="Document disclaimer"
    >
      <div className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-surface-800/50 border border-surface-700/40">
        <Shield className="w-3.5 h-3.5 text-surface-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-surface-400 leading-relaxed">
          {footerText}
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DeemedOutcomeDisclaimer
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Disclaimer notice displayed alongside deemed acceptance/rejection outcomes.
 * Reminds users that calculated outcomes must be verified against the actual
 * contract by a qualified professional.
 *
 * Requirements: 11.4
 */
export function DeemedOutcomeDisclaimer() {
  const disclaimerText = isDeemedOutcomeDisclaimer();

  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5 rounded-md bg-amber-950/30 border border-amber-800/40 mt-3"
      role="note"
      aria-label="Deemed outcome verification notice"
    >
      <FileWarning className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-amber-200/80 leading-relaxed">
        {disclaimerText}
      </p>
    </div>
  );
}

export default ContractDisclaimerBanner;
