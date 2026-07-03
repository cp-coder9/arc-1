/**
 * Status Badge Component
 *
 * Shared workflow status badge used across all P1 modules
 * to display current state of workflow objects.
 *
 * Requirements: 22.1–22.5, 22.9
 */

import React from 'react';

export type StatusBadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface StatusBadgeProps {
  status: string;
  variant?: StatusBadgeVariant;
}

const variantStyles: Record<StatusBadgeVariant, string> = {
  default: 'bg-slate-800/60 text-slate-300 border-slate-600/50',
  success: 'bg-green-950/40 text-green-300 border-green-700/50',
  warning: 'bg-amber-950/40 text-amber-300 border-amber-700/50',
  danger: 'bg-red-950/40 text-red-300 border-red-700/50',
  info: 'bg-blue-950/40 text-blue-300 border-blue-700/50',
};

/**
 * Small pill-shaped badge displaying workflow status text.
 * Color-coded by variant for quick visual scanning.
 */
export function StatusBadge({ status, variant = 'default' }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${variantStyles[variant]}`}
    >
      {status}
    </span>
  );
}
