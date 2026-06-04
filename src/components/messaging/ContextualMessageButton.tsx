/**
 * ContextualMessageButton — Lightweight "Message" button for workflow items.
 *
 * Render this next to any workflow object (RFI, snag, CPD assessment, etc.)
 * to open a contextual message drawer pre-populated with the object context.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus } from 'lucide-react';

// ── Props ------------------------------------------------------------------

export interface ContextualMessageButtonProps {
  /** The human-readable label for the source object type. */
  label?: string;
  /** Called when the button is clicked. The parent should open the drawer. */
  onClick: () => void;
  /** Disable the button (e.g., no project selected). */
  disabled?: boolean;
  /** Tooltip / aria-label for the button. */
  title?: string;
  /** Compact mode — icon only, no text. */
  compact?: boolean;
}

// ── Component --------------------------------------------------------------

export function ContextualMessageButton({
  label,
  onClick,
  disabled = false,
  title,
  compact = false,
}: ContextualMessageButtonProps) {
  const defaultLabel = label ?? 'Message';

  return (
    <Button
      variant="ghost"
      size={compact ? 'icon' : 'sm'}
      onClick={onClick}
      disabled={disabled}
      title={title ?? `Message about this ${(label ?? 'item').toLowerCase()}`}
      aria-label={title ?? `Message about this ${(label ?? 'item').toLowerCase()}`}
      className={
        compact
          ? 'h-8 w-8 rounded-full'
          : 'gap-1.5 rounded-full text-xs font-bold'
      }
    >
      <MessageSquarePlus size={compact ? 16 : 14} />
      {!compact && <span>{defaultLabel}</span>}
    </Button>
  );
}
