/**
 * VerificationBadgeDisplay — Trust, Verification & Compliance
 *
 * Reusable component to display verification badges on profiles,
 * marketplace listings, and project views. Shows badge icon,
 * provenance level, and expiry status.
 *
 * @module trust_verification_compliance
 */

import React from 'react';
import type { VerificationBadgeType, BadgeProvenance, DisplayBadge } from '@/services/verificationBadgeService';
import { BADGE_DISPLAY_CONFIG, PROVENANCE_LABELS } from '@/services/verificationBadgeService';

// ── Color mapping ──────────────────────────────────────────────────────────────

const COLOR_CLASSES: Record<string, { bg: string; text: string; border: string }> = {
  green: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  gray: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-200' },
};

interface VerificationBadgeDisplayProps {
  badges: DisplayBadge[];
  size?: 'sm' | 'md' | 'lg';
  showProvenance?: boolean;
  showExpiry?: boolean;
  className?: string;
}

export function VerificationBadgeDisplay({
  badges,
  size = 'md',
  showProvenance = false,
  showExpiry = true,
  className = '',
}: VerificationBadgeDisplayProps) {
  if (!badges.length) return null;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {badges.map((badge) => {
        const color = COLOR_CLASSES[badge.color] || COLOR_CLASSES.gray;
        return (
          <span
            key={`${badge.badgeType}-${badge.provenance}`}
            className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${color.bg} ${color.text} ${color.border} ${sizeClasses[size]} ${badge.isExpired ? 'opacity-50 line-through' : ''}`}
            title={`${badge.label}${badge.isExpired ? ' (Expired)' : ''}${showProvenance ? ` — ${PROVENANCE_LABELS[badge.provenance]}` : ''}`}
          >
            <span role="img" aria-label={badge.label}>
              {badge.icon}
            </span>
            <span>{badge.label}</span>
            {showProvenance && (
              <span className="opacity-70 text-xs">
                ({PROVENANCE_LABELS[badge.provenance]})
              </span>
            )}
            {showExpiry && badge.expiresAt && !badge.isExpired && (
              <span className="text-xs opacity-60">
                Exp: {new Date(badge.expiresAt).toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' })}
              </span>
            )}
            {badge.isExpired && (
              <span className="text-xs text-red-500 font-semibold">EXPIRED</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

// ── Single badge variant ───────────────────────────────────────────────────────

interface SingleBadgeProps {
  badgeType: VerificationBadgeType;
  provenance: BadgeProvenance;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function SingleVerificationBadge({
  badgeType,
  provenance,
  size = 'md',
  className = '',
}: SingleBadgeProps) {
  const config = BADGE_DISPLAY_CONFIG[badgeType]?.[provenance];
  if (!config) return null;

  const color = COLOR_CLASSES[config.color] || COLOR_CLASSES.gray;
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${color.bg} ${color.text} ${color.border} ${sizeClasses[size]} ${className}`}
      title={config.description}
    >
      <span role="img" aria-label={config.label}>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}

export default VerificationBadgeDisplay;
