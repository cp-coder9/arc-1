import React, { useCallback, useRef, useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import type { DrawingPin } from '@/types';
import { pinsForDrawing } from '@/services/drawingPinService';

/**
 * DrawingPinViewer — renders a project drawing image with pin markers
 * positioned at stored normalized (x, y) coordinates.
 *
 * Displays one marker per issue whose drawingPin.drawingId matches the
 * displayed drawing. Does not render markers for non-matching issues.
 *
 * Coordinates are normalized 0..1 and converted to CSS percentage positioning.
 *
 * Supports three modes:
 * - 'view' (default): Display pins, click to select
 * - 'place': Click on the drawing to place a new pin; cursor becomes crosshair
 *            and normalized coordinates are reported via onPinPlaced callback
 * - 'edit': Click on the drawing to reposition an existing pin identified by
 *           editingIssueId; the edited pin is highlighted and new coordinates
 *           are reported via onPinEdited callback (always clamped to [0,1])
 */

type Props = {
  drawingId: string;
  drawingUrl: string;
  issues: Array<{ id: string; drawingPin?: DrawingPin }>;
  onPinClick?: (issueId: string) => void;
  /** Mode: 'view' shows existing pins, 'place' allows clicking to place a new pin, 'edit' repositions an existing pin */
  mode?: 'view' | 'place' | 'edit';
  /** Called when a pin is placed in 'place' mode with normalized coordinates (0..1) */
  onPinPlaced?: (pin: { x: number; y: number }) => void;
  /** The issue whose pin is being edited (only used in 'edit' mode) */
  editingIssueId?: string;
  /** Called when a pin is repositioned in 'edit' mode with normalized coordinates (0..1) */
  onPinEdited?: (issueId: string, pin: { x: number; y: number }) => void;
};

/**
 * Clamp a value to [0, 1] for safety.
 */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export default function DrawingPinViewer({
  drawingId,
  drawingUrl,
  issues,
  onPinClick,
  mode = 'view',
  onPinPlaced,
  editingIssueId,
  onPinEdited,
}: Props) {
  const pins = pinsForDrawing(issues, drawingId);
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedPinId, setFocusedPinId] = useState<string | null>(null);

  // Handle keyboard navigation for pin adjustment in edit mode
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent, issueId: string, pin: DrawingPin) => {
      // Always handle Enter and Space for pin activation
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onPinClick?.(issueId);
        return;
      }

      // Only handle arrow keys in edit mode for the specific pin being edited
      if (mode !== 'edit' || editingIssueId !== issueId || !onPinEdited) {
        return;
      }

      const STEP_SIZE = 0.01; // 1% movement per arrow key press
      let newX = pin.x;
      let newY = pin.y;
      let handled = false;

      switch (event.key) {
        case 'ArrowLeft':
          newX = Math.max(0, pin.x - STEP_SIZE);
          handled = true;
          break;
        case 'ArrowRight':
          newX = Math.min(1, pin.x + STEP_SIZE);
          handled = true;
          break;
        case 'ArrowUp':
          newY = Math.max(0, pin.y - STEP_SIZE);
          handled = true;
          break;
        case 'ArrowDown':
          newY = Math.min(1, pin.y + STEP_SIZE);
          handled = true;
          break;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
        
        // Only call onPinEdited if coordinates actually changed
        if (Math.abs(newX - pin.x) > 0.0001 || Math.abs(newY - pin.y) > 0.0001) {
          onPinEdited(issueId, { x: newX, y: newY });
        }
      }
    },
    [mode, editingIssueId, onPinEdited, onPinClick]
  );

  // Handle container keyboard navigation for placement/editing
  const handleContainerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (mode === 'place' || mode === 'edit') {
        if (event.key === 'Enter' || event.key === ' ') {
          // For keyboard users, we need to simulate a click at the center or last focused position
          // In a real implementation, you might want to track cursor position or use a crosshair
          const container = containerRef.current;
          if (!container) return;

          const rect = container.getBoundingClientRect();
          // Use center of container as default position for keyboard placement
          const centerX = 0.5;
          const centerY = 0.5;

          if (mode === 'place' && onPinPlaced) {
            onPinPlaced({ x: centerX, y: centerY });
          } else if (mode === 'edit' && editingIssueId && onPinEdited) {
            onPinEdited(editingIssueId, { x: centerX, y: centerY });
          }

          event.preventDefault();
          event.stopPropagation();
        }
      }
    },
    [mode, onPinPlaced, editingIssueId, onPinEdited]
  );

  const handleContainerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (mode === 'place' && onPinPlaced) {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = clamp01((event.clientX - rect.left) / rect.width);
        const y = clamp01((event.clientY - rect.top) / rect.height);

        onPinPlaced({ x, y });
      } else if (mode === 'edit' && editingIssueId && onPinEdited) {
        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const x = clamp01((event.clientX - rect.left) / rect.width);
        const y = clamp01((event.clientY - rect.top) / rect.height);

        onPinEdited(editingIssueId, { x, y });
      }
    },
    [mode, onPinPlaced, editingIssueId, onPinEdited],
  );

  const isInteractiveMode = mode === 'place' || mode === 'edit';

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-lg border border-border bg-muted/30${
        isInteractiveMode ? ' cursor-crosshair' : ''
      }`}
      data-testid="drawing-pin-viewer"
      onClick={handleContainerClick}
      onKeyDown={handleContainerKeyDown}
      role={isInteractiveMode ? 'button' : 'img'}
      aria-label={
        mode === 'place'
          ? 'Click or press Enter to place a pin on the drawing. Use arrow keys to navigate if placing with keyboard.'
          : mode === 'edit'
            ? 'Click or press Enter to reposition the pin on the drawing. Use arrow keys to navigate if positioning with keyboard.'
            : `Project drawing ${drawingId} with ${pins.length} issue pin${pins.length === 1 ? '' : 's'}`
      }
      tabIndex={isInteractiveMode ? 0 : undefined}
    >
      <img
        src={drawingUrl}
        alt={`Project drawing ${drawingId}`}
        className="block w-full h-auto select-none pointer-events-none"
        draggable={false}
      />

      {pins.map(({ issueId, pin }) => {
        const isBeingEdited = mode === 'edit' && editingIssueId === issueId;
        const isFocused = focusedPinId === issueId;
        
        return (
          <button
            key={issueId}
            type="button"
            className={`absolute -translate-x-1/2 -translate-y-full cursor-pointer transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-full ${
              isBeingEdited 
                ? 'animate-pulse ring-2 ring-yellow-500 ring-offset-1 scale-125' 
                : ''
            } ${
              isFocused ? 'ring-2 ring-blue-500 ring-offset-1' : ''
            }`}
            style={{
              left: `${pin.x * 100}%`,
              top: `${pin.y * 100}%`,
            }}
            onClick={(e) => {
              // In place mode, don't trigger pin click — let the container handle it
              if (mode === 'place') return;
              e.stopPropagation();
              onPinClick?.(issueId);
            }}
            onKeyDown={(e) => handleKeyDown(e, issueId, pin)}
            onFocus={() => setFocusedPinId(issueId)}
            onBlur={() => setFocusedPinId(null)}
            aria-label={
              isBeingEdited 
                ? `Issue pin ${issueId} at ${Math.round(pin.x * 100)}% horizontal, ${Math.round(pin.y * 100)}% vertical (currently being edited). Use arrow keys to adjust position, Enter to activate.`
                : `Issue pin ${issueId} at ${Math.round(pin.x * 100)}% horizontal, ${Math.round(pin.y * 100)}% vertical. Press Enter to select.`
            }
            aria-describedby={isBeingEdited ? `pin-${issueId}-help` : undefined}
            data-testid={`pin-marker-${issueId}`}
          >
            <MapPin
              size={24}
              className={`drop-shadow-md ${
                isBeingEdited
                  ? 'text-yellow-500 fill-yellow-500/40'
                  : 'text-destructive fill-destructive/20'
              }`}
            />
            {isBeingEdited && (
              <span 
                id={`pin-${issueId}-help`}
                className="sr-only"
              >
                Use arrow keys to move the pin. Left and right arrows move horizontally, up and down arrows move vertically. Each press moves 1% of the drawing size.
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
