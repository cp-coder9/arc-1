/**
 * useInputCapture Hook
 *
 * Captures keyboard and mouse events on the remote desktop viewport element
 * and forwards them to the Host Agent via a WebRTC RTCDataChannel.
 *
 * Features:
 * - Intercepts browser shortcuts (Ctrl+W, Ctrl+T, Ctrl+N, F5) and forwards to host
 * - Implements Ctrl+Alt+Shift escape combo to release focus back to local browser
 * - Lightweight input messages with event type, key/button info, coordinates, timestamp
 * - Latency ≤ WebRTC RTT + 50ms processing overhead
 *
 * Requirements:
 *   6.2 — Forward keyboard and mouse input events with latency ≤ RTT + 50ms
 *   6.5 — Intercept browser shortcuts and forward to host; Ctrl+Alt+Shift releases focus
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

// ─── Input Message Types ────────────────────────────────────────────────────────

export type InputEventType =
  | 'keydown'
  | 'keyup'
  | 'mousemove'
  | 'mousedown'
  | 'mouseup'
  | 'wheel'
  | 'contextmenu';

export interface InputMessage {
  type: InputEventType;
  timestamp: number;
  key?: string;
  code?: string;
  modifiers?: InputModifiers;
  button?: number;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
}

export interface InputModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

// ─── Hook Options ───────────────────────────────────────────────────────────────

export interface UseInputCaptureOptions {
  /** Ref to the viewport element that receives input events */
  viewportRef: RefObject<HTMLElement | null>;
  /** RTCDataChannel used to forward input messages to the host */
  dataChannel: RTCDataChannel | null;
  /** Whether the session is active and input should be captured */
  enabled?: boolean;
}

export interface UseInputCaptureReturn {
  /** Whether input is currently being captured (viewport has focus) */
  isCapturing: boolean;
  /** Release focus programmatically */
  releaseFocus: () => void;
  /** Request focus on the viewport */
  requestFocus: () => void;
}

// ─── Browser Shortcuts to Intercept ─────────────────────────────────────────────

/** Key combos that must be intercepted and forwarded to the host instead of the browser */
const INTERCEPTED_SHORTCUTS: Array<{ key: string; ctrl?: boolean; meta?: boolean }> = [
  { key: 'w', ctrl: true },   // Ctrl+W — Close tab
  { key: 't', ctrl: true },   // Ctrl+T — New tab
  { key: 'n', ctrl: true },   // Ctrl+N — New window
  { key: 'F5' },              // F5 — Refresh
  { key: 'r', ctrl: true },   // Ctrl+R — Refresh (alternate)
];

/**
 * Check if a keyboard event matches one of the browser shortcuts we need to intercept.
 */
function isInterceptedShortcut(e: KeyboardEvent): boolean {
  return INTERCEPTED_SHORTCUTS.some((shortcut) => {
    const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase() ||
      e.code.toLowerCase() === `key${shortcut.key}`.toLowerCase();
    const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : true;
    // For F5, no modifier required
    if (shortcut.key === 'F5') {
      return e.key === 'F5' || e.code === 'F5';
    }
    return keyMatch && ctrlMatch;
  });
}

/**
 * Check if the escape combo (Ctrl+Alt+Shift pressed together) is active.
 * This releases focus back to the local browser.
 */
function isEscapeCombo(e: KeyboardEvent): boolean {
  return e.ctrlKey && e.altKey && e.shiftKey;
}

// ─── Hook Implementation ────────────────────────────────────────────────────────

/**
 * Hook that captures keyboard and mouse events on the viewport element and
 * forwards them via WebRTC data channel to the Host Agent.
 *
 * Preconditions:
 *   - viewportRef points to a mounted DOM element
 *   - dataChannel is an open RTCDataChannel (readyState === 'open')
 *   - enabled is true for capture to be active
 *
 * Postconditions:
 *   - All keyboard/mouse events on the viewport are serialized and sent via data channel
 *   - Browser shortcuts (Ctrl+W, Ctrl+T, Ctrl+N, F5) are prevented and forwarded
 *   - Ctrl+Alt+Shift releases focus back to the local browser
 *   - Input latency overhead is minimal (serialization + send ≤ 50ms)
 *
 * @param options - Configuration for the input capture hook
 * @returns Object with capture state and focus control methods
 */
