/**
 * Disclaimer Banner Component
 *
 * Non-dismissible, persistent advisory banner displayed on all P1 module views.
 * Configurable per module with advisory, legal, or compliance disclaimer types.
 *
 * Requirements: 22.1–22.5, 22.9
 */

import React from 'react';
import { AlertTriangle, Info, Shield } from 'lucide-react';
import type { DisclaimerConfig } from '../types';

export interface DisclaimerBannerProps {
  config: DisclaimerConfig;
}

const variantStyles = {
  advisory: {
    container:
      'bg-amber-950/30 border-amber-700/50 text-amber-200',
    icon: 'text-amber-400',
  },
  legal: {
    container:
      'bg-red-950/30 border-red-700/50 text-red-200',
    icon: 'text-red-400',
  },
  compliance: {
    container:
      'bg-blue-950/30 border-blue-700/50 text-blue-200',
    icon: 'text-blue-400',
  },
} as const;

const variantIcons = {
  advisory: AlertTriangle,
  legal: Shield,
  compliance: Info,
} as const;

/**
 * Non-dismissible disclaimer banner for P1 module views.
 * Renders at the top of the view it's placed in.
 * WCAG: uses role="alert" and aria-live for screen reader announcements.
 */
export function DisclaimerBanner({ config }: DisclaimerBannerProps) {
  const { type, text } = config;
  const styles = variantStyles[type];
  const Icon = variantIcons[type];

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${styles.container}`}
    >
      <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${styles.icon}`} aria-hidden="true" />
      <p className="text-sm leading-relaxed">{text}</p>
    </div>
  );
}
