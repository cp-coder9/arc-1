/**
 * ProviderDisclaimer — Persistent payment panel disclaimer
 *
 * Displays a non-dismissible notice communicating that Architex does not
 * hold, store, or custody any funds. The provider name is read dynamically
 * from the registered provider record in Firestore.
 *
 * @see Requirement 11.3
 */
import React, { useEffect, useState } from 'react';
import { collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { Info } from 'lucide-react';
import { db } from '@/lib/firebase';
import {
  getProviderDisclaimerText,
  isValidProviderName,
  DEFAULT_PROVIDER_NAME,
} from '@/services/finance/providerDisclaimerService';
import { getDemoCol } from '@/demo-seed/demoFirestore';

interface ProviderDisclaimerProps {
  /** Optional override provider name (for testing or static usage) */
  providerName?: string;
}

/**
 * Persistent provider disclaimer banner for payment UI panels.
 *
 * Fetches the active registered provider name from Firestore and displays
 * the disclaimer. Falls back to a generic label if no provider is resolved.
 *
 * This component is non-dismissible and should be placed at the top of
 * every payment-related view.
 */
export function ProviderDisclaimer({ providerName: providerNameOverride }: ProviderDisclaimerProps) {
  const [resolvedProviderName, setResolvedProviderName] = useState<string>(
    providerNameOverride || DEFAULT_PROVIDER_NAME,
  );

  useEffect(() => {
    // If an override is provided, skip Firestore query
    if (isValidProviderName(providerNameOverride)) {
      setResolvedProviderName(providerNameOverride);
      return;
    }

    // Query for a registered, liveConfigured provider
    const providersRef = getDemoCol('financial_providers');
    const activeProviderQuery = query(
      providersRef,
      where('registered', '==', true),
      where('liveConfigured', '==', true),
      limit(1),
    );

    const unsubscribe = onSnapshot(
      activeProviderQuery,
      (snapshot) => {
        if (!snapshot.empty) {
          const providerDoc = snapshot.docs[0];
          const data = providerDoc.data();
          if (isValidProviderName(data?.name)) {
            setResolvedProviderName(data.name);
          }
        }
      },
      (error) => {
        // Gracefully handle permission or connectivity errors
        console.warn('Provider disclaimer: unable to resolve provider name:', error);
      },
    );

    return unsubscribe;
  }, [providerNameOverride]);

  const disclaimerText = getProviderDisclaimerText(resolvedProviderName);

  return (
    <div
      className="panel"
      data-testid="provider-disclaimer"
      role="note"
      aria-label="Financial provider disclaimer"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '14px 18px',
        borderRadius: 16,
        border: '1px solid var(--border)',
        background: 'var(--aqua)',
      }}
    >
      <Info
        size={18}
        aria-hidden="true"
        style={{ color: 'var(--deep)', flexShrink: 0, marginTop: 2 }}
      />
      <p
        style={{
          margin: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: 'var(--muted)',
        }}
      >
        {disclaimerText}
      </p>
    </div>
  );
}

export default ProviderDisclaimer;