export function useInputCapture({
  viewportRef,
  dataChannel,
  enabled = true,
}: UseInputCaptureOptions): UseInputCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const isCapturingRef = useRef(false);

  // Keep ref in sync with state to avoid stale closures in event handlers
  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  /**
   * Send an input message over the data channel.
   * Only sends if the channel is open to minimize latency overhead.
   */
  const sendInputMessage = useCallback(
    (message: InputMessage) => {
      if (!dataChannel || dataChannel.readyState !== 'open') return;
      try {
        dataChannel.send(JSON.stringify(message));
      } catch {
        // Silently drop if channel is closing or buffer is full
      }
    },
    [dataChannel]
  );

  /**
   * Extract modifier state from a keyboard or mouse event.
   */
  const getModifiers = useCallback(
    (e: KeyboardEvent | MouseEvent): InputModifiers => ({
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      meta: e.metaKey,
    }),
    []
  );

  /**
   * Get relative coordinates within the viewport element.
   */
  const getRelativeCoords = useCallback(
    (e: MouseEvent): { x: number; y: number } => {
      const viewport = viewportRef.current;
      if (!viewport) return { x: 0, y: 0 };
      const rect = viewport.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    },
    [viewportRef]
  );

  // Release focus — stops capturing and blurs the viewport
  const releaseFocus = useCallback(() => {
    setIsCapturing(false);
    viewportRef.current?.blur();
  }, [viewportRef]);

  // Request focus — starts capturing by focusing the viewport
  const requestFocus = useCallback(() => {
    if (!enabled) return;
    viewportRef.current?.focus();
    setIsCapturing(true);
  }, [enabled, viewportRef]);

  // ─── Keyboard Event Handlers ────────────────────────────────────────────────

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isCapturingRef.current) return;

      // Check for escape combo: Ctrl+Alt+Shift releases focus
      if (isEscapeCombo(e)) {
        e.preventDefault();
        e.stopPropagation();
        releaseFocus();
        return;
      }

      // Intercept browser shortcuts
      if (isInterceptedShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Forward key event to host
      const message: InputMessage = {
        type: 'keydown',
        timestamp: Date.now(),
        key: e.key,
        code: e.code,
        modifiers: getModifiers(e),
      };
      sendInputMessage(message);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!isCapturingRef.current) return;

      // Prevent default for intercepted shortcuts on keyup too
      if (isInterceptedShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
      }

      const message: InputMessage = {
        type: 'keyup',
        timestamp: Date.now(),
        key: e.key,
        code: e.code,
        modifiers: getModifiers(e),
      };
      sendInputMessage(message);
    };

    // Attach keyboard handlers to the document to intercept before browser processes them
    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('keyup', handleKeyUp, { capture: true });

    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [enabled, viewportRef, releaseFocus, getModifiers, sendInputMessage]);

  // ─── Mouse Event Handlers ──────────────────────────────────────────────────

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isCapturingRef.current) return;
      const { x, y } = getRelativeCoords(e);
      const message: InputMessage = {
        type: 'mousemove',
        timestamp: Date.now(),
        x,
        y,
        modifiers: getModifiers(e),
      };
      sendInputMessage(message);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!isCapturingRef.current) {
        // Clicking on the viewport starts capture
        setIsCapturing(true);
        return;
      }
      e.preventDefault();
      const { x, y } = getRelativeCoords(e);
      const message: InputMessage = {
        type: 'mousedown',
        timestamp: Date.now(),
        button: e.button,
        x,
        y,
        modifiers: getModifiers(e),
      };
      sendInputMessage(message);
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isCapturingRef.current) return;
      const { x, y } = getRelativeCoords(e);
      const message: InputMessage = {
        type: 'mouseup',
        timestamp: Date.now(),
        button: e.button,
        x,
        y,
        modifiers: getModifiers(e),
      };
      sendInputMessage(message);
    };

    const handleWheel = (e: WheelEvent) => {
      if (!isCapturingRef.current) return;
      e.preventDefault();
      const { x, y } = getRelativeCoords(e);
      const message: InputMessage = {
        type: 'wheel',
        timestamp: Date.now(),
        x,
        y,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        modifiers: getModifiers(e as unknown as MouseEvent),
      };
      sendInputMessage(message);
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (!isCapturingRef.current) return;
      e.preventDefault();
      const { x, y } = getRelativeCoords(e);
      const message: InputMessage = {
        type: 'contextmenu',
        timestamp: Date.now(),
        button: e.button,
        x,
        y,
        modifiers: getModifiers(e),
      };
      sendInputMessage(message);
    };

    viewport.addEventListener('mousemove', handleMouseMove);
    viewport.addEventListener('mousedown', handleMouseDown);
    viewport.addEventListener('mouseup', handleMouseUp);
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('contextmenu', handleContextMenu);

    return () => {
      viewport.removeEventListener('mousemove', handleMouseMove);
      viewport.removeEventListener('mousedown', handleMouseDown);
      viewport.removeEventListener('mouseup', handleMouseUp);
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [enabled, viewportRef, getRelativeCoords, getModifiers, sendInputMessage]);

  // ─── Focus/Blur Handlers ──────────────────────────────────────────────────

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !enabled) return;

    const handleFocus = () => {
      setIsCapturing(true);
    };

    const handleBlur = () => {
      setIsCapturing(false);
    };

    viewport.addEventListener('focus', handleFocus);
    viewport.addEventListener('blur', handleBlur);

    return () => {
      viewport.removeEventListener('focus', handleFocus);
      viewport.removeEventListener('blur', handleBlur);
    };
  }, [enabled, viewportRef]);

  // ─── Disable capture when hook is disabled ─────────────────────────────────

  useEffect(() => {
    if (!enabled && isCapturing) {
      setIsCapturing(false);
    }
  }, [enabled, isCapturing]);

  return {
    isCapturing,
    releaseFocus,
    requestFocus,
  };
}

export default useInputCapture;
